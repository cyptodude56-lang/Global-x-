-- Hallmark Financial Bank — database schema
--
-- Generated from a live Supabase project via introspection (information_schema
-- + pg_catalog), not a stored migration history. This file is the source of
-- truth for spinning up a fresh Supabase project for this app. Run it in the
-- SQL Editor of a new project, top to bottom, in one go.
--
-- After running this, see README.md for how to point supabase-config.js at
-- your new project's URL + anon key. There is no seed.sql yet — a fresh
-- project starts with zero customers; sign up through the app's normal
-- onboarding flow to create your first one (this fires create_default_wallets
-- automatically via the on_auth_user_created trigger).

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists pg_stat_statements;
-- supabase_vault and plpgsql are provisioned by Supabase on every project;
-- listed here only for completeness, nothing to create.

-- ============================================================================
-- Tables
-- ============================================================================

create table public.users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  phone          text,
  country        text not null,
  role           text not null default 'customer',
  status         text not null default 'active',
  email_verified boolean not null default false,
  mfa_enabled    boolean not null default false,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  auth_user_id   uuid unique,
  preferences    jsonb not null default '{}'::jsonb
);

create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id),
  first_name    text,
  last_name     text,
  display_name  text,
  date_of_birth date,
  nationality   text,
  address_line1 text,
  city          text,
  postal_code   text,
  country       text,
  avatar_url    text,
  tier          text,
  constraint profiles_text_safe check (
    (coalesce(first_name, '') !~ '[<>]') and (char_length(coalesce(first_name, '')) <= 80) and
    (coalesce(last_name, '') !~ '[<>]') and (char_length(coalesce(last_name, '')) <= 80) and
    (coalesce(display_name, '') !~ '[<>]') and (char_length(coalesce(display_name, '')) <= 80)
  )
);

create table public.wallets (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id),
  wallet_type        text not null,
  nickname           text,
  currency           text not null,
  masked_number      text,
  current_balance    numeric(14,2) not null default 0,
  available_balance  numeric(14,2) not null default 0,
  status             text not null default 'active',
  created_at         timestamptz not null default now(),
  account_number     text,
  routing_number     text,
  unique (user_id, wallet_type)
);

create unique index wallets_account_number_key on public.wallets (account_number) where (account_number is not null);

create table public.cards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
  wallet_id         uuid references public.wallets(id),
  card_network      text,
  card_type         text,
  masked_pan        text,
  expiry            text,
  card_holder_name  text,
  status            text not null default 'active',
  is_virtual        boolean not null default false,
  created_at        timestamptz not null default now(),
  full_pan          text,
  cvv               text not null default lpad(((floor(((random() * (900)::double precision) + (100)::double precision)))::integer)::text, 3, '0'::text),
  constraint cards_text_safe check (coalesce(card_holder_name, '') !~ '[<>]')
);

create table public.profile_cards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
  card_holder_name  text not null,
  card_network      text not null,
  masked_pan        text not null,
  expiry            text not null
);

create table public.beneficiaries (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.users(id),
  beneficiary_name            text not null,
  beneficiary_type            text,
  account_identifier_masked   text,
  bank_name                   text,
  currency                    text,
  country                     text,
  created_at                  timestamptz not null default now(),
  account_number              text,
  routing_number              text,
  constraint beneficiaries_text_safe check (
    (beneficiary_name !~ '[<>]') and (coalesce(bank_name, '') !~ '[<>]')
  )
);

create table public.ledger_transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id),
  wallet_id            uuid references public.wallets(id),
  transaction_type     text not null,
  label                text,
  counterparty         text,
  amount               numeric(14,2) not null,
  currency             text not null,
  status               text not null default 'completed',
  idempotency_key      text unique,
  provider_reference   text,
  posted_at            timestamptz not null default now()
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id),
  type        text,
  message     text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint notifications_text_safe check (coalesce(message, '') !~ '[<>]')
);

