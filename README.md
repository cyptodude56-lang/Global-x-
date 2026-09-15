# Hallmark — client demo (Supabase-backed)

A static, no-build prototype of Hallmark Financial Bank: 7 demo customers
(USA / UK / Germany) with real checking + savings accounts, cards,
beneficiaries, and transaction history — all read live from a Supabase
Postgres database instead of being hardcoded in the page. There is still no
custom backend server: the browser talks to Supabase directly using its
public (anon) key.

This replaces the earlier hardcoded-data version. Everything is still
labeled "Demo / sandbox" — no real customers, money, or cards anywhere.

## What's in here

- `index.html`, `styles.css`, `app.js` — the app itself (still zero build
  step, still deployable straight to GitHub Pages)
- `supabase-config.js` — where you paste your own project's URL + anon key
- `schema.sql` — creates all 15 Phase‑02 tables (users, profiles, wallets,
  ledger_accounts, ledger_transactions, ledger_entries, deposits,
  withdrawals, transfers, beneficiaries, cards, notifications, kyc_status,
  risk_events, audit_events) with Row Level Security enabled
- `seed.sql` — every row from `hallmark_prototype_seed_data.xlsx`, generated
  directly from that spreadsheet so there's no transcription drift

## One-time Supabase setup

1. Create a free project at [supabase.com](https://supabase.com) if you
   don't have one yet.
2. Open your project's **SQL Editor**, paste in the contents of
   `schema.sql`, and run it.
3. In a new query, paste in `seed.sql` and run it. You should see 15
   `INSERT` confirmations (8 users, 8 profiles, 16 wallets, etc.).
4. Go to **Settings → API**. Copy the **Project URL** and the **anon
   public** key (not the `service_role` key — never put that one in
   client-side code).
5. Open `supabase-config.js` and paste those two values in.

That's it — open `index.html` locally, or deploy to GitHub Pages exactly as
before (create a repo, push these files, turn on Pages in Settings).

## Why actions don't write back to the database

Add money / Send / Transfer / Withdraw still only update an in-memory copy
in the browser for that visit — refreshing the page resets everything back
to whatever's in Supabase. They deliberately do **not** write to the real
tables. Two reasons:

1. **There's no login yet.** You mentioned logins are coming later. Until a
   visitor is actually authenticated as a specific customer, there's no way
   to know who's "supposed" to be allowed to touch which rows.
2. **This is a public, static site with a public key.** Anyone who opens
   GitHub Pages can see the anon key in the page source. `schema.sql` locks
   that key to **read-only** access (Row Level Security only grants
   `SELECT`, and only on rows tagged `environment = 'sandbox'`) specifically
   so a visitor poking at the API directly can't overwrite or corrupt the
   shared demo data for everyone else viewing it.

Once real logins exist, the natural next step is: add RLS policies scoped
to `auth.uid()` (so each customer can only read/write their own rows), then
point the app's Add money / Send / Transfer / Withdraw handlers at real
`insert`/`update` calls instead of local state.

## Notes on the data model

- Each customer has a **checking** and **savings** wallet in one currency
  (USD, GBP, or EUR depending on country) — this mirrors the seed data
  exactly, including Irene's reference balances ($1,030,000 checking /
  $670,000 savings).
- **Send** pays a saved beneficiary (from the `beneficiaries` table); it's
  disabled if the signed-in demo customer has none.
- **Transfer** moves money between that same customer's own checking and
  savings accounts.
- The account switcher only lists the 7 `role = 'customer'` users — Ahmed
  Rahman (`role = 'admin'`) is left out since there's no admin dashboard
  built yet (that's Phase 06 in the roadmap, still to come).

## Trying it locally

Open `index.html` directly in a browser after filling in
`supabase-config.js`, or serve the folder with e.g.
`python3 -m http.server 8000`.
