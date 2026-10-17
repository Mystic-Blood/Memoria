import Link from 'next/link'
import { LogoMark } from '@/components/Logo'
import { login, signup } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const { error } = await searchParams
  const errorMessage = Array.isArray(error) ? error[0] : error

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_70%_at_50%_0%,var(--accent-soft),transparent)]" />

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" aria-label="Memoria home"><LogoMark className="size-11" /></Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Welcome to Memoria</h1>
          <p className="mt-2 text-sm text-muted">The assistant whose memory you can watch and correct.</p>
        </div>

        <form className="card flex flex-col gap-5 p-6 sm:p-7">
          {errorMessage && (
            <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-sm text-danger">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-fg">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="field" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-fg">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              aria-describedby="password-hint"
              className="field"
            />
            <p id="password-hint" className="text-xs text-faint">At least 8 characters.</p>
          </div>
          <div className="mt-1 flex flex-col gap-2.5">
            <button formAction={login} className="btn btn-primary w-full py-2.5">Log in</button>
            <button formAction={signup} className="btn btn-secondary w-full py-2.5">Sign up</button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-faint">
          New here? Enter an email and password, then <span className="font-medium text-muted">Sign up</span>.
          <br />
          <Link href="/" className="link mt-2 inline-block">What is Memoria?</Link>
        </p>
      </div>
    </main>
  )
}
