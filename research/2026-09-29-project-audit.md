# Memoria V1 Forensic + Semantic + Architectural Audit

**Date:** 2026-09-29  
**Scope:** static source inspection only. No application code, env, DB, or dependencies were modified.  
**Runtime semantic quality:** not observed in this audit except via checked-in eval artifacts.

---

## 0. Executive Summary

Memoria V1 is a working **memory operating system** (auth, persist, RLS, audit, explorer, provider switch, pgvector RPCs) wrapped around a **semantically weak write/retrieve brain**. The product “runs”; conversation-level understanding is not implemented in the memory path. Line-class mix below is **non-blank TS/SQL lines**, not “percent of useful product.” Three largest problems: (1) extractor sees only the latest user string, schema allows one fact, failures become `[]`; (2) write decisions use top-1 cosine match + “cannot both be true” + evidence `>` that flags corrections, then consolidate **never updates content**; (3) retrieval uses latest-message embedding, threshold `0.0`, recency/confidence as relevance, no abstention, lexical `plainto_tsquery` AND. Strongest preserved pieces: user-scoped Postgres + RLS, audit log, explorer inspect/edit/delete/confirm, embedding-profile mismatch hard-fail, chat isolation of memory as untrusted system text. **Semantic-core refactor is warranted; a full product rewrite is not.** Single best next step: **run a small real-model write/retrieve harness with conversation context and multi-fact schema, then change extractor+decision+retrieval gates before more UI.** Checked-in eval (`eval/results/1790621765546.md`) is **NO DATA**: 32/32 infrastructure errors, 0 judged passes/fails.

---

## 1. Part 1 — Inventory and truthful size

### 1.1 Top-level directories

| Directory | Role |
| --- | --- |
| `.agents/` | Agent rules (not runtime) |
| `.next/` | Next build output (generated) |
| `docs/` | Historical reports (not treated as implementation truth) |
| `eval/` | Semantic case JSON + runner + one result dump |
| `node_modules/` | Dependencies |
| `public/` | Default Next assets |
| `src/` | Application, memory engine, tests, one-off scripts |
| `supabase/` | Migrations, config, SQL RLS tests |
| `test/` | Duplicate vitest suite |
| `audit/` | This report (created by this audit) |

Root also contains `package.json`, configs, `README.md`, `AGENTS.md`, `CLAUDE.md`, `verify-local.ts`, `e2e-*.ts`, `clean-test-data.ts`.

### 1.2 Counting method

- **Line counts** for `*.ts`/`*.tsx`/`*.sql` excluding `node_modules` and `.next`: PowerShell `Get-Content | Measure-Object -Line` (**non-blank lines**).
- Paths containing `[id]` failed that glob; those four files were counted from file reads (physical lines).
- **Not included** in the percentage totals: JSON eval cases, CSS, markdown docs, `package-lock.json`.
- **knip / ts-prune:** UNAVAILABLE (not in `package.json`). Dead-code claims use import grep only.

**Non-blank TS/SQL total used below: 5866**  
(5441 from successful Measure-Object + 425 explorer `[id]` files: `page.tsx` 213, `ActionButtons.tsx` 80, `EditableContent.tsx` 97, `DeleteButton.tsx` 35.)

Classification sums (same 5866, one class per file):

| Class | Non-blank lines | % of counted TS/SQL |
| --- | ---: | ---: |
| KEEP | 1184 | 20.2% |
| FIX | 1891 | 32.2% |
| REWRITE | 406 | 6.9% |
| DELETE | 2385 | 40.7% |

These percentages measure **how this audit labeled files**, not product usefulness. DELETE is large because **one-off scripts and superseded eval harnesses** dominate `src/scripts/`.

### 1.3 Dead / redundant (evidence)

| Finding | Evidence |
| --- | --- |
| `entities` / `memory_entity_links` never written by engine | Schema in `supabase/migrations/20260927000000_init_schema.sql` L56–112; no `from('entities')` inserts under `src/lib/` (grep). Explorer can join empty links (`src/app/explorer/[id]/page.tsx` L20, L138–148). `entityMatch = 0.0` hardcoded (`src/lib/memory/retriever.ts` L164). |
| `profiles.memory_enabled` unread | Column `init_schema.sql` L7; no `memory_enabled` in `src/` (grep). |
| `MERGE_MODEL` set in `.env.example` L15, never read in TS | grep `MERGE_MODEL` hits docs/example only. |
| `DeleteButton.tsx` never imported | grep: only its own export. `page.tsx` uses `ActionButtons`. |
| Chat messages persisted, never reloaded | Inserts in `src/app/api/chat/route.ts` L61–71, L94–102; chat page comment “for now we’ll just let ChatClient handle a fresh…” (`src/app/chat/page.tsx` L15–16); no `from('messages').select` in chat UI. |
| Duplicate eval systems | `src/scripts/eval/run-eval.ts` vs `eval/run.ts` (`package.json` `"eval"` → `eval/run.ts`). |
| Duplicate decision tests | `src/tests/decision-engine.test.ts` and `test/memory-engine.deterministic.test.ts`. |
| Placeholder contradiction test | `decision-engine.test.ts` L158–161 `expect(true).toBe(true)`. |
| `google` imported unused in chat route | `src/app/api/chat/route.ts` L2 vs `getModel` L89. |
| Eval runner skips assistant turns | `eval/run.ts` L144–149 `if (turn.role === 'user')`. |

### 1.4 File classification (TABLE 1)

