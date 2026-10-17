/**
 * Single source of truth for which AI backend and which models Memoria uses.
 *
 * Backend selection (AI_MODE):
 *   local  -> always Ollama
 *   remote -> REMOTE_PROVIDER (google | openai); fails loudly if its API key is missing
 *   auto   -> (default) a remote provider if its API key is configured, otherwise Ollama
 *
 * Model overrides (CHAT_MODEL, EXTRACTION_MODEL, RECONCILE_MODEL, EMBEDDING_MODEL) accept a
 * comma-separated list of entries. An entry may be scoped to one backend with a prefix
 * ("ollama:qwen3:4b", "google:gemini-flash-latest"; "local:" is an alias for "ollama:").
 * Scoped entries apply only when that backend is active, so one .env works in every mode.
 */

export type Backend = 'ollama' | 'google' | 'openai'
export type ModelRole = 'chat' | 'extraction' | 'reconcile' | 'embedding'
type Env = Record<string, string | undefined>

/** Every stored embedding has this many dimensions (pgvector column is vector(768)). */
export const EMBEDDING_DIMENSIONS = 768

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'

const ROLE_ENV: Record<ModelRole, string> = {
  chat: 'CHAT_MODEL',
  extraction: 'EXTRACTION_MODEL',
  reconcile: 'RECONCILE_MODEL',
  embedding: 'EMBEDDING_MODEL',
}

export const DEFAULT_MODELS: Record<Backend, Record<ModelRole, string>> = {
  ollama: {
    chat: 'qwen2.5:7b-instruct',
    extraction: 'qwen2.5:7b-instruct',
    reconcile: 'qwen2.5:7b-instruct',
    embedding: 'nomic-embed-text',
  },
  // Pinned versions, not "-latest" aliases: on 2026-10-17 gemini-flash-latest pointed to gemini-3.8-flash,
  // whose free tier allows 5 requests a minute; a chat message needs 3-5 calls. Free limits are counted
  // per model, so the reply and the background memory work use different models (15 a minute each,
  // measured), which roughly doubles how much the free tier can handle.
  google: {
    chat: 'gemini-3.5-flash-lite',
    extraction: 'gemini-3.1-flash-lite',
    reconcile: 'gemini-3.1-flash-lite',
    embedding: 'gemini-embedding-001',
  },
  openai: {
    chat: 'gpt-4.1-mini',
    extraction: 'gpt-4.1-mini',
    reconcile: 'gpt-4.1-mini',
    embedding: 'text-embedding-3-small',
  },
}

const API_KEY_ENV: Record<Exclude<Backend, 'ollama'>, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
}

const BACKEND_PREFIXES: Record<string, Backend> = {
  ollama: 'ollama',
  local: 'ollama',
  google: 'google',
  openai: 'openai',
}

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIConfigError'
  }
}

function hasKey(backend: Exclude<Backend, 'ollama'>, env: Env): boolean {
  return Boolean(env[API_KEY_ENV[backend]]?.trim())
}

function parseRemoteProvider(env: Env): Exclude<Backend, 'ollama'> | undefined {
  const value = env.REMOTE_PROVIDER?.trim()
  if (!value) return undefined
  if (value === 'google' || value === 'openai') return value
  throw new AIConfigError(`REMOTE_PROVIDER must be "google" or "openai", got "${value}".`)
}

export function resolveBackend(env: Env = process.env): Backend {
  const mode = env.AI_MODE?.trim() || 'auto'
  const explicitProvider = parseRemoteProvider(env)

  if (mode === 'local') return 'ollama'

  if (mode === 'remote') {
    const provider = explicitProvider ?? (hasKey('google', env) ? 'google' : hasKey('openai', env) ? 'openai' : undefined)
    if (!provider) {
      throw new AIConfigError('AI_MODE=remote but no GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY is set.')
    }
    if (!hasKey(provider, env)) {
      throw new AIConfigError(`AI_MODE=remote with REMOTE_PROVIDER=${provider} but ${API_KEY_ENV[provider]} is not set.`)
    }
    return provider
  }

  if (mode === 'auto') {
    if (explicitProvider) return hasKey(explicitProvider, env) ? explicitProvider : 'ollama'
    if (hasKey('google', env)) return 'google'
    if (hasKey('openai', env)) return 'openai'
    return 'ollama'
  }

  throw new AIConfigError(`AI_MODE must be "auto", "local" or "remote", got "${mode}".`)
}

/** Picks the override that applies to `backend` from a comma-separated env value, if any. */
function pickOverride(raw: string | undefined, backend: Backend): string | undefined {
  if (!raw) return undefined
  let unscoped: string | undefined
  for (const entry of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const sep = entry.indexOf(':')
    const scope = sep > 0 ? BACKEND_PREFIXES[entry.slice(0, sep)] : undefined
    if (scope) {
      if (scope === backend) return entry.slice(sep + 1)
    } else {
      unscoped ??= entry
    }
  }
  return unscoped
}

export function resolveModelId(role: ModelRole, env: Env = process.env, backend: Backend = resolveBackend(env)): string {
  return pickOverride(env[ROLE_ENV[role]], backend) ?? DEFAULT_MODELS[backend][role]
}

export function resolveOllamaBaseUrl(env: Env = process.env): string {
  return (env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, '')
}

/**
 * Identifies the vector space a stored embedding lives in. Vectors from different profiles are
 * not comparable, so retrieval refuses to mix them; after switching models run `npm run reindex`.
 */
export function embeddingProfile(env: Env = process.env): string {
  const backend = resolveBackend(env)
  return `${backend}:${resolveModelId('embedding', env, backend)}:${EMBEDDING_DIMENSIONS}`
}

export function apiKeyEnvName(backend: Exclude<Backend, 'ollama'>): string {
  return API_KEY_ENV[backend]
}
