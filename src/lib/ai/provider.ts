import { createOpenAI } from '@ai-sdk/openai'
import { createGoogle } from '@ai-sdk/google'
import { defaultSettingsMiddleware, wrapLanguageModel, type embed, type EmbeddingModel, type LanguageModel } from 'ai'
import {
  apiKeyEnvName,
  EMBEDDING_DIMENSIONS,
  resolveBackend,
  resolveModelId,
  resolveOllamaBaseUrl,
  type Backend,
  type ModelRole,
} from './config'

/**
 * Adds `reasoning_effort: "none"` to every Ollama chat request. Thinking models (e.g. qwen3.5) otherwise
 * spend tens of seconds reasoning before a one-line JSON answer; measured on an RTX 3060 6GB, qwen3.5:4b
 * went from ~40s to ~0.6s. Non-thinking models ignore the field. Done here rather than via providerOptions
 * because the OpenAI provider only forwards reasoning settings for model ids it recognises as OpenAI's.
 */
export const disableOllamaThinking: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string' && String(input).endsWith('/chat/completions')) {
    const body = JSON.parse(init.body) as Record<string, unknown>
    init = { ...init, body: JSON.stringify({ ...body, reasoning_effort: 'none' }) }
  }
  return fetch(input, init)
}

function ollamaClient() {
  // Ollama exposes an OpenAI-compatible API. `.chat()` is required: Ollama does not support the
  // Responses API that the OpenAI provider uses by default.
  return createOpenAI({ baseURL: `${resolveOllamaBaseUrl()}/v1`, apiKey: 'ollama', fetch: disableOllamaThinking })
}

function googleClient() {
  return createGoogle({ apiKey: process.env[apiKeyEnvName('google')] })
}

/**
 * Gemini 3 models "think" before answering unless told not to; measured on the free tier, a one-word
 * reply took 3-11 s. Memoria's calls are short replies and small JSON objects, so minimal thinking.
 */
const geminiMinimalThinking = defaultSettingsMiddleware({
  settings: { providerOptions: { google: { thinkingConfig: { thinkingLevel: 'minimal' } } } },
})

function openaiClient() {
  return createOpenAI({ apiKey: process.env[apiKeyEnvName('openai')] })
}

export function getModel(role: Exclude<ModelRole, 'embedding'>): LanguageModel {
  const backend = resolveBackend()
  const modelId = resolveModelId(role, process.env, backend)
  switch (backend) {
    case 'ollama':
      return ollamaClient().chat(modelId)
    case 'google':
      return wrapLanguageModel({ model: googleClient()(modelId), middleware: geminiMinimalThinking })
    case 'openai':
      return openaiClient().chat(modelId)
  }
}

export function getEmbeddingModel(): EmbeddingModel {
  const backend = resolveBackend()
  const modelId = resolveModelId('embedding', process.env, backend)
  switch (backend) {
    case 'ollama':
      return ollamaClient().embeddingModel(modelId)
    case 'google':
      return googleClient().embeddingModel(modelId)
    case 'openai':
      return openaiClient().embeddingModel(modelId)
  }
}

type EmbedProviderOptions = Parameters<typeof embed>[0]['providerOptions']

/**
 * Provider options that make every backend return EMBEDDING_DIMENSIONS-sized vectors. Gemini also gets
 * the retrieval task type (search query vs stored document), the same distinction nomic-embed-text gets
 * through its text prefixes.
 */
export function embeddingProviderOptions(backend: Backend = resolveBackend(), purpose: 'query' | 'document' = 'document'): EmbedProviderOptions {
  if (backend === 'google') {
    return { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' } }
  }
  if (backend === 'openai') return { openai: { dimensions: EMBEDDING_DIMENSIONS } }
  return undefined
}

export function describeActiveModels() {
  const backend = resolveBackend()
  return {
    backend,
    chat: resolveModelId('chat', process.env, backend),
    extraction: resolveModelId('extraction', process.env, backend),
    reconcile: resolveModelId('reconcile', process.env, backend),
    embedding: resolveModelId('embedding', process.env, backend),
  }
}
