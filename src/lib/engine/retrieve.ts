import type { SupabaseClient } from '@supabase/supabase-js'
import { embedText } from './embed'
import { searchMemories } from './recall'
import type { RecalledMemory } from './types'

/**
 * Which memories the chat model is shown for a message:
 *   the best match, if it is at least RETRIEVE_MIN_SIMILARITY similar, plus any other match within
 *   RETRIEVE_MARGIN of it.
 * A flat threshold had to be high (0.6) to keep unrelated memories out, which also dropped the right
 * answer to short questions about the user ("where do i work?"). Anchoring on the best match keeps
 * those while still excluding weaker, unrelated ones. Chosen with `npm run sweep` on the development
 * set (11 probes): floor 0.5 with any margin from 0.03 to 0.10 scored 18/20, every flat threshold at
 * most 16/20; 0.08 sits inside that range.
 */
const RETRIEVE_MIN_SIMILARITY = 0.5
const RETRIEVE_MARGIN = 0.08
const RETRIEVE_LIMIT = 8

/**
 * The user's name is included with every reply, whatever the question. Similarity search cannot find it
 * reliably: "do you know my name?" scored 0.43 against "User's name is Jack." while an unrelated memory
 * scored 0.46 (measured), so no threshold separates them. A query-rewriting step (HyDE) was tried and made
 * relevant and irrelevant memories harder to tell apart. Knowing who it is talking to is basic for an
 * assistant, and the name still shows under "Used N memories", so this stays visible.
 */
const NAME_PATTERN = "User's name is%"

type RetrieveResult = { ok: true; memories: RecalledMemory[] } | { ok: false; error: string; memories: [] }

/** Keeps the best match plus anything within `margin` of it (input is sorted, most similar first). */
export function anchorToBest(memories: RecalledMemory[], margin: number): RecalledMemory[] {
  if (memories.length === 0) return []
  const best = memories[0].similarity
  return memories.filter(m => m.similarity >= best - margin)
}

/** The newest active "User's name is ..." memory, if any. */
export async function findNameMemory(client: SupabaseClient, userId: string): Promise<RecalledMemory | null> {
  const { data } = await client
    .from('memories')
    .select('id, content, kind, expires_at, updated_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .ilike('content', NAME_PATTERN)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { ...data, similarity: 1 } : null
}

export async function retrieveRelevantMemories(
  client: SupabaseClient,
  userId: string,
  query: string,
  options: { minSimilarity?: number; margin?: number; limit?: number } = {},
): Promise<RetrieveResult> {
  const embedded = await embedText(query, 'query')
  if (!embedded.ok) return { ok: false, error: `embedding failed: ${embedded.error}`, memories: [] }
  const [found, name] = await Promise.all([
    searchMemories(
      client, userId, embedded.vector, embedded.profile,
      options.minSimilarity ?? RETRIEVE_MIN_SIMILARITY, options.limit ?? RETRIEVE_LIMIT,
    ),
    findNameMemory(client, userId),
  ])
  if (!found.ok) return { ok: false, error: found.error, memories: [] }
  const relevant = anchorToBest(found.memories, options.margin ?? RETRIEVE_MARGIN)
  const memories = name && !relevant.some(m => m.id === name.id) ? [name, ...relevant] : relevant
  return { ok: true, memories }
}
