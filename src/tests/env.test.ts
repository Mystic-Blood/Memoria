import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/ai/provider', () => ({ getModel: vi.fn() }))
vi.mock('@/lib/engine/retrieve', () => ({ retrieveRelevantMemories: vi.fn() }))
vi.mock('@/lib/engine/pipeline', () => ({ runMemoryPipeline: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))

import { productionEnvProblems, signupsDisabled } from '@/lib/env'
import { POST } from '@/app/api/chat/route'
import { createClient } from '@/utils/supabase/server'

const complete = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  CRON_SECRET: 'secret',
  AI_MODE: 'remote',
  GOOGLE_GENERATIVE_AI_API_KEY: 'key',
}
const ALL = ['supabase', 'ai', 'cron'] as const

describe('production config check', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('never complains outside production (local dev and tests keep working)', () => {
    expect(productionEnvProblems([...ALL], { NODE_ENV: 'development' })).toEqual([])
    expect(productionEnvProblems([...ALL], { NODE_ENV: 'test' })).toEqual([])
  })

  it('accepts a complete production config', () => {
    expect(productionEnvProblems([...ALL], complete)).toEqual([])
  })

  it('names every missing variable (and never echoes values)', () => {
    const problems = productionEnvProblems([...ALL], { NODE_ENV: 'production', VERCEL: '1', AI_MODE: 'remote' })
    const text = problems.join('\n')
    for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'GOOGLE_GENERATIVE_AI_API_KEY']) {
      expect(text).toContain(name)
    }
    expect(productionEnvProblems([...ALL], { ...complete, SUPABASE_SERVICE_ROLE_KEY: '  ' }).join()).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(productionEnvProblems([...ALL], { ...complete, CRON_SECRET: undefined }).join()).not.toContain('key')
  })

  it('a laptop running the production build needs no cron secret (there is no cron outside Vercel)', () => {
    expect(productionEnvProblems(['cron'], { ...complete, CRON_SECRET: undefined })).toEqual([])
    expect(productionEnvProblems(['cron'], { ...complete, VERCEL: '1', CRON_SECRET: undefined }).join()).toContain('CRON_SECRET')
  })

  it('AI_MODE=auto without an API key is an error on Vercel (it would fall back to an unreachable local Ollama)', () => {
    const autoNoKey = { ...complete, VERCEL: '1', AI_MODE: 'auto', GOOGLE_GENERATIVE_AI_API_KEY: undefined }
    expect(productionEnvProblems(['ai'], autoNoKey).join()).toMatch(/fall back to a local Ollama/)
    expect(productionEnvProblems(['ai'], { ...autoNoKey, AI_MODE: undefined })).toHaveLength(1)
    // Deliberate self-hosting choices are allowed.
    expect(productionEnvProblems(['ai'], { ...autoNoKey, OLLAMA_BASE_URL: 'http://gpu-box:11434' })).toEqual([])
    expect(productionEnvProblems(['ai'], { ...autoNoKey, AI_MODE: 'local' })).toEqual([])
    expect(productionEnvProblems(['ai'], { ...complete, AI_MODE: 'auto' })).toEqual([])
    // `npm start` on a machine running Ollama is a valid production-mode setup.
    expect(productionEnvProblems(['ai'], { ...autoNoKey, VERCEL: undefined })).toEqual([])
  })

  it('reports an invalid AI_MODE instead of throwing', () => {
    expect(productionEnvProblems(['ai'], { ...complete, AI_MODE: 'cloud' }).join()).toMatch(/AI_MODE must be/)
  })

  it('only checks what a route asks for', () => {
    expect(productionEnvProblems(['supabase'], { ...complete, CRON_SECRET: undefined, GOOGLE_GENERATIVE_AI_API_KEY: undefined })).toEqual([])
  })

  it('/api/chat in production with missing settings fails clearly with 500, before touching auth or the database', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(new Request('http://localhost/api/chat', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toMatch(/not configured correctly/)
    expect(body).not.toMatch(/SUPABASE|CRON/) // details go to the log, not to visitors
    const log = String(error.mock.calls[0][0])
    expect(log).toContain('CRON_SECRET')
    expect(log).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(createClient).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('SIGNUPS_DISABLED flag', () => {
  it('is off unless set to a truthy value', () => {
    expect(signupsDisabled({})).toBe(false)
    expect(signupsDisabled({ SIGNUPS_DISABLED: 'false' })).toBe(false)
    expect(signupsDisabled({ SIGNUPS_DISABLED: '0' })).toBe(false)
    expect(signupsDisabled({ SIGNUPS_DISABLED: 'true' })).toBe(true)
    expect(signupsDisabled({ SIGNUPS_DISABLED: ' TRUE ' })).toBe(true)
    expect(signupsDisabled({ SIGNUPS_DISABLED: '1' })).toBe(true)
  })
})
