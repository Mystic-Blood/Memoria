/**
 * Usage limits for /api/chat. Every chat message costs several model calls (the reply plus the
 * background memory extraction and reconciliation), so a hosted demo on a free API quota needs a
 * per-user limit and an overall daily cap.
 *
 * Counting happens in the database (public.chat_usage_take), so the limits hold across any number of
 * serverless instances; nothing is kept in memory.
 *
 *   CHAT_LIMIT_PER_MINUTE    per user, rolling 60 s   (default 10)
 *   CHAT_LIMIT_PER_DAY       per user, rolling 24 h   (default 200)
 *   CHAT_DAILY_GLOBAL_LIMIT  all users, rolling 24 h  (default: no limit)
 *
 * A number is that limit (0 blocks everything, e.g. to pause the demo); "off" removes the limit.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Env = Record<string, string | undefined>

export type ChatLimits = { perMinute: number | null; perDay: number | null; globalPerDay: number | null }
export type LimitReason = 'minute' | 'day' | 'global'
export type LimitDecision =
  | { allowed: true }
  | { allowed: false; reason: LimitReason; retryAfterSeconds: number }

export const DEFAULT_CHAT_LIMITS = { perMinute: 10, perDay: 200 } as const

const NO_LIMIT = new Set(['off', 'none', 'unlimited'])

/** Unset/empty -> fallback, "off" -> no limit, whole number -> that limit. Anything else warns and uses the fallback. */
function parseLimit(env: Env, name: string, fallback: number | null): number | null {
  const raw = env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (NO_LIMIT.has(raw)) return null
  if (!/^\d+$/.test(raw)) {
    console.warn(`[Limits] ${name}="${raw}" is not a whole number or "off"; using ${fallback ?? 'no limit'}.`)
    return fallback
  }
  return Number(raw)
}

export function readChatLimits(env: Env = process.env): ChatLimits {
  return {
    perMinute: parseLimit(env, 'CHAT_LIMIT_PER_MINUTE', DEFAULT_CHAT_LIMITS.perMinute),
    perDay: parseLimit(env, 'CHAT_LIMIT_PER_DAY', DEFAULT_CHAT_LIMITS.perDay),
    globalPerDay: parseLimit(env, 'CHAT_DAILY_GLOBAL_LIMIT', null),
  }
}

/**
 * Atomically checks the limits for one chat request and records it if allowed.
 * Needs the service-role client: the usage table and function are not reachable by users.
 */
export async function takeChatUsage(
  admin: SupabaseClient,
  userId: string,
  limits: ChatLimits,
): Promise<{ ok: true; decision: LimitDecision } | { ok: false; error: string }> {
  if (limits.perMinute === null && limits.perDay === null && limits.globalPerDay === null) {
    return { ok: true, decision: { allowed: true } }
  }
  const { data, error } = await admin.rpc('chat_usage_take', {
    p_user_id: userId,
    p_per_minute: limits.perMinute,
    p_per_day: limits.perDay,
    p_global_per_day: limits.globalPerDay,
  })
  if (error) return { ok: false, error: error.message }

  const row = data as { allowed?: unknown; reason?: unknown; retry_after?: unknown } | null
  if (row?.allowed === true) return { ok: true, decision: { allowed: true } }
  if (row?.allowed === false && (row.reason === 'minute' || row.reason === 'day' || row.reason === 'global')) {
    const retry = Number(row.retry_after)
    return { ok: true, decision: { allowed: false, reason: row.reason, retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60 } }
  }
  return { ok: false, error: 'unexpected response from chat_usage_take' }
}

function humanDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.ceil(minutes / 60)
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

/** 429 for a user's own limits, 503 when the whole demo is at its daily capacity. Plain text: the chat UI shows the body. */
export function limitResponse(decision: Extract<LimitDecision, { allowed: false }>, limits: ChatLimits): Response {
  const wait = humanDuration(decision.retryAfterSeconds)
  const message =
    decision.reason === 'minute'
      ? `You're sending messages a little fast (limit: ${limits.perMinute} per minute). Please wait ${wait} and try again.`
      : decision.reason === 'day'
        ? `You've reached today's limit of ${limits.perDay} messages for this demo. You can chat again in about ${wait}.`
        : `The demo is at capacity today, so new messages are paused to stay within its free API quota. Please try again in about ${wait}.`
  return new Response(message, {
    status: decision.reason === 'global' ? 503 : 429,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': String(decision.retryAfterSeconds) },
  })
}
