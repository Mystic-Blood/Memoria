# Eval run: new-cases-before

| | |
|---|---|
| label | `new-cases-before` |
| engine | `v2` |
| date | `2026-10-17T01:43:26.768Z` |
| git | `922986d (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `Warning: could not connect to a running Ollama instance
Warning: client version is 0.40.4` |
| set | `dev` |
| cases | `3` |

## Summary

- **Cases passed: 1/3** (a case passes only if every check passes)
- **Checks passed: 5/8** (63%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 5
- Background processing per user turn: median 3179 ms, max 7369 ms

### By check type

| check | passed |
|---|---|
| stored | 0/2 |
| not_active | 0/1 |
| max_active | 3/3 |
| not_stored | 2/2 |

### By category

| category | cases | checks |
|---|---|---|
| conversation | 1/3 | 5/8 |

## Cases

### FAIL conv-name-change-01: A different name when one is already known

Stored memories:
- `active` User's name is Priya.

Checks:
- **FAIL** stored: User teaches chemistry
- **FAIL** not_active: Two names at once → "User's name is Priya."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "hi there, my name is Meera and I teach chemistry"
  - failed: extraction unavailable: model server unreachable

Pipeline errors:
- `[pipeline failed] extraction unavailable: model server unreachable`

### PASS conv-assistant-task-01: Asking for help with a task is not a fact about the user

Stored memories:
- _(none)_

Checks:
- pass not_stored: User wants help planning a getaway
- pass not_stored: User wants the top 3
- pass max_active: at most 1 active memories → "0 active"

Engine decisions:
- "can u help me plan a weekend getaway somewhere close by"
  - failed: extraction unavailable: model server unreachable
- "idk show me something with lakes. give me the top 3"
  - failed: extraction unavailable: model server unreachable
- "nah forget that, what about a beach instead"
  - failed: extraction unavailable: model server unreachable

Pipeline errors:
- `[pipeline failed] extraction unavailable: model server unreachable`
- `[pipeline failed] extraction unavailable: model server unreachable`
- `[pipeline failed] extraction unavailable: model server unreachable`

### FAIL conv-typo-fix-01: Obvious typos are corrected in the stored memory

Stored memories:
- _(none)_

Checks:
- **FAIL** stored: User's favorite drink is a strawberry smoothie
- pass max_active: at most 1 active memories → "0 active"

Engine decisions:
- "my fav drink is a strawbery smoothy"
  - failed: extraction unavailable: model server unreachable

Pipeline errors:
- `[pipeline failed] extraction unavailable: model server unreachable`
