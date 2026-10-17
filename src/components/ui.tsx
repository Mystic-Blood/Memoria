/**
 * Small presentational pieces shared by the live app and the landing-page mock, so the mock always
 * looks like the real thing. No state, no data access.
 */
import type { ReactNode } from 'react'

export type Tone = 'success' | 'accent' | 'warning' | 'danger' | 'neutral'

const TONES: Record<Tone, { card: string; label: string; dot: string }> = {
  success: { card: 'border-line bg-surface', label: 'text-success', dot: 'bg-success' },
  accent: { card: 'border-line bg-surface', label: 'text-accent-text', dot: 'bg-accent' },
  warning: { card: 'border-warning-line bg-warning-soft', label: 'text-warning', dot: 'bg-warning' },
  danger: { card: 'border-danger-line bg-surface', label: 'text-danger', dot: 'bg-danger' },
  neutral: { card: 'border-line bg-surface', label: 'text-muted', dot: 'bg-faint' },
}

/** One entry in the memory panel: a coloured label, a time, and the memory itself. */
export function MemoryCard({ tone, label, time, children }: { tone: Tone; label: string; time?: string; children: ReactNode }) {
  const t = TONES[tone]
  return (
    <div className={`rounded-xl border p-3.5 text-sm leading-relaxed text-fg shadow-card ${t.card}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${t.label}`}>
          <span aria-hidden="true" className={`size-1.5 rounded-full ${t.dot}`} />
          {label}
        </span>
        {time && <span className="text-xs tabular-nums text-faint">{time}</span>}
      </div>
      {children}
    </div>
  )
}

/** Chat bubble styling for the user's and the assistant's messages. */
export function bubbleClass(mine: boolean): string {
  return mine
    ? 'rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-on-accent'
    : 'rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5 text-fg shadow-card'
}

/** Connection status next to the memory panel's heading: a coloured dot and a short word. */
export function LiveIndicator({ label, tone = 'success', title }: { label: string; tone?: 'success' | 'warning' | 'danger'; title?: string }) {
  const dot = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-danger'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-faint" title={title}>
      <span aria-hidden="true" className={`inline-block size-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}
