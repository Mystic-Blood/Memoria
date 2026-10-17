/**
 * Memoria evaluation runner.
 *
 *   npm run eval -- [--engine v2] [--model qwen2.5:7b-instruct] [--only corr-01,jack-01] [--label baseline]
 *
 * For every case: creates a throwaway user, writes the scripted conversation into the database,
 * runs the engine's background memory pipeline on each user turn (with the conversation history
 * available), probes retrieval, scores the result with the deterministic rubrics in cases.ts,
 * and deletes the user. Results (including every stored memory) go to eval/results/<run>/.
 *
 * Models default to local Ollama; --model overrides the extraction and reconcile models.
 * The v1 engine was removed after its baseline was recorded (eval/results/*baseline-v1*).
 */
import { parseArgs } from 'node:util'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CASES, type EvalCase } from './cases'
import { HOLDOUT_CASES } from './holdout'
import { CONVERSATION_CASES } from './conversations'
import { scoreMemories, scoreRetrieval, type CheckResult, type MemorySnapshot } from './score'
import type { MemoryEngineAdapter, Turn } from './engines/types'

const { values: args } = parseArgs({
  options: {
    engine: { type: 'string', default: 'v2' },
    model: { type: 'string' },
    only: { type: 'string' },
    label: { type: 'string' },
    mode: { type: 'string', default: 'local' },
    set: { type: 'string', default: 'dev' },
  },
})

// Configure the AI backend before any engine code runs.
process.env.AI_MODE = args.mode
if (args.model) {
  process.env.EXTRACTION_MODEL = args.model
  process.env.RECONCILE_MODEL = args.model
}

const EVAL_EMAIL_DOMAIN = 'eval.memoria.test'

type CaseResult = {
  id: string
  category: string
  description: string
  passed: boolean
  checks: CheckResult[]
  memories: MemorySnapshot[]
  retrievals: Array<{ query: string; retrieved: string[] }>
  pipelineErrors: string[]
  /** What the engine decided for each user turn (extracted facts and the action taken). */
  decisions: Array<{ turn: string; lines: string[] }>
  turnLatenciesMs: number[]
  fatal?: string
}

async function loadEngine(name: string): Promise<MemoryEngineAdapter> {
  if (name === 'v2') return (await import('./engines/v2')).v2Engine
  throw new Error(`Unknown engine "${name}"`)
}

function formatArg(a: unknown): string {
  if (a instanceof Error) return `${a.name}: ${a.message}${a.cause instanceof Error ? ` (cause: ${a.cause.message})` : ''}`
  if (typeof a === 'string') return a
  try { return JSON.stringify(a) } catch { return String(a) }
}

/** Runs fn while recording console.error output: the v1 engine reports failures only by logging. */
async function captureErrors<T>(fn: () => Promise<T>, sink: string[]): Promise<T> {
  const original = console.error
  console.error = (...a: unknown[]) => { sink.push(a.map(formatArg).join(' ').slice(0, 400)) }
  try { return await fn() } finally { console.error = original }
}

async function deleteLeftoverEvalUsers(admin: SupabaseClient) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith(`@${EVAL_EMAIL_DOMAIN}`)) await admin.auth.admin.deleteUser(u.id)
  }
}

async function runCase(admin: SupabaseClient, engine: MemoryEngineAdapter, c: EvalCase): Promise<CaseResult> {
  const result: CaseResult = {
    id: c.id, category: c.category, description: c.description, passed: false,
    checks: [], memories: [], retrievals: [], pipelineErrors: [], decisions: [], turnLatenciesMs: [],
  }
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: `${c.id}-${Date.now()}@${EVAL_EMAIL_DOMAIN}`,
    password: crypto.randomUUID(),
    email_confirm: true,
  })
  if (userErr || !created.user) throw new Error(`createUser failed: ${userErr?.message}`)
  const userId = created.user.id

  try {
    if (c.seed_memories?.length) await engine.seed(admin, userId, c.seed_memories)

    const { data: conv, error: convErr } = await admin
      .from('conversations').insert({ user_id: userId, title: `eval ${c.id}` }).select('id').single()
    if (convErr || !conv) throw new Error(`conversation insert failed: ${convErr?.message}`)

    const history: Turn[] = []
    for (const t of c.turns) {
      const { data: msg, error: msgErr } = await admin
        .from('messages').insert({ conversation_id: conv.id, user_id: userId, role: t.role, content: t.text })
        .select('id').single()
      if (msgErr || !msg) throw new Error(`message insert failed: ${msgErr?.message}`)
      const turn: Turn = { role: t.role, text: t.text, messageId: msg.id }
      if (t.role === 'user') {
        const started = Date.now()
        const lines = await captureErrors(
          () => engine.processTurn({ client: admin, userId, conversationId: conv.id, turn, history: [...history] }),
          result.pipelineErrors,
        )
        result.decisions.push({ turn: t.text, lines })
        result.turnLatenciesMs.push(Date.now() - started)
      }
      history.push(turn)
    }

    result.memories = await engine.snapshot(admin, userId)
    result.checks.push(...scoreMemories(c, result.memories))

    for (const probe of c.probes ?? []) {
      const retrieved = await captureErrors(() => engine.retrieve(admin, userId, probe.query), result.pipelineErrors)
      result.retrievals.push({ query: probe.query, retrieved })
      result.checks.push(...scoreRetrieval(probe.query, retrieved, probe))
    }
    result.passed = result.checks.every(ch => ch.pass)
  } catch (err) {
    result.fatal = formatArg(err)
  } finally {
    await admin.auth.admin.deleteUser(userId)
  }
  return result
}

function pct(n: number, d: number) { return d === 0 ? '—' : `${Math.round((100 * n) / d)}%` }

