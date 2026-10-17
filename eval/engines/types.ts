import type { SupabaseClient } from '@supabase/supabase-js'
import type { MemorySnapshot } from '../score'

export type Turn = { role: 'user' | 'assistant'; text: string; messageId: string }

export type TurnContext = {
  client: SupabaseClient
  userId: string
  conversationId: string
  /** The user turn to process. */
  turn: Turn
  /** Every earlier turn in this conversation, oldest first. */
  history: Turn[]
}

/**
 * What the evaluation harness needs from a memory engine. Each engine version gets an adapter so the
 * same cases and scoring can compare them.
 */
export interface MemoryEngineAdapter {
  name: string
  /** Insert pre-existing memories (written as if the user had said them earlier). */
  seed(client: SupabaseClient, userId: string, facts: string[]): Promise<void>
  /** Run the background memory pipeline for one user turn; returns human-readable decisions for the report. */
  processTurn(ctx: TurnContext): Promise<string[]>
  /** The memory contents the chat model would be given for this query. */
  retrieve(client: SupabaseClient, userId: string, query: string): Promise<string[]>
  snapshot(client: SupabaseClient, userId: string): Promise<MemorySnapshot[]>
}
