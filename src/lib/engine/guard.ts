import type { ExtractedMemory, MemoryKind } from './extract'
import type { ReconcileProposal } from './reconcile'
import type { StructuredResult } from './structured'
import type { RecalledMemory } from './types'

/**
 * Deterministic checks between "what the model proposed" and "what gets written".
 * The model never touches the database directly: every proposal passes through here.
 */

const MAX_MEMORY_LENGTH = 500
/** A merged memory longer than this is a sign of snowballing; the new fact is stored on its own instead. */
const MAX_MERGED_LENGTH = 200
/** Similarity at or above which a failed reconciliation is treated as "already known". */
export const DUPLICATE_SIMILARITY = 0.95
/**
 * How similar a memory must be before the model may merge the new fact into it (update) or call it
 * already known (skip). Below this the fact is stored separately. Measured with eval/pair-similarity.ts:
 * refinements and corrections scored 0.81-0.99, unrelated facts the model had merged (e.g. "is a Pokémon
 * master" into "is catching a Pokémon today") 0.54-0.79. Strict on purpose: a wrong merge rewrites the
 * memory text and loses information.
 */
export const MERGE_MIN_SIMILARITY = 0.8
/**
 * How similar a memory must be before the model may replace it (or flag a conflict with it). Lower than
 * for merging because a replacement stores the user's own words and keeps the old memory in the archive,
 * so a mistake is visible and recoverable. Real memories are often compound sentences, which lowers
 * similarity: legitimate corrections that the 0.80 bar blocked in the 46-case eval scored 0.69-0.78
 * ("uses an Android phone" -> "switched to iPhone": 0.69). The unrelated pairs the model wrongly merged
 * were proposed as updates, not replacements.
 */
export const REPLACE_MIN_SIMILARITY = 0.65
/** Temporary memories without a date from the model fade after this many days. */
export const DEFAULT_TEMPORARY_DAYS = 7

type Payload = { content: string; kind: MemoryKind; expiresAt: string | null }

export type MemoryOp =
  | ({ type: 'add' } & Payload)
  | ({ type: 'update'; targetId: string } & Payload)
  | ({ type: 'supersede'; targetId: string } & Payload)
  | ({ type: 'conflict'; targetId: string } & Payload)
  | { type: 'skip'; targetId: string | null }

type GuardedOp = {
  op: MemoryOp
  /** Why this happened, in plain words; stored in the memory's history. */
  reason: string
  /** Set when the guard overrode or repaired the model's proposal. */
  guardNote?: string
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** The memory text itself is about today (so it cannot be a lasting fact). */
const MEMORY_ABOUT_TODAY = /\b(today|tonight|this (morning|afternoon|evening))\b/i

/** The user's own words say this is about today ("today", "tonight", "5 pm", "this afternoon"...). */
const SAME_DAY_CUE = /\b(today|tonight|this (morning|afternoon|evening)|\d{1,2}(:\d{2})? ?(am|pm)|noon|later on)\b/i

/**
 * Final kind and end time for a memory.
 * The model often labels a lasting change ("I'm no longer a student", "favorite color is green now") as
 * "temporary, ends today", and also labels real same-day plans that way. Its label cannot tell them apart,
 * but the user's message can:
 * - ends today AND the message mentions today/a time -> a same-day plan; expires tonight
 * - ends today without such a cue, or "ended" before today -> a lasting fact
 * - temporary without a usable date -> fades after DEFAULT_TEMPORARY_DAYS
 */
export function resolveKindAndExpiry(
  kind: MemoryKind, expiresAt: string | null, now: Date, latestMessage = '', content = '',
): { kind: MemoryKind; expiresAt: string | null } {
  const endOfTodayIso = new Date(`${now.toISOString().slice(0, 10)}T23:59:59Z`).toISOString()
  // A memory whose own wording is about today ("is catching a Pokémon today") cannot be a lasting fact,
  // whatever label the model gave it.
  if (MEMORY_ABOUT_TODAY.test(content)) return { kind: 'temporary', expiresAt: endOfTodayIso }
  if (kind !== 'temporary') return { kind, expiresAt: null }
  if (expiresAt) {
    const end = new Date(`${expiresAt.slice(0, 10)}T23:59:59Z`)
    if (!Number.isNaN(end.getTime())) {
      const endOfToday = new Date(`${now.toISOString().slice(0, 10)}T23:59:59Z`)
      if (end.getTime() < endOfToday.getTime()) return { kind: 'fact', expiresAt: null }
      if (end.getTime() === endOfToday.getTime()) {
        return SAME_DAY_CUE.test(latestMessage) ? { kind: 'temporary', expiresAt: end.toISOString() } : { kind: 'fact', expiresAt: null }
      }
      return { kind: 'temporary', expiresAt: end.toISOString() }
    }
  }
  return { kind: 'temporary', expiresAt: new Date(now.getTime() + DEFAULT_TEMPORARY_DAYS * 86_400_000).toISOString() }
}

function cleanContent(proposed: string, fallback: string): { content: string; repaired: boolean } {
  const trimmed = proposed.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_MEMORY_LENGTH) return { content: fallback, repaired: true }
  return { content: trimmed, repaired: false }
}