function toMarkdown(meta: Record<string, unknown>, results: CaseResult[]): string {
  const checks = results.flatMap(r => r.checks)
  const byCat = new Map<string, CaseResult[]>()
  for (const r of results) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r])
  const latencies = results.flatMap(r => r.turnLatenciesMs).sort((a, b) => a - b)
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0
  const kinds = [...new Set(checks.map(c => c.kind))]

  let md = `# Eval run: ${meta.label ?? meta.engine}\n\n`
  md += `| | |\n|---|---|\n`
  for (const [k, v] of Object.entries(meta)) md += `| ${k} | \`${typeof v === 'string' ? v : JSON.stringify(v)}\` |\n`
  md += `\n## Summary\n\n`
  md += `- **Cases passed: ${results.filter(r => r.passed).length}/${results.length}** (a case passes only if every check passes)\n`
  md += `- **Checks passed: ${checks.filter(c => c.pass).length}/${checks.length}** (${pct(checks.filter(c => c.pass).length, checks.length)})\n`
  md += `- Cases with a fatal error: ${results.filter(r => r.fatal).length}\n`
  md += `- Pipeline errors logged (silently swallowed by the engine): ${results.reduce((n, r) => n + r.pipelineErrors.length, 0)}\n`
  md += `- Background processing per user turn: median ${median} ms, max ${latencies.at(-1) ?? 0} ms\n\n`
  md += `### By check type\n\n| check | passed |\n|---|---|\n`
  for (const k of kinds) {
    const ks = checks.filter(c => c.kind === k)
    md += `| ${k} | ${ks.filter(c => c.pass).length}/${ks.length} |\n`
  }
  md += `\n### By category\n\n| category | cases | checks |\n|---|---|---|\n`
  for (const [cat, rs] of byCat) {
    const cs = rs.flatMap(r => r.checks)
    md += `| ${cat} | ${rs.filter(r => r.passed).length}/${rs.length} | ${cs.filter(c => c.pass).length}/${cs.length} |\n`
  }
  md += `\n## Cases\n`
  for (const r of results) {
    md += `\n### ${r.passed ? 'PASS' : 'FAIL'} ${r.id}: ${r.description}\n\n`
    if (r.fatal) md += `**Fatal:** ${r.fatal}\n\n`
    md += `Stored memories:\n`
    md += r.memories.length ? r.memories.map(m => `- \`${m.status}\` ${m.content}${m.valid_until ? ` _(until ${m.valid_until})_` : ''}`).join('\n') : '- _(none)_'
    md += `\n\nChecks:\n`
    for (const ch of r.checks) {
      md += `- ${ch.pass ? 'pass' : '**FAIL**'} ${ch.kind}${ch.query ? ` "${ch.query}"` : ''}: ${ch.fact}${ch.evidence.length ? ` → ${ch.evidence.map(e => `"${e}"`).join(', ')}` : ''}\n`
    }
    for (const rt of r.retrievals) md += `- retrieved for "${rt.query}": ${rt.retrieved.length ? rt.retrieved.map(t => `"${t}"`).join(', ') : '_(nothing)_'}\n`
    if (r.decisions.length) {
      md += `\nEngine decisions:\n`
      for (const d of r.decisions) md += `- "${d.turn.slice(0, 80)}"\n${d.lines.map(l => `  - ${l}`).join('\n')}\n`
    }
    if (r.pipelineErrors.length) md += `\nPipeline errors:\n${r.pipelineErrors.map(e => `- \`${e.replace(/`/g, "'")}\``).join('\n')}\n`
  }
  return md
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).')
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const engine = await loadEngine(args.engine!)
  const { describeActiveModels } = await import('@/lib/ai/provider')
  const only = args.only?.split(',').map(s => s.trim())
  const pool = args.set === 'holdout' ? HOLDOUT_CASES : [...CASES, ...CONVERSATION_CASES]
  const cases = only ? pool.filter(c => only.includes(c.id)) : pool
  if (cases.length === 0) throw new Error('No cases selected.')

  const sh = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'unknown' } }
  const meta = {
    label: args.label ?? `${args.engine}`,
    engine: engine.name,
    date: new Date().toISOString(),
    git: `${sh('git rev-parse --short HEAD')}${sh('git status --porcelain') ? ' (uncommitted changes)' : ''}`,
    models: describeActiveModels(),
    ollama: sh('ollama --version'),
    set: args.set,
    cases: cases.length,
  }
  console.log(`Running ${cases.length} cases with`, meta.models)

  await deleteLeftoverEvalUsers(admin)
  const results: CaseResult[] = []
  for (const c of cases) {
    const started = Date.now()
    const r = await runCase(admin, engine, c)
    results.push(r)
    const passed = r.checks.filter(ch => ch.pass).length
    console.log(`${r.passed ? 'PASS' : 'FAIL'} ${c.id.padEnd(14)} ${passed}/${r.checks.length} checks  ${((Date.now() - started) / 1000).toFixed(1)}s${r.fatal ? `  FATAL: ${r.fatal}` : ''}${r.pipelineErrors.length ? `  (${r.pipelineErrors.length} pipeline errors)` : ''}`)
  }

  const slug = `${meta.date.replace(/[:.]/g, '-').slice(0, 19)}-${meta.label}-${meta.models.extraction}`.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const dir = path.join(__dirname, 'results', slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ meta, results }, null, 2))
  fs.writeFileSync(path.join(dir, 'report.md'), toMarkdown(meta, results))

  const checks = results.flatMap(r => r.checks)
  console.log(`\nCases ${results.filter(r => r.passed).length}/${results.length}, checks ${checks.filter(c => c.pass).length}/${checks.length}. Report: ${path.relative(process.cwd(), dir)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
