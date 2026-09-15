// ---------------------------------------------------------------------------
// Hallmark — client-only demo, backed by a real Supabase database.
//
// Reads (users, profiles, wallets, cards, beneficiaries, ledger_transactions,
// logins) come straight from Supabase. Login checks the entered email/
// username + password against the `logins` table you loaded from
// hallmark_logins.xlsx — see README.md for why that table needs to stay
// read-only-by-anon and what a real auth upgrade later would look like.
//
// Interactive actions (Add money / Send / Transfer / Withdraw) still only
// mutate an in-memory copy for the current browser session — they are NOT
// written back to Supabase. See README.md for why, and how to change it.
// ---------------------------------------------------------------------------

const FLAGS = { USA: "🇺🇸", UK: "🇬🇧", Germany: "🇩🇪" };
const AVATAR_COLORS = ["#1F6F5C", "#2451B0", "#C98A3B", "#8B3A62", "#3A6B8A", "#6B7A2E", "#7A3A3A"];

// Card numbers were added to the `cards` table separately from the seed
// data, under a column name we don't know for certain — we check the most
// likely names, in order, and use whichever is actually present. If your
// column is named something else, add it to this list.
const PAN_FIELD_CANDIDATES = ["full_pan", "card_number", "pan", "unmasked_pan", "card_number_full", "number"];

const sb =
  window.HALLMARK_SUPABASE_URL && !window.HALLMARK_SUPABASE_URL.includes("YOUR-PROJECT")
    ? window.supabase.createClient(window.HALLMARK_SUPABASE_URL, window.HALLMARK_SUPABASE_ANON_KEY)
    : null;

let ACCOUNTS = {};
let ORDER = [];
let LOGINS = [];
let txCounter = 0;

const state = { currentUserId: null, highlightIds: [] };

const el = (id) => document.getElementById(id);

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

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function greeting() {
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

// ---------------------------------------------------------------------------
// Data loading — replaces the old hardcoded seed arrays
// ---------------------------------------------------------------------------

async function loadData() {
  if (!sb) {
    showLoginStatus(
      `<div class="error-box">Supabase isn't configured yet. Open <code>supabase-config.js</code> and fill in your project URL and anon key — see README.md for where to find them.</div>`
    );
    return;
  }

  showLoginStatus(`<p class="loading-text">Loading demo data…</p>`);
  el("login-submit").disabled = true;

  const tables = ["users", "profiles", "wallets", "cards", "beneficiaries", "ledger_transactions", "logins"];
  const results = await Promise.all(tables.map((t) => sb.from(t).select("*").eq("environment", "sandbox")));

  const failed = results.find((r) => r.error);
  if (failed) {
    showLoginStatus(
      `<div class="error-box">Couldn't load demo data (${failed.error.message}). Make sure you've run <code>schema.sql</code> and then <code>seed.sql</code> in your Supabase project's SQL editor, and that you've loaded a <code>logins</code> table matching <code>hallmark_logins.xlsx</code> — see README.md.</div>`
    );
    return;
  }

  const [usersRes, profilesRes, walletsRes, cardsRes, beneficiariesRes, txRes, loginsRes] = results;
  assemble(usersRes.data, profilesRes.data, walletsRes.data, cardsRes.data, beneficiariesRes.data, txRes.data);
  LOGINS = loginsRes.data;
  showLoginStatus("");
  el("login-submit").disabled = false;
}

function assemble(users, profiles, wallets, cards, beneficiaries, txs) {
  const profileByUser = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
  ACCOUNTS = {};
  ORDER = [];

  users
    .filter((u) => u.role === "customer")
    .forEach((u, i) => {
      const p = profileByUser[u.id] || {};
      ACCOUNTS[u.id] = {
        id: u.id,
        country: u.country,
        firstName: p.first_name || "Customer",
        lastName: p.last_name || "",
        tier: p.tier || "Standard",
        avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        wallets: {},
        cards: [],
        beneficiaries: [],
        history: [],
        activeCardIndex: 0,
      };
      ORDER.push(u.id);
    });

  const walletTypeById = {};
  wallets.forEach((w) => {
    walletTypeById[w.id] = w.wallet_type;
    const acc = ACCOUNTS[w.user_id];
    if (!acc) return;
    acc.wallets[w.wallet_type] = { id: w.id, currency: w.currency, balance: Number(w.current_balance) };
  });

  cards.forEach((c) => {
    const acc = ACCOUNTS[c.user_id];
    if (!acc) return;
    acc.cards.push({
      id: c.id,
      type: c.card_type,
      maskedPan: c.masked_pan,
      fullPan: detectFullPan(c),
      expiry: c.expiry,
      holder: c.card_holder_name,
      isVirtual: !!c.is_virtual,
      frozen: c.status !== "active",
      revealed: false,
    });
  });
  Object.values(ACCOUNTS).forEach((acc) => acc.cards.sort((a, b) => Number(a.isVirtual) - Number(b.isVirtual)));

  beneficiaries.forEach((b) => {
    const acc = ACCOUNTS[b.user_id];
    if (!acc) return;
    acc.beneficiaries.push({ id: b.id, name: b.beneficiary_name, bankName: b.bank_name });
  });

  txs.forEach((t) => {
    const acc = ACCOUNTS[t.user_id];
    if (!acc) return;
    const amt = Number(t.amount);
    acc.history.push({
      id: t.id,
      label: t.label || capitalize(t.transaction_type),
      counterparty: t.counterparty,
      amount: Math.abs(amt),
      currency: t.currency,
      sign: amt >= 0 ? "+" : "-",
      date: formatDate(t.posted_at),
      rawDate: t.posted_at,
      status: t.status === "completed" ? "Completed" : capitalize(t.status),
      walletLabel: walletTypeById[t.wallet_id] ? capitalize(walletTypeById[t.wallet_id]) : null,
    });
  });
  Object.values(ACCOUNTS).forEach((acc) => acc.history.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)));
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function initials(acc) {
  return ((acc.firstName[0] || "") + (acc.lastName[0] || "")).toUpperCase();
}

