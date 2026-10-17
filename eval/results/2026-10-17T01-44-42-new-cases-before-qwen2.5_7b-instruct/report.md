# Eval run: new-cases-before

| | |
|---|---|
| label | `new-cases-before` |
| engine | `v2` |
| date | `2026-10-17T01:44:42.646Z` |
| git | `922986d (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.5` |
| set | `dev` |
| cases | `3` |

## Summary

- **Cases passed: 2/3** (a case passes only if every check passes)
- **Checks passed: 6/8** (75%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 18559 ms, max 82056 ms

### By check type

| check | passed |
|---|---|
| stored | 2/2 |
| not_active | 1/1 |
| max_active | 2/3 |
| not_stored | 1/2 |

### By category

| category | cases | checks |
|---|---|---|
| conversation | 2/3 | 6/8 |

## Cases

### PASS conv-name-change-01: A different name when one is already known

Stored memories:
- `superseded` User's name is Priya.
- `active` User's name is Meera.
- `active` User teaches chemistry.

Checks:
- pass stored: User teaches chemistry → "User teaches chemistry."
- pass not_active: Two names at once
- pass max_active: at most 2 active memories → "2 active"

Engine decisions:
- "hi there, my name is Meera and I teach chemistry"
  - "User's name is Meera." -> supersede as fact (New fact provides the correct name.)
  - "User teaches chemistry." -> add as fact (New fact about user's profession.)

### FAIL conv-assistant-task-01: Asking for help with a task is not a fact about the user

Stored memories:
- `active` User is planning a weekend getaway.
- `superseded` User prefers places with lakes.
- `active` User prefers beaches over lakes for their weekend getaway.

Checks:
- **FAIL** not_stored: User wants help planning a getaway → "User is planning a weekend getaway.", "User prefers beaches over lakes for their weekend getaway."
- pass not_stored: User wants the top 3
- **FAIL** max_active: at most 1 active memories → "2 active"

Engine decisions:
- "can u help me plan a weekend getaway somewhere close by"
  - "User is planning a weekend getaway." -> add as fact (No related memory exists yet.)
- "idk show me something with lakes. give me the top 3"
  - "User is planning a weekend getaway." -> skip (An identical memory already exists.)
  - "User prefers places with lakes." -> add as preference (New preference about preferred locations.)
  - "User wants the top 3 lake locations suggested." -> skip (The new fact is about a specific request for lake locations, not a preference or plan.)
- "nah forget that, what about a beach instead"
  - "User prefers beaches over lakes for their weekend getaway." -> supersede as preference (New preference overrides old one.)

### PASS conv-typo-fix-01: Obvious typos are corrected in the stored memory

Stored memories:
- `active` User's favorite drink is a strawberry smoothie.

Checks:
- pass stored: User's favorite drink is a strawberry smoothie → "User's favorite drink is a strawberry smoothie."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "my fav drink is a strawbery smoothy"
  - "User's favorite drink is a strawberry smoothie." -> add as fact (No related memory exists yet.)
