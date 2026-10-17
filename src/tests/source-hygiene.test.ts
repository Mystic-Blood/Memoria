import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Twice on 2026-10-16 a regex written inside a template literal ended up with a backspace character
// (\x08) where "\b" (word boundary) was meant, which silently broke the pattern. Catch it at source.
const ROOTS = ['src', 'eval', 'e2e', 'scripts']
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/

function* files(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'results' && entry.name !== 'node_modules') yield* files(full)
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      yield full
    }
  }
}

describe('source hygiene', () => {
  it('no source file contains invisible control characters', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of files(root)) {
        fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (CONTROL.test(line)) offenders.push(`${file}:${i + 1}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })
})
