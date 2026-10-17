# Eval run: dev-after-test-chat

| | |
|---|---|
| label | `dev-after-test-chat` |
| engine | `v2` |
| date | `2026-10-17T01:54:53.574Z` |
| git | `922986d (uncommitted changes)` |
| models | `{"backend":"ollama","chat":"qwen2.5:7b-instruct","extraction":"qwen2.5:7b-instruct","reconcile":"qwen2.5:7b-instruct","embedding":"nomic-embed-text"}` |
| ollama | `ollama version is 0.40.5` |
| set | `dev` |
| cases | `49` |

## Summary

- **Cases passed: 39/49** (a case passes only if every check passes)
- **Checks passed: 148/163** (91%)
- Cases with a fatal error: 0
- Pipeline errors logged (silently swallowed by the engine): 0
- Background processing per user turn: median 17310 ms, max 76801 ms

### By check type

| check | passed |
|---|---|
| stored | 62/65 |
| max_active | 33/35 |
| not_stored | 17/24 |
| not_active | 12/14 |
| retrieve | 10/10 |
| not_retrieve | 10/10 |
| expires | 3/4 |
| not_permanent | 1/1 |

### By category

| category | cases | checks |
|---|---|---|
| clean | 3/3 | 7/7 |
| correction | 4/5 | 16/18 |
| change_over_time | 2/3 | 9/10 |
| implicit_reference | 3/3 | 8/8 |
| long_messy | 1/3 | 7/12 |
| multi_fact | 4/4 | 15/15 |
| noise | 3/4 | 8/10 |
| refinement | 3/3 | 6/6 |
| retrieval_relevance | 2/2 | 14/14 |
| state_expiry | 1/2 | 5/6 |
| real_conversation | 1/2 | 16/17 |
| conversation | 12/15 | 37/40 |

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
  - "User's favorite color is blue." -> add as fact (No related memory exists yet.)

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
  - "User's favorite color is green." -> supersede as preference (New favorite color contradicts existing memory.)

### FAIL corr-02: Changed mind about a preference without naming the subject

Stored memories:
- `active` User loves eating sushi

Checks:
- **FAIL** stored: User hates sushi
- **FAIL** not_active: User loves eating sushi → "User loves eating sushi"
- pass not_stored: User had a bad experience (no subject)
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "actually i hate it now. bad experience."
  - nothing extracted

### PASS corr-03: Correcting an entity's attribute

Stored memories:
- `active` User's brother is 26 years old.

