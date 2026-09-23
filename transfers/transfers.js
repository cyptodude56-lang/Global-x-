// ---------------------------------------------------------------------------
// Hallmark — Transfers page.
//
// Same session/session-completeness gate as dashboard.html. Two transfer
// modes, both using the exact same rules as the dashboard's existing
// Transfer/Send modals (see app.js) — just surfaced as a full page instead
// of a modal, with a real (filtered) transaction history alongside it:
//   - "Between my accounts": moves money checking <-> savings
//   - "To a saved payee": pays one of the customer's real beneficiaries
// Like every other interactive action in this project, these post through
// the atomic post_wallet_transaction / post_internal_transfer RPCs, so
// balances and history are real and persist. See README.md ("Data &
// persistence").
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

// ---- Icons (same set as app.js/accounts.js) ----

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
  arrowDown: '<path d="M10 4v11M6 11l4 4 4-4"/>',
  arrowUp: '<path d="M10 16V5M6 9l4-4 4 4"/>',
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
let NOTIFY_TRANSACTIONS = true;
function formatMoney(amount, currency) {
  const validCurrency = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: validCurrency || "USD",
    minimumFractionDigits: SHOW_CENTS ? 2 : 0,
    maximumFractionDigits: SHOW_CENTS ? 2 : 0,
  }).format(Number(amount) || 0);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---- Ticker (same as app.js/accounts.js) ----

const TICKER_PAIRS = [
  ["USD", "GBP"], ["USD", "EUR"], ["GBP", "EUR"],
  ["GBP", "USD"], ["EUR", "USD"], ["EUR", "GBP"],
];

async function getFxRate(base, quote) {
  if (base === quote) return 1;
  const r = await fetch(`https://api.frankfurter.dev/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return Number(data.rate);
}

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
// Data + state
// ---------------------------------------------------------------------------

const RELEVANT_TYPES = ["transfer_out", "transfer_in", "payment_out"];

let ACCOUNT = null;
let txCounter = 0;
const state = { transferType: "internal", highlightIds: [] };
let DEFAULT_TRANSFER_ACCOUNT = null;

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

function newTxId() {
  txCounter += 1;
  return "local-" + txCounter;
}

async function loadData() {
  const filters = (q) => q.eq("user_id", CURRENT_USER_ID);

  const [usersRes, profilesRes, walletsRes, beneficiariesRes, txRes, notifRes] = await Promise.all([
    sb.from("users").select("*").eq("id", CURRENT_USER_ID),
    filters(sb.from("profiles").select("*")),
    filters(sb.from("wallets").select("*")),
    filters(sb.from("beneficiaries").select("*")),
    filters(sb.from("ledger_transactions").select("*")),
    filters(sb.from("notifications").select("*")),
  ]);

  const failed = [usersRes, profilesRes, walletsRes, beneficiariesRes, txRes, notifRes].find((r) => r.error);
  if (failed) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Couldn't load your data (${failed.error.message}).</div>`;
    return;
  }

  const u = usersRes.data[0];
  const p = profilesRes.data[0] || {};
  SHOW_CENTS = !(u && u.preferences && u.preferences.showCents === false);
  DEFAULT_TRANSFER_ACCOUNT = (u && u.preferences && u.preferences.defaultTransferAccount) || null;
  NOTIFY_TRANSACTIONS = !(u && u.preferences && u.preferences.notifTransactions === false);

  ACCOUNT = {
    id: u.id,
    firstName: p.first_name || "Customer",
    lastName: p.last_name || "",
    tier: p.tier || "Standard",
    avatarColor: AVATAR_COLORS[Math.abs(hashCode(u.id)) % AVATAR_COLORS.length],
    wallets: {},
    beneficiaries: beneficiariesRes.data.map((b) => ({ id: b.id, name: b.beneficiary_name, bankName: b.bank_name })),
    notifications: notifRes.data
      .filter((n) => isNotificationVisible(n.created_at))
      .map((n) => ({ id: n.id, message: n.message, isRead: n.is_read, date: n.created_at })),
    history: [],
  };

  walletsRes.data.forEach((w) => {
    ACCOUNT.wallets[w.wallet_type] = { id: w.id, currency: w.currency, balance: Number(w.current_balance), available: Number(w.available_balance) };
  });

  const walletTypeById = {};
  walletsRes.data.forEach((w) => { walletTypeById[w.id] = w.wallet_type; });

  txRes.data
    .filter((t) => RELEVANT_TYPES.includes(t.transaction_type))
    .forEach((t) => {
      const amt = Number(t.amount);
      ACCOUNT.history.push({
        id: t.id,
        label: t.label || capitalize(t.transaction_type),
        counterparty: t.counterparty,
        amount: Math.abs(amt),
        currency: t.currency,
        sign: amt >= 0 ? "+" : "-",
        date: formatDate(t.posted_at),
        rawDate: t.posted_at,
        status: t.status === "completed" ? "Completed" : capitalize(t.status),
        ref: t.provider_reference || null,
        walletLabel: walletTypeById[t.wallet_id] ? capitalize(walletTypeById[t.wallet_id]) : null,
      });
    });
  ACCOUNT.history.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

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

  renderNotifications();
  renderForm();
  renderHistory();
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
    ? ACCOUNT.notifications.map((n) => `<div class="notif-row${n.isRead ? "" : " unread"}"><p class="notif-msg">${n.message}</p></div>`).join("")
    : '<p class="notif-empty">No notifications.</p>';
}