create table public.loans (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.users(id),
  loan_type                   text not null check (loan_type = any (array['personal','business','auto','education','mortgage'])),
  amount                      numeric(14,2) not null check (amount > 0),
  currency                    text not null,
  repayment_period_months     integer not null check (repayment_period_months = any (array[3,6,12,18,24,36])),
  purpose                     text not null,
  additional_details          text,
  interest_rate_pct           numeric(5,2),
  monthly_repayment           numeric(14,2),
  status                      text not null default 'submitted' check (status = any (array['submitted','document_verification','credit_assessment','approval_decision','rejected','disbursed','active','completed'])),
  reviewer_note                text,
  submitted_at                timestamptz not null default now(),
  document_verification_at    timestamptz,
  credit_assessment_at        timestamptz,
  approval_decision_at        timestamptz,
  disbursed_at                timestamptz,
  completed_at                timestamptz,
  created_at                  timestamptz not null default now()
);

create table public.logins (
  user_id      uuid primary key references public.users(id),
  email        text not null,
  username     text not null,
  password     text not null,
  environment  text not null default 'sandbox'
);
-- SECURITY NOTE: this table stores a `password` value directly, separate
-- from Supabase's own auth.users. Confirm what's actually written here
-- (hash vs. plaintext) before this goes anywhere near real users — this
-- was flagged during schema review and not something this migration
-- changes on its own.

-- ---- Legacy / parallel record-keeping tables --------------------------
-- The tables below (deposits, withdrawals, transfers, ledger_accounts,
-- ledger_entries, kyc_status, risk_events, audit_events) still carry an
-- `environment` column (default 'sandbox', CHECK'd to 'sandbox'/'production')
-- and, in several cases, RLS policies that gate SELECT on
-- environment = 'sandbox'. The app's current write path (post_wallet_transaction,
-- post_internal_transfer, post_hallmark_payment) only writes to `wallets` and
-- `ledger_transactions` — neither of which has this column anymore. Confirm
-- whether anything still writes to the tables below before removing this
-- scaffolding; if nothing does, they may be safe to drop entirely in a
-- future cleanup.

