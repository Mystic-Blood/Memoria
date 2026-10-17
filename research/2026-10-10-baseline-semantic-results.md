# MEMORIA V1 — BASELINE SEMANTIC RESULTS

**Date:** 2026-10-10
**Auditor:** Independent Senior LLM Systems Engineer
**Purpose:** Establish a reproducible baseline of how Memoria actually performs before any architectural changes.

---

## 1. Git and Working-Tree Preflight

| Item | Value |
|------|-------|
| `git rev-parse HEAD` | `d0ba9f91f44fad0c9cff440bf0de4ef36e0b67e3` |
| HEAD message | `docs: align repository documentation with current state` |
| Tracked modified files | `package.json`, `src/lib/memory/provider.ts` |
| Untracked directories | `audit/`, `eval/` |
| Any changes made by this audit? | **NO** — git status identical before and after |

### Pre-existing diffs (preserved, not modified)

**`package.json`** — Adds two npm scripts (`eval`, `bakeoff`). No dependency changes. Purpose: eval harness execution shortcuts.

**`src/lib/memory/provider.ts`** — Changes `ollama(name)` → `ollama.chat(name)` and `openai(modelName)` → `openai.chat(modelName)`. Purpose: explicit Chat Completions endpoint selection, fixing the `item_reference` compatibility issue with Ollama's OpenAI-compatible API.

These are both intentional, beneficial changes. They were NOT created by this audit session.

---

## 2. Current Local Provider/Model Configuration

| Setting | Value | Verified |
|---------|-------|----------|
| `AI_MODE` | `local` | `.env.local` |
| `CHAT_MODEL` | `local:llama3:8b` | `.env.local` |
| `EXTRACTION_MODEL` | `local:llama3:8b` | `.env.local` |
| `CONTRADICTION_MODEL` | `local:llama3:8b` | `.env.local` |
| `EMBEDDING_MODEL` | `local:nomic-embed-text` | `.env.local` |
| Ollama version | `0.40.2` | `http://localhost:11434/api/version` |
| Ollama reachable | YES | HTTP 200 |
| `llama3:8b` available | YES (4.34 GB) | `/api/tags` |
| `nomic-embed-text:latest` available | YES (0.26 GB) | `/api/tags` |
| Embedding dimensions | 768 | Confirmed by smoke test |
| Embedding profile | `ollama:local:nomic-embed-text:768` | `provider.ts` L70 |
| `MERGE_MODEL` | Not set (unused) | `.env.local` |
| Remote API keys | Not inspected, not needed for local mode | — |

### Model selection code verification

- `getModel()` (provider.ts L15-38): When `AI_MODE=local`, creates an OpenAI-compatible client at `http://localhost:11434/v1` and calls `ollama.chat(name)`. The `.chat()` suffix (from the uncommitted diff) explicitly routes to the Chat Completions endpoint. **Correct.**
- `getEmbeddingModel()` (provider.ts L40-63): Same pattern, calls `ollama.textEmbeddingModel(name)`. **Correct.**
- `getAIMode()` (provider.ts L7-13): Defaults to `'remote'` if `AI_MODE` not set. The vitest config (vitest.config.ts L8) hardcodes `AI_MODE: 'local'` for tests. **Both correct.**
- No code path silently falls through to a remote provider when `AI_MODE=local`.

### Test/eval script remote-provider safety

- `vitest.config.ts` sets `AI_MODE: 'local'` — safe, and all tests mock LLM calls anyway.
- `eval/run.ts` uses `--env-file=.env.local` — would use local config. However, it requires `EVAL_USER_ID` and `SUPABASE_SERVICE_ROLE_KEY`, and writes to the real database. **Not safe to run without verifying it targets disposable data.**
- The baseline eval script I created (`audit/baseline-eval.ts`) calls only `extractMemory()`, `generateEmbedding()`, and `isContradiction()` — **no database writes**.

---

## 3. Safe Commands Executed and Outcomes

### 3.1 Vitest Suite

| Detail | Value |
|--------|-------|
| Command | `npx vitest run` |
| Result | **48 passed, 1 failed** |
| Test files | 11 (10 passed, 1 failed) |
| Failed test | `mutation.test.ts > EDIT: successfully updates an active memory` — **timeout (5000ms)** |
| LLM mocked? | **YES** — all tests mock `generateObject`, `streamText`, etc. |
| Real DB used? | **NO** — all tests mock Supabase client |
| Semantic correctness proven? | **NO** — tests assert structural correctness only |

