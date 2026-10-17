import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { loadChatData } from '@/lib/chat/load'
import ChatShell from './ChatShell'

export const dynamic = 'force-dynamic'

export default async function NewChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await loadChatData(supabase, null)
  return <ChatShell key="new" conversationId={null} data={data} />
}
