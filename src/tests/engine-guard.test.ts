import { describe, it, expect } from 'vitest'
import { MERGE_MIN_SIMILARITY, DUPLICATE_SIMILARITY, enforceSingleName, guardProposal, resolveKindAndExpiry, DEFAULT_TEMPORARY_DAYS } from '@/lib/engine/guard'
import type { ExtractedMemory } from '@/lib/engine/extract'
import type { ReconcileProposal } from '@/lib/engine/reconcile'
import type { StructuredResult } from '@/lib/engine/structured'
import type { RecalledMemory } from '@/lib/engine/types'

const NOW = new Date('2026-10-16T12:00:00Z')
const fact = (content: string, extra: Partial<ExtractedMemory> = {}): ExtractedMemory => ({ content, kind: 'fact', expiresAt: null, ...extra })
const mem = (id: string, content: string, similarity = 0.8): RecalledMemory => ({ id, content, kind: 'fact', expires_at: null, updated_at: NOW.toISOString(), similarity })
const ok = (p: Partial<ReconcileProposal>): StructuredResult<ReconcileProposal> => ({
  ok: true, attempts: 1, ms: 1,
  value: { action: 'add', target: null, content: '', reason: 'because', ...p },
})

describe('guardProposal', () => {
  it('adds without asking the model when nothing related exists', () => {
    const g = guardProposal({ fact: fact('User lives in Lisbon.'), candidates: [], proposal: null, now: NOW })
    expect(g.op).toMatchObject({ type: 'add', content: 'User lives in Lisbon.' })
  })

  it('skips an exact repeat regardless of what the model says', () => {
    const g = guardProposal({
      fact: fact('user lives in Lisbon'), candidates: [mem('a', 'User lives in Lisbon.')],
      proposal: ok({ action: 'add' }), now: NOW,
    })
    expect(g.op).toEqual({ type: 'skip', targetId: 'a' })
  })

  it('maps a label to the right memory id', () => {
    const g = guardProposal({
      fact: fact('User lives in Porto.'), candidates: [mem('a', 'User likes jazz.'), mem('b', 'User lives in Lisbon.')],
      proposal: ok({ action: 'replace', target: 'm2' }), now: NOW,
    })
    expect(g.op).toMatchObject({ type: 'supersede', targetId: 'b' })
  })

  it('stores the extracted fact on replace, not the model\'s rewording', () => {
    const g = guardProposal({
      fact: fact('User dislikes olives.'), candidates: [mem('a', 'User likes olive pizza.')],
      proposal: ok({ action: 'replace', target: 'm1', content: 'User likes pizza.' }), now: NOW,
    })
    expect(g.op).toMatchObject({ type: 'supersede', targetId: 'a', content: 'User dislikes olives.' })
  })

  it('uses the model\'s merged wording on update, falling back to the fact if it is empty', () => {
    const merged = guardProposal({
      fact: fact('User plays a left-handed guitar.'), candidates: [mem('a', 'User plays guitar.')],
      proposal: ok({ action: 'update', target: 'm1', content: 'User plays a left-handed guitar.' }), now: NOW,
    })
    expect(merged.op).toMatchObject({ type: 'update', targetId: 'a', content: 'User plays a left-handed guitar.' })
    expect(merged.guardNote).toBeUndefined()

    const empty = guardProposal({
      fact: fact('User plays a left-handed guitar.'), candidates: [mem('a', 'User plays guitar.')],
      proposal: ok({ action: 'update', target: 'm1', content: '   ' }), now: NOW,
    })
    expect(empty.op).toMatchObject({ type: 'update', content: 'User plays a left-handed guitar.' })
    expect(empty.guardNote).toMatch(/empty/)
  })

  it('refuses a target the model was never shown and records why', () => {
    const g = guardProposal({
      fact: fact('User lives in Porto.'), candidates: [mem('a', 'User lives in Lisbon.')],
      proposal: ok({ action: 'replace', target: 'm7' }), now: NOW,
    })
    expect(g.op.type).toBe('add')
    expect(g.guardNote).toMatch(/unknown memory/)
  })

  it('on model failure, skips near-identical memories and otherwise adds, noting the failure', () => {
    const failed: StructuredResult<ReconcileProposal> = { ok: false, reason: 'timeout', message: 'slow', attempts: 2, ms: 1 }
    const dup = guardProposal({ fact: fact('User has a cat.'), candidates: [mem('a', 'User owns a cat.', DUPLICATE_SIMILARITY)], proposal: failed, now: NOW })
    expect(dup.op).toEqual({ type: 'skip', targetId: 'a' })
    const fresh = guardProposal({ fact: fact('User has a cat.'), candidates: [mem('a', 'User likes jazz.', 0.6)], proposal: failed, now: NOW })
    expect(fresh.op.type).toBe('add')
    expect(fresh.guardNote).toMatch(/timeout/)
  })
})

