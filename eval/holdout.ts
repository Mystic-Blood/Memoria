/**
 * HELD-OUT evaluation cases.
 *
 * Written on 2026-10-16 before the final round of prompt tuning, and deliberately never used while
 * tuning. Prompts were tuned against cases.ts (the development set); these cases are run once to
 * measure how well that tuning generalises. Do not edit them to make a run pass.
 */
import type { EvalCase } from './cases'

const NEG = ['hate', 'dislike', 'not', 'no longer', "n't", 'never', 'stopped', 'quit', 'gave up']
const PAST = ['former', 'previous', 'used to', 'no longer', "n't", 'was', 'switched', 'left', 'quit']

export const HOLDOUT_CASES: EvalCase[] = [
  {
    id: 'ho-clean-01', category: 'clean', description: 'Occupation stated plainly',
    turns: [{ role: 'user', text: "I'm a nurse at a children's hospital" }],
    expect: { stored: [{ fact: 'User is a nurse at a children\'s hospital', match: [['nurse']] }], max_active: 1 },
  },
  {
    id: 'ho-multi-01', category: 'multi_fact', description: 'Three facts with casual phrasing',
    turns: [{ role: 'user', text: 'fyi im vegetarian, i speak french, and my birthday is march 3rd' }],
    expect: {
      stored: [
        { fact: 'User is vegetarian', match: [['vegetarian']] },
        { fact: 'User speaks French', match: [['french']] },
        { fact: "User's birthday is March 3rd", match: [['birthday', 'born'], ['march']] },
      ],
      max_active: 3,
    },
  },
  {
    id: 'ho-multi-02', category: 'multi_fact', description: 'Tool preferences in one breath',
    turns: [{ role: 'user', text: 'i use a mechanical keyboard, prefer light theme, and always code in python' }],
    expect: {
      stored: [
        { fact: 'User uses a mechanical keyboard', match: [['mechanical keyboard']] },
        { fact: 'User prefers a light theme', match: [['light (theme|mode)']] },
        { fact: 'User codes in Python', match: [['python']] },
      ],
      max_active: 3,
    },
  },
  {
    id: 'ho-corr-01', category: 'correction', description: 'Changing a remembered number',
    seed_memories: ['User has 2 cats'],
    turns: [{ role: 'user', text: 'actually we adopted another one, so 3 cats now' }],
    expect: {
      stored: [{ fact: 'User has 3 cats', match: [['(3|three)\\b'], ['cat']] }],
      not_active: [{ fact: 'User has 2 cats', match: [['(2|two)\\b'], ['cat']], unless: [['(3|three)\\b']] }],
      max_active: 1,
    },
  },
  {
    id: 'ho-corr-02', category: 'correction', description: 'Quitting a habit',
    seed_memories: ['User smokes cigarettes'],
    turns: [{ role: 'user', text: 'i quit smoking last month!' }],
    expect: {
      stored: [{ fact: 'User quit smoking', match: [['smok'], NEG] }],
      not_active: [{ fact: 'User smokes cigarettes', match: [['smok']], unless: [NEG] }],
      max_active: 1,
    },
  },
  {
    id: 'ho-time-01', category: 'change_over_time', description: 'New employer',
    seed_memories: ['User works at a bank'],
    turns: [{ role: 'user', text: 'started at a startup this week, left the bank' }],
    expect: {
      stored: [{ fact: 'User works at a startup', match: [['startup']] }],
      not_active: [{ fact: 'User works at a bank', match: [['bank']], unless: [['startup', ...PAST]] }],
      max_active: 2,
    },
  },
  {
    id: 'ho-implicit-01', category: 'implicit_reference', description: 'One-word answer to a question',
    turns: [
      { role: 'assistant', text: 'What do you do for a living?' },
      { role: 'user', text: 'architect' },
    ],
    expect: { stored: [{ fact: 'User is an architect', match: [['architect']] }], max_active: 1 },
  },
  {
    id: 'ho-implicit-02', category: 'implicit_reference', description: '"She" refers to a person named earlier in the chat',
    turns: [
      { role: 'user', text: 'my daughter maya just started school' },
      { role: 'assistant', text: 'That is a big milestone! How is she finding it?' },
      { role: 'user', text: "she loves it, she's already obsessed with dinosaurs" },
    ],
    expect: {
      stored: [
        { fact: 'User has a daughter named Maya', match: [['daughter'], ['maya']] },
        { fact: 'Maya loves dinosaurs', match: [['dinosaur'], ['maya', 'daughter']] },
      ],
      not_stored: [{ fact: "She's obsessed with dinosaurs (unresolved)", match: [["she('s| is) (already )?obsessed"]] }],
    },
  },
  {
    id: 'ho-noise-01', category: 'noise', description: 'Venting about the day',
    turns: [{ role: 'user', text: 'ugh the train was late again and i forgot my umbrella' }],
    expect: { not_stored: [{ fact: 'Train was late / forgot umbrella', match: [['train', 'umbrella']] }], max_active: 0 },
  },
  {
    id: 'ho-noise-02', category: 'noise', description: 'Asking for a recommendation',
    turns: [{ role: 'user', text: 'can you recommend a good sci-fi book?' }],
    expect: { not_stored: [{ fact: 'User wants a sci-fi book', match: [['sci-fi', 'science fiction', 'book']] }], max_active: 0 },
  },
  {
    id: 'ho-noise-03', category: 'noise', description: "Someone else's preference",
    turns: [{ role: 'user', text: 'my coworker swears by standing desks' }],
    expect: { not_stored: [{ fact: 'User likes standing desks', match: [['standing desk']] }], max_active: 0 },
  },
  {
    id: 'ho-refine-01', category: 'refinement', description: 'Adding detail to a hobby',
    seed_memories: ['User plays the piano'],
    turns: [{ role: 'user', text: 'mostly jazz piano these days, i play at a bar on fridays' }],
    expect: { stored: [{ fact: 'User plays jazz piano', match: [['jazz']] }], max_active: 3 },
  },
  {
    id: 'ho-state-01', category: 'state_expiry', description: 'Short trip with an end',
    turns: [{ role: 'user', text: "i'm at a conference in berlin until wednesday" }],
    expect: {
      stored: [{ fact: 'User is at a conference in Berlin', match: [['berlin']] }],
      expires: [{ fact: 'Berlin trip is temporary', match: [['berlin']] }],
      max_active: 1,
    },
  },
  {
    id: 'ho-retrieval-01', category: 'retrieval_relevance', description: 'Pick the right memory out of several',
    seed_memories: ['User has a peanut allergy', 'User drives a Volvo', 'User supports Arsenal', 'User lives in Leeds', 'User is learning Japanese'],
    turns: [{ role: 'user', text: 'which football team do i support?' }],
    expect: { max_active: 5 },
    probes: [{
      query: 'which football team do i support?',
      should_retrieve: [{ fact: 'User supports Arsenal', match: [['arsenal']] }],
      should_not_retrieve: [{ fact: 'User has a peanut allergy', match: [['peanut']] }, { fact: 'User drives a Volvo', match: [['volvo']] }],
    }],
  },
  {
    id: 'ho-retrieval-02', category: 'retrieval_relevance', description: 'General knowledge question retrieves nothing',
    seed_memories: ['User is a nurse', 'User has two cats', 'User lives in Leeds'],
    turns: [{ role: 'user', text: 'how far is the moon from earth?' }],
    expect: { max_active: 3 },
    probes: [{
      query: 'how far is the moon from earth?',
      should_not_retrieve: [
        { fact: 'User is a nurse', match: [['nurse']] },
        { fact: 'User has two cats', match: [['cat']] },
        { fact: 'User lives in Leeds', match: [['leeds']] },
      ],
    }],
  },
]
