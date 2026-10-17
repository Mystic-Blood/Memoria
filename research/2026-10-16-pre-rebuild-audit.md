# Memoria — Project Audit

**Date:** 2026-10-16
**Branch / commit audited:** `memory-controller-v2` @ `ba31e77`
**Method:** read all of `audit/` and `eval/`; read the app, memory engine, migrations, scripts, tests and docs (two parallel read-only explorers plus my own spot-checks of their main claims); ran install, type-check, lint, tests, build, the dev server, read-only database queries, and a small model smoke test against local Ollama.
**Changes made:** none apart from creating this file. `npm ci` rewrote `node_modules/` and `next build` rewrote `.next/` (both gitignored). `git status` was clean afterwards.

Each finding is tagged with how I know it:

- **[ran]** I observed it by running something during this audit.
- **[code]** I confirmed it by reading the source.
- **[prior]** It comes from the earlier reports in `audit/` and I have not re-run it.

---

## TL;DR

Memoria is a Next.js 16 + Supabase chat app with an inspectable long-term memory ("Memory Explorer"). There are two halves:

- **The infrastructure is mostly real and decent.** Auth, row-level security, the schema, the audit log, the Explorer, soft deletes, and the local/remote model switch are all in place.
- **The "memory brain" is weak by design.** It extracts at most one fact per message, from the latest message only. Consolidation throws away the new detail. Retrieval has no relevance floor.

Nobody has ever measured semantic quality end to end. The one checked-in eval run is 32 of 32 infrastructure errors.

It is not launchable today:

- The production build fails.
- Remote (hosted-model) configuration is broken as documented.
- There is a cross-user write hole in a database function.
- It has never been deployed.

Much of `docs/` is stale, and some of it describes testing that never happened (§7).

The earlier investigations agree on the direction:

- Keep the custom engine; don't adopt mem0.
- Patch the semantic core: multi-fact schema, conversation context, better prompt, content-merging consolidation, a retrieval floor.
- Get a real eval to finish.

None of those patches have been made yet.

---

## 1. What this project is

From `docs/MEMORIA-V1-BUILD-SPEC-CURRENT.md` (the declared source of truth in `.agents/AGENTS.md`) and `README.md`:

> "Memoria is a conversational AI application built around an inspectable, persistent, evolving personal-memory lifecycle."

**Intended users:** "independent professionals" who lose context between AI chat sessions. You chat normally. The app quietly extracts durable facts about you, then updates, flags or retires them as things change, and uses them in later conversations. The differentiator is the **Memory Explorer**, where you can see every memory, where it came from (provenance), and its audit history, and edit, delete, or resolve conflicts.

**Status the docs claim:** "V1 release candidate" (commit `25ecb45`). Every readiness doc ends with "DEPLOYMENT BLOCKED". The git history shows 33 commits on 2026-09-27/28, covering "Days 1–6" of a planned 20-day build. Audits and model experiments followed on 2026-09-29 and 2026-10-10. Development stopped exactly where the hard semantic work begins.

---

## 2. Tech stack and architecture

| Layer | Choice |
|---|---|
| Framework | Next.js **16.3.6** (App Router, Turbopack, `proxy.ts` in place of the old middleware), React 19.2 |
| AI SDK | Vercel AI SDK `ai@7`, `@ai-sdk/google`, `@ai-sdk/openai` (Ollama is reached through the OpenAI-compatible client) |
| Database / auth | Supabase (Postgres + pgvector `vector(768)` + RLS + Supabase Auth with email/password) |
| Models | `AI_MODE=local`: Ollama at a hardcoded `http://localhost:11434` (currently `llama3:8b` + `nomic-embed-text`). `AI_MODE=remote`: Google Gemini (default) or OpenAI |
| Tests | Vitest 5 (49 unit tests, all mocked), one pgTAP SQL file (never run) |
| Hosting target | Vercel plus a Vercel Cron job for the staleness sweep (not set up) |

### How a chat message flows

