// ---------------------------------------------------------------------------
// Hallmark — dashboard page.
//
// Requires a real Supabase Auth session (established by login.js's OTP
// flow on index.html) — redirects back to the login page if there isn't
// one. The signed-in auth user is matched back to a customer record via
// the auth_user_id column (see auth_migration.sql / link_auth_users.sql).
// Row Level Security is now scoped to auth.uid() too, so this isn't just
// a UI-level check anymore — the anon key genuinely cannot read another
// customer's rows without that customer's own session. See README.md.
//
// Interactive actions (Add money / Send / Transfer / Withdraw) still only
// mutate an in-memory copy for this browser tab; nothing is written back
// to Supabase.
// ---------------------------------------------------------------------------

let CURRENT_USER_ID = null;

const FLAGS = { USA: "🇺🇸", UK: "🇬🇧", Germany: "🇩🇪" };
const AVATAR_COLORS = ["#1F6F5C", "#2451B0", "#C98A3B", "#8B3A62", "#3A6B8A", "#6B7A2E", "#7A3A3A"];

const PAN_FIELD_CANDIDATES = ["full_pan", "card_number", "pan", "unmasked_pan", "card_number_full", "number"];

const sb = window.HALLMARK_SB;

let ACCOUNT = null;
let txCounter = 0;
const state = { highlightIds: [], balanceRevealed: true, activeCardIndex: 0 };

const el = (id) => document.getElementById(id);

// Resolves the real Supabase session into a public.users id. Returns false
// (and redirects) if there's no session, or no customer row linked to it.
async function resolveSession() {
  CURRENT_USER_ID = await window.hallmarkResolveAccount({
    loginPath: "../index.html",
    incompleteProfilePath: "../onboarding/complete-profile.html",
    errorTarget: ".dashboard-content",
  });
  return CURRENT_USER_ID !== null;
}

// ---------------------------------------------------------------------------
// Small line-icon set (plain SVG, no external requests)
// ---------------------------------------------------------------------------

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
  eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"/><circle cx="10" cy="10" r="2.3"/>',
  eyeOff:
    '<path d="M3 3l14 14M6.1 6.4C4 7.7 2 10 2 10s3 5.5 8 5.5c1.4 0 2.7-.3 3.8-.9M9.1 4.6c.3 0 .6-.1.9-.1 5 0 8 5.5 8 5.5s-.6 1.2-1.8 2.5"/><path d="M8.2 11.7A2.3 2.3 0 0 1 10 7.7"/>',
  chevron: '<path d="M7.5 4.5 13 10l-5.5 5.5"/>',
  logout: '<path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/><path d="M9 10h8M14 6l3 4-3 4"/>',
  deposit: '<path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 16h14"/>',
  arrowDown: '<path d="M10 4v11M6 11l4 4 4-4"/>',
  arrowUp: '<path d="M10 16V5M6 9l4-4 4 4"/>',
  clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6.5V10l2.5 1.5"/>',
  savings: '<path d="M4.5 11.5c0-3.2 2.6-5.2 5.7-5.2 2.1 0 3.9 1 4.8 2.5.9.1 1.5.9 1.5 1.7s-.8 1.4-1.6 1.4v1.6a1 1 0 0 1-1 1h-1v1.5h-2V15h-2.4v1.5h-2V15c-1.2-.3-2-1.5-2-1.5Z"/><circle cx="13.6" cy="9.3" r=".6" fill="currentColor" stroke="none"/>',
  hamburger: '<path d="M3 6h14M3 10h14M3 14h14"/>',
  close: '<path d="M5 5l10 10M15 5L5 15"/>',
};

function icon(name, size = 18) {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}" style="display:block">${ICON_PATHS[name] || ""}</svg>`;
}

function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((elm) => {
    elm.innerHTML = icon(elm.dataset.icon);
  });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

let SHOW_CENTS = true;

function formatMoney(amount, currency) {
  const validCurrency = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  if (!validCurrency) {
    console.warn(`formatMoney: invalid currency "${currency}" for amount ${amount} — falling back to USD. This usually means a wallet row is missing its currency value.`);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: validCurrency || "USD",
    minimumFractionDigits: SHOW_CENTS ? 2 : 0,
    maximumFractionDigits: SHOW_CENTS ? 2 : 0,
  }).format(Number(amount) || 0);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function methodLabel(m) {
  return { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", atm: "ATM" }[m] || m;
}

function newTxId() {
  txCounter += 1;
  return "local-" + txCounter;
}

function tx({ label, counterparty, amount, currency, sign, date, walletLabel, status }) {
  return { id: newTxId(), label, counterparty, amount, currency, sign, date, status: status || "Completed", walletLabel };
}

function initials(acc) {
  return ((acc.firstName[0] || "") + (acc.lastName[0] || "")).toUpperCase();
}

function walletCurrency(acc) {
  const w = acc.wallets.checking || acc.wallets.savings || Object.values(acc.wallets)[0];
  if (!w) console.warn("walletCurrency: this account has no wallets at all — falling back to USD.", acc);
  return (w && w.currency) || "USD";
}

function detectFullPan(row) {
  for (const key of PAN_FIELD_CANDIDATES) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return String(row[key]);
    }
  }
  return null;
}

