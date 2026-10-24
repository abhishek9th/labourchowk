# Labour Chowk

A digital labour chowk: customers discover nearby skilled workers (masons, electricians, plumbers, painters …), compare **distance, indicative price, ratings and availability**, and **schedule a first consultation visit**. Workers get a simple dashboard with a profile, an availability calendar and a request inbox.

Built for the InnoTech Hackathon. React + TypeScript + Vite + Tailwind on the front end; Supabase (Postgres, Auth, Storage, Row Level Security) on the back end.

> **Product rule baked into the app:** scheduling a visit is *not* the worker accepting the job. The first visit is a consultation where both sides discuss scope and agree the final price. There is no payment or contract at this stage, and the scheduling form says so.

---

## What is implemented

| Area | Status |
| --- | --- |
| Registration / login / logout / persistent sessions (e-mail + password), role chosen at sign-up (customer or worker) | ✅ |
| Role-protected routes **and** database-enforced authorization (RLS + RPC checks) | ✅ |
| Worker profile (photo, profession, skills, experience, languages, indicative price + unit, service area/radius, description) | ✅ |
| Pricing units: per day / visit / task / sq ft / hour, with sensible defaults per profession | ✅ |
| Worker availability calendar: block single/multiple dates, range select, re-open, extra working days, weekly schedule, working hours, slot length | ✅ |
| Busy dates (accepted visits) kept separate from manually blocked dates; blocked/past/off days are never offered | ✅ |
| Graceful conflicts: blocking a date or changing the schedule auto-declines pending requests and notifies customers; accepted visits must be cancelled first | ✅ |
| Customer search with **combinable** filters (profession, location, max distance, min rating, price range, experience, available-on-date, languages, text) and 6 sort orders | ✅ |
| Real distance (haversine, computed in SQL) from browser geolocation **or** a chosen locality; locality-name fallback is clearly labelled when coordinates are missing; empty states | ✅ |
| Privacy: public pages never expose phone, e-mail, coordinates or address; street address + phone shared only after a visit is accepted | ✅ |
| Visit workflow: pending → accepted/declined → completed / cancelled, all transitions validated in the database | ✅ |
| Concurrency safety: per-worker row lock + a Postgres exclusion constraint that makes overlapping *accepted* visits impossible | ✅ |
| Duplicate-request and past-date prevention; rate limit (10 requests / hour / customer, 5 reports / hour / user) | ✅ |
| In-app notifications (request, accept/decline, cancel, reminder, completed, review) with unread counts | ✅ |
| Reviews: only the customer of a completed visit, once per visit, 1–5 stars, server-validated; averages are computed from real rows; no editing | ✅ |
| Honest verification: a "Verified" badge appears only after an admin sets it; workers can *request* verification | ✅ |
| Admin area (`/admin`): categories (add without redeploy), worker verification/hide, reported content | ✅ |
| Demo seed: 20 sample workers + 3 sample customers in Bengaluru / Delhi / Mumbai, clearly flagged `is_demo` and labelled "Sample data" | ✅ |
| **Work Portfolio**: workers add projects with up to 10 photos (title, category, description, locality, month/year, optional size and *worker-disclosed* price, tags), choose a cover, reorder, edit, hide/publish, delete (photos are removed too), and preview exactly what customers see | ✅ |
| Public "Previous Work & Portfolio" section (newest first) with responsive card grid, lightbox (next/previous, arrow keys, swipe), empty state, and a "provided by the worker, not independently verified" notice. No fake photos are ever generated | ✅ |
| Worker cards show a portfolio thumbnail and project count; profiles have a "View previous work" action | ✅ |
| **Digital Skill Passport**: immutable random `public_id`, permanent URL `https://YOUR_DOMAIN/p/PUBLIC_ID`, QR generated on demand, copy link, download PNG, Web Share (copy fallback), printable 90 × 55 mm visiting card | ✅ |
| Passport page works signed-out (QR / WhatsApp / bookmark); public visibility switch hides profile, portfolio and reviews everywhere without changing the ID; consent-based Call / WhatsApp buttons (off by default) | ✅ |
| English + Hindi UI with a translation structure for more languages | ✅ (Hindi covers the main screens; missing keys fall back to English) |
| Responsive, mobile-first UI with bottom navigation, large touch targets, skeleton loaders, error/retry states, confirm dialogs, keyboard-accessible calendar and dialogs | ✅ |

### Needs external configuration (not "pretend-working")

