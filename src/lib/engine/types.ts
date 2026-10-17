import type { MemoryKind } from './extract'

export type { MemoryKind }

export type MemoryStatus = 'active' | 'pending' | 'superseded' | 'expired' | 'deleted'

export type MemoryRow = {
  id: string
  user_id: string
  content: string
  kind: MemoryKind
  status: MemoryStatus
  expires_at: string | null
  conflicts_with: string | null
  superseded_by: string | null
  source_message_id: string | null
  embedding_profile: string
  created_at: string
  updated_at: string
}

export type MemoryEventAction =
  | 'created' | 'updated' | 'superseded' | 'conflict' | 'confirmed' | 'rejected' | 'edited' | 'deleted' | 'expired'

export type MemoryEventRow = {
  id: string
  user_id: string
  memory_id: string
  action: MemoryEventAction
  actor: 'assistant' | 'user' | 'system'
  before_content: string | null
  after_content: string | null
  related_memory_id: string | null
  reason: string | null
  message_id: string | null
  conversation_id: string | null
  created_at: string
}

export type MemoryRunRow = {
  id: string
  user_id: string
  message_id: string | null
  conversation_id: string | null
  status: 'running' | 'ok' | 'failed' | 'skipped'
  error: string | null
  model: string | null
  operations: number
  duration_ms: number | null
  created_at: string
  finished_at: string | null
}

/** An active memory similar to something new, as returned by match_memories. */
export type RecalledMemory = {
  id: string
  content: string
  kind: MemoryKind
  expires_at: string | null
  updated_at: string
  similarity: number
}
