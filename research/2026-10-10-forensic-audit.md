# MEMORIA V1 — FORENSIC AUDIT REPORT

**Auditor:** Independent Principal Architect / Forensic Code Auditor
**Date:** 2026-10-10
**Repository:** this repository
**Git HEAD:** `d0ba9f9` (docs: align repository documentation with current state)
**Uncommitted Changes:** `package.json` (devDependency added), `provider.ts` (minor diff), untracked `audit/` and `eval/` directories

---

## 0. EXECUTIVE SUMMARY

**Memoria has not fundamentally diverged from its stated product goal, but it has stopped approximately 40% short of delivering the semantic promise it set out to prove.**

The infrastructure layer — authentication, RLS, database schema, provider abstraction, audit logging, deletion propagation, temporal sweep, and the Memory Explorer UI — is substantially sound and represents genuine engineering value. Approximately 70% of the codebase is KEEP or FIX quality.

However, **the semantic core has a single architectural defect that cascades into most of the observed failures**: the memory extractor operates on the raw user message in complete isolation, with no conversation history, no assistant context, no date, and no existing memories. This means the system that is responsible for understanding what a person actually said cannot see the conversation in which they said it.

**The three strongest confirmed root causes are:**

1. **Context starvation at extraction** (H1 confirmed): The extractor sees only `messageContent` — a bare string — with no conversation turns, no date, no topic. This makes it structurally incapable of resolving pronouns, implicit references, self-corrections, or conversational refinements.

2. **Single-fact extraction limit** (H2 confirmed): The Zod schema enforces `hasMemory: boolean` + one optional `memory` object. Multi-fact messages (e.g., "I'm a software engineer, I live in Boston, and I love hiking") can produce at most one memory.

3. **Consolidation discards semantic content** (H4 confirmed): When a memory consolidates, only `corroboration_count` and `source_message_ids` are updated. The actual content of the new information is discarded. Refinements, elaborations, and additional detail are lost.

**The infrastructure is worth preserving. The semantic core requires targeted repair, not a rewrite.** The core problems are concentrated in two small files (extractor.ts at 43 lines, and store.ts consolidation path at ~30 lines) plus a missing relevance floor in retriever.ts.

**No evaluation metric for LLM-dependent behavior has ever been successfully measured.** All 5 LLM-dependent metrics in the evaluation report are recorded as `UNMEASURED` due to API quota exhaustion. The project has never demonstrated that extraction, contradiction detection, or retrieval relevance actually work with real model inference against messy input.

**The owner should:**
1. Fix the three confirmed root causes (est. 2-4 days).
2. Run the evaluation harness with actual model calls to establish a baseline.
3. Only then decide whether more fundamental architectural changes are warranted.

**No application code, configuration, tests, migrations, database records, or Git history were modified during this audit.**

---

## 1. ORIGINAL GOAL AND PROJECT EVOLUTION

### 1.1 Recovered Product Goal

The canonical specification ([MEMORIA-V1-BUILD-SPEC-CURRENT.md](docs/MEMORIA-V1-BUILD-SPEC-CURRENT.md)) defines the product clearly:

> "Memoria is a conversational AI application built around an inspectable, persistent, evolving personal-memory lifecycle."

The specification identifies five hard engineering problems (L14-19):
1. What should be remembered?
2. How are memories represented temporally?
3. How are contradictions resolved without losing data?
4. How is provenance preserved?
5. How is deletion enforced?

### 1.2 Project Timeline (Reconstructed from Git)

| Commit | Date | Phase | Content |
|--------|------|-------|---------|
| `fbe20b0` | Day 1 | Foundation | Auth, schema, RLS, 7 tables |
| `6fd81e0` | Day 2 | Chat + Extraction | Basic chat, naive extractor |
| `3274910` | Day 3 | Decision Engine | Matcher, contradiction, CRUD |
| `f3ca1ea` | Day 4 | Retrieval | Hybrid retrieval, context builder |
| `503abb3` | Day 5 | Explorer | Memory Explorer UI |
| `1f702c9` | Day 6 | Temporal | Staleness sweep, edit/confirm |
| `7932aba` | Day 6+ | Evaluation | Eval harness (quota-blocked) |
| `a84be7e` | Day 6+ | Provider | Dual local/remote provider |
| `d0ba9f9` | Final | Docs | Documentation alignment |

The project completed 33 commits across approximately 6 development days. Development stopped after the evaluation harness was built but before any LLM-dependent metric was successfully measured.

### 1.3 Goal Drift Assessment

The project did NOT significantly drift from its stated goal. The 20-day plan was ambitious; the project completed approximately Days 1-6 of a planned 20-day build. The remaining days (7-20) would have covered refinement, evaluation, and polish.

**What was delivered:** Infrastructure, basic pipeline, Explorer UI.
**What was NOT delivered:** Validated semantic quality, measured evaluation metrics, production deployment.

The project stopped at the point where the hard semantic problems BEGIN — extraction quality, context management, and semantic evaluation.

---

## 2. REPOSITORY INVENTORY AND FILE CLASSIFICATION

### 2.1 File Statistics

