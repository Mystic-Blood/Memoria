import type { UIMessage } from 'ai'

/**
 * How much of the conversation the chat model sees, in characters (~4 characters per token, so about
 * 3,000 tokens). Long-term facts reach the model through memories, not through old turns, so the recent
 * part of the chat is enough, and a bounded prompt keeps replies fast and inside a small local model's
 * context window (where overflowing text is otherwise dropped without notice).
 */
export const HISTORY_CHAR_BUDGET = 12_000

function textLength(message: UIMessage): number {
  return message.parts.reduce((n, p) => n + (p.type === 'text' ? p.text.length : 0), 0)
}

/** The most recent messages that fit the budget, oldest first. The latest message is always kept. */
export function recentMessages(messages: UIMessage[], budget = HISTORY_CHAR_BUDGET): UIMessage[] {
  let used = 0
  let start = messages.length
  while (start > 0) {
    const size = textLength(messages[start - 1])
    if (start < messages.length && used + size > budget) break
    used += size
    start--
  }
  // Start on a user turn, so the model never sees a reply without the message it answered.
  while (start < messages.length - 1 && messages[start].role !== 'user') start++
  return messages.slice(start)
}
