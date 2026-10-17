# Eval run: bisect-no-example

| | |
|---|---|
| label | `bisect-no-example` |
| engine | `v2` |
| date | `2026-10-17T02:22:53.005Z` |
| git | `922986d (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.5` |
| set | `dev` |
| cases | `4` |

## Summary

- **Cases passed: 1/4** (a case passes only if every check passes)
- **Checks passed: 7/13** (54%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 5126 ms, max 17178 ms

### By check type

| check | passed |
|---|---|
| stored | 4/4 |
| not_stored | 1/6 |
| max_active | 2/3 |

### By category

| category | cases | checks |
|---|---|---|
| long_messy | 0/1 | 1/5 |
| conversation | 1/3 | 6/8 |

## Cases

### FAIL long-01: Rambling paragraph with one durable fact

Stored memories:
- `active` User woke up late today. _(until 2026-10-17T23:59:59+00:00)_
- `active` User spilled coffee on their shirt today. _(until 2026-10-17T23:59:59+00:00)_
- `active` User missed the bus today. _(until 2026-10-17T23:59:59+00:00)_
- `active` User found out they are allergic to dairy.
- `active` User had to walk in the rain today. _(until 2026-10-17T23:59:59+00:00)_

Checks:
- pass stored: User is allergic to dairy → "User found out they are allergic to dairy."
- **FAIL** not_stored: User spilled coffee → "User spilled coffee on their shirt today."
- **FAIL** not_stored: User missed the bus → "User missed the bus today."
- **FAIL** not_stored: User walked in the rain → "User had to walk in the rain today."
- **FAIL** max_active: at most 1 active memories → "5 active"

Engine decisions:
- "man today was so crazy. i woke up late, spilled coffee on my shirt, missed the b"
  - "User woke up late today." -> add as temporary until 2026-10-17 (No related memory exists yet.)
  - "User spilled coffee on their shirt today." -> add as temporary until 2026-10-17 (The new fact adds details about the user spilling coffee and walking in the rain, which are not covered by the existing memory.)
  - "User missed the bus today." -> add as temporary until 2026-10-17 (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.70 < 0.8)]
  - "User found out they are allergic to dairy." -> add as fact (The new fact is about a new topic not covered by existing memories.)
  - "User had to walk in the rain today." -> add as temporary until 2026-10-17 (The new fact is about a new experience.)

### FAIL conv-pronoun-01: Details about "it" spread over turns

Stored memories:
- `active` User got a new bike last week.
- `active` User got a new Royal Enfield Classic 350, matte black bike and rides it to work every day.

Checks:
- pass stored: User owns a Royal Enfield Classic 350 → "User got a new Royal Enfield Classic 350, matte black bike and rides it to work every day."
- pass stored: User rides the bike to work every day → "User got a new Royal Enfield Classic 350, matte black bike and rides it to work every day."
- **FAIL** not_stored: User rides it to work (unresolved "it") → "User got a new Royal Enfield Classic 350, matte black bike and rides it to work every day."

Engine decisions:
- "got a new bike last week"
  - "User got a new bike last week." -> add as fact (No related memory exists yet.)
- "royal enfield classic 350, matte black"
  - "User got a new Royal Enfield Classic 350, matte black bike." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.74 < 0.8)]
- "yeah i ride it to work every day"
  - "User rides their Royal Enfield Classic 350 bike to work every day." -> update as fact (Added daily usage detail to the existing memory.)

### FAIL conv-assistant-task-01: Asking for help with a task is not a fact about the user

Stored memories:
- `superseded` User prefers places with lakes.
- `active` User no longer prefers places with lakes.

Checks:
- pass not_stored: User wants help with a getaway
- **FAIL** not_stored: User wants a top 3 list → "User no longer prefers places with lakes."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "can u help me sort out a weekend getaway somewhere close by"
  - nothing extracted
- "idk somewhere with lakes. gimme your top 3"
  - "User prefers places with lakes." -> add as fact (No related memory exists yet.)
- "nah forget that, what about a beach"
  - "User no longer prefers places with lakes." -> supersede as preference (The user explicitly stated a preference for beaches over lakes.)

### PASS conv-typo-fix-01: Obvious typos are corrected in the stored memory

Stored memories:
- `active` User's favorite drink is a strawberry smoothie.

Checks:
- pass stored: User's favorite drink is a strawberry smoothie → "User's favorite drink is a strawberry smoothie."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "my fav drink is a strawbery smoothy"
  - "User's favorite drink is a strawberry smoothie." -> add as fact (No related memory exists yet.)
