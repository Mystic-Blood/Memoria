'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { buildTimeline, upsertById, type MemoryLookup, type TimelineItem } from '@/lib/chat/timeline'
import type { MemoryEventRow, MemoryRunRow } from '@/lib/engine/types'
import { confirmMemoryAction, rejectMemoryAction } from '@/app/memories/actions'
import { setMemoryEnabledAction } from './actions'
import { LiveIndicator, MemoryCard } from '@/components/ui'

type Props = {
  conversationId: string | null
  initialEvents: MemoryEventRow[]
  initialRuns: MemoryRunRow[]
  initialMemories: MemoryLookup
  memoryEnabled: boolean
  /** Narrow screens: closes the drawer the panel is shown in. */
  onClose?: () => void
  /** Reports how many entries the panel shows (used for the "new" badge on narrow screens). */
  onCountChange?: (count: number) => void
}

type LiveState = 'idle' | 'connecting' | 'live' | 'polling'

const POLL_MS = 4000

export default function MemoryTimeline({ conversationId, initialEvents, initialRuns, initialMemories, memoryEnabled: initialEnabled, onClose, onCountChange }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [events, setEvents] = useState(initialEvents)
  const [runs, setRuns] = useState(initialRuns)
  const [memories, setMemories] = useState<MemoryLookup>(initialMemories)
  const [live, setLive] = useState<LiveState>(conversationId ? 'connecting' : 'idle')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /** Loads everything for this conversation and merges it in (used after subscribing and when polling). */
  const backfill = useCallback(async (convId: string) => {
    const [{ data: ev }, { data: rn }] = await Promise.all([
      supabase.from('memory_events').select('*').eq('conversation_id', convId).order('created_at'),
      supabase.from('memory_runs').select('*').eq('conversation_id', convId).order('created_at'),
    ])
    if (ev) setEvents(prev => upsertById(prev, ev as MemoryEventRow[]))
    if (rn) setRuns(prev => upsertById(prev, rn as MemoryRunRow[]))
  }, [supabase])

  // Live updates for this conversation's memory events and pipeline runs.
  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`memory:${conversationId}`, { config: { postgres_changes_options: { wait: true } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memory_events', filter: `conversation_id=eq.${conversationId}` },
        payload => setEvents(prev => upsertById(prev, [payload.new as MemoryEventRow])))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_runs', filter: `conversation_id=eq.${conversationId}` },
        payload => { if (payload.new && 'id' in payload.new) setRuns(prev => upsertById(prev, [payload.new as MemoryRunRow])) })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setLive('live')
          void backfill(conversationId) // catch anything written before the subscription was active
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setLive('polling')
        }
      })
    return () => { void supabase.removeChannel(channel) }
  }, [conversationId, supabase, backfill])

  // Fallback when Realtime is unavailable: poll. (It cannot wait for a 'running' row: without Realtime
  // the panel would never learn that an update started.)
  useEffect(() => {
    if (!conversationId || live !== 'polling') return
    const t = setInterval(() => void backfill(conversationId), POLL_MS)
    return () => clearInterval(t)
  }, [conversationId, live, backfill])

  // Fetch content/status for memories referenced by events we have not seen yet (conflicts, changes).
  useEffect(() => {
    const missing = [...new Set(events.flatMap(e => [e.memory_id, e.related_memory_id]))].filter((id): id is string => !!id && !memories[id])
    if (missing.length === 0) return
    void supabase.from('memories').select('id, content, status').in('id', missing).then(({ data }) => {
      if (data?.length) setMemories(prev => ({ ...prev, ...Object.fromEntries(data.map(m => [m.id, { content: m.content, status: m.status }])) }))
    })
  }, [events, memories, supabase])

  const items = useMemo(() => buildTimeline(events, runs, memories), [events, runs, memories])

  useEffect(() => { onCountChange?.(items.length) }, [items.length, onCountChange])

  function resolveConflict(item: Extract<TimelineItem, { kind: 'conflict' }>, decision: 'confirm' | 'reject') {
    setActionError(null)
    startTransition(async () => {
      try {
        if (decision === 'confirm') await confirmMemoryAction(item.memoryId)
        else await rejectMemoryAction(item.memoryId)
        setMemories(prev => {
          const next = { ...prev, [item.memoryId]: { content: item.proposed, status: decision === 'confirm' ? 'active' : 'deleted' } }
          if (decision === 'confirm' && item.currentId && prev[item.currentId]) next[item.currentId] = { ...prev[item.currentId], status: 'superseded' }
          return next
        })
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not save your choice')
      }
    })
  }

  function toggleMemory() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      try { await setMemoryEnabledAction(next) } catch { setEnabled(!next) }
    })
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-subtle/50">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3 lg:bg-transparent">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-fg">Memory</h2>
          <LiveDot state={live} />
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Link href="/memories" className="btn btn-ghost btn-sm text-[13px]">All memories</Link>
          <button
            onClick={toggleMemory}
            disabled={pending}
            role="switch"
            aria-checked={enabled}
            title={enabled ? 'Memoria is learning from this chat' : 'Memory is paused: nothing new will be remembered'}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${enabled ? 'border-success-line bg-success-soft text-success' : 'border-line-strong bg-subtle text-muted'}`}
          >
            {enabled ? 'On' : 'Paused'}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close memory panel" className="btn btn-ghost btn-sm px-1.5 lg:hidden">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
        {actionError && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{actionError}</p>}
        {!enabled && (
          <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">Memory is paused. Nothing new will be remembered until you turn it back on.</p>
        )}
        {items.length === 0 && (
          <div className="px-2 py-10 text-center">
            <span aria-hidden="true" className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-accent-soft text-accent-text">
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15V7l6 5 6-5v8" /><circle cx="10" cy="4.5" r="1.3" fill="currentColor" stroke="none" /></svg>
            </span>
            <p className="mx-auto max-w-60 text-sm text-muted">
              {conversationId
                ? 'Nothing remembered from this conversation yet.'
                : 'As you chat, everything Memoria learns, updates or is unsure about appears here.'}
            </p>
          </div>
        )}
        {items.map(item => (
          <TimelineCard key={item.id} item={item} busy={pending} onResolve={resolveConflict} />
        ))}
      </div>
    </aside>
  )
}

function LiveDot({ state }: { state: LiveState }) {
  if (state === 'idle') return null
  const title = state === 'live' ? 'Live' : state === 'connecting' ? 'Connecting' : 'Live updates unavailable (polling)'
  if (state === 'live') return <LiveIndicator label="live" title={title} />
  if (state === 'connecting') return <LiveIndicator label="connecting" tone="warning" title={title} />
  return <LiveIndicator label="polling" tone="warning" title={title} />
}

function MemoryLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <Link href={`/memories/${id}`} className="underline-offset-2 hover:text-accent-text hover:underline">{children}</Link>
}

function TimelineCard({ item, busy, onResolve }: {
  item: TimelineItem
  busy: boolean
  onResolve: (item: Extract<TimelineItem, { kind: 'conflict' }>, decision: 'confirm' | 'reject') => void
}) {
  const time = new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  switch (item.kind) {
    case 'remembered':
      return (
        <MemoryCard tone="success" label="Remembered" time={time}>
          <span className={item.current ? '' : 'text-faint line-through'}><MemoryLink id={item.memoryId}>{item.content}</MemoryLink></span>
          {!item.current && <p className="mt-1 text-xs text-faint">No longer current</p>}
        </MemoryCard>
      )
    case 'changed':
      return (
        <MemoryCard tone="accent" label="Updated" time={time}>
          <p className="text-faint line-through">{item.before}</p>
          <span className={item.current ? '' : 'text-faint line-through'}><MemoryLink id={item.memoryId}>{item.after}</MemoryLink></span>
          {item.reason && <p className="mt-1 text-xs italic text-faint">{item.reason}</p>}
          {!item.current && <p className="mt-1 text-xs text-faint">No longer current</p>}
        </MemoryCard>
      )
    case 'conflict':
      return (
        <MemoryCard tone="warning" label="Which is right?" time={time}>
          <p className="text-muted">You said: <strong className="font-semibold text-fg">{item.proposed}</strong></p>
          {item.current && <p className="text-muted">I remember: {item.current}</p>}
          {item.resolution === 'pending' ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => onResolve(item, 'confirm')} className="btn btn-sm btn-primary">Use the new one</button>
              <button disabled={busy} onClick={() => onResolve(item, 'reject')} className="btn btn-sm btn-secondary">Keep what I remember</button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-faint">
              {item.resolution === 'confirmed' ? 'You chose the new one.' : item.resolution === 'rejected' ? 'You kept the existing memory.' : 'Resolved.'}
            </p>
          )}
        </MemoryCard>
      )
    case 'note':
      return (
        <MemoryCard tone="neutral" label={item.label} time={time}>
          <MemoryLink id={item.memoryId}>{item.content}</MemoryLink>
        </MemoryCard>
      )
    case 'run':
      if (item.status === 'running') {
        return <p className="flex items-center gap-2 px-1 text-xs text-faint"><span className="inline-block size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />Updating memory…</p>
      }
      if (item.status === 'failed') {
        return (
          <MemoryCard tone="danger" label="Memory update failed" time={time}>
            <p className="text-xs break-words text-muted">{item.error ?? 'Unknown error'}</p>
          </MemoryCard>
        )
      }
      if (item.status === 'skipped') return <p className="px-1 text-xs text-faint">Memory paused: nothing was saved from this message.</p>
      return <p className="px-1 text-xs text-faint">Nothing new to remember from that message.</p>
  }
}
