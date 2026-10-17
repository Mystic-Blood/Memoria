import { z } from 'zod'
import type { LanguageModel } from 'ai'
import { generateStructured, type StructuredResult } from './structured'

export type ConversationTurn = { role: 'user' | 'assistant'; text: string }

export type MemoryKind = 'fact' | 'preference' | 'temporary'

export type ExtractedMemory = {
  content: string
  kind: MemoryKind
  /** ISO date (YYYY-MM-DD) when a temporary memory stops being true; null otherwise. */
  expiresAt: string | null
}

/** How many earlier turns the extractor sees, to resolve references like "it", "he", or a one-word answer. */
export const EXTRACTION_HISTORY_TURNS = 6

const schema = z.object({
  memories: z.array(
    z.object({
      content: z.string().describe('One complete standalone sentence about the user, starting with "User".'),
      kind: z.enum(['fact', 'preference', 'temporary']),
      expires_at: z.string().nullable().describe('For kind "temporary": the date it ends as YYYY-MM-DD. Otherwise null.'),
    }),
  ),
})

export const EXTRACTION_INSTRUCTIONS = `You maintain the long-term memory of a personal chat assistant.
From the user's LATEST message, write down what it tells you about the user that will still be useful in a future conversation.

REMEMBER: who the user is (name, age, home town, job, studies), their family and pets, health, routines, hobbies, tools, likes and dislikes, goals and plans. Casual, joking or role-play wording still counts when the user says something about themselves.

DO NOT REMEMBER:
- questions, greetings, small talk and requests to the assistant (to find, list or organise something), including options the user is only browsing
- passing feelings and one-off events of the day (the lift was broken, burnt the toast)
- wishes and hypotheticals ("if I were rich..."), but DO keep a real fact said in the same message
- news about other people (friends, coworkers); the user's own family and pets are fine
- anything already listed under "What you already know", unless the latest message adds or changes something: then write only the new or changed detail

HOW TO WRITE EACH MEMORY:
1. One complete standalone sentence that starts with "User", holding ONE fact. Split "X and Y" into two memories. Keep names, numbers, places and dates. Never a bare fragment.
2. Resolve "it", "he", "she", "there" and one-word answers using the earlier conversation and what you already know.
3. If the user corrects themselves, keep only the corrected version. If they stopped or dislike something, say so explicitly ("User no longer eats meat.").
4. kind: "preference" for likes and dislikes. "temporary" ONLY for something that will end by itself (a trip, an illness, a short-term plan), with expires_at set to the date it ends, worked out from today's date. Everything else, including a change the user made, is "fact".
5. If the latest message tells you nothing lasting about the user, return an empty list.

EXAMPLES (invented people, for format only):

Earlier conversation: Assistant: What do you do for a living?
LATEST: "baker. i start at 4am"
-> "User is a baker." (fact), "User starts their workday at 4am." (fact)

LATEST: "im sid and im a total night owl lol"
-> "User's name is Sid." (fact), "User is a night owl." (fact)

LATEST: "my son is 9 and really into trains"
-> "User has a son who is 9 years old." (fact), "User's son loves trains." (fact)

What you already know: "User has a dog named Pepper."
LATEST: "she turned 3 last month!"
-> "User's dog Pepper is 3 years old." (fact)

What you already know: "User does yoga."
LATEST: "it's hot yoga three times a week for me"
-> "User does hot yoga three times a week." (fact)

LATEST: "if i were taller id play basketball lol. i do play badminton on sundays tho"
-> "User plays badminton on Sundays." (fact)

LATEST: "my neighbour bought a sailboat, wild"
-> nothing

Today is 2026-03-02 (Monday). LATEST: "off to manali thursday till saturday"
-> "User is travelling to Manali from Thursday to Saturday." (temporary, expires_at 2026-03-07)

Today is 2026-03-02 (Monday). LATEST: "sprained my wrist, no swimming for 10 days"
-> "User has a sprained wrist and cannot swim." (temporary, expires_at 2026-03-12)

LATEST: "hi! how are you?"
-> nothing`

function formatTurn(t: ConversationTurn): string {
  return `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`
}

/**
 * @param known stored memories related to the latest message, so references to things said in earlier
 *              conversations ("I hate it now", "he is a beagle") can be resolved.
 */
export function buildExtractionPrompt(latest: string, history: ConversationTurn[], now: Date, known: string[] = []): string {
  const today = now.toISOString().slice(0, 10)
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const recent = history.slice(-EXTRACTION_HISTORY_TURNS)
  const earlier = recent.length ? recent.map(formatTurn).join('\n') : '(none)'
  const knownBlock = known.length ? known.map(k => `- ${k}`).join('\n') : '(nothing relevant)'
  return `Today is ${today} (${weekday}).

What you already know about the user (from earlier conversations):
${knownBlock}

Earlier conversation:
${earlier}

LATEST user message:
"""${latest}"""`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

export async function extractMemories(input: {
  model: LanguageModel
  latest: string
  history: ConversationTurn[]
  /** Stored memories related to the latest message (see buildExtractionPrompt). */
  known?: string[]
  now?: Date
}): Promise<StructuredResult<ExtractedMemory[]>> {
  const result = await generateStructured({
    model: input.model,
    schema,
    instructions: EXTRACTION_INSTRUCTIONS,
    prompt: buildExtractionPrompt(input.latest, input.history, input.now ?? new Date(), input.known),
  })
  if (!result.ok) return result

  const memories: ExtractedMemory[] = []
  for (const m of result.value.memories) {
    const content = m.content.trim()
    if (!content) continue
    const expiresAt = m.expires_at && ISO_DATE.test(m.expires_at) ? m.expires_at.slice(0, 10) : null
    memories.push({ content, kind: m.kind, expiresAt: m.kind === 'temporary' ? expiresAt : null })
  }
  return { ...result, value: memories }
}
