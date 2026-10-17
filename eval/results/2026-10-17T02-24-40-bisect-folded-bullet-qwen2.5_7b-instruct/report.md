# Eval run: bisect-folded-bullet

| | |
|---|---|
| label | `bisect-folded-bullet` |
| engine | `v2` |
| date | `2026-10-17T02:24:40.202Z` |
| git | `922986d (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.5` |
| set | `dev` |
| cases | `4` |

## Summary

- **Cases passed: 2/4** (a case passes only if every check passes)
- **Checks passed: 10/13** (77%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 3485 ms, max 8192 ms

### By check type

| check | passed |
|---|---|
| stored | 4/4 |
| not_stored | 4/6 |
| max_active | 2/3 |

### By category

| category | cases | checks |
|---|---|---|
| long_messy | 0/1 | 3/5 |
| conversation | 2/3 | 7/8 |

## Cases

### FAIL long-01: Rambling paragraph with one durable fact

Stored memories:
- `active` User is allergic to dairy.
- `active` User had to walk in the rain today. _(until 2026-10-17T23:59:59+00:00)_

Checks:
- pass stored: User is allergic to dairy → "User is allergic to dairy."
- pass not_stored: User spilled coffee
- pass not_stored: User missed the bus
- **FAIL** not_stored: User walked in the rain → "User had to walk in the rain today."
- **FAIL** max_active: at most 1 active memories → "2 active"

Engine decisions:
- "man today was so crazy. i woke up late, spilled coffee on my shirt, missed the b"
  - "User is allergic to dairy." -> add as fact (No related memory exists yet.)
  - "User had to walk in the rain today." -> add as temporary until 2026-10-17 (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.61 < 0.8)]

### PASS conv-pronoun-01: Details about "it" spread over turns

Stored memories:
- `active` User got a new bike last week.
- `active` User got a new Royal Enfield Classic 350, matte black bike.
- `active` User rides their bike to work every day.

Checks:
- pass stored: User owns a Royal Enfield Classic 350 → "User got a new Royal Enfield Classic 350, matte black bike."
- pass stored: User rides the bike to work every day → "User rides their bike to work every day."
- pass not_stored: User rides it to work (unresolved "it")

Engine decisions:
- "got a new bike last week"
  - "User got a new bike last week." -> add as fact (No related memory exists yet.)
- "royal enfield classic 350, matte black"
  - "User got a new Royal Enfield Classic 350, matte black bike." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.74 < 0.8)]
- "yeah i ride it to work every day"
  - "User rides their bike to work every day." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.76 < 0.8)]

### FAIL conv-assistant-task-01: Asking for help with a task is not a fact about the user

Stored memories:
- `active` User enjoys places with lakes.

Checks:
- pass not_stored: User wants help with a getaway
- **FAIL** not_stored: User wants a top 3 list → "User enjoys places with lakes."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "can u help me sort out a weekend getaway somewhere close by"
  - nothing extracted
- "idk somewhere with lakes. gimme your top 3"
  - "User enjoys places with lakes." -> add as preference (No related memory exists yet.)
- "nah forget that, what about a beach"
  - nothing extracted

### PASS conv-typo-fix-01: Obvious typos are corrected in the stored memory

Stored memories:
- `active` User's favorite drink is a strawberry smoothie.

Checks:
- pass stored: User's favorite drink is a strawberry smoothie → "User's favorite drink is a strawberry smoothie."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "my fav drink is a strawbery smoothy"
  - "User's favorite drink is a strawberry smoothie." -> add as preference (No related memory exists yet.)