| File | KEEP/FIX/REWRITE/DELETE | Reason | Evidence |
| --- | --- | --- | --- |
| `src/lib/memory/extractor.ts` | REWRITE | Single-object schema; latest message only; empty on error | L5–14, L16–41 |
| `src/lib/memory/decision-engine.ts` | REWRITE | Top-1 match; “both true”; score `>`; consolidate semantics elsewhere | L5–8, L42–90 |
| `src/lib/memory/retriever.ts` | REWRITE | threshold 0.0; recency/confidence as relevance; entityMatch 0 | L62–66, L164, L187–196 |
| `src/lib/memory/process-candidate.ts` | REWRITE | Orchestrates the above; swallows pipeline errors | L16–41 |
| `src/lib/memory/context-builder.ts` | FIX | Untrusted delimiters good; injects confidence; no “conversation overrides memory” | L14–41 |
| `src/lib/memory/store.ts` | FIX | Lifecycle real; consolidate no content; supersede two REST calls; expire uses `expired` | L65–105, L106–164, L326–381 |
| `src/lib/memory/matcher.ts` | FIX | Threshold 0.8 fixed; RPC includes flagged | L4, L13–18 |
| `src/lib/memory/embedding.ts` | FIX | Fail → null skip; model/provider coupling | L4–28 |
| `src/lib/memory/provider.ts` | FIX | Local/remote real; Zod failures not retried | L15–37, L84–151 |
| `src/lib/memory/types.ts` | KEEP | Honest types; `expired` missing from `MemoryStatus` vs DB | L1–2 vs migration 20260928000001 |
| `src/app/api/chat/route.ts` | FIX | Auth, persist, retrieve query=latest, after() extract via admin | L24–31, L78–80, L110–116 |
| `src/app/api/cron/staleness-sweep/route.ts` | FIX | Auth fail-closed prod; admin sweep | L10–27 |
| `src/app/chat/ChatClient.tsx` | FIX | Streams; no history load | whole file |
| `src/app/chat/page.tsx` | FIX | Auth gate; no conversation list | L15–16 |
| `src/app/explorer/page.tsx` | KEEP | List/filter with user_id | L27–71 |
| `src/app/explorer/ExplorerClient.tsx` | KEEP | Filters UI | file |
| `src/app/explorer/actions.ts` | KEEP | User client mutations | L7–48 |
| `src/app/explorer/[id]/page.tsx` | KEEP | Inspect audit/provenance | L17–48 |
| `src/app/explorer/[id]/ActionButtons.tsx` | KEEP | Confirm/reject | file |
| `src/app/explorer/[id]/EditableContent.tsx` | KEEP | User edit | file |
| `src/app/explorer/[id]/DeleteButton.tsx` | DELETE | Unreachable | no imports |
| `src/app/login/*` | KEEP | Password auth | files |
| `src/app/page.tsx` | KEEP | Redirect | file |
| `src/app/layout.tsx` | FIX | Default “Create Next App” metadata | L16–19 |
| `src/app/auth/signout/route.ts` | KEEP | Sign out | file |
| `src/components/Navigation.tsx` | KEEP | Nav | file |
| `src/proxy.ts` + `src/utils/supabase/*` | KEEP | Session/RLS user client | files |
| `src/utils/supabase/admin.ts` | FIX | Service role; used on write path | chat `after` L114–116 |
| `supabase/migrations/*` | KEEP | Applied history; later files REPLACE RPCs | 000005 overwrites vector dim |
| `supabase/tests/database/01_rls_isolation_test.sql` | KEEP | Isolation tests exist | file |
| `src/tests/*` | FIX | Path tests; LLM mocked | see Part 3 |
| `test/memory-engine.deterministic.test.ts` | DELETE | Overlaps `decision-engine.test.ts` | both mock LLM |
| `eval/run.ts` | FIX | Real pipeline+judge intent; skips assistant; judge default local llama | L144–149, L175 |
| `eval/cases/*.json` | KEEP | Useful scenario inventory | files |
| `eval/results/1790621765546.*` | KEEP | Evidence of failed run (NO DATA) | 32 errors |
| `src/scripts/**` | DELETE | One-off smoke/stress/old eval; not product | not in `package.json` except reindex |
| `src/scripts/reindex-embeddings.ts` | KEEP | Operational need if profiles change | `package.json` script |
| `clean-test-data.ts`, `e2e-*.ts`, `verify-local.ts` | DELETE | Ad-hoc ops | root scripts |
| `vitest.config.ts` | KEEP | Forces `AI_MODE=local` in tests | L6–9 |
| `next.config.ts` | KEEP | Empty config | file |

KEEP 1184 / FIX 1891 / REWRITE 406 / DELETE 2385 as assigned from the table (scripts bundle → DELETE; semantic four → REWRITE; store/provider/chat/tests/eval runner → FIX; auth/UI/schema/cases → KEEP). **UNVERIFIED:** exact KEEP-line arithmetic if a file is split-class; each file has one class.

### 1.5 Inventory (execution files, abbreviated)

Git last commit dates from `git log -1 --format=%ci` (tracked files). **Untracked:** `eval/run.ts`, `eval/cases/*`, `eval/results/*` — no commit date.

| Path | Purpose | ~Lines | Last commit | Entry |
| --- | --- | ---: | --- | --- |
| `src/app/api/chat/route.ts` | Chat POST | 119 | 2026-09-28 19:12 | HTTP |
| `src/lib/memory/process-candidate.ts` | Write pipeline | 39 | 2026-09-28 14:37 | imported by chat `after` |
| `src/lib/memory/extractor.ts` | Structured extract | 39 | 2026-09-28 14:37 | pipeline |
| `src/lib/memory/matcher.ts` | Vector match 0.8 | 24 | 2026-09-28 14:37 | pipeline |
| `src/lib/memory/decision-engine.ts` | create/flag/supersede/consolidate | 82 | 2026-09-28 15:42 | pipeline |
| `src/lib/memory/store.ts` | Persist + expire + edit | 330 | 2026-09-28 22:08 | pipeline, explorer, cron |
| `src/lib/memory/retriever.ts` | Hybrid retrieve | 211 | 2026-09-28 22:08 | chat |
| `src/lib/memory/context-builder.ts` | System prompt | 34 | 2026-09-28 19:12 | chat |
| `src/lib/memory/provider.ts` | Models + safeGenerateObject | 131 | 2026-09-28 22:08 | all LLM |
| `eval/run.ts` | Semantic eval | 294 | untracked | `npm run eval` |
| Remaining `src/`, `supabase/`, tests, scripts | as glob | see §1.2 | 2026-09-27–28 | mixed |

---

## 2. Part 2 — Product progress / architecture reconstruction

### 2.1 Actual call graph (code, not ideal)

```
USER MESSAGE (ChatClient sendMessage)
  → POST /api/chat  (src/app/api/chat/route.ts POST)
      → supabase.auth.getUser()
      → insert/verify conversations
      → insert messages (user)
      → retrieveMemories(userId, userContent)   // latest user text ONLY
      → buildSystemPrompt(retrieved)
      → convertToModelMessages(messages)        // client-session history
      → streamText(CHAT_MODEL)
          onFinish → insert messages (assistant)
      → after() → createAdminClient() → processMemoryCandidate(userMsg.content, id, userId)
            → extractMemory(messageContent)     // same latest text, no history
            → generateEmbedding(candidate.content)
            → matchMemories(userId, embedding)
            → makeDecision → isContradiction (optional)
            → executeMemoryDecision
```