function lastFour(masked) {
  const match = String(masked || "").match(/(\d{4})\s*$/);
  return match ? match[1] : "????";
}

function formatPan(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 12) return raw;
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function isNotificationVisible(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= 48 * 60 * 60 * 1000;
}

function pushNotificationIfVisible(n) {
  if (!isNotificationVisible(n.created_at || n.date)) return false;
  ACCOUNT.notifications.push({ id: n.id, type: n.type, message: n.message, isRead: n.is_read, date: n.created_at || n.date });
  return true;
}

async function loadData() {
  if (!sb) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Supabase isn't configured yet. Open <code>supabase-config.js</code> and fill in your project URL and anon key — see README.md.</div>`;
    return;
  }

  const filters = (q) => q.eq("environment", "sandbox").eq("user_id", CURRENT_USER_ID);

  const [usersRes, profilesRes, walletsRes, cardsRes, beneficiariesRes, txRes, notifRes, profileCardsRes] = await Promise.all([
    sb.from("users").select("*").eq("environment", "sandbox").eq("id", CURRENT_USER_ID),
    filters(sb.from("profiles").select("*")),
    filters(sb.from("wallets").select("*")),
    filters(sb.from("cards").select("*")),
    filters(sb.from("beneficiaries").select("*")),
    filters(sb.from("ledger_transactions").select("*")),
    filters(sb.from("notifications").select("*")),
    filters(sb.from("profile_cards").select("*")),
  ]);

  const failed = [usersRes, profilesRes, walletsRes, cardsRes, beneficiariesRes, txRes, notifRes].find((r) => r.error);
  if (failed) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Couldn't load your data (${failed.error.message}). See README.md.</div>`;
    return;
  }
  // profile_cards is treated as optional/best-effort: if it errors (e.g. RLS
  // not set up on it yet), the rest of the dashboard still works, just
  // without full card numbers.
  const profileCards = profileCardsRes.error ? [] : profileCardsRes.data;
  if (profileCardsRes.error) {
    console.warn("profile_cards fetch failed (full card numbers won't show):", profileCardsRes.error);
  } else {
    console.info("profile_cards fetched:", profileCards.length, "row(s):", profileCards);
  }

  const u = usersRes.data[0];
  const p = profilesRes.data[0] || {};
  SHOW_CENTS = !(u && u.preferences && u.preferences.showCents === false);
  if (!u) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">No matching customer record for this login.</div>`;
    return;
  }

  ACCOUNT = {
    id: u.id,
    country: u.country,
    email: u.email,
    firstName: p.first_name || "Customer",
    lastName: p.last_name || "",
    tier: p.tier || "Standard",
    avatarColor: AVATAR_COLORS[Math.abs(hashCode(u.id)) % AVATAR_COLORS.length],
    wallets: {},
    cards: [],
    beneficiaries: [],
    history: [],
    notifications: [],
  };

  const walletTypeById = {};
  console.info("Wallets fetched for this account:", walletsRes.data.length, "row(s):", walletsRes.data);
  walletsRes.data.forEach((w) => {
    walletTypeById[w.id] = w.wallet_type;
    ACCOUNT.wallets[w.wallet_type] = {
      id: w.id,
      currency: w.currency,
      balance: Number(w.current_balance),
      available: Number(w.available_balance),
      maskedNumber: w.masked_number,
    };
  });

  cardsRes.data.forEach((c) => {
    // profile_cards is a separate table (not a column on `cards`) — match
    // by network + expiry, since that's the only shared identifying
    // combination available (no shared id, no is_virtual flag over there).
    const match = profileCards.find(
      (pc) => pc.user_id === c.user_id && lastFour(pc.masked_pan) === lastFour(c.masked_pan)
    );
    const resolvedFullPan = detectFullPan(c) || (match && match.masked_pan) || null;
    console.info(`Card ${lastFour(c.masked_pan)} — full number resolved:`, !!resolvedFullPan);
    ACCOUNT.cards.push({
      id: c.id,
      maskedPan: c.masked_pan,
      fullPan: resolvedFullPan,
      expiry: c.expiry,
      holder: c.card_holder_name,
      network: c.card_network,
      isVirtual: !!c.is_virtual,
      frozen: c.status !== "active",
      revealed: false,
    });
  });
  ACCOUNT.cards.sort((a, b) => Number(a.isVirtual) - Number(b.isVirtual));

  beneficiariesRes.data.forEach((b) => {
    ACCOUNT.beneficiaries.push({ id: b.id, name: b.beneficiary_name, bankName: b.bank_name });
  });

  txRes.data.forEach((t) => {
    const amt = Number(t.amount);
    ACCOUNT.history.push({
      id: t.id,
      label: t.label || capitalize(t.transaction_type),
      transactionType: t.transaction_type,
      counterparty: t.counterparty,
      amount: Math.abs(amt),
      signedAmount: amt,
      currency: t.currency,
      sign: amt >= 0 ? "+" : "-",
      date: formatDate(t.posted_at),
      timeLabel: formatTime(t.posted_at),
      rawDate: t.posted_at,
      status: t.status === "completed" ? "Completed" : capitalize(t.status),
      walletLabel: walletTypeById[t.wallet_id] ? capitalize(walletTypeById[t.wallet_id]) : null,
    });
  });
  ACCOUNT.history.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

  notifRes.data.forEach((n) => {
    pushNotificationIfVisible(n);
  });
  ACCOUNT.notifications.sort((a, b) => new Date(b.date) - new Date(a.date));

  console.info("Hallmark dashboard loaded:", {
    accounts: Object.keys(ACCOUNT.wallets).length,
    cards: ACCOUNT.cards.length,
    transactions: ACCOUNT.history.length,
    notifications: ACCOUNT.notifications.length,
  });

  renderAll();
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll() {
  renderTopbar();
  renderGreeting();
  renderBalance();
  renderAccountsGrid();
  renderQuickActionAvailability();
  renderLedger();
  renderCardTabs();
  renderCard();
  renderSpending();
  renderNotifications();
  loadExchangeRates();
}