```
Browser (src/app/chat/ChatClient.tsx, useChat)
   │  POST /api/chat  {messages[], conversationId}
   ▼
src/app/api/chat/route.ts
   ├─ auth: supabase.auth.getUser()  ──401 if none
   ├─ create/verify conversation, insert user message   (RLS client)
   ├─ retrieveMemories(userId, latestUserText)          src/lib/memory/retriever.ts
   │     ├─ embed query ─► RPC match_memories (threshold 0.0, top 20)
   │     ├─ RPC search_memories_lexical (plainto_tsquery, top 10)
   │     └─ score = .40 sem + .20 lex + .15 recency + .15 confidence + .10 entity(always 0)
   ├─ buildSystemPrompt(memories)                       context-builder.ts ("untrusted memory" block)
   ├─ streamText(CHAT_MODEL, system + client-sent history) ──► streamed reply
   │     └─ onFinish: insert assistant message
   └─ after():  (service-role client, bypasses RLS)
         processMemoryCandidate(latestUserText)         process-candidate.ts
           ├─ extractMemory()  → 0 or 1 fact           extractor.ts     (LLM #2, no history)
           ├─ generateEmbedding()                       embedding.ts
           ├─ matchMemories()  threshold 0.8, top 5     matcher.ts
           ├─ makeDecision()   create | consolidate | supersede | flag   decision-engine.ts (LLM #3, top match only)
           └─ executeMemoryDecision()  inserts/updates + audit rows      store.ts

Explorer (src/app/explorer/**) ── server actions (actions.ts) ── store.ts edit/delete/confirm
                                                              └─ RPC confirm_memory (SECURITY DEFINER)
Vercel Cron (not configured) ─► GET /api/cron/staleness-sweep ─► expireStaleStateMemories()
```

**Database** (`supabase/migrations/`, 9 files): `profiles`, `conversations`, `messages`, `memories`, `memory_audit_log`, and `entities` / `memory_entity_links` (which nothing ever writes to). Every table has RLS of the form `user_id = auth.uid()`. The RPCs are `match_memories`, `search_memories_lexical` and `confirm_memory`.

**Live hosted project [ran]:** reachable, with 51 profiles, 27 conversations, 69 messages, 67 memories, 39 audit rows and 0 entities. These look like test accounts from scripts. All 67 memories use embedding profile `ollama:local:nomic-embed-text:768`.

---

## 3. Earlier investigations (`audit/` and `eval/`)

All of these were produced before today, by earlier AI-assisted sessions. In chronological order:

### 3.1 `eval/run.ts` + `eval/cases/*.json` + `eval/results/1790621765546.*` (~2026-09-28)

- **What it tested:** 32 hand-written scenarios in 10 categories: clean, multi_fact, correction, refinement, implicit_reference, noise, long_messy, change_over_time, state_expiry, retrieval_relevance. Each case runs through the real pipeline against the **hosted DB**, then an LLM judge grades the result.
- **Result:** **NO DATA.** 32 of 32 infrastructure errors, 0 passes, 0 fails. The error text wasn't saved (`"results": []`).
- **Harness flaws:**
  - It skips assistant turns (`eval/run.ts` ~L144–149).
  - The judge defaults to `local:llama3:8b` (~L175).
  - It calls `processMemoryCandidate` directly instead of `/api/chat`.
  - It needs an undocumented `EVAL_USER_ID`.
  - It wipes and writes that user's memories in the real database.

### 3.2 `eval/bakeoff/` (2026-09-29)

- **What it tested:** five local Ollama models (qwen2.5:7b-instruct, llama3.1:8b, mistral:7b-instruct, gemma3:4b, llama3:8b), with no database writes:
  - **Test A:** the current extractor schema.
  - **Test B:** a proposed single "memory controller" schema (`ops: add | update | delete | none`, with `target` and `valid_until`).
  - **Test C:** a trivial JSON health check.
- **Result:** every model produced 100% schema-valid output with no timeouts.
- **Test B quality signals:**

  | Model | Multi-fact (≥2 ops) | Correction → update | Noise → none |
  |---|---|---|---|
  | llama3.1:8b | 4/4 | 7/8 | 1/4 |
  | llama3:8b | 4/4 | 8/8 | 0/4 |
  | mistral:7b-instruct | 3/4 | 7/8 | 0/4 |
  | qwen2.5:7b-instruct | 0/4 | 8/8 | 2/4 |
  | gemma3:4b | 0/4 | 8/8 | 0/4 |

  All models are bad at refusing to store noise. The `REVIEW_*.md` files are raw dumps with no judgments, and **no model was ever chosen.**

### 3.3 `audit/PROJECT-AUDIT.md` (2026-09-29, static code audit)

Its conclusion: "working memory OS wrapped around a semantically weak write/retrieve brain."