**Chat LLM** sees: system (memories) + **in-browser** `messages`.  
**Extractor** sees: `prompt: messageContent` only (`extractor.ts` L25).  
**Retriever query** is `userContent` (`chat/route.ts` L79).

### 2.2 Memory lifecycle (actual)

```
candidate (0 or 1 from extractMemory)
  → embedding or skip
  → match_memories threshold 0.8, count 5, status IN (active, flagged)
  → if none: CREATE
  → else top relatedMemories[0] only
  → isContradiction LLM (cannot both be true)
  → if LLM fail: FLAG
  → if contradicts AND candidateScore > existingScore: SUPERSEDE
  → else if contradicts: FLAG
  → else: CONSOLIDATE (source_ids + corroboration++; content UNCHANGED)
  → storage (admin client on chat path)
  → retrieval later: match_memories 0.0 top 20 + lexical top 10, drop non-active/expired in JS
  → mutation: user edit/delete/confirm via user supabase client
  → expiration: cron expireStaleStateMemories only if type=state AND valid_until < now
  → deletion: soft status=deleted
```

**valid_until is never set on create** (`store.ts` insert L30–43, L108–121 — no `valid_until` field). Sweep therefore finds nothing for typical new “state” rows.

### 2.3 Stage table

| Stage | File / function | In | Out | Model | Deterministic | DB | Info added/removed | Failure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chat ingest | `POST` | UIMessage[] | stream | CHAT_MODEL via `getModel` | persist | conversations, messages | strips to `text` part | 401/400/500 |
| Retrieval | `retrieveMemories` | userId, query string | RetrievalCandidate[] | embedding model | scoring formula | RPCs | drops flagged/expired in JS | embedding fail → lexical only |
| Context | `buildSystemPrompt` | candidates | string | none | template | none | adds type, confidence, optional valid_until, source ids **if present** | empty memories → base persona |
| Response | `streamText` | system + messages | tokens | CHAT_MODEL | none | assistant insert | none | 500 |
| Extract | `extractMemory` | **one string** | 0–1 candidate | EXTRACTION_MODEL | schema | none | **drops all but one fact; drops history** | catch → `[]` |
| Match | `matchMemories` | embedding | top matches | none | threshold 0.8 | RPC | other similar memories unused | empty list |
| Decide | `makeDecision` | candidate + matches | action | CONTRADICTION_MODEL | evidence formula | none | non-contradiction → consolidate (loses new wording) | null → flag |
| Store | `executeMemoryDecision` | decision | void | none | inserts | memories, audit | supersede not transactional | log + return |
| Audit | store inserts | reason JSON | row | none | | memory_audit_log | | insert errors logged |
| Expire | `expireStaleStateMemories` | none | counts | none | | memories | status `expired` | skip row |

### 2.4 LLM context matrix (TABLE 3)

| Call | Model env | System | User input | History | Memory | Metadata | Output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chat `streamText` | `CHAT_MODEL` default `gemini-3.5-flash` | `buildSystemPrompt` | latest + prior **client** turns | yes if UI session | retrieved active | confidence, type; RPC omits `source_message_ids` so UUID sources often absent | free text stream |
| Extract `generateObject` | `EXTRACTION_MODEL` | extract durable facts; skip filler | **latest user string only** | **no** | **no** | **no date** | `{hasMemory, memory?}` |
| Contradiction `generateObject` | `CONTRADICTION_MODEL` | both-true test | two fact strings | no | the one matched memory text only | no provenance | `{contradicts: boolean}` |
| Embeddings `embed` | `EMBEDDING_MODEL` | n/a | query or candidate text | no | n/a | n/a | vector |
| Eval judge (eval only) | `GEMINI_JUDGE_MODEL` default **`local:llama3:8b`** | judge DB vs expect | JSON dump | n/a | DB snapshot | n/a | judgeSchema |

Per-call questions:

1. **Full conversation?** Chat: only client buffer. Extract/contradiction: no.  
2. **Prior user turns?** Chat: yes in-session. Extract: no.  
3. **Assistant turns?** Chat: yes in-session. Extract: no. Eval: assistant turns ignored.  
4. **Date/time?** No call injects “today”.  
5. **Topic?** Not explicit.  
6. **Current memories?** Chat: retrieved set. Extract: no. Contradiction: one neighbor.  
7. **Provenance?** Explorer yes; chat prompt maybe empty `source_message_ids` (RPC columns in `match_memories` omit them — `20260927000005_switch_to_gemini_vector.sql` L12–22).  
8. **Entity context?** No writes; `entityMatch` 0.  
9. **Prior decisions?** Contradiction no.  
10. **Pronouns?** Extract: **no**. Chat model: possible in-session only.  
11. **Already lost?** History, extra facts, dates, entities, new consolidate text.  
12. **Reconstruct?** Chat model can in-session; **write path cannot**.

### 2.5 Semantic boundaries

| Boundary | Class | Why |
| --- | --- | --- |
| Understanding user meaning | MISSING on write | Extractor isolated (`extractor.ts` L25) |
| Extraction | FRAGILE / OVER-FRAGMENTED | Separate call, one fact, Zod |
| Normalization | FRAGILE | Left to model “standalone fact” with no examples |
| Entity recognition/resolution | MISSING | tables unused |
| Temporal interpretation | MISSING | no `valid_until` on insert |
| Contradiction | FRAGILE | prompt “cannot both be true” (`decision-engine.ts` L17–20); top-1 |
| Consolidation | BROKEN for product | content not updated (`store.ts` L83–89) |
| Memory-worthiness | FRAGILE | prompt-only |
| Retrieval ranking | FRAGILE | similarity ≠ relevance (`retriever.ts` L61–66, L187–196) |
| Reranking | MISSING | no second LLM |
| Query rewrite | MISSING | raw user text |
| Context construction | FRAGILE | confidence numbers; no override rule |
| Response generation | GOOD relative | gets history + memories |

### 2.6 Product capability (TABLE 2)