function renderTopbar() {
  el("user-avatar").textContent = initials(ACCOUNT);
  el("user-avatar").style.background = ACCOUNT.avatarColor;
  el("user-name").textContent = `${ACCOUNT.firstName} ${ACCOUNT.lastName}`;
  el("user-tier").textContent = `${ACCOUNT.tier} · ${FLAGS[ACCOUNT.country] || ""} ${ACCOUNT.country}`;
}

function renderGreeting() {
  el("greeting").textContent = `${greetingWord()}, ${ACCOUNT.firstName}`;
  const now = new Date();
  el("page-date").textContent = now.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  el("page-time").textContent = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function renderBalance() {
  const total = Object.values(ACCOUNT.wallets).reduce((s, w) => s + w.balance, 0);
  const available = Object.values(ACCOUNT.wallets).reduce((s, w) => s + w.available, 0);
  const home = walletCurrency(ACCOUNT);
  el("total-balance").textContent = state.balanceRevealed ? formatMoney(total, home) : "•••••••••";
  el("available-balance").textContent = state.balanceRevealed ? formatMoney(available, home) : "•••••••••";
  el("btn-balance-eye").innerHTML = icon(state.balanceRevealed ? "eye" : "eyeOff");
}

function renderAccountsGrid() {
  const grid = el("accounts-grid");
  grid.innerHTML = "";
  const labels = { checking: "Main Current Account", savings: "Savings Account" };
  Object.entries(ACCOUNT.wallets).forEach(([type, w]) => {
    const card = document.createElement("div");
    card.className = `account-card ${type}`;
    card.innerHTML = `
      <div class="account-card-top">
        <span class="account-icon">${icon(type === "savings" ? "savings" : "cards")}</span>
        <span class="account-card-name">${labels[type] || capitalize(type)}</span>
      </div>
      <div class="account-card-number">•••• ${lastFour(w.maskedNumber)}</div>
      <div class="account-card-balance">${formatMoney(w.balance, w.currency)}</div>
      <div class="account-card-bottom">
        <span>${capitalize(type)}</span>
        <button class="account-withdraw-link" data-withdraw-from="${type}" type="button">Withdraw</button>
      </div>
    `;
    grid.appendChild(card);
  });
  grid.querySelectorAll("[data-withdraw-from]").forEach((btn) => {
    btn.addEventListener("click", () => openModal("withdraw", { presetAccount: btn.dataset.withdrawFrom }));
  });
}

function renderQuickActionAvailability() {
  document.querySelector('.quick-action-btn[data-action="transfer"]').disabled = Object.keys(ACCOUNT.wallets).length < 2;
}

function renderLedger() {
  const list = el("ledger-list");
  list.innerHTML = "";
  if (ACCOUNT.history.length === 0) {
    list.innerHTML = `
      <div class="tx-empty">
        <span class="tx-empty-icon">${icon("deposit")}</span>
        <p class="tx-empty-title">No transactions yet</p>
        <p class="tx-empty-sub">Add money to your account to see your activity show up here.</p>
        <button class="ghost-btn" id="tx-empty-add" type="button">Add money</button>
      </div>
    `;
    const addBtn = document.getElementById("tx-empty-add");
    if (addBtn) addBtn.addEventListener("click", () => openModal("add"));
    state.highlightIds = [];
    return;
  }
  ACCOUNT.history.forEach((t) => {
    const subtitleParts = [t.counterparty, t.walletLabel].filter(Boolean);
    const row = document.createElement("div");
    row.className = "tx-row" + (state.highlightIds.includes(t.id) ? " tx-enter" : "");
    row.innerHTML = `
      <span class="tx-icon ${t.sign === "+" ? "in" : "out"}">${icon(t.sign === "+" ? "arrowDown" : "arrowUp")}</span>
      <div class="tx-main">
        <p class="tx-label">${t.label}</p>
        <p class="tx-sub">${subtitleParts.join(", ")}</p>
      </div>
      <span class="tx-when">${t.date}, ${t.timeLabel}</span>
      <span class="tx-amount ${t.sign === "+" ? "in" : "out"}">${t.sign}${formatMoney(t.amount, t.currency)}</span>
      ${t.status !== "Completed" ? `<span class="tx-status-pill">${t.status}</span>` : ""}
    `;
    list.appendChild(row);
  });
  state.highlightIds = [];
}

function addHistory(entry) {
  ACCOUNT.history.unshift(entry);
  state.highlightIds.push(entry.id);
}

function renderCardTabs() {
  const wrap = el("card-tabs");
  wrap.innerHTML = "";
  if (ACCOUNT.cards.length <= 1) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  ACCOUNT.cards.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "card-tab" + (i === state.activeCardIndex ? " active" : "");
    b.textContent = c.isVirtual ? "Virtual" : "Debit";
    b.addEventListener("click", () => {
      state.activeCardIndex = i;
      renderCardTabs();
      renderCard();
    });
    wrap.appendChild(b);
  });
}