/** Before asking the model: an identical memory already exists, so there is nothing to do. */
export function findExactDuplicate(fact: ExtractedMemory, candidates: RecalledMemory[]): RecalledMemory | undefined {
  const key = normalize(fact.content)
  return candidates.find(c => normalize(c.content) === key)
}

export const NAME_FACT = /^user's name is\b/i

/**
 * A person has one name. Seen in a real test chat: "my name is Noah" was stored next to the existing
 * "User's name is Ash." because the model compared it with a different memory, leaving two active names.
 * When a name is already known, a different name may only replace it or wait for the user's review.
 */
export function enforceSingleName(guarded: GuardedOp, fact: ExtractedMemory, currentName: RecalledMemory | null): GuardedOp {
  if (!currentName || !NAME_FACT.test(fact.content.trim())) return guarded
  if (normalize(currentName.content) === normalize(fact.content)) return guarded
  const op = guarded.op
  if (op.type === 'skip' || ((op.type === 'supersede' || op.type === 'conflict') && op.targetId === currentName.id)) return guarded
  return {
    op: { type: 'conflict', targetId: currentName.id, content: fact.content.trim(), kind: 'fact', expiresAt: null },
    reason: 'A different name was mentioned; the user decides which one is right.',
    guardNote: `a name is already known; model chose "${op.type}"`,
  }
}

export function guardProposal(input: {
  fact: ExtractedMemory
  candidates: RecalledMemory[]
  proposal: StructuredResult<ReconcileProposal> | null
  now: Date
  /** The user's message the fact came from (used to tell same-day plans from lasting changes). */
  latestMessage?: string
}): GuardedOp {
  const { fact, candidates, proposal, now } = input
  const payload = (content: string): Payload => ({ content, ...resolveKindAndExpiry(fact.kind, fact.expiresAt, now, input.latestMessage, content) })
  const addFact = (reason: string, guardNote?: string): GuardedOp => ({ op: { type: 'add', ...payload(fact.content) }, reason, guardNote })

  if (candidates.length === 0) return addFact('No related memory exists yet.')

  const exact = findExactDuplicate(fact, candidates)
  if (exact) return { op: { type: 'skip', targetId: exact.id }, reason: 'An identical memory already exists.' }

  if (!proposal || !proposal.ok) {
    const top = candidates[0]
    const why = proposal && !proposal.ok ? `reconciliation failed (${proposal.reason})` : 'reconciliation unavailable'
    if (top.similarity >= DUPLICATE_SIMILARITY) {
      return { op: { type: 'skip', targetId: top.id }, reason: 'Nearly identical to an existing memory.', guardNote: why }
    }
    return addFact('Stored as a new memory.', why)
  }

  const p = proposal.value
  const reason = p.reason.trim().slice(0, 300) || 'No reason given.'

  if (p.action === 'add') return addFact(reason)

  const label = p.target?.trim().toLowerCase().match(/^m(\d+)$/)
  // "skip" may come without a label; then it refers to the closest memory.
  const target = label ? candidates[Number(label[1]) - 1] : p.action === 'skip' ? candidates[0] : undefined

  if (!target) {
    return addFact('Stored as a new memory.', `model chose "${p.action}" but referenced an unknown memory (${p.target ?? 'none'})`)
  }

  const minSimilarity = p.action === 'replace' || p.action === 'conflict' ? REPLACE_MIN_SIMILARITY : MERGE_MIN_SIMILARITY
  if (target.similarity < minSimilarity) {
    return addFact('Stored as a separate memory.', `model chose "${p.action}" against a memory that is not similar enough (${target.similarity.toFixed(2)} < ${minSimilarity})`)
  }

  switch (p.action) {
    case 'skip':
      return { op: { type: 'skip', targetId: target.id }, reason }
    case 'update': {
      // A merge is the only case where the model's own wording is used (it combines two memories).
      const { content, repaired } = cleanContent(p.content, fact.content)
      if (normalize(content) === normalize(target.content)) {
        return { op: { type: 'skip', targetId: target.id }, reason: 'The memory already says this.', guardNote: 'model proposed an update that changes nothing' }
      }
      if (content.length > MAX_MERGED_LENGTH) {
        return addFact('Stored as a separate memory.', `merged text was too long (${content.length} > ${MAX_MERGED_LENGTH} characters)`)
      }
      const note = repaired ? 'model content was empty or too long; used the extracted fact' : undefined
      const merged = payload(content)
      // Adding a detail to a temporary memory ("my sister is coming too" on a trip) must not make it permanent.
      if (target.kind === 'temporary' && merged.kind !== 'temporary') {
        return { op: { type: 'update', targetId: target.id, content, kind: 'temporary', expiresAt: target.expires_at }, reason, guardNote: note }
      }
      return { op: { type: 'update', targetId: target.id, ...merged }, reason, guardNote: note }
    }
    // A replacement or a conflict stores what the user actually said: the extracted fact.
    // (Observed: the model sometimes rewrote it into an unrelated memory.)
    case 'replace':
      return { op: { type: 'supersede', targetId: target.id, ...payload(fact.content) }, reason }
    case 'conflict':
      return { op: { type: 'conflict', targetId: target.id, ...payload(fact.content) }, reason }
  }
}
