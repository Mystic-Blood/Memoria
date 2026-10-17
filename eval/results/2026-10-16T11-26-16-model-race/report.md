# Model race: v2 extraction step

- date: `2026-10-16T11:26:16.208Z`
- git: `5d0038f`
- ollama: `ollama version is 0.40.4`
- simulatedToday: `2026-10-16`
- models: `["qwen3.5:4b","llama3.1:8b","qwen2.5:7b-instruct","llama3:8b","mistral:7b-instruct","phi4-mini","gemma3:4b","granite4:3b"]`

| model | checks passed | stored | not_stored | noise | expires | no_stale | valid JSON | median ms | p95 ms |
|---|---|---|---|---|---|---|---|---|---|
| qwen2.5:7b-instruct | **65/71** (92%) | 37/41 | 14/16 | 3/3 | 2/2 | 9/9 | 39/39 | 1927 | 4864 |
| llama3:8b | **65/71** (92%) | 36/41 | 15/16 | 3/3 | 2/2 | 9/9 | 39/39 | 2326 | 6286 |
| mistral:7b-instruct | **58/71** (82%) | 39/41 | 8/16 | 0/3 | 2/2 | 9/9 | 39/39 | 3638 | 8413 |
| granite4:3b | **57/71** (80%) | 32/41 | 12/16 | 3/3 | 1/2 | 9/9 | 39/39 | 779 | 1985 |
| gemma3:4b | **57/71** (80%) | 38/41 | 8/16 | 0/3 | 2/2 | 9/9 | 39/39 | 1500 | 4707 |
| qwen3.5:4b | **45/71** (63%) | 17/41 | 16/16 | 3/3 | 0/2 | 9/9 | 39/39 | 460 | 1491 |
| phi4-mini | **35/71** (49%) | 8/41 | 15/16 | 3/3 | 0/2 | 9/9 | 39/39 | 563 | 1116 |
| llama3.1:8b | **30/71** (42%) | 2/41 | 16/16 | 3/3 | 0/2 | 9/9 | 39/39 | 800 | 1184 |

## qwen2.5:7b-instruct

Failed checks:
- corr-02 stored: User hates sushi
- corr-05 stored: User works at Microsoft
- long-01 not_stored: User spilled coffee → "User spilled coffee on their shirt today."
- long-01 not_stored: User missed the bus → "User missed the bus today."
- multi-04 stored: Project Alpha deadline is Nov 1st
- jack-01 stored: User's name is Jack

<details><summary>All extractions</summary>

- clean-01#0: "User is allergic to peanuts."
- clean-02#0: "User's favorite color is blue."
- clean-03#0: "User's dog is named Rusty."
- corr-01#0: "User's favorite color is green."
- corr-02#0: "User hates it now." [until 2026-10-16]
- corr-03#0: "User's brother is 26."
- corr-04#0: "User drives a toyota."
- corr-05#0: "User no longer works at there." [until 2026-10-16]
- time-01#0: "User moved to Chicago."
- time-02#0: "User graduated."; "User works as a data scientist at Amazon."
- time-03#0: "User switched to iPhone on 2026-10-15." [until 2026-10-16]
- implicit-01#0: "User lives in Seattle."
- implicit-02#0: "User has a project called Phoenix."
- implicit-02#1: "User's project Phoenix is a new database migration tool."
- implicit-03#0: "User's dog is a golden retriever."
- long-01#0: "User woke up late today." [until 2026-10-16]; "User spilled coffee on their shirt today." [until 2026-10-16]; "User missed the bus today." [until 2026-10-16]; "User decided they are allergic to dairy today." [until 2026-10-16]; "User got tested for dairy allergy yesterday." [until 2026-10-15]
- long-02#0: "User prefers Vercel for personal projects."
- long-03#0: "User's sister is named Emily."
- multi-01#0: "User is a software engineer."; "User lives in Boston."; "User loves hiking."
- multi-02#0: "User's wife is Sarah."; "User has 2 kids."
- multi-03#0: "User prefers dark mode."; "User prefers vim over emacs."; "User prefers tabs instead of spaces."
- multi-04#0: "User is working on project alpha."; "Project alpha uses react."
- noise-01#0: _(empty)_
- noise-02#0: _(empty)_
- noise-03#0: _(empty)_
- noise-04#0: _(empty)_
- refine-01#0: "User only likes black coffee."
- refine-02#0: "User has a project called Project Alpha which is a new social media app."
- refine-03#0: "User goes to the gym on Mondays only if it's raining." [until 2026-10-20]
- retrieval-01#0: _(empty)_
- retrieval-02#0: _(empty)_
- state-01#0: "User is visiting Tokyo until 2026-10-20." [until 2026-10-20]
- state-02#0: "User is super sick with the flu." [until 2026-10-20]; "User can't work." [until 2026-10-20]
- jack-01#0: "User loves bananas."
- jack-01#1: "User likes mango smoothies."; "User likes strawberry smoothies."
- jack-01#2: _(empty)_
- jack-01#3: "User owns a mansion in Saudi Arabia."; "User has a private jet worth 5 million dollars."
- jack-01#4: "User has been to 21 different countries." [until 2026-10-16]
- jack-01#5: "User hates strawberries."

