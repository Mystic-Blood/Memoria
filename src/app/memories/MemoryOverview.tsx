'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MemoryKind, MemoryStatus } from '@/lib/engine/types'
import { confirmMemoryAction, deleteMemoryAction, editMemoryAction, rejectMemoryAction } from './actions'

export type OverviewItem = {
  id: string
  content: string
  kind: MemoryKind
  status: MemoryStatus
  expiresAt: string | null
  updatedAt: string
  /** For pending memories: the active memory it contradicts. */
  conflictContent: string | null
  /** The conversation the memory was learned in, if still available. */
  conversationId: string | null
}

const GROUPS: Array<{ title: string; hint: string; match: (i: OverviewItem) => boolean }> = [
  { title: 'Right now', hint: 'Temporary. Forgotten automatically when they end.', match: i => i.status === 'active' && i.kind === 'temporary' },
  { title: 'About you', hint: 'Facts about you, your work, family and plans.', match: i => i.status === 'active' && i.kind === 'fact' },
  { title: 'Likes & preferences', hint: 'How you like things.', match: i => i.status === 'active' && i.kind === 'preference' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function MemoryOverview({ items }: { items: OverviewItem[] }) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter(i => i.content.toLowerCase().includes(q)) : items
  }, [items, query])

  const pending = visible.filter(i => i.status === 'pending')

  if (items.length === 0) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="text-fg">Memoria does not know anything about you yet.</p>
        <p className="mt-1 text-sm text-muted">Tell it about yourself in a chat; what it learns will appear here.</p>
        <Link href="/chat" className="btn btn-primary mt-5">Start a chat</Link>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="relative">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="9" r="5.5" /><path d="M13 13l3.5 3.5" /></svg>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your memories…"
          aria-label="Search your memories"
          className="field pl-9"
        />
      </div>

      {pending.length > 0 && (
        <section aria-labelledby="review-heading">
          <h2 id="review-heading" className="flex items-center gap-2 text-base font-semibold text-fg">
            <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
            Needs your review
          </h2>
          <p className="mt-0.5 mb-3 text-sm text-muted">Something you said contradicts what Memoria remembered. Which is right?</p>
          <ul className="space-y-2.5">
            {pending.map(item => <ReviewItem key={item.id} item={item} />)}
          </ul>
        </section>
      )}

      {GROUPS.map(group => {
        const list = visible.filter(group.match)
        return (
          <section key={group.title} aria-label={group.title}>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-fg">
                {group.title} <span className="ml-1 text-sm font-normal text-faint tabular-nums">{list.length}</span>
              </h2>
              <p className="mt-0.5 text-sm text-muted">{group.hint}</p>
            </div>
            {list.length ? (
              <ul className="card divide-y divide-line">{list.map(item => <MemoryItem key={item.id} item={item} />)}</ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-faint">{query ? 'No matches.' : 'Nothing yet.'}</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

function useAction() {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (action: () => Promise<void>, after?: () => void) => {
    setError(null)
    start(async () => {
      try {
        await action()
        after?.()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }
  return { busy, error, run }
}

function MemoryItem({ item }: { item: OverviewItem }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.content)
  const { busy, error, run } = useAction()

  return (
    <li className="px-4 py-3.5">
      {editing ? (
        <form
          onSubmit={e => {
            e.preventDefault()
            if (draft.trim() === item.content) { setEditing(false); return }
            run(() => editMemoryAction(item.id, draft), () => setEditing(false))
          }}
          className="space-y-2"
        >
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={500}
            rows={2}
            aria-label="Memory text"
            autoFocus
            className="field resize-y"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !draft.trim()} className="btn btn-sm btn-primary px-3 py-1.5">{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" disabled={busy} onClick={() => { setDraft(item.content); setEditing(false) }} className="btn btn-sm btn-secondary px-3 py-1.5">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/memories/${item.id}`} className="leading-relaxed text-fg underline-offset-2 hover:text-accent-text hover:underline">{item.content}</Link>
            <p className="mt-0.5 text-xs text-faint">
              {item.expiresAt ? <span className="font-medium text-warning">Until {formatDate(item.expiresAt)} · </span> : ''}
              Updated {formatDate(item.updatedAt)}
              {item.conversationId && <> · <Link href={`/chat/${item.conversationId}`} className="underline-offset-2 hover:text-fg hover:underline">from a chat</Link></>}
            </p>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <button onClick={() => setEditing(true)} disabled={busy} className="btn btn-sm btn-ghost">Edit</button>
            <button
              onClick={() => { if (confirm('Delete this memory? Memoria will stop using it.')) run(() => deleteMemoryAction(item.id)) }}
              disabled={busy}
              className="btn btn-sm btn-danger-ghost"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  )
}

function ReviewItem({ item }: { item: OverviewItem }) {
  const { busy, error, run } = useAction()
  return (
    <li className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm leading-relaxed">
      <p className="text-muted">You said: <strong className="font-semibold text-fg">{item.content}</strong></p>
      {item.conflictContent && <p className="text-muted">I remember: {item.conflictContent}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => run(() => confirmMemoryAction(item.id))} className="btn btn-sm btn-primary px-3 py-1.5">Use the new one</button>
        <button disabled={busy} onClick={() => run(() => rejectMemoryAction(item.id))} className="btn btn-sm btn-secondary px-3 py-1.5">Keep what I remember</button>
        {item.conversationId && <Link href={`/chat/${item.conversationId}`} className="link ml-1 text-xs">See the chat</Link>}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  )
}
