# Memoria

**A chat assistant whose long-term memory you can watch, question and correct.**

Most assistants decide silently what to remember about you. Memoria shows it: as you chat, a panel
next to the conversation fills in live with every memory it creates, updates or retires, and when
something you say contradicts what it remembers, it asks you which is right instead of guessing.
Every memory links to the message it came from and its full before/after history.

It runs on your own machine with local models (Ollama): what you tell it is never sent to an AI
provider. (A Gemini or OpenAI key can optionally be used instead; it is off by default.)

> Demo video: _coming soon_

## How it works

```
 you ──► /api/chat ──► find relevant memories (vector search, similarity ≥ 0.6)
                  └──► stream the reply (memories given as background notes, not instructions)
                  └──► in the background, after the reply:
                         1. extract   facts from your message (+ last 6 turns, today's date,
                                      related stored memories to resolve "it" / "he")
                         2. recall    similar existing memories
                         3. propose   the model picks one action: skip | add | update | replace | conflict
                         4. guard     plain code validates the proposal (the model never writes directly)
                         5. apply     one atomic Postgres function makes the change and logs an event
                                      └──► Supabase Realtime ──► live memory panel
```

- **Database rules, not app rules.** Users can only read their memories; every change goes through
  a `SECURITY DEFINER` function that checks ownership and appends to an event history. 23 rules are
  verified through the real API by `scripts/db-security-check.mjs`.
- **Failures are visible.** Every processed message gets a `memory_runs` row (ok, failed with a reason,
  or skipped). The UI shows "memory update failed" instead of quietly remembering nothing.
- **You see recall too.** Each reply lists the memories it was given ("Used 1 memory"), so the loop is
  visible in both directions: what was saved, and what was used.
- **You stay in control.** Conflicts wait for your decision; you can edit, delete, or pause memory, and erase a memory with its history for good.

The reasoning behind each choice, with the evidence and the alternatives that were rejected, is in
[docs/DECISIONS.md](docs/DECISIONS.md).

## Results

Measured with a deterministic harness (human-written keyword rubrics, real database, no model
grading another model). Full reports with every stored memory are in [`eval/results/`](eval/results/).

| | cases | checks |
|---|---|---|
| Original engine (v1), development set (33 cases) | 6/33 | 51% |
| **Rebuilt engine (v2), same 33 cases** | **27/33** | **92%** |
| **Rebuilt engine (v2), full development set** (46 cases, incl. 12 multi-turn conversations) | **37/46** | **92%** |
| **Rebuilt engine (v2), held-out set**, written before final tuning | **14/15** | **98%** |

