import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc }))
}))

describe('CRON Endpoint Security', () => {
  let GET: typeof import('@/app/api/cron/staleness-sweep/route').GET

  beforeEach(async () => {
    vi.resetModules()
    rpc.mockReset().mockResolvedValue({ data: 2, error: null })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    const route = await import('@/app/api/cron/staleness-sweep/route')
    GET = route.GET
  })

  it('Production: fails closed if CRON_SECRET is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.CRON_SECRET

    const req = new Request('http://localhost/api/cron/staleness-sweep')
    const res = await GET(req)
    
    expect(res.status).toBe(401)
  })

  it('Production: fails closed with wrong secret', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.CRON_SECRET = 'my-secret'

    const req = new Request('http://localhost/api/cron/staleness-sweep', {
      headers: { authorization: 'Bearer wrong-secret' }
    })
    const res = await GET(req)
    
    expect(res.status).toBe(401)
  })

  it('Production: fails closed with malformed header', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.CRON_SECRET = 'my-secret'

    const req = new Request('http://localhost/api/cron/staleness-sweep', {
      headers: { authorization: 'my-secret' } // missing Bearer
    })
    const res = await GET(req)
    
    expect(res.status).toBe(401)
  })

  it('Production: succeeds with correct secret', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.CRON_SECRET = 'my-secret'

    const req = new Request('http://localhost/api/cron/staleness-sweep', {
      headers: { authorization: 'Bearer my-secret' }
    })
    const res = await GET(req)
    
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('memory_expire_due')
    expect(await res.json()).toEqual({ expired: 2 })
  })

  it('returns 500 without leaking database error details', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.CRON_SECRET = 'my-secret'
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "secret_table" does not exist' } })

    const res = await GET(new Request('http://localhost/api/cron/staleness-sweep', { headers: { authorization: 'Bearer my-secret' } }))

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret_table')
  })

  it('Production: an authorised call with missing Supabase settings fails clearly instead of crashing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.CRON_SECRET = 'my-secret'
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(new Request('http://localhost/api/cron/staleness-sweep', { headers: { authorization: 'Bearer my-secret' } }))

    expect(res.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
    expect(String(error.mock.calls[0][0])).toContain('SUPABASE_SERVICE_ROLE_KEY')
    error.mockRestore()
  })

  it('Development: allows missing secret if unconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    delete process.env.CRON_SECRET

    const req = new Request('http://localhost/api/cron/staleness-sweep')
    const res = await GET(req)
    
    expect(res.status).toBe(200)
  })
})
