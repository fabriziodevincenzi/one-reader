# One Reader

A private correspondence club: one letter, one reader, maybe a reply.

## Local development

Requirements: Node.js 22.17.1 or newer and pnpm 11.

```sh
pnpm install
pnpm dev
```

The local site is available at [http://127.0.0.1:4321](http://127.0.0.1:4321).

## Checks

```sh
pnpm check
pnpm build
```

## Current scope

- Astro 7, Tailwind CSS 4, TypeScript and native Astro i18n scaffolding.
- React is limited to server-rendered Shadcn-style UI primitives; no client JavaScript is shipped for them by default.
- Editorial, near-monochrome design tokens live in `src/styles/global.css`. The current type system uses IBM Plex Mono for the wordmark, product headings, interface and metadata, and IBM Plex Serif for editorial and human-voice content. The canonical visual rules live in `one-reader-brand-guidelines.md`.
- The landing, privacy draft and terms placeholder are implemented.
- Supabase persistence, passwordless verification and `complete-signup` are connected to the active project.
- The public waitlist counter is environment-driven and remains hidden until it reaches 100 people (`PUBLIC_WAITLIST_COUNT`).
- Phase 1 prototype surfaces are available at `/waitlist/`, `/sign-in/`, `/member/`, `/member/settings/`, `/member/letters/` (email-first explanation), `/email/you-have-a-letter/`, `/email/action/*`, `/journal/`, `/journal/what-an-inbox-can-still-be-for/`, `/pricing/`, and `/ukraine/`.
- The Journal has a versioned first article and an RSS endpoint at `/blog/rss.xml` (kept as a stable feed URL).
- The post-launch landing is prepared at `/launch/`; the current root `/` remains the waitlist landing until launch.
- A non-destructive post-season preview is available at `/launch-after-free/`; it does not replace either the waitlist landing or the opening landing.

## Domain scaffolding

- `src/lib/limits.ts` contains the free (90-day) and annual/founding (24-hour) opening cadence without limiting replies inside an open conversation.
- `src/lib/matching.ts` contains the MVP language compatibility, block, availability and inverse-frequency weighted selection rules.
- `src/lib/mailbox-activity.ts` contains the provisional mailbox-availability policy: three unredeemed magic links plus 30 inactive days pauses new inbound matching without deleting or judging the account; recovery remains possible through re-authentication, a verified alias reply, or an authenticated email change.
- `src/lib/product-config.ts` keeps waitlist thresholds, launch state, first-phase exclusions, the full local price grid and the reference annual price in one place.
- `src/lib/market-pricing.ts` maps a country-level market signal to a supported local annual price and falls back to EUR when a market price is not defined; the active copy remains English until translated routes are added.
- The reserved-area authentication direction is now passwordless magic link; the local prototype does not issue real tokens yet.

When the configured waitlist count reaches 100, the public copy switches to the open-service flow: founding waitlist members receive eight weeks at the daily opening pace; new members start on Free and can upgrade whenever they choose. A new letter sent before its cadence is available is not retained or sent later automatically; the member receives the exact next date and must write again. Free members can consider annual membership for the faster opening pace, while replies and incoming letters remain available. Conversation aliases expire 30 days after the last exchange.

The Supabase identity layer is live. The repository now contains the first production-oriented mail pipeline: a verified Resend webhook, durable Postgres jobs, atomic matching reservations, directional conversation aliases, envelope-encrypted letter content and a retrying worker. It remains dormant until the Resend domain, webhook and server-only secrets are configured. Stripe is still not integrated.

## Mail pipeline

- `resend-webhook` verifies Resend signatures, deduplicates events and enqueues inbound messages before acknowledging them.
- `mail-worker` retrieves parsed content from Resend, rejects automatic or unauthenticated mail, removes quoted history and attachments, reserves a reader atomically, and sends a newly rendered HTML/plain-text message.
- Transactional outcomes use a separate durable, idempotent outbox. In the default `preview` mode, the worker renders and stores the final HTML/plain-text message without sending it; `resend` mode is an explicit release-time switch.
- Service emails and delivered letters now use one minimal, tracking-free design shell. Active Supabase Auth templates are versioned in `supabase/templates/` and must be synchronized to the hosted Auth template settings.
- Annual memberships queue an automatic-renewal notice 31 days before the current period ends so a daily worker delivers it no later than the 30-day legal threshold. Stripe receipts remain provider-owned; One Reader's notice records the renewal date, charge and cancellation deadline in the transactional outbox.

### Scheduled transactional delivery

Before enabling annual renewals in production, create a Supabase Cron job that invokes `transactional-worker` at least once per day. Store the project URL and worker credential in Supabase Vault rather than embedding them in SQL. Immediate product events also wake the worker directly; the daily job guarantees that future-dated renewal reminders are claimed on time.

Keep Resend click/open tracking disabled for Auth and transactional messages. Configure Resend as Supabase Auth's custom SMTP provider, then publish the subjects and HTML listed in `supabase/templates/README.md`.
- The MVP outcome catalogue covers unknown senders without creating accounts, inactive or incomplete profiles, age eligibility, Free/daily cadence, empty or oversized letters, removed attachments, reader matching delays, final delivery failures, closed replies and privacy-request receipts.
- Every delivered letter includes signed, letter-specific Stop and Report links. Both require an explicit confirmation page; reporting records a fixed category and closes the aliases without automatically suspending an account.
- Alias tokens are directional, derived with an HMAC secret and stored only as SHA-256 hashes. They expire 30 days after the latest valid exchange.
- Each letter gets a fresh AES-256-GCM data key. The data key is wrapped with a server-only AES-256 key before the encrypted content is stored.
- The durable job table and all letter-domain tables have RLS enabled and are granted only to `service_role`.

Required server-only configuration is documented in `.env.example`. Production also needs a scheduled invocation of `mail-worker` as a recovery path for jobs that outlive the immediate background invocation.

Product decisions live in `dear-someone-project-spec.md`; the transactional-message inventory and implementation boundary live in `dear-someone-transactional-email-map.md`; the current visual identity lives in `one-reader-brand-guidelines.md`. `dear-someone-design-brief.md` remains as historical product-design context.

## Template attribution

The technical scaffolding began from the MIT-licensed Cooper Astro template. Its license is retained in `LICENSE-COOPER`.