Ranked root causes, all confirmed in code:

- **H1:** the extractor sees only the latest message.
- **H2:** the schema allows one fact.
- **H3:** extraction failures silently become `[]`.
- **H4:** consolidate never updates the stored content.
- **H5:** the evidence-score `>` comparison flags legitimate corrections.
- **H6:** `valid_until` is never set on create, so the sweep starves.
- **H8:** contradiction checks look at only the top match, using a "can both be true" prompt.
- **H9:** retrieval threshold is 0.0, and recency/confidence are treated as relevance.
- **H11:** flagged memories are returned by the RPC.

It recommended the "hybrid controller + deterministic state machine" design and estimated 3–7 days for the core fixes. It also surveyed mem0, Letta, Graphiti and Cognee.

### 3.4 `audit/SECOND-OPINION.md`

It largely confirms the project audit and tempers some claims; for example, corrections *can* supersede. It pushes back on the big controller schema for 7B models.

- **Recommends:** **patch the existing pipeline** with history, `memories[]`, a merging consolidate, correction-aware decisions and a retrieval floor. Do not build the controller yet.
- **Rough split of the quality problem:** about 60–70% design, 20–30% model, 10% eval blindness.
- **Says:** freeze Explorer UI work, and don't delete the real-DB scripts.

### 3.5 `audit/MEMORIA-FORENSIC-AUDIT.md` (2026-10-10)

The same diagnosis, framed against the spec: the infrastructure is about 70% keep/fix, and three root causes dominate (context starvation, single-fact schema, consolidation dropping content).

**Owner decisions it left open:**

- How many turns the extractor should see.
- How consolidation should merge.
- What the retrieval floor should be (0.3, 0.4 or 0.5).
- Whether to pay for an API tier to run evals.

### 3.6 `audit/BASELINE-SEMANTIC-RESULTS.md` + `baseline-eval.ts` (2026-10-10, real llama3:8b, no DB writes)

- **Unchanged extractor:** bare-noun output ("pizza", "location"), one fact out of three, pronouns unresolved, one Zod failure (`confidence: 100`).
- **Contradiction checks:** 1 of 3 correct (blue vs green failed with a structured-output error).
- **Vitest:** 48 passed, 1 timed out.

### 3.7 `audit/CONTEXT-EXPERIMENT-RESULTS.md` + `context-experiment.ts` (2026-10-10)

Ten cases across five variants, with no application code changed:

| Variant | Score |
|---|---|
| Original | 0/10 |
| Better prompt | 7/10 |
| + Conversation context | 8/10 |
| + Multi-fact array | 7/10 |
| All combined | 8/10, with full multi-fact coverage |

- Context alone fixes "Seattle." and "I don't like them anymore".
- The array schema makes the model worse at rejecting hypotheticals and third-party facts.

**Recommends Option A (targeted repair).** The implementation order it gives is:

1. Prompt
2. Array schema
3. History
4. Merge consolidate
5. Floor of ~0.3
6. Re-run
7. Full eval

### 3.8 `audit/mem0-spike/` (2026-10-10)

- **What it tested:** the mem0ai TS SDK v3.3.1 with Ollama llama3:8b on 8 cases × 3 runs. Its `node_modules` is now gitignored.
- **Result:** mem0 extracts well (5 pass, 1 partial, 2 fail).
- **Verdict:** **ADAPT, keep the custom engine.** mem0's opaque `.add()` has no flag/confirm lifecycle, uses its own tables, and would fight RLS, the Explorer and provenance. Integrating it was estimated at about 8 days.

### Decisions they point to

The investigations converge on these:

1. Keep the custom engine and the infrastructure. No mem0, no graph DB, no rewrite.
2. Fix the extractor:
   - improved prompt
   - `memories: []`
   - last N turns plus today's date
   - an explicit "empty is fine" rule
3. Make consolidate write merged content, and make supersede atomic (an RPC).
4. Retrieval:
   - active-only rows
   - a similarity floor
   - recency as a tie-break only
   - drop confidence and IDs from the prompt
5. Make the eval actually finish (separate DB user, a non-7B judge, log errors) **before and after** the changes.
6. Freeze Explorer polish and entity work until the core is measured.

**Still undecided:** which model to launch on (local vs Gemini/OpenAI, and which local model), the floor value, the number of history turns, and how merges should work.