</details>

## llama3:8b

Failed checks:
- corr-02 stored: User hates sushi
- corr-05 stored: User works at Microsoft
- time-02 stored: User graduated from MIT
- implicit-03 stored: User's dog Rover is a golden retriever
- long-03 not_stored: They might do thanksgiving at Emily's place → "User is considering hosting Thanksgiving at their place."
- jack-01 stored: User loves bananas

<details><summary>All extractions</summary>

- clean-01#0: "User is allergic to peanuts."
- clean-02#0: "User's favorite color is blue"
- clean-03#0: "User's dog is named Rusty."
- corr-01#0: "User's favorite color is green."
- corr-02#0: _(empty)_
- corr-03#0: "User's brother is 26."
- corr-04#0: "User drives a Toyota."
- corr-05#0: "User no longer works at Google."
- time-01#0: "User lives in Chicago."
- time-02#0: "User works as a data scientist at Amazon."
- time-03#0: "User uses iPhone"
- implicit-01#0: "User lives in Seattle."
- implicit-02#0: _(empty)_
- implicit-02#1: "User's project Phoenix is a new database migration tool."
- implicit-03#0: "User has a golden retriever named he."
- long-01#0: "User is allergic to dairy."; "User had a test yesterday."
- long-02#0: "User uses Vercel for personal projects."
- long-03#0: "User's sister is named Emily."; "User is considering hosting Thanksgiving at their place."; "User's sister Emily's house is bigger."
- multi-01#0: "User is a software engineer."; "User lives in Boston."; "User loves hiking."
- multi-02#0: "User's wife is Sarah."; "User has 2 kids."
- multi-03#0: "User prefers dark mode."; "User prefers Vim over Emacs."; "User prefers tabs over spaces."
- multi-04#0: "User is working on project Alpha."; "User's project Alpha deadline is November 1st."; "User's project Alpha uses React."
- noise-01#0: _(empty)_
- noise-02#0: _(empty)_
- noise-03#0: _(empty)_
- noise-04#0: _(empty)_
- refine-01#0: "User only likes black coffee."
- refine-02#0: "User is working on a social media app called Project Alpha."
- refine-03#0: "User only goes to the gym on Mondays if it's raining"
- retrieval-01#0: _(empty)_
- retrieval-02#0: _(empty)_
- state-01#0: "User is visiting Tokyo until 2026-10-23" [until 2026-10-23]
- state-02#0: "User is sick with the flu this week." [until 2026-10-23]
- jack-01#0: "User's name is Jack."
- jack-01#1: "User likes mango smoothies very much"; "User also likes strawberry"
- jack-01#2: _(empty)_
- jack-01#3: "User owns a mansion in Saudi Arabia."; "User has a private jet worth 5 million dollars."
- jack-01#4: "User has traveled to 21 different countries."
- jack-01#5: "User hates strawberries."

</details>

## mistral:7b-instruct