Checks:
- pass stored: User's brother is 26 years old → "User's brother is 26 years old."
- pass not_active: User's brother is 25 years old
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "wait i meant my brother is 26, sorry."
  - "User's brother is 26 years old." -> update as fact (New age updates the existing memory.)

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
  - "User no longer works at Google." -> supersede as fact (User's current job has changed.)
  - "User works at Microsoft." -> supersede as fact (New job information replaces old one.)

### PASS time-01: Moving to a new city

Stored memories:
- `superseded` User lives in New York
- `active` User has moved to Chicago.

Checks:
- pass stored: User lives in Chicago → "User has moved to Chicago."
- pass not_active: User lives in New York
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "i just moved to chicago!"
  - "User has moved to Chicago." -> supersede as fact (New location information replaces old one.)

### FAIL time-02: New job replacing being a student

Stored memories:
- `superseded` User is a student at MIT
- `superseded` User graduated from MIT.
- `active` User is now working as a data scientist at Amazon.

Checks:
- **FAIL** stored: User graduated from MIT
- pass stored: User works as a data scientist at Amazon → "User is now working as a data scientist at Amazon."
- pass not_active: User is a student at MIT
- pass max_active: at most 3 active memories → "1 active"

Engine decisions:
- "I graduated and just started working as a data scientist at Amazon."
  - "User graduated from MIT." -> supersede as fact (The new fact indicates the user has graduated and started a new job, so the existing memory about being a student needs to be replaced.)
  - "User is now working as a data scientist at Amazon." -> supersede as fact (The new fact updates the user's current job.)

### PASS time-03: Switching phones

Stored memories:
- `superseded` User uses an Android phone
- `active` User switched to an iPhone on 2026-10-17.

Checks:
- pass stored: User uses an iPhone → "User switched to an iPhone on 2026-10-17."
- pass not_active: User uses an Android phone
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "i finally switched to iphone yesterday"
  - "User switched to an iPhone on 2026-10-17." -> supersede as fact (User switched to iPhone.)

### PASS implicit-01: Short answer to the assistant's question

Stored memories:
- `active` User currently lives in Seattle.

Checks:
- pass stored: User lives in Seattle → "User currently lives in Seattle."
- pass max_active: at most 1 active memories → "1 active"
- pass retrieve "where do i live?": lives in Seattle → "User currently lives in Seattle."
- retrieved for "where do i live?": "User currently lives in Seattle."

Engine decisions:
- "seattle."
  - "User currently lives in Seattle." -> add as fact (No related memory exists yet.)

### PASS implicit-02: Referring back to a topic from a previous turn

Stored memories:
- `active` User is working on a project called Phoenix, a new database migration tool.

Checks:
- pass stored: Project Phoenix is a database migration tool → "User is working on a project called Phoenix, a new database migration tool."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "let's talk about my project called Phoenix"
  - "User is working on a project called Phoenix." -> add as fact (No related memory exists yet.)
- "it's a new database migration tool."
  - "User's project Phoenix is a new database migration tool." -> update as fact (Added detail about the nature of the project.)

### PASS implicit-03: Pronoun referring to a remembered dog

Stored memories:
- `active` User has a golden retriever named Rover.

Checks:
- pass stored: User's dog Rover is a golden retriever → "User has a golden retriever named Rover."
- pass not_stored: He is a golden retriever (unresolved pronoun)
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "he is a golden retriever btw"
  - "User's dog Rover is a golden retriever." -> update as fact (Added breed information to the existing memory.)

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

### PASS long-02: Long tech discussion with one real preference

Stored memories:
- `active` User prefers Vercel for personal projects due to its simplicity.

Checks:
- pass stored: User always uses Vercel for personal projects → "User prefers Vercel for personal projects due to its simplicity."
- pass not_stored: AWS is overwhelming
- pass not_stored: GCP is okay
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "I've been looking into different cloud providers lately. AWS has so many service"
  - "User prefers Vercel for personal projects due to its simplicity." -> add as fact (No related memory exists yet.)

### FAIL long-03: Stream of consciousness with a family fact

Stored memories:
- `active` User has a sister named Emily.
- `active` User and Emily are considering hosting Thanksgiving at Emily's place due to its larger size.

Checks:
- pass stored: User has a sister named Emily → "User has a sister named Emily."
- **FAIL** not_stored: They might do thanksgiving at Emily's place → "User and Emily are considering hosting Thanksgiving at Emily's place due to its larger size."
- pass max_active: at most 2 active memories → "2 active"

Engine decisions:
- "so i was talking to my sister emily yesterday about the upcoming holidays and we"
  - "User has a sister named Emily." -> add as fact (No related memory exists yet.)
  - "User and Emily are considering hosting Thanksgiving at Emily's place due to its larger size." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.66 < 0.8)]

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
  - "User lives in Boston." -> add as fact (New fact adds information about the user's location and hobby.)
  - "User loves hiking." -> add as fact (New fact about user's hobby.)

### PASS multi-02: Two related facts

Stored memories:
- `active` User has a wife named Sarah.
- `active` User has 2 kids.

Checks:
- pass stored: User's wife is named Sarah → "User has a wife named Sarah."
- pass stored: User has 2 kids → "User has 2 kids."
- pass max_active: at most 2 active memories → "2 active"

Engine decisions:
- "my wife is sarah and we have 2 kids"
  - "User has a wife named Sarah." -> add as fact (No related memory exists yet.)
  - "User has 2 kids." -> add as fact (The new fact adds information about the user's children without contradicting the existing memory about his wife.)

### PASS multi-03: Three preferences

Stored memories:
- `active` User prefers dark mode.
- `active` User prefers vim over emacs.
- `active` User uses tabs instead of spaces.

Checks:
- pass stored: User prefers dark mode → "User prefers dark mode."
- pass stored: User prefers vim over emacs → "User prefers vim over emacs."
- pass stored: User prefers tabs over spaces → "User uses tabs instead of spaces."
- pass max_active: at most 3 active memories → "3 active"

Engine decisions:
- "i prefer dark mode, vim over emacs, and tabs instead of spaces"
  - "User prefers dark mode." -> add as preference (No related memory exists yet.)
  - "User prefers vim over emacs." -> add as preference (New preferences for text editor and tab/space style added.)
  - "User uses tabs instead of spaces." -> add as preference (New preference for tab usage is added as a separate memory.)

### PASS multi-04: Project details

Stored memories:
- `active` User is working on a project called Alpha with a deadline of November 1st.
- `active` User's project Alpha uses React.

Checks:
- pass stored: User is working on Project Alpha → "User is working on a project called Alpha with a deadline of November 1st.", "User's project Alpha uses React."
- pass stored: Project Alpha deadline is Nov 1st → "User is working on a project called Alpha with a deadline of November 1st."
- pass stored: Project Alpha uses React → "User's project Alpha uses React."
- pass max_active: at most 3 active memories → "2 active"

Engine decisions:
- "working on project alpha. the deadline is nov 1st. it uses react."
  - "User is working on a project called Alpha with a deadline of November 1st." -> add as fact (No related memory exists yet.)
  - "User's project Alpha uses React." -> add as fact (Added information about the technology used in the project.)

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

### FAIL noise-03: Hypothetical scenario

Stored memories:
- `active` User wishes they were a millionaire and would buy a boat.

Checks:
- **FAIL** not_stored: User would buy a boat → "User wishes they were a millionaire and would buy a boat."
- **FAIL** max_active: at most 0 active memories → "1 active"

Engine decisions:
- "if i were a millionaire, i would buy a boat"
  - "User wishes they were a millionaire and would buy a boat." -> add as preference (No related memory exists yet.)

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
- `active` User likes black coffee, no sugar.

Checks:
- pass stored: User only likes black coffee with no sugar → "User likes black coffee, no sugar."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "fyi i only like black coffee, no sugar"
  - "User likes black coffee and no sugar." -> update as fact (Added detail about coffee preference.)

### PASS refine-02: Adding detail to a project

Stored memories:
- `active` User is working on Project Alpha, a new social media app.

Checks:
- pass stored: Project Alpha is a social media app → "User is working on Project Alpha, a new social media app."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "Project Alpha is a new social media app btw"
  - "User is working on Project Alpha, which is a new social media app." -> update as fact (Added detail about Project Alpha being a new social media app.)

### PASS refine-03: Adding a condition to a fact

Stored memories:
- `active` User goes to the gym on Mondays only if it's raining.

Checks:
- pass stored: User goes to the gym on Mondays only if it rains → "User goes to the gym on Mondays only if it's raining."
- pass max_active: at most 2 active memories → "1 active"

Engine decisions:
- "I only go to the gym on mondays if it's raining"
  - "User only goes to the gym on Mondays if it's raining." -> update as fact (Added condition to the existing memory.)

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

Engine decisions:
- "what kind of pet do i have?"
  - "User has a cat named Whiskers." -> skip (An identical memory already exists.)

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

Engine decisions:
- "what is the capital of France?"
  - nothing extracted

### PASS state-01: Temporary travel fact gets an end date

Stored memories:
- `active` User is visiting Tokyo until next Friday. _(until 2026-10-21T23:59:59+00:00)_

Checks:
- pass stored: User is visiting Tokyo → "User is visiting Tokyo until next Friday."
- pass expires: Tokyo visit ends next Friday → "User is visiting Tokyo until next Friday."
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "im visiting tokyo until next friday"
  - "User is visiting Tokyo until next Friday." -> add as temporary until 2026-10-21 (No related memory exists yet.)

### FAIL state-02: Temporary health condition gets an end date

Stored memories:
- `active` User is sick with the flu and cannot work this week.

Checks:
- pass stored: User is sick with the flu this week → "User is sick with the flu and cannot work this week."
- **FAIL** expires: Flu is temporary
- pass max_active: at most 1 active memories → "1 active"

Engine decisions:
- "i am super sick with the flu this week, can't work"
  - "User is sick with the flu and cannot work this week." -> add as fact (No related memory exists yet.)

### PASS jack-01: The owner's own test conversation (2026-10-16): typos, many facts, a contradiction, recall later

Stored memories:
- `active` User's name is Jack.
- `active` User loves bananas.
- `active` User Jack likes mango smoothies very much.
- `active` User Jack no longer combines banana, mango, and strawberry in smoothies, and no longer likes strawberries.
- `active` User Jack owns a mansion in Saudi Arabia.
- `active` User Jack owns a private jet worth 5 million dollars.
- `active` User Jack has visited 21 different countries.

Checks:
- pass stored: User's name is Jack → "User's name is Jack."
- pass stored: User loves bananas → "User loves bananas.", "User Jack no longer combines banana, mango, and strawberry in smoothies, and no longer likes strawberries."
- pass stored: User likes mango smoothies → "User Jack likes mango smoothies very much.", "User Jack no longer combines banana, mango, and strawberry in smoothies, and no longer likes strawberries."
- pass stored: User owns a mansion in Saudi Arabia → "User Jack owns a mansion in Saudi Arabia."
- pass stored: User owns a private jet worth $5 million → "User Jack owns a private jet worth 5 million dollars."
- pass stored: User has visited 21 countries → "User Jack has visited 21 different countries."
- pass stored: User hates strawberries → "User Jack no longer combines banana, mango, and strawberry in smoothies, and no longer likes strawberries."
- pass not_active: User likes strawberries
- pass retrieve "what's my name and how much did my private jet cost?": User's name is Jack → "User's name is Jack.", "User Jack owns a private jet worth 5 million dollars."
- pass retrieve "what's my name and how much did my private jet cost?": Private jet worth $5 million → "User Jack owns a private jet worth 5 million dollars."
- pass retrieve "which fruit do i hate?": User hates strawberries → "User Jack no longer combines banana, mango, and strawberry in smoothies, and no longer likes strawberries."
- retrieved for "what's my name and how much did my private jet cost?": "User's name is Jack.", "User Jack owns a private jet worth 5 million dollars."
- retrieved for "which fruit do i hate?": "User's name is Jack.", "User Jack no longer combines banana, mango, and strawberry in smoothies, and no longer likes strawberries.", "User Jack likes mango smoothies very much.", "User loves bananas."

Engine decisions:
- "hello my name is jack. I love bananas"
  - "User's name is Jack." -> add as fact (No related memory exists yet.)
  - "User loves bananas." -> add as preference (New fact adds a new piece of information.)
- "i like the mango smoothies very much and even strawbeery too"
  - "User Jack likes mango smoothies very much." -> add as fact (New fact adds details about liking strawberry smoothies.)
  - "User Jack likes strawberry smoothies." -> add as fact (The new fact adds a new preference without contradicting the existing memory.)
- "nah i dont know if the combianon will give waht taste"
  - "User Jack no longer combines banana, mango, and strawberry in smoothies." -> update as preference (The new fact directly relates to the existing memory about Jack's smoothie preferences.)
- "btw u know i own a mansion in saudi arabia . I even have a private jet worth 5 m"
  - "User Jack owns a mansion in Saudi Arabia." -> add as fact (The new fact introduces a new piece of information not covered by existing memories.)
  - "User Jack owns a private jet worth 5 million dollars." -> add as fact (The new fact adds information about a private jet, which is not covered by any existing memories.)
- "yeah i know i have been to 21 differnt countires by now"
  - "User Jack has visited 21 different countries." -> add as fact (The new fact is about a new aspect of the user's life that doesn't overlap with existing memories.)
- "but i hate strawberries"
  - "User Jack no longer likes strawberries." -> update as fact (Updated the existing memory to reflect the new dislike for strawberries.)

### FAIL ash-01: The owner's second test conversation (2026-10-16): facts spread over turns, a plan for today; v2 once merged them into one run-on memory

Stored memories:
- `active` User's name is Ash.
- `active` User considers themselves a Pokémon master.
- `active` User Ash plans to catch a legendary Pokémon today. _(until 2026-10-17T23:59:59+00:00)_
- `active` User Ash plans to see Lugia and Darkrai fight near their school playground today. _(until 2026-10-17T23:59:59+00:00)_

Checks:
- pass stored: User's name is Ash → "User's name is Ash."
- pass stored: User is a Pokémon master → "User considers themselves a Pokémon master."
- **FAIL** stored: User caught a Pikachu
- pass not_active: One run-on memory mixing "Pokémon master" with the plan for today
- pass not_permanent: Today's plan to catch a legendary Pokémon
- pass retrieve "what's my name?": User's name is Ash → "User's name is Ash."
- retrieved for "what's my name?": "User's name is Ash."

Engine decisions:
- "i m ash and i m a pokemon master"
  - "User's name is Ash." -> add as fact (No related memory exists yet.)
  - "User considers themselves a Pokemon master." -> add as preference (New fact adds information about the user's self-perception.)
- "we gonna catch a legendary pokemon today"
  - "User Ash is a Pokémon master." -> update as fact (New fact adds detail to the existing memory.)
  - "User Ash plans to catch a legendary Pokémon today." -> add as temporary until 2026-10-17 (The new fact is about a future plan and not covered by existing memories.)
- "i heard we can see lugia and darkari fight near my school playground"
  - "User Ash plans to see Lugia and Darkrai fight near their school playground today." -> add as temporary until 2026-10-17 (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.67 < 0.8)]
- "around 5 pm today we gonna catch the exhausted pokemon in the end"
  - nothing extracted
- "woah i caught a pikachu in the journey"
  - nothing extracted

### PASS conv-intro-01: Introduction spread over several turns, with a past job

Stored memories:
- `active` User's name is Meera.
- `active` User is a product manager at a fintech startup in Bangalore for 2 years.
- `active` User was previously at Flipkart before that.

Checks:
- pass stored: User's name is Meera → "User's name is Meera."
- pass stored: User is a product manager at a fintech startup → "User is a product manager at a fintech startup in Bangalore for 2 years."
- pass stored: User is based in Bangalore → "User is a product manager at a fintech startup in Bangalore for 2 years."
- pass not_active: User currently works at Flipkart
- pass retrieve "where do i work?": product manager at a fintech startup → "User is a product manager at a fintech startup in Bangalore for 2 years."
- retrieved for "where do i work?": "User's name is Meera.", "User is a product manager at a fintech startup in Bangalore for 2 years.", "User was previously at Flipkart before that."

Engine decisions:
- "hey im meera btw"
  - "User's name is Meera." -> add as fact (No related memory exists yet.)
- "product manager at a fintech startup in bangalore"
  - "User is a product manager at a fintech startup in Bangalore." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.68 < 0.8)]
- "like 2 yrs. before that i was at flipkart"
  - "User has been a product manager at a fintech startup in Bangalore for 2 years." -> update as fact (Added duration to the existing memory.)
  - "User was previously at Flipkart before that." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.72 < 0.8)]

