import { describe, it, expect } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { buildExtractionPrompt, extractMemories, EXTRACTION_HISTORY_TURNS } from '@/lib/engine/extract'

/** A model that answers with the given raw texts in order (the last one repeats). */
function scriptedModel(...responses: string[]) {
  let call = 0
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: responses[Math.min(call++, responses.length - 1)] }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  })
}

const NOW = new Date('2026-10-16T12:00:00Z')

describe('extractMemories', () => {
  it('returns every extracted memory and keeps expiry only for temporary ones', async () => {
    const model = scriptedModel(JSON.stringify({
      memories: [
        { content: ' User lives in Boston. ', kind: 'fact', expires_at: '2027-01-01' },
        { content: 'User is visiting Tokyo.', kind: 'temporary', expires_at: '2026-10-23T00:00:00Z' },
        { content: 'User is sick.', kind: 'temporary', expires_at: 'next week' },
        { content: '   ', kind: 'fact', expires_at: null },
      ],
    }))
    const r = await extractMemories({ model, latest: 'x', history: [], now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual([
      { content: 'User lives in Boston.', kind: 'fact', expiresAt: null },
      { content: 'User is visiting Tokyo.', kind: 'temporary', expiresAt: '2026-10-23' },
      { content: 'User is sick.', kind: 'temporary', expiresAt: null },
    ])
  })

  it('retries once when the model returns output that does not fit the schema', async () => {
    const model = scriptedModel('not json at all', JSON.stringify({ memories: [] }))
    const r = await extractMemories({ model, latest: 'hello', history: [], now: NOW })
    expect(r).toMatchObject({ ok: true, value: [], attempts: 2 })
  })

  it('reports a failure explicitly (with the raw text) instead of pretending nothing was said', async () => {
    const model = scriptedModel('{"memories": [{"content": 5}]}')
    const r = await extractMemories({ model, latest: 'I live in Boston', history: [], now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('invalid_output')
    expect(r.attempts).toBe(2)
    expect(r.rawText).toContain('memories')
  })
})

describe('buildExtractionPrompt', () => {
  it('includes today\'s date, the latest message and only the most recent turns', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `turn ${i}` }))
    const prompt = buildExtractionPrompt('seattle.', history, NOW)
    expect(prompt).toContain('Today is 2026-10-16 (Friday)')
    expect(prompt).toContain('"""seattle."""')
    expect(prompt).toContain(`turn ${10 - EXTRACTION_HISTORY_TURNS}`)
    expect(prompt).not.toContain(`turn ${9 - EXTRACTION_HISTORY_TURNS}`)
  })

  it('says so when there is no earlier conversation', () => {
    expect(buildExtractionPrompt('hi', [], NOW)).toContain('Earlier conversation:\n(none)')
  })
})
