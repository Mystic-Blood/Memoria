import type { SupabaseClient } from '@supabase/supabase-js'
import type { UIMessage } from 'ai'
import type { MemoryEventRow, MemoryRunRow } from '@/lib/engine/types'

export type ConversationSummary = { id: string; title: string | null; updated_at: string }

/** Metadata attached to assistant messages: the memories the reply was given. */
export type ChatMessageMetadata = { usedMemories?: Array<{ id: string; content: string }> }

export type ChatData = {
  conversations: ConversationSummary[]
  messages: UIMessage[]
  events: MemoryEventRow[]
  runs: MemoryRunRow[]
  /** Current content and status of every memory the events refer to (for conflicts and changes). */
  memories: Record<string, { content: string; status: string }>
  memoryEnabled: boolean
}

/** Everything the chat page needs, read with the signed-in user's client (RLS applies). */
export async function loadChatData(supabase: SupabaseClient, conversationId: string | null): Promise<ChatData> {
  const [{ data: conversations }, { data: profile }] = await Promise.all([
    supabase.from('conversations').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(50),
    supabase.from('profiles').select('memory_enabled').maybeSingle(),
  ])
  const base = { conversations: conversations ?? [], memoryEnabled: profile?.memory_enabled ?? true }
  if (!conversationId) return { ...base, messages: [], events: [], runs: [], memories: {} }

  const [{ data: rows }, { data: events }, { data: runs }] = await Promise.all([
    supabase.from('messages').select('id, role, content, used_memory_ids').eq('conversation_id', conversationId).order('created_at'),
    supabase.from('memory_events').select('*').eq('conversation_id', conversationId).order('created_at'),
    supabase.from('memory_runs').select('*').eq('conversation_id', conversationId).order('created_at'),
  ])

  const usedIds = (rows ?? []).flatMap(r => (r.used_memory_ids as string[] | null) ?? [])
  const ids = [...new Set([...(events ?? []).flatMap(e => [e.memory_id, e.related_memory_id]), ...usedIds].filter((x): x is string => !!x))]
  const { data: memoryRows } = ids.length
    ? await supabase.from('memories').select('id, content, status').in('id', ids)
    : { data: [] as Array<{ id: string; content: string; status: string }> }

  const contentOf = new Map((memoryRows ?? []).map(m => [m.id, m.content]))
  return {
    ...base,
    messages: (rows ?? []).map(r => {
      const used = ((r.used_memory_ids as string[] | null) ?? [])
        .filter(id => contentOf.has(id))
        .map(id => ({ id, content: contentOf.get(id)! }))
      const metadata: ChatMessageMetadata | undefined = used.length ? { usedMemories: used } : undefined
      return { id: r.id, role: r.role, parts: [{ type: 'text', text: r.content }], metadata } as UIMessage
    }),
    events: (events ?? []) as MemoryEventRow[],
    runs: (runs ?? []) as MemoryRunRow[],
    memories: Object.fromEntries((memoryRows ?? []).map(m => [m.id, { content: m.content, status: m.status }])),
  }
}
