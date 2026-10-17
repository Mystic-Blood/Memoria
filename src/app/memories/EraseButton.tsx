'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eraseMemoryAction } from './actions'

export default function EraseButton({ memoryId }: { memoryId: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function erase() {
    if (!confirm('Erase this memory forever? Its text and history are deleted and cannot be recovered. What you wrote in your chats stays until you delete those chats.')) return
    setError(null)
    start(async () => {
      try {
        await eraseMemoryAction(memoryId)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <>
      <button onClick={erase} disabled={busy} className="btn btn-sm btn-danger-ghost">{busy ? 'Erasing…' : 'Erase'}</button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </>
  )
}