### PASS conv-trip-01: A trip with a start and a length (should expire)

Stored memories:
- `active` User is travelling to Goa from Tuesday to Saturday. _(until 2026-10-22T23:59:59+00:00)_
- `active` User is travelling to Goa for a holiday from Tuesday to Saturday.
- `active` User's sister is coming to Goa.

Checks:
- pass stored: User is going to Goa → "User is travelling to Goa from Tuesday to Saturday.", "User is travelling to Goa for a holiday from Tuesday to Saturday.", "User's sister is coming to Goa."
- pass expires: The Goa trip is temporary → "User is travelling to Goa from Tuesday to Saturday."

Engine decisions:
- "flying to goa next tuesday for 5 days!!"
  - "User is travelling to Goa from Tuesday to Saturday." -> add as temporary until 2026-10-22 (No related memory exists yet.)
- "holiday, finally. my sister is coming too"
  - "User is travelling to Goa for a holiday from Tuesday to Saturday." -> add as fact (New fact adds the reason for the trip.)
  - "User's sister is coming to Goa." -> add as fact (The new fact adds information about the user's sister coming to Goa.)

### FAIL conv-correction-01: Correcting a number several turns later

Stored memories:
- `active` User has a daughter who is 6 years old and likes to draw cats.
- `active` User's daughter is 7 years old.

Checks:
- pass stored: User's daughter is 7 → "User's daughter is 7 years old."
- pass stored: User's daughter loves drawing → "User has a daughter who is 6 years old and likes to draw cats."
- **FAIL** not_active: User's daughter is 6 → "User has a daughter who is 6 years old and likes to draw cats."

Engine decisions:
- "my daughter is 6 and obsessed with drawing"
  - "User has a daughter who is 6 years old." -> add as fact (No related memory exists yet.)
- "mostly cats lol"
  - "User has a daughter who is 6 years old and likes to draw cats." -> update as fact (Added detail about the daughter's hobby.)
- "oh wait sorry shes actually 7 now, just had her birthday"
  - "User's daughter is 7 years old." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.77 < 0.8)]

