/**
 * The "Measured" section: what the rebuild changed, as before -> after per skill (a dumbbell chart that is
 * also a real table, so every value is readable without the picture).
 *
 * Numbers: the same 33 test conversations scored with the original engine
 * (eval/results/2026-10-16T11-17-42-baseline-v1-llama3_8b) and the rebuilt one
 * (eval/results/2026-10-16T16-17-29-dev-final-qwen2.5_7b-instruct), counted per check type.
 */
const SKILLS: Array<{ skill: string; before: number; after: number; total: number }> = [
  { skill: 'Remembers what you tell it', before: 17, after: 39, total: 41 },
  { skill: 'Drops the old fact when you correct it', before: 2, after: 8, total: 9 },
  { skill: 'Finds the right memory when you ask', before: 3, after: 7, total: 7 },
  { skill: 'Keeps unrelated memories out of a reply', before: 0, after: 10, total: 10 },
  { skill: 'Ignores small talk and passing remarks', before: 11, after: 13, total: 16 },
]

const pct = (n: number, total: number) => (n / total) * 100

function Dot({ at, className }: { at: number; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${className}`}
      style={{ left: `${at}%` }}
    />
  )
}

function Dumbbell({ before, after, total }: { before: number; after: number; total: number }) {
  const from = pct(before, total)
  const to = pct(after, total)
  return (
    <div aria-hidden="true" className="relative h-5 w-full">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      <span className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent-line" style={{ left: `${from}%`, width: `${to - from}%` }} />
      <Dot at={from} className="bg-chart-before" />
      <Dot at={to} className="bg-chart-after" />
    </div>
  )
}

function LegendDot({ className }: { className: string }) {
  return <span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${className}`} />
}

export default function Results({ decisionsHref }: { decisionsHref: string }) {
  return (
    <div className="card grid gap-10 p-6 sm:p-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)] lg:gap-12">
      <div>
        <p className="text-sm text-muted">Test conversations handled completely right</p>
        <p className="mt-2 text-5xl font-semibold tracking-tight text-fg">27 <span className="text-2xl font-medium text-faint">of 33</span></p>
        <p className="mt-2 text-sm text-muted">up from 6 with the original engine, on the same conversations.</p>

        <div className="mt-8 border-t border-line pt-6">
          <p className="text-3xl font-semibold tracking-tight text-fg">14 <span className="text-lg font-medium text-faint">of 15</span></p>
          <p className="mt-1 text-sm text-muted">on a separate set written before tuning and never tuned on.</p>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <span className="inline-flex items-center gap-2"><LegendDot className="bg-chart-before" />Original engine</span>
          <span className="inline-flex items-center gap-2"><LegendDot className="bg-chart-after" />Rebuilt engine</span>
        </div>

        <table className="mt-5 w-full border-collapse text-sm">
          <caption className="sr-only">Checks passed per skill, original engine and rebuilt engine</caption>
          <thead className="sr-only">
            <tr><th scope="col">Skill</th><th scope="col">Chart</th><th scope="col">Original</th><th scope="col">Rebuilt</th></tr>
          </thead>
          <tbody>
            {SKILLS.map(s => (
              <tr
                key={s.skill}
                title={`Original engine: ${s.before} of ${s.total} checks. Rebuilt: ${s.after} of ${s.total}.`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 border-t border-line py-3.5 first:border-t-0 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto] sm:items-center"
              >
                <th scope="row" className="text-left font-normal text-fg">{s.skill}</th>
                <td className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"><Dumbbell {...s} /></td>
                <td className="col-start-2 row-start-1 text-right whitespace-nowrap text-muted sm:col-start-auto sm:row-start-auto">
                  <span className="sr-only">Original: </span>{s.before}
                  <span aria-hidden="true" className="mx-1 text-faint">&rarr;</span>
                  <span className="sr-only">, rebuilt: </span><span className="font-medium text-fg">{s.after}</span>
                  <span className="text-faint"> / {s.total}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-5 text-sm leading-relaxed text-muted">
          Still weak: long, rambling messages (no better than before) and telling a short-term plan from a
          lasting change. Scored by keyword rubrics against a real database with a local 7B model, not by another
          model. <a href={decisionsHref} className="link font-medium">Full results and limitations &rarr;</a>
        </p>
      </div>
    </div>
  )
}