function walletOptionsHtml() {
  return Object.entries(ACCOUNT.wallets)
    .map(([type, w]) => `<option value="${type}">${capitalize(type)} (${formatMoney(w.balance, w.currency)})</option>`)
    .join("");
}

let defaultAccountApplied = false;
function renderForm() {
  el("tf-from").innerHTML = walletOptionsHtml();
  if (!defaultAccountApplied && DEFAULT_TRANSFER_ACCOUNT && ACCOUNT.wallets[DEFAULT_TRANSFER_ACCOUNT]) {
    el("tf-from").value = DEFAULT_TRANSFER_ACCOUNT;
    defaultAccountApplied = true;
  }

  const hasPayees = ACCOUNT.beneficiaries.length > 0;
  el("type-payee").disabled = !hasPayees;
  el("type-payee").title = hasPayees ? "" : "No saved payees yet";

  if (state.transferType === "internal") {
    el("tf-to-field").hidden = false;
    el("tf-payee-field").hidden = true;
    el("tf-memo-field").hidden = true;
    updateToAccountNote();
  } else {
    el("tf-to-field").hidden = true;
    el("tf-payee-field").hidden = false;
    el("tf-memo-field").hidden = false;
    el("tf-payee").innerHTML = ACCOUNT.beneficiaries.map((b) => `<option value="${b.id}">${b.name} (${b.bankName})</option>`).join("");
  }
}

function updateToAccountNote() {
  const from = el("tf-from").value;
  const to = Object.keys(ACCOUNT.wallets).find((t) => t !== from);
  el("tf-to").value = to ? capitalize(to) : "—";
  el("transfer-form").dataset.to = to || "";
}

function renderHistory() {
  const list = el("transfer-history-list");
  list.innerHTML = "";
  if (ACCOUNT.history.length === 0) {
    list.innerHTML = `
      <div class="tx-empty">
        <span class="tx-empty-icon">${icon("transfers")}</span>
        <p class="tx-empty-title">No transfers yet</p>
        <p class="tx-empty-sub">Transfers between your accounts or to a saved payee will show up here.</p>
      </div>`;
    state.highlightIds = [];
    return;
  }

  ACCOUNT.history.forEach((t) => {
    const subtitleParts = [t.counterparty, t.walletLabel, t.ref ? `Ref: ${t.ref}` : null].filter(Boolean);
    const row = document.createElement("div");
    row.className = "tx-row" + (state.highlightIds.includes(t.id) ? " tx-enter" : "");
    row.innerHTML = `
      <span class="tx-icon ${t.sign === "+" ? "in" : "out"}">${icon(t.sign === "+" ? "arrowDown" : "arrowUp")}</span>
      <div class="tx-main">
        <p class="tx-label">${t.label}</p>
        <p class="tx-sub">${subtitleParts.join(", ")}</p>
      </div>
      <span class="tx-when">${t.date}</span>
      <span class="tx-amount ${t.sign === "+" ? "in" : "out"}">${t.sign}${formatMoney(t.amount, t.currency)}</span>
      ${t.status !== "Completed" ? `<span class="tx-status-pill">${t.status}</span>` : ""}
    `;
    list.appendChild(row);
  });
  state.highlightIds = [];
}

async function createNotification(type, message) {
  if (type === "transaction" && !NOTIFY_TRANSACTIONS) return;
  const { error } = await sb.from("notifications").insert({
    user_id: CURRENT_USER_ID, type, message, is_read: false,
  });
  if (error) console.warn(`Couldn't create ${type} notification (action still proceeds):`, error);
}

function addHistory(entry) {
  ACCOUNT.history.unshift(entry);
  state.highlightIds.push(entry.id);
}

