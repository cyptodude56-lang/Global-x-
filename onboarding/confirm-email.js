// ---------------------------------------------------------------------------
// Hallmark — email confirmation landing page.
//
// The confirmation link's own redirect already carries the session tokens
// in the URL; supabase-js picks them up automatically on client creation
// (detectSessionInUrl defaults to true). All this page does is check that
// a session actually landed, show a small, understated confirmation, and
// move on to profile completion after a short pause.
// ---------------------------------------------------------------------------

const sb = window.HALLMARK_SB;

const el = (id) => document.getElementById(id);

async function init() {
  if (!sb) {
    el("confirm-status").innerHTML = `<div class="error-box">Supabase isn't configured yet — see README.md.</div>`;
    return;
  }

  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    el("confirm-status").innerHTML = `
      <p class="helper-text">This link may have expired or already been used.</p>
      <p class="helper-text"><a href="../index.html" style="color:var(--gold-soft);">Back to login</a></p>
    `;
    return;
  }

  el("confirm-status").innerHTML = `
    <p style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:0.95rem;color:var(--muted-invert);margin:0;">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#2F9E5B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="8.5" />
        <path d="M6.5 10.2l2.3 2.3 4.7-5" />
      </svg>
      Email verified
    </p>
  `;

  setTimeout(() => {
    window.location.href = "complete-profile.html";
  }, 5000);
}

init();
