import type { MemoryEventRow, MemoryRunRow } from '@/lib/engine/types'

export type MemoryLookup = Record<string, { content: string; status: string }>

export type TimelineItem =
  | { kind: 'run'; id: string; at: string; status: MemoryRunRow['status']; operations: number; error: string | null }
  | { kind: 'remembered'; id: string; at: string; memoryId: string; content: string; current: boolean }
  | { kind: 'changed'; id: string; at: string; memoryId: string; before: string; after: string; reason: string | null; current: boolean }
  | { kind: 'conflict'; id: string; at: string; memoryId: string; proposed: string; current: string | null; currentId: string | null; resolution: 'pending' | 'confirmed' | 'rejected' | 'closed' }
  | { kind: 'note'; id: string; at: string; memoryId: string; label: string; content: string }

const NOTE_LABEL: Partial<Record<MemoryEventRow['action'], string>> = {
  expired: 'Expired', deleted: 'Forgotten', edited: 'Edited by you', confirmed: 'You confirmed', rejected: 'You rejected', superseded: 'Replaced',
}

function conflictResolution(status: string | undefined): 'pending' | 'confirmed' | 'rejected' | 'closed' {
  if (status === 'pending') return 'pending'
  if (status === 'active') return 'confirmed'
  if (status === 'deleted') return 'rejected'
  return 'closed'
}

/**
 * Turns raw memory events and pipeline runs into what the memory panel shows, newest first.
 * A supersede is stored as two events (new memory "created" + old one "superseded"); they are shown as
 * one "changed" item. Runs are shown while in progress, when they fail, or when nothing was learned.
 */
export function buildTimeline(events: MemoryEventRow[], runs: MemoryRunRow[], memories: MemoryLookup): TimelineItem[] {
  const items: TimelineItem[] = []
  const supersededByNew = new Map<string, MemoryEventRow>()
  for (const e of events) {
    if (e.action === 'superseded' && e.actor === 'assistant' && e.related_memory_id) supersededByNew.set(e.related_memory_id, e)
  }
  const paired = new Set<string>()
  // A memory is no longer current once it was replaced, deleted, rejected or expired (from events or its status).
  const ended = new Set(events.filter(e => ['superseded', 'deleted', 'rejected', 'expired'].includes(e.action)).map(e => e.memory_id))
  const isCurrent = (id: string) => !ended.has(id) && (memories[id]?.status ?? 'active') === 'active'

  for (const e of events) {
    if (e.action === 'created') {
      const old = supersededByNew.get(e.memory_id)
      if (old) {
        paired.add(old.id)
        items.push({ kind: 'changed', id: e.id, at: e.created_at, memoryId: e.memory_id, before: old.before_content ?? '', after: e.after_content ?? '', reason: e.reason, current: isCurrent(e.memory_id) })
      } else {
        items.push({ kind: 'remembered', id: e.id, at: e.created_at, memoryId: e.memory_id, content: e.after_content ?? '', current: isCurrent(e.memory_id) })
      }
    } else if (e.action === 'updated') {
      items.push({ kind: 'changed', id: e.id, at: e.created_at, memoryId: e.memory_id, before: e.before_content ?? '', after: e.after_content ?? '', reason: e.reason, current: isCurrent(e.memory_id) })
    } else if (e.action === 'conflict') {
      const currentId = e.related_memory_id
      items.push({
        kind: 'conflict', id: e.id, at: e.created_at, memoryId: e.memory_id,
        proposed: e.after_content ?? '',
        current: currentId ? memories[currentId]?.content ?? null : null,
        currentId,
        resolution: conflictResolution(memories[e.memory_id]?.status),
      })
    }
  }
  for (const e of events) {
    if (paired.has(e.id) || ['created', 'updated', 'conflict'].includes(e.action)) continue
    items.push({ kind: 'note', id: e.id, at: e.created_at, memoryId: e.memory_id, label: NOTE_LABEL[e.action] ?? e.action, content: e.before_content ?? e.after_content ?? '' })
  }
  for (const r of runs) {
    if (r.status === 'running' || r.status === 'failed' || r.status === 'skipped' || (r.status === 'ok' && r.operations === 0)) {
      items.push({ kind: 'run', id: r.id, at: r.created_at, status: r.status, operations: r.operations, error: r.error })
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

/** Inserts or replaces rows by id (Realtime can deliver an event we already loaded). */
export function upsertById<T extends { id: string }>(rows: T[], incoming: T[]): T[] {
  const byId = new Map(rows.map(r => [r.id, r]))
  for (const r of incoming) byId.set(r.id, r)
  return [...byId.values()]
}