---

## 4. What works

| Area | Evidence |
|---|---|
| `npm ci --legacy-peer-deps` installs 446 packages | [ran] (plain `npm ci` fails, §5) |
| Dev server boots in about 1s; `/login` renders; `/`, `/chat`, `/explorer` and `/explorer/[id]` redirect to `/login` when signed out | [ran] |
| `POST /api/chat` without a session → 401. `GET /api/cron/staleness-sweep` without the secret → 401 | [ran] |
| Hosted Supabase reachable (auth health 200). The anon key with no session sees `[]` from `memories`, so RLS holds for unauthenticated reads | [ran] |
| Local model path: `llama3:8b` chat reply (52 s cold, model load), extraction 4–10 s, `nomic-embed-text` returns 768 dims, contradiction call returns in under 1 s | [ran] via a throwaway script (no DB writes) |
| Unit tests: **48 of 49 pass** | [ran] |
| `tsc` over `src/` is clean. All type errors are in `eval/` and `audit/` | [ran] |
| Auth: email/password login/signup/signout; each page and route checks `getUser()` | [code] |
| Message and conversation persistence; ownership check on `conversationId` | [code] |
| Memory pipeline runs end to end (create / consolidate / supersede / flag, with audit rows). The DB has active, superseded, flagged, deleted and expired rows | [code] + [ran] DB counts |
| Memory injected into the system prompt as a delimited "untrusted" block | [code] |
| Explorer: list with status/type filters and text search; detail page with provenance and audit timeline; inline edit (re-embeds); soft delete; confirm a flagged memory via RPC | [code] (not clicked through; I did not create a login on your hosted DB) |
| Staleness sweep expires `state` memories whose `valid_until` has passed (8 rows are `expired`) | [ran] DB counts. Only rows seeded by scripts have `valid_until` (§5) |
| Embedding-profile tracking per row, plus `npm run reindex-embeddings` | [code] |

---

## 5. What's broken

Ordered by how much each item blocks a launch.

### Blocking

1. **The production build fails.** [ran] `npx next build` fails at "Running TypeScript…":

   ```
   eval/run.ts(139,53): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
   eval/run.ts(217,13): error TS18048: 'judgement' is possibly 'undefined'.   (+7 more in eval/run.ts)
   audit/mem0-spike/test.ts(77,38): error TS18046: 'err' is of type 'unknown'.
   Failed to type check.
   ```

   `tsconfig.json` includes `**/*.ts`, so research scripts get type-checked as part of the app. The 2026-10-16 snapshot commit (`626153d`) put these files in git, so the pushed branch now fails on Vercel too. Before that commit, only clean clones built.

2. **Clean install fails.** [ran] `npm ci` stops with `ERESOLVE`. The cause is `vitest@5.0.2`, which wants peer `@types/node` `^22 || >=24`, while `package.json` pins `@types/node` `^20`. It only works with `--legacy-peer-deps`. Vercel's default install would hit the same error.

3. **Remote mode cannot embed as documented.** [code]
   - `.env.example` sets `REMOTE_PROVIDER=google` and `EMBEDDING_MODEL=text-embedding-3-small`. That is an OpenAI model name, and it gets passed to `google.textEmbeddingModel()` (`src/lib/memory/provider.ts:54`).
   - The code defaults (`embedding.ts:5`, `provider.ts:67`) produce the same pairing when the variable is unset.
   - `generateEmbedding` swallows the error and returns `null` (`embedding.ts`). `process-candidate.ts` then skips every candidate, and semantic retrieval is skipped too.
   - **Net effect: in remote mode, no memory is ever stored and the app still looks healthy.**

4. **Local mode can't run in production.** [code] The Ollama URL is hardcoded to `http://localhost:11434` (`provider.ts:19,44`) and there is no env override, so Vercel would need remote mode, which hits item 3.

5. **Switching providers silently disables semantic memory.** [code + ran] All 67 stored memories use `ollama:local:nomic-embed-text:768`. Under any other profile:
   - `retriever.ts` ~L96–108 throws a mismatch error.
   - The retriever catches it (~L131) and falls back to lexical search only, without telling anyone.
   - The mismatch check also counts deleted and superseded rows.
   - The migration backfill value `remote:gemini-embedding-2:768` (`20260928000002`) can never match the code's `google:…` format.

### Security