| Capability | Status | Actual implementation | Evidence | Semantic robustness |
| --- | --- | --- | --- | --- |
| Message ingestion | WORKING | persist user text | chat/route L61–71 | n/a |
| Conversation persistence | PARTIAL | writes DB, UI does not reload | chat/page L15–16 | n/a |
| Multi-turn context (chat) | PARTIAL | client `messages` only | ChatClient + convertToModelMessages | session-only |
| Multi-turn context (memory write) | BROKEN | extractor latest only | extractor L25 | none |
| Extraction | PARTIAL | 0–1 fact | schema L5–14 | weak |
| Multi-fact extraction | BROKEN | single `memory` object | schema; eval multi_fact.json | none by design |
| Normalization | PARTIAL | prompt “standalone” | extractor L24 | unmeasured |
| Reference resolution | BROKEN | no history to extract | implicit_reference.json vs eval skip assistant | none |
| Correction handling | PARTIAL | contradiction + evidence `>` | decision-engine L60–79 | likely flag |
| Refinement | BROKEN | consolidate ignores new text | store L83–89; refine-*.json | none |
| Negation | UNVERIFIED runtime | depends on extract+contradict | no live run | likely fail without prior memory in extract context |
| Contradiction detection | PARTIAL | LLM both-true | L11–27 | wrong question |
| Consolidation | PARTIAL | count++ only | store L65–105 | harmful for refinements |
| Supersession | PARTIAL | two-step REST | store L106–164 | race |
| Dedup | PARTIAL | consolidate if not contradict | identical → consolidate | OK for exact dup |
| Temporal create | BROKEN | valid_until unset | store inserts | |
| Temporal expiry | PARTIAL | cron + filter | store L326; retriever L147–149 | sweep starved |
| Retrieval relevance | BROKEN / PARTIAL | 0.0 threshold + extra weights | retriever L64, L187–196 | poor by design |
| Relevance gating / retrieve nothing | BROKEN | no floor; token budget only | no min finalScore | retrieval-02 expects empty |
| Context injection | WORKING path | system prompt | context-builder | injection hygiene OK |
| Memory surfacing | PARTIAL | always inject selected | no “don’t mention unless asked” | |
| User inspect/edit/delete | WORKING | explorer | actions.ts | n/a |
| Audit trail | WORKING | inserts | store | n/a |
| RLS | WORKING design | policies + user client | init_schema L130–172 | admin bypass on extract |
| Admin-client usage | PARTIAL / risk | service role write | chat after L114–116 | RLS not applied |
| Provider switching | PARTIAL | AI_MODE local/remote | provider.ts | default embedding name vs google UNVERIFIED |
| Error recovery | PARTIAL | extract → []; chat continues | extractor catch; chat after try | silent memory loss |
| Retry | PARTIAL | 503/429 only | provider L115–148 | not Zod |
| Cost/latency control | PARTIAL | maxRetries 0, 30s timeout | provider L97–100 | after() extra LLM |
| Observability | PARTIAL | console logs | retriever diagnostic L218–230 | no traces |
| Semantic evaluation | BROKEN as data | 32 infra errors | `eval/results/1790621765546.md` | NO DATA |

Status A/B/C/D/E (existence vs meaning):

| Capability | A exists | B executes (tests) | C happy-path | D messy | E semantic eval |
| --- | --- | --- | --- | --- | --- |
| Extract | yes | mocked | unmeasured | unmeasured | NO DATA |
| Retrieve | yes | mocked scores | unmeasured | unmeasured | NO DATA |
| Chat | yes | mocked stream | unmeasured | unmeasured | no |

---

## 3. Part 3 — Test honesty

### 3.1 Unit/integration inventory

| Path | Asserts | LLM mocked? | DB real? | Meaning evaluated? | Fails if semantics wrong? |
| --- | --- | --- | --- | --- | --- |
| `extractor.test.ts` (3) | maps mock object / empty / catch [] | yes `generateObject` | no | no | no (would still pass with wrong facts) |
| `decision-engine.test.ts` (7) | create/consolidate/supersede/flag given mock contradicts | yes | no | no | no |
| `matcher.test.ts` (1) | RPC args threshold 0.8 | n/a | mock rpc | no | no |
| `retriever.test.ts` (9) | formula, merge, budget, filters | embed mocked | mock rpc | no | **no** — encodes current (bad) weights |
| `context-builder.test.ts` (2) | delimiters | n/a | no | no | no |
| `chat.test.ts` (5) | 401, persist, stream, after extract, 404 | stream mocked | mock supabase | no | no |
| `system-prompt.test.ts` (1) | memory in system not user | stream mocked | mock | no | no |
| `mutation.test.ts` (7) | flag audit, confirm rpc, edit/delete guards | embed on edit unmocked path may call | mock | no | no |
| `temporal.test.ts` (3) | expire update | no LLM | mock | no | no |
| `cron.test.ts` (5) | CRON_SECRET | store mocked | no | no | no |
| `test/memory-engine.deterministic.test.ts` | same engine + fuzz no throw | `safeGenerateObject` mocked | no | no | no |
| `supabase/tests/database/01_rls_isolation_test.sql` | RLS isolation | n/a | intended real pg | n/a | n/a |
| `eval/run.ts` + cases | LLM judge of DB | **real** intended | **real** admin | **intended** | would if it ran |

**Counts:** mocked LLM tests ≈ 3+7+1+9+5+1+6 (decision duplicate) ≈ **32+** vitest cases; **real LLM tests in CI: 0**; **real DB in vitest: 0**; **semantic tests that ran successfully: 0** (artifact).

Mock-heavy tests prove **orchestration and formulas**, not **understanding**. `retriever.test.ts` L69–71 **locks in** recency+confidence boosting “relevance.”

**No tests for:** multi-fact schema, extractor history, pronoun resolution, refinement content merge, valid_until on create, retrieve-nothing floor, lexical AND behavior, flagged slot consumption, admin vs RLS writes, conversation reload, Zod 80.1 confidence.

### 3.2 Eval dataset and results

**Cases (32):** clean 3, correction 5, implicit 3, long_messy 3, multi_fact 4, noise 4, refinement 3, retrieval 2, state_expiry 2, change_over_time 3 (`eval/cases/*.json`).

**Result file `eval/results/1790621765546.md`:** Total 32, Passed 0, Failed 0, Pass rate 0%, **Infrastructure errors 32**, extraction_empty 1, llm_calls approx 150, empty Failed Cases section.

**Treat as NO DATA.** Do not infer pass/fail of semantics. `extraction_empty: 1` only shows at least one case had empty DB while expecting stores (`eval/run.ts` L154–156) before the infra error path — **UNVERIFIED** which case.

**Judge default:** `GEMINI_JUDGE_MODEL || 'local:llama3:8b'` (`eval/run.ts` L175) — even a healthy run would mix pipeline model and llama3 judge.

**Blocked:** unknown error string (results JSON has `"results": []`). **UNVERIFIED:** quota vs Ollama vs missing `EVAL_USER_ID` at earlier attempt vs later write of this file. Would need stderr of that process.