function walletCurrency(acc) {
  const w = acc.wallets.checking || acc.wallets.savings || Object.values(acc.wallets)[0];
  return w ? w.currency : "";
}

function showLoginStatus(html) {
  el("login-status").innerHTML = html;
}

function showLoginFormError(msg) {
  const e = el("login-error");
  e.textContent = msg;
  e.hidden = false;
}

function hideLoginFormError() {
  const e = el("login-error");
  e.hidden = true;
  e.textContent = "";
}

// Checks the entered identifier (email or username) + password against the
// `logins` table loaded from hallmark_logins.xlsx. This is a plain
// client-side match against plaintext demo passwords — fine for a sandbox
// with fake people, but see README.md before this pattern goes anywhere
// near real credentials.
function attemptLogin(identifier, password) {
  const id = identifier.trim().toLowerCase();
  return (
    LOGINS.find((l) => (l.email.toLowerCase() === id || l.username.toLowerCase() === id) && l.password === password) ||
    null
  );
}

function selectAccount(id) {
  state.currentUserId = id;
  el("screen-login").hidden = true;
  el("screen-dashboard").hidden = false;
  renderDashboard();
}

function logout() {
  const acc = currentUser();
  if (acc) acc.cards.forEach((c) => (c.revealed = false));
  state.currentUserId = null;
  el("screen-dashboard").hidden = true;
  el("screen-login").hidden = false;
  el("login-id").value = "";
  el("login-password").value = "";
  hideLoginFormError();
}

function currentUser() {
  return ACCOUNTS[state.currentUserId];
}

function renderDashboard() {
  const acc = currentUser();

  el("user-avatar").textContent = initials(acc);
  el("user-avatar").style.background = acc.avatarColor;
  el("user-name").textContent = `${greeting()}, ${acc.firstName}`;
  el("user-loc").textContent = `${FLAGS[acc.country] || ""} ${acc.country} · ${acc.tier}`;

  const home = walletCurrency(acc);
  const total = Object.values(acc.wallets).reduce((sum, w) => sum + w.balance, 0);
  el("total-balance").textContent = formatMoney(total, home);

  const chips = el("currency-chips");
  chips.innerHTML = "";
  Object.entries(acc.wallets).forEach(([type, w]) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = `${capitalize(type)} ${formatMoney(w.balance, w.currency)}`;
    chips.appendChild(chip);
  });

  document.querySelector('.action-btn[data-action="send"]').disabled = acc.beneficiaries.length === 0;
  document.querySelector('.action-btn[data-action="transfer"]').disabled = Object.keys(acc.wallets).length < 2;

  renderCardTabs(acc);
  renderCard(acc);
  renderLedger(acc);
}