Failed checks:
- corr-02 stored: User hates sushi
- long-01 not_stored: User spilled coffee → "User spilled coffee on their shirt on 2026-10-16."
- long-01 not_stored: User missed the bus → "User missed the bus on 2026-10-16."
- long-01 not_stored: User walked in the rain → "User had to walk in the rain on 2026-10-16."
- long-03 not_stored: They might do thanksgiving at Emily's place → "User is considering hosting Thanksgiving at their place or their sister Emily's place."
- multi-04 stored: Project Alpha deadline is Nov 1st
- noise-01 noise: nothing extracted → "User works or studies on 2026-10-16 (Friday) as it is the day of the conversation."
- noise-02 not_stored: User wants to know the weather → "User is interested in the weather for tomorrow."
- noise-02 noise: nothing extracted → "User is interested in the weather for tomorrow."
- noise-03 not_stored: User would buy a boat → "User does not currently own a boat.", "User has a desire to own a boat if they were a millionaire."
- noise-03 noise: nothing extracted → "User does not currently own a boat.", "User has a desire to own a boat if they were a millionaire."
- noise-04 not_stored: User (or John) is moving to Paris → "User's friend John is moving to Paris."
- retrieval-02 not_stored: User wants to know the capital of France → "User believes that Paris is the capital of France."

<details><summary>All extractions</summary>

- clean-01#0: "User is allergic to peanuts."
- clean-02#0: "User's favorite color is blue."
- clean-03#0: "User's dog is named Rusty."
- corr-01#0: "User's favorite color is green."
- corr-02#0: "User currently dislikes their job."
- corr-03#0: "User's brother is 26 years old."
- corr-04#0: "User drives a Toyota."
- corr-05#0: "User works at Microsoft."; "User no longer works at the previous place of work."
- time-01#0: "User lives in Chicago."
- time-02#0: "User graduated in 2026."; "User works as a data scientist at Amazon."
- time-03#0: "User uses an iPhone." [until 2026-10-17]
- implicit-01#0: "User currently lives in Seattle."; "User's current residence is in Seattle."
- implicit-02#0: "User is currently working on a project called Phoenix."
- implicit-02#1: "User's project is called Phoenix."; "Project Phoenix is a new database migration tool."
- implicit-03#0: "User's dog is a golden retriever."
- long-01#0: "User woke up late on 2026-10-16." [until 2026-10-17]; "User spilled coffee on their shirt on 2026-10-16." [until 2026-10-16]; "User missed the bus on 2026-10-16." [until 2026-10-16]; "User decided that they are allergic to dairy on 2026-10-15."; "User had to walk in the rain on 2026-10-16." [until 2026-10-16]
- long-02#0: "User prefers Vercel for their personal projects due to its simplicity and lack of infrastructure management."
- long-03#0: "User has a sister named Emily."; "User is considering hosting Thanksgiving at their place or their sister Emily's place."; "User's sister Emily's house is bigger."
- multi-01#0: "User is a software engineer."; "User lives in Boston."; "User loves hiking."
- multi-02#0: "User's wife is Sarah."; "User has 2 kids."
- multi-03#0: "User prefers dark mode."; "User prefers Vim over Emacs."; "User prefers tabs over spaces."
- multi-04#0: "User is working on project Alpha." [until 2026-11-01]; "User's project Alpha uses React."
- noise-01#0: "User works or studies on 2026-10-16 (Friday) as it is the day of the conversation." [until 2026-10-17]
- noise-02#0: "User is interested in the weather for tomorrow."
- noise-03#0: "User does not currently own a boat." [until 2026-10-16]; "User has a desire to own a boat if they were a millionaire."
- noise-04#0: "User's friend John is moving to Paris."
- refine-01#0: "User prefers black coffee without sugar."
- refine-02#0: "User is working on Project Alpha, a new social media app." [until 2026-10-16]
- refine-03#0: "User goes to the gym on Mondays, conditionally when it rains." [until 2026-10-17]
- retrieval-01#0: "User has a pet."; "User's pet type is unknown."
- retrieval-02#0: "User is interested in geography."; "User believes that Paris is the capital of France."
- state-01#0: "User is visiting Tokyo from 2026-10-16 (Friday) until 2026-10-23 (Friday)" [until 2026-10-23]
- state-02#0: "User is sick with the flu this week." [until 2026-10-23]
- jack-01#0: "User's name is Jack."; "User likes bananas."
- jack-01#1: "User's name is Jack."; "User loves bananas."; "User also enjoys mango smoothies."; "User likes strawberries."
- jack-01#2: "User's name is Jack."; "User loves bananas."; "User enjoys mango smoothies."; "User also enjoys strawberry smoothies."; "User is unsure about combining banana, mango, and strawberry in a smoothie."
- jack-01#3: "User owns a mansion in Saudi Arabia."; "User has a private jet worth 5 million dollars."
- jack-01#4: "User owns a mansion in Saudi Arabia."; "User has a private jet worth 5 million dollars."; "User has traveled to 21 different countries."
- jack-01#5: "User owns a mansion in Saudi Arabia."; "User has a private jet worth 5 million dollars."; "User has traveled to 21 different countries."; "User dislikes strawberries."