---

## 4. Part 4 — Root cause of poor output

### 4.0 Blind hypotheses (before H1–H13)

| ID | Mechanism | Evidence | Failure explained | Conf | Contrib |
| --- | --- | --- | --- | --- | --- |
| I1 | Write path is not conversational | extractor L25; process-candidate L18; eval ignores assistant L144–149 | “seattle.” / “yeah we still do that” / “he is a golden retriever” | High | **HIGH** |
| I2 | Schema is one optional `memory` object | extractor L5–14 | multi-fact messages store ≤1 | High | **HIGH** |
| I3 | Consolidation is corroboration-only | store L83–89 | refinements vanish | High | **HIGH** |
| I4 | Retrieval scoring is not relevance | retriever L64 0.0; L187–196 adds recency/confidence | “what fruit…” can surface unrelated; retrieve-nothing impossible | High | **HIGH** |
| I5 | Silent empty extract | extractor L37–41; maxRetries 0 on generateObject | looks like “nothing to remember” | High | **HIGH** |
| I6 | Entity graph is scenery | unused tables; entityMatch 0 | no entity boost / resolution | High | **MEDIUM** |
| I7 | Chat history not durable in UI | chat/page L15–16 | product multi-turn dies on refresh | High | **MEDIUM** |
| I8 | Evidence `>` + corroboration inflation | decision-engine L5–8, L64 | flags legitimate corrections; consolidations make supersede harder | High | **HIGH** |
| I9 | Contradiction asks coexistence not replacement | L17–20 | “I like apples / actually bananas” may consolidate | High | **HIGH** |
| I10 | No clock in any prompt | grep no ISO date in extractor/chat system | “until next Friday” never becomes valid_until | High | **MEDIUM** |
| I11 | Eval does not exercise chat route | eval/run.ts processMemoryCandidate only | eval cannot catch I7 or chat-vs-extract split | High | **MEDIUM** |
| I12 | `expired` status vs types | store L356 vs types L1; CHECK added in 20260928000001 | type drift; retrieval uses status!==active so expired dropped if set | Med | **LOW** |
| I13 | Default remote embedding model name `text-embedding-3-small` with `REMOTE_PROVIDER=google` | embedding.ts L5; provider L49–54 | possible wrong API model | Med | **MEDIUM** UNVERIFIED runtime |
| I14 | `confirm_memory` SECURITY DEFINER | day6_confirm_rpc.sql L24–32 no `search_path` | privilege/search_path risk | Med | **LOW** (security not semantics) |
| I15 | In-memory lock not distributed | store L14–23 | duplicate creates under concurrency | High | **LOW** |
| I16 | Judge/eval model default llama3 | eval/run.ts L175 | eval quality even if pipeline ran | High | **MEDIUM** for “measured quality” |

### 4.1 H1–H13 (TABLE 5)

| H | Verdict | Evidence | Contribution |
| --- | --- | --- | --- |
| H1 | **CONFIRMED** | extractor L24–25 `prompt: messageContent`; no messages array | **HIGH** |
| H2 | **CONFIRMED** | schema single `memory` object L7–13; return one-element array L28–35 | **HIGH** |
| H3 | **CONFIRMED** | catch L37–41 return []; `maxRetries: 0` L23; provider maps Zod to STRUCTURED_OUTPUT_FAILED L137–138 no retry | **HIGH** |
| H4 | **CONFIRMED** | store update omits `content` L83–89 | **HIGH** |
| H5 | **CONFIRMED** | L5–8, L64 `candidateScore > existingScore`; equal → flag (test L139–156); flagged excluded retriever L152–155 | **HIGH** |
| H6 | **CONFIRMED** | inserts L32–43, L110–121 no valid_until; expire query L339–341 requires non-null | **HIGH** for temporal |
| H7 | **CONFIRMED** | supersede insert then update L107–145; comment L12–13 no REST transaction; chat admin L114–116 | **MEDIUM** (correctness/races, less “wrong meaning”) |
| H8 | **CONFIRMED** | MATCH_THRESHOLD 0.8 matcher L4; `relatedMemories[0]` L43; prompt L17–20 | **HIGH** |
| H9 | **CONFIRMED** | chat L79 `userContent`; match_threshold 0.0 L64; top 20/10 L127, L136; formula L190–195 | **HIGH** |
| H10 | **CONFIRMED** | lexical SQL `plainto_tsquery` `20260927000002` L34–38; entityMatch L164 | **MEDIUM** (vector still fills; lexical often empty) |
| H11 | **CONFIRMED** | RPC `status IN ('active','flagged')` match_memories L41–42; JS drop L153–155 | **MEDIUM** |
| H12 | **PARTIAL** | confidence injected context-builder L25; **no** “conversation overrides memory”; UUID sources only if `source_message_ids` present — **RPC does not return them** so UUID leakage on chat path is **weaker than claimed** | **MEDIUM** |
| H13 | **PARTIAL** | Zod `z.number().min(0).max(1)` L11; catch → []; llama3 as **eval judge default** not proven as chat extract model. **UNVERIFIED** that production EXTRACTION_MODEL is llama3:8b. Mechanism is real **if** local extract used. | **HIGH** when local extract; else **LOW** |

### 4.2 Ranked root causes (TABLE 4)

| Cause | Evidence | Contribution | Confidence | Fix type |
| --- | --- | --- | --- | --- |
| Extractor context isolation (H1/I1) | extractor L25 | HIGH | High | Architecture (pass conversation+time) |
| Single-fact schema (H2) | extractor L7–13 | HIGH | High | Schema |
| Silent extract failure (H3/H13) | extractor L37–41 | HIGH | High | Implementation |
| Consolidate drops new text (H4) | store L83–89 | HIGH | High | Implementation / write semantics |
| Evidence+flag+exclude (H5) | decision L64; retriever L153 | HIGH | High | Deterministic policy |
| Retrieval not relevance (H9) | retriever L64, L187–196 | HIGH | High | Retrieval design |
| Contradiction question + top-1 + 0.8 (H8) | decision L17–43 | HIGH | High | Prompt + matching |
| No valid_until (H6) | store inserts | HIGH temporal | High | Write schema/LLM field |
| Lexical AND + entity 0 (H10) | SQL + L164 | MEDIUM | High | SQL / implement entities or drop |
| Flagged consume slots (H11) | RPC | MEDIUM | High | SQL filter |
| Admin non-transactional supersede (H7) | store L106–145 | MEDIUM | High | RPC transaction |
| Chat prompt gaps (H12) | context-builder | MEDIUM | High | Prompt |
| Eval infra + assistant skip (I11) | results md; eval L144 | HIGH for “we don’t know” | High | Eval harness |
| Model capability | **not isolated** | UNVERIFIED | — | Experiment after context |

