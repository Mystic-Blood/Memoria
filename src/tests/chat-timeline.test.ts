import { describe, it, expect } from 'vitest'
import { buildTimeline, upsertById } from '@/lib/chat/timeline'
import type { MemoryEventRow, MemoryRunRow } from '@/lib/engine/types'

let clock = 0
const at = () => new Date(Date.UTC(2026, 9, 16, 12, 0, clock++)).toISOString()
function ev(p: Partial<MemoryEventRow> & Pick<MemoryEventRow, 'action' | 'memory_id'>): MemoryEventRow {
  return {
    id: `e${clock}`, user_id: 'u', actor: 'assistant', before_content: null, after_content: null, related_memory_id: null,
    reason: null, message_id: null, conversation_id: 'c', created_at: at(), ...p,
  }
}
function run(p: Partial<MemoryRunRow>): MemoryRunRow {
  return { id: `r${clock}`, user_id: 'u', message_id: null, conversation_id: 'c', status: 'ok', error: null, model: null, operations: 1, duration_ms: 1, created_at: at(), finished_at: null, ...p }
}

describe('buildTimeline', () => {
  it('shows a new memory as "remembered"', () => {
    const items = buildTimeline([ev({ action: 'created', memory_id: 'm1', after_content: 'User lives in Lisbon.' })], [], {})
    expect(items).toMatchObject([{ kind: 'remembered', memoryId: 'm1', content: 'User lives in Lisbon.' }])
  })

  it('merges a supersede (two events) into one before -> after change', () => {
    const items = buildTimeline([
      ev({ action: 'created', memory_id: 'new', after_content: 'User lives in Porto.', related_memory_id: 'old' }),
      ev({ action: 'superseded', memory_id: 'old', before_content: 'User lives in Lisbon.', related_memory_id: 'new' }),
    ], [], {})
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'changed', before: 'User lives in Lisbon.', after: 'User lives in Porto.' })
  })

  it('shows a conflict with the memory it contradicts and its current resolution', () => {
    const conflict = ev({ action: 'conflict', memory_id: 'p', after_content: 'User is vegan.', related_memory_id: 'a' })
    const pending = buildTimeline([conflict], [], { p: { content: 'User is vegan.', status: 'pending' }, a: { content: 'User eats meat.', status: 'active' } })
    expect(pending[0]).toMatchObject({ kind: 'conflict', proposed: 'User is vegan.', current: 'User eats meat.', currentId: 'a', resolution: 'pending' })
    const confirmed = buildTimeline([conflict], [], { p: { content: 'User is vegan.', status: 'active' } })
    expect(confirmed[0]).toMatchObject({ resolution: 'confirmed', current: null })
  })

  it('surfaces runs that are in progress, failed, or learned nothing; hides successful ones', () => {
    const items = buildTimeline([], [
      run({ status: 'running' }), run({ status: 'failed', error: 'extraction timeout' }),
      run({ status: 'ok', operations: 0 }), run({ status: 'ok', operations: 2 }),
    ], {})
    expect(items.map(i => i.kind === 'run' && i.status)).toEqual(['ok', 'failed', 'running'])
  })

  it('orders newest first', () => {
    const items = buildTimeline([
      ev({ action: 'created', memory_id: 'a', after_content: 'first' }),
      ev({ action: 'created', memory_id: 'b', after_content: 'second' }),
    ], [], {})
    expect(items.map(i => i.kind === 'remembered' && i.content)).toEqual(['second', 'first'])
  })
})

describe('upsertById', () => {
  it('adds new rows and replaces rows with the same id', () => {
    expect(upsertById([{ id: '1', v: 'a' }, { id: '2', v: 'b' }], [{ id: '2', v: 'B' }, { id: '3', v: 'c' }]))
      .toEqual([{ id: '1', v: 'a' }, { id: '2', v: 'B' }, { id: '3', v: 'c' }])
  })
})

describe('buildTimeline: current vs replaced', () => {
  it('marks a remembered fact as no longer current once it has been replaced', () => {
    const items = buildTimeline([
      ev({ action: 'created', memory_id: 'old', after_content: 'User lives in Lisbon.' }),
      ev({ action: 'created', memory_id: 'new', after_content: 'User lives in Porto.', related_memory_id: 'old' }),
      ev({ action: 'superseded', memory_id: 'old', before_content: 'User lives in Lisbon.', related_memory_id: 'new' }),
    ], [], {})
    const remembered = items.find(i => i.kind === 'remembered')
    const changed = items.find(i => i.kind === 'changed')
    expect(remembered).toMatchObject({ content: 'User lives in Lisbon.', current: false })
    expect(changed).toMatchObject({ after: 'User lives in Porto.', current: true })
  })

  it('uses the memory status when the ending event is not in this conversation', () => {
    const items = buildTimeline([ev({ action: 'created', memory_id: 'm', after_content: 'User is in Rome.' })], [], { m: { content: 'User is in Rome.', status: 'expired' } })
    expect(items[0]).toMatchObject({ kind: 'remembered', current: false })
  })
})
