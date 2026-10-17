// Verifies the database's security model through the real Supabase API (not mocks):
// two throwaway users, the anon key and the service role. Every rule in the v2 migration is exercised.
// Cleans up after itself.
//
// Usage: node --env-file=.env.local scripts/db-security-check.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const anon = createClient(url, anonKey, opts)

let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}
const vec = () => JSON.stringify(Array.from({ length: 768 }, () => Math.random() - 0.5))
const PROFILE = 'test:security-check:768'

async function makeUser(tag) {
  const email = `security-${tag}-${Date.now()}@eval.memoria.test`
  const password = `Sec-${crypto.randomUUID()}`
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = createClient(url, anonKey, opts)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, client }
}

const add = (userId, content, extra = {}) => service.rpc('memory_add', {
  p_user_id: userId, p_content: content, p_kind: extra.kind ?? 'fact', p_expires_at: extra.expiresAt ?? null,
  p_embedding: vec(), p_embedding_profile: PROFILE, p_message_id: null, p_reason: 'security check',
})

const users = []
try {
  const a = await makeUser('a'); users.push(a)
  const b = await makeUser('b'); users.push(b)

  // --- pipeline functions: service role only
  const { data: memA, error: addErr } = await add(a.id, 'User A lives in Lisbon.')
  check('service role can add a memory', !addErr && typeof memA === 'string', addErr?.message)

  const { error: userAddErr } = await a.client.rpc('memory_add', {
    p_user_id: a.id, p_content: 'forged', p_kind: 'fact', p_expires_at: null,
    p_embedding: vec(), p_embedding_profile: PROFILE, p_message_id: null, p_reason: 'forged',
  })
  check('a user cannot call the pipeline add function', !!userAddErr, userAddErr?.message)

  const { error: userMatchErr } = await a.client.rpc('match_memories', {
    p_user_id: b.id, p_embedding: vec(), p_embedding_profile: PROFILE, p_min_similarity: -1, p_limit: 10,
  })
  check('a user cannot run similarity search (could probe other users)', !!userMatchErr, userMatchErr?.message)

  // --- reads are scoped by RLS
  const { data: aSees } = await a.client.from('memories').select('id')
  const { data: bSees } = await b.client.from('memories').select('id')
  check('owner can read their memory', aSees?.length === 1, `${aSees?.length}`)
  check("another user cannot read it", bSees?.length === 0, `${bSees?.length}`)
  const { error: anonErr } = await anon.from('memories').select('id')
  check('signed-out visitors cannot read memories at all', !!anonErr, anonErr?.message)

  // --- direct writes are impossible, so the event history cannot be bypassed
  const { error: insErr } = await a.client.from('memories').insert({ user_id: a.id, content: 'x', kind: 'fact', embedding: vec(), embedding_profile: PROFILE })
  check('a user cannot insert memories directly', !!insErr, insErr?.message)
  const { data: upd, error: updErr } = await a.client.from('memories').update({ content: 'tampered' }).eq('id', memA).select()
  check('a user cannot update memories directly', !!updErr || upd?.length === 0, updErr?.message ?? `${upd?.length} rows`)
  const { data: del, error: delErr } = await a.client.from('memories').delete().eq('id', memA).select()
  check('a user cannot hard-delete memories', !!delErr || del?.length === 0, delErr?.message ?? `${del?.length} rows`)
  const { error: evErr } = await a.client.from('memory_events').insert({ user_id: a.id, memory_id: memA, action: 'created', actor: 'user' })
  check('a user cannot forge history events', !!evErr, evErr?.message)

  // --- user actions only work on your own memories
  const { error: crossDel } = await b.client.rpc('memory_delete', { p_memory_id: memA })
  check("a user cannot delete someone else's memory", !!crossDel, crossDel?.message)
  const { error: editErr } = await a.client.rpc('memory_edit', { p_memory_id: memA, p_content: 'User A lives in Porto.', p_embedding: vec(), p_embedding_profile: PROFILE })
  check('owner can edit their memory', !editErr, editErr?.message)

  // --- conflict flow: pending -> confirm supersedes the old memory atomically
  const { data: pending, error: flagErr } = await service.rpc('memory_flag_conflict', {
    p_user_id: a.id, p_conflicts_with: memA, p_content: 'User A lives in Madrid.', p_kind: 'fact', p_expires_at: null,
    p_embedding: vec(), p_embedding_profile: PROFILE, p_message_id: null, p_reason: 'security check',
  })
  check('pipeline can record a conflict', !flagErr && !!pending, flagErr?.message)
  const { error: crossConfirm } = await b.client.rpc('memory_confirm', { p_memory_id: pending })
  check("a user cannot confirm someone else's pending memory", !!crossConfirm, crossConfirm?.message)
  const { error: confirmErr } = await a.client.rpc('memory_confirm', { p_memory_id: pending })
  const { data: after } = await a.client.from('memories').select('id,status').in('id', [memA, pending])
  const status = Object.fromEntries((after ?? []).map(m => [m.id, m.status]))
  check('owner confirms: new memory active, old one superseded', !confirmErr && status[pending] === 'active' && status[memA] === 'superseded', confirmErr?.message ?? JSON.stringify(status))

  // --- supersede is atomic: a bad target creates nothing
  const before = (await service.from('memories').select('id').eq('user_id', a.id)).data?.length
  const { error: badSup } = await service.rpc('memory_supersede', {
    p_user_id: a.id, p_old_id: memA, p_content: 'should not exist', p_kind: 'fact', p_expires_at: null,
    p_embedding: vec(), p_embedding_profile: PROFILE, p_message_id: null, p_reason: 'security check',
  })
  const afterCount = (await service.from('memories').select('id').eq('user_id', a.id)).data?.length
  check('superseding a non-active memory fails and writes nothing', !!badSup && typeof before === 'number' && before === afterCount, `${before} -> ${afterCount}`)

  // --- expiry
  await add(a.id, 'User A is in Tokyo until yesterday.', { kind: 'temporary', expiresAt: new Date(Date.now() - 86_400_000).toISOString() })
  const { data: expired, error: expErr } = await service.rpc('memory_expire_due')
  check('expiry sweep expires memories past their end date', !expErr && expired >= 1, expErr?.message ?? `${expired}`)

  // --- history is visible to its owner only
  const { data: aEvents } = await a.client.from('memory_events').select('action')
  const { data: bEvents } = await b.client.from('memory_events').select('action')
  const actions = (aEvents ?? []).map(e => e.action).sort().join(',')
  check('owner sees the full event history', ['confirmed', 'conflict', 'created', 'edited', 'expired', 'superseded'].every(x => actions.includes(x)), actions)
  check("another user sees none of it", bEvents?.length === 0, `${bEvents?.length}`)

  // --- chat rate limits: usage is counted server-side only and cannot be read, reset or forged by users
  const { error: userTakeErr } = await a.client.rpc('chat_usage_take', { p_user_id: a.id, p_per_minute: null, p_per_day: null, p_global_per_day: null })
  check('a user cannot call the rate-limit function', !!userTakeErr, userTakeErr?.message)
  const { error: usageReadErr } = await a.client.from('chat_usage').select('id')
  check('a user cannot read chat usage', !!usageReadErr, usageReadErr?.message)
  const { data: usageDel, error: usageDelErr } = await a.client.from('chat_usage').delete().eq('user_id', a.id).select('id')
  check('a user cannot delete chat usage (to reset a limit)', !!usageDelErr || usageDel?.length === 0, usageDelErr?.message ?? `${usageDel?.length} rows`)
  // A limit of 0 per minute always refuses, so this probes the function without recording usage.
  const { data: probe, error: probeErr } = await service.rpc('chat_usage_take', { p_user_id: a.id, p_per_minute: 0, p_per_day: null, p_global_per_day: null })
  check('the server can check rate limits', !probeErr && probe?.allowed === false && probe?.reason === 'minute', probeErr?.message ?? JSON.stringify(probe))

  // --- erase forever: only your own archived memories, and it takes the whole history with it
  const { error: eraseActiveErr } = await a.client.rpc('memory_erase', { p_memory_id: pending })
  check('a memory still in use cannot be erased (delete it first)', !!eraseActiveErr, eraseActiveErr?.message)
  const { error: crossErase } = await b.client.rpc('memory_erase', { p_memory_id: memA })
  check("a user cannot erase someone else's memory", !!crossErase, crossErase?.message)
  const { error: eraseErr } = await a.client.rpc('memory_erase', { p_memory_id: memA })
  const { data: goneRow } = await service.from('memories').select('id').eq('id', memA)
  const { data: goneEvents } = await service.from('memory_events').select('id').eq('memory_id', memA)
  const { data: survivor } = await service.from('memories').select('superseded_by').eq('id', pending).single()
  check('owner erases an archived memory: row and history are gone, its replacement stays',
    !eraseErr && goneRow?.length === 0 && goneEvents?.length === 0 && !!survivor,
    eraseErr?.message ?? `${goneRow?.length} rows, ${goneEvents?.length} events`)
  const { error: anonErase } = await anon.rpc('memory_erase', { p_memory_id: pending })
  check('signed-out visitors cannot call erase', !!anonErase, anonErase?.message)
} catch (err) {
  check('security check ran to completion', false, err?.message ?? String(err))
} finally {
  for (const u of users) await service.auth.admin.deleteUser(u.id)
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll security checks passed')
process.exit(failures ? 1 : 0)
