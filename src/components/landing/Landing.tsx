import Link from 'next/link'
import Logo from '@/components/Logo'
import ProductMock from './ProductMock'
import Results from './Results'

const REPO = 'https://github.com/Mystic-Blood/Memoria'
const DECISIONS = 'https://github.com/Mystic-Blood/Memoria/blob/main/docs/DECISIONS.md'

const STEPS = [
  { title: 'Extract', body: 'A model pulls candidate facts from your message, using the last few turns and today’s date for context.' },
  { title: 'Recall', body: 'Vector search finds what Memoria already knows that could be related.' },
  { title: 'Propose', body: 'The model suggests one action: skip, add, update, replace, or ask you.' },
  { title: 'Guard', body: 'Plain code checks the proposal. The model never writes to the database itself.' },
  { title: 'Write', body: 'One atomic Postgres function applies the change and records it in the history.' },
]

const CONTROLS = [
  { title: 'Edit or delete anything', body: 'Every memory can be corrected or removed, from the chat or the Memories page.' },
  { title: 'Pause it', body: 'Turn memory off and nothing new is saved until you turn it back on.' },
  { title: 'It asks when unsure', body: 'If something you say contradicts what it remembers, it waits for you to decide.' },
  { title: 'Every change has a history', body: 'Who changed it, when, why, and the message it was learned from.' },
]

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function Arrow() {
  return <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
}

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="eyebrow text-accent-text">{eyebrow}</p>
      <h2 id={id} className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h2>
      {intro && <p className="mt-3 max-w-2xl text-muted">{intro}</p>}
      <div className="mt-10">{children}</div>
    </section>
  )
}

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Memoria home"><Logo /></Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
          <a href={REPO} className="btn btn-ghost hidden sm:inline-flex"><GitHubIcon />Code</a>
          <Link href="/login" className="btn btn-ghost">Log in</Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-12 pb-16 text-center sm:px-6 sm:pt-20 sm:pb-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            Long-term memory, out in the open
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-fg sm:text-6xl">
            Memory you can see.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted sm:text-xl">
            A chat assistant whose memory you can watch, question and correct.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="btn btn-lg btn-primary group">Try it <Arrow /></Link>
            <a href={REPO} className="btn btn-lg btn-secondary"><GitHubIcon />View the code</a>
          </div>

          <div className="mx-auto mt-16 max-w-5xl text-left sm:mt-20">
            <ProductMock />
          </div>
        </section>

        <div className="border-y border-line bg-surface">
          <Section
            id="how"
            eyebrow="How it works"
            title="The model proposes. Code decides."
            intro="After each reply, your message goes through five steps in the background. Each result appears in the memory panel as it happens."
          >
            <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="bg-surface p-5">
                  <span className="inline-grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text tabular-nums">{i + 1}</span>
                  <h3 className="mt-3 font-semibold text-fg">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <Section
          id="results"
          eyebrow="Measured"
          title="Same test, before and after the rebuild."
          intro="33 scripted conversations, played into a real database and checked for what was remembered, corrected and recalled."
        >
          <Results decisionsHref={DECISIONS} />
        </Section>

        <div className="border-y border-line bg-surface">
          <Section id="control" eyebrow="Your memory, your call" title="Nothing is remembered behind your back.">
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {CONTROLS.map(c => (
                <li key={c.title} className="flex gap-4">
                  <span aria-hidden="true" className="mt-0.5 inline-grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text">
                    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
                  </span>
                  <div>
                    <h3 className="font-semibold text-fg">{c.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-sm text-muted">
              Row-level security lets you read only your own memories, and every change goes through an audited database function.
            </p>
          </Section>
        </div>

        {/* Closing call to action */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Tell it something. Watch it remember.</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted">Sign up with an email and a password, then start a conversation.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="btn btn-lg btn-primary group">Try it <Arrow /></Link>
            <a href={REPO} className="btn btn-lg btn-secondary"><GitHubIcon />View the code</a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Runs locally · Ollama (Qwen2.5 7B, nomic-embed-text) · Next.js 16 · Supabase (Postgres, pgvector, Auth, Realtime)
          </p>
          <a href={REPO} className="inline-flex items-center gap-1.5 hover:text-fg"><GitHubIcon />Mystic-Blood/Memoria</a>
        </div>
      </footer>
    </div>
  )
}