6. **`confirm_memory` lets any signed-in user modify another user's memories.** [code] `supabase/migrations/20260928000000_day6_confirm_rpc.sql`:
   - It is `SECURITY DEFINER`, so it bypasses RLS.
   - It has no `SET search_path`.
   - It trusts the caller-supplied `p_user_id` and never checks `auth.uid()`.
   - No migration revokes EXECUTE from `anon` / `authenticated`.

   Anyone can call `/rest/v1/rpc/confirm_memory` with a victim's user id and memory ids to flip and supersede the victim's memories. They would need to know the UUIDs. `src/scripts/real-db-security-smoke.ts` Check 6 tests the wrong case, so it can't catch this. I did not call the RPC, because that would change data.

7. **Users can bypass the audit trail.** [code] `GRANT ALL` to `anon` (`20260927000003_grants.sql`) plus "FOR ALL" RLS lets a user update or **hard-delete** their own memories directly through the REST API. A hard delete cascades away the audit history. Users can also insert fake audit rows, and `confirmMemory` trusts `conflicts_with` from them (`store.ts` ~L228–241).

8. **Memory content and queries are logged as PII.** [code] They go to the server logs on every request (`retriever.ts` ~L218–230, `process-candidate.ts`, `store.ts`).

### Functional bugs

9. **The memory detail page probably crashes on Next 16.** [code + docs] `src/app/explorer/[id]/page.tsx:9,21` types `params` as `{ id: string }` and reads `params.id` synchronously. Next 16 docs (`node_modules/next/dist/docs/.../dynamic-routes.md:148`) say `params` is a Promise. `explorer/page.tsx` handles `searchParams` correctly. **Not runtime-verified**, because that needs a login.

10. **Explorer filters don't refresh the list.** [code] `ExplorerClient.tsx:21` does `const [memories] = useState(initialMemories)`, so new server props after `router.push` are ignored.

11. **One unit test fails.** [ran] `src/tests/mutation.test.ts:79` "EDIT: successfully updates an active memory" times out after 5000 ms. It calls the real `generateEmbedding` through a dynamic import that the mock doesn't intercept, and it tries to reach Ollama.

12. **The extractor gets one fact, from the latest message only.** [ran + code] Live: "I'm a software engineer, I live in Boston, and I love hiking." became **one** memory, "I am a software engineer, a resident of Boston, and an enthusiast of hiking" (`extractor.ts` schema L5–14, `prompt: messageContent` L25).

13. **Consolidate drops the new information.** [code] `store.ts` ~L83–89 updates only `source_message_ids`, `corroboration_count` and `updated_at`, never `content`.

14. **New memories never get `valid_until`.** [code + ran] The create/flag/supersede inserts don't set it. The sweep only works on rows that test scripts seeded.

15. **No relevance floor.** [code] Retrieval uses `match_threshold: 0.0` (`retriever.ts:64`), so with any active memories it can never return nothing. Lexical search uses AND semantics (`plainto_tsquery`). Flagged rows take up RPC slots.

16. **Supersede is not atomic.** [code] Insert-then-update (`store.ts` ~L107–145): a failure in between leaves two active memories. The in-memory lock (`store.ts:5`) does nothing across serverless instances.

17. **Login errors are invisible.** [code] `login/actions.ts` redirects to `/login?error=<raw message>` without URL-encoding, and `login/page.tsx` never displays it.

18. **The pgTAP RLS test can't run.** [code] `supabase/tests/database/01_rls_isolation_test.sql` has invalid UUID literals (`'m1000000-…'`), inserts without the now-required `embedding_profile`, and uses a `tests` schema that is never created.

19. **Most `src/scripts/*` real-DB scripts are broken.** [code] They predate the `embedding_profile NOT NULL` column and/or use non-UUID ids (`msg-…`, `seed_1`, `test-local-user-id`). `verify-gemini-lifecycle.ts` uses random user ids that don't exist in `auth.users`. `e2e-browser-test.ts:89` waits for `.text-yellow-600`, but the badge is `text-yellow-800`.

20. **`npm run eval` has never completed** (§3.1). It also fails type-checking.

### Quality

21. **Lint: 138 problems (109 errors, 29 warnings).** [ran] About 26 errors are in app code (`src/app`, `src/lib`, `src/utils`), almost all `no-explicit-any`, plus 2 `react/no-unescaped-entities` in `explorer/[id]/page.tsx:195`. The rest are in scripts, tests, `eval/` and `audit/`. Next 16 doesn't run lint during the build, so this doesn't block it.

