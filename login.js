// ---------------------------------------------------------------------------
// Hallmark — login page (email OTP via Supabase Auth).
//
// Step 1: enter email, request a 6-digit code (supabase.auth.signInWithOtp,
// shouldCreateUser:false so only the 7 pre-created demo accounts can log
// in — nobody can type a random email and create a new account here).
// Step 2: enter the code, verify it (supabase.auth.verifyOtp). On success
// Supabase's own session (not sessionStorage) is what dashboard.html reads.
// ---------------------------------------------------------------------------

const sb =
  window.HALLMARK_SUPABASE_URL && !window.HALLMARK_SUPABASE_URL.includes("YOUR-PROJECT")
    ? window.supabase.createClient(window.HALLMARK_SUPABASE_URL, window.HALLMARK_SUPABASE_ANON_KEY)
    : null;

const el = (id) => document.getElementById(id);
let pendingEmail = null;

function showStatus(html) {
  el("login-status").innerHTML = html;
}

function showFormError(msg) {
  const e = el("login-error");
  e.textContent = msg;
  e.hidden = false;
}

function hideFormError() {
  const e = el("login-error");
  e.hidden = true;
  e.textContent = "";
}

async function init() {
  if (!sb) {
    showStatus(
      `<div class="error-box">Supabase isn't configured yet. Open <code>supabase-config.js</code> and fill in your project URL and anon key.</div>`
    );
    el("request-code-btn").disabled = true;
    return;
  }

  // Already have a live Supabase session in this browser? Skip straight in.
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) {
    window.location.href = "dashboard.html";
  }
}

el("request-code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideFormError();

  if (!sb) {
    showFormError("Supabase isn't configured yet — see README.md.");
    return;
  }

  const email = el("login-email").value.trim();
  const btn = el("request-code-btn");
  btn.disabled = true;
  btn.textContent = "Sending…";

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  btn.disabled = false;
  btn.textContent = "Send code";

  if (error) {
    showFormError("Couldn't send a code to that address — check it's one of the demo logins.");
    return;
  }

  pendingEmail = email;
  el("request-code-form").hidden = true;
  el("verify-code-form").hidden = false;
  el("login-sub").textContent = `We sent a 6-digit code to ${email}. Enter it below.`;
  el("login-code").focus();
});

el("verify-code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideFormError();

  const btn = el("verify-code-btn");
  btn.disabled = true;
  btn.textContent = "Verifying…";

  const { data, error } = await sb.auth.verifyOtp({
    email: pendingEmail,
    token: el("login-code").value.trim(),
    type: "email",
  });

  btn.disabled = false;
  btn.textContent = "Verify & log in";

  if (error || !data.session) {
    showFormError("That code didn't work — check it and try again.");
    return;
  }

  window.location.href = "dashboard.html";
});

el("back-to-email").addEventListener("click", () => {
  el("verify-code-form").hidden = true;
  el("request-code-form").hidden = false;
  el("login-sub").textContent = "Log in with your email — we'll send you a one-time code.";
  hideFormError();
});

init();