// ---------------------------------------------------------------------------
// Hallmark — Payments page.
//
// Three tabs, each grounded in real data rather than the reference's
// invented "type in anyone's account/routing number" flow:
//   - Within the bank: pay a saved beneficiary whose bank_name is
//     'Sandbox Clearing House' (the seed data's own stand-in for Hallmark)
//   - Other banks: pay a saved beneficiary whose bank_name is
//     'Mock Partner Bank'
//   - Cards: the customer's real card(s), reusing the exact same
//     freeze/reveal logic as the dashboard, plus the real wallet a card
//     is linked to (cards.wallet_id) instead of the reference's invented
//     "credit limit" — Hallmark's cards are debit cards, not credit.
// Same in-memory-only mutation policy as everywhere else in this project.
// ---------------------------------------------------------------------------

let CURRENT_USER_ID = null;
const AVATAR_COLORS = ["#1F6F5C", "#2451B0", "#C98A3B", "#8B3A62", "#3A6B8A", "#6B7A2E", "#7A3A3A"];
const PAN_FIELD_CANDIDATES = ["full_pan", "card_number", "pan", "unmasked_pan", "card_number_full", "number"];

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
  arrowDown: '<path d="M10 4v11M6 11l4 4 4-4"/>',
  arrowUp: '<path d="M10 16V5M6 9l4-4 4 4"/>',
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
function formatDate(iso) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}
function detectFullPan(row) {
  for (const key of PAN_FIELD_CANDIDATES) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return String(row[key]);
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
let txCounter = 0;
const state = { highlightIds: [], activeCardIndex: 0 };

function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function initials(acc) { return ((acc.firstName[0] || "") + (acc.lastName[0] || "")).toUpperCase(); }
function newTxId() { txCounter += 1; return "local-" + txCounter; }

async function loadData() {
  const filters = (q) => q.eq("environment", "sandbox").eq("user_id", CURRENT_USER_ID);

  const [usersRes, profilesRes, walletsRes, beneficiariesRes, cardsRes, txRes, notifRes] = await Promise.all([
    sb.from("users").select("*").eq("environment", "sandbox").eq("id", CURRENT_USER_ID),
    filters(sb.from("profiles").select("*")),
    filters(sb.from("wallets").select("*")),
    filters(sb.from("beneficiaries").select("*")),
    filters(sb.from("cards").select("*")),
    filters(sb.from("ledger_transactions").select("*")),
    filters(sb.from("notifications").select("*")),
  ]);

  const failed = [usersRes, profilesRes, walletsRes, beneficiariesRes, cardsRes, txRes, notifRes].find((r) => r.error);
  if (failed) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Couldn't load your data (${failed.error.message}).</div>`;
    return;
  }

  const u = usersRes.data[0];
  const p = profilesRes.data[0] || {};

  ACCOUNT = {
    id: u.id,
    firstName: p.first_name || "Customer",
    lastName: p.last_name || "",
    tier: p.tier || "Standard",
    avatarColor: AVATAR_COLORS[Math.abs(hashCode(u.id)) % AVATAR_COLORS.length],
    wallets: {},
    walletTypeById: {},
    beneficiaries: beneficiariesRes.data.map((b) => ({ id: b.id, name: b.beneficiary_name, bankName: b.bank_name })),
    cards: [],
    notifications: notifRes.data.map((n) => ({ id: n.id, message: n.message, isRead: n.is_read, date: n.created_at })),
    paymentsHistory: [],
    cardHistory: [],
  };

  walletsRes.data.forEach((w) => {
    ACCOUNT.wallets[w.wallet_type] = { id: w.id, currency: w.currency, balance: Number(w.current_balance), available: Number(w.available_balance) };
    ACCOUNT.walletTypeById[w.id] = w.wallet_type;
  });

  cardsRes.data.forEach((c) => {
    ACCOUNT.cards.push({
      id: c.id, walletId: c.wallet_id, maskedPan: c.masked_pan, fullPan: detectFullPan(c), expiry: c.expiry,
      holder: c.card_holder_name, network: c.card_network, isVirtual: !!c.is_virtual, frozen: c.status !== "active", revealed: false,
    });
  });
  ACCOUNT.cards.sort((a, b) => Number(a.isVirtual) - Number(b.isVirtual));
  const cardWalletId = ACCOUNT.cards[0] ? ACCOUNT.cards[0].walletId : null;

  txRes.data.forEach((t) => {
    const amt = Number(t.amount);
    const entry = {
      id: t.id, label: t.label || capitalize(t.transaction_type), counterparty: t.counterparty,
      amount: Math.abs(amt), currency: t.currency, sign: amt >= 0 ? "+" : "-", date: formatDate(t.posted_at), rawDate: t.posted_at,
      status: t.status === "completed" ? "Completed" : capitalize(t.status), ref: t.provider_reference || null,
      walletLabel: ACCOUNT.walletTypeById[t.wallet_id] ? capitalize(ACCOUNT.walletTypeById[t.wallet_id]) : null,
    };
    if (t.transaction_type === "payment_out") ACCOUNT.paymentsHistory.push(entry);
    if (cardWalletId && t.wallet_id === cardWalletId) ACCOUNT.cardHistory.push(entry);
  });
  ACCOUNT.paymentsHistory.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
  ACCOUNT.cardHistory.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

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
  renderPayForm("wb", "Sandbox Clearing House");
  renderPayForm("ob", "Mock Partner Bank");
  renderPaymentsHistory();
  renderCardTabs();
  renderCard();
  renderCardLinkedInfo();
  renderCardHistory();
  loadFxTicker();
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
  return Object.entries(ACCOUNT.wallets).map(([type, w]) => `<option value="${type}">${capitalize(type)} (${formatMoney(w.balance, w.currency)})</option>`).join("");
}

