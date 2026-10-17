# Eval run: baseline-v1

| | |
|---|---|
| label | `baseline-v1` |
| engine | `v1` |
| date | `2026-10-16T11:17:42.190Z` |
| git | `5d0038f (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"llama3:8b","extraction":"llama3:8b","contradiction":"llama3:8b","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.4` |
| cases | `33` |

## Summary

- **Cases passed: 6/33** (a case passes only if every check passes)
- **Checks passed: 60/117** (51%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 4
- Background processing per user turn: median 3786 ms, max 5233 ms

### By check type

| check | passed |
|---|---|
| stored | 17/41 |
| max_active | 27/32 |
| not_stored | 11/16 |
| not_active | 2/9 |
| retrieve | 3/7 |
| not_retrieve | 0/10 |
| expires | 0/2 |

### By category

| category | cases | checks |
|---|---|---|
| clean | 2/3 | 6/7 |
| correction | 0/5 | 5/18 |
| change_over_time | 0/3 | 4/10 |
| implicit_reference | 0/3 | 3/8 |
| long_messy | 1/3 | 10/12 |
| multi_fact | 1/4 | 9/15 |
| noise | 2/4 | 6/10 |
| refinement | 0/3 | 3/6 |
| retrieval_relevance | 0/2 | 5/14 |
| state_expiry | 0/2 | 4/6 |
| real_conversation | 0/1 | 5/11 |

## Cases

### PASS clean-01: Simple single fact statement

Stored memories:
- `active` allergic to peanuts

Checks:
- pass stored: User is allergic to peanuts → "allergic to peanuts"
- pass max_active: at most 1 active memories → "1 active"

### PASS clean-02: Simple preference

Stored memories:
- `active`  favorite color: blue

Checks:
- pass stored: User's favorite color is blue → " favorite color: blue"
- pass max_active: at most 1 active memories → "1 active"

### FAIL clean-03: Simple fact with slang

Stored memories:
- `active` Rusty

Checks:
- **FAIL** stored: User has a dog named Rusty
- pass not_stored: He's a good boi (without saying who)
- pass max_active: at most 2 active memories → "1 active"

### FAIL corr-01: Correcting a previously stated fact explicitly

Stored memories:
- `active` User's favorite color is blue
- `active` favorite color

Checks:
- **FAIL** stored: User's favorite color is green
- **FAIL** not_active: User's favorite color is blue → "User's favorite color is blue"
- **FAIL** max_active: at most 1 active memories → "2 active"
- **FAIL** retrieve "what is my favorite color?": favorite color is green
- **FAIL** not_retrieve "what is my favorite color?": favorite color is blue → "User's favorite color is blue"
- retrieved for "what is my favorite color?": "favorite color", "User's favorite color is blue"

### FAIL corr-02: Changed mind about a preference without naming the subject

Stored memories:
- `active` User loves eating sushi
- `active` bad experience

Checks:
- **FAIL** stored: User hates sushi
- **FAIL** not_active: User loves eating sushi → "User loves eating sushi"
- **FAIL** not_stored: User had a bad experience (no subject) → "bad experience"
- pass max_active: at most 2 active memories → "2 active"

### FAIL corr-03: Correcting an entity's attribute

Stored memories:
- `active` User's brother is 25 years old
- `flagged` My brother is 26

Checks:
- **FAIL** stored: User's brother is 26 years old
- **FAIL** not_active: User's brother is 25 years old → "User's brother is 25 years old"
- pass max_active: at most 1 active memories → "1 active"

### FAIL corr-04: Self-correction in the same message

Stored memories:
- `active` mode_of_transportation

Checks:
- **FAIL** stored: User drives a Toyota
- pass not_active: User drives a Honda
- pass max_active: at most 1 active memories → "1 active"

### FAIL corr-05: Implicit negation of a previous fact

Stored memories:
- `active` User works at Google
- `active` previous employer

Checks:
- **FAIL** stored: User works at Microsoft
- **FAIL** not_active: User works at Google → "User works at Google"
- pass max_active: at most 2 active memories → "2 active"

### FAIL time-01: Moving to a new city

Stored memories:
- `active` User lives in New York
- `active` resided in Chicago

Checks:
- pass stored: User lives in Chicago → "resided in Chicago"
- **FAIL** not_active: User lives in New York → "User lives in New York"
- **FAIL** max_active: at most 1 active memories → "2 active"

### FAIL time-02: New job replacing being a student

Stored memories:
- `active` User is a student at MIT
- `active` graduated

Checks:
- pass stored: User graduated from MIT → "graduated"
- **FAIL** stored: User works as a data scientist at Amazon
- **FAIL** not_active: User is a student at MIT → "User is a student at MIT"
- pass max_active: at most 3 active memories → "2 active"

### FAIL time-03: Switching phones

Stored memories:
- `active` User uses an Android phone
- `active` switched to iPhone

Checks:
- pass stored: User uses an iPhone → "switched to iPhone"
- **FAIL** not_active: User uses an Android phone → "User uses an Android phone"
- **FAIL** max_active: at most 1 active memories → "2 active"

### FAIL implicit-01: Short answer to the assistant's question

Stored memories:
- `active` I am currently focusing on a destination related to travel and exploration.

Checks:
- **FAIL** stored: User lives in Seattle
- pass max_active: at most 1 active memories → "1 active"
- **FAIL** retrieve "where do i live?": lives in Seattle
- retrieved for "where do i live?": "I am currently focusing on a destination related to travel and exploration."

### FAIL implicit-02: Referring back to a topic from a previous turn

Stored memories:
- `active` Phoenix
- `active` Recently used a new database migration tool

Checks:
- **FAIL** stored: Project Phoenix is a database migration tool
- pass max_active: at most 2 active memories → "2 active"

### FAIL implicit-03: Pronoun referring to a remembered dog

Stored memories:
- `active` User has a dog named Rover
- `active` he is a golden retriever

Checks:
- **FAIL** stored: User's dog Rover is a golden retriever
- **FAIL** not_stored: He is a golden retriever (unresolved pronoun) → "he is a golden retriever"
- pass max_active: at most 2 active memories → "2 active"

### PASS long-01: Rambling paragraph with one durable fact

Stored memories:
- `active` allergic to dairy

Checks:
- pass stored: User is allergic to dairy → "allergic to dairy"
- pass not_stored: User spilled coffee
- pass not_stored: User missed the bus
- pass not_stored: User walked in the rain
- pass max_active: at most 1 active memories → "1 active"

### FAIL long-02: Long tech discussion with one real preference

Stored memories:
- `active` Amazon Web Services (AWS)

Checks:
- **FAIL** stored: User always uses Vercel for personal projects
- pass not_stored: AWS is overwhelming
- pass not_stored: GCP is okay
- pass max_active: at most 2 active memories → "1 active"

### FAIL long-03: Stream of consciousness with a family fact

Stored memories:
- `active` Emily, sister, Thanksgiving, hers or mine

Checks:
- pass stored: User has a sister named Emily → "Emily, sister, Thanksgiving, hers or mine"
- **FAIL** not_stored: They might do thanksgiving at Emily's place → "Emily, sister, Thanksgiving, hers or mine"
- pass max_active: at most 2 active memories → "1 active"

### FAIL multi-01: Three distinct facts in one message

Stored memories:
- `active` Software Engineer

Checks:
- pass stored: User is a software engineer → "Software Engineer"
- **FAIL** stored: User lives in Boston
- **FAIL** stored: User loves hiking
- pass max_active: at most 3 active memories → "1 active"

### FAIL multi-02: Two related facts

Stored memories:
- `active` Sarah

Checks:
- **FAIL** stored: User's wife is named Sarah
- **FAIL** stored: User has 2 kids
- pass max_active: at most 2 active memories → "1 active"

### FAIL multi-03: Three preferences

Stored memories:
- `active` preferred dark mode

Checks:
- pass stored: User prefers dark mode → "preferred dark mode"
- **FAIL** stored: User prefers vim over emacs
- **FAIL** stored: User prefers tabs over spaces
- pass max_active: at most 3 active memories → "1 active"

### PASS multi-04: Project details

Stored memories:
- `active` project.alpha.deadline:Nov 1st react

Checks:
- pass stored: User is working on Project Alpha → "project.alpha.deadline:Nov 1st react"
- pass stored: Project Alpha deadline is Nov 1st → "project.alpha.deadline:Nov 1st react"
- pass stored: Project Alpha uses React → "project.alpha.deadline:Nov 1st react"
- pass max_active: at most 3 active memories → "1 active"

### PASS noise-01: Small talk and transient state

Stored memories:
- _(none)_

Checks:
- pass not_stored: User is tired
- pass not_stored: User says hello
- pass max_active: at most 0 active memories → "0 active"

### PASS noise-02: Question seeking information

Stored memories:
- _(none)_

Checks:
- pass not_stored: User wants to know the weather
- pass max_active: at most 0 active memories → "0 active"

### FAIL noise-03: Hypothetical scenario

Stored memories:
- `active` buying a boat

Checks:
- **FAIL** not_stored: User would buy a boat → "buying a boat"
- **FAIL** max_active: at most 0 active memories → "1 active"

### FAIL noise-04: Quoting someone else

Stored memories:
- `active` Friend John stated that he is moving to Paris.

Checks:
- **FAIL** not_stored: User (or John) is moving to Paris → "Friend John stated that he is moving to Paris."
- pass max_active: at most 1 active memories → "1 active"
- **FAIL** not_retrieve "where am i moving?": moving to Paris → "Friend John stated that he is moving to Paris."
- retrieved for "where am i moving?": "Friend John stated that he is moving to Paris."

### FAIL refine-01: Narrowing a preference

Stored memories:
- `active` User likes coffee

Checks:
- **FAIL** stored: User only likes black coffee with no sugar
- pass max_active: at most 2 active memories → "1 active"

### FAIL refine-02: Adding detail to a project

Stored memories:
- `active` User is working on Project Alpha

Checks:
- **FAIL** stored: Project Alpha is a social media app
- pass max_active: at most 2 active memories → "1 active"

Pipeline errors:
- `[API Error] STRUCTURED_OUTPUT_FAILED: Non-transient error: AI_NoObjectGeneratedError: No object generated: response did not match schema. (cause: Type validation failed: Value: {"hasMemory":true,"memory":{"type":"state","content":"Personal interest or participation in digital platform development","confidence_score":99.5,"explicitness_score":1}}.
Error message: [
  {
    "origin": "number",
    "c`
- `[Memory Extractor] Generation failed or malformed output Error: STRUCTURED_OUTPUT_FAILED (cause: No object generated: response did not match schema.)`

### FAIL refine-03: Adding a condition to a fact

Stored memories:
- `active` User goes to the gym on mondays
- `active` exercise

Checks:
- **FAIL** stored: User goes to the gym on Mondays only if it rains
- pass max_active: at most 2 active memories → "2 active"

### FAIL retrieval-01: Retrieve only the relevant memory out of many

Stored memories:
- `active` User likes pizza
- `active` User works as a plumber
- `active` User lives in Texas
- `active` User has a cat named Whiskers
- `active` User speaks Spanish fluently
- `active` User's favorite movie is The Matrix
- `active` User studied history in college
- `active` User drives a Ford F150
- `active` pet

Checks:
- pass not_stored: User asks about their pet
- **FAIL** max_active: at most 8 active memories → "9 active"
- pass retrieve "what kind of pet do i have?": User has a cat named Whiskers → "User has a cat named Whiskers"
- **FAIL** not_retrieve "what kind of pet do i have?": User likes pizza → "User likes pizza"
- **FAIL** not_retrieve "what kind of pet do i have?": User drives a Ford F150 → "User drives a Ford F150"
- pass retrieve "what language do i speak?": User speaks Spanish fluently → "User speaks Spanish fluently"
- **FAIL** not_retrieve "what language do i speak?": User works as a plumber → "User works as a plumber"
- **FAIL** not_retrieve "what language do i speak?": User studied history → "User studied history in college"
- retrieved for "what kind of pet do i have?": "pet", "User has a cat named Whiskers", "User likes pizza", "User works as a plumber", "User drives a Ford F150", "User lives in Texas", "User speaks Spanish fluently", "User studied history in college", "User's favorite movie is The Matrix"
- retrieved for "what language do i speak?": "User speaks Spanish fluently", "User lives in Texas", "pet", "User studied history in college", "User likes pizza", "User has a cat named Whiskers", "User works as a plumber", "User drives a Ford F150", "User's favorite movie is The Matrix"

### FAIL retrieval-02: Query unrelated to every stored memory (should retrieve nothing)

Stored memories:
- `active` User is 30 years old
- `active` User likes playing tennis
- `active` User's mother is named Susan
- `active` User is allergic to penicillin

Checks:
- pass not_stored: User wants to know the capital of France
- pass max_active: at most 4 active memories → "4 active"
- **FAIL** not_retrieve "what is the capital of France?": User is 30 years old → "User is 30 years old"
- **FAIL** not_retrieve "what is the capital of France?": User likes playing tennis → "User likes playing tennis"
- **FAIL** not_retrieve "what is the capital of France?": User's mother is named Susan → "User's mother is named Susan"
- **FAIL** not_retrieve "what is the capital of France?": User is allergic to penicillin → "User is allergic to penicillin"
- retrieved for "what is the capital of France?": "User likes playing tennis", "User is 30 years old", "User's mother is named Susan", "User is allergic to penicillin"

Pipeline errors:
- `[API Error] STRUCTURED_OUTPUT_FAILED: Non-transient error: AI_NoObjectGeneratedError: No object generated: response did not match schema. (cause: Type validation failed: Value: {"hasMemory":true,"memory":{"type":"entity","content":"Paris","confidence_score":100,"explicitness_score":1}}.
Error message: [
  {
    "origin": "number",
    "code": "too_big",
    "maximum": 1,
    "inclusive": true,
   `
- `[Memory Extractor] Generation failed or malformed output Error: STRUCTURED_OUTPUT_FAILED (cause: No object generated: response did not match schema.)`

### FAIL state-01: Temporary travel fact gets an end date

Stored memories:
- `active` Visiting Tokyo until next Friday

Checks:
- pass stored: User is visiting Tokyo → "Visiting Tokyo until next Friday"
- **FAIL** expires: Tokyo visit ends next Friday
- pass max_active: at most 1 active memories → "1 active"

### FAIL state-02: Temporary health condition gets an end date

Stored memories:
- `active` flu

Checks:
- pass stored: User is sick with the flu this week → "flu"
- **FAIL** expires: Flu is temporary
- pass max_active: at most 1 active memories → "1 active"

### FAIL jack-01: The owner's own test conversation (2026-10-16): typos, many facts, a contradiction, recall later

Stored memories:
- `active` name
- `active` fruit preferences
- `active` owns a mansion in Saudi Arabia
- `active` Have visited 21 different countries
- `active` The user has a strong dislike for strawberries.

Checks:
- **FAIL** stored: User's name is Jack
- **FAIL** stored: User loves bananas
- **FAIL** stored: User likes mango smoothies
- pass stored: User owns a mansion in Saudi Arabia → "owns a mansion in Saudi Arabia"
- **FAIL** stored: User owns a private jet worth $5 million
- pass stored: User has visited 21 countries → "Have visited 21 different countries"
- pass stored: User hates strawberries → "The user has a strong dislike for strawberries."
- pass not_active: User likes strawberries
- **FAIL** retrieve "what's my name and how much did my private jet cost?": User's name is Jack
- **FAIL** retrieve "what's my name and how much did my private jet cost?": Private jet worth $5 million
- pass retrieve "which fruit do i hate?": User hates strawberries → "The user has a strong dislike for strawberries."
- retrieved for "what's my name and how much did my private jet cost?": "name", "owns a mansion in Saudi Arabia", "Have visited 21 different countries", "The user has a strong dislike for strawberries.", "fruit preferences"
- retrieved for "which fruit do i hate?": "fruit preferences", "The user has a strong dislike for strawberries.", "name", "Have visited 21 different countries", "owns a mansion in Saudi Arabia"
