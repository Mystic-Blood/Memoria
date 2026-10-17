/**
 * Memoria evaluation cases.
 *
 * Scoring is deterministic: every expected fact carries a human-written keyword rubric, so a run is
 * reproducible and auditable, and no model grades another model.
 *
 *   match:  every group must match; a group matches if ANY of its patterns matches.
 *           Patterns are case-insensitive regex sources anchored at a word start (\b is prepended).
 *   unless: optional; if any group here matches, the memory does NOT count as matching. Used so that
 *           e.g. "favorite color changed from blue to green" is not read as "favorite color is blue".
 *
 * Limitation (by design, reported with every run): unusual phrasings can fail a rubric that a human
 * would accept. Every stored memory is saved in the report so scores can be audited.
 */

export type Pattern = string
export type Rubric = { fact: string; match: Pattern[][]; unless?: Pattern[][] }

export type EvalCase = {
  id: string
  category: string
  description: string
  seed_memories?: string[]
  turns: Array<{ role: 'user' | 'assistant'; text: string }>
  expect: {
    /** Each must match at least one ACTIVE memory. */
    stored?: Rubric[]
    /** No ACTIVE memory may match. */
    not_active?: Rubric[]
    /** No ACTIVE or PENDING memory may match (things that should never be remembered). */
    not_stored?: Rubric[]
    /** Each must match an ACTIVE memory that has an expiry (valid_until) set. */
    expires?: Rubric[]
    /** No ACTIVE memory WITHOUT an expiry may match (temporary things must not become permanent). */
    not_permanent?: Rubric[]
    /** Upper bound on ACTIVE memories after the conversation (seeds included). */
    max_active?: number
  }
  probes?: Array<{ query: string; should_retrieve?: Rubric[]; should_not_retrieve?: Rubric[] }>
}

const NEGATION = ["hate", "dislike", "not", "no longer", "n't", "never", "stopped"]
const PAST = ["former", "previous", "used to", "no longer", "n't", "was", "switched", "moved", "graduat"]

