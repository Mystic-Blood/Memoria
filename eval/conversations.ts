/**
 * Realistic multi-turn conversations (development set), added 2026-10-16 after the owner's own chats
 * ("Jack", "Ash") showed the short single-message cases were too easy. Written before the extraction
 * work they are meant to measure, in the owner's style: casual, typos, facts spread across turns,
 * short answers, pronouns, corrections later on, plans, other people, hypotheticals, venting.
 */
import type { EvalCase } from './cases'

const NEG = ['hate', 'dislike', "don't like", 'does not like', "doesn't like", 'not a fan', 'no longer', 'stopped', 'quit', 'gave up', 'switched']

export const CONVERSATION_CASES: EvalCase[] = [
  {
    id: 'conv-intro-01', category: 'conversation', description: 'Introduction spread over several turns, with a past job',
    turns: [
      { role: 'user', text: 'hey im meera btw' },
      { role: 'assistant', text: 'Hi Meera! Nice to meet you. What do you do?' },
      { role: 'user', text: 'product manager at a fintech startup in bangalore' },
      { role: 'assistant', text: 'Sounds interesting! How long have you been there?' },
      { role: 'user', text: 'like 2 yrs. before that i was at flipkart' },
    ],
    expect: {
      stored: [
        { fact: "User's name is Meera", match: [['meera']] },
        { fact: 'User is a product manager at a fintech startup', match: [['product manager']] },
        { fact: 'User is based in Bangalore', match: [['bangalore', 'bengaluru']] },
      ],
      not_active: [{ fact: 'User currently works at Flipkart', match: [['flipkart']], unless: [['before', 'previous', 'former', 'used to', 'was', 'past']] }],
    },
    probes: [{ query: 'where do i work?', should_retrieve: [{ fact: 'product manager at a fintech startup', match: [['product manager', 'fintech']] }] }],
  },
  {
    id: 'conv-trip-01', category: 'conversation', description: 'A trip with a start and a length (should expire)',
    turns: [
      { role: 'user', text: 'flying to goa next tuesday for 5 days!!' },
      { role: 'assistant', text: 'How fun! Is it a holiday or for work?' },
      { role: 'user', text: 'holiday, finally. my sister is coming too' },
    ],
    expect: {
      stored: [{ fact: 'User is going to Goa', match: [['goa']] }],
      expires: [{ fact: 'The Goa trip is temporary', match: [['goa']] }],
    },
  },
  {
    id: 'conv-correction-01', category: 'conversation', description: 'Correcting a number several turns later',
    turns: [
      { role: 'user', text: 'my daughter is 6 and obsessed with drawing' },
      { role: 'assistant', text: 'That is a lovely age! What does she like to draw?' },
      { role: 'user', text: 'mostly cats lol' },
      { role: 'assistant', text: 'Cats are a classic subject!' },
      { role: 'user', text: 'oh wait sorry shes actually 7 now, just had her birthday' },
    ],
    expect: {
      stored: [
        { fact: "User's daughter is 7", match: [['daughter'], ['7', 'seven']] },
        { fact: "User's daughter loves drawing", match: [['draw']] },
      ],
      not_active: [{ fact: "User's daughter is 6", match: [['daughter'], ['6', 'six']], unless: [['7', 'seven']] }],
    },
  },
  {
    id: 'conv-preference-change-01', category: 'conversation', description: 'A preference that changed some time ago',
    turns: [{ role: 'user', text: 'i used to drink like 4 coffees a day but switched to green tea a few months back' }],
    expect: {
      stored: [{ fact: 'User drinks green tea', match: [['green tea']] }],
      not_active: [{ fact: 'User drinks a lot of coffee', match: [['coffee']], unless: [['used to', 'switched', 'no longer', 'former', 'stopped', 'instead', 'green tea']] }],
    },
  },
  {
    id: 'conv-venting-01', category: 'conversation', description: 'Venting with one lasting fact at the end',
    turns: [
      { role: 'user', text: 'ugh traffic was insane today and it rained the whole way' },
      { role: 'assistant', text: 'That sounds exhausting. Want to talk about something fun?' },
      { role: 'user', text: 'tell me a joke' },
      { role: 'assistant', text: 'Why did the scarecrow win an award? Because he was outstanding in his field!' },
      { role: 'user', text: 'lol ok. anyway im vegetarian so suggest me a dinner idea' },
    ],
    expect: {
      stored: [{ fact: 'User is vegetarian', match: [['vegetarian']] }],
      not_stored: [
        { fact: 'Traffic was bad / it rained', match: [['traffic', 'rain']] },
        { fact: 'User asked for a joke', match: [['joke']] },
      ],
    },
  },
  {
    id: 'conv-third-party-01', category: 'conversation', description: "A friend's news next to the user's own situation",
    turns: [{ role: 'user', text: 'my friend rahul just got a job at google, im so jealous lol. still job hunting myself' }],
    expect: {
      stored: [{ fact: 'User is job hunting', match: [['job hunt', 'looking for (a )?(new )?job', 'searching for (a )?job', 'job search']] }],
      not_stored: [{ fact: 'User works at Google', match: [['google']], unless: [['rahul', 'friend']] }],
    },
  },
  {
    id: 'conv-pronoun-01', category: 'conversation', description: 'Details about "it" spread over turns',
    turns: [
      { role: 'user', text: 'got a new bike last week' },
      { role: 'assistant', text: 'Nice! What kind of bike?' },
      { role: 'user', text: 'royal enfield classic 350, matte black' },
      { role: 'assistant', text: 'A classic choice. Do you ride it much?' },
      { role: 'user', text: 'yeah i ride it to work every day' },
    ],
    expect: {
      stored: [
        { fact: 'User owns a Royal Enfield Classic 350', match: [['royal enfield', 'classic 350']] },
        { fact: 'User rides the bike to work every day', match: [['ride', 'commute'], ['work']] },
      ],
      not_stored: [{ fact: 'User rides it to work (unresolved "it")', match: [['it to work', 'rides it\\b']] }],
    },
  },
  {
    id: 'conv-injury-01', category: 'conversation', description: 'A temporary health situation with a duration',
    turns: [
      { role: 'user', text: 'pulled a muscle in my back at the gym' },
      { role: 'assistant', text: 'Ouch, sorry to hear that. Have you seen a doctor?' },
      { role: 'user', text: 'yeah doc said no lifting for 2 weeks' },
    ],
    expect: {
      stored: [{ fact: 'User has a back injury / cannot lift', match: [['back', 'lift']] }],
      expires: [{ fact: 'The back injury is temporary', match: [['back', 'lift']] }],
    },
  },
  {
    id: 'conv-hypothetical-mixed-01', category: 'conversation', description: 'A daydream next to a real plan',
    turns: [{ role: 'user', text: "if i won the lottery i'd buy a farm in the hills. realistically tho im saving up for a flat in pune" }],
    expect: {
      stored: [{ fact: 'User is saving for a flat in Pune', match: [['pune'], ['flat', 'apartment', 'saving']] }],
      not_stored: [{ fact: 'User wants to buy a farm', match: [['farm', 'lottery']] }],
    },
  },
  {
    id: 'conv-roleplay-01', category: 'conversation', description: 'Asking the assistant to play a role while sharing real goals',
    turns: [
      { role: 'user', text: "be my running coach ok? i'm training for a 10k race in december" },
      { role: 'assistant', text: 'Happy to! How much are you running right now?' },
      { role: 'user', text: 'about 15 km a week, mostly slow' },
    ],
    expect: {
      stored: [
        { fact: 'User is training for a 10k race in December', match: [['10 ?k'], ['december', 'race']] },
        { fact: 'User runs about 15 km a week', match: [['15']] },
      ],
      not_stored: [{ fact: 'The assistant is the user\'s coach', match: [['assistant', 'memoria']] }],
    },
  },
  {
    id: 'conv-short-answer-01', category: 'conversation', description: 'Short answer that only makes sense with the question',
    turns: [
      { role: 'assistant', text: 'Do you have any pets?' },
      { role: 'user', text: 'two. a beagle and a cat' },
    ],
    expect: {
      stored: [
        { fact: 'User has a beagle', match: [['beagle']] },
        { fact: 'User has a cat', match: [['cat']] },
      ],
    },
    probes: [{ query: 'what pets do i have?', should_retrieve: [{ fact: 'User has a beagle', match: [['beagle']] }] }],
  },
  {
    id: 'conv-typos-01', category: 'conversation', description: 'Heavy typos, a like and a dislike',
    turns: [{ role: 'user', text: 'ma fav food is biriyani nd i hate brinjal lol' }],
    expect: {
      stored: [
        { fact: "User's favorite food is biryani", match: [['biri?yani']] },
        { fact: 'User dislikes brinjal', match: [['brinjal', 'eggplant', 'aubergine'], NEG] },
      ],
      not_active: [{ fact: 'User likes brinjal', match: [['brinjal', 'eggplant', 'aubergine']], unless: [NEG] }],
    },
  },
  // From the owner's 2026-10-16 test chat: a second name became a second active "name" memory,
  // requests to the assistant were stored as facts about the user, and a typo was stored verbatim.
  {
    id: 'conv-name-change-01', category: 'conversation', description: 'A different name when one is already known',
    seed_memories: ["User's name is Priya."],
    turns: [{ role: 'user', text: 'hi there, my name is Meera and I teach chemistry' }],
    expect: {
      stored: [{ fact: 'User teaches chemistry', match: [['chemistry']] }],
      // Either the new name replaces the old one or waits for review (pending): two active memories.
      // Two active names plus the job would be three.
      max_active: 2,
    },
  },
  {
    id: 'conv-assistant-task-01', category: 'conversation', description: 'Asking for help with a task is not a fact about the user',
    turns: [
      { role: 'user', text: 'can u help me sort out a weekend getaway somewhere close by' },
      { role: 'assistant', text: 'Sure! What kind of place do you enjoy?' },
      { role: 'user', text: 'idk somewhere with lakes. gimme your top 3' },
      { role: 'assistant', text: 'Here are a few lakeside spots you could reach in a couple of hours.' },
      { role: 'user', text: 'nah forget that, what about a beach' },
    ],
    expect: {
      not_stored: [
        { fact: 'User wants help with a getaway', match: [['help', 'getaway', 'wants to (visit|go)']] },
        { fact: 'User wants a top 3 list', match: [['top 3', 'lakes?']] },
      ],
      max_active: 1,
    },
  },
  {
    id: 'conv-typo-fix-01', category: 'conversation', description: 'Obvious typos are corrected in the stored memory',
    turns: [{ role: 'user', text: 'my fav drink is a strawbery smoothy' }],
    expect: { stored: [{ fact: "User's favorite drink is a strawberry smoothie", match: [['strawberry smoothie']] }], max_active: 1 },
  },
]