describe('guardProposal: protecting against wrong merges (from the owner\'s "Ash" conversation)', () => {
  const below = MERGE_MIN_SIMILARITY - 0.05

  it('refuses to merge into a memory that is not similar enough, and keeps the fact separately', () => {
    const g = guardProposal({
      fact: fact('User is a Pokémon master.'), candidates: [mem('a', 'User is going to catch a legendary Pokémon today.', below)],
      proposal: ok({ action: 'update', target: 'm1', content: 'User is going to catch a legendary Pokémon today and is a Pokémon master.' }), now: NOW,
    })
    expect(g.op).toMatchObject({ type: 'add', content: 'User is a Pokémon master.' })
    expect(g.guardNote).toMatch(/not similar enough/)
  })

  it('does not let an unrelated "skip" swallow a new fact', () => {
    const g = guardProposal({
      fact: fact('User caught a Pikachu.'), candidates: [mem('a', 'User is a Pokémon master.', below)],
      proposal: ok({ action: 'skip', target: 'm1' }), now: NOW,
    })
    expect(g.op.type).toBe('add')
  })

  it('turns an update that changes nothing into a skip', () => {
    const g = guardProposal({
      fact: fact('User is a Pokémon master.'), candidates: [mem('a', 'User is a Pokémon master and trains daily.', 0.9)],
      proposal: ok({ action: 'update', target: 'm1', content: 'User is a Pokémon master and trains daily.' }), now: NOW,
    })
    expect(g.op).toEqual({ type: 'skip', targetId: 'a' })
  })

  it('stores the fact separately instead of growing a run-on merged memory', () => {
    const g = guardProposal({
      fact: fact('User plays left-handed.'), candidates: [mem('a', 'User plays guitar.', 0.9)],
      proposal: ok({ action: 'update', target: 'm1', content: 'User plays guitar, ' + 'and more detail '.repeat(15) }), now: NOW,
    })
    expect(g.op).toMatchObject({ type: 'add', content: 'User plays left-handed.' })
    expect(g.guardNote).toMatch(/too long/)
  })

  it('still allows corrections between closely related memories', () => {
    const g = guardProposal({
      fact: fact('User lives in Porto.'), candidates: [mem('a', 'User lives in Lisbon.', 0.89)],
      proposal: ok({ action: 'replace', target: 'm1' }), now: NOW,
    })
    expect(g.op).toMatchObject({ type: 'supersede', targetId: 'a' })
  })
})

describe('resolveKindAndExpiry', () => {
  it('keeps facts and preferences permanent', () => {
    expect(resolveKindAndExpiry('fact', '2027-01-01', NOW)).toEqual({ kind: 'fact', expiresAt: null })
  })

  it('ends a temporary memory at the end of its date', () => {
    expect(resolveKindAndExpiry('temporary', '2026-10-23', NOW)).toEqual({ kind: 'temporary', expiresAt: '2026-10-23T23:59:59.000Z' })
  })

  it('lets a plan the user said is for today expire tonight instead of becoming permanent', () => {
    expect(resolveKindAndExpiry('temporary', '2026-10-16', NOW, 'around 5 pm today we are going to the park'))
      .toEqual({ kind: 'temporary', expiresAt: '2026-10-16T23:59:59.000Z' })
    expect(resolveKindAndExpiry('temporary', '2026-10-16', NOW, 'dinner with friends tonight'))
      .toEqual({ kind: 'temporary', expiresAt: '2026-10-16T23:59:59.000Z' })
  })

  it('treats "ends today" as a lasting fact when the user never mentioned today (a misread change)', () => {
    expect(resolveKindAndExpiry('temporary', '2026-10-16', NOW, 'I graduated and started a new job')).toEqual({ kind: 'fact', expiresAt: null })
    expect(resolveKindAndExpiry('temporary', '2026-10-16', NOW)).toEqual({ kind: 'fact', expiresAt: null })
  })

  it('treats a "temporary" memory that ended before today as a misread lasting fact', () => {
    expect(resolveKindAndExpiry('temporary', '2026-10-01', NOW)).toEqual({ kind: 'fact', expiresAt: null })
  })

  it(`gives an undated temporary memory ${DEFAULT_TEMPORARY_DAYS} days`, () => {
    const r = resolveKindAndExpiry('temporary', null, NOW)
    expect(r.kind).toBe('temporary')
    expect(new Date(r.expiresAt!).getTime() - NOW.getTime()).toBe(DEFAULT_TEMPORARY_DAYS * 86_400_000)
  })
})