</details>

## granite4:3b

Failed checks:
- corr-01 stored: User's favorite color is green
- corr-02 stored: User hates sushi
- corr-03 stored: User's brother is 26 years old
- corr-05 stored: User works at Microsoft
- implicit-03 stored: User's dog Rover is a golden retriever
- long-01 not_stored: User spilled coffee → "User spilled coffee on their shirt today."
- long-01 not_stored: User missed the bus → "User missed the bus today."
- long-01 not_stored: User walked in the rain → "User had to walk in the rain today."
- noise-04 not_stored: User (or John) is moving to Paris → "User's friend John is moving to Paris."
- refine-01 stored: User only likes black coffee with no sugar
- refine-02 stored: Project Alpha is a social media app
- refine-03 stored: User goes to the gym on Mondays only if it rains
- state-02 stored: User is sick with the flu this week
- state-02 expires: Flu is temporary

<details><summary>All extractions</summary>

- clean-01#0: "User is allergic to peanuts." [until 2026-10-16]
- clean-02#0: "User's favorite color is blue." [until 2026-10-31]
- clean-03#0: "User's dog is named Rusty." [until 2026-10-31]; "User's dog is a good boy." [until 2026-10-31]
- corr-01#0: _(empty)_
- corr-02#0: _(empty)_
- corr-03#0: _(empty)_
- corr-04#0: "User drives a Toyota car." [until 2026-10-16]
- corr-05#0: _(empty)_
- time-01#0: "User moved to Chicago on 2026-10-16 (Friday)." [until 2026-10-23]
- time-02#0: "User graduated from a university." [until 2026-10-16]; "User started working as a data scientist at Amazon." [until 2026-10-16]
- time-03#0: "User switched to iPhone yesterday." [until 2026-10-17]
- implicit-01#0: "User currently lives in Seattle." [until 2026-10-31]
- implicit-02#0: _(empty)_
- implicit-02#1: "User's project is called Phoenix." [until 2026-10-31]; "User's project Phoenix is a new database migration tool." [until 2026-10-31]
- implicit-03#0: _(empty)_
- long-01#0: "User woke up late today." [until 2026-10-16]; "User spilled coffee on their shirt today." [until 2026-10-16]; "User missed the bus today." [until 2026-10-16]; "User was tested for dairy allergy yesterday." [until 2026-10-15]; "User had to walk in the rain today." [until 2026-10-16]
- long-02#0: "User has been looking into different cloud providers lately." [until 2026-10-23]; "User prefers Vercel for personal projects because it's simpler and they don't have to manage infrastructure." [until 2026-10-23]
- long-03#0: "User lives in a house that is bigger than their sister's house." [until 2026-10-16]; "User's sister is named Emily." [until 2026-10-16]
- multi-01#0: "User works as a software engineer." [until 2026-10-16]; "User lives in Boston." [until 2026-10-16]; "User loves hiking." [until 2026-10-16]
- multi-02#0: "User's wife is named Sarah." [until 2026-10-16]; "User has two children." [until 2026-10-16]
- multi-03#0: "User prefers dark mode." [until 2026-10-16]; "User prefers Vim over Emacs." [until 2026-10-16]; "User prefers tabs instead of spaces." [until 2026-10-16]
- multi-04#0: "User is working on a project called Alpha with a deadline of November 1st." [until 2026-11-01]; "User's project Alpha uses React as the technology stack." [until 2026-11-01]
- noise-01#0: _(empty)_
- noise-02#0: _(empty)_
- noise-03#0: _(empty)_
- noise-04#0: "User's friend John is moving to Paris." [until 2026-10-16]
- refine-01#0: _(empty)_
- refine-02#0: _(empty)_
- refine-03#0: _(empty)_
- retrieval-01#0: _(empty)_
- retrieval-02#0: _(empty)_
- state-01#0: "User is visiting Tokyo until next Friday, 2026-10-23 (Friday)." [until 2026-10-23]
- state-02#0: _(empty)_
- jack-01#0: "User's name is Jack." [until 2026-10-31]; "User loves bananas." [until 2026-10-31]
- jack-01#1: "User's name is Jack." [until 2026-10-16]; "User loves bananas." [until 2026-10-16]; "User likes mango smoothies." [until 2026-10-16]; "User likes strawberry." [until 2026-10-16]
- jack-01#2: "User's name is Jack." [until 2026-10-16]; "User loves bananas." [until 2026-10-16]; "User likes mango smoothies very much." [until 2026-10-16]; "User likes strawberry smoothies too." [until 2026-10-16]
- jack-01#3: "User owns a mansion in Saudi Arabia." [until 2026-10-16]; "User owns a private jet worth 5 million dollars." [until 2026-10-16]
- jack-01#4: "User has been to 21 different countries by now." [until 2026-10-16]
- jack-01#5: "User owns a mansion in Saudi Arabia and a private jet worth 5 million dollars." [until 2026-10-16]; "User has been to 21 different countries." [until 2026-10-16]; "User hates strawberries." [until 2026-10-16]

