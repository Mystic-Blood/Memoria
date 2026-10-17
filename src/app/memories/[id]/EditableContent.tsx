'use client'

import { useState } from 'react'
import { editMemoryAction } from '../actions'
import { useRouter } from 'next/navigation'

export default function EditableContent({ 
  id, 
  initialContent, 
  isActive 
}: { 
  id: string, 
  initialContent: string, 
  isActive: boolean 
}) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState(initialContent)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!content.trim() || content.trim() === initialContent) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    setError(null)
    
    try {
      await editMemoryAction(id, content.trim())
      setIsEditing(false)
      router.refresh()
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error && err.message ? err.message : 'Failed to save edits')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section>
      <div className="flex justify-between items-center mb-3">
        <h2 className="eyebrow">Content</h2>
        {isActive && !isEditing && (
          <button 
            onClick={() => setIsEditing(true)}
            className="btn btn-sm btn-ghost text-accent-text"
          >
            Edit
          </button>
        )}
      </div>

      <div className="rounded-xl border border-line bg-subtle p-5">
        {isEditing ? (
          <div className="space-y-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isSaving}
              aria-label="Memory text"
              className="field h-32 resize-y"
            />
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setContent(initialContent)
                  setIsEditing(false)
                  setError(null)
                }}
                disabled={isSaving}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || !content.trim()}
                className="btn btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-lg leading-relaxed whitespace-pre-wrap text-fg">
            {initialContent}
          </p>
        )}
      </div>
    </section>
  )
}
