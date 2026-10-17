import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { misconfiguredResponse } from '@/lib/env'

// Expires temporary memories whose end date has passed. Vercel Cron calls this with
// "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.CRON_SECRET) {
      console.error('[Staleness Sweep] CRON_SECRET is missing in production. Failing closed.')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Authorised, but say clearly if the database settings are missing instead of crashing.
    const misconfigured = misconfiguredResponse('/api/cron/staleness-sweep', ['supabase'])
    if (misconfigured) return misconfigured
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Local development allows a missing secret, but enforces it if present
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await createAdminClient().rpc('memory_expire_due')
  if (error) {
    console.error('[Staleness Sweep] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  return NextResponse.json({ expired: data as number })
}