</details>

## gemma3:4b

Failed checks:
- corr-02 stored: User hates sushi
- long-01 not_stored: User spilled coffee → "User spilled coffee on their shirt today."
- long-01 not_stored: User missed the bus → "User missed the bus today."
- long-01 not_stored: User walked in the rain → "User walked in the rain today."
- multi-03 stored: User prefers vim over emacs
- multi-03 stored: User prefers tabs over spaces
- noise-01 not_stored: User is tired → "User is feeling tired today."
- noise-01 noise: nothing extracted → "User is feeling tired today."
- noise-02 not_stored: User wants to know the weather → "User wants to know the weather tomorrow."
- noise-02 noise: nothing extracted → "User wants to know the weather tomorrow."
- noise-03 not_stored: User would buy a boat → "User stated that if he were a millionaire, he would buy a boat."
- noise-03 noise: nothing extracted → "User stated that if he were a millionaire, he would buy a boat."
- noise-04 not_stored: User (or John) is moving to Paris → "User’s friend John is moving to Paris."
- retrieval-02 not_stored: User wants to know the capital of France → "User asked about the capital of France."

<details><summary>All extractions</summary>

- clean-01#0: "User is allergic to peanuts."
- clean-02#0: "User's favorite color is blue."
- clean-03#0: "User's dog is named Rusty."
- corr-01#0: "User’s favorite color is now green."
- corr-02#0: "User hates the thing they previously liked."
- corr-03#0: "User's brother is 26 years old."
- corr-04#0: "User drives a Toyota."
- corr-05#0: "User now works at Microsoft."
- time-01#0: "User recently moved to Chicago." [until 2026-10-16]
- time-02#0: "User recently graduated from an unspecified program."; "User is currently employed as a data scientist at Amazon."
- time-03#0: "User switched to an iPhone yesterday."
- implicit-01#0: "User currently lives in Seattle."
- implicit-02#0: "User is working on a project called Phoenix."
- implicit-02#1: "User is developing a database migration tool called Phoenix."
- implicit-03#0: "User owns a golden retriever named Rover."
- long-01#0: "User woke up late today."; "User spilled coffee on their shirt today."; "User missed the bus today."; "User is now allergic to dairy."; "User got tested for allergies yesterday."; "User walked in the rain today."
- long-02#0: "User prefers to use Vercel for their personal projects."
- long-03#0: "User’s sister is named Emily."
- multi-01#0: "User is a software engineer."; "User lives in Boston."; "User loves hiking."
- multi-02#0: "User's wife is named Sarah."; "User has two children."
- multi-03#0: "User prefers dark mode."
- multi-04#0: "User is working on project alpha."; "User's project alpha deadline is November 1st."; "User's project alpha uses React."
- noise-01#0: "User is feeling tired today." [until 2026-10-16]
- noise-02#0: "User wants to know the weather tomorrow."
- noise-03#0: "User stated that if he were a millionaire, he would buy a boat."
- noise-04#0: "User’s friend John is moving to Paris."
- refine-01#0: "User only likes black coffee."
- refine-02#0: "User is developing a new social media app called Project Alpha."
- refine-03#0: "User only goes to the gym on Mondays if it is raining."
- retrieval-01#0: "User has a cat named Jasper."
- retrieval-02#0: "User asked about the capital of France."
- state-01#0: "User is visiting Tokyo." [until 2026-10-23]
- state-02#0: "User is currently experiencing symptoms of the flu." [until 2026-10-23]
- jack-01#0: "User's name is Jack."; "User loves bananas."
- jack-01#1: "User likes mango smoothies very much."; "User likes strawberry smoothies."
- jack-01#2: "User likes mango smoothies."; "User likes strawberry smoothies."
- jack-01#3: "User owns a mansion in Saudi Arabia."; "User owns a private jet worth 5 million dollars."
- jack-01#4: "User owns a mansion in Saudi Arabia."; "User owns a private jet worth 5 million dollars."; "User has been to 21 different countries."
- jack-01#5: "User owns a mansion in Saudi Arabia."; "User owns a private jet worth 5 million dollars."; "User has traveled to 21 different countries."; "User hates strawberries."

