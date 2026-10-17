import { runMemoryPipeline } from '@/lib/engine/pipeline'
import { retrieveRelevantMemories } from '@/lib/engine/retrieve'
import { embedText, toPgVector } from '@/lib/engine/embed'
import type { MemoryEngineAdapter } from './types'

/** The rebuilt engine, called exactly as the chat route calls it. */
export const v2Engine: MemoryEngineAdapter = {
  name: 'v2',

  async seed(client, userId, facts) {
    for (const content of facts) {
      const embedded = await embedText(content, 'document')
      if (!embedded.ok) throw new Error(`Could not embed seed memory: ${embedded.error}`)
      const { error } = await client.rpc('memory_add', {
        p_user_id: userId, p_content: content, p_kind: 'fact', p_expires_at: null,
        p_embedding: toPgVector(embedded.vector), p_embedding_profile: embedded.profile,
        p_message_id: null, p_reason: 'eval seed',
      })
      if (error) throw new Error(`Seed insert failed: ${error.message}`)
    }
  },

  async processTurn({ client, userId, conversationId, turn }) {
    const result = await runMemoryPipeline({ client, userId, conversationId, messageId: turn.messageId })
    // The pipeline records failures instead of logging them; surface them to the harness the same way.
    if (result.error) console.error(`[pipeline ${result.status}] ${result.error}`)
    if (result.facts.length === 0) return [result.status === 'ok' ? 'nothing extracted' : `${result.status}: ${result.error ?? ''}`]
    return result.facts.map(f => {
      const action = f.op ? (f.op.type === 'skip' ? 'skip' : `${f.op.type} as ${f.op.kind}${f.op.expiresAt ? ` until ${f.op.expiresAt.slice(0, 10)}` : ''}`) : 'not applied'
      return `"${f.fact.content}" -> ${action}${f.reason ? ` (${f.reason})` : ''}${f.guardNote ? ` [guard: ${f.guardNote}]` : ''}${f.error ? ` ERROR: ${f.error}` : ''}`
    })
  },

  async retrieve(client, userId, query) {
    const r = await retrieveRelevantMemories(client, userId, query)
    if (!r.ok) console.error(`[retrieve] ${r.error}`)
    return r.memories.map(m => m.content)
  },

  async snapshot(client, userId) {
    const { data, error } = await client
      .from('memories')
      .select('content, status, expires_at')
      .eq('user_id', userId)
      .order('created_at')
    if (error) throw new Error(`Snapshot failed: ${error.message}`)
    return (data ?? []).map(m => ({ content: m.content, status: m.status, valid_until: m.expires_at }))
  },
}
