# EBS Outreach

Continuous pipeline: discover US middle/high schools (NCES) → find a contact
email → research the school → draft a personalized outreach email → create a
Gmail draft for human review. Nothing is ever sent automatically.

Full spec: [BUILD.md](BUILD.md).

## Status

Built per BUILD.md. `npx tsc --noEmit` and `npx next build` are clean.
Offline tests pass (`npm test` runs `tests/grade-span.test.ts`,
`tests/mime.test.ts`, `tests/find-email.test.ts` — 6/6 green). The two
DB-integration tests in `tests/queue.test.ts` (job-claiming concurrency,
anon-key lockout) require a real Supabase project with `supabase/schema.sql`
applied and skip cleanly without one — that's a "you need your own infra"
gap, not an unverified assumption.

`lib/template.ts` is filled with facts sourced directly from this repo's own
site (`index.html`, `about.html`, `team.html`, `schools.html`), not invented.
One gap: **the published postal address has no ZIP code** anywhere on the
site (`20 Main Street, Exeter, NH, USA`). Add one if CAN-SPAM needs it exact.

## Verified at build time (BUILD.md's "VERIFY AT BUILD TIME" items)

- **NCES CCD** (public schools, 2023-24, final v.1a):
  `https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2324_w_1a_073124.zip`
  Columns confirmed by downloading and inspecting the real CSV header:
  `NCESSCH, SCH_NAME, LCITY, LSTATE, WEBSITE, GSLO, GSHI, SY_STATUS`.
  `GSLO`/`GSHI` use `PK, KG, 01-12, UG, AE, N` exactly as BUILD.md assumed.
- **NCES PSS** (private schools, 2021-22 public-use file):
  `https://nces.ed.gov/surveys/pss/zip/pss2122_pu_csv.zip`
  Columns: `PPIN, PINST, PADDRS, PCITY, PSTABB, LOGR2022, HIGR2022`.
  **Divergence from BUILD.md's assumption:** PSS does *not* use CCD's
  `PK/KG/01-12` text codes — it uses a numeric recode (1=ungraded, 2=PK,
  3=K, 4-5=transitional K/1st, 6-17=1st-12th), confirmed against the real
  2021-22 codebook PDF. Implemented separately as `classifyPss()` in
  [lib/grade-span.ts](lib/grade-span.ts).
  **Also:** PSS has **no website column at all**. Every PSS-sourced org
  starts with `website = null` and goes straight to `needs_manual` in the
  `find_email` stage — there's nothing to scrape.
- **Vercel Hobby cron frequency:** confirmed still capped at once-daily as
  of July 2026 (job-count limits were lifted project-wide in Jan 2026, but
  the frequency cap on Hobby was not). `vercel.json` ships the spec's
  `*/5 * * * *` cron for Pro+ plans; [.github/workflows/tick.yml](.github/workflows/tick.yml)
  is the Hobby-plan fallback (needs `APP_URL` and `CRON_SECRET` as repo
  secrets). Use one, not both — running both double-ticks the queue.

## What the operator still has to do

1. **Create the Supabase project**, run `supabase/schema.sql` against it,
   set `SUPABASE_URL` / `SUPABASE_SECRET_KEY`.
2. **Start the Google Cloud OAuth consent-screen publication today** (BUILD.md
   §11 step 1) — scope `gmail.compose`, submit for production publishing.
   Unpredictable review timeline; this blocks `push_gmail` going live.
3. Run `npm run gmail-authorize` once locally after step 2 clears, to store
   a refresh token in the `secrets` table.
4. Get an NVIDIA NIM API key and (optionally) a Firecrawl key.
5. `npm run seed` to bulk-import schools — watch its printed `find_email`
   hit-rate note (BUILD.md §11 step 5: if plain `fetch` succeeds on well
   under half of a 100-school sample, the Firecrawl fallback becomes the
   real cost driver — that's a call for you, not something to silently
   absorb).
6. Confirm the ZIP code gap above before relying on the address for
   CAN-SPAM compliance.
7. Enable the cron (Vercel or GitHub Actions, see above) only after a live
   Gmail draft push has been manually confirmed in the Gmail UI.

## Commands

```bash
npm install
npm test                 # offline unit tests
npm run seed              # one-time NCES bulk import (needs Supabase env vars)
npm run gmail-authorize    # one-time OAuth consent (needs Google + Supabase env vars)
npm run dev
npm run build
```
