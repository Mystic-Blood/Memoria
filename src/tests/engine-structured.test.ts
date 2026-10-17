import { describe, it, expect } from 'vitest'
import { rateLimitDelayMs } from '@/lib/engine/structured'

describe('rateLimitDelayMs', () => {
  it('ignores anything that is not a 429', () => {
    expect(rateLimitDelayMs(new Error('boom'))).toBeNull()
    expect(rateLimitDelayMs({ statusCode: 500 })).toBeNull()
  })

  it("reads Google's retryDelay from the body, with a little slack", () => {
    const body = JSON.stringify({ error: { details: [{ '@type': 'RetryInfo', retryDelay: '17s' }] } })
    expect(rateLimitDelayMs({ statusCode: 429, responseBody: body })).toBe(17_500)
  })

  it('prefers a retry-after header, and never waits more than a minute', () => {
    expect(rateLimitDelayMs({ statusCode: 429, responseHeaders: { 'retry-after': '5' } })).toBe(5_000)
    expect(rateLimitDelayMs({ statusCode: 429, responseHeaders: { 'retry-after': '600' } })).toBe(60_000)
  })

  it('falls back to 20 seconds when the provider gives no hint', () => {
    expect(rateLimitDelayMs({ statusCode: 429, responseBody: '{}' })).toBe(20_000)
  })
})
