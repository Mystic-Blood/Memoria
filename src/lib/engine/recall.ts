import type { SupabaseClient } from '@supabase/supabase-js'
import { toPgVector } from './embed'
import type { RecalledMemory } from './types'

/** Existing memories at least this similar to a new fact are shown to the reconciler. */
export const RECALL_MIN_SIMILARITY = 0.55
export const RECALL_LIMIT = 5

/** Stored memories at least this related to an incoming message are shown to the extractor as context. */
export const CONTEXT_MIN_SIMILARITY = 0.45
export const CONTEXT_LIMIT = 5

type SearchResult = { ok: true; memories: RecalledMemory[] } | { ok: false; error: string }

/** Active, unexpired memories in the same embedding space, most similar first. */
export async function searchMemories(
  client: SupabaseClient,
  userId: string,
  vector: number[],
  profile: string,
  minSimilarity: number,
  limit: number,
): Promise<SearchResult> {
  const { data, error } = await client.rpc('match_memories', {
    p_user_id: userId,
    p_embedding: toPgVector(vector),
    p_embedding_profile: profile,
    p_min_similarity: minSimilarity,
    p_limit: limit,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, memories: (data ?? []) as RecalledMemory[] }
}
