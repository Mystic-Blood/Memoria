# Eval run: holdout-v2-final

| | |
|---|---|
| label | `holdout-v2-final` |
| engine | `v2` |
| date | `2026-10-16T12:05:56.555Z` |
| git | `dc6658b (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.4` |
| set | `holdout` |
| cases | `15` |

## Summary

- **Cases passed: 13/15** (a case passes only if every check passes)
- **Checks passed: 41/43** (95%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 3143 ms, max 9110 ms

### By check type

| check | passed |
|---|---|
| stored | 14/15 |
| max_active | 14/14 |
| not_active | 3/3 |
| not_stored | 4/4 |
| expires | 0/1 |
| retrieve | 1/1 |
| not_retrieve | 5/5 |

### By category

| category | cases | checks |
|---|---|---|
| clean | 0/1 | 1/2 |
| multi_fact | 2/2 | 8/8 |
| correction | 2/2 | 6/6 |
| change_over_time | 1/1 | 3/3 |
| implicit_reference | 2/2 | 5/5 |
| noise | 3/3 | 6/6 |
| refinement | 1/1 | 2/2 |
| state_expiry | 0/1 | 2/3 |
| retrieval_relevance | 2/2 | 8/8 |

## Cases

### FAIL ho-clean-01: Occupation stated plainly

Stored memories:
- `active` User works at a children's hospital.

Checks:
- **FAIL** stored: User is a nurse at a children's hospital
- pass max_active: at most 1 active memories → "1 active"

### PASS ho-multi-01: Three facts with casual phrasing

Stored memories:
- `active` User is vegetarian.
- `active` User speaks French.
- `active` User's birthday is March 3rd.

Checks:
- pass stored: User is vegetarian → "User is vegetarian."
- pass stored: User speaks French → "User speaks French."
- pass stored: User's birthday is March 3rd → "User's birthday is March 3rd."
- pass max_active: at most 3 active memories → "3 active"

### PASS ho-multi-02: Tool preferences in one breath

Stored memories:
- `active` User uses a mechanical keyboard.
- `active` User prefers light theme.
- `active` User always codes in Python.

Checks:
- pass stored: User uses a mechanical keyboard → "User uses a mechanical keyboard."
- pass stored: User prefers a light theme → "User prefers light theme."
- pass stored: User codes in Python → "User always codes in Python."
- pass max_active: at most 3 active memories → "3 active"

### PASS ho-corr-01: Changing a remembered number

Stored memories:
- `active` User has 3 cats.

Checks:
- pass stored: User has 3 cats → "User has 3 cats."
- pass not_active: User has 2 cats
- pass max_active: at most 1 active memories → "1 active"

### PASS ho-corr-02: Quitting a habit

Stored memories:
- `superseded` User smokes cigarettes
- `active` User no longer smokes cigarettes.

Checks:
- pass stored: User quit smoking → "User no longer smokes cigarettes."
- pass not_active: User smokes cigarettes
- pass max_active: at most 1 active memories → "1 active"

### PASS ho-time-01: New employer

Stored memories:
- `superseded` User works at a bank
- `active` User works at a startup now.

Checks:
- pass stored: User works at a startup → "User works at a startup now."
- pass not_active: User works at a bank
- pass max_active: at most 2 active memories → "1 active"

### PASS ho-implicit-01: One-word answer to a question

Stored memories:
- `active` User works as an architect.

Checks:
- pass stored: User is an architect → "User works as an architect."
- pass max_active: at most 1 active memories → "1 active"

### PASS ho-implicit-02: "She" refers to a person named earlier in the chat

Stored memories:
- `active` User's daughter Maya has started school.
- `active` User's daughter Maya loves dinosaurs.

Checks:
- pass stored: User has a daughter named Maya → "User's daughter Maya has started school.", "User's daughter Maya loves dinosaurs."
- pass stored: Maya loves dinosaurs → "User's daughter Maya loves dinosaurs."
- pass not_stored: She's obsessed with dinosaurs (unresolved)

### PASS ho-noise-01: Venting about the day

Stored memories:
- _(none)_

Checks:
- pass not_stored: Train was late / forgot umbrella
- pass max_active: at most 0 active memories → "0 active"

### PASS ho-noise-02: Asking for a recommendation

Stored memories:
- _(none)_

Checks:
- pass not_stored: User wants a sci-fi book
- pass max_active: at most 0 active memories → "0 active"

### PASS ho-noise-03: Someone else's preference

Stored memories:
- _(none)_

Checks:
- pass not_stored: User likes standing desks
- pass max_active: at most 0 active memories → "0 active"

### PASS ho-refine-01: Adding detail to a hobby

Stored memories:
- `active` User plays jazz piano, mostly at a bar on Fridays.

Checks:
- pass stored: User plays jazz piano → "User plays jazz piano, mostly at a bar on Fridays."
- pass max_active: at most 3 active memories → "1 active"

### FAIL ho-state-01: Short trip with an end

Stored memories:
- `active` User is at a conference in Berlin.

Checks:
- pass stored: User is at a conference in Berlin → "User is at a conference in Berlin."
- **FAIL** expires: Berlin trip is temporary
- pass max_active: at most 1 active memories → "1 active"

### PASS ho-retrieval-01: Pick the right memory out of several

Stored memories:
- `active` User has a peanut allergy
- `active` User drives a Volvo
- `active` User supports Arsenal
- `active` User lives in Leeds
- `active` User is learning Japanese

Checks:
- pass max_active: at most 5 active memories → "5 active"
- pass retrieve "which football team do i support?": User supports Arsenal → "User supports Arsenal"
- pass not_retrieve "which football team do i support?": User has a peanut allergy
- pass not_retrieve "which football team do i support?": User drives a Volvo
- retrieved for "which football team do i support?": "User supports Arsenal"

### PASS ho-retrieval-02: General knowledge question retrieves nothing

Stored memories:
- `active` User is a nurse
- `active` User has two cats
- `active` User lives in Leeds

Checks:
- pass max_active: at most 3 active memories → "3 active"
- pass not_retrieve "how far is the moon from earth?": User is a nurse
- pass not_retrieve "how far is the moon from earth?": User has two cats
- pass not_retrieve "how far is the moon from earth?": User lives in Leeds
- retrieved for "how far is the moon from earth?": _(nothing)_