### PASS conv-preference-change-01: A preference that changed some time ago

Stored memories:
- `active` User used to drink 4 coffees a day but now drinks green tea.

Checks:
- pass stored: User drinks green tea → "User used to drink 4 coffees a day but now drinks green tea."
- pass not_active: User drinks a lot of coffee

Engine decisions:
- "i used to drink like 4 coffees a day but switched to green tea a few months back"
  - "User used to drink 4 coffees a day but now drinks green tea." -> add as fact (No related memory exists yet.)

### PASS conv-venting-01: Venting with one lasting fact at the end

Stored memories:
- `active` User is vegetarian.

Checks:
- pass stored: User is vegetarian → "User is vegetarian."
- pass not_stored: Traffic was bad / it rained
- pass not_stored: User asked for a joke

Engine decisions:
- "ugh traffic was insane today and it rained the whole way"
  - nothing extracted
- "tell me a joke"
  - nothing extracted
- "lol ok. anyway im vegetarian so suggest me a dinner idea"
  - "User is vegetarian." -> add as fact (No related memory exists yet.)

### PASS conv-third-party-01: A friend's news next to the user's own situation

Stored memories:
- `active` User is still job hunting.

Checks:
- pass stored: User is job hunting → "User is still job hunting."
- pass not_stored: User works at Google