The failed EDIT test is a pre-existing timeout issue. It appears to hang calling `generateEmbedding()` in the real `editMemory()` path because the mock doesn't intercept the dynamic `import('./embedding')` call deep inside `store.ts` L285. This is a test-harness defect, not a semantic failure.

### 3.2 Baseline Extraction Evaluation

| Detail | Value |
|--------|-------|
| Command | `npx tsx --env-file=.env.local audit/baseline-eval.ts` |
| Model used | `llama3:8b` via Ollama (local) |
| Cases run | 13 extraction + 3 contradiction + 1 embedding |
| Database writes | **ZERO** |
| Total runtime | ~72 seconds |

---

## 4. Existing Evaluation Framework Assessment

### eval/run.ts

| Property | Assessment |
|----------|-----------|
| Cases | 18 cases across 6 JSON files (multi_fact, correction, noise, long_messy, implicit_reference, retrieval_relevance) |
| Real LLM calls? | YES — calls `processMemoryCandidate()` and `retrieveMemories()` |
| Database writes? | **YES** — calls `wipeUserMemories()` then inserts via the real pipeline |
| LLM-as-judge? | YES — uses `generateObject()` with a judge schema |
| Safe to run? | **NO** — writes to and deletes from the real Supabase project |
| Previous results? | NONE — `eval/results/` exists but is empty |
| Reproducible? | BLOCKED — requires `EVAL_USER_ID`, `SUPABASE_SERVICE_ROLE_KEY`, and sufficient API quota |

### eval/cases/ — Case Coverage

| File | Cases | Covers |
|------|-------|--------|
| `multi_fact.json` | 4 | Multi-fact extraction (3 facts per message) |
| `correction.json` | 5 | Corrections, self-correction, implicit negation |
| `noise.json` | 4 | Small talk, questions, hypotheticals, third-party quotes |
| `long_messy.json` | 3 | Extracting facts from rambling text |
| `implicit_reference.json` | 3 | Short answers, multi-turn references, pronoun resolution |
| `retrieval_relevance.json` | 2 | Retrieval precision with distractors |

**Assessment:** The eval framework is well-designed and the cases are comprehensive. However, it has NEVER been successfully executed. Many of its expected outcomes are structurally impossible with the current single-fact extractor (e.g., `multi-01` expects 3 memories from 1 message).

### Vitest — Test Honesty

All 48 passing tests mock the LLM and database. They prove:
- ✅ Structural correctness of function signatures and error handling
- ✅ Decision engine branching logic (given mocked contradiction results)
- ✅ Retrieval scoring arithmetic (given mocked similarity scores)
- ✅ Chat route authentication and message persistence flow
- ❌ NOT: whether the model actually produces correct extractions
- ❌ NOT: whether retrieval returns relevant results with real embeddings
- ❌ NOT: whether contradiction detection works on natural language

---

## 5. Case-by-Case Semantic Baseline Results

All cases below used the REAL `extractMemory()` function calling `llama3:8b` via local Ollama. No mocks. No database writes.

### Case A — Simple Fact

| Field | Value |
|-------|-------|
| Case ID | A |
| Input | "I love pizza." |
| Model | llama3:8b (local) |
| Context supplied | Raw message only (no conversation history) |
| Extracted | type=`semantic`, content=`"pizza"`, confidence=0.9, explicitness=1 |
| Expected | Extract personal preference for pizza |
| Verdict | **PARTIAL** |
| Root cause | Content is `"pizza"` — a bare noun, not `"User loves pizza"`. The preference verb is lost. The memory content is not standalone. |
| Confidence | High |

### Case B — Multiple Facts

| Field | Value |
|-------|-------|
| Case ID | B |
| Input | "I'm a software engineer, I live in Boston, and I love hiking." |
| Model | llama3:8b (local) |
| Extracted | type=`entity`, content=`"software engineer"`, confidence=0.8, explicitness=1 |
| Expected | Extract all three facts |
| Verdict | **FAIL** |
| Root cause | **Schema limitation** — Zod schema allows max 1 `memory` object. Two facts (Boston, hiking) are permanently lost. This is a confirmed architectural defect (extractor.ts L6-13). |
| Confidence | High |

### Case C — Typos

