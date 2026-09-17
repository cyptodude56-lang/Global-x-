// ---------------------------------------------------------------------------
// Hallmark — complete-profile page.
//
// Requires a live Supabase session (set by confirm-email.html's link
// verification). Updates users.phone and profiles' address fields, then
// creates the customer's two starter wallets ($0 balance, freshly
// generated account/routing numbers) — the first client-side INSERT in
// this whole project. Scoped by owner_insert policies in
// enable_signup.sql, and guarded server-side against duplicates by a
// unique index, so reloading this page after already completing it can't
// create a second set of wallets.
// ---------------------------------------------------------------------------

const sb =
  window.HALLMARK_SUPABASE_URL && !window.HALLMARK_SUPABASE_URL.includes("YOUR-PROJECT")
    ? window.supabase.createClient(window.HALLMARK_SUPABASE_URL, window.HALLMARK_SUPABASE_ANON_KEY)
    : null;

const el = (id) => document.getElementById(id);
let userRow = null;

function showError(msg) {
  const e = el("pf-error");
  e.textContent = msg;
  e.hidden = false;
}

function randomDigits(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function currencyForCountry(country) {
  return { USA: "USD", UK: "GBP", Germany: "EUR" }[country] || "USD";
}

async function init() {
  if (!sb) {
    el("pf-status").innerHTML = `<div class="error-box">Supabase isn't configured yet — see README.md.</div>`;
    el("pf-submit").disabled = true;
    return;
  }

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return;
  }

  const { data, error } = await sb.from("users").select("id, country").eq("auth_user_id", session.user.id).single();
  if (error || !data) {
    el("pf-status").innerHTML = `<div class="error-box">Couldn't find your account record. Try signing up again.</div>`;
    el("pf-submit").disabled = true;
    return;
  }
  userRow = data;

  // Already completed this step before (e.g. reloaded the page)? Skip ahead.
  const { data: existingWallets } = await sb.from("wallets").select("id").eq("user_id", userRow.id).limit(1);
  if (existingWallets && existingWallets.length > 0) {
    window.location.href = "kyc-placeholder.html";
  }
}

el("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("pf-error").hidden = true;

  if (!userRow) {
    showError("Still loading your account — try again in a moment.");
    return;
  }

  const btn = el("pf-submit");
  btn.disabled = true;
  btn.textContent = "Creating your accounts…";

  const phone = el("pf-phone").value.trim();
  const address = el("pf-address").value.trim();
  const city = el("pf-city").value.trim();
  const postal = el("pf-postal").value.trim();
  const currency = currencyForCountry(userRow.country);

  const { error: userErr } = await sb.from("users").update({ phone }).eq("id", userRow.id);
  const { error: profileErr } = await sb
    .from("profiles")
    .update({ address_line1: address, city, postal_code: postal })
    .eq("user_id", userRow.id);

  if (userErr || profileErr) {
    console.error("profile update error:", userErr || profileErr);
    showError(`Couldn't save your details: ${(userErr || profileErr).message}`);
    btn.disabled = false;
    btn.textContent = "Create my accounts";
    return;
  }

  const checkingAcct = randomDigits(10);
  const savingsAcct = randomDigits(10);
  const routing = randomDigits(9);

  const { error: walletErr } = await sb.from("wallets").insert([
    {
      user_id: userRow.id,
      wallet_type: "checking",
      nickname: "Main Current Account",
      currency,
      masked_number: "•••• " + checkingAcct.slice(-4),
      account_number: checkingAcct,
      routing_number: routing,
      current_balance: 0,
      available_balance: 0,
      status: "active",
      environment: "sandbox",
    },
    {
      user_id: userRow.id,
      wallet_type: "savings",
      nickname: "Savings Account",
      currency,
      masked_number: "•••• " + savingsAcct.slice(-4),
      account_number: savingsAcct,
      routing_number: routing,
      current_balance: 0,
      available_balance: 0,
      status: "active",
      environment: "sandbox",
    },
  ]);

  if (walletErr) {
    console.error("wallet creation error:", walletErr);
    showError(`Couldn't create your accounts: ${walletErr.message}`);
    btn.disabled = false;
    btn.textContent = "Create my accounts";
    return;
  }

  window.location.href = "kyc-placeholder.html";
});

init();
