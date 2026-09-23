// ---------------------------------------------------------------------------
// Hallmark — Accounts page.
//
// Same session/session-completeness gate as dashboard.html (see app.js's
// resolveSession for why). Shows the customer's real checking + savings
// wallets with their actual account number and the region-appropriate
// secondary identifier (routing number for USA, sort code for UK,
// IBAN + BIC for Germany) — not the reference doc's three-different-
// currencies-per-person layout, since that's not how this system's data
// is shaped.
// ---------------------------------------------------------------------------

let CURRENT_USER_ID = null;
const AVATAR_COLORS = ["#1F6F5C", "#2451B0", "#C98A3B", "#8B3A62", "#3A6B8A", "#6B7A2E", "#7A3A3A"];

const sb = window.HALLMARK_SB;

const el = (id) => document.getElementById(id);

async function resolveSession() {
  CURRENT_USER_ID = await window.hallmarkResolveAccount({
    loginPath: "../",
    incompleteProfilePath: "../onboarding/complete-profile/",
    errorTarget: ".dashboard-content",
  });
  return CURRENT_USER_ID !== null;
}

// ---- Icons (same small set as app.js) ----

const ICON_PATHS = {
  dashboard: '<path d="M3 10.5 10 4l7 6.5M5 9.5V16h10V9.5"/>',
  accounts: '<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M3 8.5h14"/>',
  transfers: '<path d="M4 7h9M13 7l-3-3M13 7l-3 3M16 13H7M7 13l3-3M7 13l3 3"/>',
  payments: '<rect x="5" y="3" width="10" height="14" rx="1.5"/><path d="M7.5 7h5M7.5 10h5M7.5 13h3"/>',
  cards: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M2.5 8.5h15"/>',
  loans: '<path d="M10 3 3 7.5h14L10 3Z"/><path d="M4.5 8v6.5M8 8v6.5M12 8v6.5M15.5 8v6.5"/><path d="M3 16.5h14"/>',
  statements: '<rect x="4" y="2.5" width="12" height="15" rx="1.5"/><path d="M7 6.5h6M7 9.5h6M7 12.5h4"/>',
  settings:
    '<circle cx="10" cy="10" r="4.3"/><circle cx="10" cy="10" r="1.9"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(0 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(45 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(90 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(135 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(180 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(225 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(270 10 10)"/><rect x="8.9" y="3.1" width="2.2" height="2.4" rx="0.4" transform="rotate(315 10 10)"/>',
  search: '<circle cx="9" cy="9" r="5.5"/><path d="M17 17l-4-4"/>',
  bell: '<path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5 1.5 5h-13S5 12 5 8Z"/><path d="M8.3 15.5a1.8 1.8 0 0 0 3.4 0"/>',
  chevron: '<path d="M7.5 4.5 13 10l-5.5 5.5"/>',
  logout: '<path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/><path d="M9 10h8M14 6l3 4-3 4"/>',
  close: '<path d="M5 5l10 10M15 5 5 15"/>',
  hamburger: '<path d="M3 5h14M3 10h14M3 15h14"/>',
  eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"/><circle cx="10" cy="10" r="2.3"/>',
  eyeOff:
    '<path d="M3 3l14 14M6.1 6.4C4 7.7 2 10 2 10s3 5.5 8 5.5c1.4 0 2.7-.3 3.8-.9M9.1 4.6c.3 0 .6-.1.9-.1 5 0 8 5.5 8 5.5s-.6 1.2-1.8 2.5"/><path d="M8.2 11.7A2.3 2.3 0 0 1 10 7.7"/>',
  copy: '<rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4.5 13.5H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v.5"/>',
};

function icon(name, size = 18) {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}" style="display:block">${ICON_PATHS[name] || ""}</svg>`;
}

function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((elm) => {
    elm.innerHTML = icon(elm.dataset.icon);
  });
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

let SHOW_CENTS = true;
function formatMoney(amount, currency) {
  const validCurrency = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: validCurrency || "USD",
    minimumFractionDigits: SHOW_CENTS ? 2 : 0,
    maximumFractionDigits: SHOW_CENTS ? 2 : 0,
  }).format(Number(amount) || 0);
}

function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  showToast("Copied to clipboard");
}