function renderCard() {
  const cardEl = el("virtual-card");
  const c = ACCOUNT.cards[state.activeCardIndex];
  if (!c) {
    cardEl.className = "debit-card-visual";
    cardEl.style.border = "2px dashed rgba(255,255,255,0.25)";
    cardEl.style.background = "transparent";
    cardEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted-invert);font-size:0.85rem;">No card yet</div>`;
    el("btn-freeze").hidden = true;
    el("btn-reveal").hidden = true;
    el("btn-get-card").hidden = false;
    return;
  }
  cardEl.style.border = "";
  cardEl.style.background = "";
  el("btn-get-card").hidden = true;
  el("btn-freeze").hidden = false;
  el("btn-reveal").hidden = false;

  const hiddenDisplay = `•••• •••• •••• ${lastFour(c.maskedPan)}`;
  const shownDisplay = c.fullPan ? formatPan(c.fullPan) : c.maskedPan;
  const numberToShow = c.revealed ? shownDisplay : hiddenDisplay;

  cardEl.className = "debit-card-visual" + (c.frozen ? " frozen" : "");
  cardEl.innerHTML = `
    <div class="card-top">
      <span class="card-brand">Hallmark</span>
      <span class="card-chip"></span>
    </div>
    <div class="card-number">${numberToShow}</div>
    <div class="card-bottom">
      <span>${c.holder}</span>
      <span class="card-network-mark">${(c.network || "").toUpperCase()}${c.isVirtual ? " · Virtual" : " Platinum"}</span>
    </div>
    ${c.frozen ? '<span class="frozen-tag">Frozen</span>' : ""}
  `;
  el("btn-freeze").textContent = c.frozen ? "Unfreeze card" : "Freeze card";

  if (!c.fullPan) {
    el("btn-reveal").disabled = true;
    el("btn-reveal").textContent = "Full number not loaded";
  } else {
    el("btn-reveal").disabled = false;
    el("btn-reveal").textContent = c.revealed ? "Hide details" : "Show details";
  }
}

// ---- Spending overview: computed from real ledger_transactions, not invented ----

const SPEND_TYPE_LABELS = { payment_out: "Payments", withdrawal: "Withdrawals", transfer_out: "Transfers" };
const SPEND_COLORS = { payment_out: "#C9A227", withdrawal: "#5B6B8C", transfer_out: "#8A93A6" };

