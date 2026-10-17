import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai/provider', () => ({ getModel: vi.fn(() => 'model') }))
vi.mock('@/lib/ai/config', () => ({ resolveModelId: vi.fn(() => 'qwen2.5:7b-instruct') }))
vi.mock('@/lib/engine/embed', () => ({ embedText: vi.fn() }))
vi.mock('@/lib/engine/extract', () => ({ extractMemories: vi.fn(), EXTRACTION_HISTORY_TURNS: 6 }))
vi.mock('@/lib/engine/recall', () => ({ searchMemories: vi.fn(), RECALL_LIMIT: 5, RECALL_MIN_SIMILARITY: 0.55, CONTEXT_LIMIT: 5, CONTEXT_MIN_SIMILARITY: 0.45 }))
vi.mock('@/lib/engine/reconcile', () => ({ proposeReconciliation: vi.fn() }))
vi.mock('@/lib/engine/apply', () => ({ applyOp: vi.fn() }))

import { runMemoryPipeline } from '@/lib/engine/pipeline'
import { embedText } from '@/lib/engine/embed'
import { extractMemories } from '@/lib/engine/extract'
import { searchMemories } from '@/lib/engine/recall'
import { applyOp } from '@/lib/engine/apply'

type Row = Record<string, unknown>

/** Records memory_runs writes; answers the few reads the pipeline makes. */
function fakeClient(opts: { memoryEnabled?: boolean } = {}) {
  const runUpdates: Row[] = []
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'lt', 'order', 'limit']) c[m] = () => c
    c.maybeSingle = async () => result
    c.single = async () => result
    c.then = (resolve: (v: unknown) => void) => resolve(result)
    return c
  }
  const client = {
    from: (table: string) => ({
      select: () => {
        if (table === 'profiles') return chain({ data: { memory_enabled: opts.memoryEnabled ?? true } })
        if (table === 'messages') {
          const c = chain({ data: { content: 'I live in Lisbon and I hate olives', created_at: '2026-10-16T12:00:00Z' }, error: null })
          ;(c as Record<string, unknown>).then = (resolve: (v: unknown) => void) => resolve({ data: [] })
          return c
        }
        return chain({ data: null })
      },
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'run-1' } }) }) }),
      update: (row: Row) => { runUpdates.push(row); return { eq: async () => ({ error: null }) } },
    }),
  }
  return { client: client as never, runUpdates }
}

const input = (client: never) => ({ client, userId: 'u1', conversationId: 'c1', messageId: 'm1', now: new Date('2026-10-16T12:00:00Z') })

describe('runMemoryPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(embedText).mockResolvedValue({ ok: true, vector: [0.1], profile: 'p' })
    vi.mocked(searchMemories).mockResolvedValue({ ok: true, memories: [] })
    vi.mocked(applyOp).mockResolvedValue({ ok: true, memoryId: 'mem' })
  })

  it('does nothing and records "skipped" when the user paused memory', async () => {
    const { client, runUpdates } = fakeClient({ memoryEnabled: false })
    const r = await runMemoryPipeline(input(client))
    expect(r.status).toBe('skipped')
    expect(extractMemories).not.toHaveBeenCalled()
    expect(runUpdates[0]).toMatchObject({ status: 'skipped' })
  })

  it('records an extraction failure with its reason instead of storing nothing silently', async () => {
    vi.mocked(extractMemories).mockResolvedValue({ ok: false, reason: 'timeout', message: 'model took too long', attempts: 2, ms: 90000 })
    const { client, runUpdates } = fakeClient()
    const r = await runMemoryPipeline(input(client))
    expect(r.status).toBe('failed')
    expect(runUpdates[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('timeout') })
    expect(applyOp).not.toHaveBeenCalled()
  })

  it('keeps going when one fact fails, and reports the partial failure', async () => {
    vi.mocked(extractMemories).mockResolvedValue({
      ok: true, attempts: 1, ms: 1,
      value: [
        { content: 'User lives in Lisbon.', kind: 'fact', expiresAt: null },
        { content: 'User dislikes olives.', kind: 'preference', expiresAt: null },
      ],
    })
    vi.mocked(applyOp)
      .mockResolvedValueOnce({ ok: false, error: 'connection reset' })
      .mockResolvedValueOnce({ ok: true, memoryId: 'mem-2' })
    const { client, runUpdates } = fakeClient()

    const r = await runMemoryPipeline(input(client))

    expect(applyOp).toHaveBeenCalledTimes(2)
    expect(r.status).toBe('ok')
    expect(r.facts[0].error).toMatch(/connection reset/)
    expect(r.facts[1].memoryId).toBe('mem-2')
    expect(runUpdates[0]).toMatchObject({ status: 'ok', operations: 1, error: expect.stringContaining('1 of 2 facts failed') })
  })

  it('passes related stored memories to the extractor so references can be resolved', async () => {
    vi.mocked(searchMemories).mockResolvedValueOnce({
      ok: true,
      memories: [{ id: 'x', content: 'User has a dog named Pip.', kind: 'fact', expires_at: null, updated_at: '', similarity: 0.6 }],
    })
    vi.mocked(extractMemories).mockResolvedValue({ ok: true, attempts: 1, ms: 1, value: [] })
    const { client } = fakeClient()
    await runMemoryPipeline(input(client))
    expect(vi.mocked(extractMemories).mock.calls[0][0].known).toEqual(['User has a dog named Pip.'])
  })
})