function showFormError(msg) {
  const e = el("tf-error");
  e.textContent = msg;
  e.hidden = false;
}
function hideFormError() {
  el("tf-error").hidden = true;
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
    if (btn.dataset.nav === "transfers") return; // already here
    if (btn.dataset.nav === "dashboard") {
      btn.addEventListener("click", () => (window.location.href = "../dashboard/"));
      return;
    }
    if (btn.dataset.nav === "accounts") {
      btn.addEventListener("click", () => (window.location.href = "../accounts/"));
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

  el("type-internal").addEventListener("click", () => {
    state.transferType = "internal";
    el("type-internal").classList.add("active");
    el("type-payee").classList.remove("active");
    hideFormError();
    renderForm();
  });
  el("type-payee").addEventListener("click", () => {
    if (el("type-payee").disabled) return;
    state.transferType = "payee";
    el("type-payee").classList.add("active");
    el("type-internal").classList.remove("active");
    hideFormError();
    renderForm();
  });
  el("tf-from").addEventListener("change", () => {
    if (state.transferType === "internal") updateToAccountNote();
  });

  el("transfer-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideFormError();
    const amount = parseFloat(el("tf-amount").value);
    if (!amount || amount <= 0) {
      showFormError("Enter an amount greater than zero.");
      return;
    }

    const fromType = el("tf-from").value;
    const fromWallet = ACCOUNT.wallets[fromType];
    let notifMessage = null;

    if (state.transferType === "internal") {
      const toType = el("transfer-form").dataset.to;
      if (!toType) {
        showFormError("Add a second account to transfer between.");
        return;
      }
      const toWallet = ACCOUNT.wallets[toType];
      if (fromWallet.balance < amount) {
        showFormError(`Not enough ${fromWallet.currency} balance in ${fromType}.`);
        return;
      }
      let convertedAmount = amount;
      if (fromWallet.currency !== toWallet.currency) {
        try {
          const rate = await getFxRate(fromWallet.currency, toWallet.currency);
          convertedAmount = Math.round(amount * rate * 100) / 100;
        } catch (fxErr) {
          showFormError("Exchange rate unavailable right now — try again in a moment.");
          return;
        }
      }
      const { error: postErr } = await sb.rpc("post_internal_transfer", {
        p_from_wallet_id: fromWallet.id,
        p_to_wallet_id: toWallet.id,
        p_from_amount: amount,
        p_to_amount: convertedAmount,
        p_from_counterparty: `To ${capitalize(toType)}`,
        p_to_counterparty: `From ${capitalize(fromType)}`,
      });
      if (postErr) {
        showFormError(postErr.message || "Couldn't complete this transfer.");
        return;
      }
      fromWallet.balance -= amount;
      fromWallet.available -= amount;
      toWallet.balance += convertedAmount;
      toWallet.available += convertedAmount;
      addHistory({ id: newTxId(), label: "Internal transfer", counterparty: `To ${capitalize(toType)}`, amount, currency: fromWallet.currency, sign: "-", date: "Just now", status: "Completed", ref: null, walletLabel: capitalize(fromType) });
      addHistory({ id: newTxId(), label: "Internal transfer", counterparty: `From ${capitalize(fromType)}`, amount: convertedAmount, currency: toWallet.currency, sign: "+", date: "Just now", status: "Completed", ref: null, walletLabel: capitalize(toType) });
      showToast("Transfer complete");
      notifMessage = `You transferred ${formatMoney(amount, fromWallet.currency)} from ${capitalize(fromType)} to ${capitalize(toType)}${fromWallet.currency !== toWallet.currency ? ` (received as ${formatMoney(convertedAmount, toWallet.currency)})` : ""}.`;
    } else {
      const benId = el("tf-payee").value;
      const ben = ACCOUNT.beneficiaries.find((b) => b.id === benId);
      if (!ben) {
        showFormError("Choose a payee.");
        return;
      }
      if (fromWallet.balance < amount) {
        showFormError(`Not enough ${fromWallet.currency} balance in ${fromType}.`);
        return;
      }
      const memo = el("tf-memo").value.trim();
      const { error: postErr } = await sb.rpc("post_wallet_transaction", {
        p_wallet_id: fromWallet.id,
        p_amount: -amount,
        p_transaction_type: "payment_out",
        p_label: "Sent to beneficiary",
        p_counterparty: memo ? `${ben.name} — ${memo}` : ben.name,
      });
      if (postErr) {
        showFormError(postErr.message || "Couldn't complete this payment.");
        return;
      }
      fromWallet.balance -= amount;
      fromWallet.available -= amount;
      addHistory({ id: newTxId(), label: "Sent to beneficiary", counterparty: memo ? `${ben.name} — ${memo}` : ben.name, amount, currency: fromWallet.currency, sign: "-", date: "Just now", status: "Completed", ref: null, walletLabel: capitalize(fromType) });
      showToast(`Sent to ${ben.name}`);
      notifMessage = `You sent ${formatMoney(amount, fromWallet.currency)} to ${ben.name}.`;
    }

    if (notifMessage) await createNotification("transaction", notifMessage);

    el("tf-amount").value = "";
    if (el("tf-memo")) el("tf-memo").value = "";
    renderForm();
    renderHistory();
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
        renderNotifications();
      }
    )
    .subscribe();
}

init();