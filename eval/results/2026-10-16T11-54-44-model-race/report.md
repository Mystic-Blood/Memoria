# Model race: v2 extraction step

- date: `2026-10-16T11:54:44.373Z`
- git: `b16c101`
- ollama: `ollama version is 0.40.4`
- simulatedToday: `2026-10-16`
- models: `["qwen2.5:7b-instruct"]`

| model | checks passed | stored | not_stored | noise | expires | no_stale | valid JSON | median ms | p95 ms |
|---|---|---|---|---|---|---|---|---|---|
| qwen2.5:7b-instruct | **64/71** (90%) | 37/41 | 13/16 | 3/3 | 2/2 | 9/9 | 39/39 | 1425 | 3273 |

## qwen2.5:7b-instruct

Failed checks:
- corr-02 stored: User hates sushi
- implicit-03 stored: User's dog Rover is a golden retriever
- long-01 not_stored: User spilled coffee → "User spilled coffee on their shirt today."
- long-01 not_stored: User missed the bus → "User missed the bus today."
- long-01 not_stored: User walked in the rain → "User had to walk in the rain today."
- multi-04 stored: Project Alpha deadline is Nov 1st
- refine-02 stored: Project Alpha is a social media app

<details><summary>All extractions</summary>

- clean-01#0: "User is allergic to peanuts."
- clean-02#0: "User's favorite color is blue."
- clean-03#0: "User's dog is named Rusty."
- corr-01#0: "User's favorite color is green."
- corr-02#0: _(empty)_
- corr-03#0: "User's brother is 26."
- corr-04#0: "User drives a Toyota."
- corr-05#0: "User no longer works at Microsoft." [until 2026-10-16]
- time-01#0: "User moved to Chicago."
- time-02#0: "User graduated."; "User works as a data scientist at Amazon."
- time-03#0: "User switched to iPhone on 2026-10-15."
- implicit-01#0: "User currently lives in Seattle."
- implicit-02#0: "User is working on a project called Phoenix."
- implicit-02#1: "Project Phoenix is a new database migration tool."
- implicit-03#0: "User owns a golden retriever."
- long-01#0: "User woke up late today." [until 2026-10-17]; "User spilled coffee on their shirt today." [until 2026-10-17]; "User missed the bus today." [until 2026-10-17]; "User decided they are allergic to dairy today." [until 2026-10-17]; "User got tested for dairy allergy yesterday." [until 2026-10-17]; "User had to walk in the rain today." [until 2026-10-17]
- long-02#0: "User prefers Vercel for personal projects."
- long-03#0: "User's sister's name is Emily."
- multi-01#0: "User is a software engineer."; "User lives in Boston."; "User loves hiking."
- multi-02#0: "User's wife is Sarah."; "User has 2 kids."
- multi-03#0: "User prefers dark mode."; "User uses vim instead of emacs."; "User uses tabs instead of spaces."
- multi-04#0: "User is working on project alpha."; "Project alpha has a deadline on 2026-10-31."; "Project alpha uses React."
- noise-01#0: _(empty)_
- noise-02#0: _(empty)_
- noise-03#0: _(empty)_
- noise-04#0: _(empty)_
- refine-01#0: "User only likes black coffee."
- refine-02#0: "User is working on Project Alpha."
- refine-03#0: "User only goes to the gym on Mondays if it's raining."
- retrieval-01#0: _(empty)_
- retrieval-02#0: _(empty)_
- state-01#0: "User is visiting Tokyo until 2026-10-20." [until 2026-10-20]
- state-02#0: "User is super sick with the flu this week." [until 2026-10-23]
- jack-01#0: "User's name is Jack."
- jack-01#1: "User likes mango smoothies."; "User likes strawberry smoothies."
- jack-01#2: "User likes mango smoothies."; "User likes strawberry smoothies."; "User does not like combining banana, mango, and strawberry in a smoothie."
- jack-01#3: "User owns a mansion in Saudi Arabia."; "User has a private jet worth 5 million dollars."
- jack-01#4: "User has been to 21 different countries."
- jack-01#5: "User hates strawberries."

</details>
