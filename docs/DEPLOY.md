# Deploying Memoria (Vercel + Supabase)

How to run Memoria as a public demo on Vercel with a free-tier Google Gemini key, without one bored
visitor draining the API quota or the Supabase free tier.

Each chat message costs **3-6 model calls**: the reply, then fact extraction and reconciliation in the
background. Plan your limits from that number.

## 1. Supabase project

Use a **separate Supabase project** for the hosted demo. Memories embedded by local Ollama
(`nomic-embed-text`) and by Gemini (`gemini-embedding-001`) live in different vector spaces and are not
searched together, so sharing one project between local development and production gives confusing
results. (If you do switch a project from one model to the other, `npm run reindex` re-embeds its memories.)

### Apply the migrations

From your machine, with `SUPABASE_DB_URL` in `.env.local` pointing at the **production** project
(Connect -> Session pooler):

```bash
npm run db:status      # what is applied, what is pending
npm run db:push        # applies supabase/migrations/*
```

Apply migrations **before** deploying code that needs them. In particular `20261017000003_chat_rate_limits.sql`
must be applied first: `/api/chat` checks usage limits through it and refuses requests (503) when the
check cannot run.

### Dashboard settings (code cannot enforce these)

Authentication -> Sign In / Providers -> Email

| Setting | Recommended | Why |
|---|---|---|
| Allow new users to sign up | on (off to close the demo) | The app's `SIGNUPS_DISABLED` flag only hides the app's own form; the Auth API can still be called directly with the public anon key. Turning this off is the real switch. |
| Confirm email | **on**, with custom SMTP | Stops throwaway sign-ups with fake addresses. The app tells the user to check their inbox. |
| Minimum password length | 8 | Matches the app's validation. |
| Anonymous sign-ins | off (default) | Every anonymous visitor would be a free account with its own chat quota. |

> **Email delivery:** Supabase's built-in email service is meant for testing: it is heavily rate-limited
> and may only deliver to your project's team members. With "Confirm email" on, set up custom SMTP
> (Authentication -> Emails -> SMTP Settings; any transactional provider works), or visitors will never
> receive the confirmation link. If you cannot, leave "Confirm email" off and rely on the auth rate limits
> and the chat limits below.
>
> After clicking the link the user lands on the Site URL already confirmed and logs in with their
> password. (There is no `/auth/confirm` code-exchange route, so the link does not sign them in by itself.)

Authentication -> Rate Limits: lower the defaults for a demo, e.g.

| Limit | Suggested |
|---|---|
| Sign-ups and sign-ins (per 5 min, per IP) | 10-30 |
| Emails sent (per hour) | as low as your SMTP plan needs |
| Token refreshes (per 5 min, per IP) | default |

Authentication -> Attack Protection

- **CAPTCHA (hCaptcha / Cloudflare Turnstile): do not enable yet.** Once on, Supabase rejects every
  sign-up and sign-in that does not carry a CAPTCHA token, and the login page does not render a widget
  yet. Enabling it requires adding the widget to `src/app/login/page.tsx` and passing
  `options: { captchaToken }` to `signUp` / `signInWithPassword` in `src/app/login/actions.ts`.
- Leaked-password protection: enable if your plan offers it.

Authentication -> URL Configuration

- **Site URL**: `https://<your-app>.vercel.app` (where confirmation emails link to).
- **Redirect URLs**: add the same URL (and preview URLs if you use them).

Other

- Project Settings -> Data API: expose only the `public` schema (the default).
- Free-tier projects pause after a period of inactivity; open the dashboard to resume one.

## 2. Vercel project

Import the repository in Vercel (framework preset: Next.js; build command `npm run build`; Node 22).

### Environment variables

Set these for **Production** (and Preview if you use previews, ideally with a different Supabase project).
Mark the secret ones as *Sensitive*.

| Variable | Secret? | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no (sent to browsers) | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (sent to browsers; protected by row-level security) | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | service-role key; bypasses row-level security, server only |
| `AI_MODE` | no | `remote` |
| `REMOTE_PROVIDER` | no | `google` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | **yes** | Gemini API key |
| `CRON_SECRET` | **yes** | long random string: `node -e "console.log(crypto.randomUUID())"` |
| `CHAT_LIMIT_PER_MINUTE` | no | per user, default `10` (a number is the limit, `off` removes it) |
| `CHAT_LIMIT_PER_DAY` | no | per user, default `200` (a demo can go much lower, e.g. `50`) |
| `CHAT_DAILY_GLOBAL_LIMIT` | no | all users together per rolling 24 h; see below |
| `SIGNUPS_DISABLED` | no | `true` to close the sign-up form |

Do **not** set `SUPABASE_DB_URL` on Vercel; it is only for `npm run db:push` from your machine.
Optional model overrides (`CHAT_MODEL`, ...) are described in `.env.example`.