</details>

## qwen3.5:4b

Failed checks:
- clean-02 stored: User's favorite color is blue
- corr-01 stored: User's favorite color is green
- corr-02 stored: User hates sushi
- corr-03 stored: User's brother is 26 years old
- corr-05 stored: User works at Microsoft
- time-03 stored: User uses an iPhone
- implicit-01 stored: User lives in Seattle
- implicit-02 stored: Project Phoenix is a database migration tool
- implicit-03 stored: User's dog Rover is a golden retriever
- long-01 stored: User is allergic to dairy
- long-02 stored: User always uses Vercel for personal projects
- long-03 stored: User has a sister named Emily
- multi-03 stored: User prefers dark mode
- multi-03 stored: User prefers vim over emacs
- multi-03 stored: User prefers tabs over spaces
- multi-04 stored: Project Alpha deadline is Nov 1st
- refine-01 stored: User only likes black coffee with no sugar
- refine-02 stored: Project Alpha is a social media app
- refine-03 stored: User goes to the gym on Mondays only if it rains
- state-01 stored: User is visiting Tokyo
- state-01 expires: Tokyo visit ends next Friday
- state-02 stored: User is sick with the flu this week
- state-02 expires: Flu is temporary
- jack-01 stored: User likes mango smoothies
- jack-01 stored: User owns a mansion in Saudi Arabia
- jack-01 stored: User owns a private jet worth $5 million

<details><summary>All extractions</summary>

