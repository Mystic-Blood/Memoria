'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ChatData, ConversationSummary } from '@/lib/chat/load'
import ChatPanel from './ChatPanel'
import MemoryTimeline from './MemoryTimeline'

type Drawer = 'none' | 'chats' | 'memory'

export default function ChatShell({ conversationId, data }: { conversationId: string | null; data: ChatData }) {
  const [convId, setConvId] = useState(conversationId)
  const [conversations, setConversations] = useState<ConversationSummary[]>(data.conversations)
  // Below the lg breakpoint the conversation list and the memory panel are slide-over drawers.
  const [drawer, setDrawer] = useState<Drawer>('none')
  // Memory panel entries the user has not seen yet while the panel was closed (narrow screens only).
  const [memoryCount, setMemoryCount] = useState<number | null>(null)
  const [seenCount, setSeenCount] = useState<number | null>(null)

  // Called after every reply; only the first call for a new conversation changes anything.
  const handleCreated = useCallback((id: string, title: string) => {
    setConvId(prev => prev ?? id)
    setConversations(prev => (prev.some(c => c.id === id) ? prev : [{ id, title, updated_at: new Date().toISOString() }, ...prev]))
    // Keep the URL in sync without remounting the chat that is still streaming.
    if (window.location.pathname !== `/chat/${id}`) window.history.replaceState(null, '', `/chat/${id}`)
  }, [])

  const handleMemoryCount = useCallback((count: number) => {
    setMemoryCount(count)
    setSeenCount(prev => prev ?? count) // whatever is there on load counts as seen
  }, [])

  const close = useCallback(() => setDrawer('none'), [])

  useEffect(() => {
    if (drawer === 'none') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, close])

  function openMemory() {
    setDrawer('memory')
    setSeenCount(memoryCount)
  }

  const unseen = memoryCount !== null && seenCount !== null && drawer !== 'memory' ? memoryCount - seenCount : 0
  const current = conversations.find(c => c.id === convId)

  // Drawer behaviour below lg; a normal grid column from lg up. Closed drawers are `invisible`,
  // so their contents cannot be focused or read until they are opened.
  const drawerBase = 'fixed inset-y-0 z-40 flex w-[88%] max-w-sm flex-col bg-surface shadow-float transition-[transform,visibility] duration-200 ease-out motion-reduce:transition-none lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:visible lg:shadow-none lg:transition-none'

  return (
    <div className="relative grid h-[calc(100dvh-3.5rem)] min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_23rem] lg:grid-rows-1">
      {/* Narrow-screen toolbar: reach the conversation list and the memory panel. */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2 lg:hidden">
        <button type="button" onClick={() => setDrawer('chats')} aria-expanded={drawer === 'chats'} aria-controls="chat-list" className="btn btn-ghost btn-sm gap-2 px-2 py-1.5 text-sm">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" /></svg>
          Chats
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-muted">{current?.title || 'New chat'}</span>
        <button type="button" onClick={openMemory} aria-expanded={drawer === 'memory'} aria-controls="memory-panel" className="btn btn-secondary btn-sm relative gap-2 px-2.5 py-1.5 text-sm">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 text-accent-text" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15V7l6 5 6-5v8" /><circle cx="10" cy="4.5" r="1.3" fill="currentColor" stroke="none" /></svg>
          Memory
          {unseen > 0 && (
            <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-on-accent tabular-nums">
              {unseen}<span className="sr-only"> new</span>
            </span>
          )}
        </button>
      </div>

      {drawer !== 'none' && (
        <button type="button" tabIndex={-1} aria-label="Close panel" onClick={close} className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] lg:hidden" />
      )}

      <nav
        id="chat-list"
        aria-label="Conversations"
        className={`${drawerBase} left-0 border-r border-line lg:bg-canvas ${drawer === 'chats' ? 'translate-x-0 visible' : '-translate-x-full invisible'}`}
      >
        <div className="flex items-center gap-2 p-3">
          <Link href="/chat" className="btn btn-secondary flex-1">
            + New chat
          </Link>
          <button type="button" onClick={close} aria-label="Close conversations" className="btn btn-ghost px-2.5 lg:hidden">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        <p className="eyebrow px-5 pt-2 pb-1.5">Recent</p>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {conversations.map(c => (
            <li key={c.id}>
              <Link
                href={`/chat/${c.id}`}
                onClick={close}
                aria-current={c.id === convId ? 'page' : undefined}
                className={`block truncate rounded-lg px-3 py-2 text-sm transition-colors ${c.id === convId ? 'bg-accent-soft font-medium text-accent-text' : 'text-muted hover:bg-subtle hover:text-fg'}`}
                title={c.title ?? 'Untitled'}
              >
                {c.title || 'Untitled'}
              </Link>
            </li>
          ))}
          {conversations.length === 0 && <li className="px-3 py-2 text-sm text-faint">No conversations yet</li>}
        </ul>
      </nav>

      <div className="min-h-0 lg:col-start-2 lg:row-start-1">
        <ChatPanel conversationId={conversationId} initialMessages={data.messages} onConversationCreated={handleCreated} />
      </div>

      <div
        id="memory-panel"
        className={`${drawerBase} right-0 border-l border-line lg:col-start-3 lg:row-start-1 ${drawer === 'memory' ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
      >
        <MemoryTimeline
          conversationId={convId}
          initialEvents={data.events}
          initialRuns={data.runs}
          initialMemories={data.memories}
          memoryEnabled={data.memoryEnabled}
          onClose={close}
          onCountChange={handleMemoryCount}
        />
      </div>
    </div>
  )
}
