/**
 * Production configuration check. A deployment with a missing secret should fail loudly and
 * clearly, not half-work (e.g. chat answering but memory never updating, or the cron job silently
 * returning 401 every night).
 *
 * Only enforced when NODE_ENV=production, and only at request time (never at import or build time),
 * so local development, `next build` and the unit tests are unaffected.
 */
import { AIConfigError, resolveBackend } from '@/lib/ai/config'

type Env = Record<string, string | undefined>

/** What a route needs. `supabase` covers the URL, anon key and service-role key. */
export type EnvRequirement = 'supabase' | 'ai' | 'cron'

const SUPABASE_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']

const isSet = (env: Env, name: string) => Boolean(env[name]?.trim())

/**
 * Lists every configuration problem for the given requirements (names and reasons, never values).
 * Returns an empty list outside production.
 */
export function productionEnvProblems(requirements: EnvRequirement[], env: Env = process.env): string[] {
  if (env.NODE_ENV !== 'production') return []
  const problems: string[] = []

  if (requirements.includes('supabase')) {
    for (const name of SUPABASE_VARS) if (!isSet(env, name)) problems.push(`${name} is not set`)
  }

  // The scheduled sweep only exists on Vercel (vercel.json); locally the chat route archives expired
  // memories itself, so a laptop running `npm start` does not need a cron secret.
  if (requirements.includes('cron') && isSet(env, 'VERCEL') && !isSet(env, 'CRON_SECRET')) {
    problems.push('CRON_SECRET is not set (the scheduled staleness sweep would be rejected)')
  }

  if (requirements.includes('ai')) {
    try {
      const backend = resolveBackend(env)
      const mode = env.AI_MODE?.trim() || 'auto'
      // auto with no API key silently falls back to Ollama on localhost, which does not exist on Vercel
      // (VERCEL=1 is set there). Elsewhere (`npm start` on a laptop next to Ollama) it is a valid setup,
      // as are AI_MODE=local and an explicit OLLAMA_BASE_URL.
      if (backend === 'ollama' && mode !== 'local' && !isSet(env, 'OLLAMA_BASE_URL') && isSet(env, 'VERCEL')) {
        problems.push(
          'no GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY is set, so AI_MODE=auto would fall back to a local ' +
          'Ollama server that is not reachable in production (set an API key, or AI_MODE=local with OLLAMA_BASE_URL)',
        )
      }
    } catch (err) {
      if (err instanceof AIConfigError) problems.push(err.message)
      else throw err
    }
  }

  return problems
}

/**
 * Returns a 500 response (and logs the reasons) when production config is incomplete, otherwise null.
 * The response body is deliberately generic: variable names go to the server log, not to visitors.
 */
export function misconfiguredResponse(route: string, requirements: EnvRequirement[], env: Env = process.env): Response | null {
  const problems = productionEnvProblems(requirements, env)
  if (problems.length === 0) return null
  console.error(`[Config] ${route} refused: the server is misconfigured:\n  - ${problems.join('\n  - ')}`)
  return new Response('The server is not configured correctly. The site owner has to fix its settings.', {
    status: 500,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

/**
 * SIGNUPS_DISABLED=true closes registration through the app's form (existing accounts can still log in).
 * The Supabase Auth API can still be called directly with the public anon key, so for a real lockdown also
 * turn off "Allow new users to sign up" in the Supabase dashboard (see docs/DEPLOY.md).
 */
export function signupsDisabled(env: Env = process.env): boolean {
  return ['1', 'true', 'yes', 'on'].includes(env.SIGNUPS_DISABLED?.trim().toLowerCase() ?? '')
}
