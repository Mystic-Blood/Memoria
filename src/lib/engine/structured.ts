import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from 'ai'
import type { z } from 'zod'

export type StructuredFailure = {
  ok: false
  /** Short machine-readable reason, recorded so failures are visible instead of silently empty. */
  reason: 'invalid_output' | 'timeout' | 'unavailable' | 'rate_limited' | 'error'
  message: string
  /** Raw model text when the model answered but the answer did not fit the schema. */
  rawText?: string
  attempts: number
  ms: number
}

export type StructuredResult<T> = { ok: true; value: T; attempts: number; ms: number } | StructuredFailure

type Options<T> = {
  model: LanguageModel
  schema: z.ZodType<T>
  instructions: string
  prompt: string
  /** Per-attempt timeout. Local models on a small GPU are slow; the default is generous. */
  timeoutMs?: number
  /** Total attempts. Invalid output is retried once by default; small models often succeed on a second try. */
  attempts?: number
}

/** Longest wait for a rate limit to reset before giving up (free API tiers reset per minute). */
const MAX_RATE_LIMIT_WAIT_MS = 60_000
/** How many rate-limit waits one call may make; they do not count as attempts. */
const MAX_RATE_LIMIT_WAITS = 2

/** For a 429 (quota) error: how long the provider asks us to wait, in ms. Otherwise null. */
export function rateLimitDelayMs(error: unknown): number | null {
  const e = error as { statusCode?: number; responseBody?: string; responseHeaders?: Record<string, string> }
  if (e?.statusCode !== 429) return null
  const header = Number(e.responseHeaders?.['retry-after'])
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_RATE_LIMIT_WAIT_MS)
  // Google puts it in the body: "retryDelay": "58s"
  const seconds = Number(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(e.responseBody ?? '')?.[1])
  return Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 + 500 : 20_000, MAX_RATE_LIMIT_WAIT_MS)
}

function classify(error: unknown): Pick<StructuredFailure, 'reason' | 'message' | 'rawText'> {
  if (NoObjectGeneratedError.isInstance(error)) {
    return { reason: 'invalid_output', message: error.message, rawText: error.text }
  }
  const e = error as { name?: string; message?: string; code?: string; cause?: { code?: string } }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return { reason: 'timeout', message: e.message ?? 'timed out' }
  if (e?.code === 'ECONNREFUSED' || e?.cause?.code === 'ECONNREFUSED') return { reason: 'unavailable', message: 'model server unreachable' }
  if (rateLimitDelayMs(error) !== null) return { reason: 'rate_limited', message: 'API rate limit reached' }
  return { reason: 'error', message: e?.message ?? String(error) }
}

/**
 * Asks a model for JSON matching `schema`. Never throws for model failures: the caller gets an explicit
 * failure it must handle (and can record), instead of an empty result that looks like "nothing to remember".
 */
export async function generateStructured<T>(opts: Options<T>): Promise<StructuredResult<T>> {
  const maxAttempts = opts.attempts ?? 2
  const started = Date.now()
  let last: ReturnType<typeof classify> = { reason: 'error', message: 'not attempted' }
  let rateLimitWaits = 0

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { output } = await generateText({
        model: opts.model,
        output: Output.object({ schema: opts.schema }),
        instructions: opts.instructions,
        prompt: opts.prompt,
        temperature: 0,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      })
      return { ok: true, value: output as T, attempts: attempt, ms: Date.now() - started }
    } catch (error) {
      last = classify(error)
      // Retrying cannot help when the server is down.
      if (last.reason === 'unavailable') break
      // A rate limit resets on its own: wait as long as the provider asks, without using up an attempt.
      const delay = rateLimitDelayMs(error)
      if (delay !== null && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
        rateLimitWaits++
        attempt--
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  return { ok: false, ...last, attempts: maxAttempts, ms: Date.now() - started }
}
