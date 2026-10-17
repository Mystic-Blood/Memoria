import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import Logo from './Logo'
import NavLinks from './NavLinks'

export default async function Navigation() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  return (
    <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-line bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href="/chat" aria-label="Memoria, go to chat" className="shrink-0">
            <Logo wordmarkClassName="hidden sm:inline" />
          </Link>
          <NavLinks />
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn btn-ghost">Sign out</button>
        </form>
      </div>
    </header>
  )
}