Engine decisions:
- "my friend rahul just got a job at google, im so jealous lol. still job hunting m"
  - "User is still job hunting." -> add as fact (No related memory exists yet.)

### FAIL conv-pronoun-01: Details about "it" spread over turns

Stored memories:
- `active` User got a new bike last week.
- `active` User got a Royal Enfield Classic 350 bike, matte black, and rides it to work every day.

Checks:
- pass stored: User owns a Royal Enfield Classic 350 → "User got a Royal Enfield Classic 350 bike, matte black, and rides it to work every day."
- pass stored: User rides the bike to work every day → "User got a Royal Enfield Classic 350 bike, matte black, and rides it to work every day."
- **FAIL** not_stored: User rides it to work (unresolved "it") → "User got a Royal Enfield Classic 350 bike, matte black, and rides it to work every day."

Engine decisions:
- "got a new bike last week"
  - "User got a new bike last week." -> add as fact (No related memory exists yet.)
- "royal enfield classic 350, matte black"
  - "User got a Royal Enfield Classic 350 bike, matte black." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.69 < 0.8)]
- "yeah i ride it to work every day"
  - "User rides their Royal Enfield Classic 350 bike to work every day." -> update as fact (Added daily usage detail to the existing memory.)

### PASS conv-injury-01: A temporary health situation with a duration

