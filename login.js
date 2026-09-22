// ---------------------------------------------------------------------------
// Hallmark — login page (email OTP via Supabase Auth).
//
// Step 1: enter email, request a 6-digit code (supabase.auth.signInWithOtp,
// shouldCreateUser:false so only the 7 pre-created demo accounts can log
// in — nobody can type a random email and create a new account here).
// Step 2: enter the code, verify it (supabase.auth.verifyOtp). On success
// Supabase's own session (not sessionStorage) is what dashboard.html reads.
//
// The 5-minute countdown below is a UI convenience, not the real security
// boundary — the actual expiry is enforced server-side by Supabase's own
// "Email OTP Expiration" setting (Authentication → Providers → Email),
// which needs to be set to 300 seconds too so the two actually match. If
// they drift out of sync, the server's setting is what actually governs;
// this timer is just here so the person isn't guessing.
// ---------------------------------------------------------------------------

const CODE_EXPIRY_SECONDS = 300; // keep in sync with Supabase's Email OTP Expiration setting

const sb =
  window.HALLMARK_SUPABASE_URL && !window.HALLMARK_SUPABASE_URL.includes("YOUR-PROJECT")
    ? window.supabase.createClient(window.HALLMARK_SUPABASE_URL, window.HALLMARK_SUPABASE_ANON_KEY)
    : null;

const el = (id) => document.getElementById(id);
let pendingEmail = null;
let timerHandle = null;
let codeRequestedAt = null;

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

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---- Running exchange-rate ticker (all 6 pairs, not tied to any one account) ----
const TICKER_PAIRS = [
  ["USD", "GBP"], ["USD", "EUR"], ["GBP", "EUR"],
  ["GBP", "USD"], ["EUR", "USD"], ["EUR", "GBP"],
];

async function loadFxTicker() {
  const track = document.getElementById("fx-ticker-track");
  if (!track) return;
  try {
    const results = await Promise.all(
      TICKER_PAIRS.map(([base, quote]) =>
        fetch(`https://api.frankfurter.dev/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
      )
    );
    const itemsHtml = results
      .map((r) => `<span class="fx-ticker-item"><strong>${r.base}/${r.quote}</strong>${Number(r.rate).toFixed(4)}</span>`)
      .join("");
    track.innerHTML = itemsHtml + itemsHtml; // duplicated back-to-back for a seamless loop
  } catch (err) {
    track.innerHTML = '<span class="fx-ticker-item">Exchange rates unavailable right now.</span>';
    console.warn("FX ticker fetch failed:", err);
  }
}
loadFxTicker();

function stopCodeTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  codeRequestedAt = null;
  el("code-timer").textContent = "";
}

function expireCode() {
  stopCodeTimer();
  el("code-timer").textContent = "This code has expired.";
  el("login-code").disabled = true;
  el("verify-code-btn").disabled = true;
  el("resend-code").hidden = false;
}

function startCodeTimer() {
  stopCodeTimer();
  el("login-code").disabled = false;
  el("verify-code-btn").disabled = false;
  el("resend-code").hidden = true;
  codeRequestedAt = Date.now();

  const tick = () => {
    const elapsed = Math.floor((Date.now() - codeRequestedAt) / 1000);
    const remaining = CODE_EXPIRY_SECONDS - elapsed;
    if (remaining <= 0) {
      expireCode();
      return;
    }
    el("code-timer").textContent = `Code expires in ${formatMMSS(remaining)}`;
  };

  tick();
  timerHandle = setInterval(tick, 1000);
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
    window.location.href = "dashboard/dashboard.html";
  }
}

async function requestCode(email) {
  hideFormError();
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
    console.error("signInWithOtp error:", error);
    showFormError(`Couldn't send a code: ${error.message} (status ${error.status ?? "unknown"})`);
    return false;
  }

  pendingEmail = email;
  el("request-code-form").hidden = true;
  el("signup-form").hidden = true;
  el("toggle-to-signup-line").hidden = true;
  el("verify-code-form").hidden = false;
  el("login-sub").textContent = `We sent a 6-digit code to ${email}. Enter it below.`;
  el("login-code").value = "";
  el("login-code").focus();
  startCodeTimer();
  return true;
}

el("request-code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sb) {
    showFormError("Supabase isn't configured yet — see README.md.");
    return;
  }
  await requestCode(el("login-email").value.trim());
});

el("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sb) {
    showFormError("Supabase isn't configured yet — see README.md.");
    return;
  }
  hideFormError();

  const btn = el("signup-btn");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending…";

  const { error } = await sb.auth.signInWithOtp({
    email: el("signup-email").value.trim(),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: new URL("confirm-email.html", window.location.href).toString(),
      data: {
        first_name: el("signup-first-name").value.trim(),
        last_name: el("signup-last-name").value.trim(),
        country: el("signup-country").value,
      },
    },
  });

  btn.disabled = false;
  btn.textContent = originalLabel;

  if (error) {
    console.error("signup signInWithOtp error:", error);
    showFormError(`Couldn't send a confirmation email: ${error.message} (status ${error.status ?? "unknown"})`);
    return;
  }

  el("signup-form").hidden = true;
  showStatus(
    `<p class="helper-text">Check <strong>${el("signup-email").value.trim()}</strong> for a confirmation link, then click it to continue.</p>`
  );
});

