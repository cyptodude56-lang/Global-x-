# Hallmark — client demo (Supabase-backed)

A static, no-build prototype of Hallmark Financial Bank: 7 demo customers
(USA / UK / Germany) with real checking + savings accounts, cards,
beneficiaries, and transaction history — all read live from a Supabase
Postgres database instead of being hardcoded in the page. There is still no
custom backend server: the browser talks to Supabase directly using its
public (anon) key.

This replaces the earlier hardcoded-data version. The customers are
fabricated seed data — no real people, money, or cards anywhere — but
every action, including balance changes, writes to and persists in the
real database, the same as production code would.

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

## Data & persistence

Every customer-facing action — Add money, Send, Transfer, Withdraw, both
Payments tabs, card issuance, loan applications — writes to the real
Supabase tables and persists across reload. There's still no custom
backend server; the browser calls Supabase directly, same as before.

Balance changes specifically go through two Postgres functions,
`post_wallet_transaction` and `post_internal_transfer` (`security definer`,
called via `sb.rpc(...)`), which update a wallet's balance and insert the
matching `ledger_transactions` row as a single atomic operation — so a
transfer between two of your own accounts either posts both legs or
neither. That's also why the client only ever needs read access to
`wallets` and `ledger_transactions`: RLS on those tables grants `SELECT`
only, and the functions do the actual writing themselves after
independently verifying the wallet belongs to the calling signed-in user.

Access control is scoped to `auth.uid()` throughout (see the `owner_read` /
`owner_insert` / etc. policies on each table) — a signed-in customer can
only ever read or act on their own rows. There's no environment/sandbox
tagging left in the schema; this is the real access-control layer, not a
placeholder for one.

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
