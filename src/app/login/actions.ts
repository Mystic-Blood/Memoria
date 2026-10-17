'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { signupsDisabled } from '@/lib/env'

const credentialsSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
}

function backToLogin(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`)
}

export async function login(formData: FormData) {
  const parsed = readCredentials(formData)
  if (!parsed.success) backToLogin(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) backToLogin(error.message)

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  if (signupsDisabled()) backToLogin('Sign-ups are closed for this demo right now. If you already have an account, log in.')

  const parsed = readCredentials(formData)
  if (!parsed.success) backToLogin(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp(parsed.data)
  if (error) backToLogin(error.message)
  // With "Confirm email" enabled in Supabase there is no session until the link in the email is clicked.
  if (!data.session) backToLogin('Check your inbox and click the confirmation link, then log in here.')

  revalidatePath('/', 'layout')
  redirect('/')
}