Stored memories:
- `active` User has a pulled muscle in their back and cannot lift for 2 weeks. _(until 2026-10-31T23:59:59+00:00)_

Checks:
- pass stored: User has a back injury / cannot lift → "User has a pulled muscle in their back and cannot lift for 2 weeks."
- pass expires: The back injury is temporary → "User has a pulled muscle in their back and cannot lift for 2 weeks."

Engine decisions:
- "pulled a muscle in my back at the gym"
  - "User has pulled a muscle in their back." -> add as fact (No related memory exists yet.)
- "yeah doc said no lifting for 2 weeks"
  - "User has a pulled muscle in their back and cannot lift for 2 weeks." -> update as temporary until 2026-10-31 (Added detail about the duration of the restriction.)

### PASS conv-hypothetical-mixed-01: A daydream next to a real plan

Stored memories:
- `superseded` User would buy a farm in the hills if they won the lottery.
- `active` User is saving up for a flat in Pune.

Checks:
- pass stored: User is saving for a flat in Pune → "User is saving up for a flat in Pune."
- pass not_stored: User wants to buy a farm

Engine decisions:
- "if i won the lottery i'd buy a farm in the hills. realistically tho im saving up"
  - "User would buy a farm in the hills if they won the lottery." -> add as preference (No related memory exists yet.)
  - "User is saving up for a flat in Pune." -> supersede as fact (The new fact provides a more realistic scenario, replacing the original wish.)

