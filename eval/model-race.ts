/**
 * Model race for the v2 extraction step (no database writes).
 *
 *   npm run race -- --models qwen3:4b,llama3.1:8b [--only multi-01,jack-01]
 *
 * Every model gets the same prompt (src/lib/engine/extract.ts), the same conversation history and the
 * same deterministic rubrics from cases.ts. Scored on what extraction alone can be judged on:
 *   stored      each expected fact appears among the extracted memories
 *   not_stored  nothing that should never be remembered was extracted
 *   noise       messages with nothing durable produce an empty list
 *   expires     temporary situations come back with an end date
 *   no_stale    a self-correction's old value is not extracted from the final message
 * plus structured-output validity and latency on this machine.
 */
import { parseArgs } from 'node:util'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createOpenAI } from '@ai-sdk/openai'
import { CASES } from './cases'
import { CONVERSATION_CASES } from './conversations'
import { matchesRubric } from './score'
import { extractMemories, type ConversationTurn, type ExtractedMemory } from '@/lib/engine/extract'
import { resolveOllamaBaseUrl } from '@/lib/ai/config'
import { disableOllamaThinking } from '@/lib/ai/provider'

const { values: args } = parseArgs({
  options: {
    models: { type: 'string' },
    only: { type: 'string' },
    date: { type: 'string', default: '2026-10-16' },
  },
})

const MODELS = (args.models ?? 'qwen3.5:4b,llama3.1:8b,qwen2.5:7b-instruct,llama3:8b,mistral:7b-instruct,phi4-mini,gemma3:4b,granite4:3b')
  .split(',').map(s => s.trim()).filter(Boolean)
const NOW = new Date(`${args.date}T12:00:00Z`)

type Check = { caseId: string; kind: string; fact: string; pass: boolean; evidence: string[] }
type Call = { caseId: string; turn: number; ok: boolean; reason?: string; message?: string; ms: number; attempts: number; extracted: ExtractedMemory[] }

const ollama = createOpenAI({ baseURL: `${resolveOllamaBaseUrl()}/v1`, apiKey: 'ollama', fetch: disableOllamaThinking })

function quantile(xs: number[], q: number) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

async function raceModel(modelId: string) {
  const model = ollama.chat(modelId)
  // Warm-up: load the model into memory so loading time is not counted against it.
  await extractMemories({ model, latest: 'hello', history: [], now: NOW })

  const only = args.only?.split(',')
  const devCases = [...CASES, ...CONVERSATION_CASES]
  const cases = only ? devCases.filter(c => only.includes(c.id)) : devCases
  const calls: Call[] = []
  const checks: Check[] = []

  for (const c of cases) {
    const history: ConversationTurn[] = []
    const perTurn: ExtractedMemory[][] = []
    let userTurn = 0
    for (const t of c.turns) {
      if (t.role === 'user') {
        const r = await extractMemories({ model, latest: t.text, history, now: NOW })
        const extracted = r.ok ? r.value : []
        calls.push({ caseId: c.id, turn: userTurn++, ok: r.ok, reason: r.ok ? undefined : r.reason, message: r.ok ? undefined : r.message.slice(0, 200), ms: r.ms, attempts: r.attempts, extracted })
        perTurn.push(extracted)
      }
      history.push({ role: t.role, text: t.text })
    }

    const all = perTurn.flat()
    const last = perTurn.at(-1) ?? []
    const texts = (ms: ExtractedMemory[]) => ms.map(m => m.content)
    const push = (kind: string, fact: string, pass: boolean, evidence: string[]) => checks.push({ caseId: c.id, kind, fact, pass, evidence })

    for (const r of c.expect.stored ?? []) {
      const ev = texts(all).filter(t => matchesRubric(t, r))
      push('stored', r.fact, ev.length > 0, ev)
    }
    for (const r of c.expect.not_stored ?? []) {
      const ev = texts(all).filter(t => matchesRubric(t, r))
      push('not_stored', r.fact, ev.length === 0, ev)
    }
    for (const r of c.expect.not_active ?? []) {
      const ev = texts(last).filter(t => matchesRubric(t, r))
      push('no_stale', r.fact, ev.length === 0, ev)
    }
    for (const r of c.expect.expires ?? []) {
      const ev = all.filter(m => m.expiresAt && matchesRubric(m.content, r)).map(m => `${m.content} (until ${m.expiresAt})`)
      push('expires', r.fact, ev.length > 0, ev)
    }
    if (c.expect.max_active === 0) push('noise', 'nothing extracted', all.length === 0, texts(all))
  }
  return { modelId, calls, checks }
}