| Feature | What you must do |
| --- | --- |
| Everything that touches data | Create a Supabase project and fill `.env.local` (below). No credentials are bundled. |
| Profile-photo upload | Run migration `0004_storage.sql` (creates the `avatars` bucket + policies). |
| Portfolio photo upload | Run migration `0006_portfolio_storage.sql` (creates the `portfolio` bucket + policies). |
| Correct QR / share links | Set `VITE_PUBLIC_BASE_URL` to your production domain **before printing cards**. |
| E-mail copies of notifications | Deploy `supabase/functions/send-notification` and set `RESEND_API_KEY` + `MAIL_FROM`. Without them **nothing is sent** and the function says so. |
| SMS / WhatsApp / push | Not implemented. Add a provider the same way as the e-mail function. |
| Phone-number (OTP) login | Needs a Supabase SMS provider. The app uses e-mail + password; phone is stored on the profile. |
| E-mail confirmation | Off in `supabase/config.toml` for the demo. Turn it on in production (the sign-up screen already handles "check your e-mail"). |
| Exact "scheduled" reminders when nobody has the app open | Reminders are generated when a user opens the app. For true background reminders enable `pg_cron` and schedule `generate_upcoming_reminders` for everyone. |

---

## Quick start

Requirements: Node 20+ and a free [Supabase](https://supabase.com) project (or the Supabase CLI for a local stack).

```bash
npm install
cp .env.example .env.local      # then fill in the two values below
npm run dev                     # http://localhost:5173
```

### 1. Create the database

In the Supabase dashboard open **SQL Editor** and run these files, in order:

1. `supabase/migrations/0001_schema.sql` – tables, constraints, indexes, default categories
2. `supabase/migrations/0002_auth_rls.sql` – sign-up trigger, public views, grants, **RLS policies**
3. `supabase/migrations/0003_functions.sql` – booking/availability/review/search/admin functions
4. `supabase/migrations/0004_storage.sql` – avatar bucket + storage policies
5. `supabase/migrations/0005_portfolio_passport.sql` – portfolio tables/RLS/views, permanent `public_id`, visibility + contact-consent flags
6. `supabase/migrations/0006_portfolio_storage.sql` – `portfolio` bucket + owner-only write policies
7. *(optional demo)* `supabase/seed.sql` (20 sample workers), `supabase/seed_bulk.sql` (**25 sample workers in every profession = 300**, many around Noida) and `supabase/seed_manoj.sql` (a demo customer and Manoj, tile installer at ₹80/sq ft). All are flagged "Sample data"; none has reviews or photos – sample workers and customers
   Then run `supabase/seed_portfolio_reviews.sql` (after `seed.sql`, and after `seed_bulk.sql` if you used it) to add sample reviews and, for every sample worker rated above 4.2, 2–3 sample "previous works" (generic trade photos, tagged `sample`). Works on web and app.

Prefer the CLI? `supabase start` then `supabase db reset` applies all migrations and the seed (`supabase/config.toml` is included).

### 2. Environment variables

`.env.local` (see `.env.example`):

| Variable | Where it comes from |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Same page → `anon` **public** key |
| `VITE_PUBLIC_BASE_URL` | **Production domain**, e.g. `https://labourchowk.in` (no trailing slash needed). Used for QR codes, the printed card and share links. If missing in a production build the app falls back to the page's own origin and the Skill Passport page shows a warning. |
| `VITE_CONTACT_EMAIL` | optional, shown in the footer |

**Never** put the `service_role` key in a `VITE_` variable: those values ship to the browser. The only place a service-role key is used is the optional Edge Function, where Supabase injects it server-side.

Until the two variables are set, the app shows a setup screen instead of failing.

### 3. Make yourself an admin (optional)

Admin rights are **not** a field on any profile. They live in the `admins` table, which no API role can read or write. Sign up normally, then in the SQL editor:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'you@example.com';
```

Reload and open `/admin`.

### 4. Demo accounts (after running `seed.sql`)

Password for all sample users: `Demo@12345`

* Customers: `demo.customer1@labourchowk.demo` … `demo.customer3@labourchowk.demo`
* Workers: `demo.worker01@labourchowk.demo` … `demo.worker20@labourchowk.demo` (worker01 is an electrician in Indiranagar, Bengaluru)

Remove all sample data: `delete from auth.users where email like '%@labourchowk.demo';`

---

## Deploy

It is a static single-page app.

* **Vercel / Netlify:** build command `npm run build`, output directory `dist`, set the two `VITE_` variables in the project settings. `vercel.json` and `public/_redirects` already rewrite all routes to `index.html`.
* In Supabase → Authentication → URL Configuration, set the **Site URL** and add your deployed URL to the redirect list.
* Production checklist: enable e-mail confirmations, set a strong password policy, keep CAPTCHA/rate limits on Auth, review the Privacy/Terms placeholder text with a lawyer.

---

## Work Portfolio and Digital Skill Passport

**Routes:** `/worker/portfolio`, `/worker/passport` (worker dashboard), `/p/:publicId` (public, no login), and the portfolio also appears on `/workers/:id`.

**Permanent ID.** `worker_profiles.public_id` is 10 characters from a 32-symbol alphabet (no `I O 0 1`), generated once by `generate_public_id()` from the database CSPRNG (`gen_random_uuid`), never from phone/e-mail/name. A `UNIQUE` constraint enforces uniqueness, a trigger makes it immutable (`ERR_PUBLIC_ID_IMMUTABLE`), and workers have no column privilege to change it. Editing the profile, profession, availability, portfolio or reviews never touches it. Lookup is case-insensitive (`resolve_public_id`).

**URL and QR.** `passportUrl(publicId)` = `VITE_PUBLIC_BASE_URL + /p/ + ID`. The QR (`qrcode.react`, level M) encodes only that URL and is generated on demand, so it is identical for the same ID and base URL; nothing is stored in the database. PNG export uses a 1024 px canvas with a 4-module quiet zone.

**Data access for the public page.** Anonymous users have *no* table access. They read only `public_worker_profiles`, `public_reviews`, `public_portfolio_projects` and `public_portfolio_images` (views that contain no phone, e-mail, coordinates or address and only list published projects of workers whose public profile is ON), plus `resolve_public_id()` and `get_public_contact()`. Hiding is enforced in the database, not in the UI.

**Contact consent.** `share_phone` (Call) and `share_whatsapp` are `false` by default and editable only by the owner. `get_public_contact()` returns a row only when at least one is on; the number is never in any view. WhatsApp links are built only from that response (`wa.me/<digits>`), and invalid numbers produce no link. The visiting card shows a phone number only if the worker ticks the box (affects the printed card only).

**Visibility switch.** `is_public = false` removes the worker from search, profile pages, `/p/ID`, portfolio, reviews, calendar/slots, distance and new visit requests; `/p/ID` then shows the same neutral "not available" page as an unknown ID. The ID is unchanged and everything returns when switched back on. The owner still sees their own data.

**Portfolio storage and cleanup.** Photos live in the public-read `portfolio` bucket at `<worker_id>/<project_id>/<random>.jpg`; metadata is in `worker_portfolio_projects` / `worker_portfolio_images` (FKs with `ON DELETE CASCADE`, one-cover partial unique index, max 10 photos and 30 projects per worker, path must be inside the owner's folder and project — checked by a trigger *and* the storage policy). The browser validates the file by its first bytes, downsizes to 1600 px and re-encodes as JPEG (this also strips EXIF/GPS) before upload, with per-photo progress. Deleting a photo or project removes the storage files first, then the rows; if file removal fails nothing is deleted so retrying is safe.

**Account-deletion policy.** Deleting an account (`auth.users` row) cascades to the worker profile, projects and image rows, so the public page and QR immediately show "not available" and the ID is never reused. Storage files are *not* removed by SQL (Supabase keeps objects separate); either delete projects first, or run the one-off cleanup from the Storage dashboard/CLI for `portfolio/<user_id>/`. Photo URLs are unguessable but, being public-read, are fetchable by anyone who has the exact URL until the file is deleted.

**Verification honesty.** Portfolio items are labelled as worker-provided. The only verification in the app is the admin-approved identity badge; there are no verified credentials or "verified work" labels because no such process exists.

## How it works (architecture and security)

```
React SPA ──supabase-js──▶ PostgREST (RLS)      simple reads/writes of your own rows
                    └────▶ RPC functions         everything transactional or privileged
                                 └─ Postgres: constraints, triggers, exclusion constraint
```

* **No client-trusted values.** Roles, statuses, prices, ratings, ownership ids and the visit's end time are decided in the database. A customer cannot insert a visit or review directly (no INSERT policy); they call `create_visit_request` / `submit_review`, which validate everything.
* **Roles.** `profiles.role` is set once by the sign-up trigger to `customer` or `worker` (anything else, including `admin`, becomes `customer`) and cannot be updated (column privileges).
* **Privacy.** Exact coordinates live only in `worker_profiles` (owner-only). Public pages read `public_worker_profiles` / `public_reviews` (views without private columns). Distances come from `search_workers`, which returns a rounded distance and never coordinates. Workers read requests through `worker_visit_requests()`, which hides the customer's address and phone until the visit is accepted.
* **Booking integrity.** `create_visit_request` locks the worker row (`FOR UPDATE`), re-checks schedule, blocks, past dates and slot overlap, then inserts. Independently, `no_overlapping_accepted` (a `btree_gist` exclusion constraint) guarantees two accepted visits can never overlap even if app logic had a bug. A partial unique index blocks duplicate requests.
* **Availability model.** `worker_availability` only stores manual overrides (`blocked`, or `available` for an extra working day). Busy time is *derived* from accepted visits, so the two can never disagree. Pending requests do not block a slot; accepting one auto-declines overlapping pending requests (customers are notified).
* **Error codes.** The database raises short codes (`ERR_DATE_BLOCKED` …) that the UI maps to translated messages (`src/lib/errors.ts`, `src/i18n`).
* **Time zone.** "Today" and "past" use Asia/Kolkata on both server and client.

| Table | Who can read | Who can write |
| --- | --- | --- |
| `profiles` | owner, admin | owner (name, phone, photo, language, locality only) |
| `worker_profiles` | owner, admin (public uses the view) | owner (never rating/verification/views/`is_demo`) |
| `worker_skills` | everyone | owner |
| `worker_availability` | owner | via `set_availability()` only |
| `visit_requests` | the customer | via RPC functions only |
| `reviews` | the two parties, admin (public uses the view) | via `submit_review()` only; no edits |
| `notifications` | owner | system only; owner may mark read/delete |
| `service_categories` | everyone (active) | admin |
| `reports` | reporter, admin | reporter inserts; admin resolves |
| `admins` | nobody via API | SQL / service role only |

---

## Project layout

```
supabase/migrations/   0001 schema · 0002 auth+RLS · 0003 functions · 0004 storage
supabase/seed.sql      flagged sample data
supabase/functions/    optional e-mail notification function
src/lib/               api, types, dates (IST), geo (haversine, localities), schemas (zod), errors
src/i18n/              en.ts (source of truth), hi.ts, provider
src/components/        ui kit, calendar, worker card, schedule/review dialogs, layouts
src/pages/             public · customer · worker · admin
tests/db/              PGlite integration tests that run the real migrations
tests/unit/            pure-logic + translation-coverage tests
```

Adding a language: create `src/i18n/mr.ts` exporting `Dictionary`, register it in `DICTIONARIES` and `LANGUAGES` in `src/i18n/index.tsx`. Adding a profession: use `/admin/categories`, no code change.

---

## Tests

```bash
npm test          # 80 tests, ~1–2 min (the DB suite boots Postgres in WASM several times)
npm run typecheck
npm run build
```

* `tests/db/*` runs the **actual migration files** in PGlite (real Postgres engine, in-process) with a small stand-in for Supabase's `auth` schema and roles. It covers: sign-up sanitising (no admin sign-up), RLS and column grants, role/ownership attacks, blocked/past/off days, duplicate and overlapping bookings, the exclusion constraint, auto-decline on conflicts, status transitions, privacy masking, review eligibility/uniqueness/aggregation, rate limiting, notifications, distance math, combined filters, sort orders, locality fallback and the demo seed.
* `tests/unit/*` covers date/IST logic, haversine, pricing/profile-completeness, error mapping, form schemas, and that **every** translation key used in code (and every database error code) exists.

### Test status and honest limits

* ✅ All 80 automated tests, type-check and production build pass.
* ✅ New feature coverage: `tests/db/portfolio.test.ts` (public-ID uniqueness/format/immutability and survival of edits, owner-only portfolio CRUD, path and limit rules, cover/reorder, cascade deletes, anonymous reads via views only, hide/show across every public surface, consent-gated contact, search thumbnails) and `tests/unit/passport.test.ts` (production base URL, **QR rasterised and decoded back to the exact profile URL**, WhatsApp/tel link building, image sniffing/limits, project form schema).
* ✅ Browser-verified (against the emulated API, see below): create a 3-photo project (a fake `.jpg` text file was rejected; a 3000×2000 PNG was stored as 1600×1067 JPEG), edit/reorder/cover persisted, signed-out `/p/ID` shows the portfolio between About and Reviews with only the consented WhatsApp link, lightbox next/previous/wrap/Esc, unknown and hidden IDs give the same neutral page (and the raw API returns nothing), delete removes files and rows, the exported PNG decodes to `https://<base>/p/<ID>`.
* ✅ Print: the card markup + production CSS printed with headless Chrome to **one 90 × 55 mm page** even with dozens of lines of other page content. I could not view the PDF or test a physical printer.
* ✅ I also drove the real UI in a browser against an emulated Supabase API (a throw-away shim over the same PGlite database): worker sign-up → block dates → customer sees them disabled → customer requests a visit → worker sees it masked → accepts → customer sees the phone → worker completes → customer reviews → rating updates; plus login errors, session persistence across reload, stale-session recovery, Hindi, and mobile layout.
* ⚠️ It has **not** been run against a live Supabase project (GoTrue, PostgREST, Storage, e-mail confirmation and the Edge Function are untested). Expect to spend a few minutes on first run; SQL is plain Postgres and the client only uses documented supabase-js calls.
* ⚠️ True parallel-connection races cannot be exercised in PGlite (single connection). Safety relies on the row lock + exclusion constraint described above, which Postgres guarantees.
* ⚠️ Browser geolocation and the e-mail function were not exercised. Portfolio uploads were tested against an emulated Storage endpoint, so the real `storage.objects` policies in `0004`/`0006` (and bucket size/MIME limits) are **untested**. Web Share and mobile-browser rendering of the passport page were not tested on real phones.

## Known limitations

* QR/passport pages are client-rendered: link-preview crawlers (WhatsApp/Facebook cards) see the generic site title, not the worker's name. Add server-side rendering or an edge function for rich previews.
* Portfolio photos are not moderated before publishing (admins can hide a worker via reports; there is no per-photo report yet) and are not independently verified.
* A new project's cover can only be chosen after its first save (the first photo is cover automatically).

* Locations come from a built-in list of 14 localities (Bengaluru, Delhi, Mumbai), browser GPS, or free text (no coordinates → locality matching only). There is no geocoder; plug one in `src/lib/geo.ts` for production.
* Price filters compare the displayed number regardless of unit (₹800/day vs ₹35/sq ft are not normalised).
* `next available` looks 60 days ahead and is computed per worker at query time; fine for thousands of workers, not millions (cache or materialise for scale).
* Profile-view counting is an unauthenticated counter (can be inflated); fine for a stat, not for billing.
* Notification text is stored in English; labels around it are translated.
* Hindi translations cover the main screens, not every string. Privacy/Terms are placeholder text.
* No in-app chat or payments (by design for the MVP). Reviews cannot be edited or deleted by their author; admins can remove abusive ones.
* Reminders are generated when a user opens the app (see above).

---

## Hackathon demo script (5 minutes)

1. **Home** – "Find Skilled Workers Near You". Choose *Electrician* and *Indiranagar, Bengaluru* → **Search workers**. Point out real distances, ratings, indicative price + unit, "Sample data" badges, and that nobody is labelled Verified.
2. **Filters** – set *within 5 km*, *4★ and above*, an *available-on* date; change sort to *Lowest price*. Open a profile: reviews, availability calendar, price disclaimer, service area without an address.
3. **Worker side** – in a second window log in as `demo.worker01@labourchowk.demo`. Open **Availability**, select two dates, **Mark unavailable**. Show the weekly schedule card.
4. **Blocked date** – as `demo.customer1@labourchowk.demo`, open that worker → **Schedule a visit**: the blocked dates are disabled. Pick a free date/time, read the "consultation, not a booking" notice, describe the job, send.
5. **Accept** – worker's **Requests**: customer name + locality only (address and phone hidden). **Accept** → customer sees *Accepted* and the worker's phone; both get notifications.
6. **Conflict** – a second customer requesting the same slot is refused; blocking a day with a pending request auto-declines it and notifies the customer.
7. **Complete & review** – after the visit date the worker marks it **Completed**; the customer leaves a review; the worker's average updates from real reviews.
8. **Admin** (optional) – `/admin/workers`: verify a worker (only now does a badge appear), `/admin/categories`: add a profession live. Toggle **हिन्दी** and show the phone layout.

> Tip: visits can only be completed on/after their date. For a live demo of step 7, create a past accepted visit in the SQL editor (or use the seeded completed visits, which already carry sample reviews).