**Earliest causes in chains:**

- *No memory stored:* extract schema/context/Zod empty **before** store.  
- *Wrong single fact from many:* schema H2 **before** matching.  
- *Correction flagged:* extract may be OK → H8/H5 **before** retrieval.  
- *Refinement lost:* H8 false-contradict → H4.  
- *Unrelated retrieve:* H9 **before** chat model.  
- *Temp state forever:* extract may tag `state` → H6 **before** cron.

### 4.3 Case studies A–J (LIKELY, not runtime-observed)

Assumptions: pipeline as coded; extractor without history; one fact.

| Case | Strong model would infer | Needs | Memoria gives extract | Likely store | Loss | Component | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A typo banana/apple | likes banana and apple | none | one string | 0–1 garbled or one fruit | multi-fact + spelling | H2 + model | arch + model |
| B multi-fact Delhi/robotics | 4 facts | none | one object | 1 of 4 | H2 | extractor schema | architecture |
| C apples then bananas | replace fruit | prior turn | turn2 only “meant bananas” **or** one blob | flag/create/wrong | H1 if split turns; H8/H5 | extract+decision | arch+impl |
| D don’t like apples anymore | negate preference | prior apple memory | “doesn’t like apples” without linking | flag or extra memory | H1/H8 | decision | impl+arch |
| E cars→bugatti | merge detail | prior | second fact vs consolidate | corroboration, old “likes cars” | H4 | store | impl |
| F “we still do that” | weekend activity | conversation | ungrounded or skip | empty or junk | H1 | extractor | architecture |
| G colloquial robotics | interest in robotics | none | maybe | 0–1 | prompt strict “explicit” | extractor prompt | prompt+model |
| H exhausted today | transient; don’t store | date | may store state; **no expiry** | durable “never look at class” | H6 + worthiness | extract+store | arch |
| I duplicate bananas | one memory | prior | consolidate | count++ | OK | store | OK |
| J what fruit | retrieve fruit prefs | ranking | query embed latest | many memories | H9 | retriever | retrieval |

### 4.4 Model vs architecture

A stronger model **with the current extractor prompt still lacks history and still returns one fact**. It would improve: typo normalization, slang, maybe contradiction on two strings, maybe not storing “I’m tired.”

**Still broken with GPT-class extract:** H1, H2, H4, H5 policy, H6, H9, H11, UI history, entities unused, eval skip assistant.

**Do not blame llama3:8b** for H1/H2/H4/H9; those are visible with any model.

---

## 5. Part 5 — Architecture vs implementation

### A. Sound design (keep)

- User id on every row + RLS policies (`init_schema.sql` L130–172).  
- Soft delete + audit log.  
- Embedding profile column + mismatch throw (`retriever.ts` L96–108).  
- Memory as untrusted delimited block (`context-builder.ts` L14–18).  
- Confirm as SQL function (atomicity intent) `confirm_memory`.  
- Provider abstraction `getModel` / `getEmbeddingModel`.  
- Explorer as inspect/control surface.

### B. Bad implementation of good design

| Defect | Why design OK | Smallest fix |
| --- | --- | --- |
| H4 consolidate | merge is a valid op | update content or LLM merge |
| H3 silent [] | fail-soft OK | retry Zod; log metric; dead-letter |
| H7 two-step supersede | state machine OK | one RPC like confirm |
| H11 flagged in RPC | matcher may need flagged | retrieval RPC `active` only |
| H6 no valid_until | temporal columns exist | extract datetime + set field |
| types omit `expired` | DB has it | align types |

### C. Wrong design decisions

| Decision | Why wrong | Mechanism | Alternative | Migration |
| --- | --- | --- | --- | --- |
| Isolated single-message extract | conversation is the product | H1 | conversation-level memory controller | prompt+schema; no DB break |
| One fact per message | humans batch facts | H2 | `memories: []` | none |
| Similarity-as-relevance + 0.0 | injects noise | H9 | relevance floor + optional rerank | tune constants first |
| Evidence arithmetic for corrections | recency of user speech ≠ score | H5 | recency/explicit correction verbs | code |
| Entity tables without writers | over-fragmented | I6 | write entities or drop UI | optional backfill |
| Split extract vs contradict vs chat without shared context | information loss | Part 2 | one write-side LLM with history + deterministic OS | medium |

**Recommended write architecture (from evidence, not aesthetics): C — hybrid semantic controller + deterministic state machine.**  
A (current) fails fidelity. B (one LLM + DB) highest fidelity if controller sees conversation; needs invariants in code. D graph (Graphiti-style) solves temporal/entity but is a larger product than V1 needs. E = C + later graph if entities matter.

Tradeoffs: C preserves audit/RLS; one extra well-contexted call vs many blind calls; local models still struggle with huge schemas — **reduce** task split, **increase** context, **relax** brittle floats.

### D. Code quality (selected)

- Silent failures: extractor, process-candidate L40–41, store insert return.  
- `any` clients throughout store.  
- Magic 0.8, 0.0, 0.5, weights.  
- Admin overuse on every extract.  
- GRANT ALL to `anon` (`20260927000003_grants.sql`) — RLS still required; overly broad.  
- Prompt injection: memories delimited (good); user text in extract prompt (OK).  
- Diagnostic logs print memory content (`retriever.ts` L220–228) — PII in logs.  
- Race: supersede; in-memory lock.  
- Unused `MERGE_MODEL`.

### Semantic evaluation design (needed before more architecture)

Categories: typo, slang, correction, negation, reference, multi-fact, duplicate, contradiction, preference change, temporary, chatter, long context, retrieval, multi-memory, retrieve-nothing.  
Metrics: precision/recall of **active** memories vs gold facts; consolidation accuracy (content contains new detail); contradiction/update accuracy; retrieval P/R and **abstention**; false-memory; unnecessary-memory.  
**Ground truth:** human-written facts/status, not the same model. **Judge:** different model family or exact gold match / entailment with frozen rubric.  
**MVP size:** 40–60 items (current 32 cases are a start) × 2 seeds; **must actually complete**. Freeze UI while this runs.

### Alternative architectures (eval, not implement now)

