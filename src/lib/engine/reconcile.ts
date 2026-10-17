import { z } from 'zod'
import type { LanguageModel } from 'ai'
import { generateStructured, type StructuredResult } from './structured'
import type { ExtractedMemory } from './extract'
import type { RecalledMemory } from './types'

const RECONCILE_ACTIONS = ['skip', 'add', 'update', 'replace', 'conflict'] as const
export type ReconcileAction = (typeof RECONCILE_ACTIONS)[number]

/** What the model proposes. It is validated by guard.ts before anything is written. */
export type ReconcileProposal = {
  action: ReconcileAction
  /** Label of an existing memory ("m1"...) for update / replace / conflict, else null. */
  target: string | null
  content: string
  reason: string
}

const schema = z.object({
  action: z.enum(RECONCILE_ACTIONS),
  target: z.string().nullable(),
  content: z.string(),
  reason: z.string(),
})

export const RECONCILE_INSTRUCTIONS = `You keep a user's long-term memory accurate and free of duplicates.
A NEW FACT was just learned from the user's latest message. Compare it with the EXISTING MEMORIES (labelled m1, m2, ...) and choose exactly ONE action:

- skip: an existing memory already says the same thing. Nothing changes.
- add: the new fact is about something no existing memory covers. Related facts can coexist (liking chess and liking sudoku are both true).
- update: the new fact adds detail to, or narrows, ONE existing memory without making it false. content = one merged sentence that keeps every detail of both. Example: "User plays guitar" + "User plays a left-handed acoustic guitar" -> "User plays guitar, a left-handed acoustic one."
- replace: the new fact means ONE existing memory is no longer true: the user moved, changed jobs, switched products, stopped liking something, or corrected a detail. content = the new memory.
- conflict: the new fact contradicts ONE existing memory, but it is unclear whether the old one stopped being true. The user will be asked. Use rarely.

Output rules:
- target is the label (m1, m2, ...) for update, replace and conflict; null for add and skip.
- content is the final memory as one sentence starting with "User". For skip, repeat the existing memory.
- Never merge two different subjects into one memory.
- reason is one short sentence explaining the choice.`

function buildReconcilePrompt(fact: ExtractedMemory, candidates: RecalledMemory[], latestMessage: string): string {
  const existing = candidates.map((c, i) => `m${i + 1}: ${c.content}`).join('\n')
  return `EXISTING MEMORIES:
${existing}

NEW FACT:
${fact.content}

The user's latest message, for context:
"""${latestMessage}"""`
}

export async function proposeReconciliation(input: {
  model: LanguageModel
  fact: ExtractedMemory
  candidates: RecalledMemory[]
  latestMessage: string
}): Promise<StructuredResult<ReconcileProposal>> {
  return generateStructured({
    model: input.model,
    schema,
    instructions: RECONCILE_INSTRUCTIONS,
    prompt: buildReconcilePrompt(input.fact, input.candidates, input.latestMessage),
  })
}
