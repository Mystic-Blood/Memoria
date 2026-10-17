import { describe, it, expect } from 'vitest'
import { CASES } from '../../eval/cases'
import { HOLDOUT_CASES } from '../../eval/holdout'
import { CONVERSATION_CASES } from '../../eval/conversations'
import { EXTRACTION_INSTRUCTIONS } from '@/lib/engine/extract'
import { RECONCILE_INSTRUCTIONS } from '@/lib/engine/reconcile'
import { buildSystemPrompt } from '@/lib/engine/context'

// Prompt examples must not come from the evaluation set; otherwise the eval measures memorised
// answers instead of the engine. This checks every distinctive word of every eval message.
const COMMON = new Set(`about actually after again also always anymore because been before being bigger cant could didnt does dont doing done even ever every feel feeling from going good have having here into just know like little long love made make maybe more most much myself need never only other over really right same should since some still sure take than that their them then there these they thing think this those through today told tomorrow very want wanted well were what when where which while will with without would yeah your youre user users favorite favourite hello thanks finally started wait sorry meant drive works living lives prefer project projects things using uses personal
anyway
named name years month week days last work talk said likes loves kind mostly something already play plays pets
moved switched left different exactly choice`.split(/\s+/))
// The last two lines are ordinary vocabulary any instruction prompt uses; reviewed by hand when the leak
// check was fixed (2026-10-16). Do not add content words (places, foods, jobs, names) here.

const words = new Set(
  [...CASES, ...CONVERSATION_CASES, ...HOLDOUT_CASES].flatMap(c => [...c.turns.map(t => t.text), ...(c.seed_memories ?? [])])
    .flatMap(t => t.toLowerCase().match(/[a-z]{4,}/g) ?? [])
    .filter(w => !COMMON.has(w)),
)

function leakedWords(text: string): string[] {
  const lower = text.toLowerCase()
  // Double backslash: in a template literal a single "\b" is a backspace character, not a word boundary.
  // (That mistake once made this whole check pass no matter what the prompts contained.)
  return [...words].filter(w => new RegExp(`\\b${w}\\b`).test(lower))
}

describe('the leak check itself', () => {
  it('catches eval content planted in a prompt', () => {
    expect(leakedWords('Example: "I am a nurse at a hospital in Seattle."')).toEqual(expect.arrayContaining(['nurse', 'seattle']))
  })

  it('ignores ordinary vocabulary', () => {
    expect(leakedWords('Write the name of the user and what they like.')).toEqual([])
  })
})

describe('prompts do not contain evaluation content', () => {
  const prompts = {
    extraction: EXTRACTION_INSTRUCTIONS,
    reconcile: RECONCILE_INSTRUCTIONS,
    chat: buildSystemPrompt([], new Date('2026-01-01')),
  }
  for (const [name, text] of Object.entries(prompts)) {
    it(`${name} prompt shares no distinctive words with the eval cases`, () => {
      expect(leakedWords(text)).toEqual([])
    })
  }
})
