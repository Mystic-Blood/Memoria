import { describe, it, expect } from 'vitest'
import { anchorToBest } from '@/lib/engine/retrieve'
import type { RecalledMemory } from '@/lib/engine/types'

const m = (content: string, similarity: number): RecalledMemory => ({ id: content, content, kind: 'fact', expires_at: null, updated_at: '', similarity })

describe('anchorToBest', () => {
  it('keeps the best match and close runners-up, drops weaker unrelated ones', () => {
    // measured on "what kind of pet do i have?": cat 0.66, Ford 0.52, pizza 0.51
    const kept = anchorToBest([m('User has a cat named Whiskers', 0.66), m('User drives a Ford F150', 0.52), m('User likes pizza', 0.51)], 0.08)
    expect(kept.map(k => k.content)).toEqual(['User has a cat named Whiskers'])
  })

  it('keeps several memories when they are all about equally relevant', () => {
    const kept = anchorToBest([m('a', 0.7), m('b', 0.66), m('c', 0.63), m('d', 0.5)], 0.08)
    expect(kept.map(k => k.content)).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing when nothing passed the floor', () => {
    expect(anchorToBest([], 0.08)).toEqual([])
  })
})