create table public.deposits (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid references public.ledger_transactions(id),
  user_id         uuid not null references public.users(id),
  wallet_id       uuid references public.wallets(id),
  method          text,
  amount          numeric(14,2) not null,
  currency        text not null,
  status          text not null default 'completed',
  created_at      timestamptz not null default now(),
  environment     text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

create table public.withdrawals (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid references public.ledger_transactions(id),
  user_id         uuid not null references public.users(id),
  wallet_id       uuid references public.wallets(id),
  method          text,
  amount          numeric(14,2) not null,
  currency        text not null,
  status          text not null default 'completed',
  created_at      timestamptz not null default now(),
  environment     text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

create table public.transfers (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid references public.ledger_transactions(id),
  user_id         uuid not null references public.users(id),
  wallet_id       uuid references public.wallets(id),
  direction       text not null check (direction = any (array['in','out'])),
  counterparty    text,
  amount          numeric(14,2) not null,
  currency        text not null,
  status          text not null default 'completed',
  created_at      timestamptz not null default now(),
  environment     text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

create table public.ledger_accounts (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid references public.wallets(id),
  user_id      uuid not null references public.users(id),
  account_type text not null,
  name         text,
  currency     text not null,
  balance      numeric(14,2) not null default 0,
  environment  text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

create table public.ledger_entries (
  id                 uuid primary key default gen_random_uuid(),
  transaction_id     uuid not null references public.ledger_transactions(id),
  ledger_account_id  uuid not null references public.ledger_accounts(id),
  entry_type         text not null check (entry_type = any (array['debit','credit'])),
  amount             numeric(14,2) not null,
  currency           text not null,
  posted_at          timestamptz not null default now(),
  environment        text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

create table public.kyc_status (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id),
  status               text not null default 'pending',
  provider             text,
  provider_reference   text,
  submitted_at         timestamptz,
  reviewed_at          timestamptz,
  risk_rating          text,
  notes                text,
  environment          text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

create table public.risk_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id),
  event_type   text,
  severity     text,
  description  text,
  status       text,
  created_at   timestamptz not null default now(),
  environment  text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

create table public.audit_events (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references public.users(id),
  action         text not null,
  target_type    text,
  target_id      uuid,
  ip_address     text,
  created_at     timestamptz not null default now(),
  environment    text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

-- ---- KYC document upload flow ------------------------------------------

create table public.kyc_submissions (
  id                uuid primary key,
  auth_user_id      uuid not null references auth.users(id),
  doc_type          text not null check (doc_type = any (array['passport','id_card','license'])),
  status            text not null default 'in_review' check (status = any (array['in_review','approved','rejected'])),
  consent_at        timestamptz not null,
  consent_version   text not null check (char_length(consent_version) >= 1 and char_length(consent_version) <= 32),
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewer_note     text check (char_length(reviewer_note) <= 500),
  environment       text not null default 'sandbox' check (environment = any (array['sandbox','production']))
);

create unique index kyc_one_active_per_user on public.kyc_submissions (auth_user_id) where (status = any (array['in_review','approved']));

create table public.kyc_documents (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.kyc_submissions(id),
  auth_user_id    uuid not null references auth.users(id),
  slot            text not null check (slot = any (array['front','back','photo','signature','selfie'])),
  storage_path    text not null unique,
  mime_type       text not null check (mime_type = any (array['image/jpeg','image/png','application/pdf'])),
  size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at      timestamptz not null default now(),
  unique (submission_id, slot)
);

-- ============================================================================
-- Indexes (beyond the primary keys / unique constraints already declared above)
-- ============================================================================

create index audit_events_actor_user_id_idx on public.audit_events using btree (actor_user_id);
create index beneficiaries_user_id_idx on public.beneficiaries using btree (user_id);
create index cards_user_id_idx on public.cards using btree (user_id);
create index deposits_user_id_idx on public.deposits using btree (user_id);
create index kyc_documents_user_idx on public.kyc_documents using btree (auth_user_id);
create index kyc_status_user_id_idx on public.kyc_status using btree (user_id);
create index kyc_submissions_user_idx on public.kyc_submissions using btree (auth_user_id, submitted_at desc);
create index ledger_accounts_user_id_idx on public.ledger_accounts using btree (user_id);
create index ledger_accounts_wallet_id_idx on public.ledger_accounts using btree (wallet_id);
create index ledger_entries_ledger_account_id_idx on public.ledger_entries using btree (ledger_account_id);
create index ledger_entries_transaction_id_idx on public.ledger_entries using btree (transaction_id);
create index ledger_transactions_user_id_idx on public.ledger_transactions using btree (user_id);
create index ledger_transactions_wallet_id_idx on public.ledger_transactions using btree (wallet_id);
create index loans_status_idx on public.loans using btree (status);
create index loans_user_id_idx on public.loans using btree (user_id);
create index notifications_user_id_idx on public.notifications using btree (user_id);
create index profiles_user_id_idx on public.profiles using btree (user_id);
create index risk_events_user_id_idx on public.risk_events using btree (user_id);
create index transfers_user_id_idx on public.transfers using btree (user_id);
create index wallets_user_id_idx on public.wallets using btree (user_id);
create unique index wallets_user_type_key on public.wallets using btree (user_id, wallet_type);
create index withdrawals_user_id_idx on public.withdrawals using btree (user_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.audit_events enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.cards enable row level security;
alter table public.deposits enable row level security;
alter table public.kyc_documents enable row level security;
alter table public.kyc_status enable row level security;
alter table public.kyc_submissions enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.loans enable row level security;
alter table public.notifications enable row level security;
alter table public.profile_cards enable row level security;
alter table public.profiles enable row level security;
alter table public.risk_events enable row level security;
alter table public.transfers enable row level security;
alter table public.users enable row level security;
alter table public.wallets enable row level security;
alter table public.withdrawals enable row level security;
-- logins has no RLS policy defined in the source project; RLS is not
-- enabled on it there either. Treat that table as needing a security
-- review (see the note by its CREATE TABLE above) before relying on it.

-- ---- Policies ------------------------------------------------------------
-- Every owner_read / owner_insert / owner_update / owner_delete policy below
-- resolves the caller's app-level user id via `auth.uid()` -> `users.auth_user_id`.
-- Tables still carrying `environment = 'sandbox'` in their USING clause are
-- the same legacy tables flagged above — see the note before their CREATE TABLE.

create policy owner_read on public.audit_events for select to public
  using (environment = 'sandbox' and actor_user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_delete on public.beneficiaries for delete to public
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));
create policy owner_insert on public.beneficiaries for insert to authenticated
  with check (user_id = (select id from public.users where auth_user_id = auth.uid()));
create policy owner_read on public.beneficiaries for select to authenticated
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_insert on public.cards for insert to authenticated
  with check (user_id = (select id from public.users where auth_user_id = auth.uid()));
create policy owner_read on public.cards for select to authenticated
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_read on public.deposits for select to public
  using (environment = 'sandbox' and user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy kyc_documents_select_own on public.kyc_documents for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy owner_read on public.kyc_status for select to public
  using (environment = 'sandbox' and user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy kyc_submissions_select_own on public.kyc_submissions for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy owner_read on public.ledger_accounts for select to public
  using (environment = 'sandbox' and user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_read on public.ledger_entries for select to public
  using (environment = 'sandbox' and transaction_id in (
    select id from public.ledger_transactions where user_id = (select id from public.users where auth_user_id = auth.uid())
  ));

create policy owner_read on public.ledger_transactions for select to authenticated
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy loans_insert_own on public.loans for insert to authenticated
  with check (user_id in (select id from public.users where auth_user_id = auth.uid()));
create policy loans_select_own on public.loans for select to authenticated
  using (user_id in (select id from public.users where auth_user_id = auth.uid()));

create policy owner_insert on public.notifications for insert to authenticated
  with check (user_id = (select id from public.users where auth_user_id = auth.uid()));
create policy owner_read on public.notifications for select to authenticated
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));
create policy owner_update on public.notifications for update to public
  using (user_id = (select id from public.users where auth_user_id = auth.uid()))
  with check (user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_read on public.profile_cards for select to authenticated
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_read on public.profiles for select to authenticated
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));
create policy owner_update on public.profiles for update to public
  using (user_id = (select id from public.users where auth_user_id = auth.uid()))
  with check (user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_read on public.risk_events for select to public
  using (environment = 'sandbox' and user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_read on public.transfers for select to public
  using (environment = 'sandbox' and user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_read on public.users for select to authenticated
  using (auth_user_id = auth.uid());
create policy owner_update on public.users for update to public
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy owner_read on public.wallets for select to authenticated
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

create policy owner_read on public.withdrawals for select to public
  using (environment = 'sandbox' and user_id = (select id from public.users where auth_user_id = auth.uid()));

-- ============================================================================
-- Functions
-- ============================================================================
-- NOTE: handle_new_demo_user, create_default_wallets, enforce_card_limit, and
-- sync_kyc_status below are the CORRECTED versions (their `environment`
-- references against users/profiles/wallets/cards were removed — those
-- columns no longer exist on those tables). See the handoff conversation for
-- the original, broken versions if you need the history.

create or replace function public.hallmark_currency_for_country(country text)
 returns text
 language sql
 immutable
as $function$
  select case country
    when 'USA' then 'USD'
    when 'UK' then 'GBP'
    when 'Germany' then 'EUR'
    else 'USD'
  end
$function$;

create or replace function public.hallmark_random_digits(n integer)
 returns text
 language sql
as $function$
  select string_agg(floor(random() * 10)::text, '') from generate_series(1, n)
$function$;

create or replace function public.hallmark_secure_digits(n integer)
 returns text
 language plpgsql
as $function$
declare
  out_digits text := '';
begin
  while length(out_digits) < n loop
    out_digits := out_digits
      || lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
  end loop;
  return left(out_digits, n);
end;
$function$;

create or replace function public.handle_new_demo_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  new_user_id uuid := gen_random_uuid();
  first_name  text := coalesce(left(nullif(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'first_name', ''), '[<>[:cntrl:]]', '', 'g')), ''), 40), 'New');
  last_name   text := coalesce(left(nullif(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'last_name',  ''), '[<>[:cntrl:]]', '', 'g')), ''), 40), 'Customer');
  country     text := case when new.raw_user_meta_data->>'country' in ('USA', 'UK', 'Germany')
                           then new.raw_user_meta_data->>'country' else 'USA' end;
begin
  insert into public.users (id, auth_user_id, email, country, role, status, email_verified)
  values (new_user_id, new.id, new.email, country, 'customer', 'active', false);

  insert into public.profiles (user_id, first_name, last_name, tier, country)
  values (new_user_id, first_name, last_name, 'Standard', country);

  return new;
end;
$function$;

create or replace function public.create_default_wallets()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_auth     uuid := auth.uid();
  v_user     public.users%rowtype;
  v_currency text;
  v_routing  text;
  v_checking text;
  v_savings  text;
begin
  if v_auth is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_user
  from public.users
  where auth_user_id = v_auth
  limit 1;
  if not found then
    raise exception 'profile_not_found';
  end if;

  -- Two tabs / a double click for the same person queue up here
  perform pg_advisory_xact_lock(hashtextextended(v_user.id::text, 0));

  if exists (select 1 from public.wallets where user_id = v_user.id) then
    return (select count(*) from public.wallets where user_id = v_user.id)::integer;
  end if;

  v_currency := public.hallmark_currency_for_country(v_user.country);
  v_routing  := public.hallmark_secure_digits(9);

  loop
    v_checking := public.hallmark_secure_digits(10);
    exit when not exists (select 1 from public.wallets where account_number = v_checking);
  end loop;
  loop
    v_savings := public.hallmark_secure_digits(10);
    exit when v_savings <> v_checking
          and not exists (select 1 from public.wallets where account_number = v_savings);
  end loop;

  insert into public.wallets
    (user_id, wallet_type, nickname, currency, masked_number, account_number, routing_number,
     current_balance, available_balance, status)
  values
    (v_user.id, 'checking', 'Main Current Account', v_currency, '•••• ' || right(v_checking, 4),
     v_checking, v_routing, 0, 0, 'active'),
    (v_user.id, 'savings',  'Savings Account',      v_currency, '•••• ' || right(v_savings, 4),
     v_savings,  v_routing, 0, 0, 'active');

  return 2;
end;
$function$;

create or replace function public.enforce_card_limit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if (select count(*) from public.cards where user_id = new.user_id) >= 6 then
    raise exception 'Card limit reached for this customer (max 6 cards).';
  end if;
  return new;
end;
$function$;

create or replace function public.handle_email_confirmed()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.email_confirmed_at is not null and (old.email_confirmed_at is null) then
    update public.users set email_verified = true where auth_user_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.sync_kyc_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_current text;
  v_wanted  text;
  v_try     text;
begin
  select id into v_user_id
  from public.users
  where auth_user_id = new.auth_user_id
  limit 1;
  if v_user_id is null then
    return new;
  end if;

  v_wanted := case new.status
    when 'in_review' then 'in_review'
    when 'approved'  then 'verified'
    when 'rejected'  then 'rejected'
    else 'pending'
  end;

  select ks.status into v_current
  from public.kyc_status ks
  where ks.user_id = v_user_id and ks.environment = 'sandbox'
  limit 1;

  -- Never move a verified customer backwards
  if v_current = 'verified' and v_wanted <> 'verified' then
    return new;
  end if;

  foreach v_try in array (case when v_wanted = 'pending' then array['pending'] else array[v_wanted, 'pending'] end)
  loop
    begin
      update public.kyc_status
      set status = v_try,
          provider = coalesce(provider, 'manual_review'),
          provider_reference = new.id::text,
          submitted_at = new.submitted_at,
          reviewed_at = new.reviewed_at
      where user_id = v_user_id and environment = 'sandbox';

      if not found then
        insert into public.kyc_status
          (user_id, status, provider, provider_reference, submitted_at, reviewed_at, environment)
        values
          (v_user_id, v_try, 'manual_review', new.id::text, new.submitted_at, new.reviewed_at, 'sandbox');
      end if;
      exit;
    exception when check_violation then
      raise warning 'kyc_status does not accept status %; trying the next fallback', v_try;
    end;
  end loop;

  return new;
end;
$function$;

create or replace function public.lookup_hallmark_account(p_account_number text)
 returns table(found boolean, holder_name text, currency text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id  uuid;
  v_currency text;
  v_first    text;
  v_last     text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_account_number is null or p_account_number !~ '^[A-Za-z0-9 ]{4,34}$' then
    return query select false, null::text, null::text;
    return;
  end if;

  select w.user_id, w.currency into v_user_id, v_currency
  from public.wallets w
  where w.account_number = p_account_number
  limit 1;

  if v_user_id is null then
    return query select false, null::text, null::text;
    return;
  end if;

  select p.first_name, p.last_name into v_first, v_last
  from public.profiles p
  where p.user_id = v_user_id;

  v_first := btrim(regexp_replace(coalesce(v_first, ''), '[<>[:cntrl:]]', '', 'g'));
  v_last  := btrim(regexp_replace(coalesce(v_last,  ''), '[<>[:cntrl:]]', '', 'g'));

  if v_first = '' then
    return query select true, 'Hallmark customer'::text, v_currency;
  elsif v_last = '' then
    return query select true, v_first, v_currency;
  else
    return query select true, v_first || ' ' || upper(left(v_last, 1)) || '.', v_currency;
  end if;
end;
$function$;

create or replace function public.post_wallet_transaction(
  p_wallet_id uuid,
  p_amount numeric,
  p_transaction_type text,
  p_label text,
  p_counterparty text,
  p_provider_reference text default null
)
 returns public.ledger_transactions
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wallet   public.wallets;
  v_owner_id uuid;
  v_tx       public.ledger_transactions;
begin
  select id into v_owner_id from public.users where auth_user_id = auth.uid();
  if v_owner_id is null then
    raise exception 'Not signed in';
  end if;

  select * into v_wallet from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'Wallet not found';
  end if;

  if v_wallet.user_id <> v_owner_id then
    raise exception 'Not authorized for this wallet';
  end if;

  if v_wallet.current_balance + p_amount < 0 then
    raise exception 'Insufficient funds';
  end if;

  update public.wallets
    set current_balance = current_balance + p_amount,
        available_balance = available_balance + p_amount
    where id = p_wallet_id;

  insert into public.ledger_transactions (
    user_id, wallet_id, label, counterparty, transaction_type,
    amount, currency, status, provider_reference, posted_at
  ) values (
    v_owner_id, p_wallet_id, p_label, p_counterparty, p_transaction_type,
    p_amount, v_wallet.currency, 'completed', p_provider_reference, now()
  )
  returning * into v_tx;

  return v_tx;
end;
$function$;

create or replace function public.post_internal_transfer(
  p_from_wallet_id uuid,
  p_to_wallet_id uuid,
  p_from_amount numeric,
  p_to_amount numeric,
  p_from_counterparty text,
  p_to_counterparty text
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.post_wallet_transaction(
    p_from_wallet_id, -p_from_amount, 'transfer_out', 'Internal transfer', p_from_counterparty
  );
  perform public.post_wallet_transaction(
    p_to_wallet_id, p_to_amount, 'transfer_in', 'Internal transfer', p_to_counterparty
  );
end;
$function$;

create or replace function public.post_hallmark_payment(
  p_from_wallet_id uuid,
  p_to_account_number text,
  p_from_amount numeric,
  p_to_amount numeric,
  p_from_counterparty text,
  p_to_counterparty text
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_to_wallet_id uuid;
  v_to_user_id   uuid;
  v_to_currency  text;
begin
  -- Debit the sender (ownership-checked inside post_wallet_transaction).
  perform public.post_wallet_transaction(
    p_from_wallet_id, -p_from_amount, 'payment_out', 'Payment sent', p_from_counterparty
  );

  -- Find the recipient's wallet, owning user, and currency by account number.
  select id, user_id, currency into v_to_wallet_id, v_to_user_id, v_to_currency
  from public.wallets
  where account_number = p_to_account_number;

  if v_to_wallet_id is null then
    raise exception 'No Hallmark wallet found for account number %', p_to_account_number;
  end if;

  -- Credit the recipient directly — post_wallet_transaction's ownership
  -- check would reject crediting someone else's wallet.
  update public.wallets
  set current_balance = current_balance + p_to_amount,
      available_balance = available_balance + p_to_amount
  where id = v_to_wallet_id;

  insert into public.ledger_transactions (wallet_id, user_id, currency, amount, transaction_type, label, counterparty, status)
  values (v_to_wallet_id, v_to_user_id, v_to_currency, p_to_amount, 'payment_in', 'Payment received', p_to_counterparty, 'completed');
end;
$function$;

create or replace function public.submit_kyc(
  p_submission_id uuid,
  p_doc_type text,
  p_documents jsonb,
  p_consent boolean,
  p_consent_version text default 'v1'
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'storage', 'pg_temp'
as $function$
declare
  v_uid      uuid := auth.uid();
  v_required text[];
  v_doc      jsonb;
  v_slot     text;
  v_path     text;
  v_mime     text;
  v_size     bigint;
  v_meta     jsonb;
  v_seen     text[] := '{}';
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_consent is not true then
    raise exception 'kyc_consent_required';
  end if;

  v_required := case p_doc_type
    when 'passport' then array['photo', 'signature', 'selfie']
    when 'id_card'  then array['front', 'back', 'selfie']
    when 'license'  then array['front', 'back', 'selfie']
    else null
  end;
  if v_required is null then
    raise exception 'kyc_invalid_document_type';
  end if;

  -- Same submission sent twice (double click, lost response): succeed quietly
  if exists (select 1 from public.kyc_submissions where id = p_submission_id and auth_user_id = v_uid) then
    return p_submission_id;
  end if;

  if exists (
    select 1 from public.kyc_submissions
    where auth_user_id = v_uid and status in ('in_review', 'approved')
  ) then
    raise exception 'kyc_already_submitted';
  end if;

  -- Already verified through the older kyc_status process (or the seed data):
  -- don't push them back through review. Only checked when that table exists.
  if to_regclass('public.kyc_status') is not null then
    if exists (
      select 1
      from public.kyc_status ks
      join public.users u on u.id = ks.user_id
      where u.auth_user_id = v_uid and ks.status = 'verified'
    ) then
      raise exception 'kyc_already_submitted';
    end if;
  end if;

  if jsonb_typeof(p_documents) is distinct from 'array'
     or jsonb_array_length(p_documents) <> array_length(v_required, 1) then
    raise exception 'kyc_documents_mismatch';
  end if;

  begin
    insert into public.kyc_submissions (id, auth_user_id, doc_type, consent_at, consent_version)
    values (p_submission_id, v_uid, p_doc_type, now(), left(coalesce(p_consent_version, 'v1'), 32));
  exception when unique_violation then
    raise exception 'kyc_already_submitted';
  end;

  for v_doc in select * from jsonb_array_elements(p_documents) loop
    v_slot := v_doc ->> 'slot';
    v_path := v_doc ->> 'path';

    if v_slot is null or v_path is null
       or not (v_slot = any (v_required))
       or v_slot = any (v_seen) then
      raise exception 'kyc_documents_mismatch';
    end if;
    v_seen := v_seen || v_slot;

    -- The path must be exactly this person's folder for this submission
    if v_path !~ ('^' || v_uid::text || '/' || p_submission_id::text || '/' || v_slot || '\.(jpg|png|pdf)$') then
      raise exception 'kyc_invalid_path';
    end if;

    -- Size and type come from storage itself, never from the client
    select o.metadata into v_meta
    from storage.objects o
    where o.bucket_id = 'kyc-documents' and o.name = v_path;

    if v_meta is null then
      raise exception 'kyc_file_missing';
    end if;

    v_mime := v_meta ->> 'mimetype';
    v_size := (v_meta ->> 'size')::bigint;

    if v_mime is null or v_mime not in ('image/jpeg', 'image/png', 'application/pdf') then
      raise exception 'kyc_invalid_file_type';
    end if;
    if v_slot = 'selfie' and v_mime = 'application/pdf' then
      raise exception 'kyc_invalid_file_type';
    end if;
    if v_size is null or v_size <= 0 or v_size > 5242880 then
      raise exception 'kyc_invalid_file_size';
    end if;

    insert into public.kyc_documents (submission_id, auth_user_id, slot, storage_path, mime_type, size_bytes)
    values (p_submission_id, v_uid, v_slot, v_path, v_mime, v_size);
  end loop;

  return p_submission_id;
end;
$function$;

create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$function$;

-- ============================================================================
-- Triggers
-- ============================================================================

create trigger on_card_insert_limit before insert on public.cards
  for each row execute function public.enforce_card_limit();

create trigger kyc_submissions_sync after insert or update of status, reviewed_at on public.kyc_submissions
  for each row execute function public.sync_kyc_status();

-- These two fire on Supabase's own auth.users table.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_demo_user();

create trigger on_auth_user_confirmed after update on auth.users
  for each row execute function public.handle_email_confirmed();

create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

-- ============================================================================
-- End of schema
-- ============================================================================