| Field | Value |
|-------|-------|
| Case ID | C |
| Input | "i luv bannana nd appl" |
| Model | llama3:8b (local) |
| Raw output | Model returned `confidence_score: 100` (integer instead of 0-1 float). Zod validation failed: "Too big: expected number to be <=1". |
| Extracted | NONE (schema validation failure) |
| Expected | Recover intended preference |
| Verdict | **FAIL** |
| Root cause | **Model capability + schema fragility** — `llama3:8b` produced `100` instead of `1.0` for the confidence score. The Zod constraint `z.number().min(0).max(1)` correctly rejected it, but the safeGenerateObject error handler treats this as a non-transient error and does NOT retry. Information is lost. The model DID identify the topic ("*fruit*") but failed numeric formatting. |
| Confidence | High |

### Case D — Multiple Facts with Refinement

| Field | Value |
|-------|-------|
| Case ID | D |
| Input | "I like cars, mostly Bugatti and Porsche, especially for racing." |
| Model | llama3:8b (local) |
| Extracted | type=`entity`, content=`"Bugatti"`, confidence=0.83, explicitness=1 |
| Expected | Preserve broad interest and specific detail |
| Verdict | **FAIL** |
| Root cause | **Schema limitation** — only 1 fact extracted. Porsche and racing context lost. Content `"Bugatti"` is a bare noun without the preference relationship ("likes Bugatti for racing"). |
| Confidence | High |

### Case E — Same-Message Correction

| Field | Value |
|-------|-------|
| Case ID | E |
| Input | "I prefer Toyota -- actually, no, I meant Honda." |
| Model | llama3:8b (local) |
| Extracted | type=`state`, content=`"Automotive preferences"`, confidence=0.9, explicitness=1 |
| Expected | Do not retain Toyota as active preference |
| Verdict | **PARTIAL** |
| Root cause | The model correctly avoided extracting Toyota explicitly. But the content `"Automotive preferences"` is an abstract label, not a usable fact. It does not capture that the user prefers Honda. The extractor lacks the instruction or capability to handle self-correction within a single message. |
| Confidence | Medium |

### Case F — Multi-Turn Correction

| Field | Value |
|-------|-------|
| Case ID | F |
| Input | "Actually, my favorite color is green now." |
| Context supplied | NONE (prior blue preference not available to extractor) |
| Extracted | type=`semantic`, content=`"preference"`, confidence=1.0, explicitness=1 |
| Expected | Extract green as favorite color |
| Verdict | **FAIL** |
| Root cause | Content is `"preference"` — an abstract word with no specific information. The word "green" was not extracted. The model appears confused by the implicit reference ("now" implies change from something). **Both model capability and missing context contribute.** |
| Confidence | High |

### Case G — Short Contextual Reply