function renderPayForm(prefix, bankName) {
  el(`${prefix}-from`).innerHTML = walletOptionsHtml();
  const payees = ACCOUNT.beneficiaries.filter((b) => b.bankName === bankName);
  const select = el(`${prefix}-payee`);
  const submitBtn = document.querySelector(`#${prefix === "wb" ? "within" : "other"}-form .submit-btn`);
  if (payees.length === 0) {
    select.innerHTML = `<option value="">No saved payees at this bank</option>`;
    submitBtn.disabled = true;
  } else {
    select.innerHTML = payees.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
    submitBtn.disabled = false;
  }
}

function renderTxRow(t) {
  const subtitleParts = [t.counterparty, t.walletLabel, t.ref ? `Ref: ${t.ref}` : null].filter(Boolean);
  const row = document.createElement("div");
  row.className = "tx-row" + (state.highlightIds.includes(t.id) ? " tx-enter" : "");
  row.innerHTML = `
    <span class="tx-icon ${t.sign === "+" ? "in" : "out"}">${icon(t.sign === "+" ? "arrowDown" : "arrowUp")}</span>
    <div class="tx-main"><p class="tx-label">${t.label}</p><p class="tx-sub">${subtitleParts.join(", ")}</p></div>
    <span class="tx-when">${t.date}</span>
    <span class="tx-amount ${t.sign === "+" ? "in" : "out"}">${t.sign}${formatMoney(t.amount, t.currency)}</span>
    ${t.status !== "Completed" ? `<span class="tx-status-pill">${t.status}</span>` : ""}
  `;
  return row;
}

function renderPaymentsHistory() {
  ["payments-history-list", "payments-history-list-2"].forEach((listId) => {
    const list = el(listId);
    list.innerHTML = "";
    if (ACCOUNT.paymentsHistory.length === 0) {
      list.innerHTML = `<div class="tx-empty"><span class="tx-empty-icon">${icon("payments")}</span><p class="tx-empty-title">No payments yet</p><p class="tx-empty-sub">Payments to your saved payees will show up here.</p></div>`;
      return;
    }
    ACCOUNT.paymentsHistory.forEach((t) => list.appendChild(renderTxRow(t)));
  });
  state.highlightIds = [];
}

function renderCardTabs() {
  const wrap = el("card-tabs");
  wrap.innerHTML = "";
  if (ACCOUNT.cards.length <= 1) { wrap.hidden = true; return; }
  wrap.hidden = false;
  ACCOUNT.cards.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "card-tab" + (i === state.activeCardIndex ? " active" : "");
    b.textContent = c.isVirtual ? "Virtual" : "Debit";
    b.addEventListener("click", () => { state.activeCardIndex = i; renderCardTabs(); renderCard(); renderCardLinkedInfo(); });
    wrap.appendChild(b);
  });
}

