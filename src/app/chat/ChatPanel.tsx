'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage, type TextUIPart } from 'ai'
import { useMemo, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import type { ChatMessageMetadata } from '@/lib/chat/load'
import { LogoMark } from '@/components/Logo'
import { bubbleClass } from '@/components/ui'

type Props = {
  conversationId: string | null
  initialMessages: UIMessage[]
  onConversationCreated: (id: string, title: string) => void
}

const SUGGESTIONS = [
  "Hi! I'm Sam, I work as a designer and I live in Toronto.",
  'I just switched from Android to an iPhone.',
  "I'm in Rome for a conference until Friday.",
]

/** Title for a new conversation: the first message the user sent in it. */
function firstUserText(body: BodyInit | null | undefined): string {
  try {
    const parsed = JSON.parse(String(body)) as { messages?: UIMessage[] }
    const first = parsed.messages?.find(m => m.role === 'user')
    const text = first?.parts.find((p): p is TextUIPart => p.type === 'text')?.text ?? ''
    return text.slice(0, 60)
  } catch {
    return ''
  }
}

export default function ChatPanel({ conversationId, initialMessages, onConversationCreated }: Props) {
  const [input, setInput] = useState('')
  const [activeConversationId, setActiveConversationId] = useState(conversationId)
  const bottomRef = useRef<HTMLDivElement>(null)

  // The server creates the conversation on the first message and reports its id in a header.
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    fetch: async (url, init) => {
      const response = await fetch(url, init)
      const newId = response.headers.get('x-conversation-id')
      if (response.ok && newId) {
        setActiveConversationId(newId)
        onConversationCreated(newId, firstUserText(init?.body))
      }
      return response
    },
  }), [onConversationCreated])

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId ?? undefined,
    messages: initialMessages,
    transport,
  })
  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    void sendMessage({ text: trimmed }, { body: { conversationId: activeConversationId } })
    setInput('')
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.length === 0 && (
            <div className="mx-auto mt-6 max-w-md text-center sm:mt-16">
              <LogoMark className="mx-auto size-10" />
              <h2 className="mt-5 text-xl font-semibold tracking-tight text-fg">Tell Memoria about yourself</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Everything it learns shows up in the memory panel, and you can correct it any time.
              </p>
              <p className="eyebrow mt-8 mb-3">Try one of these</p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-fg shadow-card transition-colors hover:border-accent-line hover:bg-accent-soft"
                  >
                    <span>{s}</span>
                    <span aria-hidden="true" className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text">&rarr;</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(m => {
            const text = m.parts.filter((p): p is TextUIPart => p.type === 'text').map(p => p.text).join('')
            const mine = m.role === 'user'
            const used = (m.metadata as ChatMessageMetadata | undefined)?.usedMemories ?? []
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] sm:max-w-[80%]">
                  <div className={`whitespace-pre-wrap leading-relaxed ${bubbleClass(mine)}`}>
                    {text}
                  </div>
                  {!mine && used.length > 0 && (
                    <details className="group mt-1.5 ml-1 text-xs text-faint">
                      <summary className="w-fit cursor-pointer rounded-md px-1 py-0.5 select-none hover:text-muted">Used {used.length} {used.length === 1 ? 'memory' : 'memories'}</summary>
                      <ul className="mt-1.5 space-y-1 border-l-2 border-accent-line pl-3">
                        {used.map(u => <li key={u.id}><Link href={`/memories/${u.id}`} className="text-muted underline-offset-2 hover:text-accent-text hover:underline">{u.content}</Link></li>)}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            )
          })}

          {status === 'submitted' && (
            <div className="flex justify-start">
              <div className={`${bubbleClass(false)} flex items-center gap-2 text-sm text-faint`}>
                <span aria-hidden="true" className="flex gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-faint" />
                  <span className="size-1.5 animate-pulse rounded-full bg-faint [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-faint [animation-delay:300ms]" />
                </span>
                Thinking…
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-center text-sm text-danger">
              {/* The server's message is already written for people (rate limits, capacity, errors). */}
              {error.message?.trim() || 'The reply failed.'} Try sending again in a moment.
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send(input) }}
        className="px-3 pt-1 pb-3 sm:px-6 sm:pb-5"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-card transition-colors focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            rows={1}
            maxLength={4000}
            placeholder="Message Memoria…"
            disabled={busy}
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-fg placeholder:text-faint focus:outline-none focus-visible:outline-none disabled:opacity-60"
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary rounded-xl">
            Send
          </button>
        </div>
        <p className="mx-auto mt-2 hidden max-w-2xl text-center text-xs text-faint sm:block">
          Enter to send, Shift + Enter for a new line. Memoria can be wrong; check the memory panel.
        </p>
      </form>
    </section>
  )
}
