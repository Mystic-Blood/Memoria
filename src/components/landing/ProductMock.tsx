import { LiveIndicator, MemoryCard, bubbleClass } from '@/components/ui'

/**
 * A static picture of the product: a short chat on the left, the live memory panel on the right.
 * Built from the same pieces as the real app; nothing here is interactive.
 */
const CHAT: Array<{ mine: boolean; text: string; used?: number }> = [
  { mine: true, text: "Hi! I'm Sam. I work as a designer and I live in Toronto." },
  { mine: false, text: 'Nice to meet you, Sam! What kind of design do you do?' },
  { mine: true, text: 'Actually, I just moved to Vancouver last week.' },
  { mine: false, text: 'Congratulations on the move! How is Vancouver treating you so far?', used: 2 },
  { mine: true, text: 'Busy. These days I mostly work as a product manager.' },
]

function FakeButton({ primary, children }: { primary?: boolean; children: string }) {
  return (
    <span className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-secondary'}`}>{children}</span>
  )
}

export default function ProductMock() {
  return (
    <figure className="relative">
      {/* soft glow behind the window */}
      <div aria-hidden="true" className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-[2.5rem] bg-[radial-gradient(60%_60%_at_50%_40%,var(--accent-soft),transparent)]" />

      <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-line bg-canvas shadow-float">
        {/* window bar */}
        <div className="flex h-10 items-center gap-2 border-b border-line bg-surface px-4">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 text-xs text-faint">memoria / chat</span>
        </div>

        <div className="grid md:grid-cols-[minmax(0,1fr)_19rem]">
          {/* chat */}
          <div className="flex flex-col gap-3 p-4 text-[13px] leading-relaxed sm:p-6 sm:text-sm">
            {CHAT.map((m, i) => (
              <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%]">
                  <div className={bubbleClass(m.mine)}>{m.text}</div>
                  {m.used && (
                    <p className="mt-1.5 ml-1 inline-flex items-center gap-1 text-xs text-faint">
                      <span className="text-[10px]">&#9656;</span> Used {m.used} memories
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div className="mt-auto flex items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-2.5 text-faint shadow-card">
              <span>Message Memoria…</span>
              <span className="btn btn-sm btn-primary pointer-events-none">Send</span>
            </div>
          </div>

          {/* memory panel */}
          <div className="border-t border-line bg-subtle/60 md:border-t-0 md:border-l">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="flex items-center gap-2.5">
                <span className="text-sm font-semibold text-fg">Memory</span>
                <LiveIndicator label="live" />
              </span>
              <span className="rounded-full border border-success-line bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">On</span>
            </div>
            <div className="space-y-2.5 p-3.5 text-[13px]">
              <MemoryCard tone="warning" label="Which is right?" time="10:06">
                <p className="text-muted">You said: <strong className="font-semibold text-fg">User works as a product manager</strong></p>
                <p className="text-muted">I remember: User works as a designer</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <FakeButton primary>Use the new one</FakeButton>
                  <FakeButton>Keep what I remember</FakeButton>
                </div>
              </MemoryCard>
              <MemoryCard tone="accent" label="Updated" time="10:04">
                <p className="text-faint line-through">User lives in Toronto</p>
                <p>User lives in Vancouver</p>
                <p className="mt-1 text-xs italic text-faint">Moved last week; the old city is kept in the history.</p>
              </MemoryCard>
              <MemoryCard tone="success" label="Remembered" time="10:02">
                <p>User&rsquo;s name is Sam</p>
              </MemoryCard>
              <MemoryCard tone="success" label="Remembered" time="10:02">
                <p className="text-faint line-through">User lives in Toronto</p>
                <p className="mt-1 text-xs text-faint">No longer current</p>
              </MemoryCard>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        An example conversation. As Sam mentions their name, job and city, the memory panel shows each fact being remembered;
        when Sam says they moved, the old city is struck through and replaced; when Sam mentions a new job, Memoria asks which is right.
      </figcaption>
    </figure>
  )
}
