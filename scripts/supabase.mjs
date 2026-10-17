// Runs the Supabase CLI against the hosted database without Docker.
// Usage (via npm scripts): node --env-file=.env.local scripts/supabase.mjs <cli args...>
// Appends --db-url from SUPABASE_DB_URL so the connection string never appears in package.json or shell history.
// Spawns the CLI through node directly (no shell), so special characters in the password are passed through intact.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('SUPABASE_DB_URL is not set. Add the Session pooler connection string to .env.local.')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const pkgDir = path.dirname(require.resolve('supabase/package.json'))
const cli = path.join(pkgDir, require('supabase/package.json').bin.supabase)

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2), '--db-url', dbUrl], { stdio: 'inherit' })
process.exit(result.status ?? 1)
