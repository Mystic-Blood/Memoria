# Design decisions

Why Memoria is built the way it is, what was considered instead, and the evidence for each choice.
Numbers come from the reports in [`eval/results/`](../eval/results/); earlier investigations are in
[`research/`](../research/).

## 1. The product: memory you can see and correct

Most assistants hide what they remember. Memoria's premise is the opposite: every memory it creates,
changes, doubts or forgets is shown live next to the chat, with the message it came from and its full
history, and the user can correct it.

That premise drives most of the decisions below. It is also why an off-the-shelf memory library was
rejected: a spike with [mem0](../research/mem0-spike/REPORT.md) extracted facts well, but its
`.add()` call hides the lifecycle (no "pending, ask the user" state, its own tables, no provenance),
which is the part this product exists to show.

## 2. The model proposes, code decides

Every memory change goes through four steps:

```
extract (LLM)  ->  recall (vector search)  ->  propose (LLM)  ->  guard (code)  ->  apply (one DB function)
```

The model is never allowed to write to the database. It returns a proposal (`skip`, `add`, `update`,
`replace`, `conflict` plus a target label like `m2`), and plain TypeScript in
[`guard.ts`](../src/lib/engine/guard.ts) validates it:

- a target the model was not shown is refused (falls back to adding a new memory, with a note)
- on `replace`, the stored text is the user's extracted fact, not the model's rewording
  (observed: the model once "replaced" *User hates strawberries* with *User likes mango smoothies*)
- a "temporary" memory that ends today is treated as a lasting fact (models read "now" as temporary)
- exact duplicates are skipped without calling the model

Every override is recorded in the memory's history, so the reason for any change is inspectable.

**Alternative considered:** one large "memory controller" call that outputs all operations at once.
A [bakeoff](../research/bakeoff/summary.md) showed 7B models handle that schema but struggle to
return nothing for small talk, and a [second opinion](../research/2026-09-29-second-opinion.md) argued a
bigger schema widens the failure surface for small models. Two small, focused calls won.

## 3. Writes only through database functions

Users can read their own rows (row-level security) but cannot insert, update or delete memories
directly. Every change is a `SECURITY DEFINER` function that checks ownership, makes the change
atomically, and appends to `memory_events`.

Why: in v1 a user could edit or hard-delete memories through the API and skip the audit trail, and
"supersede" was two separate requests that could leave both the old and new fact active.
`scripts/db-security-check.mjs` verifies 23 rules through the real API (two users, anon key,
service role).

Found along the way: this Supabase project's default privileges grant API roles nothing on new
tables, which is why v1 had a blanket `GRANT ALL`. v2 grants each role exactly what it needs and
revokes `TRUNCATE` (which bypasses row-level security).

## 4. Measure before changing anything

The v1 engine was evaluated before it was replaced, on a harness that is still used for v2:

