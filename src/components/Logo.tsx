/** The Memoria mark (an "m" whose middle point is a stored memory) plus the wordmark. */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-grid place-items-center rounded-lg bg-accent text-on-accent shadow-card ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]">
        <path d="M5 18V8.5l7 6 7-6V18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="6" r="1.9" fill="currentColor" />
      </svg>
    </span>
  )
}

export default function Logo({ className = '', wordmarkClassName = '' }: { className?: string; wordmarkClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight text-fg ${className}`}>
      <LogoMark />
      <span className={`text-[17px] ${wordmarkClassName}`}>Memoria</span>
    </span>
  )
}