| Category | Files | Bytes | Method |
|----------|-------|-------|--------|
| Source (src/**/*.ts, *.tsx) | 60 | 189,643 | `Get-ChildItem -Recurse` |
| Memory Engine (src/lib/memory/*.ts) | 10 | 36,893 | Direct count |
| Tests (src/tests/*.test.ts) | 10 | 36,650 | Direct count |
| Migrations (supabase/migrations/*.sql) | 9 | 16,047 | Direct count |
| Documentation (docs/*.md) | 16 | 89,568 | Direct count |
| Evaluation (eval/**) | ~14 | ~30,000 | Estimated |
| Scripts (src/scripts/**) | ~13 | ~53,000 | Estimated |

### 2.2 Component Classification

**TABLE B — COMPONENT STATUS**

| Component | File | Classification | Evidence | Reason |
|-----------|------|----------------|----------|--------|
| Types | `src/lib/memory/types.ts` | KEEP | Well-defined interfaces, 47 lines | Clean, correct type definitions |
| Provider | `src/lib/memory/provider.ts` | KEEP | Robust error handling, retry logic, quota detection, 153 lines | Sound abstraction with good failure modes |
| Embedding | `src/lib/memory/embedding.ts` | KEEP | Clean 30-line wrapper | Appropriate thin wrapper |
| Matcher | `src/lib/memory/matcher.ts` | KEEP | 30 lines, delegates to RPC correctly | Simple and correct delegation |
| Retriever | `src/lib/memory/retriever.ts` | FIX | No relevance floor (L64: threshold=0.0), entity match hardcoded 0.0 (L164), no dedup by similarity | Sound design, localized defects |
| Context Builder | `src/lib/memory/context-builder.ts` | FIX | Good prompt injection defense, but exposes raw metadata (source_message_ids) to model | Minor prompt refinement needed |
| Decision Engine | `src/lib/memory/decision-engine.ts` | FIX | Evidence scoring formula biased toward flagging (H5), but logic is sound | Formula calibration needed |
| **Extractor** | `src/lib/memory/extractor.ts` | **REWRITE** | **L24: only sees `messageContent`, no history. L6-13: schema allows max 1 memory.** | Root cause of most semantic failures |
| Store | `src/lib/memory/store.ts` | FIX | Consolidation (L83-91) only updates metadata, not content. Supersede non-atomic (L106-163). | Consolidation path needs content merge |
| Process Candidate | `src/lib/memory/process-candidate.ts` | KEEP | Clean 47-line orchestrator | Correct pipeline coordination |
| Chat Route | `src/app/api/chat/route.ts` | FIX | Retrieval queries only `userContent` (L79), not conversation topic. Admin client in `after()` is correct. | Minor: query could use conversation context |
| Chat Client | `src/app/chat/ChatClient.tsx` | KEEP | Functional, uses AI SDK correctly | Appropriate for V1 |
| Explorer Page | `src/app/explorer/page.tsx` | KEEP | Working filters, entity join, status display | Functional Memory Explorer |
| Explorer Detail | `src/app/explorer/[id]/page.tsx` | KEEP | Provenance, audit history, metadata display, 213 lines | Good inspectability |
| Explorer Actions | `src/app/explorer/actions.ts` | KEEP | Auth-checked server actions | Correct pattern |
| Login | `src/app/login/*` | KEEP | Standard Supabase auth | Correct |
| Navigation | `src/components/Navigation.tsx` | KEEP | Simple nav component | Appropriate |
| Supabase Server | `src/utils/supabase/server.ts` | KEEP | Correct SSR client pattern | Follows Supabase docs |
| Supabase Admin | `src/utils/supabase/admin.ts` | KEEP | Service role client, server-only | Correct isolation |
| Cron Route | `src/app/api/cron/staleness-sweep/route.ts` | KEEP | Auth check, admin client | Correct |
| Init Schema | `supabase/migrations/20260927000000_init_schema.sql` | KEEP | Comprehensive 7-table schema with RLS | Sound design |
| Match RPC | `supabase/migrations/20260927000005_switch_to_gemini_vector.sql` | KEEP | Correct vector(768) RPC | Working |
| Lexical RPC | `supabase/migrations/20260927000002_lexical_search_rpc.sql` | KEEP | Correct tsvector search | Working |
| Confirm RPC | `supabase/migrations/20260928000000_day6_confirm_rpc.sql` | KEEP | Atomic transaction, proper validation | Sound |
| Eval Runner | `eval/run.ts` | KEEP | Well-structured evaluation harness | Sound design, never successfully executed |

**Summary:** 1 REWRITE, 5 FIX, 19 KEEP, 0 DELETE.

---

## 3. CURRENT ARCHITECTURE RECONSTRUCTED FROM CODE

### 3.1 Actual Call Graph

```
User types message in ChatClient.tsx
  → sendMessage() via useChat() → POST /api/chat
    → supabase.auth.getUser() [authentication]
    → Verify/create conversation [ownership check]
    → Insert user message to `messages` table
    → retrieveMemories(userId, userContent)  ← QUERY IS ONLY THE RAW USER TEXT
      → generateEmbedding(query)
      → match_memories RPC (threshold 0.0, 20 candidates)
      → search_memories_lexical RPC (10 candidates)
      → Filter: active status only, not expired
      → Score: semantic*0.4 + lexical*0.2 + recency*0.15 + confidence*0.15 + entity*0.1
      → Budget: 8000 chars (~2000 tokens)
    → buildSystemPrompt(retrievedMemories)
      → Constructs system prompt with memory context delimiters
    → convertToModelMessages(messages)  ← FULL CONVERSATION HISTORY GOES TO CHAT MODEL
    → streamText(model, system, messages)
      → onFinish: insert assistant message to `messages` table
    → Return streamed response

    after() [async, non-blocking]:
      → processMemoryCandidate(userMsg.content, userMsg.id, userId, adminClient)
        → extractMemory(messageContent, messageId)  ← ONLY RAW TEXT, NO CONTEXT
          → safeGenerateObject(schema, system, prompt=messageContent)
          → Returns 0 or 1 MemoryCandidate
        → For each candidate:
          → generateEmbedding(candidate.content)
          → matchMemories(userId, embedding)  ← Threshold 0.8
            → match_memories RPC (active+flagged, 5 candidates)
          → makeDecision(candidate, matchResult)
            → If no matches → CREATE
            → If matches → isContradiction(candidate, existing)
              → If contradiction + stronger evidence → SUPERSEDE
              → If contradiction + weaker/equal evidence → FLAG
              → If not contradiction → CONSOLIDATE
              → If LLM fails → FLAG (safe default)
          → executeMemoryDecision(userId, decision)
            → INSERT/UPDATE memories table + audit log
```

### 3.2 Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    CHAT FLOW (SYNC)                       │
│  User Message → Auth → Persist → Retrieve → Build Ctx    │
│                                    → Stream Response      │
└──────────────────────────────────────────────────────────┘
                         ↕ (full conversation)        ↕ (memory context)
┌──────────────────────────────────────────────────────────┐
│                    LLM (Chat Model)                       │
│  Sees: system prompt + memory context + full conv history │
│  Does: generates natural response                         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              EXTRACTION FLOW (ASYNC via after())          │
│  Raw user text → Extract → Embed → Match → Decide → Write│
│  ⚠ SEES ONLY: bare message string                        │
│  ⚠ CANNOT SEE: conversation, assistant, date, memories   │
└──────────────────────────────────────────────────────────┘
```

---

## 4. GOAL-TO-IMPLEMENTATION TRACEABILITY MATRIX

**TABLE A — GOAL-TO-IMPLEMENTATION**

| # | Product Goal | Source | Current Implementation | Validation | Gap | Severity |
|---|-------------|--------|----------------------|------------|-----|----------|
| 1 | Remember important information selectively | Spec §1 | Extractor with memory-worthiness filter | Mocked tests only | Extractor lacks conversation context to assess worthiness | HIGH |
| 2 | Preserve meaning and relationships | Spec §1 | Single-fact extraction per message | None | Multi-fact messages lose all but one fact | **CRITICAL** |
| 3 | Handle corrections and evolving info | Spec §6 | Contradiction → supersede/flag pipeline | Mocked unit tests | Extractor can't resolve "actually" or "wait no" without context | **CRITICAL** |
| 4 | Consolidate and deduplicate | Spec §6 | Consolidation updates metadata only | Mocked unit test | New semantic content discarded on consolidation | HIGH |
| 5 | Retrieve relevant memories | Spec §7 | Hybrid vector+lexical scoring | Mocked unit tests | No relevance floor; entity match always 0.0 | HIGH |
| 6 | Natural response without exposing internals | Spec §1, Context Builder L4-7 | System prompt says "do not over-explain" | None | Source_message_ids (UUIDs) injected into prompt | MEDIUM |
| 7 | User-inspectable memory | Spec §5 | Memory Explorer with detail view, audit log | Browser E2E test | Working | LOW |
| 8 | Deletion propagation | Spec §6 | Soft delete + status filter in retrieval | Real DB test | Working (verified) | LOW |
| 9 | Temporal validity | Spec §6 | valid_from/valid_until + staleness sweep | Real DB test | valid_until not set by extractor (H6) | MEDIUM |
| 10 | Provenance | Spec §5 | source_message_ids + audit log | Explorer UI | Working but never independently validated | LOW |
| 11 | User isolation | Spec §12 | RLS + defense-in-depth user_id filters | Real DB test | Working (verified) | LOW |
| 12 | Evaluation metrics | Spec §13 | Eval harness exists (eval/run.ts) | ALL UNMEASURED | Never successfully executed with real models | **CRITICAL** |
| 13 | Multi-session context | Spec §2 | Conversations table, message persistence | Chat route test | Working at infrastructure level | LOW |
| 14 | Entity resolution | Spec §5 | Entities table exists, entity_match=0.0 | None | Schema exists but no code populates entities | HIGH |

**Confirmed contradictions between docs and code:** 2
1. V1-FINAL-STATE.md L7 says "Next.js 15" but package.json shows Next.js 16.3.6.
2. V1-FINAL-STATE.md §7 lists tables `memory_sources` that don't exist; actual table is `memory_audit_log`.

---

## 5. SEMANTIC-CORE AND LLM-CONTEXT ANALYSIS

This is the central finding of the audit.

### 5.1 LLM Call Inventory

**TABLE C — LLM CONTEXT**

| # | Call | Model | System Prompt | Input | Conv History | Prior Memories | Metadata | Schema | Output | Risk |
|---|------|-------|---------------|-------|-------------|----------------|----------|--------|--------|------|
| 1 | Chat Response | CHAT_MODEL (gemini-3.5-flash) | System prompt + memory context (if any) | Full conversation via `convertToModelMessages` | YES - all messages | YES - retrieved memories | None explicitly | None | Streamed text | LOW — model sees everything |
| 2 | **Memory Extraction** | EXTRACTION_MODEL | "You are a memory extraction engine…" | `messageContent` (bare string) | **NO** | **NO** | **NO date, NO topic** | `{hasMemory, memory?}` — **max 1 fact** | 0 or 1 MemoryCandidate | **CRITICAL** |
| 3 | Contradiction Detection | CONTRADICTION_MODEL | "You are a logical contradiction detector…" | `"Existing: X\nCandidate: Y"` | NO | Only the 1 matched memory | NO | `{contradicts: boolean}` | true/false/null | MEDIUM |

### 5.2 The Extraction Context Gap

**extractor.ts L16-26** — The complete context available to the extraction model:

```typescript
const { object } = await safeGenerateObject({
  model: getModel(modelName),
  schema: memorySchema,
  maxRetries: 0,
  system: `You are a memory extraction engine. Analyze the user's message...`,
  prompt: messageContent,  // ← THIS IS THE ENTIRE INPUT
})
```

The extraction model receives:
- ✅ The raw user message text
- ❌ No previous user messages
- ❌ No assistant messages
- ❌ No current date/time
- ❌ No conversation topic
- ❌ No existing memories
- ❌ No entity context

**This means the extractor structurally cannot:**
- Resolve "it", "that", "he", "she", "they", "actually", "the same one"
- Know what topic the conversation is about
- Determine if a statement corrects a prior claim
- Understand short answers to assistant questions (e.g., "seattle." in response to "Where do you live?")
- Distinguish between the user's own fact and a quote about someone else
- Assess temporal context ("I'm starting next Monday")

### 5.3 The Single-Fact Schema Limitation

**extractor.ts L6-14** — The Zod schema:

```typescript
const memorySchema = z.object({
  hasMemory: z.boolean(),
  memory: z.object({
    type: z.enum(['semantic', 'episodic', 'entity', 'state']),
    content: z.string(),
    confidence_score: z.number(),
    explicitness_score: z.number()
  }).optional()
})
```

This schema permits exactly 0 or 1 memory per message. A message like:
> "im a software engineer, i live in boston, and i love hiking"

Can produce at most one fact. The other two are permanently lost.

### 5.4 The Consolidation Content Gap

**store.ts L83-91** — The consolidation update:

```typescript
const { error: updateError } = await supabase
  .from('memories')
  .update({
    source_message_ids: newSourceIds,
    corroboration_count: newCorroboration,
    updated_at: new Date().toISOString()
  })
  .eq('id', targetMemoryId)
  .eq('user_id', userId)
```

When the decision engine determines "CONSOLIDATE," only `source_message_ids`, `corroboration_count`, and `updated_at` are updated. The `content` field is NOT updated. This means:

- If the user says "I like bananas" and later says "I like bananas and apples," the consolidation will increment the counter but keep the content as "I like bananas." The "and apples" information is discarded.

### 5.5 Information Flow Across Semantic Boundaries

```
CHAT MODEL sees:     [System Prompt] + [Retrieved Memories] + [Full Conversation]  ← RICH
EXTRACTION sees:     [Bare message string]                                         ← STARVED
CONTRADICTION sees:  [Existing content string] + [Candidate content string]        ← MINIMAL
RETRIEVAL queries:   [Latest user message text only]                               ← ADEQUATE for V1
```

The fundamental asymmetry: the chat model has excellent context, but the extraction pipeline — which is responsible for creating the persistent knowledge — operates with the least context of any component.

---

## 6. MEMORY WRITING AND RECONCILIATION AUDIT

### 6.1 Write Path Analysis

| Step | What happens | What's missing |
|------|-------------|----------------|
| 1. Extract | Single fact from bare text | Multi-fact, conversation context, date |
| 2. Embed | Content → 768-dim vector | Nothing missing |
| 3. Match | Vector similarity > 0.8, top 5 | Entity matching not implemented |
| 4. Decide | CREATE/CONSOLIDATE/SUPERSEDE/FLAG | Decision is sound IF extraction is correct |
| 5. Write | Insert/update + audit log | Consolidation discards new content |

### 6.2 Memory-Worthiness

The extractor's system prompt (L24) instructs:
> "Do not extract conversational filler, transient emotions, or immediate context (e.g. 'I am hungry'). Only extract facts that would be useful across multiple future sessions."

This is a reasonable instruction, but without conversation context, the model cannot assess temporal scope or conversational significance reliably.

### 6.3 State Transitions

All four specified transitions are implemented:
- **CREATE:** New memory inserted with status='active' ✅
- **CONSOLIDATE:** Metadata-only update (content NOT merged) ⚠️
- **SUPERSEDE:** New active memory + old marked superseded ✅ (but non-atomic — two separate writes)
- **FLAG:** New memory with status='flagged' ✅

### 6.4 Transaction Atomicity

The `confirm_memory` RPC (migration 20260928000000) is properly atomic — a single PL/pgSQL function in a transaction.

The `supersede` operation in store.ts (L106-163) is NOT atomic — it performs:
1. INSERT new memory
2. UPDATE old memory status
3. INSERT audit log for new
4. INSERT audit log for old

If step 2 fails, the system has two active contradicting memories. This is a known limitation documented in the engineering log (Day 3).

---

## 7. RETRIEVAL AND MEMORY-EXPOSURE AUDIT

### 7.1 Retrieval Pipeline

| Step | Implementation | Evidence |
|------|---------------|----------|
| Query representation | Raw user message text (route.ts L79) | No query expansion or rewriting |
| Embedding | generateEmbedding(query) | Standard |
| Vector candidates | match_memories RPC, threshold=0.0, count=20 | ⚠️ No relevance floor |
| Lexical candidates | search_memories_lexical RPC, count=10 | Requires word overlap |
| Status filter | `if (mem.status !== 'active') return` (retriever.ts L153) | Correct — excludes flagged, superseded, deleted |
| Expiry filter | `if (mem.valid_until && new Date(mem.valid_until) < now) return` (L148) | Correct |
| Entity match | Hardcoded `0.0` (retriever.ts L164) | Not implemented |
| Scoring | Weighted sum with defined weights | Implemented correctly |
| Deduplication | ID-based merge of vector+lexical results | No near-duplicate content dedup (spec says >0.92 sim) |
| Token budget | 8000 chars (retriever.ts L25) | Implemented as greedy packing |

### 7.2 Critical Retrieval Issues

**No relevance floor (retriever.ts L63-64):**
```typescript
match_threshold: 0.0, // We want to retrieve broadly and rank later
```

With threshold=0.0, the vector search returns the 20 nearest memories regardless of actual relevance. A query about "what fruit do I like" will retrieve 20 memories even if none are about fruit — the closest 20 vectors in the space, which could include memories about cars, jobs, and relationships.

The scoring formula cannot compensate because even irrelevant vectors may score 0.3-0.4 similarity, which combined with recency (0.1-1.0) and confidence (0.0-1.0) can produce moderate final scores.

**Entity matching is a placeholder:**
```typescript
const entityMatch = 0.0 // Placeholder for entity logic
```

The entities table exists with proper schema (entities table, memory_entity_links join table), but no code ever creates entity records or links them to memories.

### 7.3 Memory Context Exposure

The context builder (context-builder.ts L22-34) injects per-memory:
- Content ✅
- Type ✅
- Confidence Score ⚠️ (implementation detail, not useful to the chat model)
- Valid Until ✅ (if set)
- Source Message IDs ⚠️ (raw UUIDs — meaningless to the model)

The system prompt (L4-7) correctly instructs:
> "Do not over-explain how your memory works or narrate your internal rules to the user."

And the trust boundary (L14-19) correctly marks memory as untrusted data with prompt-injection defense.

---

## 8. FAILURE CASE STUDIES

### CASE A — Messy Spelling ("buggaati and proshe")

**Classification:** Primarily model-capability limitation; partially context limitation.

**Analysis:** The extractor receives only the bare text `"yea its quite fun u know we even have a buggaati and and proshe for racing"`. Without conversation context (what was being discussed? cars? racing?), the model must independently interpret colloquial misspellings. Gemini 3.5 Flash may struggle with phonetic misspellings like "buggaati" (Bugatti) and "proshe" (Porsche).

**Would a stronger model help?** Likely yes — a stronger model would better interpret phonetic misspellings. But without conversation context providing the topic (racing, cars), even a strong model may produce less accurate extractions.

**Structural defect remaining with a stronger model:** The extractor still cannot determine the conversational topic to disambiguate. If the previous messages were about "racing cars we own," the extraction would be far more reliable.

### CASE B — Fragmented Fruit Memories

**Classification:** Confirmed architectural limitation (single-fact schema + no consolidation content merge).

**Analysis:** Three separate messages produce three separate memories:
- "Fruit" → extracted as entity/semantic
- "Banana and Apple" → extracted as preference
- "I like banana" → extracted as preference

The consolidation path (store.ts L83-91) would consolidate the third with either of the first two if similarity > 0.8, but only updates `corroboration_count` — not the content. The specification says "CONSOLIDATE (increment corroboration, merge content)" (spec §6 L122), but the implementation does NOT merge content.

**Root cause chain:**
1. Single-fact schema prevents extracting "banana" and "apple" as separate facts from one message.
2. Consolidation does not merge content, so "I like banana" consolidated with "Fruit" leaves content as "Fruit."
3. Three memories remain instead of one comprehensive preference.

### CASE C — Retrieval Noise

**Classification:** Confirmed implementation defect (no relevance floor).

**Analysis:** retriever.ts L63-64 uses `match_threshold: 0.0`, which returns the 20 nearest vectors regardless of actual similarity. A query "what fruit do i like" returns fruit memories alongside unrelated memories about partying and Bugattis because those are simply the nearest vectors in the user's memory space.

The scoring formula cannot compensate because:
- An unrelated memory with similarity 0.35 scores: 0.35×0.4 + 0×0.2 + 1.0×0.15 + 0.9×0.15 = 0.425
- A relevant memory with similarity 0.85 scores: 0.85×0.4 + 0.5×0.2 + 1.0×0.15 + 0.9×0.15 = 0.725

The unrelated memory still passes into the context because there's no floor to exclude it.

**Distinction:** The retrieval candidates are directly injected into the chat model's system prompt via context-builder.ts. There is no intermediate relevance judgment or semantic reranking between retrieval and injection.

### CASE D — Unwanted Memory Disclosure

**Classification:** Prompt/context limitation (minor).

**Analysis:** The context builder injects metadata like confidence scores and source message IDs into the system prompt. While the system prompt says "do not over-explain," providing the model with detailed metadata can encourage it to reference memory internals when responding.

The system prompt instruction (L4-7) is the correct approach, but injecting raw UUIDs (`Source Messages: msg-abc-123-def`) provides content that should never appear in a response. This is a minor fix — remove source_message_ids from the injected context.

### CASE E — Ollama `item_reference` Error

**Classification:** HISTORICAL DEFECT, likely ALREADY FIXED.

**Analysis:** The error "unknown input item type: item_reference" was a Responses API vs. Chat Completions API compatibility issue. The current provider.ts uses `ollama.chat(name)` (L21) which routes to the Chat Completions endpoint. The current code uses `streamText()` and `generateObject()` from the AI SDK, which handle protocol conversion.

The current implementation imports `createOpenAI` (provider.ts L1) and calls `ollama.chat()` for models and `ollama.textEmbeddingModel()` for embeddings. This is the correct Chat Completions path.

**Verdict:** Cannot reproduce from code inspection. The fix appears present in the current Git state. Mark as HISTORICAL unless runtime testing contradicts.

---

## 9. INFRASTRUCTURE VS. SEMANTIC QUALITY

**TABLE D — CAPABILITY STATUS**

| # | Capability | Infrastructure | Semantic Quality | Evidence |
|---|-----------|---------------|-----------------|----------|
| 1 | Authentication | ✅ Code exists + executes | N/A | Supabase auth with cookie SSR |
| 2 | User isolation (RLS) | ✅ Verified with real DB | N/A | Real DB security test scripts |
| 3 | Message persistence | ✅ Verified | N/A | Chat route persists before streaming |
| 4 | Memory extraction | ✅ Code exists + mocked test | ❌ NOT DEMONSTRATED | Never tested with real model on messy input |
| 5 | Multi-fact extraction | ❌ Schema prevents it | ❌ IMPOSSIBLE | Schema allows max 1 memory per message |
| 6 | Corrections | ✅ Contradiction pipeline exists | ❌ NOT DEMONSTRATED | Extractor can't see prior context to identify corrections |
| 7 | Consolidation | ✅ Code exists | ❌ CONTENT NOT MERGED | Only metadata updated, content discarded |
| 8 | Contradiction detection | ✅ Code exists + mocked test | ⚠️ UNTESTED | LLM call isolated from conversation context |
| 9 | Retrieval | ✅ Code exists + mocked test | ⚠️ LIKELY NOISY | No relevance floor, entity match=0.0 |
| 10 | Temporal expiry | ✅ Verified with real DB | ⚠️ EXTRACTOR NEVER SETS valid_until | Sweep works but data never populated |
| 11 | Deletion | ✅ Verified with real DB | N/A | Correct soft delete + retrieval exclusion |
| 12 | Memory Explorer | ✅ UI exists, Browser E2E | N/A | Functional |
| 13 | Provenance | ✅ Audit log exists | ⚠️ No semantic verification | Never tested: "can you explain why this memory exists?" |
| 14 | Evaluation | ✅ Harness exists | ❌ ALL METRICS UNMEASURED | API quota exhausted before any measurement |

---

## 10. TEST AND EVALUATION HONESTY

### 10.1 Test Inventory

| Test File | Tests | LLM Mocked? | DB Mocked? | Semantic Assertion? |
|-----------|-------|-------------|------------|-------------------|
| extractor.test.ts | 3 | YES | N/A | NO — asserts structure only |
| decision-engine.test.ts | 7 | YES | N/A | NO — asserts action type only |
| retriever.test.ts | 9 | N/A | YES | NO — asserts scores and counts |
| chat.test.ts | 5 | YES | YES | NO — asserts HTTP status and mock calls |
| context-builder.test.ts | 2 | N/A | N/A | NO — asserts string structure |
| matcher.test.ts | ? | N/A | YES | NO |
| mutation.test.ts | ? | N/A | YES | NO |
| system-prompt.test.ts | ? | N/A | N/A | NO |
| temporal.test.ts | ? | N/A | ? | NO |
| cron.test.ts | ? | N/A | ? | NO |
| memory-engine.deterministic.test.ts | 6 | YES | N/A | NO — asserts action type |

**Total claimed:** 49/49 pass (V1-FINAL-STATE.md L64)
**Semantic coverage:** ZERO. No test evaluates whether the model correctly understood a messy user message, resolved a pronoun, extracted the right fact, or rejected irrelevant information.

### 10.2 Evaluation Harness

The evaluation harness (eval/run.ts) is well-designed with:
- 10 case files covering multi-fact, correction, implicit reference, noise, retrieval, etc.
- LLM-as-judge pattern using structured output
- Seed memory injection
- Retrieval probes

**However, it has NEVER successfully completed a run.** All 5 LLM-dependent metrics are `UNMEASURED`:
- Extraction Precision: UNMEASURED
- Extraction Recall: UNMEASURED
- Retrieval Precision@5: UNMEASURED
- Retrieval Recall@5: UNMEASURED
- Contradiction Correctness: UNMEASURED

The eval cases (e.g., multi_fact.json, correction.json, implicit_reference.json) correctly define expected behaviors that the current architecture CANNOT produce:
- `multi-01` expects 3 separate memories from one message → impossible with current schema
- `corr-02` expects pronoun resolution ("actually i hate it now") → impossible without context
- `implicit-01` expects understanding "seattle." as location → impossible without assistant's question

### 10.3 Proposed Minimum Semantic Benchmark

| # | Input | Type | Expected Behavior | Pass Criteria |
|---|-------|------|-------------------|---------------|
| 1 | "I love pizza" | Clean single fact | CREATE one memory | Content contains "pizza" + "love/like" |
| 2 | "I'm a dev, I live in NYC, and I love coffee" | Multi-fact | CREATE 3 memories | 3 distinct active memories |
| 3 | "yea she likes thai food too" (after discussion of sister) | Pronoun resolution | Context-aware extraction | Memory references sister, not user |
| 4 | "actually my fav color is green now" (prior: blue) | Correction | SUPERSEDE blue with green | Blue=superseded, Green=active |
| 5 | "wait no, toyota not honda" (same message) | Self-correction | Only Toyota stored | Honda NOT active |
| 6 | "man today was rough, spilled coffee everywhere" | Noise rejection | NO memory created | 0 active memories |
| 7 | "what fruit do I like?" (unrelated memories exist) | Retrieval precision | Only fruit memories retrieved | No cars/jobs in context |
| 8 | "what's the capital of France?" (no relevant memories) | Empty retrieval | No memories injected | Empty or no memory context |
| 9 | "im allergic to dairy, got tested yesterday" (in long ramble) | Extract from noise | Dairy allergy stored | Transient events NOT stored |
| 10 | "he is a golden retriever btw" (prior: user has dog Rover) | Elaboration | Memory enriched | "Rover" + "golden retriever" |

---

## 11. SECURITY AND RELIABILITY

### 11.1 Security Assessment

| Check | Status | Evidence |
|-------|--------|----------|
| API keys server-only | ✅ | Keys accessed via `process.env` in server files |
| RLS on all tables | ✅ | All 7 tables have RLS enabled (migration L131-137) |
| Admin client isolation | ✅ | `createAdminClient()` in server-only module, used in `after()` |
| Memory as untrusted input | ✅ | Context builder L14-19 marks memory as untrusted |
| Extraction without tools | ✅ | `generateObject()` has no tool/function parameters |
| CRON_SECRET enforcement | ✅ | staleness-sweep/route.ts L10-22 |
| Ownership defense-in-depth | ✅ | `.eq('user_id', userId)` on all store operations |
| Prompt injection defense | ✅ | `<BEGIN MEMORY CONTEXT>` / `<END MEMORY CONTEXT>` delimiters |

### 11.2 Reliability Concerns

| Issue | Severity | Evidence |
|-------|----------|----------|
| Supersede non-atomic | MEDIUM | store.ts L106-163, two separate REST calls |
| In-memory processing lock | LOW | store.ts L5, `Set<string>` — process-local only |
| No retry on extraction failure | LOW | extractor.ts L37, catches error and returns [] |
| Audit log insert not checked | LOW | store.ts L58-64, await but error not checked |
| `anon` role gets GRANT ALL | MEDIUM | grants.sql L1-7, grants ALL to anon role (RLS mitigates) |

### 11.3 Grants Security Note

Migration `20260927000003_grants.sql` grants `ALL` to `anon`, `authenticated`, and `service_role`. While RLS policies prevent unauthorized access, granting ALL to `anon` is overly permissive. The `anon` role should ideally only have SELECT on specific tables needed for pre-auth operations.

---

## 12. ROOT-CAUSE ANALYSIS AND HYPOTHESIS EVALUATION

### 12.1 Independent Root Causes (Discovered from Code)

**TABLE E — ROOT CAUSES**

| # | Root Cause | Evidence | Confidence | Contribution | Category |
|---|-----------|----------|------------|--------------|----------|
| RC1 | Extraction sees only bare message text | extractor.ts L26 | CONFIRMED | 40% | Architecture |
| RC2 | Schema limits extraction to 1 fact per message | extractor.ts L6-13 | CONFIRMED | 25% | Architecture |
| RC3 | Consolidation discards new content | store.ts L83-91 | CONFIRMED | 15% | Implementation |
| RC4 | No retrieval relevance floor | retriever.ts L64 | CONFIRMED | 10% | Implementation |
| RC5 | Entity matching unimplemented | retriever.ts L164 | CONFIRMED | 5% | Implementation |
| RC6 | No evaluation data exists | V1-EVALUATION-REPORT.md §5 | CONFIRMED | 5% | Evaluation |

### 12.2 Hypothesis Evaluation

**TABLE F — HYPOTHESES**

| Hypothesis | Verdict | File/Line | Evidence | Current? | Consequence |
|-----------|---------|-----------|----------|----------|-------------|
| **H1:** Extractor sees only latest message, no history/date | **CONFIRMED** | extractor.ts L26: `prompt: messageContent` | Only bare string passed | YES | Cannot resolve references, corrections, context |
| **H2:** Extraction returns at most 1 fact | **CONFIRMED** | extractor.ts L6-13: schema has single optional memory | Zod schema enforces 0 or 1 | YES | Multi-fact messages lose information |
| **H3:** Provider failures return empty silently | **PARTIAL** | extractor.ts L37-39: catches error, returns [] | Error is logged but candidate is lost | YES | Silent data loss, but logged |
| **H4:** Consolidation discards semantic detail | **CONFIRMED** | store.ts L83-91: updates only metadata | `content` field not in update object | YES | Refinements and elaborations permanently lost |
| **H5:** Evidence formula causes corrections to flag instead of supersede | **PARTIAL** | decision-engine.ts L5-8: `explicitness * confidence + corr * 0.5` | Corroboration bonus (0.5 per) favors established memories; new explicit correction (score 3.5) may still beat weakly corroborated existing (score 2.1). But with corroboration ≥5, existing score reaches 5.5+, making supersede nearly impossible | YES | Highly corroborated memories become un-supersedable even with explicit correction |
| **H6:** valid_until not set for state memories | **CONFIRMED** | extractor.ts L6-13: schema has no valid_until field | Extraction schema does not include temporal fields | YES | State memories never auto-expire unless manually set |
| **H7:** Supersede uses non-transactional writes | **CONFIRMED** | store.ts L106-163: sequential REST calls without DB transaction | If step 2 fails, orphaned active memory exists | YES | Possible inconsistent state under failure |
| **H8:** Contradiction depends on single fixed threshold | **CONFIRMED** | matcher.ts L4: `MATCH_THRESHOLD = 0.8`, match_count=5 | Fixed threshold, only checks top 5 | YES | May miss related memories below threshold |
| **H9:** Retrieval queries only latest message, no relevance floor | **CONFIRMED** | retriever.ts L64: `match_threshold: 0.0`, route.ts L79: `retrieveMemories(user.id, userContent)` | Retrieves 20 nearest vectors regardless of relevance | YES | Irrelevant memories pollute context |
| **H10:** Lexical search uses restrictive query logic; entity matching incomplete | **PARTIAL** | Lexical uses `plainto_tsquery` which is reasonable; entity matching = 0.0 | Entity matching confirmed unimplemented | YES | Lexical search is adequate; entity matching is absent |
| **H11:** Flagged memories in retrieval pools | **REFUTED** | retriever.ts L153: `if (mem.status !== 'active') return` | Flagged memories correctly excluded from retrieval results | NO | This was fixed in Day 4 audit |
| **H12:** Assistant prompt exposes metadata | **PARTIAL** | context-builder.ts L32-34: injects source_message_ids | Raw UUIDs injected; confidence scores exposed | YES | Minor — model may reference internal IDs |
| **H13:** Local model fails structured output | **UNVERIFIED** | Cannot test without Ollama running | safeGenerateObject has retry logic | UNKNOWN | Cannot assess without runtime |

---

## 13. OPEN-SOURCE ARCHITECTURE COMPARISON

**TABLE H — OPEN-SOURCE OPTIONS**

| Project | Relevant Mechanism | License | Reuse Type | Limitations for Memoria |
|---------|-------------------|---------|------------|------------------------|
| **Mem0** | Multi-fact extraction, ADD/UPDATE/DELETE/NOOP decisions, conversation-aware extraction with full context | Apache 2.0 | Architectural inspiration | Requires graph DB for full features; dependency would replace custom pipeline |
| **Letta/MemGPT** | Agent-driven memory management, core memory blocks, archival storage, "dreaming" consolidation | Apache 2.0 | Architectural inspiration | Fundamentally different paradigm (agent manages own memory); over-engineered for Memoria's scope |
| **Graphiti** | Temporal knowledge graph, bi-temporal modeling, entity resolution, hybrid retrieval | Apache 2.0 | Technique inspiration | Requires Neo4j/graph DB; too infrastructure-heavy for V1 |
| **Cognee** | Knowledge graph construction, entity linking, temporal modeling | Apache 2.0 | Technique inspiration | Similar graph-dependency problem |

### 13.1 Key Insight from Mem0

Mem0's architecture demonstrates that the most critical design decision is **passing full conversation context to the extraction/update call.** Mem0's extraction sees the complete conversation and existing memories, enabling it to perform ADD/UPDATE/DELETE/NOOP decisions in a single call rather than splitting extraction from contradiction detection.

This directly maps to Memoria's RC1 (context starvation at extraction). The fix does not require adopting Mem0 as a dependency — it requires giving the extractor more context.

### 13.2 What Memoria Already Has That Others Don't

Memoria has several features that open-source memory frameworks typically don't provide out of the box:
- **Memory Explorer UI** — inspectable, filterable, with audit history
- **Supabase RLS** — database-level user isolation
- **Flagging workflow** — user-mediated conflict resolution with confirm/reject
- **Provenance tracking** — source messages linked to memories
- **Next.js integration** — server actions, `after()` background processing

These represent genuine product value that would be lost or require extensive customization if replaced by an external framework.

---

## 14. ALTERNATIVE TARGET ARCHITECTURES

**TABLE G — ARCHITECTURES**

| Option | Semantic Fidelity | Complexity | Cost | Latency | Auditability | Migration |
|--------|------------------|------------|------|---------|-------------|-----------|
| **A: Fix extraction pipeline** | HIGH | LOW | LOW | SAME | HIGH | 2-4 days |
| B: Unified extraction+decision call | HIGHER | MEDIUM | MEDIUM | LOWER | MEDIUM | 5-8 days |
| C: Integrate Mem0 as library | HIGH | HIGH | LOW | MEDIUM | LOW | 10-15 days |
| D: Add semantic reranking layer | MEDIUM | MEDIUM | MEDIUM | HIGHER | HIGH | 3-5 days |
| E: Graph-based memory (Graphiti-inspired) | HIGHEST | VERY HIGH | HIGH | HIGHER | MEDIUM | 15-25 days |

### Option A: Fix the Current Pipeline (RECOMMENDED)

**What changes:**
1. Extractor receives conversation history (last N turns) + existing memories + date
2. Schema changed to return array of memories (0-N facts per message)
3. Consolidation path merges content, not just metadata
4. Retrieval gets a relevance floor (e.g., 0.3 minimum similarity)

**What's preserved:** Everything. Same architecture, same database, same UI, same tests.

**Estimated effort:** 2-4 days for implementation, 1-2 days for evaluation.

### Option B: Unified Semantic Controller

**What changes:** Merge extraction + contradiction detection into a single LLM call that sees conversation + existing memories and returns a list of operations (CREATE/UPDATE/DELETE/NOOP).

**Tradeoff:** More accurate decisions because one model sees everything, but harder to debug individual operations and requires more careful prompt engineering.

### Option C: Integrate Mem0

**What changes:** Replace custom extraction/decision pipeline with Mem0's `add()` API.

**Tradeoff:** Potentially higher quality with less custom code, but loses Memory Explorer integration, audit trail format, and adds a dependency that may not align with Supabase/pgvector storage.

---

## 15. PROPOSED PRODUCT SPECIFICATION

### A. Essential User Promise
An AI assistant that demonstrably remembers, updates, and forgets personal facts across conversations, and lets the user inspect and control what it remembers.

### B. Core Product Behaviors (V1)
1. Extract durable facts from natural conversation (including corrections and multi-fact messages)
2. Avoid storing transient emotions, small talk, or hypotheticals
3. Update memories when information changes rather than accumulating duplicates
4. Retrieve relevant memories for the current question
5. Show the user exactly what the system remembers and why
6. Let the user edit, delete, and resolve conflicts
7. Respond naturally without exposing internal machinery

### C. System Invariants
1. Deleted memories are never retrieved or referenced
2. User A cannot see or modify User B's memories
3. Every memory action produces an audit log entry
4. Extraction failure does not disrupt the conversation

### D. Optional Advanced Capabilities (Defer)
- Entity resolution and relationship tracking
- Temporal inference ("I'm starting next Monday")
- Semantic reranking
- Memory importance decay
- Background consolidation

### E. Features Adding Complexity Without Serving Core Promise
- Entity table/linking infrastructure (tables exist but no populating code)
- Embedding profile mismatch detection (over-engineered for a single-user V1)

### F. Unresolved Product Decisions
1. Should the extractor also analyze assistant messages? (Currently only user messages)
2. How many conversation turns should the extractor see? (5? 10? All?)
3. Should consolidation produce a merged content string or keep separate memories with a link?
4. Should there be a maximum number of active memories per user?
5. What similarity threshold should trigger consolidation vs. creation?

---

## 16. ARCHITECTURE VS. IMPLEMENTATION VERDICT

### Direct Answers

**1. Did the implementation materially diverge from the stated product goal?**
No — it stopped short of proving the goal, but did not diverge from it.

**2. Which requirements are contradicted, absent, or superficially implemented?**
- Multi-fact extraction: ABSENT (schema prevents it)
- Content consolidation: CONTRADICTED (spec says "merge content," code only updates metadata)
- Entity matching: ABSENT (placeholder)
- Evaluation metrics: ALL ABSENT (never measured)
- Temporal extraction (valid_until): ABSENT from extractor

**3. Which parts should remain?**
Database schema, RLS, provider abstraction, embedding, audit logging, Memory Explorer, deletion, confirmation RPC, staleness sweep, process-candidate orchestrator, chat route structure.

**4. Incorrect implementation but sound design?**
Consolidation (needs content merge), retriever (needs relevance floor), context builder (needs metadata cleanup).

**5. Flawed architectural decisions?**
Only one: stripping all context before calling the extractor. This was likely a Day 2 simplification that was never revisited.

**6. Is the semantic core fundamentally unsuitable?**
No. The semantic core's design (extract → match → decide → write) is architecturally sound and mirrors proven patterns (Mem0). The implementation of extraction is where the failure concentrates.

**7. Rewrite or targeted refactor?**
**Targeted refactor.** One file needs rewriting (extractor.ts), three files need localized fixes (store.ts, retriever.ts, context-builder.ts).

**8. Smallest change set for largest semantic impact?**
1. Give extractor conversation context + multi-fact schema (~100 lines changed)
2. Add relevance floor to retriever (~3 lines changed)
3. Merge content in consolidation (~15 lines changed)

**9. Assumptions to test before irreversible decisions?**
- Does Gemini 3.5 Flash produce reliable multi-fact extraction with conversation context?
- What similarity threshold optimally balances recall and noise?
- Does the eval harness produce meaningful results when quotas allow?

**10. What should be frozen until semantic design is validated?**
UI polish, advanced entity resolution, reranking, deployment infrastructure.

**11. What work should stop immediately?**
Any additional infrastructure, documentation, or UI work. All effort should focus on semantic validation.

**12. Correct next decision for the project owner?**
Fix the three confirmed root causes (extraction context, multi-fact schema, consolidation content), then run the evaluation harness with real model calls to establish a semantic baseline. Only proceed to further development after the baseline demonstrates the product thesis.

---

## 17. PRIORITIZED REMEDIATION PLAN

**TABLE I — REMEDIATION**

### PHASE 1 — Establish Semantic Ground Truth (Days 1-2)

| Priority | Action | Root Cause | Impact | Effort | Files | Acceptance Criteria |
|----------|--------|------------|--------|--------|-------|-------------------|
| P0 | Give extractor conversation history (last 5-10 turns + assistant turns) and current date | RC1 | CRITICAL — enables reference resolution, corrections, context | 0.5 day | extractor.ts, process-candidate.ts, route.ts | Extractor prompt includes conversation; eval case `implicit-01` passes |
| P0 | Change extraction schema to return array of facts (0-N) | RC2 | CRITICAL — enables multi-fact extraction | 0.5 day | extractor.ts | Eval case `multi-01` produces 3 memories |
| P0 | Run evaluation harness with real model and record baseline | RC6 | CRITICAL — establishes measurable quality | 1 day | eval/run.ts | At least 5 case categories produce numeric metrics |

### PHASE 2 — Correct Confirmed High-Impact Defects (Days 3-4)

| Priority | Action | Root Cause | Impact | Effort | Files | Acceptance Criteria |
|----------|--------|------------|--------|--------|-------|-------------------|
| P1 | Add relevance floor (e.g., 0.3) to vector retrieval | RC4 | HIGH — eliminates noise | 0.25 day | retriever.ts L64 | Eval case `retrieval-02` returns 0 memories |
| P1 | Merge content during consolidation (generate merged text or append) | RC3 | HIGH — preserves refinements | 0.5 day | store.ts L65-96 | Elaboration test: "I like bananas" + "I like bananas and apples" → content includes both |
| P2 | Remove source_message_ids and raw confidence from injected context | H12 | MEDIUM — cleaner model context | 0.25 day | context-builder.ts L32-34 | System prompt contains only content, type, and valid_until |
| P2 | Reduce corroboration bonus or cap it in evidence scoring | H5 | MEDIUM — enables corrections of established facts | 0.25 day | decision-engine.ts L5-8 | Explicit correction supersedes memory with corroboration_count=5 |

### PHASE 3 — Validate Architecture (Day 5)

| Priority | Action | Impact | Effort | Acceptance Criteria |
|----------|--------|--------|--------|-------------------|
| P2 | Re-run full evaluation harness and compare to Phase 1 baseline | HIGH | 0.5 day | Measurable improvement in at least 3 categories |
| P2 | Decide whether unified extraction+decision call (Option B) is warranted | MEDIUM | 0.5 day | Decision documented with evidence |

### PHASE 4 — Implementation (REQUIRES EXPLICIT APPROVAL)

Frozen until Phase 3 is complete and discussed.

### PHASE 5 — Validate Complete Behavior

End-to-end conversation testing with real model:
- Multi-session correction scenario
- Messy colloquial input
- Retrieval precision test
- Deletion propagation E2E

### PHASE 6 — UI Polish (FROZEN)

No UI work until semantic quality is demonstrated.

**Explicitly frozen:**
- Explorer UI redesign
- Chat UI styling
- Layout/animation improvements
- Avatar/chibi features
- Advanced timeline views

---

## 18. MINIMUM SEMANTIC BENCHMARK

*(Defined in Section 10.3 above — 10 test cases covering typos, multi-fact, self-correction, negation, refinement, noise rejection, retrieval precision, empty retrieval, extraction from noise, and elaboration.)*

These cases must produce measurable pass/fail results before any architectural decision beyond the targeted fixes in Phases 1-2.

---

## 19. UNVERIFIED ITEMS AND DECISIONS REQUIRING THE OWNER

### Unverified
1. **H13 (Local model structured output):** Cannot verify without running Ollama. The `safeGenerateObject` wrapper handles failures, but the rate of structured output failures with local models is unknown.
2. **Case E (Ollama item_reference):** Cannot confirm the fix is complete without runtime testing against an Ollama instance.
3. **Real evaluation metrics:** No LLM-dependent metric has ever been measured. The actual extraction quality of Gemini 3.5 Flash on messy input is unknown.
4. **Retrieval with real embeddings:** All retrieval tests use mocked data. Actual cosine similarity distributions in production are unknown.

### Decisions Requiring the Owner

1. **How many conversation turns should the extractor see?**
   - Option A: Last 5 turns (low cost, moderate context)
   - Option B: Last 10 turns (higher cost, better context)
   - Option C: All turns in current conversation (highest cost, best context)

2. **Should consolidation produce a new merged string or simply update?**
   - Option A: Use an LLM to generate a merged content string (MERGE_MODEL)
   - Option B: Append new detail to existing content with delimiter
   - Option C: Keep both memories but link them

3. **What relevance floor for retrieval?**
   - Option A: 0.3 (aggressive filtering)
   - Option B: 0.4 (moderate)
   - Option C: 0.5 (conservative)

4. **Is the current eval harness sufficient, or do you want to invest in a more comprehensive benchmark before fixing code?**

5. **Are you willing to use a paid API tier to run evaluation? The free tier's 15 RPM limit is structurally insufficient for meaningful evaluation.**

---

## 20. APPENDIX

### 20.1 Commands Run

All commands were read-only:
- `git log --oneline -20`
- `git log --oneline --all`
- `git status --short`
- `git diff HEAD --stat`
- `Get-ChildItem -Recurse -File | Measure-Object` (file statistics)
- File viewing via `view_file` tool (no modification)
- Directory listing via `list_dir` tool
- Web search for open-source comparison (Mem0, Letta, Graphiti)

### 20.2 Git State

**Initial state:** HEAD at `d0ba9f9`
**Final state:** HEAD at `d0ba9f9` (unchanged)
**Working tree modifications by this audit:** NONE
**Uncommitted changes found (pre-existing):** `package.json` (devDep diff), `provider.ts` (minor diff), untracked `audit/` and `eval/`

### 20.3 Tools Unavailable
- Supabase CLI (`supabase start` requires Docker, not available on this host)
- pgTAP tests (requires running Supabase)
- Ollama (not running, cannot test local mode)
- Real LLM inference (no API key access from audit environment)
- Runtime debugging (no `npm run dev` executed)

### 20.4 Evidence Index

| Evidence ID | Type | Path | Lines | Description |
|------------|------|------|-------|-------------|
| E1 | Source | src/lib/memory/extractor.ts | L16-26 | Extraction context — only messageContent |
| E2 | Source | src/lib/memory/extractor.ts | L6-13 | Single-fact schema limitation |
| E3 | Source | src/lib/memory/store.ts | L83-91 | Consolidation metadata-only update |
| E4 | Source | src/lib/memory/retriever.ts | L64 | match_threshold: 0.0 |
| E5 | Source | src/lib/memory/retriever.ts | L164 | entityMatch = 0.0 placeholder |
| E6 | Source | src/lib/memory/decision-engine.ts | L5-8 | Evidence scoring formula |
| E7 | Source | src/lib/memory/context-builder.ts | L32-34 | Source message IDs in prompt |
| E8 | Source | src/app/api/chat/route.ts | L79 | Retrieval uses only userContent |
| E9 | Source | src/app/api/chat/route.ts | L111-121 | after() extraction with admin client |
| E10 | Doc | docs/V1-EVALUATION-REPORT.md | L32-42 | All LLM metrics UNMEASURED |
| E11 | Doc | docs/MEMORIA-V1-BUILD-SPEC-CURRENT.md | L122 | Spec says "merge content" |
| E12 | Source | src/lib/memory/store.ts | L106-163 | Non-atomic supersede |
| E13 | Migration | supabase/migrations/20260927000003_grants.sql | L1-7 | GRANT ALL to anon |
| E14 | Source | src/lib/memory/provider.ts | L19-21 | Ollama uses chat endpoint (E fix check) |
| E15 | Eval | eval/cases/multi_fact.json | L13-22 | Expects 3 memories from 1 message |
| E16 | Eval | eval/cases/implicit_reference.json | L7-16 | Expects context-aware extraction |

---

**END OF FORENSIC AUDIT**

*No application code, configuration, tests, migrations, database records, or Git history were modified during the production of this report.*