| Architecture | Semantic | Complexity | Cost | Latency | Local | Remote | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A Improved current (multi-fact + history + floors + merge) | Medium-High | Low | Low | Low | Harder extract | Good | High |
| B Strong LLM controller + deterministic OS | High | Medium | Med | Med | Weak local | Best | High if log JSON decisions |
| C Conversation controller + retrieve/rerank | High | Medium | Med | Med | Rerank local-weak | Good | High |
| D Graph/vector temporal (Graphiti-like) | High temporal | High | High | Med | Possible | Good | High |
| E Hybrid C then D | Highest long-term | Highest | High | High | Poor | Good | High |

**TABLE 6** = above.

Design 1 vs 2 (strong LLM brain vs many specialists): **specialists currently destroy context**. Specialization adds value for **invariants** (RLS, transactions, expiry enforcement), not for “what did they mean.” A strong general model as **one write controller** plus deterministic persistence is the better semantic bet; keep retrieval hybrid **with a relevance gate**, optional rerank later.

### What must stay deterministic vs semantic

**Code:** ownership, RLS, delete, transactions, embedding profile, audit append, status enum, never execute memory-as-instructions.  
**Model:** worthiness, multi-fact split, reference resolution, contradiction/replacement, merge wording, query rewrite, optional rerank.

### Verdict (Part 21)

1. Semantic **write/retrieve** architecture is **fundamentally mismatched** to conversational memory (isolated extract + one fact + similarity dump). Persistence architecture is **not**.  
2. Strong: OS layer, explorer, RLS, audit, provider switch, untrusted-memory prompt.  
3. Over-engineered: unused entity graph, evidence scores, four memory types barely used, dual lexical path that AND-fails.  
4. Under-designed: conversation on write, multi-fact, relevance, temporal fill, eval.  
5. Bugs: H3, H4, H6, H7, types/expired, DeleteButton, MERGE_MODEL, unused google import.  
6. Design mistakes: H1 H2 H8 H9 H5 H11.  
7. Model: only after context; local Zod likely.  
8. Retrieval: H9–H11.  
9. Evaluation: 32 errors; mocks don’t measure meaning.  
10. Stronger model: slang/typos/worthiness.  
11. Not fix: H1 H2 H4 H9 UI history.  
12. Semantic-core **rewrite of extract/decide/retrieve scoring** yes.  
13. **Not** a greenfield app rewrite.  
14. Smallest high-leverage set: (i) pass last N turns + date into extract, `memories[]`, (ii) merge or create-on-elaboration, (iii) correction ≠ evidence `>`, (iv) retrieval min similarity or rerank + active-only RPC, (v) make eval complete.

**Effort (assumptions: one engineer who already knows this repo, no new graph DB):** i–iv **3–7 days**; eval harness reliability **2–4 days**; transactional supersede RPC **0.5–1 day**; entity pipeline **1–2 weeks** if needed. Full Graphiti-class **multi-week**. Hours ≈ 20–60 for the smallest set.

---

## 6. Part 6 — What to do next

### TABLE 8 — Action plan (semantic gain first)

| Priority | Change | Impact | Effort | Risk | Dependencies | Files | Validate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Make eval complete (no silent infra; log errors; don’t default judge to llama3 unless intended) | Makes truth visible | 1–2d | Low | EVAL_USER_ID | `eval/run.ts` | 32 cases finish |
| 2 | Extractor: history + ISO date + `memories: []` | Multi-fact, references, corrections in one bubble | 1–2d | Med | 1 | extractor, chat after, process-candidate | cases B,C,F |
| 3 | Stop silent [] / coerce confidence 0–1 | Stops false abstention | 0.5d | Low | — | extractor, provider | H13 experiment |
| 4 | Consolidate updates content or “elaborate” action | Refinement | 0.5–1d | Med | 2 | store, decision | case E |
| 5 | Replace evidence `>` for explicit corrections; compare replacement not coexistence | Corrections | 1d | Med | 2 | decision-engine | case C,D |
| 6 | Retrieval: active-only RPC, min semantic floor, drop recency/confidence as relevance (or cap) | Noise / retrieve-nothing | 1d | Med | 1 | retriever, SQL | case J, retrieval-02 |
| 7 | Set valid_until for state / relative dates | Temporal | 1d | Med | 2 | extractor schema, store | state-01 |
| 8 | Supersede RPC | Integrity | 0.5d | Low | — | store, migration | concurrency script |
| 9 | Chat: load messages from DB | Product multi-turn | 1d | Low | freeze after core? | ChatClient, chat page | refresh test |
| 10 | Freeze explorer UI polish | Avoid wasted UI | — | — | 1–6 | explorer | — |

**WHAT TO REUSE:** RLS, audit, explorer inspect/edit/delete/confirm, embeddings+pgvector, provider switch, untrusted memory delimiters, eval **cases**.  
**WHAT TO DELETE:** `DeleteButton.tsx`, superseded `src/scripts/eval/*` after `eval/` is canonical, unused one-off scripts when no longer needed.  
**WHAT TO FREEZE:** Explorer visual work, new memory types, entity UI until writers exist.  
**WHAT NOT TO TOUCH:** Auth/RLS policies without review; embedding dimension without reindex.

### Minimum semantic test set (run **before** large redesign)

Tie to causes:

1. Typo fruit — H2/model  
2. Multi-fact four clauses — H2  
3. Two-turn correction apples→bananas — H1 H5 H8  
4. Same-message “honda wait toyota” — H2 H8  
5. Refinement black coffee — H4  
6. Negation “don’t like apples anymore” with seed — H5 H8  
7. Pronoun “he is a golden retriever” with seed Rover — H1  
8. “yeah we still do that” after weekend games — H1  
9. Duplicate “bananas favorite” — consolidate  
10. “hello I’m tired” — worthiness  
11. “visiting Tokyo until next Friday” — H6  
12. Retrieval “what fruit do I like?” with mixed store — H9  
13. “capital of France” with seeds — retrieve-nothing H9  
14. Implicit “actually I hate it” sushi seed — H1  
15. Multi-memory “where do I live and what do I do?” — H9 + chat  

### Migration if moving to hybrid controller

- **Unchanged:** auth, explorer, audit schema, RLS, conversations/messages.  
- **Wrap:** `processMemoryCandidate` to new controller.  
- **Replace:** extractor schema, decision policy, retrieval thresholds.  
- **Delete later:** dead entity UI or implement writers.  
- **DB remain:** memories columns including valid_until, embedding_profile.  
- **Migrations remain applied**; add new RPC; don’t squash prod history.  
- **Reindex** only if embedding model changes.

