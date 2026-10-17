'use server'

import { createClient } from '@/utils/supabase/server'

export async function setMemoryEnabledAction(enabled: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { error } = await supabase.from('profiles').update({ memory_enabled: enabled, updated_at: new Date().toISOString() }).eq('id', user.id)
  if (error) throw new Error(error.message)
}
