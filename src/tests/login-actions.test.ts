import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const auth = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// redirect() never returns in Next; model that by throwing.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`) }),
}))

import { signup } from '@/app/login/actions'

function form(email = 'ada@example.com', password = 'correct-horse') {
  const data = new FormData()
  data.set('email', email)
  data.set('password', password)
  return data
}
const redirectTarget = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, (e: Error) => e)
  return decodeURIComponent(err?.message.replace(/^REDIRECT /, '') ?? '')
}

describe('signup action', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('SIGNUPS_DISABLED=true refuses before contacting Supabase', async () => {
    vi.stubEnv('SIGNUPS_DISABLED', 'true')
    expect(await redirectTarget(signup(form()))).toMatch(/^\/login\?error=Sign-ups are closed/)
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('signs up normally when the flag is not set', async () => {
    auth.signUp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null })
    expect(await redirectTarget(signup(form()))).toBe('/')
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct-horse' })
  })

  it('with email confirmation on (no session yet) tells the user to check their inbox', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u' } }, error: null })
    expect(await redirectTarget(signup(form()))).toMatch(/Check your inbox/)
  })

  it('still validates input before calling Supabase', async () => {
    expect(await redirectTarget(signup(form('not-an-email')))).toMatch(/valid email/)
    expect(await redirectTarget(signup(form('ada@example.com', 'short')))).toMatch(/at least 8/)
    expect(auth.signUp).not.toHaveBeenCalled()
  })
})