22. **`npm audit`: 8 high-severity issues; 3 in production dependencies.** [ran] These are `next` 16.0.0–16.3.7 (6 advisories, including image-optimization SSRF and cache poisoning), `sharp` < 0.35.5 and `source-map-js`. The fix is `next@16.4.2`.

---

## 6. Half-built or abandoned work

| What | State | Where |
|---|---|---|
| **Entity graph** | Tables, an Explorer filter (raw UUID text box), a "Linked Entities" section, and a 10% retrieval weight exist. Nothing writes entities, and `entityMatch = 0.0 // Placeholder` | `init_schema.sql` L56–112, `retriever.ts` ~L164, `explorer/page.tsx` ~L48–65 |
| **Merge/consolidation model** | `MERGE_MODEL` is documented but never read | `.env.example` |
| **Chat history UI** | Messages are saved but never reloaded. There is no conversation list, and a refresh loses the thread | `src/app/chat/page.tsx:15-16` |
| **Temporal inference** | `valid_from` / `valid_until` columns and the sweep exist; the LLM never produces `valid_until` | `extractor.ts`, `store.ts` |
| **Reject action** | The `reject` audit action exists, but the "Reject" button just soft-deletes and logs `delete` | `explorer/[id]/ActionButtons.tsx` |
| **Memory on/off toggle** | `profiles.memory_enabled` column, never read | `init_schema.sql` L7 |
| **Evaluation** | Three generations: `src/scripts/eval/*` (broken ids, superseded), `eval/run.ts` (never completed), and the `audit/*` experiment scripts (worked, but on the extractor only) | §3 |
| **Memory controller (single LLM op list)** | Schema prototyped in the bakeoff only; the branch name `memory-controller-v2` suggests this was the next plan. No app code exists | `eval/bakeoff/run.ts` |
| **Deployment** | The checklist exists. There is no `vercel.json` (so no cron schedule), no auth callback route, and no deployed URL | `docs/DEPLOYMENT-CHECKLIST.md` |
| **Structured logging / tracing** | The spec requires JSON logs with `trace_id`; only `console.log` exists | spec vs `src/lib/memory/*` |
| **Explorer extras** | No restore/undo, no manual memory creation (even though the UI text mentions it), no pagination (API cap of 1000), and flagged memories can't be edited | `src/app/explorer/**` |
| **`DeleteButton.tsx`** | Built, never imported | `src/app/explorer/[id]/DeleteButton.tsx` |

---

## 7. Inconsistencies

### Docs vs reality (treat `docs/` as historical, not as truth)

- **The stress-test report was written by a script, not by tests.** `src/scripts/run-stress.ts:61` writes a hardcoded markdown string to `docs/CORE-STRESS-TEST-REPORT.md`, including "Deterministic Fuzz Cases: 10,000". The "fuzz" loop in `src/scripts/stress/group_logic.ts:25-61` generates inputs and then never calls `makeDecision`; the comments inside admit the plan was abandoned. `group_db.ts` hardcodes "PIPELINE WORKS". [code]
- `docs/LOCAL-E2E-VALIDATION-REPORT.md` says edit/delete/confirm were E2E-verified. `e2e-browser-test.ts` never exercises edit or delete, its "CONFIRM" step doesn't confirm, and it would fail on the selector mismatch above.
- `docs/CORE-VALIDATION-REPORT.md` claims RLS was verified by `verify-gemini-lifecycle.ts`. That script uses the service-role key and user ids that don't exist.
- Missing eval metrics are blamed on the Gemini quota. The scripts' own non-UUID ids would have failed regardless, and `real-db-lifecycle-smoke.ts` labels *every* failure "BLOCKED BY EXTERNAL QUOTA".
- `V1-RELEASE-CHECKLIST.md` ticks "debug scripts removed", "remote mode functions correctly" and "E2E verified". None of these hold.
- **Framework:** "Next.js 15" in `V1-FINAL-STATE.md:7`, `CORE-STRESS-TEST-REPORT.md` and `LOCAL-OLLAMA-TESTING.md`, but it is 16.3.6.
- **Wrong names:** tables `users` / `memory_sources` / `memory_audit_logs`, and RPC `atomic_confirm_memory`. The real ones are `profiles`, `memory_audit_log` and `confirm_memory`.
- **Embeddings:** the spec and `.agents/AGENTS.md` say OpenAI 1536-dim; the code is 768 everywhere. The checklist default `text-embedding-004` / `gemini-embedding-2` doesn't match the code default `text-embedding-3-small`.
- **Test counts:** some docs say 48/48 and others 49/49. The real figure is 49 tests, and 48 pass today.
- **Spec routes that don't exist:** `/api/memories`, `POST /api/cron/staleness`, `middleware.ts` (correctly replaced by `proxy.ts`), and `src/app/auth/callback/route.ts`.
- **README local setup can't be followed:**
  - `.gitignore` ignores `.env*` except `.env.example`, so `.env.local.ollama.example` and `.env.remote.example`, which the README tells you to copy, are untracked.
  - The Ollama example sets no `CHAT_MODEL` / `EXTRACTION_MODEL` / `CONTRADICTION_MODEL`, so they fall back to `gemini-3.5-flash` and get sent to Ollama.
  - `npx supabase start` was never possible on this machine (no Docker), and `.env.local` points at the **hosted** project.