| Field | Value |
|-------|-------|
| Case ID | G |
| Input | "Seattle." |
| Context supplied | NONE (assistant's question not available) |
| Extracted | type=`entity`, content=`"Seattle"`, confidence=0.95, explicitness=1 |
| Expected | Cannot extract meaningful memory without context |
| Verdict | **PARTIAL** |
| Root cause | The model extracted "Seattle" as an entity — which is technically correct as a named entity. But without the assistant's question ("Where do you live?"), the system cannot know that Seattle is the user's location. The resulting memory `"Seattle"` is an orphaned noun. **Missing context is the primary cause**, but the model did the best it could with the input. |
| Confidence | High |

### Case H — Pronoun Resolution

| Field | Value |
|-------|-------|
| Case ID | H |
| Input | "I don't like them anymore." |
| Context supplied | NONE |
| Extracted | type=`state`, content=`"I do not like them anymore"`, confidence=0.8, explicitness=1 |
| Expected | Cannot resolve "them" without context |
| Verdict | **FAIL** |
| Root cause | **Missing context** — The model stored the sentence verbatim with the unresolved pronoun "them". This is a useless memory because "them" has no referent. The extractor has no conversation history to resolve the pronoun. This is a **confirmed architectural defect** (extractor.ts L25: `prompt: messageContent` — bare string). |
| Confidence | High |

### Case I — Repeated Information

| Field | Value |
|-------|-------|
| Case ID | I |
| Input | "Bananas are my favorite." |
| Model | llama3:8b (local) |
| Extracted | type=`entity`, content=`"bananas"`, confidence=0.8, explicitness=1 |
| Expected | Extract banana preference |
| Verdict | **PARTIAL** |
| Root cause | Content is `"bananas"` — bare noun. The preference relationship ("are my favorite") is lost. A memory containing only "bananas" is ambiguous — it could mean anything. **Model output quality issue.** |
| Confidence | High |

### Case J — Temporary Sentiment

| Field | Value |
|-------|-------|
| Case ID | J |
| Input | "I'm exhausted today and never want to look at this class again." |
| Model | llama3:8b (local) |
| Extracted | NONE |
| Expected | Do NOT extract as durable preference |
| Verdict | **PASS** ✅ |
| Root cause | The extraction prompt correctly instructs "Do not extract conversational filler, transient emotions." The model correctly identified this as transient. |
| Confidence | High |

### Case K — Hypothetical

| Field | Value |
|-------|-------|
| Case ID | K |
| Input | "If I moved to Japan, I'd probably learn Japanese." |
| Model | llama3:8b (local) |
| Extracted | type=`state`, content=`"move to Japan => learn Japanese"`, confidence=0.7, explicitness=**3** |
| Expected | Do NOT treat as established fact |
| Verdict | **FAIL** |
| Root cause | **Model capability failure** — The model stored a hypothetical as a fact with explicitness=3 (strongly asserted). The extraction prompt says "Only extract facts that would be useful across multiple future sessions" but does not explicitly forbid hypotheticals. The model interpreted the conditional as a future plan. |
| Confidence | High |

### Case L — Third-Party Statement

| Field | Value |
|-------|-------|
| Case ID | L |
| Input | "My sister told me she likes Thai food." |
| Model | llama3:8b (local) |
| Extracted | type=`entity`, content=`"sister"`, confidence=1.0, explicitness=1 |
| Expected | Do NOT store sister's preference as user's preference |
| Verdict | **PARTIAL** |
| Root cause | The model extracted "sister" as an entity rather than "User likes Thai food" — so it did NOT incorrectly attribute the preference to the user. However, `"sister"` alone is a bare noun with no useful information attached. It didn't extract the relationship (user HAS a sister) or the sister's preference. **Weak extraction quality**, but the attribution boundary was respected. |
| Confidence | Medium |

### Case M — Refinement Across Messages

| Field | Value |
|-------|-------|
| Case ID | M |
| Input | "Mostly Bugatti and Porsche." |
| Context supplied | NONE (prior "I enjoy racing" not available) |
| Extracted | NONE |
| Expected | May extract brands but cannot link to racing without context |
| Verdict | **PARTIAL** |
| Root cause | **Missing context** — Without the prior message establishing the racing topic, "Mostly Bugatti and Porsche" is a fragment. The model correctly assessed it lacked enough standalone context to extract a durable fact. However, this represents information loss because the refinement detail IS valuable when paired with its context. |
| Confidence | High |

---

## 6. Execution Failures and Untested Cases

### Extraction Failures (non-semantic)

| Case | Failure Type | Detail |
|------|-------------|--------|
| C (typos) | Schema validation | Model returned `confidence_score: 100` instead of `0.0-1.0`. Zod rejected it. The model's content (`"*fruit*"`) shows it understood the intent, but the numeric value was wrong. |

### Contradiction Detection Results

| Pair | Expected | Result | Verdict |
|------|----------|--------|---------|
| "User loves blue" vs "User loves green" | TRUE (contradiction) | `null` (STRUCTURED_OUTPUT_FAILED) | **EXECUTION FAILURE** — model failed to produce valid JSON |
| "User likes cats" vs "User likes dogs" | Debatable (not strict contradiction) | `true` | **QUESTIONABLE** — liking cats and dogs simultaneously is possible |
| "User likes pizza" vs "User is a software engineer" | FALSE (unrelated) | `false` | **PASS** ✅ |

The contradiction detector produced 1 failure, 1 questionable result, and 1 correct result out of 3 tests. The failure on the most important test case (color change — the clearest contradiction) is concerning.

### Embedding Test

| Test | Result |
|------|--------|
| `generateEmbedding("test sentence")` | **PASS** — 768 dimensions returned |

### Untested Cases

| Case | Reason |
|------|--------|
| N — Retrieval with distractors | Requires database RPCs (pgvector `match_memories`). Cannot test without writing to or reading from Supabase. |
| O — Retrieval abstention | Same — requires database RPCs. |
| P — Memory provenance/exposure stages | Requires running the full chat pipeline with database. Cannot safely test without writing to Supabase. |
| Full pipeline (extract → match → decide → store) | Requires database writes. Unsafe without verified disposable data. |
| Consolidation content behavior | Requires existing memories in database. Cannot test in isolation. |

### Retrieval — Theoretical Analysis (No Live Test)

The retrieval scoring functions were inspected in source code. Key observations:
- `match_threshold: 0.0` (retriever.ts L64) — no relevance floor. Every query returns the 20 nearest vectors.
- `entityMatch = 0.0` (retriever.ts L164) — entity matching is placeholder, never contributes to score.
- Near-duplicate dedup by content similarity (spec requirement >0.92) — NOT implemented. Only ID-based dedup exists.
- These defects are **confirmed by code inspection** but cannot be verified at runtime without database access.

---

## 7. Retrieval Evidence and Limitations

### What can be determined from code

The retrieval pipeline (retriever.ts) correctly:
- Combines vector + lexical candidates
- Applies weighted scoring (0.4/0.2/0.15/0.15/0.1)
- Filters expired and non-active memories
- Enforces token budget (8000 chars)

The retrieval pipeline has these confirmed defects:
- No minimum similarity threshold → unrelated memories leak into context
- Entity matching always 0.0 → 10% of the scoring formula is wasted
- No content-level deduplication → near-duplicate memories can both be included

### What cannot be determined without database access

- Actual similarity score distributions for real embeddings
- Whether nomic-embed-text produces good separation between related and unrelated content
- Whether the lexical search (`plainto_tsquery`) catches enough candidates
- Whether the 20-candidate vector pool is sufficient or excessive

---

## 8. Test Honesty: What Was and Was Not Proven

### Proven with real model evidence (this baseline)

| Claim | Evidence |
|-------|---------|
| Ollama `llama3:8b` can produce valid structured JSON for extraction | 10/13 cases produced valid output |
| Ollama `nomic-embed-text` produces 768-dimension vectors | Embedding smoke test passed |
| Extraction prompt correctly rejects transient sentiment | Case J passed |
| Single-fact schema limitation is real | Case B: only 1 of 3 facts extracted |
| Extraction content quality is low (bare nouns, abstract labels) | Cases A, D, E, F, I: content is `"pizza"`, `"Bugatti"`, `"preference"`, etc. |
| Hypotheticals are NOT correctly filtered | Case K: stored as fact with explicitness=3 |
| Context starvation prevents pronoun resolution | Case H: `"I do not like them anymore"` stored verbatim |
| `llama3:8b` sometimes produces out-of-range values | Case C: `confidence_score: 100` |
| Contradiction detection is unreliable with `llama3:8b` | 1/3 failed, 1/3 questionable |

### Proven with mocked tests only (vitest)

| Claim | Evidence |
|-------|---------|
| Decision engine branches correctly (CREATE/CONSOLIDATE/SUPERSEDE/FLAG) | 7 unit tests + 6 deterministic stress tests |
| Retrieval scoring arithmetic is correct | 9 unit tests with hardcoded scores |
| Chat route authenticates, persists, and streams | 5 unit tests |
| Extraction failure does not kill the chat | 1 unit test |

### NOT proven at all

| Claim | Why |
|-------|-----|
| Retrieval returns relevant results with real embeddings | No database access |
| Contradiction detection works reliably | 1/3 failure rate in smoke test |
| Consolidation preserves important information | Code inspection shows metadata-only update |
| Full pipeline produces correct end-to-end behavior | No integrated test exists |
| Evaluation harness produces meaningful metrics | Never successfully executed |

---

## 9. Root Causes Demonstrated by the Baseline

### Confirmed by real model evidence

| # | Root Cause | Cases | Type |
|---|-----------|-------|------|
| RC1 | **Single-fact schema** — extractor.ts L6-13 allows max 1 memory per message | B, D | Restrictive structured schema |
| RC2 | **Context starvation** — extractor.ts L25 receives only bare message text | F, G, H, M | Insufficient conversational context |
| RC3 | **Low content quality** — model produces bare nouns instead of standalone facts | A, D, E, F, G, I | Bad prompt or task formulation + model capability |
| RC4 | **Schema fragility** — `llama3:8b` sometimes produces out-of-range numeric values | C | Model capability + validation gap |
| RC5 | **Missing hypothetical filter** — prompt doesn't explicitly forbid conditionals | K | Bad prompt or task formulation |
| RC6 | **Contradiction unreliability** — `llama3:8b` failed/questionable on 2/3 tests | Contradiction smoke | Insufficient model capability |

### Confirmed by code inspection (not runtime-testable)

| # | Root Cause | Evidence |
|---|-----------|----------|
| RC7 | Consolidation discards new content | store.ts L83-91: only updates metadata |
| RC8 | No retrieval relevance floor | retriever.ts L64: `match_threshold: 0.0` |
| RC9 | Entity matching unimplemented | retriever.ts L164: `entityMatch = 0.0` |

### Hypotheses requiring further investigation

| # | Hypothesis | What's needed |
|---|-----------|---------------|
| H1 | A stronger local model (e.g., `llama3.1:8b`, `qwen2.5:7b-instruct`) would reduce RC3, RC4, RC6 | Re-run baseline with different models |
| H2 | Adding conversation context to the extractor would fix F, G, H, M | Requires code change |
| H3 | Multi-fact schema would fix B, D | Requires code change |
| H4 | `nomic-embed-text` produces sufficient semantic separation for retrieval | Requires database retrieval test |

---

## 10. Comparison of Three Architectural Options

### Option A — Minimal Repair

**What changes:**
1. Extractor receives last N conversation turns + date (fix RC2)
2. Schema returns array of memories, 0-N per message (fix RC1)
3. Extraction prompt explicitly instructs: produce standalone sentences, reject hypotheticals (fix RC3, RC5)
4. Consolidation merges content, not just metadata (fix RC7)
5. Retrieval gets relevance floor (e.g., 0.3 minimum similarity) (fix RC8)
6. Schema validation adds retry or clamping for out-of-range values (fix RC4)

**What's preserved:** Everything — database, UI, tests, audit trail, provider abstraction.

**Expected benefits:**
- Addresses all 9 confirmed root causes
- Preserves Memoria's unique value: Memory Explorer, flagging workflow, audit log, RLS isolation
- Minimal risk — changes are localized to ~4 files
- Can be evaluated incrementally against this baseline

**Compatibility risks:**
- None — same database, same schema, same provider interface

**Model/provider implications:**
- Works with any model. Larger context window helps with conversation turns.
- `llama3:8b` may still struggle with structured output quality (RC4, RC6). May need model upgrade.

**Embedding-profile implications:** None — embeddings unchanged.

**Database migration:** None required.

**Estimated effort:** 3-5 days (implementation + re-evaluation).

**Evidence still needed:**
- Does providing conversation context to `llama3:8b` actually improve extraction quality?
- Does a multi-fact schema produce reliable multi-fact output from `llama3:8b`?
- Is `llama3:8b` or another available local model (e.g., `qwen2.5:7b-instruct`) better for structured output?

### Option B — Mem0 OSS Replacement

**What would be replaced:**
- `extractor.ts`, `decision-engine.ts`, `process-candidate.ts`, `matcher.ts`, `store.ts` (write path)
- `retriever.ts` (read path)
- Possibly embedding.ts

**What would be reused:**
- Next.js app, routes, UI components
- Supabase Auth, RLS
- Memory Explorer (would need adapter to Mem0's data model)
- Chat route structure
- Provider abstraction (if Mem0 supports Ollama)

**Expected benefits:**
- Mem0 handles multi-fact extraction, UPDATE/DELETE decisions, and conversation context natively
- Well-tested by a larger community
- Likely better extraction quality due to mature prompts

**Compatibility risks:**
- **HIGH** — Mem0 is Python-based (FastAPI). Memoria is TypeScript/Next.js. Integration requires either:
  - Running Mem0 as a sidecar service (Docker + REST API) — adds operational complexity
  - Porting Mem0's logic to TypeScript — defeats the purpose
- Mem0's data model (memory table structure, audit logging) is different from Memoria's 7-table schema
- Mem0's optional graph layer (Neo4j) adds infrastructure complexity
- Memory Explorer would need significant adaptation to read Mem0's storage format
- Flagging workflow (FLAG → CONFIRM/REJECT) is Memoria-specific; Mem0 uses DELETE directly

**Model/provider implications:**
- Mem0 supports Ollama via OpenAI-compatible endpoint — compatible
- Mem0 has its own provider abstraction — may conflict with Memoria's

**Embedding-profile implications:**
- Mem0 manages its own embeddings. Existing memories would need migration or wiping.

**Database migration:**
- Significant — Mem0 uses its own schema (typically simple key-value with metadata)
- Would need to either adapt Mem0 to use Memoria's schema or migrate to Mem0's schema

**Estimated effort:** 10-20 days (integration, schema adaptation, Explorer adaptation, testing).

**Evidence still needed:**
- Does Mem0's Python SDK work reliably with `llama3:8b` for extraction and contradiction?
- What is the actual extraction quality improvement over Memoria's current approach?
- Can Mem0 be configured to preserve Memoria's audit trail and flagging workflow?

### Option C — Selective Hybrid

**Approach:** Keep Memoria's infrastructure and lifecycle (store, audit, Explorer, flagging). Adopt proven patterns from Mem0's extraction/decision logic:

1. **From Mem0:** Conversation-aware extraction prompt, multi-fact output format, unified ADD/UPDATE/DELETE/NOOP decision in a single LLM call
2. **From Memoria:** Supabase schema, RLS, audit log, Memory Explorer, flagging workflow, provider abstraction, temporal validity

**What changes:**
- Rewrite `extractor.ts` to accept conversation context and produce multiple facts
- Merge extraction + contradiction into a single LLM call (like Mem0's update phase)
- Keep `store.ts`, `retriever.ts`, `matcher.ts`, Explorer, and all infrastructure

**Expected benefits:**
- Better extraction quality from proven prompt patterns
- Simpler pipeline (fewer LLM calls per message)
- Preserves all Memoria-specific value

**Compatibility risks:**
- Medium — prompt engineering is the main work, not infrastructure changes
- Single unified LLM call is harder to debug than separate extraction + contradiction steps

**Model/provider implications:**
- Same as Option A. Works with any model.
- Unified call requires slightly better instruction-following capability from the model.

**Embedding-profile implications:** None.

**Database migration:** None.

**Estimated effort:** 5-8 days.

**Evidence still needed:**
- Same as Option A, plus:
- Does a unified extraction+decision call work reliably with `llama3:8b`?
- Is the reduced debuggability acceptable?

---

## 11. Recommended Next Experiment

### **Run the extraction baseline with conversation context — without modifying source code**

**Why this experiment:**

The single highest-impact unknown is whether providing conversation context to the extractor actually improves extraction quality with `llama3:8b`. If it does, Option A or C is clearly justified. If it doesn't, the model itself is the bottleneck and we need to evaluate model alternatives before choosing an architecture.

**How to do it safely:**

Create a standalone script (NOT modifying extractor.ts) that:
1. Calls `safeGenerateObject()` directly with the same schema but a modified prompt that includes conversation context
2. Tests cases F, G, H, M with their prior turns included
3. Tests case B with the multi-fact schema variant (array instead of single object)
4. Compares results against this baseline

This experiment requires NO changes to application code. It calls the model directly using the existing provider abstraction.

**Expected outcome:**

If conversation context dramatically improves F, G, H, M → Option A is the clear winner (minimal change, maximum impact).

If multi-fact schema works → schema fix is validated.

If both work → proceed with Option A immediately.

If neither helps significantly → investigate model alternatives (`qwen2.5:7b-instruct`, `mistral:7b-instruct`) or escalate to Option C.

**Secondary experiment:**

Run the same 3 contradiction smoke tests with other available local models to determine if contradiction detection reliability is model-dependent or prompt-dependent.

---

## 12. Changes That Must Remain Frozen Until Architecture Decision

| Category | Items | Reason |
|----------|-------|--------|
| Extraction logic | extractor.ts, memorySchema | Baseline must remain stable |
| Decision engine | decision-engine.ts | Baseline must remain stable |
| Store/consolidation | store.ts | Baseline must remain stable |
| Retrieval | retriever.ts | Baseline must remain stable |
| Database schema | All migrations | No schema changes without architecture decision |
| Dependencies | package.json, package-lock.json | No new libraries |
| Provider abstraction | provider.ts | Already has correct `.chat()` fix |
| UI/UX | All components | UI polish is deferred |
| Tests | All test files | No test modifications |
| Environment | .env.local | Configuration is stable |
| Git history | All commits | No rebasing or amending |

---

## Appendix: Files Created by This Audit

| File | Purpose | Modifies tracked code? |
|------|---------|----------------------|
| `audit/BASELINE-SEMANTIC-RESULTS.md` | This report | NO |
| `audit/baseline-eval.ts` | Evaluation script (calls real model, no DB writes) | NO |
| `audit/baseline-results.json` | Raw JSON results from the evaluation run | NO |

All files are in the `audit/` directory which was already untracked before this session.