el("show-signup").addEventListener("click", () => {
  hideFormError();
  el("request-code-form").hidden = true;
  el("toggle-to-signup-line").hidden = true;
  el("signup-form").hidden = false;
  el("login-title").textContent = "Create your account";
});

el("back-to-login-from-signup").addEventListener("click", () => {
  hideFormError();
  el("signup-form").hidden = true;
  el("request-code-form").hidden = false;
  el("toggle-to-signup-line").hidden = false;
  el("login-title").textContent = "Welcome back";
});

el("resend-code").addEventListener("click", async () => {
  hideFormError();
  el("resend-code").hidden = true;
  await requestCode(pendingEmail);
});

el("verify-code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideFormError();

  const btn = el("verify-code-btn");
  btn.disabled = true;
  btn.textContent = "Verifying…";

  const tokenValue = el("login-code").value.trim();
  console.info("verifyOtp submitting:", { email: pendingEmail, token: tokenValue, tokenLength: tokenValue.length, at: new Date().toISOString() });

  const { data, error } = await sb.auth.verifyOtp({
    email: pendingEmail,
    token: tokenValue,
    type: "email",
  });

  btn.disabled = false;
  btn.textContent = "Verify & log in";

  if (error || !data.session) {
    console.error("verifyOtp error:", error);
    showFormError(error ? `That code didn't work: ${error.message}` : "That code didn't work — check it and try again.");
    return;
  }

  stopCodeTimer();
  await recordLoginNotification(data.session.user.id);
  window.location.href = "dashboard/dashboard.html";
});

async function recordLoginNotification(authUserId) {
  try {
    const { data: userRow } = await sb.from("users").select("id, preferences").eq("auth_user_id", authUserId).single();
    if (!userRow) return;
    const prefs = userRow.preferences || {};
    if (prefs.notifSecurity === false) return; // respects the Settings > Notifications toggle
    await sb.from("notifications").insert({
      user_id: userRow.id,
      type: "security",
      message: "You signed in to Hallmark.",
      is_read: false,
      environment: "sandbox",
    });
  } catch (err) {
    console.warn("Couldn't record login notification (login still proceeds):", err);
  }
}

el("back-to-email").addEventListener("click", () => {
  stopCodeTimer();
  el("verify-code-form").hidden = true;
  el("request-code-form").hidden = false;
  el("toggle-to-signup-line").hidden = false;
  el("login-title").textContent = "Welcome back";
  el("login-sub").textContent = "Log in with your email — we'll send you a one-time code.";
  hideFormError();
});

init();