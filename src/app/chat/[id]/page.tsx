import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { loadChatData } from '@/lib/chat/load'
import ChatShell from '../ChatShell'

export const dynamic = 'force-dynamic'

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS returns nothing for someone else's conversation, which looks exactly like a missing one.
  const { data: conversation } = await supabase.from('conversations').select('id').eq('id', id).maybeSingle()
  if (!conversation) notFound()

  const data = await loadChatData(supabase, id)
  return <ChatShell key={id} conversationId={id} data={data} />
}