function renderCard() {
  const cardEl = el("virtual-card");
  const c = ACCOUNT.cards[state.activeCardIndex];
  if (!c) {
    cardEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted-invert);font-size:0.85rem;">No card yet — get one from the Dashboard</div>`;
    cardEl.style.border = "2px dashed rgba(255,255,255,0.25)";
    cardEl.style.background = "transparent";
    el("btn-freeze").hidden = true;
    el("btn-reveal").hidden = true;
    return;
  }
  cardEl.style.border = "";
  cardEl.style.background = "";
  el("btn-freeze").hidden = false;
  el("btn-reveal").hidden = false;

  const hiddenDisplay = `•••• •••• •••• ${lastFour(c.maskedPan)}`;
  const shownDisplay = c.fullPan ? formatPan(c.fullPan) : c.maskedPan;
  cardEl.className = "debit-card-visual" + (c.frozen ? " frozen" : "");
  cardEl.innerHTML = `
    <div class="card-top"><span class="card-brand">Hallmark</span><span class="card-chip"></span></div>
    <div class="card-number">${c.revealed ? shownDisplay : hiddenDisplay}</div>
    <div class="card-bottom"><span>${c.holder}</span><span class="card-network-mark">${(c.network || "").toUpperCase()}${c.isVirtual ? " · Virtual" : " Platinum"}</span></div>
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

function renderCardLinkedInfo() {
  const c = ACCOUNT.cards[state.activeCardIndex];
  if (!c) {
    el("card-linked-account").textContent = "—";
    el("card-linked-balance").textContent = "—";
    return;
  }
  const type = ACCOUNT.walletTypeById[c.walletId];
  const wallet = type ? ACCOUNT.wallets[type] : null;
  el("card-linked-account").textContent = type ? capitalize(type) : "Not linked";
  el("card-linked-balance").textContent = wallet ? formatMoney(wallet.balance, wallet.currency) : "—";
}

function renderCardHistory() {
  const list = el("card-history-list");
  list.innerHTML = "";
  if (ACCOUNT.cardHistory.length === 0) {
    list.innerHTML = `<div class="tx-empty"><span class="tx-empty-icon">${icon("cards")}</span><p class="tx-empty-title">No card activity yet</p><p class="tx-empty-sub">Activity on the account linked to this card will show up here.</p></div>`;
    return;
  }
  ACCOUNT.cardHistory.forEach((t) => list.appendChild(renderTxRow(t)));
}

function addPaymentHistory(entry) {
  ACCOUNT.paymentsHistory.unshift(entry);
  state.highlightIds.push(entry.id);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wirePayForm(prefix, formId) {
  el(formId).addEventListener("submit", (e) => {
    e.preventDefault();
    el(`${prefix}-error`).hidden = true;

    const amount = parseFloat(el(`${prefix}-amount`).value);
    if (!amount || amount <= 0) {
      el(`${prefix}-error`).textContent = "Enter an amount greater than zero.";
      el(`${prefix}-error`).hidden = false;
      return;
    }
    const fromType = el(`${prefix}-from`).value;
    const wallet = ACCOUNT.wallets[fromType];
    const benId = el(`${prefix}-payee`).value;
    const bankName = el(formId).dataset.bank;
    const ben = ACCOUNT.beneficiaries.find((b) => b.id === benId && b.bankName === bankName);
    if (!ben) {
      el(`${prefix}-error`).textContent = "Choose a payee.";
      el(`${prefix}-error`).hidden = false;
      return;
    }
    if (wallet.balance < amount) {
      el(`${prefix}-error`).textContent = `Not enough ${wallet.currency} balance in ${fromType}.`;
      el(`${prefix}-error`).hidden = false;
      return;
    }

    const memo = el(`${prefix}-memo`).value.trim();
    wallet.balance -= amount;
    wallet.available -= amount;
    addPaymentHistory({
      id: newTxId(), label: "Payment sent", counterparty: memo ? `${ben.name} — ${memo}` : ben.name,
      amount, currency: wallet.currency, sign: "-", date: "Just now", status: "Completed", ref: null, walletLabel: capitalize(fromType),
    });
    showToast(`Sent to ${ben.name}`);
    el(`${prefix}-amount`).value = "";
    el(`${prefix}-memo`).value = "";
    renderPayForm(prefix, bankName);
    renderPaymentsHistory();
  });
}

async function init() {
  mountIcons();
  loadFxTicker();

  el("btn-logout").addEventListener("click", async () => { await sb.auth.signOut(); window.location.href = "index.html"; });
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
    if (btn.dataset.nav === "payments") return;
    if (btn.dataset.nav === "dashboard") { btn.addEventListener("click", () => (window.location.href = "dashboard.html")); return; }
    if (btn.dataset.nav === "accounts") { btn.addEventListener("click", () => (window.location.href = "accounts.html")); return; }
    if (btn.dataset.nav === "transfers") { btn.addEventListener("click", () => (window.location.href = "transfers.html")); return; }
    if (btn.dataset.nav === "cards") { btn.addEventListener("click", () => (window.location.href = "cards.html")); return; }
    btn.addEventListener("click", () => { showToast(`${btn.textContent.trim()} — coming soon in a later phase`); closeSidebar(); });
  });
  document.querySelectorAll("[data-coming-soon]").forEach((elm) => {
    elm.addEventListener("click", () => showToast(`${elm.dataset.comingSoon} — coming soon in a later phase`));
  });
  el("btn-explore").addEventListener("click", () => showToast("Explore Opportunities — coming soon in a later phase"));

  // Tabs
  const tabButtons = document.querySelectorAll(".pay-tab");
  const panels = { "within-bank": el("panel-within-bank"), "other-bank": el("panel-other-bank"), cards: el("panel-cards") };
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => { b.classList.toggle("active", b === btn); b.setAttribute("aria-selected", b === btn ? "true" : "false"); });
      Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== btn.dataset.tab; });
    });
  });

  wirePayForm("wb", "within-form");
  wirePayForm("ob", "other-form");

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

  const ok = await resolveSession();
  if (!ok) return;
  loadData();
}

init();