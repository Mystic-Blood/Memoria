# Eval run: holdout-final

| | |
|---|---|
| label | `holdout-final` |
| engine | `v2` |
| date | `2026-10-16T16:15:57.815Z` |
| git | `5e8eadb` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.4` |
| set | `holdout` |
| cases | `15` |

## Summary

- **Cases passed: 14/15** (a case passes only if every check passes)
- **Checks passed: 42/43** (98%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 3279 ms, max 9539 ms

### By check type

| check | passed |
|---|---|
| stored | 15/15 |
| max_active | 14/14 |
| not_active | 3/3 |
| not_stored | 4/4 |
| expires | 0/1 |
| retrieve | 1/1 |
| not_retrieve | 5/5 |

### By category

| category | cases | checks |
|---|---|---|
| clean | 1/1 | 2/2 |
| multi_fact | 2/2 | 8/8 |
| correction | 2/2 | 6/6 |
| change_over_time | 1/1 | 3/3 |
| implicit_reference | 2/2 | 5/5 |
| noise | 3/3 | 6/6 |
| refinement | 1/1 | 2/2 |
| state_expiry | 0/1 | 2/3 |
| retrieval_relevance | 2/2 | 8/8 |

## Cases

### PASS ho-clean-01: Occupation stated plainly

Stored memories:
- `active` User is a nurse at a children's hospital.

Checks:
- pass stored: User is a nurse at a children's hospital → "User is a nurse at a children's hospital."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "I'm a nurse at a children's hospital"
  - "User is a nurse at a children's hospital." -> add as fact (No related memory exists yet.)

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

Engine decisions:
- "fyi im vegetarian, i speak french, and my birthday is march 3rd"
  - "User is vegetarian." -> add as fact (No related memory exists yet.)
  - "User speaks French." -> add as fact (New fact about speaking French is not covered by existing memory.)
  - "User's birthday is March 3rd." -> add as fact (New fact about birthday is not covered by existing memories.)

### PASS ho-multi-02: Tool preferences in one breath

Stored memories:
- `active` User uses a mechanical keyboard.
- `active` User prefers a light theme.
- `active` User always codes in Python.

Checks:
- pass stored: User uses a mechanical keyboard → "User uses a mechanical keyboard."
- pass stored: User prefers a light theme → "User prefers a light theme."
- pass stored: User codes in Python → "User always codes in Python."
- pass max_active: at most 3 active memories → "3 active"

Engine decisions:
- "i use a mechanical keyboard, prefer light theme, and always code in python"
  - "User uses a mechanical keyboard." -> add as fact (No related memory exists yet.)
  - "User prefers a light theme." -> add as preference (The new fact adds a preference for a light theme without contradicting the existing memory.)
  - "User always codes in Python." -> add as fact (New fact adds information about the user's coding language.)

### PASS ho-corr-01: Changing a remembered number

Stored memories:
- `active` User has 3 cats.

Checks:
- pass stored: User has 3 cats → "User has 3 cats."
- pass not_active: User has 2 cats
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "actually we adopted another one, so 3 cats now"
  - "User now has 3 cats." -> update as fact (Increased the number of cats from 2 to 3.)

### PASS ho-corr-02: Quitting a habit

Stored memories:
- `superseded` User smokes cigarettes
- `active` User quit smoking last month.

Checks:
- pass stored: User quit smoking → "User quit smoking last month."
- pass not_active: User smokes cigarettes
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "i quit smoking last month!"
  - "User quit smoking last month." -> supersede as fact (New fact directly contradicts existing memory.)

### PASS ho-time-01: New employer

Stored memories:
- `superseded` User works at a bank
- `active` User started working at a startup this week and left the bank.

Checks:
- pass stored: User works at a startup → "User started working at a startup this week and left the bank."
- pass not_active: User works at a bank
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "started at a startup this week, left the bank"
  - "User started working at a startup this week and left the bank." -> supersede as fact (The user has left the bank and started working at a new job.)

### PASS ho-implicit-01: One-word answer to a question

Stored memories:
- `active` User is an architect.

Checks:
- pass stored: User is an architect → "User is an architect."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "architect"
  - "User is an architect." -> add as fact (No related memory exists yet.)

### PASS ho-implicit-02: "She" refers to a person named earlier in the chat

Stored memories:
- `active` User has a daughter named Maya who started school and loves it, being obsessed with dinosaurs.

Checks:
- pass stored: User has a daughter named Maya → "User has a daughter named Maya who started school and loves it, being obsessed with dinosaurs."
- pass stored: Maya loves dinosaurs → "User has a daughter named Maya who started school and loves it, being obsessed with dinosaurs."
- pass not_stored: She's obsessed with dinosaurs (unresolved)

Engine decisions:
- "my daughter maya just started school"
  - "User has a daughter named Maya who started school." -> add as fact (No related memory exists yet.)
- "she loves it, she's already obsessed with dinosaurs"
  - "User's daughter Maya loves her new school and is obsessed with dinosaurs." -> update as fact (Added details about Maya's feelings towards her new school.)

### PASS ho-noise-01: Venting about the day

Stored memories:
- _(none)_

Checks:
- pass not_stored: Train was late / forgot umbrella
- pass max_active: at most 0 active memories → "0 active"

Engine decisions:
- "ugh the train was late again and i forgot my umbrella"
  - nothing extracted

### PASS ho-noise-02: Asking for a recommendation

Stored memories:
- _(none)_

Checks:
- pass not_stored: User wants a sci-fi book
- pass max_active: at most 0 active memories → "0 active"

Engine decisions:
- "can you recommend a good sci-fi book?"
  - nothing extracted

### PASS ho-noise-03: Someone else's preference

Stored memories:
- _(none)_

Checks:
- pass not_stored: User likes standing desks
- pass max_active: at most 0 active memories → "0 active"

Engine decisions:
- "my coworker swears by standing desks"
  - nothing extracted

### PASS ho-refine-01: Adding detail to a hobby

Stored memories:
- `active` User plays jazz piano mostly, performing at a bar on Fridays.

Checks:
- pass stored: User plays jazz piano → "User plays jazz piano mostly, performing at a bar on Fridays."
- pass max_active: at most 3 active memories → "1 active"

Engine decisions:
- "mostly jazz piano these days, i play at a bar on fridays"
  - "User mostly plays jazz piano these days." -> update as fact (Added details about the genre and performance location.)
  - "User plays the piano at a bar on Fridays." -> skip (The memory already says this.) [guard: model proposed an update that changes nothing]

### FAIL ho-state-01: Short trip with an end

Stored memories:
- `active` User is at a conference in Berlin until Wednesday.

Checks:
- pass stored: User is at a conference in Berlin → "User is at a conference in Berlin until Wednesday."
- **FAIL** expires: Berlin trip is temporary
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "i'm at a conference in berlin until wednesday"
  - "User is at a conference in Berlin until Wednesday." -> add as fact (No related memory exists yet.)

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

Engine decisions:
- "which football team do i support?"
  - nothing extracted

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

Engine decisions:
- "how far is the moon from earth?"
  - nothing extracted