### PASS conv-roleplay-01: Asking the assistant to play a role while sharing real goals

Stored memories:
- `active` User is training for a 10k race in December.
- `active` User is running about 15 km a week, mostly at a slow pace.

Checks:
- pass stored: User is training for a 10k race in December → "User is training for a 10k race in December."
- pass stored: User runs about 15 km a week → "User is running about 15 km a week, mostly at a slow pace."
- pass not_stored: The assistant is the user's coach

Engine decisions:
- "be my running coach ok? i'm training for a 10k race in december"
  - "User is training for a 10k race in December." -> add as fact (No related memory exists yet.)
- "about 15 km a week, mostly slow"
  - "User is training for a 10k race in December." -> skip (An identical memory already exists.)
  - "User is running about 15 km a week." -> add as fact (Stored as a separate memory.) [guard: model chose "update" against a memory that is not similar enough (0.69 < 0.8)]
  - "User runs mostly at a slow pace." -> update as fact (Added detail about the pace of the runs.)

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
  - "User has a cat." -> add as fact (New fact adds information about a cat.)

### PASS conv-typos-01: Heavy typos, a like and a dislike

Stored memories:
- `active` User's favorite food is biryani.
- `active` User hates brinjal.

Checks:
- pass stored: User's favorite food is biryani → "User's favorite food is biryani."
- pass stored: User dislikes brinjal → "User hates brinjal."
- pass not_active: User likes brinjal

Engine decisions:
- "ma fav food is biriyani nd i hate brinjal lol"
  - "User's favorite food is biryani." -> add as fact (No related memory exists yet.)
  - "User hates brinjal." -> add as fact (Stored as a separate memory.) [guard: model chose "skip" against a memory that is not similar enough (0.67 < 0.8)]

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
  - "User teaches chemistry." -> add as fact (New fact adds information about the user's profession without contradicting or updating the existing memory.)

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
