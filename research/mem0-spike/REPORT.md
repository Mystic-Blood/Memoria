# MEMORIA: MEM0 PROOF-OF-FIT REPORT

**Date:** 2026-10-10
**Verdict:** **ADAPT (Retain Custom Engine)**

---

## 1. Executive Verdict

Mem0 is an impressive SDK with full local capability, but it solves the wrong problem for Memoria. 

Mem0 is designed as a **black-box memory layer** — you call `.add()`, and it handles extraction, conflict resolution, deduplication, and vector storage invisibly. 
Memoria is designed as a **transparent, controllable memory lifecycle** — its primary product value lies in the Memory Explorer, explicit state transitions (CREATE, SUPERSEDE, FLAG), user confirmations, and provenance tracking.

Adopting Mem0 would require gutting Memoria's defining UX features or building massive, brittle adapter layers around Mem0's internal database operations. Given that our prior `BASELINE-SEMANTIC-RESULTS.md` experiment proved we can match Mem0's extraction quality simply by updating our system prompt and schema, the economically and technically sound choice is to **retain and adapt our custom engine**.

---

## 2. What Was Implemented and Tested

An isolated spike environment (`audit/mem0-spike/`) was created using:
- `mem0ai` TypeScript SDK (`v3.3.1`)
- Local Ollama `llama3:8b` via `ollama` peer dependency
- `nomic-embed-text` for embeddings
- Isolated in-memory vector store (`provider: 'memory'`) to protect production Supabase data.

A test harness (`test.ts`) executed 8 diverse semantic scenarios, running each 3 times to measure stochastic variability. No production code or dependencies were modified.

---

## 3. Test Results (Ollama `llama3:8b`)

| Case | Scenario | Mem0 Result | Verdict |
|------|----------|-------------|---------|
| 1 | Simple preference ("I love pizza") | `"User loves pizza"` | ✅ PASS |
| 2 | Multiple facts (Job, City, Hobby) | Extracted 3 distinct memories (e.g. `"User lives in Boston"`) | ✅ PASS |
| 3 | Typos ("i luv bannana nd appl") | `"User loves banana and apple"` | ✅ PASS |
| 4 | Self-correction ("Toyota... no Honda")| `"User prefers Honda"` | ✅ PASS |
| 5 | Conversational Context ("Seattle") | `"User lives in Seattle"` | ✅ PASS |
| 6 | Pronoun Resolution ("I don't like them anymore" after apples) | Extracted both `"User used to enjoy eating apples"` and `"User no longer enjoys eating apples"` | ⚠️ PARTIAL |
| 7 | Hypothetical ("If I moved to Japan...")| Extracted `"User would learn Japanese if they moved to Japan"` | ❌ FAIL |
| 8 | Third-party ("My sister likes Thai") | Extracted `"User's sister likes Thai food"` but assigned `attributedTo: "user"` | ❌ FAIL |

**Observation:** Mem0's extraction quality on standard facts is excellent, validating that `llama3:8b` is fully capable. However, it fails on edge cases like hypotheticals and third-party attribution exactly the same way a naive multi-fact schema does. 

---

## 4. Confirmed SDK Capabilities & Limitations

Verified directly against `node_modules/mem0ai/dist/oss/index.d.ts`:

**Capabilities:**
- **Local Inference:** Fully supported via `LLMConfig.provider = 'ollama'` and `EmbeddingConfig.provider = 'ollama'`.
- **Database Backends:** Native TypeScript support for `Supabase`, `PGVector`, `Redis`, `Qdrant`, etc.
- **Context/History:** Stores full message history and supports multi-turn context natively.

**Hard Limitations for Memoria:**
- **Opaque Lifecycle:** The SDK obscures extraction and consolidation behind `.add()`. Memoria's `process-candidate.ts` pipeline needs to explicitly branch to flag memories for user review. Mem0 provides no native "flagging" concept.
- **Database Schema Mismatch:** Mem0 creates and manages its own tables (`mem0_memories`, etc.). Retrofitting Memoria's Supabase RLS (Row Level Security) and Auth over Mem0's schema would be a substantial, fragile refactor.
- **Attribution Provenance:** Memoria tracks `message_id`, `conversation_id`, and `explicitness_score`. Mem0's metadata schema is unstructured and does not seamlessly integrate with our UI's need for strict provenance tracing.

---

## 5. Estimated Remaining Integration Work (If Adopted)

If we ignored the verdict and forced Mem0 into Memoria:
- **Rewrite database schema/RLS:** ~3 days (Migrating existing DB to Mem0's tables, rewriting RLS policies).
- **Adapter Layer for UX:** ~4 days (Reverse-engineering Mem0's `MemoryHistory` to reconstruct CREATE/SUPERSEDE events for the Memory Explorer).
- **Rip out custom pipeline:** ~1 day (Deleting extractor, matcher, decision-engine).
- **Total Estimate:** ~8 days of high-risk surgery that ultimately degrades product transparency.

---

## 6. Which Parts of Memoria Should Remain Custom?

Everything. The custom extraction, retrieval, and decision-engine pipelines (`extractor.ts`, `matcher.ts`, `decision-engine.ts`, `process-candidate.ts`) are the core IP of Memoria. They provide the explicit control necessary for the UI.

---

## 7. Next Implementation Step (Custom Engine Wins)

Implement **Option A (Minimal Repair)** from the previous context experiment:
1. Update `src/lib/memory/extractor.ts` to use a `z.array()` multi-fact schema.
2. Update the system prompt to enforce standalone sentences and explicitly reject hypotheticals/third-party statements.
3. Update `src/app/api/chat/route.ts` to pass the last 5 turns of conversation history to `extractMemory()` for pronoun resolution.
4. Update `process-candidate.ts` to iterate over the array of extracted facts.

---

## 8. Precise Evidence That Would Change the Verdict

This verdict would only change if:
1. The Memoria product requirement changed from "a transparent, controllable memory UI" to "an invisible autonomous agent memory".
2. Mem0 released an explicit "Dry Run" or "Staging" API that returned the exact planned operations (CREATE/UPDATE/DELETE) without applying them to the vector store, allowing our application layer to intercept, flag, and store them manually.
