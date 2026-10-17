'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteMemoryAction, confirmMemoryAction, rejectMemoryAction } from '../actions'

export default function ActionButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'confirm' | 'reject' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: 'confirm' | 'reject' | 'delete', action: () => Promise<void>, prompt: string) {
    if (!confirm(prompt)) return
    setBusy(kind)
    setError(null)
    try {
      await action()
      if (kind === 'delete') router.push('/memories')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {status === 'pending' && (
          <>
            <button onClick={() => run('confirm', () => confirmMemoryAction(id), 'Replace the current memory with this one?')} disabled={!!busy} className="btn btn-primary">
              {busy === 'confirm' ? 'Confirming...' : 'Confirm'}
            </button>
            <button onClick={() => run('reject', () => rejectMemoryAction(id), 'Discard this proposed memory?')} disabled={!!busy} className="btn btn-secondary">
              {busy === 'reject' ? 'Rejecting...' : 'Reject'}
            </button>
          </>
        )}
        {['active', 'expired'].includes(status) && (
          <button onClick={() => run('delete', () => deleteMemoryAction(id), 'Delete this memory? Memoria will stop using it.')} disabled={!!busy} className="btn btn-secondary text-danger hover:border-danger-line hover:bg-danger-soft">
            {busy === 'delete' ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}
