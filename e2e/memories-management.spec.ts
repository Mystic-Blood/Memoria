import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Browser tests for managing memories on /memories, /memories/<id> and the chat panel's pause switch.
 * No language model is involved: state is seeded directly through the database's pipeline functions
 * with the service role (random 768-dim vectors as embeddings), then checked and changed in the UI.
 *
 *   E2E_BASE_URL=http://localhost:3202 npx playwright test e2e/memories-management.spec.ts
 */

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const PROFILE = 'test:qa:768'
const stamp = Date.now()

type User = { id: string; email: string; password: string }
const users: Record<'owner' | 'other', User | undefined> = { owner: undefined, other: undefined }
const owner = () => users.owner!
const other = () => users.other!

async function makeUser(tag: string): Promise<User> {
  const email = `qa-${tag}-${stamp}@eval.memoria.test`
  const password = `Qa-${crypto.randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return { id: data.user.id, email, password }
}

test.beforeAll(async () => {
  users.owner = await makeUser('owner')
  users.other = await makeUser('other')
})

test.afterAll(async () => {
  for (const u of Object.values(users)) if (u) await admin.auth.admin.deleteUser(u.id)
})

// ------------------------------------------------------------------------------ seeding helpers
const vec = () => JSON.stringify(Array.from({ length: 768 }, () => Math.random() - 0.5))

type Kind = 'fact' | 'preference' | 'temporary'
async function seedMemory(userId: string, content: string, opts: { kind?: Kind; expiresAt?: string; messageId?: string } = {}) {
  const { data, error } = await admin.rpc('memory_add', {
    p_user_id: userId, p_content: content, p_kind: opts.kind ?? 'fact', p_expires_at: opts.expiresAt ?? null,
    p_embedding: vec(), p_embedding_profile: PROFILE, p_message_id: opts.messageId ?? null, p_reason: 'QA seed',
  })
  if (error) throw error
  return data as string
}

async function seedConflict(userId: string, conflictsWith: string, content: string) {
  const { data, error } = await admin.rpc('memory_flag_conflict', {
    p_user_id: userId, p_conflicts_with: conflictsWith, p_content: content, p_kind: 'fact', p_expires_at: null,
    p_embedding: vec(), p_embedding_profile: PROFILE, p_message_id: null, p_reason: 'QA seed conflict',
  })
  if (error) throw error
  return data as string
}

async function seedMessage(userId: string, title: string, content: string) {
  const { data: conv, error: convErr } = await admin.from('conversations').insert({ user_id: userId, title }).select('id').single()
  if (convErr) throw convErr
  const { data: msg, error: msgErr } = await admin.from('messages')
    .insert({ conversation_id: conv.id, user_id: userId, role: 'user', content }).select('id').single()
  if (msgErr) throw msgErr
  return { conversationId: conv.id as string, messageId: msg.id as string }
}

async function memoryEnabled(userId: string) {
  const { data, error } = await admin.from('profiles').select('memory_enabled').eq('id', userId).single()
  if (error) throw error
  return data.memory_enabled as boolean
}

// ------------------------------------------------------------------------------- UI helpers
async function login(page: Page, user: User) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/chat$/)
}

const tab = (page: Page, name: 'Overview' | 'Activity' | 'Archive') =>
  page.getByRole('navigation', { name: 'Memory views' }).getByRole('link', { name })

async function openTab(page: Page, name: 'Overview' | 'Activity' | 'Archive') {
  await tab(page, name).click()
  await expect(tab(page, name)).toHaveAttribute('aria-current', 'page')
}

const group = (page: Page, name: 'About you' | 'Likes & preferences' | 'Right now') => page.getByRole('region', { name, exact: true })
const review = (page: Page) => page.getByRole('region', { name: 'Needs your review' })
const item = (scope: ReturnType<Page['getByRole']> | Page, text: string) => scope.getByRole('listitem').filter({ hasText: text })

// ------------------------------------------------------------------------------------- tests
test('review queue: "Use the new one" replaces the old memory', async ({ page }) => {
  const oldText = `User lives in Lisbon (${stamp}).`
  const newText = `User lives in Madrid (${stamp}).`
  const oldId = await seedMemory(owner().id, oldText)
  await seedConflict(owner().id, oldId, newText)

  await login(page, owner())
  await page.goto('/memories')
  await expect(page.getByText(/waiting for your review/)).toBeVisible()

  const proposal = item(review(page), newText)
  await expect(proposal).toContainText(`You said: ${newText}`)
  await expect(proposal).toContainText(`I remember: ${oldText}`)
  // before deciding, the old memory is still the current one and the proposal is not
  await expect(group(page, 'About you')).toContainText(oldText)
  await expect(group(page, 'About you')).not.toContainText(newText)

  await proposal.getByRole('button', { name: 'Use the new one' }).click()

  await expect(review(page)).toHaveCount(0)
  await expect(group(page, 'About you')).toContainText(newText)
  await expect(group(page, 'About you')).not.toContainText(oldText)

  await openTab(page, 'Archive')
  await expect(item(page, oldText)).toContainText('Replaced')
  await expect(page.locator('body')).not.toContainText(newText)
})

test('review queue: "Keep what I remember" discards the proposal', async ({ page }) => {
  const oldText = `User works at Acme (${stamp}).`
  const newText = `User works at Globex (${stamp}).`
  const oldId = await seedMemory(owner().id, oldText)
  await seedConflict(owner().id, oldId, newText)

  await login(page, owner())
  await page.goto('/memories')
  const proposal = item(review(page), newText)
  await expect(proposal).toContainText(`I remember: ${oldText}`)

  await proposal.getByRole('button', { name: 'Keep what I remember' }).click()

  await expect(review(page)).toHaveCount(0)
  await expect(group(page, 'About you')).toContainText(oldText)
  await expect(page.locator('body')).not.toContainText(newText)

  // the decision survives a reload and the old memory is still active in the database
  await page.reload()
  await expect(group(page, 'About you')).toContainText(oldText)
  await expect(review(page)).toHaveCount(0)
  const { data } = await admin.from('memories').select('status').eq('id', oldId).single()
  expect(data?.status).toBe('active')

  // the discarded proposal is labelled as rejected in the archive, not as an ordinary deletion
  await openTab(page, 'Archive')
  await expect(item(page, newText)).toContainText('Rejected')
})

test('deleting from the Overview moves the memory to the Archive and logs it', async ({ page }) => {
  const text = `User has a cat named Pixel (${stamp}).`
  const id = await seedMemory(owner().id, text)

  await login(page, owner())
  await page.goto('/memories')
  const row = item(group(page, 'About you'), text)
  await expect(row).toBeVisible()

  let dialogMessage = ''
  page.once('dialog', d => { dialogMessage = d.message(); void d.accept() })
  await row.getByRole('button', { name: 'Delete' }).click()

  await expect(item(group(page, 'About you'), text)).toHaveCount(0)
  expect(dialogMessage).toContain('Delete this memory?')

  await openTab(page, 'Archive')
  await expect(item(page, text)).toContainText('Deleted')

  await openTab(page, 'Activity')
  await expect(item(page, text).filter({ hasText: 'Deleted (by you)' })).toBeVisible()

  const { data } = await admin.from('memories').select('status').eq('id', id).single()
  expect(data?.status).toBe('deleted')
})

test('erasing from the Archive removes the memory and its history for good', async ({ page }) => {
  const text = `User has a parrot named Kiwi (${stamp}).`
  const id = await seedMemory(owner().id, text)

  await login(page, owner())
  await page.goto('/memories')
  page.once('dialog', d => void d.accept())
  await item(group(page, 'About you'), text).getByRole('button', { name: 'Delete' }).click()
  await expect(item(group(page, 'About you'), text)).toHaveCount(0)

  await openTab(page, 'Archive')
  let dialogMessage = ''
  page.once('dialog', d => { dialogMessage = d.message(); void d.accept() })
  await item(page, text).getByRole('button', { name: 'Erase' }).click()
  await expect(item(page, text)).toHaveCount(0)
  expect(dialogMessage).toContain('cannot be recovered')

  // Gone from Activity too, and from the database: no row, no events.
  await openTab(page, 'Activity')
  await expect(page.locator('body')).not.toContainText(text)
  const { data: rows } = await admin.from('memories').select('id').eq('id', id)
  const { data: events } = await admin.from('memory_events').select('id').eq('memory_id', id)
  expect(rows).toHaveLength(0)
  expect(events).toHaveLength(0)
})

test('memories are grouped by kind, temporary ones with their end date', async ({ page }) => {
  const fact = `User is a marine biologist (${stamp}).`
  const pref = `User prefers tea over coffee (${stamp}).`
  const temp = `User is visiting Oslo (${stamp}).`
  const until = new Date(Date.now() + 10 * 86_400_000)
  await seedMemory(owner().id, fact, { kind: 'fact' })
  await seedMemory(owner().id, pref, { kind: 'preference' })
  await seedMemory(owner().id, temp, { kind: 'temporary', expiresAt: until.toISOString() })

  await login(page, owner())
  await page.goto('/memories')

  await expect(group(page, 'About you')).toContainText(fact)
  await expect(group(page, 'Likes & preferences')).toContainText(pref)
  await expect(group(page, 'Right now')).toContainText(temp)

  // each memory appears only in its own group
  await expect(group(page, 'About you')).not.toContainText(pref)
  await expect(group(page, 'About you')).not.toContainText(temp)
  await expect(group(page, 'Likes & preferences')).not.toContainText(fact)
  await expect(group(page, 'Right now')).not.toContainText(fact)

  // the end date is formatted in the browser's locale and time zone
  const untilLabel = await page.evaluate(iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), until.toISOString())
  await expect(item(group(page, 'Right now'), temp)).toContainText(`Until ${untilLabel}`)
  await expect(item(group(page, 'About you'), fact)).not.toContainText('Until')
})

test('a temporary memory past its end date is not shown as current, even before the expiry sweep', async ({ page }) => {
  const stale = `User is visiting Lima (${stamp}).`
  await seedMemory(owner().id, stale, { kind: 'temporary', expiresAt: new Date(Date.now() - 3_600_000).toISOString() })

  await login(page, owner())
  await page.goto('/memories')
  await expect(group(page, 'Right now')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(stale)
})

test('the search box filters the overview', async ({ page }) => {
  const kayak = `User enjoys kayaking on weekends (${stamp}).`
  const piano = `User plays the piano (${stamp}).`
  await seedMemory(owner().id, kayak, { kind: 'preference' })
  await seedMemory(owner().id, piano, { kind: 'fact' })

  await login(page, owner())
  await page.goto('/memories')
  const search = page.getByRole('searchbox', { name: 'Search your memories' })
  await expect(item(page, kayak)).toBeVisible()
  await expect(item(page, piano)).toBeVisible()

  await search.fill('KAYAK') // case-insensitive
  await expect(item(page, kayak)).toBeVisible()
  await expect(item(page, piano)).toHaveCount(0)
  await expect(group(page, 'About you')).toContainText('No matches.')

  await search.fill('zzz-no-such-memory')
  await expect(item(page, kayak)).toHaveCount(0)
  await expect(group(page, 'Likes & preferences')).toContainText('No matches.')

  await search.fill('')
  await expect(item(page, kayak)).toBeVisible()
  await expect(item(page, piano)).toBeVisible()
})

test('the memory detail page shows the content, its source message and its history', async ({ page }) => {
  const source = `By the way, I am allergic to peanuts (${stamp}).`
  const first = `User is allergic to nuts (${stamp}).`
  const refined = `User is allergic to peanuts (${stamp}).`
  const { conversationId, messageId } = await seedMessage(owner().id, `Allergy chat ${stamp}`, source)
  const id = await seedMemory(owner().id, first, { messageId })
  const { error } = await admin.rpc('memory_update', {
    p_user_id: owner().id, p_memory_id: id, p_content: refined, p_kind: 'fact', p_expires_at: null,
    p_embedding: vec(), p_embedding_profile: PROFILE, p_message_id: messageId, p_reason: 'More specific wording',
  })
  if (error) throw error

  await login(page, owner())
  await page.goto('/memories')
  const row = item(group(page, 'About you'), refined)
  await expect(row.getByRole('link', { name: 'from a chat' })).toHaveAttribute('href', `/chat/${conversationId}`)
  await row.getByRole('link', { name: refined }).click()

  await expect(page).toHaveURL(new RegExp(`/memories/${id}$`))
  await expect(page.getByRole('heading', { name: 'Memory', exact: true })).toBeVisible()
  await expect(page.getByText(/^active$/i)).toBeVisible()
  await expect(page.getByText(refined, { exact: true })).toBeVisible()

  const learned = page.locator('section', { has: page.getByRole('heading', { name: 'Learned from' }) })
  await expect(learned).toContainText(`“${source}”`)

  const history = page.locator('section', { has: page.getByRole('heading', { name: 'History' }) }).getByRole('listitem')
  await expect(history).toHaveCount(2)
  await expect(history.nth(0)).toContainText('Created')
  await expect(history.nth(0)).toContainText('QA seed')
  await expect(history.nth(1)).toContainText('Updated')
  await expect(history.nth(1)).toContainText(`${first} → ${refined}`)
  await expect(history.nth(1)).toContainText('More specific wording')

  await page.getByRole('link', { name: '← Back to Memories' }).click()
  await expect(page).toHaveURL(/\/memories$/)
})

test('pausing memory in the chat panel persists across reloads', async ({ page }) => {
  await login(page, owner())
  const panel = page.locator('aside')
  const toggle = panel.getByRole('switch')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(toggle).toHaveText('On')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(toggle).toHaveText('Paused')
  await expect.poll(() => memoryEnabled(owner().id)).toBe(false)

  await page.reload()
  await expect(panel.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  await expect(panel.getByRole('switch')).toHaveText('Paused')

  await panel.getByRole('switch').click()
  await expect(panel.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => memoryEnabled(owner().id)).toBe(true)

  await page.reload()
  await expect(panel.getByRole('switch')).toHaveText('On')
})

test("another user cannot see or open someone else's memories", async ({ page }) => {
  const secret = `User's bank PIN hint is blue heron (${stamp}).`
  const id = await seedMemory(owner().id, secret)

  await login(page, other())
  await page.goto(`/memories/${id}`)
  await expect(page.getByText('This page could not be found.')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(secret)

  await page.goto('/memories')
  await expect(page.getByText('Memoria does not know anything about you yet.')).toBeVisible()
  await expect(page.getByText('0 remembered')).toBeVisible()
  await openTab(page, 'Activity')
  await expect(page.getByText('No activity yet.', { exact: false })).toBeVisible()
  await openTab(page, 'Archive')
  await expect(page.getByText('Nothing here yet.', { exact: false })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(secret)
})

test('temporary memories past their end date move to the Archive as Expired', async ({ page }) => {
  const text = `User is at a conference in Rome (${stamp}).`
  const id = await seedMemory(owner().id, text, { kind: 'temporary', expiresAt: new Date(Date.now() - 86_400_000).toISOString() })
  const { data: expired, error } = await admin.rpc('memory_expire_due')
  if (error) throw error
  expect(expired).toBeGreaterThanOrEqual(1)

  await login(page, owner())
  await page.goto('/memories')
  await expect(group(page, 'Right now')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(text)

  await openTab(page, 'Archive')
  await expect(item(page, text)).toContainText('Expired')

  await openTab(page, 'Activity')
  // the system expired it, not the user
  const expiredEvent = item(page, text).filter({ hasText: 'Expired' })
  await expect(expiredEvent).toBeVisible()
  await expect(expiredEvent).not.toContainText('(by you)')
  await expect(expiredEvent).toContainText('End date reached')

  await page.goto(`/memories/${id}`)
  // the status badge and the history entry both say so
  await expect(page.getByText(/^expired$/i)).toHaveCount(2)
})
