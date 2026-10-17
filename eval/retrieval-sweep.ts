/**
 * Retrieval threshold sweep (no database, no chat model; embeddings only).
 *
 *   npm run sweep
 *
 * For every retrieval probe in the DEVELOPMENT set, embeds the query and the memories that would be
 * stored (seed memories + each expected fact as written), then scores each candidate rule:
 *   floor F:              keep memories with similarity >= F
 *   floor F + margin M:   keep the best match if >= F, plus others within M of the best
 * Picks are reported, not applied: constants in src/lib/engine/retrieve.ts are changed by hand.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CASES } from './cases'
import { CONVERSATION_CASES } from './conversations'
import { matchesRubric } from './score'
import { embedText } from '@/lib/engine/embed'

process.env.AI_MODE = process.env.AI_MODE ?? 'local'

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
  return dot / Math.sqrt(na * nb)
}

async function vec(text: string, purpose: 'query' | 'document') {
  const r = await embedText(text, purpose)
  if (!r.ok) throw new Error(r.error)
  return r.vector
}

type Probe = { caseId: string; query: string; scored: Array<{ text: string; sim: number }>; should: Parameters<typeof matchesRubric>[1][]; shouldNot: Parameters<typeof matchesRubric>[1][] }

function select(scored: Probe['scored'], floor: number, margin: number | null) {
  const above = scored.filter(s => s.sim >= floor).sort((a, b) => b.sim - a.sim)
  if (margin === null || above.length === 0) return above.map(s => s.text)
  return above.filter(s => s.sim >= above[0].sim - margin).map(s => s.text)
}

function score(probes: Probe[], floor: number, margin: number | null) {
  let pass = 0, total = 0
  for (const p of probes) {
    const got = select(p.scored, floor, margin)
    for (const r of p.should) { total++; if (got.some(t => matchesRubric(t, r))) pass++ }
    for (const r of p.shouldNot) { total++; if (!got.some(t => matchesRubric(t, r))) pass++ }
  }
  return { pass, total }
}

async function main() {
  const probes: Probe[] = []
  for (const c of [...CASES, ...CONVERSATION_CASES]) {
    if (!c.probes?.length) continue
    const memories = [...(c.seed_memories ?? []), ...(c.expect.stored ?? []).map(r => r.fact)]
    const memVecs = await Promise.all(memories.map(m => vec(m, 'document')))
    for (const p of c.probes) {
      const q = await vec(p.query, 'query')
      probes.push({
        caseId: c.id, query: p.query,
        scored: memories.map((text, i) => ({ text, sim: cosine(q, memVecs[i]) })),
        should: p.should_retrieve ?? [], shouldNot: p.should_not_retrieve ?? [],
      })
    }
  }

  const floors = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]
  const margins = [null, 0.03, 0.05, 0.08, 0.1, 0.15]
  let md = `# Retrieval sweep (development set, ${probes.length} probes)\n\n| floor | ${margins.map(m => (m === null ? 'no margin' : `margin ${m}`)).join(' | ')} |\n|---|${margins.map(() => '---').join('|')}|\n`
  for (const f of floors) {
    md += `| ${f} | ${margins.map(m => { const s = score(probes, f, m); return `${s.pass}/${s.total}` }).join(' | ')} |\n`
  }
  md += `\n## Similarities per probe\n`
  for (const p of probes) {
    md += `\n**${p.caseId}**: "${p.query}"\n\n${p.scored.sort((a, b) => b.sim - a.sim).map(s => `- ${s.sim.toFixed(3)} ${s.text}`).join('\n')}\n`
  }
  const dir = path.join(__dirname, 'results', `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-retrieval-sweep`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'report.md'), md)
  console.log(md.split('## Similarities')[0])
  console.log(`Report: ${path.relative(process.cwd(), dir)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
