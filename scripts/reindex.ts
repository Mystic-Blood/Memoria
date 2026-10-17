/**
 * Re-embeds every memory whose vector was made by a different embedding model than the one now
 * configured (AI_MODE / EMBEDDING_MODEL). Run it after switching between local Ollama and Gemini:
 * until then, retrieval cannot see memories embedded by the other model.
 *
 *   npm run reindex            # re-embed what does not match
 *   npm run reindex -- --check # only report how many memories would change
 */
import { createAdminClient } from '../src/utils/supabase/admin'
import { embeddingProfile } from '../src/lib/ai/config'
import { embedText, toPgVector } from '../src/lib/engine/embed'

async function main(): Promise<number> {
  const checkOnly = process.argv.includes('--check')
  const admin = createAdminClient()
  const profile = embeddingProfile()

  const { data: stale, error } = await admin
    .from('memories')
    .select('id, content, embedding_profile')
    .neq('embedding_profile', profile)
    .limit(10_000)
  if (error) throw new Error(`Could not list memories: ${error.message}`)

  const byProfile = new Map<string, number>()
  for (const m of stale ?? []) byProfile.set(m.embedding_profile, (byProfile.get(m.embedding_profile) ?? 0) + 1)
  console.log(`Current embedding profile: ${profile}`)
  console.log(`Memories on another profile: ${stale?.length ?? 0}${byProfile.size ? ` (${[...byProfile].map(([p, n]) => `${n} from ${p}`).join(', ')})` : ''}`)
  if (checkOnly || !stale?.length) return 0

  let done = 0
  let failed = 0
  for (const m of stale) {
    const embedded = await embedText(m.content, 'document')
    if (!embedded.ok || embedded.profile !== profile) {
      failed++
      console.error(`  failed ${m.id}: ${embedded.ok ? `got profile ${embedded.profile}` : embedded.error}`)
      continue
    }
    const { error: writeError } = await admin.rpc('memory_reembed', {
      p_memory_id: m.id, p_embedding: toPgVector(embedded.vector), p_embedding_profile: profile,
    })
    if (writeError) { failed++; console.error(`  failed ${m.id}: ${writeError.message}`); continue }
    done++
    if (done % 25 === 0) console.log(`  ${done}/${stale.length}`)
  }
  console.log(`Re-embedded ${done} of ${stale.length}${failed ? `, ${failed} failed (run again to retry)` : ''}.`)
  return failed ? 1 : 0
}

main().then(code => process.exit(code), err => { console.error(err); process.exit(1) })
