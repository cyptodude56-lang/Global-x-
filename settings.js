// ---------------------------------------------------------------------------
// Hallmark — Settings page.
//
// Unlike most interactive actions in this project (which only mutate local
// state — see README's "Why actions still don't write back"), a settings
// page whose whole point is persisting preferences would defeat itself if
// nothing actually saved. So this page is deliberately split into two
// honest categories:
//   - Real, persisted, and tested: profile fields, email (via the real
//     Supabase Auth updateUser call), notification preferences, the
//     default transfer account, "show cents in balances", and removing a
//     saved payee — all stored in enable_settings.sql's new
//     `users.preferences` jsonb column or via a real DELETE.
//   - Honestly not implemented: 2FA, biometrics, device history, and
//     account closure don't correspond to anything this system actually
//     does, so they're marked "coming soon" rather than faked.
// ---------------------------------------------------------------------------

let CURRENT_USER_ID = null;
const AVATAR_COLORS = ["#1F6F5C", "#2451B0", "#C98A3B", "#8B3A62", "#3A6B8A", "#6B7A2E", "#7A3A3A"];

const sb =
  window.HALLMARK_SUPABASE_URL && !window.HALLMARK_SUPABASE_URL.includes("YOUR-PROJECT")
    ? window.supabase.createClient(window.HALLMARK_SUPABASE_URL, window.HALLMARK_SUPABASE_ANON_KEY)
    : null;

const el = (id) => document.getElementById(id);

async function resolveSession() {
  if (!sb) {
    document.querySelector(".dashboard-content").innerHTML =
      '<div class="error-box" style="color:var(--ink)">Supabase isn\'t configured yet.</div>';
    return false;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return false;
  }
  const { data: userRow, error } = await sb.from("users").select("id").eq("auth_user_id", session.user.id).single();
  if (error || !userRow) {
    await sb.auth.signOut();
    window.location.href = "index.html";
    return false;
  }
  CURRENT_USER_ID = userRow.id;

  const { data: existingWallets } = await sb.from("wallets").select("id").eq("user_id", CURRENT_USER_ID).limit(1);
  if (!existingWallets || existingWallets.length === 0) {
    window.location.href = "complete-profile.html";
    return false;
  }
  return true;
}

// ---- Icons (same set as elsewhere) ----

const ICON_PATHS = {
  dashboard: '<path d="M3 10.5 10 4l7 6.5M5 9.5V16h10V9.5"/>',
  accounts: '<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M3 8.5h14"/>',
  transfers: '<path d="M4 7h9M13 7l-3-3M13 7l-3 3M16 13H7M7 13l3-3M7 13l3 3"/>',
  payments: '<rect x="5" y="3" width="10" height="14" rx="1.5"/><path d="M7.5 7h5M7.5 10h5M7.5 13h3"/>',
  cards: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M2.5 8.5h15"/>',
  loans: '<path d="M10 3 3 7.5h14L10 3Z"/><path d="M4.5 8v6.5M8 8v6.5M12 8v6.5M15.5 8v6.5"/><path d="M3 16.5h14"/>',
  investments: '<path d="M3 16 8 10l3 3 6-7"/><path d="M3 16.5h14"/>',
  wealth: '<path d="M10 3 3.5 5.5v4c0 4 3 6.7 6.5 7.5 3.5-.8 6.5-3.5 6.5-7.5v-4L10 3Z"/>',
  statements: '<rect x="4" y="2.5" width="12" height="15" rx="1.5"/><path d="M7 6.5h6M7 9.5h6M7 12.5h4"/>',
  settings:
    '<circle cx="10" cy="10" r="4.3"/><circle cx="10" cy="10" r="1.9"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(0 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(45 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(90 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(135 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(180 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(225 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(270 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(315 10 10)"/>',
  search: '<circle cx="9" cy="9" r="5.5"/><path d="M17 17l-4-4"/>',
  bell: '<path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5 1.5 5h-13S5 12 5 8Z"/><path d="M8.3 15.5a1.8 1.8 0 0 0 3.4 0"/>',
  chevron: '<path d="M7.5 4.5 13 10l-5.5 5.5"/>',
  logout: '<path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/><path d="M9 10h8M14 6l3 4-3 4"/>',
  close: '<path d="M5 5l10 10M15 5 5 15"/>',
  hamburger: '<path d="M3 5h14M3 10h14M3 15h14"/>',
  trash: '<path d="M4.5 6h11M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M6 6l.6 9.4a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1L14 6"/>',
};

