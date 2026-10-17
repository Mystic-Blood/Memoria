import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const adminClient = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminClient) }))
vi.mock('@/lib/ai/provider', () => ({ getModel: vi.fn(() => 'mock-model') }))
vi.mock('@/lib/engine/retrieve', () => ({ retrieveRelevantMemories: vi.fn(async () => ({ ok: true, memories: [] })) }))
vi.mock('@/lib/engine/pipeline', () => ({ runMemoryPipeline: vi.fn(async () => ({ status: 'ok', facts: [], durationMs: 1 })) }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    streamText: vi.fn(() => ({ stream: 'model-stream' })),
    toUIMessageStream: vi.fn((options: unknown) => options),
    createUIMessageStreamResponse: vi.fn(({ headers }: { headers: Record<string, string> }) => new Response('stream', { headers })),
  }
})

import { streamText } from 'ai'
import { POST } from '@/app/api/chat/route'
import { createClient } from '@/utils/supabase/server'
import { readChatLimits, takeChatUsage, DEFAULT_CHAT_LIMITS } from '@/lib/limits'

/** RLS-scoped client stand-in that records which tables were written. */
function fakeSupabase() {
  const writes: string[] = []
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => ({
      insert: () => {
        writes.push(table)
        const result = { data: { id: table === 'conversations' ? 'conv-new' : 'msg-1' }, error: null }
        return { select: () => ({ single: async () => result }) }
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    })),
  }
  return { client, writes }
}

const chatRequest = (text = 'hello') => new Request('http://localhost/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }] }),
})
const decision = (allowed: boolean, reason: string | null = null, retryAfter = 0) =>
  ({ data: { allowed, reason, retry_after: retryAfter }, error: null })

describe('POST /api/chat usage limits', () => {
  let writes: string[]

  beforeEach(() => {
    vi.clearAllMocks()
    const fake = fakeSupabase()
    writes = fake.writes
    vi.mocked(createClient).mockResolvedValue(fake.client as never)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('lets a request under the limits through, checking them for the session user before writing anything', async () => {
    adminClient.rpc.mockResolvedValue(decision(true))
    const res = await POST(chatRequest())
    expect(res.status).toBe(200)
    expect(adminClient.rpc).toHaveBeenCalledWith('chat_usage_take', {
      p_user_id: 'user-1', p_per_minute: 10, p_per_day: 200, p_global_per_day: null,
    })
    expect(writes).toEqual(['conversations', 'messages'])
    expect(streamText).toHaveBeenCalledOnce()
  })

  it('per-minute limit: 429 with Retry-After and a friendly message; nothing stored, no model call', async () => {
    adminClient.rpc.mockResolvedValue(decision(false, 'minute', 42))
    const res = await POST(chatRequest())
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('42')
    expect(await res.text()).toMatch(/a little fast.*10 per minute.*wait 42 seconds/)
    expect(writes).toEqual([])
    expect(streamText).not.toHaveBeenCalled()
  })

  it('daily limit: 429 with Retry-After in seconds and the wait in hours', async () => {
    adminClient.rpc.mockResolvedValue(decision(false, 'day', 3 * 3600 + 5))
    const res = await POST(chatRequest())
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe(String(3 * 3600 + 5))
    expect(await res.text()).toMatch(/today's limit of 200 messages.*about 4 hours/)
    expect(streamText).not.toHaveBeenCalled()
  })

  it('global daily cap: 503 "at capacity" when CHAT_DAILY_GLOBAL_LIMIT is reached', async () => {
    vi.stubEnv('CHAT_DAILY_GLOBAL_LIMIT', '500')
    adminClient.rpc.mockResolvedValue(decision(false, 'global', 600))
    const res = await POST(chatRequest())
    expect(adminClient.rpc).toHaveBeenCalledWith('chat_usage_take', expect.objectContaining({ p_global_per_day: 500 }))
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('600')
    expect(await res.text()).toMatch(/demo is at capacity today/)
    expect(writes).toEqual([])
  })

  it('fails closed (503) when the limit check itself fails, e.g. migration not applied', async () => {
    adminClient.rpc.mockResolvedValue({ data: null, error: { message: 'function public.chat_usage_take does not exist' } })
    const res = await POST(chatRequest())
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('chat_usage_take')
    expect(streamText).not.toHaveBeenCalled()
  })

  it('treats a malformed database answer as a failure, not as allowed', async () => {
    adminClient.rpc.mockResolvedValue({ data: { allowed: 'yes' }, error: null })
    expect((await POST(chatRequest())).status).toBe(503)
  })

  it('validation errors are rejected before any usage is counted', async () => {
    const res = await POST(new Request('http://localhost/api/chat', { method: 'POST', body: '{bad' }))
    expect(res.status).toBe(400)
    expect(adminClient.rpc).not.toHaveBeenCalled()
  })
})

describe('chat limit configuration', () => {
  it('defaults to 10/minute, 200/day per user and no global cap', () => {
    expect(readChatLimits({})).toEqual({ perMinute: DEFAULT_CHAT_LIMITS.perMinute, perDay: DEFAULT_CHAT_LIMITS.perDay, globalPerDay: null })
  })

  it('reads overrides; "off" removes a limit, 0 blocks (pauses the demo); garbage falls back to the default', () => {
    expect(readChatLimits({ CHAT_LIMIT_PER_MINUTE: '3', CHAT_LIMIT_PER_DAY: 'off', CHAT_DAILY_GLOBAL_LIMIT: '1000' }))
      .toEqual({ perMinute: 3, perDay: null, globalPerDay: 1000 })
    expect(readChatLimits({ CHAT_DAILY_GLOBAL_LIMIT: '0' }).globalPerDay).toBe(0)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readChatLimits({ CHAT_LIMIT_PER_MINUTE: 'ten', CHAT_DAILY_GLOBAL_LIMIT: '-5' }))
      .toEqual({ perMinute: 10, perDay: 200, globalPerDay: null })
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('skips the database entirely when every limit is off', async () => {
    adminClient.rpc.mockClear()
    const result = await takeChatUsage(adminClient as never, 'user-1', { perMinute: null, perDay: null, globalPerDay: null })
    expect(result).toEqual({ ok: true, decision: { allowed: true } })
    expect(adminClient.rpc).not.toHaveBeenCalled()
  })
})