describe('guardProposal: merge vs replace thresholds', () => {
  it('allows a replacement between moderately similar memories (a correction of a compound memory)', () => {
    const g = guardProposal({
      fact: fact("User's son is 10 years old."), candidates: [mem('a', 'User has a son who is 9 and loves trains.', 0.72)],
      proposal: ok({ action: 'replace', target: 'm1' }), now: NOW,
    })
    expect(g.op).toMatchObject({ type: 'supersede', targetId: 'a', content: "User's son is 10 years old." })
  })

  it('still refuses a merge at the same similarity', () => {
    const g = guardProposal({
      fact: fact("User's son is 10 years old."), candidates: [mem('a', 'User has a son who is 9 and loves trains.', 0.72)],
      proposal: ok({ action: 'update', target: 'm1', content: 'User has a son who is 10 and loves trains.' }), now: NOW,
    })
    expect(g.op.type).toBe('add')
  })

  it('refuses a replacement against a barely related memory', () => {
    const g = guardProposal({
      fact: fact('User likes mango smoothies.'), candidates: [mem('a', 'User owns a bakery.', 0.55)],
      proposal: ok({ action: 'replace', target: 'm1' }), now: NOW,
    })
    expect(g.op.type).toBe('add')
  })

  it('keeps a temporary memory temporary when a detail is merged into it', () => {
    const trip = { ...mem('t', 'User is travelling to Manali until Saturday.', 0.85), kind: 'temporary' as const, expires_at: '2026-10-24T23:59:59.000Z' }
    const g = guardProposal({
      fact: fact('User is travelling with their cousin.'), candidates: [trip],
      proposal: ok({ action: 'update', target: 'm1', content: 'User is travelling to Manali with their cousin until Saturday.' }), now: NOW,
    })
    expect(g.op).toMatchObject({ type: 'update', kind: 'temporary', expiresAt: '2026-10-24T23:59:59.000Z' })
  })
})

describe('resolveKindAndExpiry: memory text about today', () => {
  it('makes a memory that says "today" expire tonight even if labelled a fact', () => {
    expect(resolveKindAndExpiry('fact', null, NOW, 'we gonna catch one today', 'User is planning to catch a legendary Pokémon today.'))
      .toEqual({ kind: 'temporary', expiresAt: '2026-10-16T23:59:59.000Z' })
  })

  it('leaves ordinary facts alone', () => {
    expect(resolveKindAndExpiry('fact', null, NOW, 'i live in lisbon', 'User lives in Lisbon.')).toEqual({ kind: 'fact', expiresAt: null })
  })
})

describe('enforceSingleName', () => {
  const ash = mem('ash', "User's name is Ash.", 1)
  const added = { op: { type: 'add' as const, content: "User's name is Noah.", kind: 'fact' as const, expiresAt: null }, reason: 'new' }

  it('turns a second name into a review instead of a second active name', () => {
    const g = enforceSingleName(added, fact("User's name is Noah."), ash)
    expect(g.op).toEqual({ type: 'conflict', targetId: 'ash', content: "User's name is Noah.", kind: 'fact', expiresAt: null })
    expect(g.guardNote).toMatch(/name is already known/)
  })

  it('also overrides a replacement aimed at some other memory', () => {
    const elsewhere = { op: { type: 'supersede' as const, targetId: 'other', content: "User's name is Noah.", kind: 'fact' as const, expiresAt: null }, reason: 'r' }
    expect(enforceSingleName(elsewhere, fact("User's name is Noah."), ash).op).toMatchObject({ type: 'conflict', targetId: 'ash' })
  })

  it('keeps a correction that replaces the known name', () => {
    const correction = { op: { type: 'supersede' as const, targetId: 'ash', content: "User's name is Noah.", kind: 'fact' as const, expiresAt: null }, reason: 'r' }
    expect(enforceSingleName(correction, fact("User's name is Noah."), ash)).toBe(correction)
  })

  it('leaves the same name, other facts, and a first name alone', () => {
    expect(enforceSingleName(added, fact("user's name is ash"), ash)).toBe(added)
    expect(enforceSingleName(added, fact('User lives in Oslo.'), ash)).toBe(added)
    expect(enforceSingleName(added, fact("User's name is Noah."), null)).toBe(added)
  })
})
