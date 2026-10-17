# Eval run: new-cases-after

| | |
|---|---|
| label | `new-cases-after` |
| engine | `v2` |
| date | `2026-10-17T01:52:42.673Z` |
| git | `922986d (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.5` |
| set | `dev` |
| cases | `3` |

## Summary

- **Cases passed: 2/3** (a case passes only if every check passes)
- **Checks passed: 6/7** (86%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 9011 ms, max 63695 ms

### By check type

| check | passed |
|---|---|
| stored | 2/2 |
| max_active | 3/3 |
| not_stored | 1/2 |

### By category

| category | cases | checks |
|---|---|---|
| conversation | 2/3 | 6/7 |

## Cases

### PASS conv-name-change-01: A different name when one is already known

Stored memories:
- `superseded` User's name is Priya.
- `active` User's name is Meera.
- `active` User teaches chemistry.

Checks:
- pass stored: User teaches chemistry → "User teaches chemistry."
- pass max_active: at most 2 active memories → "2 active"

Engine decisions:
- "hi there, my name is Meera and I teach chemistry"
  - "User's name is Meera." -> supersede as fact (New fact provides the correct name.)
  - "User teaches chemistry." -> add as fact (New fact about user's profession.)

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
  - "User no longer prefers places with lakes." -> supersede as preference (User explicitly stated a preference for beaches instead of lakes.)

### PASS conv-typo-fix-01: Obvious typos are corrected in the stored memory

Stored memories:
- `active` User's favorite drink is a strawberry smoothie.

Checks:
- pass stored: User's favorite drink is a strawberry smoothie → "User's favorite drink is a strawberry smoothie."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "my fav drink is a strawbery smoothy"
  - "User's favorite drink is a strawberry smoothie." -> add as fact (No related memory exists yet.)
