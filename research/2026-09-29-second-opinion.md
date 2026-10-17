# Second opinion — Memoria diagnosis and plan

Independent check of D1–D13 and P1–P6 against source. No runtime. LIKELY where unobserved.

## 1. Verdicts D1–D13

| ID | Verdict | Evidence | Correction |
| --- | --- | --- | --- |
| D1 | **CONFIRMED** | `extractMemory(messageContent)` only; `prompt: messageContent` (`extractor.ts` L16, L25). Chat `after()` passes `userMsg.content` (`chat/route.ts` L116). No date in that prompt. | Chat *response* still gets client `messages` (`chat/route.ts` L86–91). Isolation is the **write** path, not the chat model. |
| D2 | **CONFIRMED** | Schema: one optional `memory` object (`extractor.ts` L5–14); return length 0 or 1 (L28–35). | — |
| D3 | **PARTIAL** | Catch → `[]` (`extractor.ts` L37–41). Zod/unknown errors become `STRUCTURED_OUTPUT_FAILED` with **no** retry (`provider.ts` L135–138). | 503/429 **are** retried up to 3× (`provider.ts` L91, L124–148). Not “no retry”; no **durable** retry / no distinction empty-vs-fail. |
| D4 | **CONFIRMED** | Consolidate updates `source_message_ids`, `corroboration_count`, `updated_at` only (`store.ts` L83–89). | Decision text even *says* “elaborates” (`decision-engine.ts` L82–88) then store drops the elaboration. |
| D5 | **PARTIAL** | Formula + strict `>` (`decision-engine.ts` L5–8, L64). Flagged dropped (`retriever.ts` L152–155). Equal scores flag (test L139–156). | **Overstated “corrections lose.”** A 3×0.9+0.5=3.2 candidate **beats** a 2×0.8+0.5=2.1 existing and **supersedes**. Loss is LIKELY after **corroboration inflation** or equal scores, not every correction. |
| D6 | **CONFIRMED** | Create/flag/supersede inserts omit `valid_until` (`store.ts` L32–43, L110–121). Sweep requires non-null `valid_until` (`store.ts` L339–341). | `valid_until` **is** set on supersede/delete of the *old* row (L136, L201)—not on new `state` facts. |
| D7 | **CONFIRMED** | Threshold 0.8 (`matcher.ts` L4, L15); `relatedMemories[0]` (`decision-engine.ts` L43); “cannot both be true” (L17–20). | — |
| D8 | **PARTIAL** | Query = latest user text (`chat/route.ts` L79); `match_threshold: 0.0` (`retriever.ts` L64); recency+confidence in `finalScore` (L190–195); no min score; only CHAR_BUDGET stop (L201–213). | **Can** return `[]` if RPC empty (`retriever.test.ts` “No eligible memories”). Cannot **abstain** when *any* active rows exist. “Never return nothing” is false. |
| D9 | **CONFIRMED** | `plainto_tsquery` (`20260927000002_lexical_search_rpc.sql` L34–38); `entityMatch = 0.0` (`retriever.ts` L164); RPC `status IN ('active','flagged')` (`20260927000005_switch_to_gemini_vector.sql` L41–42); JS drop flagged (L152–155). | Lexical AND is real; with threshold 0.0, **vector still fills**, so lexical emptiness is secondary for “too much recall.” |
| D10 | **CONFIRMED** | Insert then update (`store.ts` L107–145); admin on write (`chat/route.ts` L114–116); `Set` lock (`store.ts` L14–23). | **Portfolio:** races/RLS bypass are **theoretical** at 1 user / 1 process. Two-active after failed supersede **is** visible if it happens. |
| D11 | **CONFIRMED** | Persist messages (`chat/route.ts` L61–71, L94–102); page does not load them (`chat/page.tsx` L15–16). | In-session context is real via `useChat`. Reload is the bug. |
| D12 | **CONFIRMED** | Extractor/decision/chat tests mock `generateObject`/`streamText`. Placeholder `expect(true).toBe(true)` (`decision-engine.test.ts` L158–161). Eval artifact: 32 infra errors, 0 judged (`eval/results/1790621765546.md` L3–8). | Eval also **skips assistant turns** (`eval/run.ts` L144–149), so even a green run **under-tests** D1. |
| D13 | **CONFIRMED** as engineering judgment | H1/H2/H4/D8 are model-independent. | **Share of failure UNVERIFIED** until a baseline eval. Do not treat “mainly design” as measured. |

## 2. Missed (with evidence)

**Demo/portfolio (visible):**

