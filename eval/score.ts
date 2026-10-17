import type { EvalCase, Pattern, Rubric } from './cases'

export type MemorySnapshot = { content: string; status: string; valid_until: string | null }

export type CheckKind = 'stored' | 'not_active' | 'not_stored' | 'expires' | 'not_permanent' | 'max_active' | 'retrieve' | 'not_retrieve'

export type CheckResult = {
  kind: CheckKind
  fact: string
  pass: boolean
  /** Memory contents that satisfied (or violated) the check, for auditing. */
  evidence: string[]
  query?: string
}

const cache = new Map<Pattern, RegExp>()
function compile(pattern: Pattern): RegExp {
  let re = cache.get(pattern)
  if (!re) {
    re = new RegExp(`\\b(?:${pattern})`, 'i')
    cache.set(pattern, re)
  }
  return re
}

const groupMatches = (text: string, group: Pattern[]) => group.some(p => compile(p).test(text))

export function matchesRubric(text: string, rubric: Rubric): boolean {
  if (!rubric.match.every(group => groupMatches(text, group))) return false
  return !(rubric.unless ?? []).some(group => groupMatches(text, group))
}

export function scoreMemories(c: EvalCase, memories: MemorySnapshot[]): CheckResult[] {
  const active = memories.filter(m => m.status === 'active')
  // pending = proposed by the engine and waiting for the user: it was still "stored".
  const activeOrPending = memories.filter(m => m.status === 'active' || m.status === 'pending')
  const results: CheckResult[] = []
  const hits = (pool: MemorySnapshot[], r: Rubric) => pool.filter(m => matchesRubric(m.content, r)).map(m => m.content)

  for (const r of c.expect.stored ?? []) {
    const ev = hits(active, r)
    results.push({ kind: 'stored', fact: r.fact, pass: ev.length > 0, evidence: ev })
  }
  for (const r of c.expect.not_active ?? []) {
    const ev = hits(active, r)
    results.push({ kind: 'not_active', fact: r.fact, pass: ev.length === 0, evidence: ev })
  }
  for (const r of c.expect.not_stored ?? []) {
    const ev = hits(activeOrPending, r)
    results.push({ kind: 'not_stored', fact: r.fact, pass: ev.length === 0, evidence: ev })
  }
  for (const r of c.expect.expires ?? []) {
    const ev = hits(active.filter(m => m.valid_until), r)
    results.push({ kind: 'expires', fact: r.fact, pass: ev.length > 0, evidence: ev })
  }
  for (const r of c.expect.not_permanent ?? []) {
    const ev = hits(active.filter(m => !m.valid_until), r)
    results.push({ kind: 'not_permanent', fact: r.fact, pass: ev.length === 0, evidence: ev })
  }
  if (c.expect.max_active !== undefined) {
    results.push({
      kind: 'max_active',
      fact: `at most ${c.expect.max_active} active memories`,
      pass: active.length <= c.expect.max_active,
      evidence: [`${active.length} active`],
    })
  }
  return results
}

export function scoreRetrieval(query: string, retrieved: string[], probe: NonNullable<EvalCase['probes']>[number]): CheckResult[] {
  const results: CheckResult[] = []
  for (const r of probe.should_retrieve ?? []) {
    const ev = retrieved.filter(t => matchesRubric(t, r))
    results.push({ kind: 'retrieve', query, fact: r.fact, pass: ev.length > 0, evidence: ev })
  }
  for (const r of probe.should_not_retrieve ?? []) {
    const ev = retrieved.filter(t => matchesRubric(t, r))
    results.push({ kind: 'not_retrieve', query, fact: r.fact, pass: ev.length === 0, evidence: ev })
  }
  return results
}