export const CASES: EvalCase[] = [
  // ---------------------------------------------------------------- clean
  {
    id: 'clean-01', category: 'clean', description: 'Simple single fact statement',
    turns: [{ role: 'user', text: 'i am allergic to peanuts.' }],
    expect: { stored: [{ fact: 'User is allergic to peanuts', match: [['allerg'], ['peanut']] }], max_active: 1 },
  },
  {
    id: 'clean-02', category: 'clean', description: 'Simple preference',
    turns: [{ role: 'user', text: 'my favorite color is blue' }],
    expect: { stored: [{ fact: "User's favorite color is blue", match: [['blue'], ['colou?r']] }], max_active: 1 },
  },
  {
    id: 'clean-03', category: 'clean', description: 'Simple fact with slang',
    turns: [{ role: 'user', text: "my dog is named rusty and he's a good boi" }],
    expect: {
      stored: [{ fact: 'User has a dog named Rusty', match: [['dog'], ['rusty']] }],
      not_stored: [{ fact: "He's a good boi (without saying who)", match: [['good bo(i|y)']], unless: [['rusty', 'dog']] }],
      max_active: 2,
    },
  },

  // ----------------------------------------------------------- correction
  {
    id: 'corr-01', category: 'correction', description: 'Correcting a previously stated fact explicitly',
    seed_memories: ["User's favorite color is blue"],
    turns: [{ role: 'user', text: 'actually my favorite color is green now' }],
    expect: {
      stored: [{ fact: "User's favorite color is green", match: [['green'], ['colou?r']] }],
      not_active: [{ fact: "User's favorite color is blue", match: [['blue']], unless: [['green']] }],
      max_active: 1,
    },
    probes: [{
      query: 'what is my favorite color?',
      should_retrieve: [{ fact: 'favorite color is green', match: [['green']] }],
      should_not_retrieve: [{ fact: 'favorite color is blue', match: [['blue']], unless: [['green']] }],
    }],
  },
  {
    id: 'corr-02', category: 'correction', description: 'Changed mind about a preference without naming the subject',
    seed_memories: ['User loves eating sushi'],
    turns: [{ role: 'user', text: 'actually i hate it now. bad experience.' }],
    expect: {
      stored: [{ fact: 'User hates sushi', match: [['sushi'], NEGATION] }],
      not_active: [{ fact: 'User loves eating sushi', match: [['sushi'], ['love', 'like', 'enjoy']], unless: [NEGATION] }],
      not_stored: [{ fact: 'User had a bad experience (no subject)', match: [['bad experience']], unless: [['sushi']] }],
      max_active: 2,
    },
  },
  {
    id: 'corr-03', category: 'correction', description: "Correcting an entity's attribute",
    seed_memories: ["User's brother is 25 years old"],
    turns: [{ role: 'user', text: 'wait i meant my brother is 26, sorry.' }],
    expect: {
      stored: [{ fact: "User's brother is 26 years old", match: [['brother'], ['26']] }],
      not_active: [{ fact: "User's brother is 25 years old", match: [['brother'], ['25']], unless: [['26']] }],
      max_active: 1,
    },
  },
  {
    id: 'corr-04', category: 'correction', description: 'Self-correction in the same message',
    turns: [{ role: 'user', text: 'I drive a honda, wait no, I drive a toyota.' }],
    expect: {
      stored: [{ fact: 'User drives a Toyota', match: [['toyota']] }],
      not_active: [{ fact: 'User drives a Honda', match: [['honda']], unless: [['toyota']] }],
      max_active: 1,
    },
  },
  {
    id: 'corr-05', category: 'correction', description: 'Implicit negation of a previous fact',
    seed_memories: ['User works at Google'],
    turns: [{ role: 'user', text: "i don't work there anymore, im at microsoft now" }],
    expect: {
      stored: [{ fact: 'User works at Microsoft', match: [['microsoft']] }],
      not_active: [{ fact: 'User works at Google', match: [['google']], unless: [['microsoft', ...PAST]] }],
      max_active: 2,
    },
  },

  // ---------------------------------------------------- change over time
  {
    id: 'time-01', category: 'change_over_time', description: 'Moving to a new city',
    seed_memories: ['User lives in New York'],
    turns: [{ role: 'user', text: 'i just moved to chicago!' }],
    expect: {
      stored: [{ fact: 'User lives in Chicago', match: [['chicago']] }],
      not_active: [{ fact: 'User lives in New York', match: [['new york', 'nyc']], unless: [['chicago']] }],
      max_active: 1,
    },
  },
  {
    id: 'time-02', category: 'change_over_time', description: 'New job replacing being a student',
    seed_memories: ['User is a student at MIT'],
    turns: [{ role: 'user', text: 'I graduated and just started working as a data scientist at Amazon.' }],
    expect: {
      stored: [
        { fact: 'User graduated from MIT', match: [['graduat']] },
        { fact: 'User works as a data scientist at Amazon', match: [['data scien'], ['amazon']] },
      ],
      not_active: [{ fact: 'User is a student at MIT', match: [['student']], unless: [PAST] }],
      max_active: 3,
    },
  },
  {
    id: 'time-03', category: 'change_over_time', description: 'Switching phones',
    seed_memories: ['User uses an Android phone'],
    turns: [{ role: 'user', text: 'i finally switched to iphone yesterday' }],
    expect: {
      stored: [{ fact: 'User uses an iPhone', match: [['iphone']] }],
      not_active: [{ fact: 'User uses an Android phone', match: [['android']], unless: [['iphone', ...PAST]] }],
      max_active: 1,
    },
  },

  // ------------------------------------------------- implicit reference
  {
    id: 'implicit-01', category: 'implicit_reference', description: "Short answer to the assistant's question",
    turns: [
      { role: 'assistant', text: 'Where do you currently live?' },
      { role: 'user', text: 'seattle.' },
    ],
    expect: {
      stored: [{ fact: 'User lives in Seattle', match: [['seattle'], ['live', 'living', 'resid', 'based', 'home']] }],
      max_active: 1,
    },
    probes: [{ query: 'where do i live?', should_retrieve: [{ fact: 'lives in Seattle', match: [['seattle']] }] }],
  },
  {
    id: 'implicit-02', category: 'implicit_reference', description: 'Referring back to a topic from a previous turn',
    turns: [
      { role: 'user', text: "let's talk about my project called Phoenix" },
      { role: 'assistant', text: 'Sounds good, what is project Phoenix about?' },
      { role: 'user', text: "it's a new database migration tool." },
    ],
    expect: {
      stored: [{ fact: 'Project Phoenix is a database migration tool', match: [['phoenix'], ['database', 'migration']] }],
      max_active: 2,
    },
  },
  {
    id: 'implicit-03', category: 'implicit_reference', description: 'Pronoun referring to a remembered dog',
    seed_memories: ['User has a dog named Rover'],
    turns: [{ role: 'user', text: 'he is a golden retriever btw' }],
    expect: {
      stored: [{ fact: "User's dog Rover is a golden retriever", match: [['golden retriever'], ['rover', 'dog']] }],
      not_stored: [{ fact: 'He is a golden retriever (unresolved pronoun)', match: [["he( is|'s) a golden"]] }],
      max_active: 2,
    },
  },

  // ----------------------------------------------------------- long/messy
  {
    id: 'long-01', category: 'long_messy', description: 'Rambling paragraph with one durable fact',
    turns: [{ role: 'user', text: "man today was so crazy. i woke up late, spilled coffee on my shirt, missed the bus. oh and i finally decided that i'm allergic to dairy, got tested yesterday. anyway, then i had to walk in the rain." }],
    expect: {
      stored: [{ fact: 'User is allergic to dairy', match: [['allerg', 'intoleran'], ['dairy', 'lactose', 'milk']] }],
      not_stored: [
        { fact: 'User spilled coffee', match: [['coffee']] },
        { fact: 'User missed the bus', match: [['bus']] },
        { fact: 'User walked in the rain', match: [['rain']] },
      ],
      max_active: 1,
    },
  },
  {
    id: 'long-02', category: 'long_messy', description: 'Long tech discussion with one real preference',
    turns: [{ role: 'user', text: "I've been looking into different cloud providers lately. AWS has so many services but it's overwhelming. GCP is okay but I don't love the UI. I think for my personal projects, I always use Vercel because it's just so much simpler and I don't have to manage infra." }],
    expect: {
      stored: [{ fact: 'User always uses Vercel for personal projects', match: [['vercel']] }],
      not_stored: [
        { fact: 'AWS is overwhelming', match: [['aws'], ['overwhelm']] },
        { fact: 'GCP is okay', match: [['gcp', 'google cloud']], unless: [['vercel']] },
      ],
      max_active: 2,
    },
  },
  {
    id: 'long-03', category: 'long_messy', description: 'Stream of consciousness with a family fact',
    turns: [{ role: 'user', text: "so i was talking to my sister emily yesterday about the upcoming holidays and we were wondering if we should do thanksgiving at her place or mine, but her house is bigger so maybe there." }],
    expect: {
      stored: [{ fact: 'User has a sister named Emily', match: [['sister'], ['emily']] }],
      not_stored: [{ fact: "They might do thanksgiving at Emily's place", match: [['thanksgiving']] }],
      max_active: 2,
    },
  },

  // ----------------------------------------------------------- multi-fact
  {
    id: 'multi-01', category: 'multi_fact', description: 'Three distinct facts in one message',
    turns: [{ role: 'user', text: 'im a software engineer, i live in boston, and i love hiking' }],
    expect: {
      stored: [
        { fact: 'User is a software engineer', match: [['software engineer', 'software developer']] },
        { fact: 'User lives in Boston', match: [['boston']] },
        { fact: 'User loves hiking', match: [['hik']] },
      ],
      max_active: 3,
    },
  },
  {
    id: 'multi-02', category: 'multi_fact', description: 'Two related facts',
    turns: [{ role: 'user', text: 'my wife is sarah and we have 2 kids' }],
    expect: {
      stored: [
        { fact: "User's wife is named Sarah", match: [['wife'], ['sarah']] },
        { fact: 'User has 2 kids', match: [['(2|two)\\b'], ['kid', 'child']] },
      ],
      max_active: 2,
    },
  },
  {
    id: 'multi-03', category: 'multi_fact', description: 'Three preferences',
    turns: [{ role: 'user', text: 'i prefer dark mode, vim over emacs, and tabs instead of spaces' }],
    expect: {
      stored: [
        { fact: 'User prefers dark mode', match: [['dark (mode|theme)']] },
        { fact: 'User prefers vim over emacs', match: [['vim']] },
        { fact: 'User prefers tabs over spaces', match: [['tabs?\\b']] },
      ],
      max_active: 3,
    },
  },
  {
    id: 'multi-04', category: 'multi_fact', description: 'Project details',
    turns: [{ role: 'user', text: 'working on project alpha. the deadline is nov 1st. it uses react.' }],
    expect: {
      stored: [
        { fact: 'User is working on Project Alpha', match: [['alpha']] },
        { fact: 'Project Alpha deadline is Nov 1st', match: [['deadline', 'due'], ['nov']] },
        { fact: 'Project Alpha uses React', match: [['react']] },
      ],
      max_active: 3,
    },
  },

  // ---------------------------------------------------------------- noise
  {
    id: 'noise-01', category: 'noise', description: 'Small talk and transient state',
    turns: [{ role: 'user', text: "hello! i'm feeling so tired today. how are you?" }],
    expect: {
      not_stored: [
        { fact: 'User is tired', match: [['tired']] },
        { fact: 'User says hello', match: [['hello', 'greet']] },
      ],
      max_active: 0,
    },
  },
  {
    id: 'noise-02', category: 'noise', description: 'Question seeking information',
    turns: [{ role: 'user', text: 'do you know what the weather will be like tomorrow?' }],
    expect: { not_stored: [{ fact: 'User wants to know the weather', match: [['weather']] }], max_active: 0 },
  },
  {
    id: 'noise-03', category: 'noise', description: 'Hypothetical scenario',
    turns: [{ role: 'user', text: 'if i were a millionaire, i would buy a boat' }],
    expect: {
      not_stored: [{ fact: 'User would buy a boat', match: [['boat', 'millionaire']] }],
      max_active: 0,
    },
  },
  {
    id: 'noise-04', category: 'noise', description: 'Quoting someone else',
    turns: [{ role: 'user', text: "my friend john said 'i am moving to paris'" }],
    expect: {
      not_stored: [{ fact: 'User (or John) is moving to Paris', match: [['paris']] }],
      max_active: 1,
    },
    probes: [{ query: 'where am i moving?', should_not_retrieve: [{ fact: 'moving to Paris', match: [['paris']] }] }],
  },

  // ----------------------------------------------------------- refinement
  {
    id: 'refine-01', category: 'refinement', description: 'Narrowing a preference',
    seed_memories: ['User likes coffee'],
    turns: [{ role: 'user', text: 'fyi i only like black coffee, no sugar' }],
    expect: { stored: [{ fact: 'User only likes black coffee with no sugar', match: [['black'], ['coffee']] }], max_active: 2 },
  },
  {
    id: 'refine-02', category: 'refinement', description: 'Adding detail to a project',
    seed_memories: ['User is working on Project Alpha'],
    turns: [{ role: 'user', text: 'Project Alpha is a new social media app btw' }],
    expect: { stored: [{ fact: 'Project Alpha is a social media app', match: [['alpha'], ['social']] }], max_active: 2 },
  },
  {
    id: 'refine-03', category: 'refinement', description: 'Adding a condition to a fact',
    seed_memories: ['User goes to the gym on mondays'],
    turns: [{ role: 'user', text: "I only go to the gym on mondays if it's raining" }],
    expect: { stored: [{ fact: 'User goes to the gym on Mondays only if it rains', match: [['gym'], ['rain']] }], max_active: 2 },
  },

  // ---------------------------------------------------- retrieval relevance
  {
    id: 'retrieval-01', category: 'retrieval_relevance', description: 'Retrieve only the relevant memory out of many',
    seed_memories: ['User likes pizza', 'User works as a plumber', 'User lives in Texas', 'User has a cat named Whiskers', 'User speaks Spanish fluently', "User's favorite movie is The Matrix", 'User studied history in college', 'User drives a Ford F150'],
    turns: [{ role: 'user', text: 'what kind of pet do i have?' }],
    expect: {
      not_stored: [{ fact: 'User asks about their pet', match: [['asks?\\b', 'asking', 'wants to know', 'wondering']] }],
      max_active: 8,
    },
    probes: [
      {
        query: 'what kind of pet do i have?',
        should_retrieve: [{ fact: 'User has a cat named Whiskers', match: [['cat', 'whiskers']] }],
        should_not_retrieve: [{ fact: 'User likes pizza', match: [['pizza']] }, { fact: 'User drives a Ford F150', match: [['ford', 'f-?150']] }],
      },
      {
        query: 'what language do i speak?',
        should_retrieve: [{ fact: 'User speaks Spanish fluently', match: [['spanish']] }],
        should_not_retrieve: [{ fact: 'User works as a plumber', match: [['plumber']] }, { fact: 'User studied history', match: [['history']] }],
      },
    ],
  },
  {
    id: 'retrieval-02', category: 'retrieval_relevance', description: 'Query unrelated to every stored memory (should retrieve nothing)',
    seed_memories: ['User is 30 years old', 'User likes playing tennis', "User's mother is named Susan", 'User is allergic to penicillin'],
    turns: [{ role: 'user', text: 'what is the capital of France?' }],
    expect: {
      not_stored: [{ fact: 'User wants to know the capital of France', match: [['capital', 'france']] }],
      max_active: 4,
    },
    probes: [{
      query: 'what is the capital of France?',
      should_not_retrieve: [
        { fact: 'User is 30 years old', match: [['30']] },
        { fact: 'User likes playing tennis', match: [['tennis']] },
        { fact: "User's mother is named Susan", match: [['susan']] },
        { fact: 'User is allergic to penicillin', match: [['penicillin']] },
      ],
    }],
  },

  // -------------------------------------------------------- state expiry
  {
    id: 'state-01', category: 'state_expiry', description: 'Temporary travel fact gets an end date',
    turns: [{ role: 'user', text: 'im visiting tokyo until next friday' }],
    expect: {
      stored: [{ fact: 'User is visiting Tokyo', match: [['tokyo']] }],
      expires: [{ fact: 'Tokyo visit ends next Friday', match: [['tokyo']] }],
      max_active: 1,
    },
  },
  {
    id: 'state-02', category: 'state_expiry', description: 'Temporary health condition gets an end date',
    turns: [{ role: 'user', text: "i am super sick with the flu this week, can't work" }],
    expect: {
      stored: [{ fact: 'User is sick with the flu this week', match: [['flu', 'sick', 'ill\\b']] }],
      expires: [{ fact: 'Flu is temporary', match: [['flu', 'sick', 'ill\\b']] }],
      max_active: 1,
    },
  },

  // ---------------------------------------------- real user conversation
  {
    id: 'jack-01', category: 'real_conversation', description: "The owner's own test conversation (2026-10-16): typos, many facts, a contradiction, recall later",
    turns: [
      { role: 'user', text: 'hello my name is jack. I love bananas' },
      { role: 'assistant', text: 'Hey Jack! Nice to meet you! Bananas are definitely a popular snack. Do you have a favorite way of enjoying them?' },
      { role: 'user', text: 'i like the mango smoothies very much and even strawbeery too' },
      { role: 'assistant', text: 'Mango and strawberry smoothies sound delicious! Have you ever tried combining banana, mango, and strawberry?' },
      { role: 'user', text: 'nah i dont know if the combianon will give waht taste' },
      { role: 'assistant', text: "That's totally understandable, Jack! It's okay to stick with what you know and love." },
      { role: 'user', text: 'btw u know i own a mansion in saudi arabia . I even have a private jet worth 5 million dollar' },
      { role: 'assistant', text: 'Wow, Jack! Owning a mansion in Saudi Arabia and a private jet worth 5 million dollars sounds impressive!' },
      { role: 'user', text: 'yeah i know i have been to 21 differnt countires by now' },
      { role: 'assistant', text: 'Traveling to 21 different countries must have been an incredible experience!' },
      { role: 'user', text: 'but i hate strawberries' },
    ],
    expect: {
      stored: [
        { fact: "User's name is Jack", match: [['jack'], ['name', 'called']] },
        { fact: 'User loves bananas', match: [['banana']] },
        { fact: 'User likes mango smoothies', match: [['mango']] },
        { fact: 'User owns a mansion in Saudi Arabia', match: [['mansion'], ['saudi']] },
        { fact: 'User owns a private jet worth $5 million', match: [['jet'], ['5', 'five']] },
        { fact: 'User has visited 21 countries', match: [['21', 'twenty-one'], ['countr']] },
        { fact: 'User hates strawberries', match: [['strawberr'], NEGATION] },
      ],
      not_active: [{ fact: 'User likes strawberries', match: [['strawberr']], unless: [NEGATION] }],
    },
    probes: [
      {
        query: "what's my name and how much did my private jet cost?",
        should_retrieve: [
          { fact: "User's name is Jack", match: [['jack']] },
          { fact: 'Private jet worth $5 million', match: [['jet']] },
        ],
      },
      {
        query: 'which fruit do i hate?',
        should_retrieve: [{ fact: 'User hates strawberries', match: [['strawberr'], NEGATION] }],
      },
    ],
  },
  {
    id: 'ash-01', category: 'real_conversation', description: "The owner's second test conversation (2026-10-16): facts spread over turns, a plan for today; v2 once merged them into one run-on memory",
    turns: [
      { role: 'user', text: 'i m ash and i m a pokemon master' },
      { role: 'assistant', text: "Hello Ash! It's great to meet a Pokémon master. How can I assist you today?" },
      { role: 'user', text: 'we gonna catch a legendary pokemon today' },
      { role: 'assistant', text: "Sounds exciting! Which legendary Pokémon are you planning to catch, and what's your strategy?" },
      { role: 'user', text: 'i heard we can see lugia and darkari fight near my school playground' },
      { role: 'assistant', text: 'That sounds thrilling! What time and where exactly is this supposed to happen?' },
      { role: 'user', text: 'around 5 pm today we gonna catch the exhausted pokemon in the end' },
      { role: 'assistant', text: "Got it! Around 5 PM, you'll be catching the exhausted Pokémon after the battle. Have a great time!" },
      { role: 'user', text: 'woah i caught a pikachu in the journey' },
    ],
    expect: {
      stored: [
        { fact: "User's name is Ash", match: [['ash'], ['name', 'called']] },
        { fact: 'User is a Pokémon master', match: [['pok[eé]mon master']] },
        { fact: 'User caught a Pikachu', match: [['pikachu']] },
      ],
      not_active: [
        { fact: 'One run-on memory mixing "Pokémon master" with the plan for today', match: [['master'], ['today', 'legendary', 'lugia', 'darkrai']] },
      ],
      not_permanent: [{ fact: "Today's plan to catch a legendary Pokémon", match: [['legendary', 'lugia', 'darkrai', '5 ?pm']], unless: [['caught']] }],
    },
    probes: [{ query: "what's my name?", should_retrieve: [{ fact: "User's name is Ash", match: [['ash']] }] }],
  },
]
