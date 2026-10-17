/**
 * How similar are memory pairs that SHOULD be merged/replaced vs pairs that should NOT?
 * Used to choose the guard's minimum similarity for update/replace (no database, embeddings only).
 *
 *   npx tsx --env-file=.env.local eval/pair-similarity.ts
 *
 * Pairs come from the development set and the owner's real "Ash" conversation; never the held-out set.
 */
import { embedText } from '@/lib/engine/embed'

process.env.AI_MODE = process.env.AI_MODE ?? 'local'

const SHOULD_COMBINE: Array<[string, string, string]> = [
  ['refine', 'User likes coffee', 'User only likes black coffee with no sugar.'],
  ['refine', 'User is working on Project Alpha', 'Project Alpha is a new social media app.'],
  ['refine', 'User goes to the gym on mondays', 'User goes to the gym on Mondays only if it is raining.'],
  ['correct', "User's favorite color is blue", "User's favorite color is green."],
  ['correct', 'User lives in New York', 'User lives in Chicago.'],
  ['correct', 'User uses an Android phone', 'User uses an iPhone.'],
  ['correct', 'User works at Google', 'User works at Microsoft.'],
  ['correct', "User's brother is 25 years old", "User's brother is 26 years old."],
  ['correct', 'User loves eating sushi', 'User hates sushi.'],
  ['correct', 'User likes strawberry smoothies.', 'User hates strawberries.'],
]

const SHOULD_STAY_SEPARATE: Array<[string, string, string]> = [
  ['ash', 'User is going to catch a legendary Pokémon today.', 'User is a Pokémon master.'],
  ['ash', 'User is going to catch a legendary Pokémon today.', "User's name is Ash."],
  ['ash', 'User is a Pokémon master.', 'User caught a Pikachu.'],
  ['ash', 'User is going to catch a legendary Pokémon today.', 'Lugia and Darkrai will fight near the school playground around 5 pm.'],
  ['jack', 'User loves bananas.', 'User likes mango smoothies.'],
  ['jack', 'User owns a mansion in Saudi Arabia.', 'User has a private jet worth 5 million dollars.'],
  ['multi', 'User is a software engineer.', 'User lives in Boston.'],
  ['multi', 'User prefers dark mode.', 'User prefers vim over emacs.'],
]

const cos = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2 }
  return d / Math.sqrt(x * y)
}

async function sim(a: string, b: string) {
  const [ea, eb] = await Promise.all([embedText(a, 'document'), embedText(b, 'document')])
  if (!ea.ok || !eb.ok) throw new Error('embedding failed')
  return cos(ea.vector, eb.vector)
}

async function main() {
  for (const [label, pairs] of [['SHOULD COMBINE (update/replace)', SHOULD_COMBINE], ['SHOULD STAY SEPARATE', SHOULD_STAY_SEPARATE]] as const) {
    console.log(`\n${label}`)
    for (const [tag, a, b] of pairs) console.log(`  ${(await sim(a, b)).toFixed(3)}  [${tag}] ${a}  |  ${b}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
