# Eval run: gemini-dev

| | |
|---|---|
| label | `gemini-dev` |
| engine | `v2` |
| date | `2026-10-17T06:14:02.623Z` |
| git | `103434c (uncommitted changes)` |
| models | `{"backend":"google","chat":"gemini-3.5-flash-lite","extraction":"gemini-3.1-flash-lite","reconcile":"gemini-3.1-flash-lite","embedding":"gemini-embedding-001"}` |
| ollama | `ollama version is 0.40.5` |
| set | `dev` |
| cases | `49` |

## Summary

- **Cases passed: 40/49** (a case passes only if every check passes)
- **Checks passed: 148/163** (91%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 13426 ms, max 58243 ms

### By check type

| check | passed |
|---|---|
| stored | 63/65 |
| max_active | 33/35 |
| not_stored | 20/24 |
| not_active | 12/14 |
| retrieve | 10/10 |
| not_retrieve | 6/10 |
| expires | 4/4 |
| not_permanent | 0/1 |

### By category

| category | cases | checks |
|---|---|---|
| clean | 3/3 | 7/7 |
| correction | 5/5 | 18/18 |
| change_over_time | 0/3 | 5/10 |
| implicit_reference | 3/3 | 8/8 |
| long_messy | 2/3 | 9/12 |
| multi_fact | 4/4 | 15/15 |
| noise | 4/4 | 10/10 |
| refinement | 3/3 | 6/6 |
| retrieval_relevance | 0/2 | 10/14 |
| state_expiry | 2/2 | 6/6 |
| real_conversation | 1/2 | 16/17 |
| conversation | 13/15 | 38/40 |

## Cases

### PASS clean-01: Simple single fact statement

Stored memories:
- `active` User is allergic to peanuts.

Checks:
- pass stored: User is allergic to peanuts → "User is allergic to peanuts."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "i am allergic to peanuts."
  - "User is allergic to peanuts." -> add as fact (No related memory exists yet.)

### PASS clean-02: Simple preference

Stored memories:
- `active` User's favorite color is blue.

Checks:
- pass stored: User's favorite color is blue → "User's favorite color is blue."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "my favorite color is blue"
  - "User's favorite color is blue." -> add as preference (No related memory exists yet.)

### PASS clean-03: Simple fact with slang

Stored memories:
- `active` User has a dog named Rusty.

Checks:
- pass stored: User has a dog named Rusty → "User has a dog named Rusty."
- pass not_stored: He's a good boi (without saying who)
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "my dog is named rusty and he's a good boi"
  - "User has a dog named Rusty." -> add as fact (No related memory exists yet.)

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

Engine decisions:
- "actually my favorite color is green now"
  - "User's favorite color is green." -> supersede as preference (The user explicitly stated their favorite color has changed from blue to green.)

### PASS corr-02: Changed mind about a preference without naming the subject

Stored memories:
- `superseded` User loves eating sushi
- `active` User no longer likes eating sushi.

Checks:
- pass stored: User hates sushi → "User no longer likes eating sushi."
- pass not_active: User loves eating sushi
- pass not_stored: User had a bad experience (no subject)
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "actually i hate it now. bad experience."
  - "User no longer likes eating sushi." -> supersede as preference (The user explicitly stated they no longer like sushi, contradicting the previous memory.)

### PASS corr-03: Correcting an entity's attribute

Stored memories:
- `superseded` User's brother is 25 years old
- `active` User's brother is 26 years old.

Checks:
- pass stored: User's brother is 26 years old → "User's brother is 26 years old."
- pass not_active: User's brother is 25 years old
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "wait i meant my brother is 26, sorry."
  - "User's brother is 26 years old." -> supersede as fact (The user corrected the age of their brother.)

### PASS corr-04: Self-correction in the same message

Stored memories:
- `active` User drives a Toyota.

Checks:
- pass stored: User drives a Toyota → "User drives a Toyota."
- pass not_active: User drives a Honda
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "I drive a honda, wait no, I drive a toyota."
  - "User drives a Toyota." -> add as fact (No related memory exists yet.)

### PASS corr-05: Implicit negation of a previous fact

Stored memories:
- `superseded` User works at Google
- `superseded` User no longer works at Google.
- `active` User works at Microsoft.

Checks:
- pass stored: User works at Microsoft → "User works at Microsoft."
- pass not_active: User works at Google
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "i don't work there anymore, im at microsoft now"
  - "User no longer works at Google." -> supersede as fact (The user explicitly stated they no longer work at Google and have moved to Microsoft.)
  - "User works at Microsoft." -> supersede as fact (The user updated their employment status from not working at Google to working at Microsoft.)

### FAIL time-01: Moving to a new city

Stored memories:
- `superseded` User lives in New York
- `superseded` User lives in Chicago.
- `active` User no longer lives in New York.

Checks:
- **FAIL** stored: User lives in Chicago
- **FAIL** not_active: User lives in New York → "User no longer lives in New York."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "i just moved to chicago!"
  - "User lives in Chicago." -> supersede as fact (The user moved to a new city, making the previous location memory outdated.)
  - "User no longer lives in New York." -> supersede as fact (The user explicitly stated they moved to Chicago, which replaces the previous location.)

### FAIL time-02: New job replacing being a student

Stored memories:
- `superseded` User is a student at MIT
- `active` User is no longer a student at MIT.
- `active` User works as a data scientist at Amazon.

Checks:
- **FAIL** stored: User graduated from MIT
- pass stored: User works as a data scientist at Amazon → "User works as a data scientist at Amazon."
- pass not_active: User is a student at MIT
- pass max_active: at most 3 active memories → "2 active"

Engine decisions:
- "I graduated and just started working as a data scientist at Amazon."
  - "User is no longer a student at MIT." -> supersede as fact (The user has graduated and changed their professional status from student to data scientist.)
  - "User works as a data scientist at Amazon." -> add as fact (The new fact provides information about the user's current employment which is not covered by existing memories.)

### FAIL time-03: Switching phones

Stored memories:
- `active` User uses an Android phone
- `superseded` User no longer uses an Android phone.
- `active` User uses an iPhone.

Checks:
- pass stored: User uses an iPhone → "User uses an iPhone."
- **FAIL** not_active: User uses an Android phone → "User uses an Android phone"
- **FAIL** max_active: at most 1 active memories → "2 active"

Engine decisions:
- "i finally switched to iphone yesterday"
  - "User no longer uses an Android phone." -> add as fact (Stored as a new memory.) [guard: reconciliation failed (error)]
  - "User uses an iPhone." -> supersede as fact (The user explicitly stated they switched to an iPhone, replacing the previous status of not using an Android.)

### PASS implicit-01: Short answer to the assistant's question

Stored memories:
- `active` User lives in Seattle.

Checks:
- pass stored: User lives in Seattle → "User lives in Seattle."
- pass max_active: at most 1 active memories → "1 active"
- pass retrieve "where do i live?": lives in Seattle → "User lives in Seattle."
- retrieved for "where do i live?": "User lives in Seattle."

Engine decisions:
- "seattle."
  - "User lives in Seattle." -> add as fact (No related memory exists yet.)

### PASS implicit-02: Referring back to a topic from a previous turn

Stored memories:
- `active` User is working on a project called Phoenix, which is a database migration tool.

Checks:
- pass stored: Project Phoenix is a database migration tool → "User is working on a project called Phoenix, which is a database migration tool."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "let's talk about my project called Phoenix"
  - "User is working on a project called Phoenix." -> add as fact (No related memory exists yet.)
- "it's a new database migration tool."
  - "User's project Phoenix is a database migration tool." -> update as fact (The new fact provides specific details about the existing project mentioned in m1.)

### PASS implicit-03: Pronoun referring to a remembered dog

Stored memories:
- `active` User has a dog named Rover
- `active` User's dog Rover is a golden retriever.

Checks:
- pass stored: User's dog Rover is a golden retriever → "User's dog Rover is a golden retriever."
- pass not_stored: He is a golden retriever (unresolved pronoun)
- pass max_active: at most 2 active memories → "2 active"

Engine decisions:
- "he is a golden retriever btw"
  - "User's dog Rover is a golden retriever." -> add as fact (Stored as a new memory.) [guard: reconciliation failed (error)]

### PASS long-01: Rambling paragraph with one durable fact

Stored memories:
- `active` User is allergic to dairy.

Checks:
- pass stored: User is allergic to dairy → "User is allergic to dairy."
- pass not_stored: User spilled coffee
- pass not_stored: User missed the bus
- pass not_stored: User walked in the rain
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "man today was so crazy. i woke up late, spilled coffee on my shirt, missed the b"
  - "User is allergic to dairy." -> add as fact (No related memory exists yet.)

### FAIL long-02: Long tech discussion with one real preference

Stored memories:
- `active` User prefers using Vercel for personal projects because it is simple and does not require infrastructure management.
- `active` User finds AWS services overwhelming.
- `active` User dislikes the user interface of GCP.

Checks:
- pass stored: User always uses Vercel for personal projects → "User prefers using Vercel for personal projects because it is simple and does not require infrastructure management."
- **FAIL** not_stored: AWS is overwhelming → "User finds AWS services overwhelming."
- **FAIL** not_stored: GCP is okay → "User dislikes the user interface of GCP."
- **FAIL** max_active: at most 2 active memories → "3 active"

Engine decisions:
- "I've been looking into different cloud providers lately. AWS has so many service"
  - "User prefers using Vercel for personal projects because it is simple and does not require infrastructure management." -> add as preference (No related memory exists yet.)
  - "User finds AWS services overwhelming." -> add as preference (The new fact about AWS is distinct from the existing memory about Vercel.)
  - "User dislikes the user interface of GCP." -> add as preference (The user's dislike for GCP's UI is a new fact not covered by existing memories.)

### PASS long-03: Stream of consciousness with a family fact

Stored memories:
- `active` User has a sister named Emily.

Checks:
- pass stored: User has a sister named Emily → "User has a sister named Emily."
- pass not_stored: They might do thanksgiving at Emily's place
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "so i was talking to my sister emily yesterday about the upcoming holidays and we"
  - "User has a sister named Emily." -> add as fact (No related memory exists yet.)

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

Engine decisions:
- "im a software engineer, i live in boston, and i love hiking"
  - "User is a software engineer." -> add as fact (No related memory exists yet.)
  - "User lives in Boston." -> add as fact (The new fact about location is distinct from the existing memory about the user's profession.)
  - "User loves hiking." -> add as preference (Stored as a new memory.) [guard: reconciliation failed (error)]

### PASS multi-02: Two related facts

Stored memories:
- `active` User's wife is named Sarah.
- `active` User has 2 children.

Checks:
- pass stored: User's wife is named Sarah → "User's wife is named Sarah."
- pass stored: User has 2 kids → "User has 2 children."
- pass max_active: at most 2 active memories → "2 active"

Engine decisions:
- "my wife is sarah and we have 2 kids"
  - "User's wife is named Sarah." -> add as fact (No related memory exists yet.)
  - "User has 2 children." -> add as fact (The new fact provides information about the user's children which is not covered by existing memories.)

### PASS multi-03: Three preferences

Stored memories:
- `active` User prefers dark mode.
- `active` User prefers vim over emacs.
- `active` User prefers tabs instead of spaces.

Checks:
- pass stored: User prefers dark mode → "User prefers dark mode."
- pass stored: User prefers vim over emacs → "User prefers vim over emacs."
- pass stored: User prefers tabs over spaces → "User prefers tabs instead of spaces."
- pass max_active: at most 3 active memories → "3 active"

Engine decisions:
- "i prefer dark mode, vim over emacs, and tabs instead of spaces"
  - "User prefers dark mode." -> add as preference (No related memory exists yet.)
  - "User prefers vim over emacs." -> add as preference (The new fact introduces a preference for a text editor which is not covered by existing memories.)
  - "User prefers tabs instead of spaces." -> add as preference (The new fact introduces a preference not covered by existing memories.)

### PASS multi-04: Project details

Stored memories:
- `active` User is working on project Alpha using React with a deadline of November 1st. _(until 2026-11-01T23:59:59+00:00)_

Checks:
- pass stored: User is working on Project Alpha → "User is working on project Alpha using React with a deadline of November 1st."
- pass stored: Project Alpha deadline is Nov 1st → "User is working on project Alpha using React with a deadline of November 1st."
- pass stored: Project Alpha uses React → "User is working on project Alpha using React with a deadline of November 1st."
- pass max_active: at most 3 active memories → "1 active"

Engine decisions:
- "working on project alpha. the deadline is nov 1st. it uses react."
  - "User is working on project Alpha." -> add as temporary until 2026-11-01 (No related memory exists yet.)
  - "User uses React for project Alpha." -> update as temporary until 2026-11-01 (The new information adds specific technical and scheduling details to the existing project memory.)

### PASS noise-01: Small talk and transient state

Stored memories:
- _(none)_

Checks:
- pass not_stored: User is tired
- pass not_stored: User says hello
- pass max_active: at most 0 active memories → "0 active"

Engine decisions:
- "hello! i'm feeling so tired today. how are you?"
  - nothing extracted

### PASS noise-02: Question seeking information

Stored memories:
- _(none)_

Checks:
- pass not_stored: User wants to know the weather
- pass max_active: at most 0 active memories → "0 active"

Engine decisions:
- "do you know what the weather will be like tomorrow?"
  - nothing extracted

### PASS noise-03: Hypothetical scenario

Stored memories:
- _(none)_

Checks:
- pass not_stored: User would buy a boat
- pass max_active: at most 0 active memories → "0 active"

Engine decisions:
- "if i were a millionaire, i would buy a boat"
  - nothing extracted

### PASS noise-04: Quoting someone else

Stored memories:
- _(none)_

Checks:
- pass not_stored: User (or John) is moving to Paris
- pass max_active: at most 1 active memories → "0 active"
- pass not_retrieve "where am i moving?": moving to Paris
- retrieved for "where am i moving?": _(nothing)_

Engine decisions:
- "my friend john said 'i am moving to paris'"
  - nothing extracted

### PASS refine-01: Narrowing a preference

Stored memories:
- `active` User likes black coffee without sugar.

Checks:
- pass stored: User only likes black coffee with no sugar → "User likes black coffee without sugar."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "fyi i only like black coffee, no sugar"
  - "User prefers black coffee without sugar." -> update as preference (The new fact provides specific details about the user's coffee preference.)

### PASS refine-02: Adding detail to a project

Stored memories:
- `active` User is working on Project Alpha, a social media app.

Checks:
- pass stored: Project Alpha is a social media app → "User is working on Project Alpha, a social media app."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "Project Alpha is a new social media app btw"
  - "User is working on a social media app called Project Alpha." -> update as fact (The new fact adds specific detail about the nature of the project the user is working on.)

### PASS refine-03: Adding a condition to a fact

Stored memories:
- `superseded` User goes to the gym on mondays
- `superseded` User no longer goes to the gym every Monday.
- `active` User goes to the gym on Mondays only if it is raining.

Checks:
- pass stored: User goes to the gym on Mondays only if it rains → "User goes to the gym on Mondays only if it is raining."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "I only go to the gym on mondays if it's raining"
  - "User no longer goes to the gym every Monday." -> supersede as fact (The new fact replaces the previous absolute statement with a conditional one.)
  - "User goes to the gym on Mondays only if it is raining." -> supersede as preference (The new fact provides a specific condition for gym attendance on Mondays, replacing the previous statement that they no longer go.)

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

Checks:
- pass not_stored: User asks about their pet
- pass max_active: at most 8 active memories → "8 active"
- pass retrieve "what kind of pet do i have?": User has a cat named Whiskers → "User has a cat named Whiskers"
- pass not_retrieve "what kind of pet do i have?": User likes pizza
- **FAIL** not_retrieve "what kind of pet do i have?": User drives a Ford F150 → "User drives a Ford F150"
- pass retrieve "what language do i speak?": User speaks Spanish fluently → "User speaks Spanish fluently"
- pass not_retrieve "what language do i speak?": User works as a plumber
- **FAIL** not_retrieve "what language do i speak?": User studied history → "User studied history in college"
- retrieved for "what kind of pet do i have?": "User has a cat named Whiskers", "User drives a Ford F150", "User lives in Texas"
- retrieved for "what language do i speak?": "User speaks Spanish fluently", "User lives in Texas", "User drives a Ford F150", "User has a cat named Whiskers", "User's favorite movie is The Matrix", "User studied history in college"

Engine decisions:
- "what kind of pet do i have?"
  - nothing extracted

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
- pass not_retrieve "what is the capital of France?": User likes playing tennis
- **FAIL** not_retrieve "what is the capital of France?": User's mother is named Susan → "User's mother is named Susan"
- pass not_retrieve "what is the capital of France?": User is allergic to penicillin
- retrieved for "what is the capital of France?": "User is 30 years old", "User's mother is named Susan"

Engine decisions:
- "what is the capital of France?"
  - nothing extracted

### PASS state-01: Temporary travel fact gets an end date

Stored memories:
- `active` User is visiting Tokyo until next Friday. _(until 2026-10-23T23:59:59+00:00)_

Checks:
- pass stored: User is visiting Tokyo → "User is visiting Tokyo until next Friday."
- pass expires: Tokyo visit ends next Friday → "User is visiting Tokyo until next Friday."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "im visiting tokyo until next friday"
  - "User is visiting Tokyo until next Friday." -> add as temporary until 2026-10-23 (No related memory exists yet.)

### PASS state-02: Temporary health condition gets an end date

Stored memories:
- `active` User has the flu and cannot work. _(until 2026-10-24T23:59:59+00:00)_

Checks:
- pass stored: User is sick with the flu this week → "User has the flu and cannot work."
- pass expires: Flu is temporary → "User has the flu and cannot work."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "i am super sick with the flu this week, can't work"
  - "User has the flu and cannot work." -> add as temporary until 2026-10-24 (No related memory exists yet.)

### PASS jack-01: The owner's own test conversation (2026-10-16): typos, many facts, a contradiction, recall later

Stored memories:
- `active` User's name is Jack.
- `active` User loves bananas.
- `active` User likes mango smoothies but dislikes strawberries.
- `active` User does not know if a combination of banana, mango, and strawberry would taste good.
- `active` User owns a mansion in Saudi Arabia.
- `active` User owns a private jet worth 5 million dollars.
- `active` User has visited 21 different countries.

Checks:
- pass stored: User's name is Jack → "User's name is Jack."
- pass stored: User loves bananas → "User loves bananas.", "User does not know if a combination of banana, mango, and strawberry would taste good."
- pass stored: User likes mango smoothies → "User likes mango smoothies but dislikes strawberries.", "User does not know if a combination of banana, mango, and strawberry would taste good."
- pass stored: User owns a mansion in Saudi Arabia → "User owns a mansion in Saudi Arabia."
- pass stored: User owns a private jet worth $5 million → "User owns a private jet worth 5 million dollars."
- pass stored: User has visited 21 countries → "User has visited 21 different countries."
- pass stored: User hates strawberries → "User likes mango smoothies but dislikes strawberries.", "User does not know if a combination of banana, mango, and strawberry would taste good."
- pass not_active: User likes strawberries
- pass retrieve "what's my name and how much did my private jet cost?": User's name is Jack → "User's name is Jack."
- pass retrieve "what's my name and how much did my private jet cost?": Private jet worth $5 million → "User owns a private jet worth 5 million dollars."
- pass retrieve "which fruit do i hate?": User hates strawberries → "User likes mango smoothies but dislikes strawberries.", "User does not know if a combination of banana, mango, and strawberry would taste good."
- retrieved for "what's my name and how much did my private jet cost?": "User's name is Jack.", "User owns a private jet worth 5 million dollars."
- retrieved for "which fruit do i hate?": "User's name is Jack.", "User likes mango smoothies but dislikes strawberries.", "User does not know if a combination of banana, mango, and strawberry would taste good.", "User loves bananas."

Engine decisions:
- "hello my name is jack. I love bananas"
  - "User's name is Jack." -> add as fact (No related memory exists yet.)
  - "User loves bananas." -> add as preference (The new fact about loving bananas is not covered by existing memories.)
- "i like the mango smoothies very much and even strawbeery too"
  - "User likes mango smoothies." -> add as preference (The user expressed a preference for mango and strawberry smoothies, which is a new fact not covered by existing memories.)
  - "User likes strawberry smoothies." -> update as preference (The new fact adds a new flavor preference to the existing memory about smoothies.)
- "nah i dont know if the combianon will give waht taste"
  - "User does not know if a combination of banana, mango, and strawberry would taste good." -> add as preference (This is a new opinion about a specific combination of fruits that was not previously mentioned.)
- "btw u know i own a mansion in saudi arabia . I even have a private jet worth 5 m"
  - "User owns a mansion in Saudi Arabia." -> add as fact (The new fact introduces information about the user's assets which is not covered by existing memories.)
  - "User owns a private jet worth 5 million dollars." -> add as fact (The new fact about the private jet is distinct from existing memories.)
- "yeah i know i have been to 21 differnt countires by now"
  - "User has visited 21 different countries." -> add as fact (This is a new fact about the user's travel history that does not overlap with existing memories.)
- "but i hate strawberries"
  - "User no longer likes strawberries." -> update as preference (The user explicitly stated they no longer like strawberries, requiring an update to the existing preference.)

### FAIL ash-01: The owner's second test conversation (2026-10-16): facts spread over turns, a plan for today; v2 once merged them into one run-on memory

Stored memories:
- `active` User's name is Ash.
- `active` User is a Pokemon master.
- `active` User is attempting to catch an exhausted legendary Pokemon at 5 pm today. _(until 2026-10-17T23:59:59+00:00)_
- `active` User attends school near a playground where Lugia and Darkrai are fighting.
- `active` User caught a Pikachu.

Checks:
- pass stored: User's name is Ash → "User's name is Ash."
- pass stored: User is a Pokémon master → "User is a Pokemon master."
- pass stored: User caught a Pikachu → "User caught a Pikachu."
- pass not_active: One run-on memory mixing "Pokémon master" with the plan for today
- **FAIL** not_permanent: Today's plan to catch a legendary Pokémon → "User attends school near a playground where Lugia and Darkrai are fighting."
- pass retrieve "what's my name?": User's name is Ash → "User's name is Ash."
- retrieved for "what's my name?": "User's name is Ash."

Engine decisions:
- "i m ash and i m a pokemon master"
  - "User's name is Ash." -> add as fact (No related memory exists yet.)
  - "User is a Pokemon master." -> add as fact (The new fact provides information about the user's status that is not covered by the existing memory.)
- "we gonna catch a legendary pokemon today"
  - "User is attempting to catch a legendary Pokemon today." -> add as temporary until 2026-10-17 (This is a new, specific activity that does not contradict or overlap with existing memories.)
- "i heard we can see lugia and darkari fight near my school playground"
  - "User attends school near a playground where Lugia and Darkrai are fighting." -> add as fact (This is a new fact about the user's location and current surroundings that does not contradict existing memories.)
- "around 5 pm today we gonna catch the exhausted pokemon in the end"
  - "User plans to catch an exhausted legendary Pokemon at 5 pm today." -> update as temporary until 2026-10-17 (The new fact adds specific details about the timing and condition of the Pokemon to the existing memory.)
- "woah i caught a pikachu in the journey"
  - "User caught a Pikachu." -> add as fact (This is a new fact about the user's journey that does not conflict with or repeat existing memories.)

### PASS conv-intro-01: Introduction spread over several turns, with a past job

Stored memories:
- `active` User's name is Meera.
- `active` User has been a product manager at a fintech startup in Bangalore for two years.
- `active` User previously worked at Flipkart.

Checks:
- pass stored: User's name is Meera → "User's name is Meera."
- pass stored: User is a product manager at a fintech startup → "User has been a product manager at a fintech startup in Bangalore for two years."
- pass stored: User is based in Bangalore → "User has been a product manager at a fintech startup in Bangalore for two years."
- pass not_active: User currently works at Flipkart
- pass retrieve "where do i work?": product manager at a fintech startup → "User has been a product manager at a fintech startup in Bangalore for two years."
- retrieved for "where do i work?": "User previously worked at Flipkart.", "User has been a product manager at a fintech startup in Bangalore for two years.", "User's name is Meera."

Engine decisions:
- "hey im meera btw"
  - "User's name is Meera." -> add as fact (No related memory exists yet.)
- "product manager at a fintech startup in bangalore"
  - "User is a product manager." -> add as fact (The new fact provides professional information that does not conflict with the existing memory about the user's name.)
  - "User works at a fintech startup." -> update as fact (The new fact adds specific details about the user's workplace and location to their existing job title.)
  - "User lives in Bangalore." -> skip (The existing memory already specifies that the user is in Bangalore.)
- "like 2 yrs. before that i was at flipkart"
  - "User has been a product manager at a fintech startup for two years." -> update as fact (The new fact adds duration to the existing employment information.)
  - "User previously worked at Flipkart." -> add as fact (The new fact provides information about the user's past employment history that is not covered by existing memories.)

### PASS conv-trip-01: A trip with a start and a length (should expire)

Stored memories:
- `active` User is travelling to Goa for a 5-day holiday starting next Tuesday with their sister. _(until 2026-10-25T23:59:59+00:00)_

Checks:
- pass stored: User is going to Goa → "User is travelling to Goa for a 5-day holiday starting next Tuesday with their sister."
- pass expires: The Goa trip is temporary → "User is travelling to Goa for a 5-day holiday starting next Tuesday with their sister."

Engine decisions:
- "flying to goa next tuesday for 5 days!!"
  - "User is travelling to Goa for 5 days starting next Tuesday." -> add as temporary until 2026-10-25 (No related memory exists yet.)
- "holiday, finally. my sister is coming too"
  - "User is travelling to Goa for a holiday." -> update as temporary until 2026-10-25 (The new fact adds the purpose of the trip and the companion to the existing travel plans.)
  - "User's sister is joining them on their trip to Goa." -> skip (The existing memory already mentions that the user is travelling with their sister.)

### PASS conv-correction-01: Correcting a number several turns later

Stored memories:
- `active` User has a 7-year-old daughter who is obsessed with drawing, mostly cats.

Checks:
- pass stored: User's daughter is 7 → "User has a 7-year-old daughter who is obsessed with drawing, mostly cats."
- pass stored: User's daughter loves drawing → "User has a 7-year-old daughter who is obsessed with drawing, mostly cats."
- pass not_active: User's daughter is 6

Engine decisions:
- "my daughter is 6 and obsessed with drawing"
  - "User has a daughter who is 6 years old." -> add as fact (No related memory exists yet.)
  - "User's daughter loves drawing." -> update as fact (The new fact adds detail about the daughter's interests to the existing memory.)
- "mostly cats lol"
  - "User's daughter mostly draws cats." -> update as fact (The new fact adds specific detail about the daughter's drawing habits to the existing memory.)
- "oh wait sorry shes actually 7 now, just had her birthday"
  - "User's daughter is 7 years old." -> update as fact (The user provided a correction to their daughter's age.)

### PASS conv-preference-change-01: A preference that changed some time ago

Stored memories:
- `active` User switched from drinking four coffees a day to drinking green tea.

Checks:
- pass stored: User drinks green tea → "User switched from drinking four coffees a day to drinking green tea."
- pass not_active: User drinks a lot of coffee

Engine decisions:
- "i used to drink like 4 coffees a day but switched to green tea a few months back"
  - "User switched from drinking four coffees a day to drinking green tea." -> add as fact (No related memory exists yet.)

### PASS conv-venting-01: Venting with one lasting fact at the end

Stored memories:
- `active` User is a vegetarian.

Checks:
- pass stored: User is vegetarian → "User is a vegetarian."
- pass not_stored: Traffic was bad / it rained
- pass not_stored: User asked for a joke

Engine decisions:
- "ugh traffic was insane today and it rained the whole way"
  - nothing extracted
- "tell me a joke"
  - nothing extracted
- "lol ok. anyway im vegetarian so suggest me a dinner idea"
  - "User is a vegetarian." -> add as preference (No related memory exists yet.)

### PASS conv-third-party-01: A friend's news next to the user's own situation

Stored memories:
- `active` User is currently job hunting.

Checks:
- pass stored: User is job hunting → "User is currently job hunting."
- pass not_stored: User works at Google

Engine decisions:
- "my friend rahul just got a job at google, im so jealous lol. still job hunting m"
  - "User is currently job hunting." -> add as fact (No related memory exists yet.)

### FAIL conv-pronoun-01: Details about "it" spread over turns

Stored memories:
- `active` User owns a matte black Royal Enfield Classic 350 motorcycle and rides it to work every day.

Checks:
- pass stored: User owns a Royal Enfield Classic 350 → "User owns a matte black Royal Enfield Classic 350 motorcycle and rides it to work every day."
- pass stored: User rides the bike to work every day → "User owns a matte black Royal Enfield Classic 350 motorcycle and rides it to work every day."
- **FAIL** not_stored: User rides it to work (unresolved "it") → "User owns a matte black Royal Enfield Classic 350 motorcycle and rides it to work every day."

Engine decisions:
- "got a new bike last week"
  - "User bought a new bike." -> add as fact (No related memory exists yet.)
- "royal enfield classic 350, matte black"
  - "User owns a Royal Enfield Classic 350 motorcycle." -> update as fact (The new fact provides specific details about the bike the user owns.)
  - "User's motorcycle is matte black." -> skip (The new fact is already captured by the existing memory.)
- "yeah i ride it to work every day"
  - "User rides their Royal Enfield Classic 350 to work every day." -> update as fact (The new fact adds specific usage information to the existing memory about the motorcycle.)

### PASS conv-injury-01: A temporary health situation with a duration

Stored memories:
- `active` User pulled a muscle in their back at the gym and cannot lift weights for two weeks. _(until 2026-10-31T23:59:59+00:00)_

Checks:
- pass stored: User has a back injury / cannot lift → "User pulled a muscle in their back at the gym and cannot lift weights for two weeks."
- pass expires: The back injury is temporary → "User pulled a muscle in their back at the gym and cannot lift weights for two weeks."

Engine decisions:
- "pulled a muscle in my back at the gym"
  - "User pulled a muscle in their back at the gym." -> add as temporary until 2026-10-24 (No related memory exists yet.)
- "yeah doc said no lifting for 2 weeks"
  - "User cannot lift weights for two weeks due to a back muscle injury." -> update as temporary until 2026-10-31 (The new fact adds specific recovery instructions to the existing injury memory.)

### PASS conv-hypothetical-mixed-01: A daydream next to a real plan

Stored memories:
- `active` User is saving up to buy a flat in Pune.

Checks:
- pass stored: User is saving for a flat in Pune → "User is saving up to buy a flat in Pune."
- pass not_stored: User wants to buy a farm

Engine decisions:
- "if i won the lottery i'd buy a farm in the hills. realistically tho im saving up"
  - "User is saving up to buy a flat in Pune." -> add as fact (No related memory exists yet.)

### PASS conv-roleplay-01: Asking the assistant to play a role while sharing real goals

Stored memories:
- `active` User is training for a 10k race in December and runs about 15 km a week, mostly at a slow pace. _(until 2026-12-31T23:59:59+00:00)_

Checks:
- pass stored: User is training for a 10k race in December → "User is training for a 10k race in December and runs about 15 km a week, mostly at a slow pace."
- pass stored: User runs about 15 km a week → "User is training for a 10k race in December and runs about 15 km a week, mostly at a slow pace."
- pass not_stored: The assistant is the user's coach

Engine decisions:
- "be my running coach ok? i'm training for a 10k race in december"
  - "User is training for a 10k race in December." -> add as temporary until 2026-12-31 (No related memory exists yet.)
- "about 15 km a week, mostly slow"
  - "User runs about 15 km a week." -> update as temporary until 2026-12-31 (The new fact adds specific training volume and intensity details to the existing training goal.)
  - "User prefers to run at a slow pace." -> skip (The existing memory already states that the user runs at a slow pace.)

### PASS conv-short-answer-01: Short answer that only makes sense with the question

Stored memories:
- `active` User has a beagle.
- `active` User has a cat.

Checks:
- pass stored: User has a beagle → "User has a beagle."
- pass stored: User has a cat → "User has a cat."
- pass retrieve "what pets do i have?": User has a beagle → "User has a beagle."
- retrieved for "what pets do i have?": "User has a cat.", "User has a beagle."

Engine decisions:
- "two. a beagle and a cat"
  - "User has a beagle." -> add as fact (No related memory exists yet.)
  - "User has a cat." -> add as fact (The user has a new pet that is different from the existing one.)

### PASS conv-typos-01: Heavy typos, a like and a dislike

Stored memories:
- `active` User's favorite food is biryani.
- `active` User dislikes brinjal.

Checks:
- pass stored: User's favorite food is biryani → "User's favorite food is biryani."
- pass stored: User dislikes brinjal → "User dislikes brinjal."
- pass not_active: User likes brinjal

Engine decisions:
- "ma fav food is biriyani nd i hate brinjal lol"
  - "User's favorite food is biryani." -> add as preference (No related memory exists yet.)
  - "User dislikes brinjal." -> add as preference (The new fact about disliking brinjal is distinct from the existing memory about favorite food.)

### PASS conv-name-change-01: A different name when one is already known

Stored memories:
- `superseded` User's name is Priya.
- `active` User's name is Meera.
- `active` User is a chemistry teacher.

Checks:
- pass stored: User teaches chemistry → "User is a chemistry teacher."
- pass max_active: at most 2 active memories → "2 active"

Engine decisions:
- "hi there, my name is Meera and I teach chemistry"
  - "User's name is Meera." -> supersede as fact (The user provided a new name that contradicts the existing name memory.)
  - "User is a chemistry teacher." -> add as fact (The new fact provides professional information not covered by the existing memory about the user's name.)

### FAIL conv-assistant-task-01: Asking for help with a task is not a fact about the user

Stored memories:
- `superseded` User prefers locations with lakes for weekend getaways.
- `active` User prefers locations with beaches for weekend getaways.

Checks:
- **FAIL** not_stored: User wants help with a getaway → "User prefers locations with beaches for weekend getaways."
- pass not_stored: User wants a top 3 list
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "can u help me sort out a weekend getaway somewhere close by"
  - nothing extracted
- "idk somewhere with lakes. gimme your top 3"
  - "User prefers locations with lakes for weekend getaways." -> add as preference (No related memory exists yet.)
- "nah forget that, what about a beach"
  - "User prefers locations with beaches for weekend getaways." -> supersede as preference (The user explicitly stated to forget the previous preference for lakes in favor of beaches.)

### PASS conv-typo-fix-01: Obvious typos are corrected in the stored memory

Stored memories:
- `active` User's favorite drink is a strawberry smoothie.

Checks:
- pass stored: User's favorite drink is a strawberry smoothie → "User's favorite drink is a strawberry smoothie."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "my fav drink is a strawbery smoothy"
  - "User's favorite drink is a strawberry smoothie." -> add as preference (No related memory exists yet.)
