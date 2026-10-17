import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { streamText, UIMessage, convertToModelMessages, TextUIPart, toUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { after } from 'next/server'
import { getModel } from '@/lib/ai/provider'
import { retrieveRelevantMemories } from '@/lib/engine/retrieve'
import { buildSystemPrompt } from '@/lib/engine/context'
import { runMemoryPipeline } from '@/lib/engine/pipeline'
import { misconfiguredResponse } from '@/lib/env'
import { limitResponse, readChatLimits, takeChatUsage } from '@/lib/limits'
import { recentMessages } from '@/lib/chat/history'

const MAX_MESSAGE_CHARS = 4000

export async function POST(req: Request) {
  const misconfigured = misconfiguredResponse('/api/chat', ['supabase', 'ai', 'cron'])
  if (misconfigured) return misconfigured

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }
  const { messages, conversationId } = json as { messages: UIMessage[], conversationId?: string | null }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response('Messages are required', { status: 400 })
  }

  const latestMessage = messages[messages.length - 1]
  if (latestMessage?.role !== 'user') {
    return new Response('Last message must be from user', { status: 400 })
  }

  const textPart = latestMessage.parts.find(p => p.type === 'text') as TextUIPart | undefined
  const userContent = textPart?.text.trim() ?? ''
  if (!userContent) {
    return new Response('Message text is required', { status: 400 })
  }
  if (userContent.length > MAX_MESSAGE_CHARS) {
    return new Response(`Message is too long (max ${MAX_MESSAGE_CHARS} characters)`, { status: 413 })
  }

  // 0. Usage limits (counted in the database, so they hold across serverless instances). Checked
  //    before anything is written, and fails closed: an unchecked request could drain the API quota.
  const admin = createAdminClient()
  const limits = readChatLimits()
  const usage = await takeChatUsage(admin, user.id, limits)
  if (!usage.ok) {
    console.error('[Chat] Usage limit check failed; refusing the request:', usage.error)
    return new Response('Chat is temporarily unavailable. Please try again in a minute.', { status: 503, headers: { 'retry-after': '60' } })
  }
  if (!usage.decision.allowed) {
    console.warn(`[Chat] Limit reached (${usage.decision.reason}) for user ${user.id}`)
    return limitResponse(usage.decision, limits)
  }

  // 1. Identify or create the conversation (RLS-scoped client: users only see their own)
  let currentConvId = conversationId ?? null
  if (!currentConvId) {
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: userContent.slice(0, 60) })
      .select('id')
      .single()
    if (convError || !conv) {
      console.error('[Chat] Failed to create conversation', convError)
      return new Response('Something went wrong on our side.', { status: 500 })
    }
    currentConvId = conv.id as string
  } else {
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', currentConvId)
      .eq('user_id', user.id)
      .single()
    if (convError || !conv) {
      return new Response('Conversation not found', { status: 404 })
    }
  }
  const convId: string = currentConvId

  // 2. Persist the user message
  const { data: userMsg, error: userMsgError } = await supabase
    .from('messages')
    .insert({ conversation_id: convId, user_id: user.id, role: 'user', content: userContent })
    .select('id')
    .single()
  if (userMsgError || !userMsg) {
    console.error('[Chat] Failed to persist user message', userMsgError)
    return new Response('Something went wrong on our side.', { status: 500 })
  }

  // 3. Relevant memories. Similarity search is server-only; the user id comes from the verified session.
  const retrieved = await retrieveRelevantMemories(admin, user.id, userContent)
  if (!retrieved.ok) console.error('[Chat] Memory retrieval failed; answering without memories:', retrieved.error)
  const systemPrompt = buildSystemPrompt(retrieved.memories)
  // Shown under the reply ("used these memories") and saved with it so it survives a refresh.
  const usedMemories = retrieved.memories.map(m => ({ id: m.id, content: m.content }))

  try {
    // Only the recent part of the chat; older facts reach the model as memories.
    const modelMessages = await convertToModelMessages(recentMessages(messages))

    const result = streamText({
      model: getModel('chat'),
      system: systemPrompt,
      messages: modelMessages,
      maxRetries: 0,
      // A stalled model must not leave the chat waiting forever. Generous first-token limit: a cold local
      // model on a small GPU can take ~50 s to load; after that, tokens must keep coming.
      timeout: { firstChunkMs: 90_000, chunkMs: 30_000 },
      async onEnd({ text }) {
        const { error: asstError } = await supabase
          .from('messages')
          .insert({ conversation_id: convId, user_id: user.id, role: 'assistant', content: text, used_memory_ids: usedMemories.map(m => m.id) })
        if (asstError) console.error('[Chat] Failed to persist assistant message', asstError)
        await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId)
      },
    })

    // 4. Update memory in the background after the response is sent
    after(async () => {
      // Move temporary memories past their end date to the Archive. A daily cron does this on a hosted
      // deployment; running locally there is no cron, so it also happens here (one indexed update).
      const { error: expireError } = await admin.rpc('memory_expire_due')
      if (expireError) console.error('[Memory] Expiry sweep failed', expireError)
      try {
        const outcome = await runMemoryPipeline({ client: admin, userId: user.id, conversationId: convId, messageId: userMsg.id })
        console.log(`[Memory] ${outcome.status}: ${outcome.facts.length} facts in ${outcome.durationMs}ms${outcome.error ? ` (${outcome.error})` : ''}`)
      } catch (err) {
        console.error('[Memory] Pipeline crashed', err)
      }
    })

    return createUIMessageStreamResponse({
      headers: {
        'x-conversation-id': convId,
        'x-user-message-id': userMsg.id,
      },
      stream: toUIMessageStream({
        stream: result.stream,
        messageMetadata: ({ part }) => (part.type === 'start' ? { usedMemories } : undefined),
      }),
    })
  } catch (error) {
    console.error('[Chat] Generation failed', error)
    return new Response('The assistant could not reply.', { status: 500 })
  }
}