---

## 7. Part 7 — Open-source architecture research

Licenses below are **as stated by those projects**; not legal advice.

### TABLE 7

| Project | Memory write | Retrieval | Temporal | Architecture | License | Relevant to Memoria failures |
| --- | --- | --- | --- | --- | --- | --- |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | OSS `add()` accepts **message list**; loads last-k session messages (`mem0/memory/main.py` `_add_to_vector_store`, `get_last_messages`); platform v3 docs: single-pass ADD-only, hash dedup | Hybrid semantic + BM25 + entity boost (platform docs) | temporal ranking claimed on platform | Vector + entity linking; managed ≠ OSS | **Apache-2.0** (README) | **Conversation on write** (fixes H1). Do not copy v3 ADD-only if Memoria needs supersede/inspect. |
| [letta-ai/letta](https://github.com/letta-ai/letta) (MemGPT lineage) | Agent **edits** core memory / MemFS files in-loop | Recall vs archival tiers; MemFS often file search not vector | versioned git memory | Agent OS, not a library drop-in | **Apache-2.0** (third-party comparisons + Letta materials) | **In-context memory blocks** beat isolated extract. Heavy runtime — **inspiration**, not dependency for Next.js portfolio. |
| [getzep/graphiti](https://github.com/getzep/graphiti) | Episodes → entities/edges with validity windows | Hybrid vector + BM25 + graph | **bi-temporal facts** (README; arXiv 2501.13956) | Temporal KG | **Apache-2.0** | Directly addresses H6/H8 **if** willing to run Neo4j/FalkorDB. **Inspiration / optional later dependency**, not copy-paste into Postgres V1. |
| [topoteretes/cognee](https://github.com/topoteretes/cognee) | remember/cognify pipelines → graph+vector+relational | Hybrid + graph | via graph edges | Three stores | **Apache-2.0** (GitHub) | Entity/graph **I6**; overkill vs fixing extract context. |

**Reuse labels:**  
- SOURCE-CODE REUSE of those repos into Memoria: **not recommended** (Python stacks, different product). Apache-2.0 **permits** derivative work **if** license terms followed — **UNVERIFIED** for combining with this Next app’s license (this repo’s LICENSE file: **UNVERIFIED** / not inspected in this pass).  
- ARCHITECTURAL INSPIRATION: Mem0 message-list extract; Graphiti validity windows; Letta in-context core memory.  
- REIMPLEMENTABLE IDEA: last-k messages into extract; BM25 not `plainto_tsquery` AND; active-only retrieval; fact invalidation not silent consolidate.  
- DEPENDENCY USAGE: none currently.

**Reinvented solved problems:** conversational extract (Mem0 `messages`), hybrid retrieval with keyword OR (everyone), temporal invalidation (Graphiti), agent-visible memory (Letta). **Not solved for this product by dropping in Mem0:** Next/Supabase/RLS/explorer/audit UX.

---

## 8. Appendix — commands, unavailable tools, UNVERIFIED, evidence index

### Commands / inspections

- Glob / Read / Grep of repository source  
- `git log -1 --format="%ci"` per tracked file  
- PowerShell `Measure-Object -Line` on `*.ts,*.tsx,*.sql`  
- WebSearch / WebFetch: mem0 README/architecture/changelog, Letta MemFS docs, Graphiti GitHub/LICENSE, Cognee GitHub/docs, `mem0/memory/main.py` raw  

**UNAVAILABLE:** knip, ts-prune (not installed; not run). `tsc --noEmit` / eslint **not run** (would not mutate; omitted to avoid env noise). Live Ollama/Gemini **not called**. DB **not queried**.

### Environment variables (names only; no values)

| Name | Category | Referenced | .env.example |
| --- | --- | --- | --- |
| `AI_MODE` | mode | provider.ts | present |
| `REMOTE_PROVIDER` | provider | provider.ts | present |
| `GOOGLE_GENERATIVE_AI_API_KEY` | secret | provider.ts | present |
| `OPENAI_API_KEY` | secret | provider.ts | present |
| `CHAT_MODEL` | model id | chat/route.ts | present |
| `EXTRACTION_MODEL` | model id | extractor.ts | present |
| `CONTRADICTION_MODEL` | model id | decision-engine.ts | present |
| `MERGE_MODEL` | unused | **never read in src** | present |
| `EMBEDDING_MODEL` | model id | embedding.ts | present |
| `NEXT_PUBLIC_SUPABASE_URL` | URL | clients | present |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public JWT | clients | present |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | admin, eval | present |
| `CRON_SECRET` | secret | cron route | present |
| `EVAL_USER_ID` | uuid | eval/run.ts | **absent from example** |
| `GEMINI_JUDGE_MODEL` | model id | eval/run.ts | absent |
| `E2E_TEST_PASSWORD` | secret | e2e-setup | absent |
| `NODE_ENV` | mode | provider, cron | n/a |

Values: **not printed**. Presence of `.env.local`: **UNVERIFIED** (not opened).

### UNVERIFIED / UNKNOWN

- Actual llama3:8b extract behavior on these cases  
- Why 32 eval cases threw (empty results array)  
- Whether `plainto_tsquery` returns empty on every natural query in this DB  
- Live Google vs OpenAI embedding correctness with default model names  
- Production latency/cost  
- Whether `src/proxy.ts` is wired as Next 16 proxy (no `middleware.ts`; Next 16 docs **not re-read** this pass) — **UNVERIFIED** session refresh in prod  
- `memory_enabled` intended product flag  

### Evidence index (primary)

- Extract isolation / one fact / silent fail: `src/lib/memory/extractor.ts`  
- Decision / evidence / contradiction: `src/lib/memory/decision-engine.ts`  
- Consolidate / supersede / expire: `src/lib/memory/store.ts`  
- Retrieve formula: `src/lib/memory/retriever.ts`  
- Chat wiring: `src/app/api/chat/route.ts`  
- RPC flagged + 0.8 / lexical: `supabase/migrations/20260927000005_switch_to_gemini_vector.sql`, `...000002_lexical_search_rpc.sql`  
- Eval NO DATA: `eval/results/1790621765546.md`  
- Eval assistant skip: `eval/run.ts` L144–149  

**DOCUMENTED vs ACTUAL:** `docs/*` and README were not used as proof. Where comments conflict with code (e.g. store L12–15 “Day 3”), **code wins**.
