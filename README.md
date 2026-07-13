# WIOA Office Matching, Landing Page & Checklist System

One app, one deploy: this serves the public landing page (`/`), the
registration form (`/wioa`), and the matching/checklist API — all from the
same Node process, so there's no CORS or WordPress dependency at all.

## What's in here

- `public/index.html` — the landing page (hero, learning tracks, 6-step guide)
- `public/wioa.html` — the registration form (matches participants to their
  nearest office, sends the assignment email, sets up their checklist)
- `src/server.js` — serves both pages above, plus the API routes:
  `/register`, `/checklist/:token`, `/staff/participants`
- `src/geocode.js`, `src/match.js`, `src/sendNotification.js` — the batch
  scripts from the original Zoho-based flow (still usable if you ever bulk-
  import participants; the `/register` endpoint duplicates this logic for a
  single person, immediately, on form submit)
- `db/schema.sql` — run this once against a fresh Postgres database
- `db/00X_*.sql` — migrations, run in order if you're upgrading an existing
  database rather than starting fresh

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in real values (database URL, SMTP
   credentials, etc.)
3. Run `db/schema.sql` against your Postgres database (Neon SQL Editor, or
   `psql "$DATABASE_URL" -f db/schema.sql` if you have `psql` locally)
4. `npm start` — visit `http://localhost:3000` to see the landing page,
   `http://localhost:3000/wioa` for the form

## Deploying to Railway

1. Push this whole folder to a GitHub repo (see `.gitignore` — `node_modules`
   and `.env` are already excluded, don't remove that)
2. In Railway: New Project → Deploy from GitHub repo → select this repo
3. Add all the variables from `.env.example` (with real values) under the
   service's **Variables** tab
4. Once deployed, get your public URL under **Settings → Networking →
   Generate Domain**
5. Update `APP_BASE_URL` in Railway's variables to that real URL
6. To use your own domain (e.g. `getpaid.infotechacademy.online`) instead of
   the railway.app one: Railway → Settings → Networking → Custom Domain →
   follow the CNAME instructions it gives you, then add that CNAME record in
   your domain's DNS settings (wherever `infotechacademy.online`'s DNS is
   managed — likely Bluehost's DNS zone editor).