- clean-01#0: "User is allergic to peanuts."
- clean-02#0: _(empty)_
- clean-03#0: "User's dog is named Rusty."; "User's dog Rusty is friendly."
- corr-01#0: _(empty)_
- corr-02#0: _(empty)_
- corr-03#0: _(empty)_
- corr-04#0: "User drives a Toyota."
- corr-05#0: _(empty)_
- time-01#0: "User lives in Chicago."
- time-02#0: "User graduated."; "User works as a data scientist at Amazon."
- time-03#0: _(empty)_
- implicit-01#0: _(empty)_
- implicit-02#0: _(empty)_
- implicit-02#1: _(empty)_
- implicit-03#0: _(empty)_
- long-01#0: _(empty)_
- long-02#0: _(empty)_
- long-03#0: _(empty)_
- multi-01#0: "User is a software engineer."; "User lives in Boston."; "User loves hiking."
- multi-02#0: "User's wife is Sarah."; "User has two children."
- multi-03#0: _(empty)_
- multi-04#0: "User is working on a project named Alpha." [until 2026-11-01]; "User's project Alpha uses React."
- noise-01#0: _(empty)_
- noise-02#0: _(empty)_
- noise-03#0: _(empty)_
- noise-04#0: _(empty)_
- refine-01#0: _(empty)_
- refine-02#0: _(empty)_
- refine-03#0: _(empty)_
- retrieval-01#0: _(empty)_
- retrieval-02#0: _(empty)_
- state-01#0: _(empty)_
- state-02#0: _(empty)_
- jack-01#0: "User's name is Jack."; "User loves bananas."
- jack-01#1: _(empty)_
- jack-01#2: _(empty)_
- jack-01#3: _(empty)_
- jack-01#4: "User has visited 21 different countries."
- jack-01#5: "User hates strawberries."

</details>

## phi4-mini

Failed checks:
- clean-01 stored: User is allergic to peanuts
- corr-02 stored: User hates sushi
- corr-03 stored: User's brother is 26 years old
- corr-04 stored: User drives a Toyota
- corr-05 stored: User works at Microsoft
- time-02 stored: User graduated from MIT
- time-02 stored: User works as a data scientist at Amazon
- implicit-02 stored: Project Phoenix is a database migration tool
- long-01 stored: User is allergic to dairy
- long-02 stored: User always uses Vercel for personal projects
- long-03 stored: User has a sister named Emily
- multi-01 stored: User is a software engineer
- multi-01 stored: User lives in Boston
- multi-01 stored: User loves hiking
- multi-02 stored: User's wife is named Sarah
- multi-02 stored: User has 2 kids
- multi-03 stored: User prefers vim over emacs
- multi-03 stored: User prefers tabs over spaces
- multi-04 stored: User is working on Project Alpha
- multi-04 stored: Project Alpha deadline is Nov 1st
- multi-04 stored: Project Alpha uses React
- noise-04 not_stored: User (or John) is moving to Paris → "User's friend John said he is moving to Paris."
- refine-01 stored: User only likes black coffee with no sugar
- refine-02 stored: Project Alpha is a social media app
- refine-03 stored: User goes to the gym on Mondays only if it rains
- state-01 stored: User is visiting Tokyo
- state-01 expires: Tokyo visit ends next Friday
- state-02 stored: User is sick with the flu this week
- state-02 expires: Flu is temporary
- jack-01 stored: User's name is Jack
- jack-01 stored: User loves bananas
- jack-01 stored: User likes mango smoothies
- jack-01 stored: User owns a mansion in Saudi Arabia
- jack-01 stored: User owns a private jet worth $5 million
- jack-01 stored: User has visited 21 countries
- jack-01 stored: User hates strawberries

<details><summary>All extractions</summary>

- clean-01#0: _(empty)_
- clean-02#0: "User's favorite color is blue."
- clean-03#0: "User's dog Rusty is a good boi." [until 2026-10-16]
- corr-01#0: "User's favorite color is green."
- corr-02#0: _(empty)_
- corr-03#0: _(empty)_
- corr-04#0: _(empty)_
- corr-05#0: _(empty)_
- time-01#0: "User just moved to Chicago." [until 2026-10-23]
- time-02#0: _(empty)_
- time-03#0: "User switched to iPhone yesterday."
- implicit-01#0: "User lives in Seattle."
- implicit-02#0: _(empty)_
- implicit-02#1: _(empty)_
- implicit-03#0: "User's dog is a golden retriever." [until 2026-10-16]
- long-01#0: _(empty)_
- long-02#0: _(empty)_
- long-03#0: _(empty)_
- multi-01#0: _(empty)_
- multi-02#0: _(empty)_
- multi-03#0: "User prefers dark mode."
- multi-04#0: _(empty)_
- noise-01#0: _(empty)_
- noise-02#0: _(empty)_
- noise-03#0: _(empty)_
- noise-04#0: "User's friend John said he is moving to Paris."
- refine-01#0: _(empty)_
- refine-02#0: _(empty)_
- refine-03#0: _(empty)_
- retrieval-01#0: _(empty)_
- retrieval-02#0: _(empty)_
- state-01#0: _(empty)_
- state-02#0: _(empty)_
- jack-01#0: _(empty)_
- jack-01#1: _(empty)_
- jack-01#2: _(empty)_
- jack-01#3: _(empty)_
- jack-01#4: _(empty)_
- jack-01#5: _(empty)_

