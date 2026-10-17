import { describe, it, expect } from 'vitest'
import { CASES, type Rubric } from './cases'
import { HOLDOUT_CASES } from './holdout'
import { CONVERSATION_CASES } from './conversations'
import { matchesRubric, scoreMemories, scoreRetrieval } from './score'

describe('rubric matching', () => {
  const blue: Rubric = { fact: 'favorite color is blue', match: [['blue'], ['colou?r']], unless: [['green']] }

  it('requires every group and accepts any alternative within a group', () => {
    expect(matchesRubric("User's favourite colour is blue", blue)).toBe(true)
    expect(matchesRubric('User likes blue', blue)).toBe(false)
  })

  it('anchors patterns at a word start, so "rain" does not match "brain"', () => {
    expect(matchesRubric('User has a big brain', { fact: 'x', match: [['rain']] })).toBe(false)
    expect(matchesRubric('User walked in the rain', { fact: 'x', match: [['rain']] })).toBe(true)
  })

  it('lets "unless" veto a match', () => {
    expect(matchesRubric('Favorite color changed from blue to green', blue)).toBe(false)
  })
})

describe('case rubrics are self-consistent', () => {
  // Each rubric is written alongside a plain-English fact. The fact itself must satisfy its rubric,
  // otherwise the rubric is wrong and would mis-score the engine.
  for (const c of [...CASES, ...CONVERSATION_CASES, ...HOLDOUT_CASES]) {
    const rubrics = [
      ...(c.expect.stored ?? []),
      ...(c.expect.not_active ?? []),
      ...(c.expect.not_stored ?? []),
      ...(c.expect.expires ?? []),
      ...(c.expect.not_permanent ?? []),
      ...(c.probes ?? []).flatMap(p => [...(p.should_retrieve ?? []), ...(p.should_not_retrieve ?? [])]),
    ]
    for (const r of rubrics) {
      it(`${c.id}: "${r.fact}" matches its own rubric`, () => {
        expect(matchesRubric(r.fact, r)).toBe(true)
      })
    }
  }

  it('case ids are unique', () => {
    const ids = [...CASES, ...CONVERSATION_CASES, ...HOLDOUT_CASES].map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('scoring', () => {
  const corr01 = CASES.find(c => c.id === 'corr-01')!

  it('passes a correct correction and fails when the old fact stays active', () => {
    const good = scoreMemories(corr01, [
      { content: "User's favorite color is green", status: 'active', valid_until: null },
      { content: "User's favorite color is blue", status: 'superseded', valid_until: null },
    ])
    expect(good.every(r => r.pass)).toBe(true)

    const bad = scoreMemories(corr01, [
      { content: "User's favorite color is green", status: 'active', valid_until: null },
      { content: "User's favorite color is blue", status: 'active', valid_until: null },
    ])
    expect(bad.find(r => r.kind === 'not_active')?.pass).toBe(false)
    expect(bad.find(r => r.kind === 'max_active')?.pass).toBe(false)
  })

  it('treats retrieving nothing as correct when nothing should be retrieved', () => {
    const probe = CASES.find(c => c.id === 'retrieval-02')!.probes![0]
    expect(scoreRetrieval(probe.query, [], probe).every(r => r.pass)).toBe(true)
    expect(scoreRetrieval(probe.query, ['User likes playing tennis'], probe).some(r => !r.pass)).toBe(true)
  })
})

describe('not_permanent', () => {
  const ash = CASES.find(c => c.id === 'ash-01')!
  const plan = "User is going to catch a legendary Pokémon today."
  const check = (valid_until: string | null) =>
    scoreMemories(ash, [{ content: plan, status: 'active', valid_until }]).find(r => r.kind === 'not_permanent')!

  it('passes when a plan for today has an end date, and fails when it is permanent', () => {
    expect(check('2026-10-16T23:59:59Z').pass).toBe(true)
    expect(check(null).pass).toBe(false)
  })
})
