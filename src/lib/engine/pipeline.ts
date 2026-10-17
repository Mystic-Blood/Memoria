import type { SupabaseClient } from '@supabase/supabase-js'
import { getModel } from '@/lib/ai/provider'
import { resolveModelId } from '@/lib/ai/config'
import { embedText } from './embed'
import { EXTRACTION_HISTORY_TURNS, extractMemories, type ConversationTurn, type ExtractedMemory } from './extract'
import { enforceSingleName, findExactDuplicate, guardProposal, NAME_FACT, type MemoryOp } from './guard'
import { findNameMemory } from './retrieve'
import { proposeReconciliation } from './reconcile'
import { CONTEXT_LIMIT, CONTEXT_MIN_SIMILARITY, RECALL_LIMIT, RECALL_MIN_SIMILARITY, searchMemories } from './recall'
import { applyOp } from './apply'

type FactOutcome = {
  fact: ExtractedMemory
  op?: MemoryOp
  reason?: string
  guardNote?: string
  memoryId?: string | null
  error?: string
}

export type PipelineResult = {
  status: 'ok' | 'failed' | 'skipped'
  facts: FactOutcome[]
  error?: string
  durationMs: number
}

/**
 * The background memory step for one user message:
 *   extract facts (with recent conversation) -> for each: embed -> recall similar memories ->
 *   model proposes an action -> guard validates it -> one atomic database function applies it.
 * Every run is recorded in memory_runs so failures are visible rather than silent.
 * `client` must use the service role (the pipeline functions refuse anything else).
 */
export async function runMemoryPipeline(input: {
  client: SupabaseClient
  userId: string
  conversationId: string
  messageId: string
  now?: Date
}): Promise<PipelineResult> {
  const { client, userId, conversationId, messageId } = input
  const now = input.now ?? new Date()
  const started = Date.now()
  const facts: FactOutcome[] = []

  const { data: profile } = await client.from('profiles').select('memory_enabled').eq('id', userId).maybeSingle()
  const { data: run } = await client.from('memory_runs')
    .insert({ user_id: userId, message_id: messageId, conversation_id: conversationId, status: 'running', model: resolveModelId('extraction') })
    .select('id').single()

  const finish = async (status: PipelineResult['status'], error?: string): Promise<PipelineResult> => {
    const durationMs = Date.now() - started
    const operations = facts.filter(f => f.op && f.op.type !== 'skip' && !f.error).length
    if (run) {
      await client.from('memory_runs')
        .update({ status, error: error ?? null, operations, duration_ms: durationMs, finished_at: new Date().toISOString() })
        .eq('id', run.id)
    }
    return { status, facts, error, durationMs }
  }

  if (profile && profile.memory_enabled === false) return finish('skipped', 'Memory is paused for this user')

  const { data: message, error: msgErr } = await client.from('messages')
    .select('content, created_at').eq('id', messageId).eq('user_id', userId).single()
  if (msgErr || !message) return finish('failed', `message not found: ${msgErr?.message ?? messageId}`)

  const { data: earlier } = await client.from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .lt('created_at', message.created_at)
    .order('created_at', { ascending: false })
    .limit(EXTRACTION_HISTORY_TURNS)
  const history: ConversationTurn[] = (earlier ?? []).reverse().map(m => ({ role: m.role, text: m.content }))

  // Related stored memories let the extractor resolve "it"/"he" that refer to earlier conversations.
  // Best effort: if this lookup fails, extraction still runs with the conversation alone.
  let known: string[] = []
  const messageVector = await embedText(message.content, 'query')
  if (messageVector.ok) {
    const related = await searchMemories(client, userId, messageVector.vector, messageVector.profile, CONTEXT_MIN_SIMILARITY, CONTEXT_LIMIT)
    if (related.ok) known = related.memories.map(m => m.content)
  }

  const extracted = await extractMemories({ model: getModel('extraction'), latest: message.content, history, known, now })
  if (!extracted.ok) return finish('failed', `extraction ${extracted.reason}: ${extracted.message.slice(0, 300)}`)

  for (const fact of extracted.value) {
    const outcome: FactOutcome = { fact }
    facts.push(outcome)

    const embedded = await embedText(fact.content, 'document')
    if (!embedded.ok) { outcome.error = `embedding failed: ${embedded.error}`; continue }

    const recalled = await searchMemories(client, userId, embedded.vector, embedded.profile, RECALL_MIN_SIMILARITY, RECALL_LIMIT)
    if (!recalled.ok) { outcome.error = `recall failed: ${recalled.error}`; continue }
    const candidates = recalled.memories

    // Only ask the model when there is something to compare against and it is not an exact repeat.
    const needsModel = candidates.length > 0 && !findExactDuplicate(fact, candidates)
    const proposal = needsModel
      ? await proposeReconciliation({ model: getModel('reconcile'), fact, candidates, latestMessage: message.content })
      : null
    const currentName = NAME_FACT.test(fact.content.trim()) ? await findNameMemory(client, userId) : null
    const guarded = enforceSingleName(guardProposal({ fact, candidates, proposal, now, latestMessage: message.content }), fact, currentName)
    Object.assign(outcome, { op: guarded.op, reason: guarded.reason, guardNote: guarded.guardNote })

    // Merged or rewritten text needs its own embedding.
    let vector: number[] | null = embedded.vector
    if (guarded.op.type !== 'skip' && guarded.op.content !== fact.content) {
      const reembedded = await embedText(guarded.op.content, 'document')
      if (!reembedded.ok) { outcome.error = `embedding failed: ${reembedded.error}`; continue }
      vector = reembedded.vector
    }

    const reason = guarded.guardNote ? `${guarded.reason} [guard: ${guarded.guardNote}]` : guarded.reason
    const applied = await applyOp({ client, userId, op: guarded.op, vector, profile: embedded.profile, messageId, reason })
    if (applied.ok) outcome.memoryId = applied.memoryId
    else outcome.error = `write failed: ${applied.error}`
  }

  const failedFacts = facts.filter(f => f.error)
  if (facts.length > 0 && failedFacts.length === facts.length) {
    return finish('failed', failedFacts.map(f => f.error).join('; ').slice(0, 500))
  }
  return finish('ok', failedFacts.length ? `${failedFacts.length} of ${facts.length} facts failed: ${failedFacts.map(f => f.error).join('; ').slice(0, 400)}` : undefined)
}