Biggest gains: corrections now retire the old fact (2/9 → 9/9), short answers and pronouns resolve
from context, multiple facts per message are kept, and unrelated questions no longer pull in every
memory (retrieval relevance 0/10 → 9/10). The held-out set is easier on average than the development
set, and it has been run twice; see [DECISIONS.md](docs/DECISIONS.md#4-measure-before-changing-anything)
for what that does and does not show, and for the known limitations. All v2 numbers are from one
commit (`5e8eadb`) with a local 7B model (qwen2.5:7b-instruct on a 6 GB GPU).

Local model: **qwen2.5:7b-instruct**, chosen from an 8-model race on an RTX 3060 (6 GB)
([report](eval/results/2026-10-16T11-26-16-model-race/report.md)).

## How this compares

Long-term memory for assistants is an established area, and Memoria is a learning and portfolio
project, not a replacement for these tools. As described in their public docs (October 2026):

| | What it is | What it does better than Memoria |
|---|---|---|
| [mem0](https://docs.mem0.ai) | The most widely used open-source memory layer: a model extracts facts from conversations and the library maintains them | Maturity, integrations with agent frameworks, a hosted platform, scale |
| [Zep / Graphiti](https://blog.getzep.com/beyond-static-knowledge-graphs/) | A temporal knowledge graph: facts are edges with validity times, and a contradicted fact is marked invalid rather than deleted | Relationships between facts, reasoning over time, much larger histories |
| [Letta](https://docs.letta.com/guides/ade/core-memory) (formerly MemGPT) | Agents that edit their own memory blocks with tools; developers can inspect and edit them | Agent architecture, multi-agent shared memory, developer tooling |
| ChatGPT / Claude memory | Built-in memory in consumer assistants, which users can view and delete | Polish, and models far larger than a local 7B |

What Memoria does deliberately differently:

- **The end user decides contradictions.** When a new message contradicts what is remembered and
  it is not a clear correction, nothing is overwritten: both versions wait in "Needs your review".
- **Every memory has a history the user can read**: what created it, each change and the reason,
  and what replaced it. Erase removes a memory and its history completely.
- **The model proposes, code decides.** Merges, replacements and conflicts are checked by
  deterministic rules (similarity thresholds, one active name, same-day plans expire) before anything
  is written, and every write goes through one database function that also records the event.
- **Measured, with the failures published.** A fixed test set scored by keyword rubrics, a held-out
  set, before/after numbers and a list of known limitations ([DECISIONS.md](docs/DECISIONS.md)).

## Stack

Next.js 16 (App Router) · Supabase (Postgres, pgvector, Auth, Row-Level Security, Realtime) ·
Vercel AI SDK v7 · Ollama (local) or Google Gemini / OpenAI · Vitest · GitHub Actions

## Running it on your machine

**You need:** Node 22+, [Ollama](https://ollama.com), and a free [Supabase](https://supabase.com)
project (the database and sign-in; the free tier is enough). The local model needs about 5 GB:
an NVIDIA GPU with 6 GB of memory works well (it was built on an RTX 3060 laptop GPU); on CPU only
it works, but each reply takes much longer.

1. **Get the code and the models**

   ```bash
   git clone https://github.com/Mystic-Blood/Memoria.git && cd Memoria
   npm install
   ollama pull qwen2.5:7b-instruct
   ollama pull nomic-embed-text
   ```

2. **Create a Supabase project**, then copy the settings file and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`:
     Project Settings → API. Keep the service role key private; `.env.local` is never committed.
   - `SUPABASE_DB_URL`: the **Session pooler** connection string (Connect button), with your
     database password. Only used to set up the database.
   - Leave `AI_MODE=local`.

3. **Set up the database** (tables, row-level security and the memory functions):

   ```bash
   npm run db:push
   ```

4. **Allow sign-up without email confirmation** (for a local install): in Supabase, Authentication →
   Sign In / Providers → Email → turn off "Confirm email". Otherwise every new account waits for a
   confirmation email.

5. **Run it**

   ```bash
   npm run dev        # http://localhost:3000, then sign up and start chatting
   ```

   Make sure Ollama is running (its app, or `ollama serve`). The first reply is slow while the model
   loads into memory.

**Switching between local and Gemini.** Each memory's vector belongs to the embedding model that made
it, and retrieval never compares vectors from different models, so after switching, existing memories
are invisible until they are re-embedded:

```bash
npm run reindex -- --check   # how many memories were embedded by another model
npm run reindex              # re-embed them with the model now configured
```

On the Gemini free tier the reply and the background memory work use different models
(`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`), because free limits are per model (15 requests a
minute each, measured 2026-10-17). Calls that hit the limit wait for it to reset instead of failing.

## Checks

```bash
npm run check                     # type-check, lint, unit tests (also run in CI)
npm run eval                      # development set against the real engine and database
npm run eval -- --set holdout     # held-out set
npm run race -- --models a,b      # compare local models on the extraction step
npm run sweep                     # retrieval threshold sweep

# against a running app / the live database
npm run e2e                       # real browser: sign in, chat, live memory panel, correction, memories page, erase
node --env-file=.env.local scripts/smoke-chat.mjs http://localhost:3000
node --env-file=.env.local scripts/db-security-check.mjs
```

## Project layout

```
src/lib/engine/     the memory engine (extract, recall, reconcile, guard, apply, retrieve, context)
src/lib/ai/         backend and model selection (local / Google / OpenAI)
src/app/chat/       chat UI with the live memory panel
src/app/memories/   review, edit, delete, archive and erase memories, with full history
supabase/migrations schema, row-level security and the memory functions
eval/               cases, held-out set, harness, model race, retrieval sweep, results
research/           earlier audits and experiments that led to the rebuild
```

## License

[MIT](LICENSE)
