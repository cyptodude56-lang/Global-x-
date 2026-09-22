// ---------------------------------------------------------------------------
// Hallmark — complete-profile page.
//
// Requires a live Supabase session (set by confirm-email.html's link
// verification). Updates users.phone and profiles' address fields, then
// asks the database to create the customer's two starter wallets by calling
// public.create_default_wallets() (see hardening.sql). The browser no longer
// inserts wallets itself: account numbers are generated server-side and the
// balance is always $0, so a customer can't choose either. Calling it again
// is harmless, so reloading this page can't create a second set.
// ---------------------------------------------------------------------------

const sb = window.HALLMARK_SB;

const el = (id) => document.getElementById(id);
let userRow = null;

function showError(msg) {
  const e = el("pf-error");
  e.textContent = msg;
  e.hidden = false;
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
    window.location.href = "../index.html";
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
    window.location.href = "kyc.html";
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

  const { error: walletErr } = await sb.rpc("create_default_wallets");

  if (walletErr) {
    console.error("wallet creation error:", walletErr);
    showError("Couldn't create your accounts. Please try again.");
    btn.disabled = false;
    btn.textContent = "Create my accounts";
    return;
  }

  window.location.href = "kyc.html";
});

init();