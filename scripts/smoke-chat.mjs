// End-to-end smoke test against a RUNNING app (npm run build && npm start, or npm run dev).
// Creates a throwaway user, signs in the same way the browser does (cookie session),
// chats through /api/chat, waits for the background memory pipeline, checks recall, then deletes the user.
//
// Usage: node --env-file=.env.local scripts/smoke-chat.mjs [baseUrl]
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const email = `smoke-${Date.now()}@memoria.test`
const password = `Smoke-${crypto.randomUUID()}`
let userId

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  if (!ok) process.exitCode = 1
  return ok
}

async function signInCookies() {
  const jar = new Map()
  const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  })
  const { error } = await ssr.auth.signInWithPassword({ email, password })
  if (error) throw error
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ')
}

async function chat(cookie, text, conversationId) {
  const started = Date.now()
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      conversationId,
      messages: [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }],
    }),
  })
  const body = await res.text()
  // UI message stream: SSE lines "data: {json}" ; collect text deltas
  const reply = body.split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map(l => { try { return JSON.parse(l.slice(6)) } catch { return null } })
    .filter(e => e?.type === 'text-delta').map(e => e.delta).join('')
  return { status: res.status, reply, conversationId: res.headers.get('x-conversation-id'), ms: Date.now() - started }
}

/** Waits until the background memory step for every message so far has finished, then returns the memories. */
async function waitForMemories(expectedRuns, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { data: runs } = await admin.from('memory_runs').select('status').eq('user_id', userId)
    if ((runs?.length ?? 0) >= expectedRuns && runs.every(r => r.status !== 'running')) break
    await new Promise(r => setTimeout(r, 2000))
  }
  const { data } = await admin.from('memories').select('content,status,kind').eq('user_id', userId)
  return data ?? []
}

try {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  userId = data.user.id
  const cookie = await signInCookies()
  check('signed in with a cookie session', cookie.includes('auth-token'))

  const unauth = await fetch(`${BASE}/api/chat`, { method: 'POST', body: '{}' })
  check('rejects chat without a session', unauth.status === 401, `(${unauth.status})`)

  const first = await chat(cookie, 'Hi! I live in Boston and I work as a nurse.')
  check('first message streams a reply', first.status === 200 && first.reply.length > 0, `(${first.status}, ${first.ms} ms) "${first.reply.slice(0, 80).replace(/\n/g, ' ')}"`)

  const { data: msgs } = await admin.from('messages').select('role').eq('user_id', userId)
  check('user + assistant messages persisted', msgs?.length === 2, `(${msgs?.length})`)

  const memories = await waitForMemories(1, 180_000)
  const { data: runs } = await admin.from('memory_runs').select('status,error,operations,duration_ms').eq('user_id', userId)
  check('background memory step recorded a successful run', runs?.[0]?.status === 'ok', JSON.stringify(runs?.[0] ?? null))
  check('background pipeline stored a memory', memories.length >= 1, JSON.stringify(memories.map(m => `${m.status}: ${m.content}`)))

  const second = await chat(cookie, 'Which city do I live in? Answer in one word.', first.conversationId)
  check('second message reuses the conversation', second.conversationId === first.conversationId)
  check('assistant recalls the stored memory', /boston/i.test(second.reply), `(${second.ms} ms) "${second.reply.slice(0, 80).replace(/\n/g, ' ')}"`)
} catch (err) {
  check('smoke run completed without errors', false, err?.message ?? String(err))
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    check('throwaway user deleted', !error, error?.message ?? '')
  }
}