// ---- Ticker (same as app.js) ----

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
      .map((r) => `<span class="fx-ticker-item"><strong>${r.base} → ${r.quote}</strong>${Number(r.rate).toFixed(4)}</span>`)
      .join("");
    track.innerHTML = itemsHtml + itemsHtml;
  } catch (err) {
    track.innerHTML = '<span class="fx-ticker-item">Exchange rates unavailable right now.</span>';
    console.warn("FX ticker fetch failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Data + rendering
// ---------------------------------------------------------------------------

let ACCOUNT = null;

async function loadData() {
  const filters = (q) => q.eq("user_id", CURRENT_USER_ID);

  const [usersRes, profilesRes, walletsRes, notifRes] = await Promise.all([
    sb.from("users").select("*").eq("id", CURRENT_USER_ID),
    filters(sb.from("profiles").select("*")),
    filters(sb.from("wallets").select("*")),
    filters(sb.from("notifications").select("*")),
  ]);

  const failed = [usersRes, profilesRes, walletsRes, notifRes].find((r) => r.error);
  if (failed) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Couldn't load your accounts (${failed.error.message}).</div>`;
    return;
  }

  const u = usersRes.data[0];
  const p = profilesRes.data[0] || {};
  SHOW_CENTS = !(u && u.preferences && u.preferences.showCents === false);

  ACCOUNT = {
    id: u.id,
    country: u.country,
    firstName: p.first_name || "Customer",
    lastName: p.last_name || "",
    tier: p.tier || "Standard",
    avatarColor: AVATAR_COLORS[Math.abs(hashCode(u.id)) % AVATAR_COLORS.length],
    wallets: walletsRes.data,
    notifications: notifRes.data
      .filter((n) => isNotificationVisible(n.created_at))
      .map((n) => ({ id: n.id, message: n.message, isRead: n.is_read, date: n.created_at })),
  };

  renderAll();
}

function isNotificationVisible(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= 48 * 60 * 60 * 1000;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function initials(acc) {
  return ((acc.firstName[0] || "") + (acc.lastName[0] || "")).toUpperCase();
}

function renderAll() {
  el("user-avatar").textContent = initials(ACCOUNT);
  el("user-avatar").style.background = ACCOUNT.avatarColor;
  el("user-name").textContent = `${ACCOUNT.firstName} ${ACCOUNT.lastName}`;
  el("user-tier").textContent = ACCOUNT.tier;

  const total = ACCOUNT.wallets.reduce((sum, w) => sum + Number(w.current_balance), 0);
  const homeCurrency = (ACCOUNT.wallets[0] && ACCOUNT.wallets[0].currency) || "USD";
  el("accounts-total").textContent = formatMoney(total, homeCurrency);

  renderNotifications();
  renderAccountsList();
  loadFxTicker();
}

async function markAllNotificationsRead() {
  if (!ACCOUNT.notifications.some((n) => !n.isRead)) return;
  ACCOUNT.notifications.forEach((n) => { n.isRead = true; });
  renderNotifications();
  const { error } = await sb.from("notifications").update({ is_read: true }).eq("user_id", CURRENT_USER_ID).eq("is_read", false);
  if (error) console.warn("Couldn't mark notifications as read:", error);
}

function renderNotifications() {
  const unread = ACCOUNT.notifications.filter((n) => !n.isRead).length;
  const badge = el("bell-badge");
  badge.hidden = unread === 0;
  if (unread > 0) badge.textContent = unread > 9 ? "9+" : String(unread);

  const list = el("notif-list");
  list.innerHTML = ACCOUNT.notifications.length
    ? ACCOUNT.notifications
        .map((n) => `<div class="notif-row${n.isRead ? "" : " unread"}"><p class="notif-msg">${n.message}</p></div>`)
        .join("")
    : '<p class="notif-empty">No notifications.</p>';
}

const WALLET_LABELS = { checking: "Main Current Account", savings: "Savings Account" };

function renderAccountsList() {
  const host = el("accounts-list");
  host.innerHTML = "";

  ACCOUNT.wallets.forEach((w) => {
    const card = document.createElement("section");
    card.className = "side-panel account-detail-card";

    const acctLast4 = (w.account_number || "").slice(-4) || (w.masked_number || "").replace(/\D/g, "").slice(-4);
    const acctMaskId = `acct-${w.id}`;

    let secondaryRowHtml = "";
    if (w.routing_number) {
      secondaryRowHtml = `
        <div class="detail-row">
          <span class="detail-label">Routing number</span>
          <div class="detail-value-wrap">
            <span class="detail-value">${w.routing_number}</span>
            <button class="copy-btn" data-copy="${w.routing_number}" aria-label="Copy routing number"><span data-icon="copy"></span></button>
          </div>
        </div>`;
    } else if (w.sort_code) {
      secondaryRowHtml = `
        <div class="detail-row">
          <span class="detail-label">Sort code</span>
          <div class="detail-value-wrap">
            <span class="detail-value">${w.sort_code}</span>
            <button class="copy-btn" data-copy="${w.sort_code}" aria-label="Copy sort code"><span data-icon="copy"></span></button>
          </div>
        </div>`;
    } else if (w.iban) {
      secondaryRowHtml = `
        <div class="detail-row">
          <span class="detail-label">BIC / SWIFT</span>
          <div class="detail-value-wrap">
            <span class="detail-value">${w.bic || "—"}</span>
            <button class="copy-btn" data-copy="${w.bic || ""}" aria-label="Copy BIC"><span data-icon="copy"></span></button>
          </div>
        </div>`;
    }

    const ibanRowHtml = w.iban
      ? `
        <div class="detail-row">
          <span class="detail-label">IBAN</span>
          <div class="detail-value-wrap">
            <span class="detail-value" id="${acctMaskId}-val">•••• ${w.iban.slice(-4)}</span>
            <button class="mask-toggle-btn" data-mask-id="${acctMaskId}" data-full="${w.iban}" data-masked="•••• ${w.iban.slice(-4)}">Show</button>
            <button class="copy-btn" data-copy="${w.iban}" aria-label="Copy IBAN"><span data-icon="copy"></span></button>
          </div>
        </div>`
      : `
        <div class="detail-row">
          <span class="detail-label">Account number</span>
          <div class="detail-value-wrap">
            <span class="detail-value" id="${acctMaskId}-val">•••• ${acctLast4}</span>
            ${
              w.account_number
                ? `<button class="mask-toggle-btn" data-mask-id="${acctMaskId}" data-full="${w.account_number}" data-masked="•••• ${acctLast4}">Show</button>
                   <button class="copy-btn" data-copy="${w.account_number}" aria-label="Copy account number"><span data-icon="copy"></span></button>`
                : `<span class="helper-text" style="margin:0;font-size:0.72rem;">Full number not loaded</span>`
            }
          </div>
        </div>`;


    card.innerHTML = `
      <div class="account-detail-top">
        <div>
          <p class="side-panel-title" style="margin-bottom:2px;">${WALLET_LABELS[w.wallet_type] || capitalize(w.wallet_type)}</p>
          <p class="helper-text" style="margin:0;">${capitalize(w.wallet_type)} · ${w.currency}</p>
        </div>
        <p class="account-detail-balance">${formatMoney(w.current_balance, w.currency)}</p>
      </div>
      <div class="details">
        ${ibanRowHtml}
        ${secondaryRowHtml}
      </div>
    `;
    host.appendChild(card);
  });

  mountIcons(host);

  host.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.dataset.copy;
      if (!text) return;
      copyToClipboard(text);
    });
  });

  host.querySelectorAll(".mask-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const valueEl = document.getElementById(`${btn.dataset.maskId}-val`);
      const isMasked = valueEl.textContent === btn.dataset.masked;
      valueEl.textContent = isMasked ? btn.dataset.full : btn.dataset.masked;
      btn.textContent = isMasked ? "Hide" : "Show";
    });
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function init() {
  mountIcons();
  loadFxTicker();

  el("btn-logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "../";
  });

  el("btn-bell").addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = el("notif-dropdown");
    const wasOpen = !dd.hidden;
    dd.hidden = wasOpen;
    if (wasOpen) markAllNotificationsRead();
  });

  el("user-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = el("user-dropdown");
    dd.hidden = !dd.hidden;
    document.querySelector(".user-menu-chevron").classList.toggle("open", !dd.hidden);
  });

  document.addEventListener("click", (e) => {
    const notifDd = el("notif-dropdown");
    if (!notifDd.hidden && !notifDd.contains(e.target) && e.target !== el("btn-bell")) {
      notifDd.hidden = true;
      markAllNotificationsRead();
    }
    const userDd = el("user-dropdown");
    if (!userDd.hidden && !userDd.contains(e.target) && !el("user-menu-btn").contains(e.target)) {
      userDd.hidden = true;
      document.querySelector(".user-menu-chevron").classList.remove("open");
    }
  });

  function openSidebar() {
    el("sidebar").classList.add("open");
    el("sidebar-backdrop").classList.add("show");
  }
  function closeSidebar() {
    el("sidebar").classList.remove("open");
    el("sidebar-backdrop").classList.remove("show");
  }
  el("btn-hamburger").addEventListener("click", openSidebar);
  el("btn-sidebar-close").addEventListener("click", closeSidebar);
  el("sidebar-backdrop").addEventListener("click", closeSidebar);

  document.querySelectorAll(".nav-item[data-nav]").forEach((btn) => {
    if (btn.dataset.nav === "accounts") return; // already here
    if (btn.dataset.nav === "dashboard") {
      btn.addEventListener("click", () => (window.location.href = "../dashboard/"));
      return;
    }
    if (btn.dataset.nav === "transfers") {
      btn.addEventListener("click", () => (window.location.href = "../transfers/"));
      return;
    }
    if (btn.dataset.nav === "payments") {
      btn.addEventListener("click", () => (window.location.href = "../payments/"));
      return;
    }
    if (btn.dataset.nav === "cards") {
      btn.addEventListener("click", () => (window.location.href = "../cards/"));
      return;
    }
    if (btn.dataset.nav === "loans") {
      btn.addEventListener("click", () => (window.location.href = "../loans/"));
      return;
    }

    if (btn.dataset.nav === "statements") { 
      btn.addEventListener("click", () => (window.location.href = "../statements/")); 
      return; }
    if (btn.dataset.nav === "settings") {
      btn.addEventListener("click", () => (window.location.href = "../settings/"));
      return;
    }
    btn.addEventListener("click", () => {
      showToast(`${btn.textContent.trim()} coming soon in a later phase`);
      closeSidebar();
    });
  });

  document.querySelectorAll("[data-coming-soon]").forEach((elm) => {
    elm.addEventListener("click", () => showToast(`${elm.dataset.comingSoon} coming soon in a later phase`));
  });

  el("btn-explore").addEventListener("click", () => showToast("Explore Opportunities coming soon in a later phase"));

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
        renderNotifications();
      }
    )
    .subscribe();
}

init();