import { describe, it, expect } from 'vitest'
import {
  AIConfigError,
  DEFAULT_MODELS,
  embeddingProfile,
  resolveBackend,
  resolveModelId,
  resolveOllamaBaseUrl,
} from '@/lib/ai/config'

describe('resolveBackend', () => {
  it('auto (default) falls back to local Ollama when no API key is configured', () => {
    expect(resolveBackend({})).toBe('ollama')
    expect(resolveBackend({ AI_MODE: 'auto', GOOGLE_GENERATIVE_AI_API_KEY: '  ' })).toBe('ollama')
  })

  it('auto uses a remote provider as soon as its API key is present', () => {
    expect(resolveBackend({ GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toBe('google')
    expect(resolveBackend({ OPENAI_API_KEY: 'o' })).toBe('openai')
  })

  it('auto respects REMOTE_PROVIDER but still falls back to Ollama when that provider has no key', () => {
    expect(resolveBackend({ REMOTE_PROVIDER: 'openai', GOOGLE_GENERATIVE_AI_API_KEY: 'g', OPENAI_API_KEY: 'o' })).toBe('openai')
    expect(resolveBackend({ REMOTE_PROVIDER: 'openai', GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toBe('ollama')
  })

  it('local forces Ollama even when API keys exist', () => {
    expect(resolveBackend({ AI_MODE: 'local', GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toBe('ollama')
  })

  it('remote fails loudly instead of silently degrading when the key is missing', () => {
    expect(() => resolveBackend({ AI_MODE: 'remote' })).toThrow(AIConfigError)
    expect(() => resolveBackend({ AI_MODE: 'remote', REMOTE_PROVIDER: 'google', OPENAI_API_KEY: 'o' })).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/)
    expect(resolveBackend({ AI_MODE: 'remote', OPENAI_API_KEY: 'o' })).toBe('openai')
  })

  it('rejects unknown modes and providers', () => {
    expect(() => resolveBackend({ AI_MODE: 'cloud' })).toThrow(AIConfigError)
    expect(() => resolveBackend({ REMOTE_PROVIDER: 'anthropic' })).toThrow(AIConfigError)
  })
})

describe('resolveModelId', () => {
  it('uses the per-backend defaults when nothing is overridden', () => {
    expect(resolveModelId('chat', {}, 'ollama')).toBe(DEFAULT_MODELS.ollama.chat)
    expect(resolveModelId('embedding', {}, 'google')).toBe('gemini-embedding-001')
  })

  it('pairs each backend with its own embedding model (regression: OpenAI model name sent to Google)', () => {
    for (const backend of ['ollama', 'google', 'openai'] as const) {
      const id = resolveModelId('embedding', {}, backend)
      expect(id).toBe(DEFAULT_MODELS[backend].embedding)
    }
    expect(resolveModelId('embedding', { GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).not.toBe('text-embedding-3-small')
  })

  it('applies an unscoped override to whichever backend is active', () => {
    expect(resolveModelId('chat', { CHAT_MODEL: 'qwen3:4b' }, 'ollama')).toBe('qwen3:4b')
  })

  it('applies scoped overrides only to their backend, so one .env works in every mode', () => {
    const env = { EXTRACTION_MODEL: 'ollama:qwen3:4b, google:gemini-flash-latest' }
    expect(resolveModelId('extraction', env, 'ollama')).toBe('qwen3:4b')
    expect(resolveModelId('extraction', env, 'google')).toBe('gemini-flash-latest')
    expect(resolveModelId('extraction', env, 'openai')).toBe(DEFAULT_MODELS.openai.extraction)
  })

  it('treats the legacy "local:" prefix as Ollama and keeps Ollama tag colons intact', () => {
    expect(resolveModelId('chat', { CHAT_MODEL: 'local:llama3:8b' }, 'ollama')).toBe('llama3:8b')
    expect(resolveModelId('chat', { CHAT_MODEL: 'local:llama3:8b' }, 'google')).toBe(DEFAULT_MODELS.google.chat)
  })
})

describe('embeddingProfile', () => {
  it('names backend, model and dimensions without leaking the "local:" prefix', () => {
    expect(embeddingProfile({ AI_MODE: 'local', EMBEDDING_MODEL: 'local:nomic-embed-text' })).toBe('ollama:nomic-embed-text:768')
    expect(embeddingProfile({ GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toBe('google:gemini-embedding-001:768')
  })
})

describe('resolveOllamaBaseUrl', () => {
  it('defaults to localhost and strips trailing slashes from overrides', () => {
    expect(resolveOllamaBaseUrl({})).toBe('http://localhost:11434')
    expect(resolveOllamaBaseUrl({ OLLAMA_BASE_URL: 'http://gpu-box:11434/' })).toBe('http://gpu-box:11434')
  })
})

describe('disableOllamaThinking', () => {
  it('adds reasoning_effort "none" to chat completions and leaves other requests untouched', async () => {
    const { vi } = await import('vitest')
    const { disableOllamaThinking } = await import('@/lib/ai/provider')
    const seen: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return new Response('{}')
    })
    try {
      await disableOllamaThinking('http://localhost:11434/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'qwen3.5:4b' }) })
      await disableOllamaThinking('http://localhost:11434/v1/embeddings', { method: 'POST', body: JSON.stringify({ model: 'nomic-embed-text' }) })
    } finally {
      vi.unstubAllGlobals()
    }
    expect(seen[0].body).toEqual({ model: 'qwen3.5:4b', reasoning_effort: 'none' })
    expect(seen[1].body).toEqual({ model: 'nomic-embed-text' })
  })
})
