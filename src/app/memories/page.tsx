import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import type { MemoryEventRow, MemoryRow } from '@/lib/engine/types'
import { statusBadgeClass } from '@/lib/ui/status'
import EraseButton from './EraseButton'
import MemoryOverview, { type OverviewItem } from './MemoryOverview'

export const dynamic = 'force-dynamic'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'archive', label: 'Archive' },
] as const
type Tab = (typeof TABS)[number]['id']

const MEMORY_COLUMNS = 'id, user_id, content, kind, status, expires_at, conflicts_with, superseded_by, source_message_id, embedding_profile, created_at, updated_at'

export default async function MemoriesPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const raw = (await searchParams).tab
  const tab: Tab = TABS.some(t => t.id === raw) ? (raw as Tab) : 'overview'

  const [{ count: activeCount }, { count: pendingCount }] = await Promise.all([
    supabase.from('memories').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('memories').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Your memories</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Everything Memoria knows about you, where it learned it, and how it changed. Edit or delete anything.
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-muted tabular-nums">{activeCount ?? 0} remembered</span>
          {pendingCount ? (
            <span className="rounded-full border border-warning-line bg-warning-soft px-2.5 py-0.5 text-warning tabular-nums">{pendingCount} waiting for your review</span>
          ) : null}
        </p>
      </header>

      <nav className="-mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Memory views">
        {TABS.map(t => (
          <Link
            key={t.id}
            href={t.id === 'overview' ? '/memories' : `/memories?tab=${t.id}`}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && <Overview supabase={supabase} />}
      {tab === 'activity' && <Activity supabase={supabase} />}
      {tab === 'archive' && <Archive supabase={supabase} />}
    </div>
  )
}

type ViewProps = { supabase: SupabaseClient }

/** Drops memories whose end date has passed (read once per request, outside render purity rules). */
function currentOnly(rows: MemoryRow[], now = Date.now()) {
  return rows.filter(m => !m.expires_at || new Date(m.expires_at).getTime() > now)
}

async function Overview({ supabase }: ViewProps) {
  const { data: rows, error } = await supabase.from('memories').select(MEMORY_COLUMNS)
    .in('status', ['active', 'pending']).order('updated_at', { ascending: false }).limit(500).returns<MemoryRow[]>()
  if (error) return <p role="alert" className="text-danger">Could not load your memories. Please try again.</p>

  // Past its end date = no longer current, even if the nightly expiry sweep has not run yet
  // (retrieval already ignores these).
  const memories = currentOnly(rows ?? [])
  const conflictIds = memories.map(m => m.conflicts_with).filter((x): x is string => !!x)
  const sourceIds = memories.map(m => m.source_message_id).filter((x): x is string => !!x)
  const [{ data: conflicts }, { data: sources }] = await Promise.all([
    conflictIds.length ? supabase.from('memories').select('id, content').in('id', conflictIds) : Promise.resolve({ data: [] }),
    sourceIds.length ? supabase.from('messages').select('id, conversation_id').in('id', sourceIds) : Promise.resolve({ data: [] }),
  ])
  const conflictText = new Map((conflicts ?? []).map(c => [c.id, c.content as string]))
  const conversationOf = new Map((sources ?? []).map(s => [s.id, s.conversation_id as string]))

  const items: OverviewItem[] = memories.map(m => ({
    id: m.id,
    content: m.content,
    kind: m.kind,
    status: m.status,
    expiresAt: m.expires_at,
    updatedAt: m.updated_at,
    conflictContent: m.conflicts_with ? conflictText.get(m.conflicts_with) ?? null : null,
    conversationId: m.source_message_id ? conversationOf.get(m.source_message_id) ?? null : null,
  }))
  return <MemoryOverview items={items} />
}

async function Activity({ supabase }: ViewProps) {
  const { data: events, error } = await supabase.from('memory_events').select('*')
    .order('created_at', { ascending: false }).limit(200).returns<MemoryEventRow[]>()
  if (error) return <p role="alert" className="text-danger">Could not load activity. Please try again.</p>
  if (!events?.length) return <p className="card p-8 text-center text-muted">No activity yet. Start a chat and Memoria will begin learning.</p>

  const convIds = [...new Set(events.map(e => e.conversation_id).filter((x): x is string => !!x))]
  const { data: convs } = convIds.length
    ? await supabase.from('conversations').select('id, title').in('id', convIds)
    : { data: [] as Array<{ id: string; title: string | null }> }
  const titleOf = new Map((convs ?? []).map(c => [c.id, c.title]))

  const byDay = new Map<string, MemoryEventRow[]>()
  for (const e of events) {
    const day = new Date(e.created_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    byDay.set(day, [...(byDay.get(day) ?? []), e])
  }

  return (
    <div className="space-y-10">
      {[...byDay].map(([day, list]) => (
        <section key={day}>
          <h2 className="eyebrow mb-3">{day}</h2>
          <ol className="card divide-y divide-line overflow-hidden">
            {list.map(e => (
              <li key={e.id} className="px-4 py-3.5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="inline-flex items-center gap-2 font-medium text-fg">
                    <span aria-hidden="true" className={`size-1.5 rounded-full ${ACTIVITY_DOT[e.action]}`} />
                    {ACTIVITY_LABEL[e.action]}{e.actor === 'user' ? ' (by you)' : ''}
                  </span>
                  <time className="text-xs text-faint tabular-nums">{new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
                <p className="mt-1 pl-3.5 leading-relaxed text-fg">
                  {e.before_content && e.after_content && e.before_content !== e.after_content ? (
                    <><span className="text-faint line-through">{e.before_content}</span> <span aria-hidden="true" className="text-faint">&rarr;</span> </>
                  ) : null}
                  <Link href={`/memories/${e.memory_id}`} className="underline-offset-2 hover:text-accent-text hover:underline">{e.after_content ?? e.before_content}</Link>
                </p>
                {e.reason && e.actor !== 'user' && <p className="mt-1 pl-3.5 text-xs italic text-faint">{e.reason}</p>}
                {e.conversation_id && (
                  <Link href={`/chat/${e.conversation_id}`} className="link mt-1 ml-3.5 inline-block text-xs">
                    in &ldquo;{titleOf.get(e.conversation_id) || 'a conversation'}&rdquo;
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

async function Archive({ supabase }: ViewProps) {
  const { data: rows, error } = await supabase.from('memories').select(MEMORY_COLUMNS)
    .in('status', ['superseded', 'expired', 'deleted']).order('updated_at', { ascending: false }).limit(200).returns<MemoryRow[]>()
  if (error) return <p role="alert" className="text-danger">Could not load the archive. Please try again.</p>
  if (!rows?.length) return <p className="card p-8 text-center text-muted">Nothing here yet. Memories that are replaced, expire or are deleted move here.</p>
  const deletedIds = rows.filter(m => m.status === 'deleted').map(m => m.id)
  const { data: rejections } = deletedIds.length
    ? await supabase.from('memory_events').select('memory_id').eq('action', 'rejected').in('memory_id', deletedIds)
    : { data: [] as Array<{ memory_id: string }> }
  const rejected = new Set((rejections ?? []).map(r => r.memory_id))
  return (
    <div>
      <p className="mb-4 text-sm text-muted">Memoria no longer uses these. They are kept so you can see how things changed; erase one to remove it and its history for good.</p>
      <ul className="card divide-y divide-line overflow-hidden">
        {rows.map(m => (
          <li key={m.id} className="flex flex-col gap-2 px-4 py-3.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <Link href={`/memories/${m.id}`} className="text-muted underline-offset-2 hover:text-fg hover:underline">{m.content}</Link>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(m.status)}`}>{rejected.has(m.id) ? 'Rejected' : ARCHIVE_LABEL[m.status] ?? m.status}</span>
              <time className="text-xs text-faint tabular-nums">{new Date(m.updated_at).toLocaleDateString()}</time>
              <EraseButton memoryId={m.id} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ACTIVITY_LABEL: Record<MemoryEventRow['action'], string> = {
  created: 'Remembered', updated: 'Updated', superseded: 'Replaced', conflict: 'Asked you to check',
  confirmed: 'Confirmed', rejected: 'Rejected', edited: 'Edited', deleted: 'Deleted', expired: 'Expired',
}

const ACTIVITY_DOT: Record<MemoryEventRow['action'], string> = {
  created: 'bg-success', updated: 'bg-accent', superseded: 'bg-faint', conflict: 'bg-warning',
  confirmed: 'bg-success', rejected: 'bg-faint', edited: 'bg-accent', deleted: 'bg-danger', expired: 'bg-faint',
}

const ARCHIVE_LABEL: Record<string, string> = { superseded: 'Replaced', expired: 'Expired', deleted: 'Deleted' }