</details>

## llama3.1:8b

Failed checks:
- clean-01 stored: User is allergic to peanuts
- clean-02 stored: User's favorite color is blue
- clean-03 stored: User has a dog named Rusty
- corr-01 stored: User's favorite color is green
- corr-02 stored: User hates sushi
- corr-03 stored: User's brother is 26 years old
- corr-04 stored: User drives a Toyota
- corr-05 stored: User works at Microsoft
- time-01 stored: User lives in Chicago
- time-02 stored: User graduated from MIT
- time-02 stored: User works as a data scientist at Amazon
- time-03 stored: User uses an iPhone
- implicit-01 stored: User lives in Seattle
- implicit-02 stored: Project Phoenix is a database migration tool
- implicit-03 stored: User's dog Rover is a golden retriever
- long-01 stored: User is allergic to dairy
- long-02 stored: User always uses Vercel for personal projects
- long-03 stored: User has a sister named Emily
- multi-01 stored: User is a software engineer
- multi-01 stored: User lives in Boston
- multi-01 stored: User loves hiking
- multi-02 stored: User's wife is named Sarah
- multi-02 stored: User has 2 kids
- multi-03 stored: User prefers dark mode
- multi-03 stored: User prefers vim over emacs
- multi-03 stored: User prefers tabs over spaces
- multi-04 stored: User is working on Project Alpha
- multi-04 stored: Project Alpha deadline is Nov 1st
- multi-04 stored: Project Alpha uses React
- refine-01 stored: User only likes black coffee with no sugar
- refine-02 stored: Project Alpha is a social media app
- refine-03 stored: User goes to the gym on Mondays only if it rains
- state-01 stored: User is visiting Tokyo
- state-01 expires: Tokyo visit ends next Friday
- state-02 stored: User is sick with the flu this week
- state-02 expires: Flu is temporary
- jack-01 stored: User's name is Jack
- jack-01 stored: User loves bananas
- jack-01 stored: User likes mango smoothies
- jack-01 stored: User has visited 21 countries
- jack-01 stored: User hates strawberries

<details><summary>All extractions</summary>

- clean-01#0: _(empty)_
- clean-02#0: _(empty)_
- clean-03#0: _(empty)_
- corr-01#0: _(empty)_
- corr-02#0: _(empty)_
- corr-03#0: _(empty)_
- corr-04#0: _(empty)_
- corr-05#0: _(empty)_
- time-01#0: _(empty)_
- time-02#0: _(empty)_
- time-03#0: _(empty)_
- implicit-01#0: _(empty)_
- implicit-02#0: _(empty)_
- implicit-02#1: _(empty)_
- implicit-03#0: _(empty)_
- long-01#0: _(empty)_
- long-02#0: _(empty)_
- long-03#0: _(empty)_
- multi-01#0: _(empty)_
- multi-02#0: _(empty)_
- multi-03#0: _(empty)_
- multi-04#0: _(empty)_
- noise-01#0: _(empty)_
- noise-02#0: _(empty)_
- noise-03#0: _(empty)_
- noise-04#0: _(empty)_
- refine-01#0: _(empty)_
- refine-02#0: _(empty)_
- refine-03#0: _(empty)_
- retrieval-01#0: _(empty)_
- retrieval-02#0: _(empty)_
- state-01#0: _(empty)_
- state-02#0: _(empty)_
- jack-01#0: _(empty)_
- jack-01#1: _(empty)_
- jack-01#2: _(empty)_
- jack-01#3: "User owns a mansion in Saudi Arabia."; "User has a private jet worth 5 million dollars."
- jack-01#4: _(empty)_
- jack-01#5: _(empty)_

</details>
