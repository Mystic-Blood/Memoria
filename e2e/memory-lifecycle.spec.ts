import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * The main user journey in a real browser: sign in, tell Memoria something, watch the memory panel
 * fill in live, change a fact, refresh, ask in a new chat, inspect it in the Explorer.
 * Screenshots of each stage are written to test-results/screens/.
 */

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const email = `e2e-${Date.now()}@eval.memoria.test`
const password = `E2e-${crypto.randomUUID()}`
let userId: string | undefined

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  userId = data.user.id
})

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId)
})

async function send(page: Page, text: string) {
  const box = page.getByPlaceholder('Message Memoria…')
  await expect(box).toBeEnabled()
  await box.fill(text)
  await box.press('Enter')
  // the reply has finished streaming once the input is usable again
  await expect(box).toBeEnabled()
  await expect(page.getByText('Thinking…')).toHaveCount(0)
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true })

test('the memory lifecycle is visible and correctable in the browser', async ({ page }) => {
  // Sign in
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/chat$/)

  const panel = page.locator('aside')
  await expect(panel.getByRole('heading', { name: 'Memory' })).toBeVisible()

  // 1. A message with two facts: the panel shows what was remembered, live
  await send(page, "Hi! I'm Sam. I work as a graphic designer and I live in Toronto.")
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/)
  await expect(panel.getByText('live', { exact: true })).toBeVisible()
  await expect(panel).toContainText(/Toronto/i)
  await expect(panel).toContainText(/designer/i)
  await shot(page, '1-remembered')

  // 2. A change of fact: shown as an update (or, if the model is unsure, a question to the user)
  await send(page, 'Actually I just moved to Vancouver last week.')
  await expect(panel).toContainText(/Vancouver/i)
  const conflict = panel.getByRole('button', { name: 'Use the new one' })
  if (await conflict.isVisible()) {
    await shot(page, '2-conflict-question')
    await conflict.click()
    await expect(panel).toContainText('You chose the new one.')
  } else {
    await expect(panel.getByText('Updated').first()).toBeVisible()
  }
  // the old city is still visible in the history, but marked as no longer current
  await expect(panel.getByText('No longer current').first()).toBeVisible()
  await shot(page, '2-updated')

  // 3. Refresh: the conversation and its memory history are still there
  await page.reload()
  await expect(page.getByText("Hi! I'm Sam. I work as a graphic designer and I live in Toronto.")).toBeVisible()
  await expect(panel).toContainText(/Vancouver/i)
  await shot(page, '3-after-refresh')

  // 4. A new conversation can use the memory
  await page.getByRole('link', { name: '+ New chat' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await send(page, 'Which city do I live in? Answer with just the city.')
  const reply = page.locator('section div.justify-start').last()
  await expect(reply).toContainText(/Vancouver/i)
  // the answer shows which memory it used
  const used = page.getByText(/^Used \d+ memor(y|ies)$/).first()
  await expect(used).toBeVisible()
  await used.click()
  await expect(page.getByRole('link', { name: /Vancouver/i }).first()).toBeVisible()
  await shot(page, '4-recall-in-new-chat')

  // 5. Memories page (the old /explorer link still works): current facts grouped, the old city gone
  await page.goto('/explorer')
  await expect(page).toHaveURL(/\/memories$/)
  const aboutYou = page.getByRole('region', { name: 'About you' })
  await expect(aboutYou).toContainText(/Vancouver/i)
  await expect(page.locator('body')).not.toContainText(/lives in Toronto/i)
  await shot(page, '5-memories-overview')

  // Inline edit, without leaving the page
  const vancouver = aboutYou.getByRole('listitem').filter({ hasText: /Vancouver/i }).first()
  await vancouver.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Memory text').fill('User lives in Vancouver, British Columbia.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(aboutYou).toContainText('User lives in Vancouver, British Columbia.')

  // Activity shows how it changed; the archive keeps the old memory
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByText('Edited (by you)').first()).toBeVisible()
  await expect(page.locator('body')).toContainText(/Toronto/i)
  await shot(page, '6-memories-activity')
  await page.getByRole('link', { name: 'Archive' }).click()
  await expect(page.locator('body')).toContainText(/Toronto/i)

  // Detail page: full history of one memory
  await page.getByRole('link', { name: 'Overview' }).click()
  await page.getByRole('link', { name: 'User lives in Vancouver, British Columbia.' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await expect(page.getByText('Edited by you')).toBeVisible()
  await shot(page, '7-memory-detail')
})
