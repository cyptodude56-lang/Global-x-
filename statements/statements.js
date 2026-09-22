// ---------------------------------------------------------------------------
// Hallmark — Statements page.
//
// Same session/session-completeness gate as every other page (see
// accounts.js / payments.js). Reads real ledger_transactions across all of
// the customer's wallets and lets them slice it by account, month, and
// income/expenses/transfers — then export the filtered view as CSV or print
// it. Styling lives in statements.css, a drop-in addition (styles.css is
// untouched) that reuses the same --ink/--gold/--paper palette as the rest
// of the app.
//
// Note on "Current balance": wallets only store today's live balance, not
// a historical end-of-period snapshot, so this page is honest about that —
// it shows Money in / Money out / Net for the selected period, and labels
// the balance figure "Current balance (today)" rather than pretending it's
// the period's closing balance.
// ---------------------------------------------------------------------------

let CURRENT_USER_ID = null;
const AVATAR_COLORS = ["#1F6F5C", "#2451B0", "#C98A3B", "#8B3A62", "#3A6B8A", "#6B7A2E", "#7A3A3A"];

const sb = window.HALLMARK_SB;

const el = (id) => document.getElementById(id);

async function resolveSession() {
  CURRENT_USER_ID = await window.hallmarkResolveAccount({
    loginPath: "../index.html",
    incompleteProfilePath: "../onboarding/complete-profile.html",
    errorTarget: ".dashboard-content",
  });
  return CURRENT_USER_ID !== null;
}

// ---- Icons (same set as elsewhere, plus download/print for this page) ----

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
  download: '<path d="M10 3v9M6 8l4 4 4-4"/><path d="M4 15.5h12"/>',
  print: '<rect x="5" y="7" width="10" height="6" rx="1"/><path d="M6 7V4h8v3M6 13v3h8v-3"/>',
};

