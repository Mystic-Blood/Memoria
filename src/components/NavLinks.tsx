'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/chat', label: 'Chat' },
  { href: '/memories', label: 'Memories' },
]

/** Primary navigation; highlights the section you are in. */
export default function NavLinks() {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 transition-colors ${active ? 'bg-subtle text-fg' : 'text-muted hover:bg-subtle hover:text-fg'}`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
