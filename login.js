// ---------------------------------------------------------------------------
// Hallmark — login page.
//
// Checks the entered email/username + password against the `logins` table
// you loaded from hallmark_logins.xlsx. On success, stores which user_id
// logged in in sessionStorage and sends the browser to dashboard.html.
//
// This is a demo login, not real authentication — see README.md ("Logging
// in") for exactly what that means and the trade-offs involved.
// ---------------------------------------------------------------------------

const sb =
  window.HALLMARK_SUPABASE_URL && !window.HALLMARK_SUPABASE_URL.includes("YOUR-PROJECT")
    ? window.supabase.createClient(window.HALLMARK_SUPABASE_URL, window.HALLMARK_SUPABASE_ANON_KEY)
    : null;

let LOGINS = [];
let CUSTOMER_IDS = new Set();
let dataReady = false;

const el = (id) => document.getElementById(id);

function showLoginStatus(html) {
  el("login-status").innerHTML = html;
}

function showLoginFormError(msg) {
  const e = el("login-error");
  e.textContent = msg;
  e.hidden = false;
}

function hideLoginFormError() {
  const e = el("login-error");
  e.hidden = true;
  e.textContent = "";
}

function attemptLogin(identifier, password) {
  const id = identifier.trim().toLowerCase();
  return (
    LOGINS.find((l) => (l.email.toLowerCase() === id || l.username.toLowerCase() === id) && l.password === password) ||
    null
  );
}

async function loadData() {
  // Already signed in this tab? Skip straight to the dashboard.
  if (sessionStorage.getItem("hallmark_user_id")) {
    window.location.href = "dashboard.html";
    return;
  }

  if (!sb) {
    showLoginStatus(
      `<div class="error-box">Supabase isn't configured yet. Open <code>supabase-config.js</code> and fill in your project URL and anon key — see README.md for where to find them.</div>`
    );
    el("login-submit").disabled = true;
    return;
  }

  showLoginStatus(`<p class="loading-text">Loading demo data…</p>`);
  el("login-submit").disabled = true;

  const [usersRes, loginsRes] = await Promise.all([
    sb.from("users").select("id, role").eq("environment", "sandbox"),
    sb.from("logins").select("*").eq("environment", "sandbox"),
  ]);

  const failed = [usersRes, loginsRes].find((r) => r.error);
  if (failed) {
    showLoginStatus(
      `<div class="error-box">Couldn't load demo data (${failed.error.message}). Make sure you've run <code>schema.sql</code> and then <code>seed.sql</code> in your Supabase project's SQL editor, and that you've loaded a <code>logins</code> table matching <code>hallmark_logins.xlsx</code> — see README.md.</div>`
    );
    return;
  }

  LOGINS = loginsRes.data;
  CUSTOMER_IDS = new Set(usersRes.data.filter((u) => u.role === "customer").map((u) => u.id));
  dataReady = true;

  console.info("Hallmark login page loaded:", { customers: CUSTOMER_IDS.size, logins: LOGINS.length });

  if (LOGINS.length === 0) {
    showLoginStatus(
      `<div class="error-box">Connected to Supabase, but the <code>logins</code> table returned 0 rows for <code>environment = 'sandbox'</code>. Check that the table has data, that the column really says "sandbox", and that its Row Level Security policy allows public reads — see "Logging in" in README.md, or run <code>logins_rls.sql</code>.</div>`
    );
    return;
  }

  showLoginStatus("");
  el("login-submit").disabled = false;
}

el("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  hideLoginFormError();

  if (!sb) {
    showLoginFormError("Supabase isn't configured yet — see README.md.");
    return;
  }
  if (!dataReady) {
    showLoginFormError("Demo data hasn't finished loading yet — try again in a moment.");
    return;
  }
  if (LOGINS.length === 0) {
    showLoginFormError("No login rows are available — see the message above for why.");
    return;
  }

  const match = attemptLogin(el("login-id").value, el("login-password").value);
  if (!match) {
    showLoginFormError("Incorrect email/username or password.");
    return;
  }
  if (!CUSTOMER_IDS.has(match.user_id)) {
    showLoginFormError("This login isn't linked to a customer dashboard in this demo.");
    return;
  }

  sessionStorage.setItem("hallmark_user_id", match.user_id);
  window.location.href = "dashboard.html";
});

loadData();