function report(runs: Awaited<ReturnType<typeof raceModel>>[], meta: Record<string, unknown>) {
  const kinds = ['stored', 'not_stored', 'noise', 'expires', 'no_stale']
  const rows = runs.map(r => {
    const pass = r.checks.filter(c => c.pass).length
    const valid = r.calls.filter(c => c.ok).length
    const ms = r.calls.map(c => c.ms)
    return { r, pass, total: r.checks.length, valid, calls: r.calls.length, p50: quantile(ms, 0.5), p95: quantile(ms, 0.95) }
  }).sort((a, b) => b.pass - a.pass || a.p50 - b.p50)

  let md = `# Model race: v2 extraction step\n\n`
  for (const [k, v] of Object.entries(meta)) md += `- ${k}: \`${typeof v === 'string' ? v : JSON.stringify(v)}\`\n`
  md += `\n| model | checks passed | ${kinds.join(' | ')} | valid JSON | median ms | p95 ms |\n|---|---|${kinds.map(() => '---').join('|')}|---|---|---|\n`
  for (const x of rows) {
    const byKind = kinds.map(k => { const ks = x.r.checks.filter(c => c.kind === k); return `${ks.filter(c => c.pass).length}/${ks.length}` })
    md += `| ${x.r.modelId} | **${x.pass}/${x.total}** (${Math.round((100 * x.pass) / x.total)}%) | ${byKind.join(' | ')} | ${x.valid}/${x.calls} | ${x.p50} | ${x.p95} |\n`
  }
  for (const x of rows) {
    md += `\n## ${x.r.modelId}\n\n`
    const failures = x.r.calls.filter(c => !c.ok)
    if (failures.length) md += `Failed calls:\n${failures.map(f => `- ${f.caseId} turn ${f.turn}: ${f.reason} (${f.message})`).join('\n')}\n\n`
    md += `Failed checks:\n`
    const failed = x.r.checks.filter(c => !c.pass)
    md += failed.length ? failed.map(c => `- ${c.caseId} ${c.kind}: ${c.fact}${c.evidence.length ? ` → ${c.evidence.map(e => `"${e}"`).join(', ')}` : ''}`).join('\n') : '- none'
    md += `\n\n<details><summary>All extractions</summary>\n\n`
    for (const c of x.r.calls) md += `- ${c.caseId}#${c.turn}: ${c.ok ? (c.extracted.length ? c.extracted.map(m => `"${m.content}"${m.expiresAt ? ` [until ${m.expiresAt}]` : ''}`).join('; ') : '_(empty)_') : `**${c.reason}**`}\n`
    md += `\n</details>\n`
  }
  return md
}

async function main() {
  const sh = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'unknown' } }
  const meta = { date: new Date().toISOString(), git: sh('git rev-parse --short HEAD'), ollama: sh('ollama --version'), simulatedToday: args.date, models: MODELS }
  const runs = []
  for (const m of MODELS) {
    const started = Date.now()
    process.stdout.write(`${m.padEnd(22)} `)
    try {
      const run = await raceModel(m)
      runs.push(run)
      const pass = run.checks.filter(c => c.pass).length
      console.log(`${pass}/${run.checks.length} checks, ${run.calls.filter(c => c.ok).length}/${run.calls.length} valid, ${((Date.now() - started) / 1000).toFixed(0)}s`)
    } catch (err) {
      console.log(`crashed: ${(err as Error).message}`)
    }
  }
  const dir = path.join(__dirname, 'results', `${meta.date.replace(/[:.]/g, '-').slice(0, 19)}-model-race`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ meta, runs }, null, 2))
  fs.writeFileSync(path.join(dir, 'report.md'), report(runs, meta))
  console.log(`Report: ${path.relative(process.cwd(), dir)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