- `ENGINEERING-LOG.md` stops before Day 5 and has encoding damage.

### Code vs code

- **Duplicate tests:** `test/memory-engine.deterministic.test.ts` duplicates `src/tests/decision-engine.test.ts`. `decision-engine.test.ts` ~L158–161 is a placeholder (`expect(true).toBe(true)`).
- **Duplicate eval harnesses:** `src/scripts/eval/*` vs `eval/run.ts` vs the `audit/*.ts` experiments.
- **The extractor prompt is copied** into `eval/bakeoff/run.ts` and `audit/context-experiment.ts`, so it will drift.
- **`'gemini-3.5-flash'` hardcoded as a default in four places:** `chat/route.ts:83`, `extractor.ts:17`, `decision-engine.ts:12`, `retriever.ts` ~L221.
- **Default embedding model defined twice:** `embedding.ts:5`, `provider.ts:67`.
- **Duplicated provider-selection logic** in `getModel` / `getEmbeddingModel`.
- **`getStatusColor` duplicated** in `ExplorerClient.tsx` and `explorer/[id]/page.tsx`.
- **`MemoryStatus`** (`types.ts:2`) lacks `'expired'`, which the DB uses.
- **Type casts that lie:** the RPCs don't return `source_message_ids` or `embedding_profile`, yet results are cast to `Memory`. As a result, the provenance branch in `context-builder.ts` never runs.
- **The embedding-profile safety check covers retrieval only;** the write-path matcher (`matcher.ts`) ignores profiles.
- **Unused imports:** `google` in `chat/route.ts:2`, `useEffect` in `ChatClient.tsx`.
- **`@ai-sdk/openai` is in `devDependencies`** but imported at runtime (`provider.ts:1`). `tsx` is used by the npm scripts but isn't a dependency.
- **`package.json` `"name": "tmp-app"`.** `layout.tsx` metadata still says "Create Next App".
- **Messy migration history:**
  - `vector(1536)` → `768`.
  - Both RPCs were redefined three times.
  - The audit `action` CHECK constraint was dropped and recreated with fragile `LIKE` matching.
  - `20260927000005` begins with `TRUNCATE TABLE public.memories CASCADE`, which also wipes audit rows if replayed.
- **`supabase/config.toml`** points `seed` at a non-existent `./seed.sql`. Its minimum password length is 6.

### Conflicting approaches

- **Many specialist LLM calls (current: extract → contradict) vs a single controller** (bakeoff Test B, branch name). The audits recommend patching the specialists first.
- **Local Ollama (what everything was tested on) vs Gemini (what the docs and deployment plan assume).** Remote mode has never been exercised end to end.
- **Service-role writes in `after()` vs RLS-scoped writes everywhere else.**

---

## 8. Missing for production

**Build and CI**

- Exclude `eval/` and `audit/` (or fix them) so `next build` passes.
- Resolve the `@types/node` / vitest peer conflict.
- Add `.nvmrc` / `engines` (the machine runs Node 22.18).
- No CI pipeline exists (no `.github/workflows`).
- Move `@ai-sdk/openai` to `dependencies`; add `tsx` if the scripts stay.

**Configuration**