- 33 scripted conversations (32 from the original project plus the owner's real test chat), each
  played into the real database and scored by **human-written keyword rubrics**, not by a model.
  Every rubric is unit-tested against its own expected fact.
- A **held-out set** of 15 cases was committed before the final round of tuning (commit `b16c101`)
  and run once at the end, to check the tuning generalises.
- A test fails if any distinctive word from an eval case appears in a prompt. This was added after
  I found I had copied test-case examples into the prompts, which would have inflated the scores.
  **Disclosure:** for most of 2026-10-16 that test checked nothing. Its pattern was written as
  `` `\b${w}\b` `` inside a template literal, where `\b` is a backspace character, so it could never
  match. It was found and fixed the same day; the test now also proves it catches a planted leak. The
  re-audit found one overlap that was live when the held-out set was run: the reconcile prompt's
  "liking jazz and liking hip-hop are both true" (an add-vs-merge example) and the held-out case
  `ho-refine-01` ("mostly jazz piano these days"). That case passed; the overlap may have helped it, so
  the held-out score should be read as at most 13/15 of genuinely unseen material. Other flagged words
  were ordinary vocabulary ("name", "work", "already"), now an explicit, reviewed allow-list.

| | cases | checks |
|---|---|---|
| v1 baseline (llama3:8b), dev set | 6/33 | 60/117 (51%) |
| v2 first run, dev set | 24/33 | 96/117 (82%) |
| v2 tuned, dev set | 24/33 | 99/117 (85%) |
| **v2 final, dev set** (retrieval floor from the sweep) | **25/33** | **103/117 (88%)** |
| **v2 final, held-out set** (run once) | **13/15** | **41/43 (95%)** |
| v2 + guard fixes (§9-11), dev set incl. the new `ash-01` case, two runs | 23/34, 23/34 | 103/123, 103/123 (84%) |
| v2 extraction rewrite (commit `d70739b`), dev set grown to 46 cases (12 multi-turn conversations added) | 36/46 | 143/156 (92%) |
| **v2 release (`5e8eadb`), dev set, all 46 cases** | **37/46** | **144/156 (92%)** |
| **v2 release (`5e8eadb`), dev set, the original 33 cases v1 was scored on** | **27/33** | **108/117 (92%)** |
| **v2 release (`5e8eadb`), held-out set, second and final run** | **14/15** | **42/43 (98%)** |

**Disclosure about the held-out set.** It was run twice, not once: first at `b16c101`-era tuning
(13/15), then on the release commit (14/15). Between the two runs the engine was tuned further on the
development set only, and no held-out case was opened, copied or added to the dev set. But its two
earlier failures (below) were known while that tuning happened, so the second run is not fully blind.
The *nurse* case now passes. No prompt mentions nurses (the prompt-integrity test checks every
prompt for distinctive held-out words). The extraction rewrite added "job" to what to remember and a
job example (a baker), which plausibly helped, but the cause was not isolated. The Berlin trip is
still not marked temporary. The release reports are
`eval/results/2026-10-16T16-17-29-dev-final-*` and `eval/results/2026-10-16T16-15-57-holdout-final-*`.

Two consecutive runs of the same code gave identical results, check for check, on Ollama 0.40.4. That
stopped being true after Ollama auto-updated to 0.40.5: two full runs of identical code then differed
by 2 checks (142 vs 144 of 156). Since then a change counts as a regression only if it shows up across
repeated runs, and every comparison is re-baselined on the same Ollama version (see §13).

The held-out set scoring higher than the development set does not mean the engine generalises
better than it was tuned: the held-out cases are easier on average (no long rambling messages, no
multi-turn conversation like the owner's). It shows the tuning did not overfit. Its two failures are
real: "I'm a nurse at a children's hospital" lost the word *nurse*, and "in Berlin until Wednesday"
was not recognised as temporary. No fix targeted either case (see the disclosure above).

The baseline also reproduced the bug the owner hit in the app: the model returned
`confidence_score: 100` instead of a value between 0 and 1, validation rejected it, and the
memory was silently dropped. v2 has no numeric fields for the model to get wrong and records every
failure in `memory_runs` instead of swallowing it.

## 5. Local models first, chosen by measurement

The app runs fully on a laptop GPU (RTX 3060, 6 GB) through Ollama; a cloud provider is used only if
an API key is configured (`AI_MODE=auto`).

Eight local models were [raced](../eval/results/2026-10-16T11-26-16-model-race/report.md) on the
extraction step with the same prompt and rubrics:

| model | score | median latency |
|---|---|---|
| qwen2.5:7b-instruct | 92% | 1.9 s |
| llama3:8b | 92% | 2.3 s |
| mistral:7b-instruct | 82% | 3.6 s |
| granite4:3b | 80% | 0.8 s |
| qwen3.5:4b | 63% | 0.5 s |
| llama3.1:8b | 42% | 0.8 s |

- **qwen2.5:7b-instruct** won and runs chat, extraction and reconciliation, so the 6 GB GPU never has
  to swap between two large models.
- **llama3.1:8b** understands the task in free text but returns empty lists under Ollama's strict
  JSON mode, which the pipeline relies on. Recommended by an earlier bakeoff; ruled out here.
- **Thinking models:** qwen3.5:4b took ~40 s for a one-line JSON answer until thinking was turned off
  (`reasoning_effort: "none"`, now sent on every Ollama request: ~0.6 s). qwen3:4b ignores that switch
  and leaks its reasoning into the answer, so it was excluded.

## 6. Retrieval: a measured floor, not "send everything"

v1 searched with a similarity threshold of 0.0 and ranked by a mix that included recency and
confidence, so every question got every memory. v2:

- only active, unexpired memories from the same embedding model are searchable
- a similarity floor of **0.6**, picked from the middle of the best plateau (0.55-0.65) of a
  [sweep](../eval/results/2026-10-16T12-01-52-retrieval-sweep/report.md) over the development set
- `nomic-embed-text` gets its required task prefixes (`search_query:` / `search_document:`), which v1
  never sent

## 7. Context the extractor gets

The extractor sees the last 6 turns, today's date, and up to 5 stored memories related to the new
message. The conversation resolves "seattle." as an answer; the stored memories resolve "I hate it
now" when "it" was mentioned in an earlier conversation. An
[experiment](../research/2026-10-10-context-experiment.md) showed context is the only thing that fixes
pronoun resolution; prompt wording and schema changes do not.

## 8. Prompts are brittle on small models

Replacing a few example sentences with equivalent ones made qwen2.5 stop extracting preferences
entirely. Bisecting the two prompt versions traced it to a wording gap (the rule listing what to
remember never mentioned preferences), not the examples. Lesson applied: every prompt change is
measured on the full development set, not on the handful of messages that prompted it.

## 9. What a real conversation taught: no snowballing merges

The owner's second test chat (role-playing "Ash") produced one memory that had absorbed four facts:
*"User is going to catch a legendary Pokémon today, specifically Lugia and Darkrai, which will fight
near the school playground around 5 pm, and the Pokémon are considered exhausted."* The model kept
choosing `update` for facts that only shared a topic, and each merge made the sentence longer. Some
"updates" even rewrote a memory into the identical sentence.

The fix is deterministic, in the guard:

- **skip / update / replace / conflict only against a memory at least 0.80 similar** to the new fact;
  otherwise the fact is stored on its own. Measured with `eval/pair-similarity.ts`: refinements and
  corrections scored 0.81-0.99, the unrelated pairs the model had merged 0.54-0.79. The gap is narrow
  and the sample small, so the threshold leans toward "keep separate": a missed merge leaves two related
  memories, a wrong merge loses information.
- an update that changes nothing is a skip; a merged memory over 200 characters is stored separately.

The conversation is now a development-set case (`ash-01`) so this cannot quietly come back.

## 10. Same-day plans vs. lasting changes: trust the user's words, not the label

The model labels both "I'm going to the park at 5 pm today" and "I'm no longer a student" as
*temporary, ending today*. Treating every such label as permanent turned the owner's 5 pm plan into a
permanent fact; treating every one as "expires tonight" made "no longer a student" disappear at midnight.
The label cannot separate them, but the message can: a same-day expiry is kept only when the user's
message itself mentions today, tonight or a time of day. Otherwise it is a lasting fact.

## 11. The user's name is always known

"Do you know my name?" scored **0.43** against "User's name is Jack." while an unrelated memory scored
0.46, so no similarity threshold can retrieve names reliably: short questions *about* the user do not
look like statements *of* facts to the embedding model. Rewriting the question into a hypothetical
memory first (HyDE) was tried and rejected: the model often answered "NONE", and when it did rewrite,
all similarities rose together (an unrelated "likes pizza" went from 0.51 to 0.72), making relevant and
irrelevant memories harder to tell apart. Instead, the user's name is included with every reply, the
way any assistant knows who it is talking to. It still appears under "Used N memories".

## 12. Limits for a public demo on a free API quota

Anyone can sign up, and every chat message costs 3-6 model calls (the reply, then extraction and
reconciliation in the background). `/api/chat` therefore checks three limits before it writes or calls
anything: per user per minute (default 10), per user per day (default 200), and an optional cap across
all users (`CHAT_DAILY_GLOBAL_LIMIT`), answering 429 or 503 with a `Retry-After` header.

- **Counted in Postgres, not in memory.** Serverless instances share nothing, so an in-memory counter
  would limit nothing. One `SECURITY DEFINER` function counts and records under an advisory lock, so a
  burst of parallel requests cannot all pass the same check.
- **A separate usage table, not `messages`.** Counting `messages` was the obvious option, but users can
  delete their own conversations (resetting their limit) and insert message rows directly (burning the
  global cap without using the model). `chat_usage` is reachable only through the function.
- **Fails closed.** If the check cannot run, the request is refused: an unchecked request is the one that
  can drain the quota.

Deployment settings that code cannot enforce (email confirmation, auth rate limits, CAPTCHA) are in
[DEPLOY.md](DEPLOY.md).

## 13. What the owner's own test chat found (2026-10-17)

The owner's test account was read straight from the database (chats, memories, event history,
pipeline runs). Problems that came from engine versions already replaced (a "User's name is not
provided." memory, a same-day plan stored as permanent) were not re-fixed. Four problems were current:

| Found | Change | Pinned by |
|---|---|---|
| "my name is Noah" was stored next to the existing "User's name is Ash." because the model compared it with a different memory; two names were active | Code rule `enforceSingleName`: when a name is known, a different name can only replace it or go to review | unit tests; eval `conv-name-change-01` |
| Requests to the assistant ("plan a trip near me", "top 3 places") were stored as facts about the user | Extraction prompt: requests to find, list or organise something, and options only being browsed, are not memories | eval `conv-assistant-task-01` (still fails 1 of 3 checks: browsing "somewhere with lakes" can still become a preference) |
| A typo was stored verbatim ("milkhae") | None needed: a spelling rule was tried and *hurt* (it broke pronoun resolution in `conv-pronoun-01`); the new case passes without it | eval `conv-typo-fix-01` |
| The whole conversation was sent to the chat model on every message, with no cap | `recentMessages`: the latest ~12,000 characters (~3,000 tokens), starting on a user turn; long-term facts arrive as memories | unit tests; browser tests |

How the prompt change was chosen: the first version (a new rule, a spelling rule and a new example)
lost checks on `long-01` and `conv-pronoun-01`. Running those cases on the previous code with the
same Ollama version passed them, so the edits were the cause; removing them one at a time showed the
spelling rule broke pronouns and the longer rule wording hurt the rambling message. The shipped
version is one folded line. Trade-off kept on purpose: on a rambling message it can let a same-day
event through (it is stored as temporary and expires that night), while without it chat requests
became permanent "facts", which is what the owner hit.

Result (Ollama 0.40.5, GPU): the previous code scored 37/46 cases, 144/156 checks on the original 46
cases. The new code scored 142/156 and 144/156 on two runs (37/46 on the second), plus 2 of the 3 new
cases: 39/49 cases, 150/163 checks overall. Same quality on the old cases; of the four owner-found problems, three are fixed and pinned
by tests and one (chat requests) is improved but not solved.

## Known limitations

- **Two-part questions** ("what's my name and how much was my jet?") become one embedding that lands
  near one half. Splitting the question before searching would fix it. (The name half is now covered by
  §11; other two-part questions are not.)
- **Extraction is the bottleneck.** With every engine decision now recorded in the eval reports, almost
  every remaining failure is the 7B extractor returning nothing ("I'm super sick with the flu this week",
  "i m ash and i m a pokemon master"), repeating a memory it was shown instead of the new detail, leaving
  a pronoun unresolved, or keeping a hypothetical. The guard's overrides in those runs were all correct.
- **Temporary situations** are the weakest skill: a trip "until Wednesday" is sometimes stored as a
  lasting fact (expiry checks: 1/2 dev, 0/1 held-out).
- **Day-in-the-life noise:** the 7B model sometimes stores one-off events from a long rambling message
  ("missed the bus today") despite the rule against it.
- **Compound memories:** sometimes a real fact and an aside are written as one sentence.
- **Small evaluation set:** 33 + 15 cases and 8 retrieval probes are enough to catch regressions and
  compare designs, not to make precise claims. Rubrics are keyword-based and can be too lenient or
  too strict on unusual phrasing; every stored memory is in the report for auditing.
