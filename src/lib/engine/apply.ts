import type { SupabaseClient } from '@supabase/supabase-js'
import { toPgVector } from './embed'
import type { MemoryOp } from './guard'

type ApplyResult = { ok: true; memoryId: string | null } | { ok: false; error: string }

/** Writes one validated operation through the matching database function (each is atomic). */
export async function applyOp(input: {
  client: SupabaseClient
  userId: string
  op: MemoryOp
  vector: number[] | null
  profile: string
  messageId: string | null
  reason: string
}): Promise<ApplyResult> {
  const { client, userId, op, vector, profile, messageId, reason } = input
  if (op.type === 'skip') return { ok: true, memoryId: op.targetId }
  if (!vector) return { ok: false, error: 'missing embedding' }

  const common = {
    p_user_id: userId,
    p_content: op.content,
    p_kind: op.kind,
    p_expires_at: op.expiresAt,
    p_embedding: toPgVector(vector),
    p_embedding_profile: profile,
    p_message_id: messageId,
    p_reason: reason,
  }

  const call = (() => {
    switch (op.type) {
      case 'add': return client.rpc('memory_add', common)
      case 'update': return client.rpc('memory_update', { ...common, p_memory_id: op.targetId })
      case 'supersede': return client.rpc('memory_supersede', { ...common, p_old_id: op.targetId })
      case 'conflict': return client.rpc('memory_flag_conflict', { ...common, p_conflicts_with: op.targetId })
    }
  })()

  const { data, error } = await call
  if (error) return { ok: false, error: error.message }
  return { ok: true, memoryId: op.type === 'update' ? op.targetId : (data as string) }
}