function icon(name, size = 18) {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}" style="display:block">${ICON_PATHS[name] || ""}</svg>`;
}
function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((elm) => { elm.innerHTML = icon(elm.dataset.icon); });
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function formatMoney(amount, currency) {
  const validCurrency = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: validCurrency || "USD" }).format(Number(amount) || 0);
}
function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2400);
}

const TICKER_PAIRS = [["USD", "GBP"], ["USD", "EUR"], ["GBP", "EUR"], ["GBP", "USD"], ["EUR", "USD"], ["EUR", "GBP"]];
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
    const itemsHtml = results.map((r) => `<span class="fx-ticker-item"><strong>${r.base} → ${r.quote}</strong>${Number(r.rate).toFixed(4)}</span>`).join("");
    track.innerHTML = itemsHtml + itemsHtml;
  } catch (err) {
    track.innerHTML = '<span class="fx-ticker-item">Exchange rates unavailable right now.</span>';
    console.warn("FX ticker fetch failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

let ACCOUNT = null;
let originalEmail = null;

function isNotificationVisible(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= 48 * 60 * 60 * 1000;
}

function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function initials(acc) { return ((acc.firstName[0] || "") + (acc.lastName[0] || "")).toUpperCase(); }

async function loadData() {
  const filters = (q) => q.eq("environment", "sandbox").eq("user_id", CURRENT_USER_ID);
  const [usersRes, profilesRes, walletsRes, beneficiariesRes, notifRes] = await Promise.all([
    sb.from("users").select("*").eq("environment", "sandbox").eq("id", CURRENT_USER_ID),
    filters(sb.from("profiles").select("*")),
    filters(sb.from("wallets").select("*")),
    filters(sb.from("beneficiaries").select("*")),
    filters(sb.from("notifications").select("*")),
  ]);

  const failed = [usersRes, profilesRes, walletsRes, beneficiariesRes, notifRes].find((r) => r.error);
  if (failed) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Couldn't load your settings (${failed.error.message}).</div>`;
    return;
  }

  const u = usersRes.data[0];
  const p = profilesRes.data[0] || {};
  const prefs = u.preferences || {};

  ACCOUNT = {
    id: u.id,
    email: u.email,
    phone: u.phone || "",
    country: u.country,
    emailVerified: !!u.email_verified,
    firstName: p.first_name || "",
    lastName: p.last_name || "",
    tier: p.tier || "Standard",
    dob: p.date_of_birth || "",
    address: p.address_line1 || "",
    city: p.city || "",
    postal: p.postal_code || "",
    avatarColor: AVATAR_COLORS[Math.abs(hashCode(u.id)) % AVATAR_COLORS.length],
    wallets: {},
    beneficiaries: beneficiariesRes.data.map((b) => ({ id: b.id, name: b.beneficiary_name, bankName: b.bank_name })),
    notifications: notifRes.data
      .filter((n) => isNotificationVisible(n.created_at))
      .map((n) => ({ id: n.id, message: n.message, isRead: n.is_read, date: n.created_at })),
    preferences: {
      notifEmail: prefs.notifEmail !== false,
      notifSms: prefs.notifSms !== false,
      notifPush: !!prefs.notifPush,
      notifSecurity: prefs.notifSecurity !== false,
      notifTransactions: prefs.notifTransactions !== false,
      notifLowBalance: prefs.notifLowBalance !== false,
      notifMarketing: !!prefs.notifMarketing,
      defaultTransferAccount: prefs.defaultTransferAccount || null,
      showCents: prefs.showCents !== false,
    },
  };
  walletsRes.data.forEach((w) => {
    ACCOUNT.wallets[w.wallet_type] = { id: w.id, currency: w.currency, balance: Number(w.current_balance) };
  });
  originalEmail = ACCOUNT.email;

  renderAll();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll() {
  el("user-avatar").textContent = initials(ACCOUNT);
  el("user-avatar").style.background = ACCOUNT.avatarColor;
  el("user-name").textContent = `${ACCOUNT.firstName} ${ACCOUNT.lastName}`;
  el("user-tier").textContent = ACCOUNT.tier;

  renderNotificationsDropdown();
  renderProfileForm();
  renderSecurity();
  renderNotificationPrefs();
  renderPayees();
  renderTransferPrefs();
  renderDisplayPrefs();
  loadFxTicker();
}

function renderNotificationsDropdown() {
  const unread = ACCOUNT.notifications.filter((n) => !n.isRead).length;
  const badge = el("bell-badge");
  badge.hidden = unread === 0;
  if (unread > 0) badge.textContent = unread > 9 ? "9+" : String(unread);
  const list = el("notif-list");
  list.innerHTML = ACCOUNT.notifications.length
    ? ACCOUNT.notifications.map((n) => `<div class="notif-row${n.isRead ? "" : " unread"}"><p class="notif-msg">${n.message}</p></div>`).join("")
    : '<p class="notif-empty">No notifications.</p>';
}

function renderProfileForm() {
  el("set-first-name").value = ACCOUNT.firstName;
  el("set-last-name").value = ACCOUNT.lastName;
  el("set-email").value = ACCOUNT.email;
  el("set-phone").value = ACCOUNT.phone;
  el("set-dob").value = ACCOUNT.dob ? ACCOUNT.dob.slice(0, 10) : "";
  el("set-country").value = ACCOUNT.country;
  el("set-address").value = ACCOUNT.address;
  el("set-city").value = ACCOUNT.city;
  el("set-postal").value = ACCOUNT.postal;
}

function renderSecurity() {
  const tag = el("email-verified-tag");
  const desc = el("email-verified-desc");
  if (ACCOUNT.emailVerified) {
    tag.textContent = "Verified";
    tag.className = "status-tag enabled";
    desc.textContent = `${ACCOUNT.email} is confirmed.`;
  } else {
    tag.textContent = "Unverified";
    tag.className = "status-tag warning";
    desc.textContent = `${ACCOUNT.email} hasn't been confirmed yet.`;
  }
}

function renderNotificationPrefs() {
  const p = ACCOUNT.preferences;
  el("notif-email").checked = p.notifEmail;
  el("notif-email-desc").textContent = `Sent to ${ACCOUNT.email}`;
  el("notif-sms").checked = p.notifSms;
  el("notif-sms-desc").textContent = ACCOUNT.phone ? `Sent to ${ACCOUNT.phone}` : "Add a phone number to enable this";
  el("notif-push").checked = p.notifPush;
  el("notif-security").checked = p.notifSecurity;
  el("notif-transactions").checked = p.notifTransactions;
  el("notif-low-balance").checked = p.notifLowBalance;
  el("notif-marketing").checked = p.notifMarketing;
}

function renderPayees() {
  const list = el("payees-list");
  if (ACCOUNT.beneficiaries.length === 0) {
    list.innerHTML = '<p class="helper-text">No saved payees yet — add one from the Transfers or Payments page.</p>';
    return;
  }
  list.innerHTML = ACCOUNT.beneficiaries
    .map(
      (b) => `
    <div class="linked-account" data-payee-id="${b.id}">
      <div class="linked-info">
        <span class="linked-logo">${b.name.slice(0, 2).toUpperCase()}</span>
        <div class="linked-details"><p class="linked-name">${b.name}</p><p class="linked-meta">${b.bankName}</p></div>
      </div>
      <button class="ghost-btn danger-btn" data-remove-payee="${b.id}" style="flex:none;"><span data-icon="trash"></span> Remove</button>
    </div>`
    )
    .join("");
  mountIcons(list);
  list.querySelectorAll("[data-remove-payee]").forEach((btn) => {
    btn.addEventListener("click", () => removePayee(btn.dataset.removePayee));
  });
}

function renderTransferPrefs() {
  const select = el("set-default-account");
  select.innerHTML = Object.entries(ACCOUNT.wallets)
    .map(([type, w]) => `<option value="${type}">${capitalize(type)} (${formatMoney(w.balance, w.currency)})</option>`)
    .join("");
  if (ACCOUNT.preferences.defaultTransferAccount && ACCOUNT.wallets[ACCOUNT.preferences.defaultTransferAccount]) {
    select.value = ACCOUNT.preferences.defaultTransferAccount;
  }
}

function renderDisplayPrefs() {
  el("pref-show-cents").checked = ACCOUNT.preferences.showCents;
}

// ---------------------------------------------------------------------------
// Saving (real writes)
// ---------------------------------------------------------------------------

async function savePreferences(patch) {
  ACCOUNT.preferences = { ...ACCOUNT.preferences, ...patch };
  const { error } = await sb.from("users").update({ preferences: ACCOUNT.preferences }).eq("id", ACCOUNT.id);
  return error;
}

async function removePayee(id) {
  if (!confirm("Remove this saved payee? You'll need to re-add them to send money to them again.")) return;
  const { error } = await sb.from("beneficiaries").delete().eq("id", id);
  if (error) {
    showToast(`Couldn't remove payee: ${error.message}`);
    return;
  }
  ACCOUNT.beneficiaries = ACCOUNT.beneficiaries.filter((b) => b.id !== id);
  renderPayees();
  showToast("Payee removed");
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function init() {
  mountIcons();
  loadFxTicker();

  el("btn-logout").addEventListener("click", async () => { await sb.auth.signOut(); window.location.href = "index.html"; });
  el("btn-signout-here").addEventListener("click", async () => { await sb.auth.signOut(); window.location.href = "index.html"; });
  el("btn-bell").addEventListener("click", (e) => { e.stopPropagation(); el("notif-dropdown").hidden = !el("notif-dropdown").hidden; });
  el("user-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = el("user-dropdown");
    dd.hidden = !dd.hidden;
    document.querySelector(".user-menu-chevron").classList.toggle("open", !dd.hidden);
  });
  document.addEventListener("click", (e) => {
    const notifDd = el("notif-dropdown");
    if (!notifDd.hidden && !notifDd.contains(e.target) && e.target !== el("btn-bell")) notifDd.hidden = true;
    const userDd = el("user-dropdown");
    if (!userDd.hidden && !userDd.contains(e.target) && !el("user-menu-btn").contains(e.target)) {
      userDd.hidden = true;
      document.querySelector(".user-menu-chevron").classList.remove("open");
    }
  });

  function openSidebar() { el("sidebar").classList.add("open"); el("sidebar-backdrop").classList.add("show"); }
  function closeSidebar() { el("sidebar").classList.remove("open"); el("sidebar-backdrop").classList.remove("show"); }
  el("btn-hamburger").addEventListener("click", openSidebar);
  el("btn-sidebar-close").addEventListener("click", closeSidebar);
  el("sidebar-backdrop").addEventListener("click", closeSidebar);

  document.querySelectorAll(".nav-item[data-nav]").forEach((btn) => {
    if (btn.dataset.nav === "settings") return;
    if (btn.dataset.nav === "dashboard") { btn.addEventListener("click", () => (window.location.href = "dashboard.html")); return; }
    if (btn.dataset.nav === "accounts") { btn.addEventListener("click", () => (window.location.href = "accounts.html")); return; }
    if (btn.dataset.nav === "transfers") { btn.addEventListener("click", () => (window.location.href = "transfers.html")); return; }
    if (btn.dataset.nav === "payments") { btn.addEventListener("click", () => (window.location.href = "payments.html")); return; }
    if (btn.dataset.nav === "cards") { btn.addEventListener("click", () => (window.location.href = "cards.html")); return; }
    btn.addEventListener("click", () => { showToast(`${btn.textContent.trim()} — coming soon in a later phase`); closeSidebar(); });
  });
  document.querySelectorAll("[data-coming-soon]").forEach((elm) => {
    elm.addEventListener("click", () => showToast(`${elm.dataset.comingSoon} — coming soon in a later phase`));
  });
  el("btn-explore").addEventListener("click", () => showToast("Explore Opportunities — coming soon in a later phase"));

  // Settings tab switching
  const navLinks = document.querySelectorAll(".settings-nav-link");
  const panels = document.querySelectorAll(".settings-panel");
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.forEach((l) => l.classList.toggle("active", l === link));
      panels.forEach((p) => { p.hidden = p.id !== "panel-" + link.dataset.panel; });
    });
  });

  // Profile save
  el("btn-save-profile").addEventListener("click", async () => {
    el("profile-error").hidden = true;
    const btn = el("btn-save-profile");
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "Saving…";

    const newEmail = el("set-email").value.trim();
    const updates = {
      phone: el("set-phone").value.trim(),
    };
    const profileUpdates = {
      first_name: el("set-first-name").value.trim(),
      last_name: el("set-last-name").value.trim(),
      date_of_birth: el("set-dob").value || null,
      address_line1: el("set-address").value.trim(),
      city: el("set-city").value.trim(),
      postal_code: el("set-postal").value.trim(),
    };

    const { error: userErr } = await sb.from("users").update(updates).eq("id", ACCOUNT.id);
    const { error: profileErr } = await sb.from("profiles").update(profileUpdates).eq("user_id", ACCOUNT.id);

    let emailMsg = "";
    if (newEmail !== originalEmail) {
      const { error: emailErr } = await sb.auth.updateUser({ email: newEmail });
      if (emailErr) {
        emailMsg = ` (email change failed: ${emailErr.message})`;
      } else {
        emailMsg = " — check your new email to confirm the change";
      }
    }

    btn.disabled = false;
    btn.textContent = originalLabel;

    if (userErr || profileErr) {
      el("profile-error").textContent = `Couldn't save: ${(userErr || profileErr).message}`;
      el("profile-error").hidden = false;
      return;
    }

    Object.assign(ACCOUNT, {
      phone: updates.phone,
      firstName: profileUpdates.first_name,
      lastName: profileUpdates.last_name,
      dob: profileUpdates.date_of_birth,
      address: profileUpdates.address_line1,
      city: profileUpdates.city,
      postal: profileUpdates.postal_code,
    });
    el("user-name").textContent = `${ACCOUNT.firstName} ${ACCOUNT.lastName}`;
    showToast("Profile saved" + emailMsg);
  });

  // Notifications save
  el("btn-save-notifications").addEventListener("click", async () => {
    const error = await savePreferences({
      notifEmail: el("notif-email").checked,
      notifSms: el("notif-sms").checked,
      notifPush: el("notif-push").checked,
      notifSecurity: el("notif-security").checked,
      notifTransactions: el("notif-transactions").checked,
      notifLowBalance: el("notif-low-balance").checked,
      notifMarketing: el("notif-marketing").checked,
    });
    showToast(error ? `Couldn't save: ${error.message}` : "Notification preferences saved");
  });

  // Transfer preferences save
  el("btn-save-transfer-prefs").addEventListener("click", async () => {
    const error = await savePreferences({ defaultTransferAccount: el("set-default-account").value });
    showToast(error ? `Couldn't save: ${error.message}` : "Transfer preference saved");
  });

  // Display preferences save
  el("btn-save-preferences").addEventListener("click", async () => {
    const error = await savePreferences({ showCents: el("pref-show-cents").checked });
    showToast(error ? `Couldn't save: ${error.message}` : "Display preferences saved");
  });

  const ok = await resolveSession();
  if (!ok) return;
  loadData();
  subscribeToNotifications();
}

function subscribeToNotifications() {
  sb.channel("notifications-" + CURRENT_USER_ID)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${CURRENT_USER_ID}` },
      (payload) => {
        const n = payload.new;
        if (!isNotificationVisible(n.created_at)) return;
        ACCOUNT.notifications.unshift({ id: n.id, message: n.message, isRead: n.is_read, date: n.created_at });
        renderNotificationsDropdown();
      }
    )
    .subscribe();
}

init();