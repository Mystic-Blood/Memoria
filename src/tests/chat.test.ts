import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
const adminClient = vi.hoisted(() => ({ admin: true, rpc: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminClient) }))
vi.mock('@/lib/ai/provider', () => ({ getModel: vi.fn(() => 'mock-model') }))
vi.mock('@/lib/engine/retrieve', () => ({ retrieveRelevantMemories: vi.fn() }))
vi.mock('@/lib/engine/pipeline', () => ({ runMemoryPipeline: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn((fn: () => Promise<void>) => fn()) }))
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    streamText: vi.fn(() => ({ stream: 'model-stream' })),
    toUIMessageStream: vi.fn((options: unknown) => options),
    createUIMessageStreamResponse: vi.fn(({ headers }: { headers: Record<string, string> }) => new Response('stream', { headers })),
  }
})

import { streamText, toUIMessageStream } from 'ai'
import { POST } from '@/app/api/chat/route'
import { createClient } from '@/utils/supabase/server'
import { retrieveRelevantMemories } from '@/lib/engine/retrieve'
import { runMemoryPipeline } from '@/lib/engine/pipeline'

type Row = Record<string, unknown>

/** Minimal chainable stand-in for the RLS-scoped Supabase client used by the route. */
function fakeSupabase(opts: { user?: { id: string } | null; ownsConversation?: boolean } = {}) {
  const inserts: Array<{ table: string; row: Row }> = []
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.user === undefined ? { id: 'user-1' } : opts.user } })) },
    from: vi.fn((table: string) => ({
      insert: (row: Row) => {
        inserts.push({ table, row })
        const result = { data: { id: table === 'conversations' ? 'conv-new' : 'msg-1' }, error: null }
        return { select: () => ({ single: async () => result }), then: (r: (v: unknown) => void) => r({ error: null }) }
      },
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => (opts.ownsConversation === false ? { data: null, error: { message: 'no rows' } } : { data: { id: 'conv-1' }, error: null }) }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    })),
  }
  return { client, inserts }
}

function chatRequest(body: unknown) {
  return new Request('http://localhost/api/chat', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })
}
const userMessage = (text: string) => ({ id: 'u1', role: 'user', parts: [{ type: 'text', text }] })

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminClient.rpc.mockResolvedValue({ data: { allowed: true, reason: null, retry_after: 0 }, error: null })
    vi.mocked(retrieveRelevantMemories).mockResolvedValue({
      ok: true,
      memories: [{ id: 'm1', content: 'User lives in Lisbon.', kind: 'fact', expires_at: null, updated_at: '', similarity: 0.8 }],
    })
    vi.mocked(runMemoryPipeline).mockResolvedValue({ status: 'ok', facts: [], durationMs: 1 })
  })

  it('rejects requests without a session', async () => {
    vi.mocked(createClient).mockResolvedValue(fakeSupabase({ user: null }).client as never)
    const res = await POST(chatRequest({ messages: [userMessage('hi')] }))
    expect(res.status).toBe(401)
  })

  it('rejects invalid JSON, empty and oversized messages', async () => {
    vi.mocked(createClient).mockResolvedValue(fakeSupabase().client as never)
    expect((await POST(chatRequest('{not json'))).status).toBe(400)
    expect((await POST(chatRequest({ messages: [userMessage('   ')] }))).status).toBe(400)
    expect((await POST(chatRequest({ messages: [userMessage('x'.repeat(4001))] }))).status).toBe(413)
  })

  it('does not reveal or use a conversation the user does not own', async () => {
    vi.mocked(createClient).mockResolvedValue(fakeSupabase({ ownsConversation: false }).client as never)
    const res = await POST(chatRequest({ messages: [userMessage('hi')], conversationId: 'someone-elses' }))
    expect(res.status).toBe(404)
    expect(streamText).not.toHaveBeenCalled()
  })

  it('stores the message, answers with relevant memories, and updates memory in the background', async () => {
    const { client, inserts } = fakeSupabase()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const res = await POST(chatRequest({ messages: [userMessage('where do I live?')], conversationId: 'conv-1' }))

    expect(res.status).toBe(200)
    expect(res.headers.get('x-conversation-id')).toBe('conv-1')
    expect(res.headers.get('x-user-message-id')).toBe('msg-1')
    expect(inserts[0]).toEqual({ table: 'messages', row: { conversation_id: 'conv-1', user_id: 'user-1', role: 'user', content: 'where do I live?' } })

    // Retrieval runs server-side for the session's user, never for an id taken from the request.
    expect(retrieveRelevantMemories).toHaveBeenCalledWith(adminClient, 'user-1', 'where do I live?')
    const args = vi.mocked(streamText).mock.calls[0][0] as unknown as { system: string; onEnd: (e: { text: string }) => Promise<void> }
    expect(args.system).toContain('- User lives in Lisbon.')

    // The reply carries the memories it was given (shown under the answer)...
    const streamOptions = vi.mocked(toUIMessageStream).mock.calls[0][0] as unknown as { messageMetadata: (o: { part: { type: string } }) => unknown }
    expect(streamOptions.messageMetadata({ part: { type: 'start' } })).toEqual({ usedMemories: [{ id: 'm1', content: 'User lives in Lisbon.' }] })
    expect(streamOptions.messageMetadata({ part: { type: 'text-delta' } })).toBeUndefined()

    // ...and saves them with the assistant message so they survive a refresh.
    await args.onEnd({ text: 'You live in Lisbon.' })
    expect(inserts.at(-1)).toEqual({ table: 'messages', row: { conversation_id: 'conv-1', user_id: 'user-1', role: 'assistant', content: 'You live in Lisbon.', used_memory_ids: ['m1'] } })

    expect(runMemoryPipeline).toHaveBeenCalledWith({ client: adminClient, userId: 'user-1', conversationId: 'conv-1', messageId: 'msg-1' })
    // No cron when running locally: expired memories are archived as part of the background work.
    expect(adminClient.rpc).toHaveBeenCalledWith('memory_expire_due')
  })

  it('still answers (without memories) when retrieval fails', async () => {
    vi.mocked(createClient).mockResolvedValue(fakeSupabase().client as never)
    vi.mocked(retrieveRelevantMemories).mockResolvedValue({ ok: false, error: 'embedding failed', memories: [] })
    const res = await POST(chatRequest({ messages: [userMessage('hello')] }))
    expect(res.status).toBe(200)
    const args = vi.mocked(streamText).mock.calls[0][0] as unknown as { system: string }
    expect(args.system).toMatch(/Do not claim to remember/)
  })

  it('a crashing memory pipeline never breaks the chat response', async () => {
    vi.mocked(createClient).mockResolvedValue(fakeSupabase().client as never)
    vi.mocked(runMemoryPipeline).mockRejectedValue(new Error('boom'))
    const res = await POST(chatRequest({ messages: [userMessage('hello')] }))
    expect(res.status).toBe(200)
  })
})
