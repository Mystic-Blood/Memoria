# Eval run: v2-final

| | |
|---|---|
| label | `v2-final` |
| engine | `v2` |
| date | `2026-10-16T12:02:11.879Z` |
| git | `b16c101 (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.4` |
| set | `dev` |
| cases | `33` |

## Summary

- **Cases passed: 25/33** (a case passes only if every check passes)
- **Checks passed: 103/117** (88%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 4397 ms, max 18442 ms

### By check type

| check | passed |
|---|---|
| stored | 37/41 |
| max_active | 31/32 |
| not_stored | 10/16 |
| not_active | 9/9 |
| retrieve | 6/7 |
| not_retrieve | 9/10 |
| expires | 1/2 |

### By category

| category | cases | checks |
|---|---|---|
| clean | 3/3 | 7/7 |
| correction | 4/5 | 17/18 |
| change_over_time | 3/3 | 10/10 |
| implicit_reference | 3/3 | 8/8 |
| long_messy | 0/3 | 6/12 |
| multi_fact | 3/4 | 14/15 |
| noise | 3/4 | 8/10 |
| refinement | 3/3 | 6/6 |
| retrieval_relevance | 2/2 | 14/14 |
| state_expiry | 1/2 | 4/6 |
| real_conversation | 0/1 | 9/11 |

## Cases

### PASS clean-01: Simple single fact statement

Stored memories:
- `active` User is allergic to peanuts.

Checks:
- pass stored: User is allergic to peanuts → "User is allergic to peanuts."
- pass max_active: at most 1 active memories → "1 active"

### PASS clean-02: Simple preference

Stored memories:
- `active` User's favorite color is blue.

Checks:
- pass stored: User's favorite color is blue → "User's favorite color is blue."
- pass max_active: at most 1 active memories → "1 active"

### PASS clean-03: Simple fact with slang

Stored memories:
- `active` User's dog is named Rusty.

Checks:
- pass stored: User has a dog named Rusty → "User's dog is named Rusty."
- pass not_stored: He's a good boi (without saying who)
- pass max_active: at most 2 active memories → "1 active"

### PASS corr-01: Correcting a previously stated fact explicitly

Stored memories:
- `superseded` User's favorite color is blue
- `active` User's favorite color is green.

Checks:
- pass stored: User's favorite color is green → "User's favorite color is green."
- pass not_active: User's favorite color is blue
- pass max_active: at most 1 active memories → "1 active"
- pass retrieve "what is my favorite color?": favorite color is green → "User's favorite color is green."
- pass not_retrieve "what is my favorite color?": favorite color is blue
- retrieved for "what is my favorite color?": "User's favorite color is green."

### FAIL corr-02: Changed mind about a preference without naming the subject

Stored memories:
- `superseded` User loves eating sushi
- `active` User hates it now.

Checks:
- **FAIL** stored: User hates sushi
- pass not_active: User loves eating sushi
- pass not_stored: User had a bad experience (no subject)
- pass max_active: at most 2 active memories → "1 active"

### PASS corr-03: Correcting an entity's attribute

Stored memories:
- `active` User's brother is 26 years old.

Checks:
- pass stored: User's brother is 26 years old → "User's brother is 26 years old."
- pass not_active: User's brother is 25 years old
- pass max_active: at most 1 active memories → "1 active"

### PASS corr-04: Self-correction in the same message

Stored memories:
- `active` User drives a Toyota.

Checks:
- pass stored: User drives a Toyota → "User drives a Toyota."
- pass not_active: User drives a Honda
- pass max_active: at most 1 active memories → "1 active"

### PASS corr-05: Implicit negation of a previous fact

Stored memories:
- `superseded` User works at Google
- `superseded` User no longer works at Google.
- `active` User works at Microsoft.

Checks:
- pass stored: User works at Microsoft → "User works at Microsoft."
- pass not_active: User works at Google
- pass max_active: at most 2 active memories → "1 active"

### PASS time-01: Moving to a new city

Stored memories:
- `superseded` User lives in New York
- `active` User lives in Chicago.

Checks:
- pass stored: User lives in Chicago → "User lives in Chicago."
- pass not_active: User lives in New York
- pass max_active: at most 1 active memories → "1 active"

### PASS time-02: New job replacing being a student

Stored memories:
- `superseded` User is a student at MIT
- `active` User graduated from MIT and works as a data scientist at Amazon.

Checks:
- pass stored: User graduated from MIT → "User graduated from MIT and works as a data scientist at Amazon."
- pass stored: User works as a data scientist at Amazon → "User graduated from MIT and works as a data scientist at Amazon."
- pass not_active: User is a student at MIT
- pass max_active: at most 3 active memories → "1 active"

### PASS time-03: Switching phones

Stored memories:
- `superseded` User uses an Android phone
- `active` User uses an iPhone now.

Checks:
- pass stored: User uses an iPhone → "User uses an iPhone now."
- pass not_active: User uses an Android phone
- pass max_active: at most 1 active memories → "1 active"

### PASS implicit-01: Short answer to the assistant's question

Stored memories:
- `active` User currently lives in Seattle.

Checks:
- pass stored: User lives in Seattle → "User currently lives in Seattle."
- pass max_active: at most 1 active memories → "1 active"
- pass retrieve "where do i live?": lives in Seattle → "User currently lives in Seattle."
- retrieved for "where do i live?": "User currently lives in Seattle."

### PASS implicit-02: Referring back to a topic from a previous turn

Stored memories:
- `active` User is working on a project called Phoenix, a new database migration tool.

Checks:
- pass stored: Project Phoenix is a database migration tool → "User is working on a project called Phoenix, a new database migration tool."
- pass max_active: at most 2 active memories → "1 active"

### PASS implicit-03: Pronoun referring to a remembered dog

Stored memories:
- `active` User has a golden retriever named Rover.

Checks:
- pass stored: User's dog Rover is a golden retriever → "User has a golden retriever named Rover."
- pass not_stored: He is a golden retriever (unresolved pronoun)
- pass max_active: at most 2 active memories → "1 active"

### FAIL long-01: Rambling paragraph with one durable fact

Stored memories:
- `active` User woke up late and missed the bus today. _(until 2026-10-17T23:59:59+00:00)_
- `active` User spilled coffee on their shirt today. _(until 2026-10-17T23:59:59+00:00)_
- `active` User found out they are allergic to dairy yesterday. _(until 2026-10-23T23:59:59+00:00)_
- `active` User had to walk in the rain today. _(until 2026-10-17T23:59:59+00:00)_

Checks:
- pass stored: User is allergic to dairy → "User found out they are allergic to dairy yesterday."
- **FAIL** not_stored: User spilled coffee → "User spilled coffee on their shirt today."
- **FAIL** not_stored: User missed the bus → "User woke up late and missed the bus today."
- **FAIL** not_stored: User walked in the rain → "User had to walk in the rain today."
- **FAIL** max_active: at most 1 active memories → "4 active"

### FAIL long-02: Long tech discussion with one real preference

Stored memories:
- `active` User prefers Vercel for personal projects because it is simpler and easier to use, though they find AWS overwhelming and don't love GCP's UI.

Checks:
- pass stored: User always uses Vercel for personal projects → "User prefers Vercel for personal projects because it is simpler and easier to use, though they find AWS overwhelming and don't love GCP's UI."
- **FAIL** not_stored: AWS is overwhelming → "User prefers Vercel for personal projects because it is simpler and easier to use, though they find AWS overwhelming and don't love GCP's UI."
- pass not_stored: GCP is okay
- pass max_active: at most 2 active memories → "1 active"

### FAIL long-03: Stream of consciousness with a family fact

Stored memories:
- `active` User's sister's name is Emily, and they are considering hosting Thanksgiving at her place due to its larger size.

Checks:
- pass stored: User has a sister named Emily → "User's sister's name is Emily, and they are considering hosting Thanksgiving at her place due to its larger size."
- **FAIL** not_stored: They might do thanksgiving at Emily's place → "User's sister's name is Emily, and they are considering hosting Thanksgiving at her place due to its larger size."
- pass max_active: at most 2 active memories → "1 active"

### PASS multi-01: Three distinct facts in one message

Stored memories:
- `active` User is a software engineer.
- `active` User lives in Boston.
- `active` User loves hiking.

Checks:
- pass stored: User is a software engineer → "User is a software engineer."
- pass stored: User lives in Boston → "User lives in Boston."
- pass stored: User loves hiking → "User loves hiking."
- pass max_active: at most 3 active memories → "3 active"

### PASS multi-02: Two related facts

Stored memories:
- `active` User's wife is Sarah.
- `active` User has 2 kids.

Checks:
- pass stored: User's wife is named Sarah → "User's wife is Sarah."
- pass stored: User has 2 kids → "User has 2 kids."
- pass max_active: at most 2 active memories → "2 active"

### PASS multi-03: Three preferences

Stored memories:
- `active` User prefers dark mode.
- `active` User uses vim instead of emacs.
- `active` User uses tabs instead of spaces.

Checks:
- pass stored: User prefers dark mode → "User prefers dark mode."
- pass stored: User prefers vim over emacs → "User uses vim instead of emacs."
- pass stored: User prefers tabs over spaces → "User uses tabs instead of spaces."
- pass max_active: at most 3 active memories → "3 active"

### FAIL multi-04: Project details

Stored memories:
- `active` User is working on project alpha, whose deadline is 2026-10-31 and uses React.

Checks:
- pass stored: User is working on Project Alpha → "User is working on project alpha, whose deadline is 2026-10-31 and uses React."
- **FAIL** stored: Project Alpha deadline is Nov 1st
- pass stored: Project Alpha uses React → "User is working on project alpha, whose deadline is 2026-10-31 and uses React."
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

### PASS noise-03: Hypothetical scenario

Stored memories:
- _(none)_

Checks:
- pass not_stored: User would buy a boat
- pass max_active: at most 0 active memories → "0 active"

### FAIL noise-04: Quoting someone else

Stored memories:
- `active` User's friend John is moving to Paris.

Checks:
- **FAIL** not_stored: User (or John) is moving to Paris → "User's friend John is moving to Paris."
- pass max_active: at most 1 active memories → "1 active"
- **FAIL** not_retrieve "where am i moving?": moving to Paris → "User's friend John is moving to Paris."
- retrieved for "where am i moving?": "User's friend John is moving to Paris."

### PASS refine-01: Narrowing a preference

Stored memories:
- `active` User likes black coffee.

Checks:
- pass stored: User only likes black coffee with no sugar → "User likes black coffee."
- pass max_active: at most 2 active memories → "1 active"

### PASS refine-02: Adding detail to a project

Stored memories:
- `active` User is working on a new social media app called Project Alpha.

Checks:
- pass stored: Project Alpha is a social media app → "User is working on a new social media app called Project Alpha."
- pass max_active: at most 2 active memories → "1 active"

### PASS refine-03: Adding a condition to a fact

Stored memories:
- `active` User goes to the gym on Mondays only if it's raining.

Checks:
- pass stored: User goes to the gym on Mondays only if it rains → "User goes to the gym on Mondays only if it's raining."
- pass max_active: at most 2 active memories → "1 active"

### PASS retrieval-01: Retrieve only the relevant memory out of many

Stored memories:
- `active` User likes pizza
- `active` User works as a plumber
- `active` User lives in Texas
- `active` User has a cat named Whiskers
- `active` User speaks Spanish fluently
- `active` User's favorite movie is The Matrix
- `active` User studied history in college
- `active` User drives a Ford F150

Checks:
- pass not_stored: User asks about their pet
- pass max_active: at most 8 active memories → "8 active"
- pass retrieve "what kind of pet do i have?": User has a cat named Whiskers → "User has a cat named Whiskers"
- pass not_retrieve "what kind of pet do i have?": User likes pizza
- pass not_retrieve "what kind of pet do i have?": User drives a Ford F150
- pass retrieve "what language do i speak?": User speaks Spanish fluently → "User speaks Spanish fluently"
- pass not_retrieve "what language do i speak?": User works as a plumber
- pass not_retrieve "what language do i speak?": User studied history
- retrieved for "what kind of pet do i have?": "User has a cat named Whiskers"
- retrieved for "what language do i speak?": "User speaks Spanish fluently"

### PASS retrieval-02: Query unrelated to every stored memory (should retrieve nothing)

Stored memories:
- `active` User is 30 years old
- `active` User likes playing tennis
- `active` User's mother is named Susan
- `active` User is allergic to penicillin

Checks:
- pass not_stored: User wants to know the capital of France
- pass max_active: at most 4 active memories → "4 active"
- pass not_retrieve "what is the capital of France?": User is 30 years old
- pass not_retrieve "what is the capital of France?": User likes playing tennis
- pass not_retrieve "what is the capital of France?": User's mother is named Susan
- pass not_retrieve "what is the capital of France?": User is allergic to penicillin
- retrieved for "what is the capital of France?": _(nothing)_

### PASS state-01: Temporary travel fact gets an end date

Stored memories:
- `active` User is visiting Tokyo until 2026-10-20. _(until 2026-10-20T23:59:59+00:00)_

Checks:
- pass stored: User is visiting Tokyo → "User is visiting Tokyo until 2026-10-20."
- pass expires: Tokyo visit ends next Friday → "User is visiting Tokyo until 2026-10-20."
- pass max_active: at most 1 active memories → "1 active"

### FAIL state-02: Temporary health condition gets an end date

Stored memories:
- _(none)_

Checks:
- **FAIL** stored: User is sick with the flu this week
- **FAIL** expires: Flu is temporary
- pass max_active: at most 1 active memories → "0 active"

### FAIL jack-01: The owner's own test conversation (2026-10-16): typos, many facts, a contradiction, recall later

Stored memories:
- `active` User's name is Jack.
- `active` User likes mango smoothies.
- `superseded` User likes strawberry smoothies.
- `active` User owns a mansion in Saudi Arabia.
- `active` User has a private jet worth 5 million dollars.
- `active` User has been to 21 different countries.
- `active` User hates strawberries.

Checks:
- pass stored: User's name is Jack → "User's name is Jack."
- **FAIL** stored: User loves bananas
- pass stored: User likes mango smoothies → "User likes mango smoothies."
- pass stored: User owns a mansion in Saudi Arabia → "User owns a mansion in Saudi Arabia."
- pass stored: User owns a private jet worth $5 million → "User has a private jet worth 5 million dollars."
- pass stored: User has visited 21 countries → "User has been to 21 different countries."
- pass stored: User hates strawberries → "User hates strawberries."
- pass not_active: User likes strawberries
- **FAIL** retrieve "what's my name and how much did my private jet cost?": User's name is Jack
- pass retrieve "what's my name and how much did my private jet cost?": Private jet worth $5 million → "User has a private jet worth 5 million dollars."
- pass retrieve "which fruit do i hate?": User hates strawberries → "User hates strawberries."
- retrieved for "what's my name and how much did my private jet cost?": "User has a private jet worth 5 million dollars."
- retrieved for "which fruit do i hate?": "User hates strawberries."