function icon(name, size = 18) {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}" style="display:block">${ICON_PATHS[name] || ""}</svg>`;
}
function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((elm) => { elm.innerHTML = icon(elm.dataset.icon); });
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function lastFour(masked) {
  const match = String(masked || "").match(/(\d{4})\s*$/);
  return match ? match[1] : "????";
}
function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2400);
}
function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function initials(acc) { return ((acc.firstName[0] || "") + (acc.lastName[0] || "")).toUpperCase(); }
function formatMoney(amount, currency) {
  const validCurrency = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: validCurrency || "USD" }).format(Number(amount) || 0);
}
function formatDate(iso) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function isNotificationVisible(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= 48 * 60 * 60 * 1000;
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

const TYPE_LABELS = { deposit: "Income", payment_out: "Payment", withdrawal: "Withdrawal", transfer_out: "Transfer", transfer_in: "Transfer" };
const TRANSFER_TYPES = ["transfer_out", "transfer_in"];

let ACCOUNT = null;
const state = { account: "all", month: "all", tab: "all" };

async function loadData() {
  const filters = (q) => q.eq("environment", "sandbox").eq("user_id", CURRENT_USER_ID);

  const [usersRes, profilesRes, walletsRes, txRes, notifRes] = await Promise.all([
    sb.from("users").select("*").eq("environment", "sandbox").eq("id", CURRENT_USER_ID),
    filters(sb.from("profiles").select("*")),
    filters(sb.from("wallets").select("*")),
    filters(sb.from("ledger_transactions").select("*")),
    filters(sb.from("notifications").select("*")),
  ]);

  const failed = [usersRes, profilesRes, walletsRes, txRes, notifRes].find((r) => r.error);
  if (failed) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Couldn't load your statements (${failed.error.message}).</div>`;
    return;
  }

  const u = usersRes.data[0];
  const p = profilesRes.data[0] || {};

  const walletTypeById = {};
  const wallets = {};
  walletsRes.data.forEach((w) => {
    walletTypeById[w.id] = w.wallet_type;
    wallets[w.wallet_type] = { id: w.id, currency: w.currency, balance: Number(w.current_balance), maskedNumber: w.masked_number };
  });

  const transactions = txRes.data.map((t) => {
    const amt = Number(t.amount);
    const d = new Date(t.posted_at);
    return {
      id: t.id,
      walletType: walletTypeById[t.wallet_id] || null,
      label: t.label || capitalize(t.transaction_type),
      counterparty: t.counterparty,
      transactionType: t.transaction_type,
      signedAmount: amt,
      amount: Math.abs(amt),
      currency: t.currency,
      status: t.status === "completed" ? "Completed" : capitalize(t.status),
      rawDate: t.posted_at,
      dateLabel: formatDate(t.posted_at),
      monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      monthLabel: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  });
  transactions.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

  ACCOUNT = {
    id: u.id,
    firstName: p.first_name || "Customer",
    lastName: p.last_name || "",
    tier: p.tier || "Standard",
    avatarColor: AVATAR_COLORS[Math.abs(hashCode(u.id)) % AVATAR_COLORS.length],
    wallets,
    transactions,
    notifications: notifRes.data
      .filter((n) => isNotificationVisible(n.created_at))
      .map((n) => ({ id: n.id, message: n.message, isRead: n.is_read, date: n.created_at })),
  };

  const months = [...new Map(transactions.map((t) => [t.monthKey, t.monthLabel])).entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  state.month = months.length ? months[0][0] : "all";

  renderAll(months);
}

function categoryLabel(t) {
  return TYPE_LABELS[t.transactionType] || capitalize(t.transactionType || "Other");
}

function matchesTab(t, tab) {
  if (tab === "all") return true;
  if (tab === "income") return t.signedAmount >= 0;
  if (tab === "expenses") return t.signedAmount < 0 && !TRANSFER_TYPES.includes(t.transactionType);
  if (tab === "transfers") return TRANSFER_TYPES.includes(t.transactionType);
  return true;
}

function getFilteredTransactions() {
  return ACCOUNT.transactions.filter((t) => {
    if (state.account !== "all" && t.walletType !== state.account) return false;
    if (state.month !== "all" && t.monthKey !== state.month) return false;
    if (!matchesTab(t, state.tab)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll(months) {
  el("user-avatar").textContent = initials(ACCOUNT);
  el("user-avatar").style.background = ACCOUNT.avatarColor;
  el("user-name").textContent = `${ACCOUNT.firstName} ${ACCOUNT.lastName}`;
  el("user-tier").textContent = ACCOUNT.tier;

  renderNotifications();
  renderSelects(months);
  renderStatement();
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

function renderSelects(months) {
  const accountSelect = el("stmt-account-select");
  accountSelect.innerHTML =
    `<option value="all">All accounts</option>` +
    Object.entries(ACCOUNT.wallets)
      .map(([type, w]) => `<option value="${type}">${capitalize(type)} (•••• ${lastFour(w.maskedNumber)})</option>`)
      .join("");
  accountSelect.value = state.account;

  const monthSelect = el("stmt-month-select");
  monthSelect.innerHTML =
    `<option value="all">All time</option>` +
    months.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
  monthSelect.value = state.month;
}

function renderStatement() {
  const filtered = getFilteredTransactions();

  const monthOption = el("stmt-month-select").selectedOptions[0];
  el("stmt-period-badge").textContent = monthOption ? monthOption.textContent : "All time";

  renderTable(filtered);
  renderFooter(filtered);
}

function renderTable(rows) {
  const body = el("stmt-table-body");
  if (rows.length === 0) {
    body.innerHTML = `<tr class="stmt-empty-row"><td colspan="5">No transactions match this selection.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((t) => {
      const isIn = t.signedAmount >= 0;
      return `
        <tr>
          <td>${t.dateLabel}</td>
          <td>${t.label}${t.counterparty ? ` · ${t.counterparty}` : ""}</td>
          <td><span class="stmt-category-tag">${categoryLabel(t)}</span></td>
          <td>${t.walletType ? capitalize(t.walletType) : "—"}</td>
          <td style="text-align:right;" class="stmt-amount ${isIn ? "amt-in" : "amt-out"}">${isIn ? "+" : "−"} ${formatMoney(t.amount, t.currency).replace(/^-/, "")}</td>
        </tr>`;
    })
    .join("");
}

function renderFooter(rows) {
  const currency = (rows[0] && rows[0].currency) || (Object.values(ACCOUNT.wallets)[0] || {}).currency || "USD";
  const totalIn = rows.filter((t) => t.signedAmount >= 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = rows.filter((t) => t.signedAmount < 0).reduce((s, t) => s + t.amount, 0);

  el("stmt-total-in").textContent = formatMoney(totalIn, currency);
  el("stmt-total-out").textContent = formatMoney(totalOut, currency);
  const net = totalIn - totalOut;
  const netEl = el("stmt-net");
  netEl.textContent = `${net < 0 ? "−" : ""}${formatMoney(Math.abs(net), currency)}`;
  netEl.className = "stmt-footer-value" + (net > 0 ? " in" : net < 0 ? " out" : "");

  const relevantWallets = state.account === "all" ? Object.values(ACCOUNT.wallets) : [ACCOUNT.wallets[state.account]].filter(Boolean);
  const currentBalance = relevantWallets.reduce((s, w) => s + w.balance, 0);
  const balanceCurrency = relevantWallets[0] ? relevantWallets[0].currency : currency;
  el("stmt-current-balance").textContent = formatMoney(currentBalance, balanceCurrency);
}

// ---------------------------------------------------------------------------
// Export / print
// ---------------------------------------------------------------------------

function csvEscape(value) {
  const str = String(value == null ? "" : value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadStatementCsv() {
  const rows = getFilteredTransactions();
  const header = ["Date", "Description", "Category", "Account", "Amount", "Currency", "Status"];
  const lines = [header.join(",")];
  rows.forEach((t) => {
    lines.push(
      [
        t.dateLabel,
        t.label + (t.counterparty ? ` - ${t.counterparty}` : ""),
        categoryLabel(t),
        t.walletType ? capitalize(t.walletType) : "",
        (t.signedAmount >= 0 ? "" : "-") + t.amount.toFixed(2),
        t.currency,
        t.status,
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const periodPart = state.month === "all" ? "all-time" : state.month;
  a.href = url;
  a.download = `hallmark-statement-${periodPart}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(rows.length ? "Statement downloaded" : "Downloaded (no transactions in this selection)");
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function init() {
  mountIcons();
  loadFxTicker();

  el("btn-logout").addEventListener("click", async () => { await sb.auth.signOut(); window.location.href = "../index.html"; });
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

  function openSidebar() { el("sidebar").classList.add("open"); el("sidebar-backdrop").classList.add("show"); }
  function closeSidebar() { el("sidebar").classList.remove("open"); el("sidebar-backdrop").classList.remove("show"); }
  el("btn-hamburger").addEventListener("click", openSidebar);
  el("btn-sidebar-close").addEventListener("click", closeSidebar);
  el("sidebar-backdrop").addEventListener("click", closeSidebar);

  document.querySelectorAll(".nav-item[data-nav]").forEach((btn) => {
    if (btn.dataset.nav === "statements") return; // already here
    if (btn.dataset.nav === "dashboard") { btn.addEventListener("click", () => (window.location.href = "../dashboard/dashboard.html")); return; }
    if (btn.dataset.nav === "accounts") { btn.addEventListener("click", () => (window.location.href = "../accounts/accounts.html")); return; }
    if (btn.dataset.nav === "transfers") { btn.addEventListener("click", () => (window.location.href = "../transfers/transfers.html")); return; }
    if (btn.dataset.nav === "payments") { btn.addEventListener("click", () => (window.location.href = "../payments/payments.html")); return; }
    if (btn.dataset.nav === "loans") { btn.addEventListener("click", () => (window.location.href = "../loans/loans.html")); return; }
    if (btn.dataset.nav === "cards") { btn.addEventListener("click", () => (window.location.href = "../cards/cards.html")); return; }
    if (btn.dataset.nav === "settings") { btn.addEventListener("click", () => (window.location.href = "../settings/settings.html")); return; }
    btn.addEventListener("click", () => { showToast(`${btn.textContent.trim()} coming soon in a later phase`); closeSidebar(); });
  });
  el("btn-explore").addEventListener("click", () => showToast("Explore Opportunities coming soon in a later phase"));

  document.querySelectorAll(".stmt-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".stmt-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.tab = tab.dataset.type;
      renderStatement();
    });
  });
  el("stmt-account-select").addEventListener("change", (e) => { state.account = e.target.value; renderStatement(); });
  el("stmt-month-select").addEventListener("change", (e) => { state.month = e.target.value; renderStatement(); });

  el("btn-stmt-download").addEventListener("click", downloadStatementCsv);
  el("btn-stmt-print").addEventListener("click", () => window.print());

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