- One correct, tracked env template per mode. The remote template must pair the provider with the embedding model correctly, and `REMOTE_PROVIDER` must be listed.
- `OLLAMA_BASE_URL` (or drop local mode in production).
- Document `EVAL_USER_ID`, `GEMINI_JUDGE_MODEL` and `E2E_*`, or remove them.
- A strong `CRON_SECRET`; all the templates ship `test-cron-secret`.

**Deployment**

- A `vercel.json` cron entry. Vercel sends `Authorization: Bearer $CRON_SECRET` itself.
- A Supabase project plan. Is the current hosted project production? It is full of test users.
- An auth callback / email-confirmation flow if hosted Supabase has confirmations enabled.
- Site URL and redirect settings.
- Metadata, favicon and app name.

**Security**

- Fix `confirm_memory`: check `auth.uid()`, set `search_path`, and revoke from `anon`.
- Narrow the grants. Block direct UPDATE/DELETE on `memories` and INSERT on `memory_audit_log`, or move every write behind RPCs.
- Rate limiting and a size limit on chat messages. Every message triggers 2–3 LLM calls.
- Remove PII from logs.
- Validate the login form input.
- Stop sending client-supplied `system` / `assistant` turns straight to the model.
- Upgrade `next`.

**Error handling and observability**

- Wrap `req.json()` in the chat route.
- Expose stream errors to the user.
- Record extraction failures instead of returning silent `[]` / `null`, ideally with a retry/dead-letter.
- Check audit-insert errors (currently ignored at ~7 sites in `store.ts`).
- Show a user-visible warning on an embedding-profile mismatch.
- Structured logs or tracing; no error tracking (e.g. Sentry) is set up.

**Data integrity**

- Make supersede an atomic RPC.
- Use a database-level lock or idempotency key per message instead of the in-process `Set`.
- Paginate `reindex-embeddings`; also, its `--dry-run` still calls the embedding API.

**Tests**

- The edit test hangs.
- No tests for `provider.ts` mode/key logic (where the remote bug lives), for the supersede/consolidate store paths, or for the profile-mismatch throw.
- No working DB/RLS test.
- No working E2E test.
- **No semantic eval that completes.** This is the most important missing piece, because without it no quality change can be shown to help.

**Product**

- Chat history reload and a conversation list.
- A privacy policy and data export/delete-account (the app stores personal facts).
- Cost controls for hosted models.

---

## 9. Open questions for you

I didn't guess at any of these. Each one changes what "finished" means.

1. **Who is the launch for?** A portfolio/demo piece, a personal tool, or public sign-ups? This sets the bar for security, rate limiting, email confirmation, privacy policy and cost controls.
2. **Which models will production run on?** Local Ollama can't run on Vercel as written. Gemini, OpenAI, or a hosted open model? Are you willing to pay for an API tier? The earlier audits say the free Gemini tier blocked every eval. If you keep local mode for development, which local model? The bakeoff picked none.
3. **Is the current hosted Supabase project production?** It has 51 test profiles and 67 memories. May it be wiped, or should launch use a fresh project? Is it safe for eval scripts to write there, or do you want a separate eval project or user?
4. **Is the semantic-core direction from the audits what you want?** That means patching the existing pipeline (prompt, `memories[]`, history, merge, floor) rather than building the single "memory controller" the branch name `memory-controller-v2` implies.
5. **The open decisions from `MEMORIA-FORENSIC-AUDIT.md` §19:**
   - How many prior turns should the extractor see?
   - Should consolidation write an LLM-merged string, append, or keep linked separate memories?
   - What retrieval floor do you want?
   - Should assistant messages be mined for memories?
6. **Entities:** build them (extraction plus linking) or remove the tables and UI for launch?
7. **What's in scope for launch beyond the core?** Chat history reload and a conversation list, a memory on/off toggle (`memory_enabled`), restore/undo, manual memory creation, data export.
8. **What should happen to `docs/`?** Parts of it are stale and some of it describes testing that didn't happen. Archive it, delete it, or rewrite it? And `src/scripts/*`: keep and fix the real-DB scripts (as the second opinion suggests), or remove them?
9. **Should `audit/` and `eval/` stay in the repo** as permanent tooling (then they must type-check, or be excluded from the app build), or move out?
10. **Did you intend `confirm_memory` to be callable directly by clients,** or only through the server action? This decides whether the fix is "check `auth.uid()`" or "revoke and call via the service role".
