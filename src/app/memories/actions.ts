'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { embedText, toPgVector } from '@/lib/engine/embed'

// Every action runs as the signed-in user; the database functions check ownership and record history.

async function signedIn() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return supabase
}

function refresh(memoryId: string) {
  revalidatePath('/memories')
  revalidatePath(`/memories/${memoryId}`)
}

export async function deleteMemoryAction(memoryId: string) {
  const supabase = await signedIn()
  const { error } = await supabase.rpc('memory_delete', { p_memory_id: memoryId })
  if (error) throw new Error(error.message)
  refresh(memoryId)
}

export async function confirmMemoryAction(memoryId: string) {
  const supabase = await signedIn()
  const { error } = await supabase.rpc('memory_confirm', { p_memory_id: memoryId })
  if (error) throw new Error(error.message)
  refresh(memoryId)
}

export async function rejectMemoryAction(memoryId: string) {
  const supabase = await signedIn()
  const { error } = await supabase.rpc('memory_reject', { p_memory_id: memoryId })
  if (error) throw new Error(error.message)
  refresh(memoryId)
}

export async function editMemoryAction(memoryId: string, newContent: string) {
  const content = newContent.trim()
  if (!content || content.length > 500) throw new Error('A memory must be between 1 and 500 characters.')
  const supabase = await signedIn()
  const embedded = await embedText(content, 'document')
  if (!embedded.ok) throw new Error('Could not update the memory: the embedding model is unavailable.')
  const { error } = await supabase.rpc('memory_edit', {
    p_memory_id: memoryId,
    p_content: content,
    p_embedding: toPgVector(embedded.vector),
    p_embedding_profile: embedded.profile,
  })
  if (error) throw new Error(error.message)
  refresh(memoryId)
}

/** Permanently removes an archived memory and its history (the database refuses anything still in use). */
export async function eraseMemoryAction(memoryId: string) {
  const supabase = await signedIn()
  const { error } = await supabase.rpc('memory_erase', { p_memory_id: memoryId })
  if (error) throw new Error(error.message)
  revalidatePath('/memories')
}
