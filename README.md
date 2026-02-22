# StatusCert AI

Production-grade SaaS for Ontario real estate law firms to generate lawyer-ready status certificate reviews.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, Storage)
- Stripe (billing)
- OpenAI (extraction + review generation)
- DOCX export via `docx`

## Setup
1. Copy `.env.example` to `.env.local` and fill in values.
2. Create a Supabase project and run the SQL in `supabase/schema.sql`.
3. Run migrations in `supabase/migrations/` in order.
4. Create a private Storage bucket named `documents`.
5. Install dependencies: `npm install`
6. Local development (inline mode, no worker required):
   - set `STATUSCERT_EXECUTION_MODE=inline`
   - set `STATUSCERT_REALTIME_UI=true`
   - set `STATUSCERT_PRODUCTIZED_UX=true`
   - run: `npm run dev`

## Production deployment (required)
Run two processes/services with the same environment variables:
1. Set `STATUSCERT_EXECUTION_MODE=queue`
2. Keep `STATUSCERT_REALTIME_UI=true` for realtime progress UX.
3. Web: `npm run build && npm run start`
4. Worker pool (start at 2 replicas):
   - `npm run build:worker`
   - `npm run start:worker`

If the worker is not running, jobs stay `QUEUED` and no extraction/generation starts.

## Key flows
- Create review → upload PDF → extract → generate → edit → export DOCX
- One-click flow: upload package → generate draft job → edit → export DOCX job
- Entitlements are enforced before generation (trial, credits, subscription, or founder override).

## Notes
- DOCX is the primary export format.
- Templates are stored as sectioned JSON.
- Reviews are internal legal work product; not consumer advice.
- Job progress is polled every 2s for the first minute and every 5s afterward.
- Review page uses Supabase Realtime for status updates with polling fallback on channel/network issues.
- Queue SLO health is available at `/api/statuscert/worker/health`.
- Billing is part of onboarding (`/app/billing?source=onboarding`), and generate/export are entitlement-gated.
