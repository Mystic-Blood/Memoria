import { describe, it, expect } from 'vitest'
import type { UIMessage } from 'ai'
import { recentMessages } from '@/lib/chat/history'

const msg = (id: string, role: 'user' | 'assistant', text: string): UIMessage => ({ id, role, parts: [{ type: 'text', text }] })

describe('recentMessages', () => {
  const chat = [
    msg('1', 'user', 'a'.repeat(40)),
    msg('2', 'assistant', 'b'.repeat(40)),
    msg('3', 'user', 'c'.repeat(40)),
    msg('4', 'assistant', 'd'.repeat(40)),
    msg('5', 'user', 'e'.repeat(40)),
  ]
  const ids = (m: UIMessage[]) => m.map(x => x.id)

  it('keeps everything when it fits', () => {
    expect(ids(recentMessages(chat, 1000))).toEqual(['1', '2', '3', '4', '5'])
  })

  it('drops the oldest turns first and starts on a user message', () => {
    // 130 characters fit messages 3-5 (120); message 2 would exceed it.
    expect(ids(recentMessages(chat, 130))).toEqual(['3', '4', '5'])
    // 90 characters fit 4-5, but a reply must not come first: start at 5.
    expect(ids(recentMessages(chat, 90))).toEqual(['5'])
  })

  it('always keeps the latest message, even when it alone is over budget', () => {
    expect(ids(recentMessages([msg('1', 'user', 'x'.repeat(500))], 100))).toEqual(['1'])
  })
})