function renderSpending() {
  const now = new Date();
  const outgoing = ACCOUNT.history.filter((t) => {
    const d = new Date(t.rawDate);
    return t.signedAmount < 0 && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const homeCurrency = walletCurrency(ACCOUNT);
  const totals = {};
  let grandTotal = 0;
  outgoing.forEach((t) => {
    const key = SPEND_TYPE_LABELS[t.transactionType] ? t.transactionType : "other";
    totals[key] = (totals[key] || 0) + t.amount;
    grandTotal += t.amount;
  });

  el("spend-total").textContent = formatMoney(grandTotal, homeCurrency);

  const legend = el("spend-legend");
  legend.innerHTML = "";
  const donutHost = el("spend-donut");

  if (grandTotal === 0) {
    donutHost.innerHTML = "";
    legend.innerHTML = '<p class="spend-empty">No outgoing transactions this month yet.</p>';
    return;
  }

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const OTHER_COLOR = "#C7CCD6";
  let offset = 0;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const arcs = entries
    .map(([key, value]) => {
      const pct = value / grandTotal;
      const dash = pct * circumference;
      const circle = `<circle cx="34" cy="34" r="${radius}" fill="none" stroke="${SPEND_COLORS[key] || OTHER_COLOR}" stroke-width="9" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 34 34)"/>`;
      offset += dash;
      return circle;
    })
    .join("");
  donutHost.innerHTML = `<svg width="68" height="68" viewBox="0 0 68 68">${arcs}</svg>`;

  entries.forEach(([key, value]) => {
    const pct = Math.round((value / grandTotal) * 100);
    const row = document.createElement("div");
    row.className = "spend-legend-row";
    row.innerHTML = `
      <span class="spend-dot" style="background:${SPEND_COLORS[key] || OTHER_COLOR}"></span>
      <span class="spend-legend-label">${SPEND_TYPE_LABELS[key] || "Other"}</span>
      <span class="spend-legend-pct">${pct}%</span>
    `;
    legend.appendChild(row);
  });
}

// ---- Notifications ----

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
  if (unread > 0) {
    badge.hidden = false;
    badge.textContent = unread > 9 ? "9+" : String(unread);
  } else {
    badge.hidden = true;
  }

  const list = el("notif-list");
  list.innerHTML = "";
  if (ACCOUNT.notifications.length === 0) {
    list.innerHTML = '<p class="notif-empty">No notifications.</p>';
    return;
  }
  ACCOUNT.notifications.forEach((n) => {
    const row = document.createElement("div");
    row.className = "notif-row" + (n.isRead ? "" : " unread");
    row.innerHTML = `
      <p class="notif-msg">${n.message}</p>
      <p class="notif-meta">${formatDate(n.date)}, ${formatTime(n.date)}</p>
    `;
    list.appendChild(row);
  });
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
    track.innerHTML = itemsHtml + itemsHtml;
  } catch (err) {
    track.innerHTML = '<span class="fx-ticker-item">Exchange rates unavailable right now.</span>';
    console.warn("FX ticker fetch failed:", err);
  }
}

// ---- Live exchange rates (Frankfurter — free, no API key, ECB-sourced) ----

const FX_CURRENCIES = ["USD", "GBP", "EUR"];