- **Write vs chat split:** assistant can resolve “seattle.” in-session; memory layer cannot (`extractor.ts` L25 vs `chat/route.ts` L86–91). Reviewers will see “it answered me, then forgot.”
- **`after()` extract is async** (`chat/route.ts` L111–121). Immediate follow-up “what fruit?” LIKELY retrieves **before** the new row exists. Not scale; it is the demo loop.
- **Entities unused:** tables in `20260927000000_init_schema.sql` L56–112; no engine writes; Explorer still shows links (`explorer/[id]/page.tsx` L138–148). Looks unfinished.
- **Eval ≠ product path:** `eval/run.ts` calls `processMemoryCandidate`, not `/api/chat`.
- **Default judge is `local:llama3:8b`** (`eval/run.ts` L175)—same weak-model class as planned extract. Invalidates “measured quality.”
- **Embedding-profile throw** (`retriever.ts` L105–107) is caught (`L131–132`) → **silent semantic skip**, lexical only. Local/remote switch can “forget” without a UI error.
- **`MERGE_MODEL` never read** (`.env.example` only). Dead config.

**Mostly scale / theoretical:** advisory-lock races; admin RLS bypass if `userId` is ever wrong (currently from `getUser()` then passed in). `confirm_memory` `SECURITY DEFINER` (`20260928000000_day6_confirm_rpc.sql` L24–32) is a real hardening issue but not the messy-language bug. GRANT ALL to `anon` (`20260927000003_grants.sql`) is ugly; RLS still applies—fine for portfolio if RLS tests hold.

**Fine as is:** in-memory lock; no Kafka; no graph DB.

## 3. Critique P1–P6

**P1 — Right, first, not optional.** Without a finishing eval, every later change is theater. Fix harness errors, skip assistant-turn blindness (feed prior user+assistant text into extract **or** document that implicit_reference is expected-fail until D1 is fixed), **export raw DB + judge JSON for humans**. Never 7B-as-judge of 7B. Order is correct.

**P2 — Too much, too soon, wrong for 7B.** One controller that emits ops + aliases + `valid_until` + `evidence_quote` + `basis` is a **hard structured task**. qwen2.5:7b-instruct LIKELY fails Zod/repair loops → empty or garbage ops (same failure mode as D3, bigger schema). It *does* target D1/D2/D7, but you can get most of that by **giving the existing extractor history + `memories: []`** without deleting matcher/decision in one step. Cut aliases; cut evidence_quote (7B paraphrases → everything flagged → demo looks broken). Keep a **small** list of add/update/none if you later collapse calls.

**P3 — Over-engineered for this scope.** User+active checks: **keep** (visible wrong-user writes). Length limits: **keep**. `inferred → flagged`: **risky** (slang will all flag). `evidence_quote` substring: **skip** (visible false rejects). Advisory lock / full transactional applier: **skip for v1** except **supersede as one RPC** (failed half-supersede is visible). Idempotent-per-message: nice; skip until you see double-extracts from `after()` retries.

**P4 — Right size.** Floor + max ~8 + active/unexpired in SQL + recency as tie-break + drop confidence from prompt + “conversation overrides memory”: do this. Last 2–3 turns as **query**: cheap, good. Fix **or drop** lexical; dropping is fine (vector already dominates). Do not build entityMatch.

**P5 — Right.** Freeze Explorer chrome.

**P6 — Right.** ADD-only would fight Explorer/supersede/confirm (`store.ts` supersede; `confirm_memory`). Keep history rows.

## 4. Architecture

| Option | Fit | 7B | Effort |
| --- | --- | --- | --- |
| **(a) Patch pipeline** | Best for portfolio | Schema `memories[]` + history is still hard but **narrower** than P2 | Days |
| (b) P2 controller | Better long-term, worse first 7B | **Will struggle** with fat op schema; fallback = (a) or JSON-in-text + regex | Week+ |
| (c) Mem0 ADD-only | Fights P6 / Explorer | n/a | Don’t |
| (d) Chat tools remember/forget | Extra round-trip; 7B tool calling flaky; user sees latency | Poor | Don’t yet |

**Recommend (a) now**, not (b). Evidence: you already have two brittle `generateObject` sites (`extractor.ts`, `decision-engine.ts`). Replacing them with a **larger** schema does not reduce 7B failure surface. Collapse to one call **after** eval shows matching/contradiction is the leftover, not context/schema.

Fallback if 7B still fails arrays: extract **free text bullets**, parse lines in code, skip floats (`explicitness` enum strings).

