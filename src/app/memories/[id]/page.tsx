import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ActionButtons from './ActionButtons'
import EditableContent from './EditableContent'
import { statusBadgeClass } from '@/lib/ui/status'
import type { MemoryEventRow, MemoryRow } from '@/lib/engine/types'

export const dynamic = 'force-dynamic'

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

const ACTION_LABEL: Record<string, string> = {
  created: 'Created', updated: 'Updated', superseded: 'Replaced', conflict: 'Flagged as a conflict',
  confirmed: 'Confirmed by you', rejected: 'Rejected by you', edited: 'Edited by you', deleted: 'Deleted', expired: 'Expired',
}

export default async function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memory } = await supabase.from('memories')
    .select('id, user_id, content, kind, status, expires_at, conflicts_with, superseded_by, source_message_id, embedding_profile, created_at, updated_at')
    .eq('id', id).maybeSingle<MemoryRow>()
  if (!memory) notFound()

  const [{ data: events }, { data: source }, { data: related }, { data: replacedRows }] = await Promise.all([
    supabase.from('memory_events').select('*').eq('memory_id', id).order('created_at', { ascending: true }).returns<MemoryEventRow[]>(),
    memory.source_message_id
      ? supabase.from('messages').select('id, content, created_at, conversation_id').eq('id', memory.source_message_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('memories').select('id, content, status')
      .in('id', [memory.conflicts_with, memory.superseded_by].filter((x): x is string => !!x)),
    supabase.from('memories').select('id, content').eq('superseded_by', id),
  ])
  const conflict = related?.find(r => r.id === memory.conflicts_with)
  const replacement = related?.find(r => r.id === memory.superseded_by)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <Link href="/memories" className="btn btn-ghost -ml-3 text-muted">&larr; Back to Memories</Link>
        <ActionButtons id={memory.id} status={memory.status} />
      </div>

      <div className="card space-y-10 p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Memory</h1>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(memory.status)}`}>{memory.status}</span>
        </div>

        {memory.status === 'pending' && conflict && (
          <p className="rounded-lg border border-warning-line bg-warning-soft p-3.5 text-sm leading-relaxed text-fg">
            This conflicts with what Memoria currently remembers: <Link href={`/memories/${conflict.id}`} className="underline underline-offset-2">&ldquo;{conflict.content}&rdquo;</Link>.
            Confirm to replace it, or reject to keep the current memory.
          </p>
        )}
        {(replacedRows ?? []).map(r => (
          <p key={r.id} className="text-sm text-muted">
            Replaced <Link href={`/memories/${r.id}`} className="underline underline-offset-2 hover:text-fg">&ldquo;{r.content}&rdquo;</Link>
          </p>
        ))}
        {replacement && (
          <p className="text-sm text-muted">
            Replaced by <Link href={`/memories/${replacement.id}`} className="underline underline-offset-2 hover:text-fg">&ldquo;{replacement.content}&rdquo;</Link>
          </p>
        )}

        <EditableContent id={memory.id} initialContent={memory.content} isActive={memory.status === 'active'} />

        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm md:grid-cols-4">
          <div><dt className="eyebrow mb-1">Kind</dt><dd className="capitalize text-fg">{memory.kind}</dd></div>
          <div><dt className="eyebrow mb-1">Created</dt><dd className="text-fg">{new Date(memory.created_at).toLocaleString(undefined, DATE_TIME)}</dd></div>
          <div><dt className="eyebrow mb-1">Updated</dt><dd className="text-fg">{new Date(memory.updated_at).toLocaleString(undefined, DATE_TIME)}</dd></div>
          <div><dt className="eyebrow mb-1">Expires</dt><dd className="text-fg">{memory.expires_at ? new Date(memory.expires_at).toLocaleString(undefined, DATE_TIME) : 'Never'}</dd></div>
        </dl>

        <section>
          <h2 className="eyebrow mb-3">Learned from</h2>
          {source ? (
            <figure className="rounded-xl border border-line bg-subtle p-4">
              <blockquote className="text-sm leading-relaxed text-fg">&ldquo;{source.content}&rdquo;</blockquote>
              <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-faint">
                {new Date(source.created_at).toLocaleString(undefined, DATE_TIME)}
                {source.conversation_id && <Link href={`/chat/${source.conversation_id}`} className="link">Open the chat</Link>}
              </figcaption>
            </figure>
          ) : (
            <p className="text-sm text-muted">The original message is no longer available.</p>
          )}
        </section>

        <section>
          <h2 className="eyebrow mb-4">History</h2>
          <ol className="ml-1.5 space-y-6 border-l border-line">
            {(events ?? []).map(ev => (
              <li key={ev.id} className="relative pl-6">
                <span aria-hidden="true" className="absolute top-1.5 -left-[5px] size-2.5 rounded-full bg-accent ring-4 ring-surface" />
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className="text-sm font-medium text-fg">{ACTION_LABEL[ev.action] ?? ev.action}</span>
                  <span className="text-xs text-faint tabular-nums">{new Date(ev.created_at).toLocaleString(undefined, DATE_TIME)}</span>
                </div>
                {ev.before_content && ev.after_content && ev.before_content !== ev.after_content ? (
                  <p className="text-sm leading-relaxed text-fg"><span className="text-faint line-through">{ev.before_content}</span> <span aria-hidden="true" className="text-faint">&rarr;</span> {ev.after_content}</p>
                ) : null}
                {ev.reason && <p className="text-sm italic text-muted">{ev.reason}</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