**Why `AI_MODE=remote`:** local Ollama cannot run on Vercel. With `AI_MODE=auto` and no key, the app would
fall back to `localhost:11434`, which does not exist there. `remote` fails loudly if the key is missing.

**Choosing `CHAT_DAILY_GLOBAL_LIMIT`:** look up your key's free-tier requests-per-day for the chat and
embedding models in Google AI Studio, divide by ~6 calls per message, and leave headroom. Example: a
1,500 requests/day quota -> about 250 messages; set `200`. Over the cap, `/api/chat` answers
**503 "The demo is at capacity today"** with a `Retry-After` header. Unset = unlimited; `0` pauses chat.

### What happens when configuration is missing

In production, `/api/chat` refuses to run (HTTP 500, "The server is not configured correctly") when any
of these is missing: the Supabase URL, anon key or service-role key, `CRON_SECRET`, or a usable AI
backend (on Vercel: `AI_MODE=auto` without an API key counts as missing). The exact missing names are
written to the function log (`[Config] ...`), never to visitors. `/api/cron/staleness-sweep` likewise
reports missing Supabase settings. Check Vercel -> Logs if chat answers with that message.

### Scheduled job

`vercel.json` registers `/api/cron/staleness-sweep` daily at 03:00 UTC (it expires temporary memories
past their end date). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the
`CRON_SECRET` variable is set; without it the endpoint fails closed with 401. Daily schedules work on the
Hobby plan.

### Background memory step

The memory update runs after the reply is sent (`after()` in `src/app/api/chat/route.ts`) and counts
toward the function's duration. If memory runs show as failed with timeouts, raise the function max
duration in Project Settings -> Functions.

## 3. Limits and headers built into the app

| Protection | Where | Behaviour |
|---|---|---|
| Per-user limits | `src/lib/limits.ts`, `public.chat_usage_take` | 429 + `Retry-After`, rolling windows (60 s, 24 h) |
| Global daily cap | same | 503 + `Retry-After` |
| Limit check unavailable | `src/app/api/chat/route.ts` | 503 (fails closed) |
| Message size | chat route | 413 over 4,000 characters |
| Config check | `src/lib/env.ts` | 500, details in the log |
| Sign-up switch | `SIGNUPS_DISABLED`, `src/app/login/actions.ts` | form refuses new accounts |
| Security headers | `next.config.ts` | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP |

Usage is counted in Postgres (works across serverless instances) in a table users cannot read, reset or
write. Only requests that pass validation and the limits are counted.

The Content-Security-Policy has no nonces, so `script-src` allows `'unsafe-inline'` (Next's inline
hydration scripts need it unless every page is rendered with a per-request nonce). It still restricts
connections to the app itself and the Supabase project (HTTPS + Realtime websocket), blocks plugins,
framing and `<base>` hijacking, and only allows forms to post to the app. Verified with headless Chromium
against `next start`: pages hydrate, the Realtime websocket and Supabase REST connect, a request to any
other origin is blocked. If you add a third-party script, font or API, extend `next.config.ts`.

## 4. Post-deploy checklist

Run from your machine with `.env.local` pointing at the **production** Supabase project.

1. **Headers**: `curl -sI https://<your-app>.vercel.app/login` shows `content-security-policy`,
   `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy`, `permissions-policy`.
2. **Database security** (23 rules, two throwaway users, cleans up after itself):
   `node --env-file=.env.local scripts/db-security-check.mjs`
3. **Smoke test** (creates a throwaway user, sends 2 chat messages, checks memory and recall, deletes the
   user; costs ~10 model calls of quota):
   `node --env-file=.env.local scripts/smoke-chat.mjs https://<your-app>.vercel.app`
4. **Cron**: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-app>.vercel.app/api/cron/staleness-sweep`
   returns `{"expired":<n>}`; without the header it returns 401. After the first night, check
   Vercel -> Cron Jobs for a successful run.
5. **Sign-up flow**: sign up with a real address; with "Confirm email" on, the app asks you to check your
   inbox, the link arrives, and you can log in afterwards.
6. **Limits** (optional, costs quota): on a preview deployment set `CHAT_LIMIT_PER_MINUTE=1`, send two
   messages quickly, and check the second is refused with "sending messages a little fast".
7. **Logs**: Vercel -> Logs shows no `[Config]` errors and no `[Chat] Usage limit check failed`.

## 5. Turning the demo off or down

- Close registration: Supabase "Allow new users to sign up" off (plus `SIGNUPS_DISABLED=true` for a
  friendly message).
- Pause chat for everyone: set `CHAT_DAILY_GLOBAL_LIMIT=0` and redeploy (environment variable changes
  apply to new deployments).
- Rotate a leaked key: replace it in Vercel, redeploy, revoke the old one at the provider.