## 5. Model vs design

**Any model, still broken:** D1, D2, D4, D6, D8 abstention, D11 reload, eval skip-assistant.  
**Stronger model helps:** typos/slang/worthiness, D7 “both true” vs replacement **if** both strings are complete, fewer Zod 80.1 failures.  
**Estimate (not measured):** ~60–70% design, ~20–30% model, ~10% eval-blindness.  
**Cheap experiment:** 8–10 cases (clean, multi_fact, correction, implicit, retrieval-02) on **current** code with Gemini extract vs local 7B, **same** prompts. If Gemini still drops 3/4 multi-facts and implicit “seattle.”, design dominates.

## 6. Minimum plan (hours = one experienced owner)

| # | Step | Files | h | Risk | Accept | Visible | Skip? |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| 1 | Eval runs to completion; human/Gemini judge; log errors; **include prior turns in extract input for cases that have them** | `eval/run.ts` | 6–10 | Low | 32 cases finish | Truth | No |
| 2 | Baseline numbers on current pipeline (local + optional Gemini) | eval only | 4–8 | Low | JSON+md with real pass/fail | Portfolio | No |
| 3 | Extractor: last ~6 DB or request turns + ISO date; `memories: []`; coerce confidence 0–1; empty vs fail log | `extractor.ts`, `chat/route.ts`, `process-candidate.ts` | 8–12 | Med | multi_fact + implicit cases move | Messy talk | No |
| 4 | Consolidate writes new `content` (+ re-embed) when not identical | `store.ts` | 2–4 | Med | refinement cases | “black coffee” | No |
| 5 | Contradict prompt = replace?; if user turn looks like correction, supersede without `>` | `decision-engine.ts` | 3–5 | Med | correction cases | “actually bananas” | No |
| 6 | Retrieval: SQL `active` + unexpired; similarity floor ~0.45–0.55 UNVERIFIED tune; max 8; recency tie-break only; drop/ignore lexical | `retriever.ts` + RPC | 4–6 | Med | retrieval_relevance | Less junk | No |
| 7 | Prompt: no confidence; “current chat overrides memory” | `context-builder.ts` | 1 | Low | qualitative chat | Less UUID/noise | No |
| 8 | Re-eval vs baseline; freeze UI | eval | 4 | Low | deltas | Proof | No |
| 9 | Load last conversation messages into `ChatClient` | `chat/page.tsx`, `ChatClient.tsx` | 4–6 | Low | refresh keeps thread | Demo | **Skip** until 8 if timeboxed |
| 10 | `valid_until` optional on extract + set on create; supersede RPC | extractor, `store.ts`, one migration | 4–8 | Med | state_expiry | Temp facts | **Skip** if categories still red |

No Kubernetes. No graph. Skip P2/P3 until 8 is green-ish.

## 7. “Good enough” (first real eval, not hopes)

| Category | 7B local | Strong remote | Accept as documented limit |
| --- | --- | --- | --- |
| clean | 2/3 | 3/3 | odd slang miss |
| multi_fact | 2/4 ≥2 facts | 3/4 | 4th fact dropped |
| correction | 2/5 | 4/5 | implicit “hate it” |
| refinement | 1/3 | 2/3 | merge wording fuzzy |
| change_over_time | 1/3 | 2/3 | job+graduate both |
| noise | 3/4 abstain | 4/4 | hypothetical boat |
| implicit_reference | 1/3 | 2/3 | “we still do that” |
| long_messy | 1/3 | 2/3 | extra episodic noise |
| state_expiry | 0/2 until step 10 | 1/2 | relative dates |
| retrieval_relevance | 1/2 | 2/2 | abstention flaky |

Do not claim 90% on 7B. Remote is the **showcase**; local is “works offline, weaker.”

## 8. Keep / delete / freeze

**Keep:** `src/lib/memory/*` (patch in place), Explorer inspect/edit/confirm, RLS + `01_rls_isolation_test.sql`, `src/scripts/real-db-*.ts`, `reindex-embeddings.ts`, `eval/cases/*.json`, cron staleness route.  
**Do not delete** real-DB scripts—they prove OS, not semantics; still portfolio-credible.  
**Delete now (dead, not verification):** `src/app/explorer/[id]/DeleteButton.tsx` (unimported). Optional later: `test/memory-engine.deterministic.test.ts` duplicate; `src/scripts/eval/*` once `eval/run.ts` is canonical.  
**Freeze:** Explorer layout/filters/entity UI until writers exist; new memory types; entityMatch.