async function loadExchangeRates() {
  const home = walletCurrency(ACCOUNT);
  const others = FX_CURRENCIES.filter((c) => c !== home);
  const host = el("fx-rates");

  try {
    const results = await Promise.all(
      others.map((c) =>
        fetch(`https://api.frankfurter.dev/v2/rate/${home.toLowerCase()}/${c.toLowerCase()}`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
      )
    );

    host.innerHTML = "";
    results.forEach((r) => {
      const row = document.createElement("div");
      row.className = "fx-row";
      row.innerHTML = `
        <span class="fx-pair">${r.base} → ${r.quote}</span>
        <span class="fx-value">${Number(r.rate).toFixed(4)}</span>
      `;
      host.appendChild(row);
    });
    const asOf = document.createElement("p");
    asOf.className = "fx-asof";
    asOf.textContent = `As of ${results[0].date} · rates.frankfurter.dev`;
    host.appendChild(asOf);
  } catch (err) {
    host.innerHTML = '<p class="helper-text">Rates unavailable right now.</p>';
    console.warn("Exchange rate fetch failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Modal — Add money / Send / Transfer / Withdraw
// ---------------------------------------------------------------------------

let modalOptions = {};

function openModal(kind, options = {}) {
  modalOptions = options;
  el("modal-backdrop").hidden = false;
  el("modal-body").innerHTML = formFor(kind);
  wireForm(kind);
}

function closeModal() {
  el("modal-backdrop").hidden = true;
  el("modal-body").innerHTML = "";
  modalOptions = {};
}

function walletOptions(preset) {
  return Object.entries(ACCOUNT.wallets)
    .map(([type, w]) => `<option value="${type}" ${type === preset ? "selected" : ""}>${capitalize(type)} (${formatMoney(w.balance, w.currency)})</option>`)
    .join("");
}

function formFor(kind) {
  const acc = ACCOUNT;
  const preset = modalOptions.presetAccount;

  if (kind === "add") {
    return `
      <p id="modal-title" class="modal-title">Add money</p>
      <p class="helper-text">Simulates an incoming deposit. No real bank is contacted.</p>
      <form id="tx-form">
        <div class="field"><label for="f-account">Into</label>
          <select id="f-account">${walletOptions(preset)}</select>
        </div>
        <div class="field"><label for="f-method">Method</label>
          <select id="f-method">
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </div>
        <div id="f-bank-details" hidden>
          <div class="field"><label for="f-bank-account">Account number</label><input id="f-bank-account" type="text" inputmode="numeric" placeholder="Account number" /></div>
          <div class="field"><label for="f-bank-routing">Routing number</label><input id="f-bank-routing" type="text" inputmode="numeric" placeholder="9-digit routing number" /></div>
        </div>
        <div class="field"><label for="f-amount">Amount</label>
          <input id="f-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
        </div>
        <p class="form-error" id="f-error" hidden></p>
        <button class="submit-btn" type="submit">Add money</button>
      </form>
    `;
  }

  if (kind === "send") {
    const hasPayees = acc.beneficiaries.length > 0;
    return `
      <p id="modal-title" class="modal-title">Pay a bill / send money</p>
      <div class="transfer-type-toggle">
        <button type="button" class="transfer-type-btn${hasPayees ? " active" : ""}" data-send-mode="saved" ${hasPayees ? "" : "disabled"}>Saved payee</button>
        <button type="button" class="transfer-type-btn${hasPayees ? "" : " active"}" data-send-mode="new">Enter account details</button>
      </div>
      <form id="tx-form">
        <div class="field" id="f-saved-field" ${hasPayees ? "" : "hidden"}><label for="f-beneficiary">Pay to</label>
          <select id="f-beneficiary">
            <option value="">Select a payee…</option>
            ${acc.beneficiaries.map((b) => `<option value="${b.id}">${b.name} (${b.bankName})</option>`).join("")}
          </select>
        </div>
        <div id="f-new-fields" ${hasPayees ? "hidden" : ""}>
          <div class="field"><label for="f-new-name">Recipient name (optional)</label><input id="f-new-name" type="text" placeholder="e.g. Acme Corp — shown in your statement" /></div>
          <div class="field"><label for="f-new-account">Account number</label><input id="f-new-account" type="text" inputmode="numeric" placeholder="Account number" /></div>
          <div class="field"><label for="f-new-routing">Routing number</label><input id="f-new-routing" type="text" inputmode="numeric" placeholder="9-digit routing number" /></div>
          <label class="checkbox-row"><input type="checkbox" id="f-save-payee" checked /> Save this payee for next time</label>
        </div>
        <div class="field"><label for="f-account">From</label>
          <select id="f-account">${walletOptions(preset)}</select>
        </div>
        <div class="field"><label for="f-amount">Amount</label>
          <input id="f-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
        </div>
        <p class="form-error" id="f-error" hidden></p>
        <button class="submit-btn" type="submit">Send</button>
      </form>
    `;
  }

  if (kind === "transfer") {
    const types = Object.keys(acc.wallets);
    return `
      <p id="modal-title" class="modal-title">Transfer between accounts</p>
      <form id="tx-form">
        <div class="field"><label for="f-from">From</label>
          <select id="f-from">${types.map((t) => `<option value="${t}">${capitalize(t)}</option>`).join("")}</select>
        </div>
        <div class="field"><label for="f-amount">Amount</label>
          <input id="f-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
        </div>
        <p class="helper-text" id="f-to-note"></p>
        <p class="form-error" id="f-error" hidden></p>
        <button class="submit-btn" type="submit">Transfer</button>
      </form>
    `;
  }

  if (kind === "withdraw") {
    return `
      <p id="modal-title" class="modal-title">Withdraw</p>
      <p class="helper-text">Simulates a payout to an external bank account or ATM.</p>
      <form id="tx-form">
        <div class="field"><label for="f-account">From</label>
          <select id="f-account">${walletOptions(preset)}</select>
        </div>
        <div class="field"><label for="f-method">Method</label>
          <select id="f-method">
            <option value="atm">ATM</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </div>
        <div id="f-bank-details" hidden>
          <div class="field"><label for="f-bank-account">Account number</label><input id="f-bank-account" type="text" inputmode="numeric" placeholder="Account number" /></div>
          <div class="field"><label for="f-bank-routing">Routing number</label><input id="f-bank-routing" type="text" inputmode="numeric" placeholder="9-digit routing number" /></div>
        </div>
        <div class="field"><label for="f-amount">Amount</label>
          <input id="f-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
        </div>
        <p class="form-error" id="f-error" hidden></p>
        <button class="submit-btn" type="submit">Withdraw</button>
      </form>
    `;
  }

  return "";
}

function showError(msg) {
  const e = el("f-error");
  e.textContent = msg;
  e.hidden = false;
}

function wireForm(kind) {
  const form = el("tx-form");
  if (!form) return;
  const acc = ACCOUNT;

  if (kind === "transfer") {
    const updateToNote = () => {
      const from = el("f-from").value;
      const to = Object.keys(acc.wallets).find((t) => t !== from);
      el("f-to-note").textContent = to ? `To: ${capitalize(to)}` : "";
      form.dataset.to = to || "";
    };
    el("f-from").addEventListener("change", updateToNote);
    updateToNote();
  }

  if (kind === "add" || kind === "withdraw") {
    const updateBankDetailsVisibility = () => {
      el("f-bank-details").hidden = el("f-method").value !== "bank_transfer";
    };
    el("f-method").addEventListener("change", updateBankDetailsVisibility);
    updateBankDetailsVisibility();
  }

  if (kind === "send") {
    form.dataset.sendMode = acc.beneficiaries.length > 0 ? "saved" : "new";
    document.querySelectorAll('.transfer-type-btn[data-send-mode]').forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        form.dataset.sendMode = btn.dataset.sendMode;
        document.querySelectorAll('.transfer-type-btn[data-send-mode]').forEach((b) => b.classList.toggle("active", b === btn));
        el("f-saved-field").hidden = btn.dataset.sendMode !== "saved";
        el("f-new-fields").hidden = btn.dataset.sendMode !== "new";
      });
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const amount = parseFloat(el("f-amount").value);

    if (!amount || amount <= 0) {
      showError("Enter an amount greater than zero.");
      return;
    }

    if (kind === "add") {
      const type = el("f-account").value;
      const method = el("f-method").value;
      let counterparty = methodLabel(method);
      if (method === "bank_transfer") {
        const acctNum = el("f-bank-account").value.trim();
        const routingNum = el("f-bank-routing").value.trim();
        if (!acctNum || !routingNum) {
          showError("Enter the account number and routing number.");
          return;
        }
        counterparty = `${methodLabel(method)} (••••${acctNum.slice(-4)})`;
      }
      const wallet = acc.wallets[type];
      wallet.balance += amount;
      wallet.available += amount;
      addHistory(
        tx({ label: "Deposit", counterparty, amount, currency: wallet.currency, sign: "+", date: "Just now", walletLabel: capitalize(type) })
      );
    }

    if (kind === "send") {
      const type = el("f-account").value;
      const wallet = acc.wallets[type];
      const mode = form.dataset.sendMode;
      let recipientName;

      if (mode === "saved") {
        const benId = el("f-beneficiary").value;
        const ben = acc.beneficiaries.find((b) => b.id === benId);
        if (!ben) {
          showError("Choose a payee.");
          return;
        }
        recipientName = ben.name;
      } else {
        const newAccount = el("f-new-account").value.trim();
        const newRouting = el("f-new-routing").value.trim();
        if (!newAccount) {
          showError("Enter the recipient's account number.");
          return;
        }
        if (!newRouting) {
          showError("Enter the recipient's routing number.");
          return;
        }
        recipientName = el("f-new-name").value.trim() || `Account ending in ${newAccount.slice(-4)}`;

        if (el("f-save-payee").checked) {
          const { data: newBen, error: saveErr } = await sb
            .from("beneficiaries")
            .insert({
              user_id: CURRENT_USER_ID,
              beneficiary_name: recipientName,
              bank_name: "Mock Partner Bank",
              account_number: newAccount,
              routing_number: newRouting,
              environment: "sandbox",
            })
            .select()
            .single();
          if (!saveErr && newBen) {
            acc.beneficiaries.push({ id: newBen.id, name: newBen.beneficiary_name, bankName: newBen.bank_name });
          } else if (saveErr) {
            console.warn("Couldn't save new payee (payment still proceeds):", saveErr);
          }
        }
      }

      if (wallet.balance < amount) {
        showError(`Not enough ${wallet.currency} balance in ${type}.`);
        return;
      }
      wallet.balance -= amount;
      wallet.available -= amount;
      addHistory(
        tx({ label: "Sent to beneficiary", counterparty: recipientName, amount, currency: wallet.currency, sign: "-", date: "Just now", walletLabel: capitalize(type) })
      );
    }

    if (kind === "transfer") {
      const from = el("f-from").value;
      const to = form.dataset.to;
      if (!to) {
        showError("Add a second account to transfer between.");
        return;
      }
      const fromWallet = acc.wallets[from];
      const toWallet = acc.wallets[to];
      if (fromWallet.balance < amount) {
        showError(`Not enough ${fromWallet.currency} balance in ${from}.`);
        return;
      }
      fromWallet.balance -= amount;
      fromWallet.available -= amount;
      toWallet.balance += amount;
      toWallet.available += amount;
      addHistory(
        tx({ label: "Internal transfer", counterparty: `To ${capitalize(to)}`, amount, currency: fromWallet.currency, sign: "-", date: "Just now", walletLabel: capitalize(from) })
      );
      addHistory(
        tx({ label: "Internal transfer", counterparty: `From ${capitalize(from)}`, amount, currency: toWallet.currency, sign: "+", date: "Just now", walletLabel: capitalize(to) })
      );
    }

    if (kind === "withdraw") {
      const type = el("f-account").value;
      const method = el("f-method").value;
      const wallet = acc.wallets[type];
      if (wallet.balance < amount) {
        showError(`Not enough ${wallet.currency} balance in ${type}.`);
        return;
      }
      let counterparty = methodLabel(method);
      if (method === "bank_transfer") {
        const acctNum = el("f-bank-account").value.trim();
        const routingNum = el("f-bank-routing").value.trim();
        if (!acctNum || !routingNum) {
          showError("Enter the account number and routing number.");
          return;
        }
        counterparty = `${methodLabel(method)} (••••${acctNum.slice(-4)})`;
      }
      wallet.balance -= amount;
      wallet.available -= amount;
      addHistory(
        tx({ label: "Withdrawal", counterparty, amount, currency: wallet.currency, sign: "-", date: "Just now", walletLabel: capitalize(type) })
      );
    }

    closeModal();
    renderAll();
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
    window.location.href = "../index.html";
  });

  el("modal-close").addEventListener("click", closeModal);
  el("modal-backdrop").addEventListener("click", (e) => {
    if (e.target === el("modal-backdrop")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      el("notif-dropdown").hidden = true;
    }
  });

  document.querySelectorAll(".quick-action-btn[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      openModal(btn.dataset.action);
    });
  });

  el("btn-goto-cards").addEventListener("click", () => {
    window.location.href = "../cards/cards.html";
  });

  el("btn-freeze").addEventListener("click", () => {
    const c = ACCOUNT.cards[state.activeCardIndex];
    if (!c) return;
    c.frozen = !c.frozen;
    renderCard();
  });

  el("btn-reveal").addEventListener("click", () => {
    const c = ACCOUNT.cards[state.activeCardIndex];
    if (!c || !c.fullPan) return;
    c.revealed = !c.revealed;
    renderCard();
  });

  el("btn-get-card").addEventListener("click", async () => {
    const btn = el("btn-get-card");
    btn.disabled = true;
    btn.textContent = "Creating your card…";

    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    const middle = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("");
    const fullPan = "4111" + middle + last4;
    const expiry = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 4);
      return String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getFullYear()).slice(-2);
    })();

    const { error } = await sb.from("cards").insert({
      user_id: ACCOUNT.id,
      card_network: "Visa",
      card_type: "debit",
      masked_pan: `4111 **** **** ${last4}`,
      full_pan: fullPan,
      expiry,
      card_holder_name: `${ACCOUNT.firstName} ${ACCOUNT.lastName}`,
      status: "active",
      is_virtual: false,
      environment: "sandbox",
    });

    btn.disabled = false;
    btn.textContent = "Get card";

    if (error) {
      console.error("card creation error:", error);
      showToast(`Couldn't create your card: ${error.message}`);
      return;
    }

    ACCOUNT.cards.push({
      id: null,
      maskedPan: `4111 **** **** ${last4}`,
      fullPan,
      expiry,
      holder: `${ACCOUNT.firstName} ${ACCOUNT.lastName}`,
      network: "Visa",
      isVirtual: false,
      frozen: false,
      revealed: false,
    });
    state.activeCardIndex = ACCOUNT.cards.length - 1;
    renderCardTabs();
    renderCard();
  });

  el("btn-balance-eye").addEventListener("click", () => {
    state.balanceRevealed = !state.balanceRevealed;
    renderBalance();
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

  // Sidebar nav: Dashboard and Accounts are built. Everything else is an
  // honest "coming soon" rather than a silently-dead button.
  document.querySelectorAll(".nav-item[data-nav]").forEach((btn) => {
    if (btn.dataset.nav === "dashboard") {
      btn.addEventListener("click", closeSidebar);
      return;
    }
    if (btn.dataset.nav === "accounts") {
      btn.addEventListener("click", () => (window.location.href = "../accounts/accounts.html"));
      return;
    }
    if (btn.dataset.nav === "transfers") {
      btn.addEventListener("click", () => (window.location.href = "../transfers/transfers.html"));
      return;
    }
    if (btn.dataset.nav === "payments") {
      btn.addEventListener("click", () => (window.location.href = "../payments/payments.html"));
      return;
    }
    if (btn.dataset.nav === "cards") {
      btn.addEventListener("click", () => (window.location.href = "../cards/cards.html"));
      return;
    }
    if (btn.dataset.nav === "loans") {
      btn.addEventListener("click", () => (window.location.href = "../loans/loans.html"));
      return;
    }
    if (btn.dataset.nav === "statements") { 
      btn.addEventListener("click", () => (window.location.href = "../statements/statements.html")); 
      return; }

    if (btn.dataset.nav === "settings") {
      btn.addEventListener("click", () => (window.location.href = "../settings/settings.html"));
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
        if (pushNotificationIfVisible(payload.new)) {
          ACCOUNT.notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
          renderNotifications();
        }
      }
    )
    .subscribe();
}

init();