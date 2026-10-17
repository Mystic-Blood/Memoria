import { embed } from 'ai'
import { getEmbeddingModel, embeddingProviderOptions } from '@/lib/ai/provider'
import { EMBEDDING_DIMENSIONS, embeddingProfile, resolveBackend, resolveModelId } from '@/lib/ai/config'

/**
 * "document": text that gets stored (memories). "query": a question used to search them.
 * Some embedding models need to be told which one they are looking at.
 */
type EmbedPurpose = 'document' | 'query'

type EmbedResult = { ok: true; vector: number[]; profile: string } | { ok: false; error: string }

/**
 * nomic-embed-text was trained with task prefixes and its model card says they are required
 * ("search_document: ..." for indexed text, "search_query: ..." for questions).
 */
function withTaskPrefix(modelId: string, purpose: EmbedPurpose, text: string): string {
  if (!/^nomic-embed/i.test(modelId)) return text
  return `${purpose === 'query' ? 'search_query' : 'search_document'}: ${text}`
}

export async function embedText(text: string, purpose: EmbedPurpose): Promise<EmbedResult> {
  try {
    const backend = resolveBackend()
    const modelId = resolveModelId('embedding', process.env, backend)
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: withTaskPrefix(modelId, purpose, text),
      maxRetries: 1,
      providerOptions: embeddingProviderOptions(backend, purpose),
      abortSignal: AbortSignal.timeout(30_000),
    })
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      return { ok: false, error: `embedding model returned ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}` }
    }
    return { ok: true, vector: embedding, profile: embeddingProfile() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** pgvector accepts vectors as JSON-style array literals. */
export function toPgVector(vector: number[]): string {
  return JSON.stringify(vector)
}