function renderCardTabs(acc) {
  const wrap = el("card-tabs");
  wrap.innerHTML = "";
  if (acc.cards.length <= 1) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  acc.cards.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "card-tab" + (i === acc.activeCardIndex ? " active" : "");
    b.textContent = c.isVirtual ? "Virtual" : "Debit";
    b.addEventListener("click", () => {
      acc.activeCardIndex = i;
      renderCardTabs(acc);
      renderCard(acc);
    });
    wrap.appendChild(b);
  });
}

function renderCard(acc) {
  const cardEl = el("virtual-card");
  const c = acc.cards[acc.activeCardIndex];
  if (!c) {
    cardEl.innerHTML = "";
    el("btn-freeze").hidden = true;
    el("btn-reveal").hidden = true;
    return;
  }
  el("btn-freeze").hidden = false;
  el("btn-reveal").hidden = false;

  const hiddenDisplay = `•••• •••• •••• ${lastFour(c.maskedPan)}`;
  const shownDisplay = c.fullPan ? formatPan(c.fullPan) : c.maskedPan;
  const numberToShow = c.revealed ? shownDisplay : hiddenDisplay;

  cardEl.className = "virtual-card" + (c.frozen ? " frozen" : "");
  cardEl.innerHTML = `
    <div class="card-top">
      <span class="card-brand">Hallmark</span>
      <span class="card-chip"></span>
    </div>
    <div class="card-number">${numberToShow}</div>
    <div class="card-bottom">
      <span class="card-name">${c.holder}</span>
      <span class="card-expiry">${c.expiry}</span>
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

function renderLedger(acc) {
  const list = el("ledger-list");
  list.innerHTML = "";
  if (acc.history.length === 0) {
    list.innerHTML = '<p class="helper-text">No transactions yet.</p>';
    state.highlightIds = [];
    return;
  }
  acc.history.forEach((t) => {
    const subtitle = [t.counterparty, t.walletLabel].filter(Boolean).join(", ");
    const row = document.createElement("div");
    row.className = "ledger-row" + (state.highlightIds.includes(t.id) ? " tx-enter" : "");
    row.innerHTML = `
      <span class="tx-date">${t.date}</span>
      <span class="tx-desc">${t.label}${subtitle ? `<span class="tx-account">${subtitle}</span>` : ""}</span>
      <span class="tx-amount ${t.sign === "+" ? "positive" : "negative"}">${t.sign}${formatMoney(t.amount, t.currency)}</span>
      ${t.status !== "Completed" ? `<span class="tx-status">${t.status}</span>` : "<span></span>"}
    `;
    list.appendChild(row);
  });
  state.highlightIds = [];
}

function addHistory(acc, entry) {
  acc.history.unshift(entry);
  state.highlightIds.push(entry.id);
}

// ---------------------------------------------------------------------------
// Modal — Add money / Send / Transfer / Withdraw
// ---------------------------------------------------------------------------

function openModal(kind) {
  el("modal-backdrop").hidden = false;
  el("modal-body").innerHTML = formFor(kind);
  wireForm(kind);
}

function closeModal() {
  el("modal-backdrop").hidden = true;
  el("modal-body").innerHTML = "";
}

function walletOptions(acc) {
  return Object.entries(acc.wallets)
    .map(([type, w]) => `<option value="${type}">${capitalize(type)} (${formatMoney(w.balance, w.currency)})</option>`)
    .join("");
}

function formFor(kind) {
  const acc = currentUser();

  if (kind === "add") {
    return `
      <p id="modal-title" class="modal-title">Add money</p>
      <p class="helper-text">Simulates an incoming deposit. No real bank is contacted.</p>
      <form id="tx-form">
        <div class="field"><label for="f-account">Into</label>
          <select id="f-account">${walletOptions(acc)}</select>
        </div>
        <div class="field"><label for="f-method">Method</label>
          <select id="f-method">
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
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
    if (acc.beneficiaries.length === 0) {
      return `
        <p id="modal-title" class="modal-title">Send money</p>
        <p class="helper-text">No saved beneficiaries yet for this account.</p>
      `;
    }
    return `
      <p id="modal-title" class="modal-title">Send money</p>
      <form id="tx-form">
        <div class="field"><label for="f-beneficiary">Pay to</label>
          <select id="f-beneficiary">${acc.beneficiaries
            .map((b) => `<option value="${b.id}">${b.name} (${b.bankName})</option>`)
            .join("")}</select>
        </div>
        <div class="field"><label for="f-account">From</label>
          <select id="f-account">${walletOptions(acc)}</select>
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
          <select id="f-account">${walletOptions(acc)}</select>
        </div>
        <div class="field"><label for="f-method">Method</label>
          <select id="f-method">
            <option value="atm">ATM</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
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
  const acc = currentUser();

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const amount = parseFloat(el("f-amount").value);

    if (!amount || amount <= 0) {
      showError("Enter an amount greater than zero.");
      return;
    }

    if (kind === "add") {
      const type = el("f-account").value;
      const method = el("f-method").value;
      const wallet = acc.wallets[type];
      wallet.balance += amount;
      addHistory(
        acc,
        tx({ label: "Deposit", counterparty: methodLabel(method), amount, currency: wallet.currency, sign: "+", date: "Just now", walletLabel: capitalize(type) })
      );
    }

    if (kind === "send") {
      const benId = el("f-beneficiary").value;
      const ben = acc.beneficiaries.find((b) => b.id === benId);
      const type = el("f-account").value;
      const wallet = acc.wallets[type];
      if (wallet.balance < amount) {
        showError(`Not enough ${wallet.currency} balance in ${type}.`);
        return;
      }
      wallet.balance -= amount;
      addHistory(
        acc,
        tx({ label: "Sent to beneficiary", counterparty: ben.name, amount, currency: wallet.currency, sign: "-", date: "Just now", walletLabel: capitalize(type) })
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
      toWallet.balance += amount;
      addHistory(
        acc,
        tx({ label: "Internal transfer", counterparty: `To ${capitalize(to)}`, amount, currency: fromWallet.currency, sign: "-", date: "Just now", walletLabel: capitalize(from) })
      );
      addHistory(
        acc,
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
      wallet.balance -= amount;
      addHistory(
        acc,
        tx({ label: "Withdrawal", counterparty: methodLabel(method), amount, currency: wallet.currency, sign: "-", date: "Just now", walletLabel: capitalize(type) })
      );
    }

    closeModal();
    renderDashboard();
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function init() {
  el("btn-logout").addEventListener("click", logout);
  el("modal-close").addEventListener("click", closeModal);
  el("modal-backdrop").addEventListener("click", (e) => {
    if (e.target === el("modal-backdrop")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      openModal(btn.dataset.action);
    });
  });

  el("btn-freeze").addEventListener("click", () => {
    const acc = currentUser();
    const c = acc.cards[acc.activeCardIndex];
    if (!c) return;
    c.frozen = !c.frozen;
    renderCard(acc);
  });

  el("btn-reveal").addEventListener("click", () => {
    const acc = currentUser();
    const c = acc.cards[acc.activeCardIndex];
    if (!c || !c.fullPan) return;
    c.revealed = !c.revealed;
    renderCard(acc);
  });

  el("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    hideLoginFormError();

    if (!sb || LOGINS.length === 0) {
      showLoginFormError("Demo data hasn't finished loading yet — try again in a moment.");
      return;
    }

    const match = attemptLogin(el("login-id").value, el("login-password").value);
    if (!match) {
      showLoginFormError("Incorrect email/username or password.");
      return;
    }
    const acc = ACCOUNTS[match.user_id];
    if (!acc) {
      showLoginFormError("This login isn't linked to a customer dashboard in this demo.");
      return;
    }
    el("login-id").value = "";
    el("login-password").value = "";
    selectAccount(acc.id);
  });

  loadData();
}

init();