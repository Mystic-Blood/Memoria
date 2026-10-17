import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Landing from '@/components/landing/Landing'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Signed-in users go straight to the app; everyone else sees the landing page.
  if (user) redirect('/chat')

  return <Landing />
}
