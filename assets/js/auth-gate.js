// ---------------------------------------------------------------------------
// Hallmark — shared Supabase client + session / profile-completeness gate.
//
// Every authenticated page (dashboard, accounts, transfers, payments,
// cards, settings, statements) used to carry its own copy of this: create
// the Supabase client, check for a session, look up the linked
// public.users row, and check whether the customer has finished
// complete-profile.html yet. Copy-pasted across 7+ files, it had already
// drifted once: kyc.js's copy used window.location.replace() with a bare
// filename instead of window.location.href = a relative path, which broke
// silently once the pages moved into subfolders. One shared copy means
// there's only one place left to get this right.
//
// Load this AFTER the Supabase CDN script (needs window.supabase) and
// supabase-config.js (needs window.HALLMARK_SUPABASE_URL / _ANON_KEY), and
// BEFORE the page's own script.
// ---------------------------------------------------------------------------

window.HALLMARK_SB =
  window.HALLMARK_SUPABASE_URL && !window.HALLMARK_SUPABASE_URL.includes("YOUR-PROJECT")
    ? window.supabase.createClient(window.HALLMARK_SUPABASE_URL, window.HALLMARK_SUPABASE_ANON_KEY)
    : null;

// Lightweight gate: just requires a live Supabase Auth session to exist.
// Used by pages that work directly off the auth session (e.g. kyc.js,
// which uses session.user.id for storage paths) rather than needing the
// linked public.users row. Redirects to loginPath and returns null if
// there's no session (or no Supabase client); otherwise returns the
// session.
async function hallmarkRequireSession(loginPath) {
  const sb = window.HALLMARK_SB;
  if (!sb) {
    window.location.href = loginPath;
    return null;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    window.location.href = loginPath;
    return null;
  }
  return session;
}

// Full gate used by every "main app" page: live session -> linked
// public.users row -> at least one wallet (i.e. complete-profile.html has
// been finished). Returns the public.users.id on success. On any failure
// it redirects (loginPath for no session/no linked customer,
// incompleteProfilePath for no wallets yet) and returns null — callers
// should stop immediately when null comes back.
//
// errorTarget: an optional CSS selector for a container to show a
// "Supabase isn't configured" message in, for pages that have one.
async function hallmarkResolveAccount({ loginPath, incompleteProfilePath, errorTarget } = {}) {
  const sb = window.HALLMARK_SB;
  if (!sb) {
    if (errorTarget) {
      const target = document.querySelector(errorTarget);
      if (target) {
        target.innerHTML = '<div class="error-box" style="color:var(--ink)">Supabase isn\'t configured yet.</div>';
      }
    }
    return null;
  }

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    window.location.href = loginPath;
    return null;
  }

  const { data: userRow, error } = await sb.from("users").select("id").eq("auth_user_id", session.user.id).single();
  if (error || !userRow) {
    // Logged in with Supabase Auth, but not linked to a demo customer —
    // e.g. link_auth_users.sql hasn't been run yet for this account.
    await sb.auth.signOut();
    window.location.href = loginPath;
    return null;
  }

  const { data: existingWallets } = await sb.from("wallets").select("id").eq("user_id", userRow.id).limit(1);
  if (!existingWallets || existingWallets.length === 0) {
    // Signed in, but never finished complete-profile.html — send them
    // back to finish setup instead of showing an empty, broken page.
    window.location.href = incompleteProfilePath;
    return null;
  }

  return userRow.id;
}

window.hallmarkRequireSession = hallmarkRequireSession;
window.hallmarkResolveAccount = hallmarkResolveAccount;
