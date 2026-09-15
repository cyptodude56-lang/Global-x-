// ---------------------------------------------------------------------------
// Global Wallet — client-only demo
// All data lives in memory for the session. Nothing here talks to a server;
// it exists so a client can click through the concept before any real
// provider, ledger, or KYC integration is built.
// ---------------------------------------------------------------------------

const CURRENCIES = ["USD", "GBP", "EUR"];

// Mock, static sandbox FX rates. Not live market data.
const FX = {
  USD: { GBP: 0.79, EUR: 0.92 },
  GBP: { USD: 1.27, EUR: 1.16 },
  EUR: { USD: 1.09, GBP: 0.86 },
};

function rate(from, to) {
  if (from === to) return 1;
  return FX[from][to];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

let txCounter = 0;
function tx({ desc, amount, currency, sign, date, status }) {
  txCounter += 1;
  return { id: txCounter, desc, amount, currency, sign, date, status: status || "Completed" };
}

// ---------------------------------------------------------------------------
// Seed data — three demo accounts across the three launch countries
// ---------------------------------------------------------------------------

const users = {
  alice: {
    id: "alice",
    name: "Alice Morgan",
    country: "United States",
    flag: "🇺🇸",
    homeCurrency: "USD",
    avatarColor: "#1F6F5C",
    wallet: { USD: 4250.0, GBP: 320.5, EUR: 0 },
    card: { last4: "4821", expiry: "09/29", frozen: false },
    history: [
      tx({ desc: "Received from James Whitfield", amount: 150.0, currency: "GBP", sign: "+", date: daysAgo(1) }),
      tx({ desc: "Coffee & Co — card payment", amount: 6.4, currency: "USD", sign: "-", date: daysAgo(2) }),
      tx({ desc: "Exchanged USD → EUR", amount: 300.0, currency: "USD", sign: "-", date: daysAgo(5) }),
      tx({ desc: "Salary deposit — Acme Inc (Sandbox)", amount: 3200.0, currency: "USD", sign: "+", date: daysAgo(9) }),
      tx({ desc: "Sent to Lena Bauer", amount: 200.0, currency: "EUR", sign: "-", date: daysAgo(14) }),
      tx({ desc: "Withdrawal to Chase Bank (Sandbox)", amount: 500.0, currency: "USD", sign: "-", date: daysAgo(20) }),
    ],
  },
  james: {
    id: "james",
    name: "James Whitfield",
    country: "United Kingdom",
    flag: "🇬🇧",
    homeCurrency: "GBP",
    avatarColor: "#2451B0",
    wallet: { GBP: 2180.75, USD: 500.0, EUR: 140.0 },
    card: { last4: "7734", expiry: "03/28", frozen: false },
    history: [
      tx({ desc: "Sent to Alice Morgan", amount: 150.0, currency: "GBP", sign: "-", date: daysAgo(1) }),
      tx({ desc: "Freelance payment — Sandbox Client Ltd", amount: 850.0, currency: "GBP", sign: "+", date: daysAgo(4) }),
      tx({ desc: "Exchanged GBP → EUR", amount: 100.0, currency: "GBP", sign: "-", date: daysAgo(7), status: "Pending" }),
      tx({ desc: "Grocery — card payment", amount: 42.1, currency: "GBP", sign: "-", date: daysAgo(10) }),
      tx({ desc: "Deposit from Lloyds (Sandbox)", amount: 1000.0, currency: "GBP", sign: "+", date: daysAgo(18) }),
    ],
  },
  lena: {
    id: "lena",
    name: "Lena Bauer",
    country: "Germany",
    flag: "🇩🇪",
    homeCurrency: "EUR",
    avatarColor: "#C98A3B",
    wallet: { EUR: 3760.4, USD: 0, GBP: 95.2 },
    card: { last4: "1052", expiry: "11/28", frozen: false },
    history: [
      tx({ desc: "Received from James Whitfield", amount: 116.0, currency: "EUR", sign: "+", date: daysAgo(7) }),
      tx({ desc: "Rent — card payment", amount: 900.0, currency: "EUR", sign: "-", date: daysAgo(8) }),
      tx({ desc: "Client invoice — Sandbox GmbH", amount: 2100.0, currency: "EUR", sign: "+", date: daysAgo(15) }),
      tx({ desc: "Withdrawal to Deutsche Bank (Sandbox)", amount: 300.0, currency: "EUR", sign: "-", date: daysAgo(22) }),
      tx({ desc: "Exchanged EUR → GBP", amount: 110.0, currency: "EUR", sign: "-", date: daysAgo(25) }),
    ],
  },
};

const state = { currentUserId: null, highlightId: null };

// ---------------------------------------------------------------------------
// Screen helpers
// ---------------------------------------------------------------------------

const el = (id) => document.getElementById(id);

function initials(name) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function renderAccountList() {
  const list = el("account-list");
  list.innerHTML = "";
  Object.values(users).forEach((u) => {
    const btn = document.createElement("button");
    btn.className = "account-tile";
    btn.type = "button";
    btn.innerHTML = `
      <span class="avatar" style="background:${u.avatarColor}">${initials(u.name)}</span>
      <span>
        <p class="account-name">${u.name}</p>
        <p class="account-meta">${u.flag} ${u.country} · ${u.homeCurrency} account</p>
      </span>
    `;
    btn.addEventListener("click", () => selectAccount(u.id));
    list.appendChild(btn);
  });
}

function selectAccount(id) {
  state.currentUserId = id;
  el("screen-login").hidden = true;
  el("screen-dashboard").hidden = false;
  renderDashboard();
}

function switchAccount() {
  state.currentUserId = null;
  el("screen-dashboard").hidden = true;
  el("screen-login").hidden = false;
}

function currentUser() {
  return users[state.currentUserId];
}

function totalBalance(user) {
  return CURRENCIES.reduce((sum, cur) => {
    const bal = user.wallet[cur] || 0;
    return sum + bal * rate(cur, user.homeCurrency);
  }, 0);
}

function renderDashboard() {
  const u = currentUser();

  el("user-avatar").textContent = initials(u.name);
  el("user-avatar").style.background = u.avatarColor;
  el("user-name").textContent = u.name;
  el("user-loc").textContent = `${u.flag} ${u.country}`;

  el("total-balance").textContent = formatMoney(totalBalance(u), u.homeCurrency);

  const chips = el("currency-chips");
  chips.innerHTML = "";
  CURRENCIES.forEach((cur) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = `${cur} ${formatMoney(u.wallet[cur] || 0, cur).replace(/^[^\d-]+/, "")}`;
    chips.appendChild(chip);
  });

  renderCard(u);
  renderLedger(u);
}

function renderCard(u) {
  const card = el("virtual-card");
  card.className = "virtual-card" + (u.card.frozen ? " frozen" : "");
  card.innerHTML = `
    <div class="card-top">
      <span class="card-brand">Global Wallet</span>
      <span class="card-chip"></span>
    </div>
    <div class="card-number">•••• •••• •••• ${u.card.last4}</div>
    <div class="card-bottom">
      <span class="card-name">${u.name}</span>
      <span class="card-expiry">${u.card.expiry}</span>
    </div>
    ${u.card.frozen ? '<span class="frozen-tag">Frozen</span>' : ""}
  `;
  el("btn-freeze").textContent = u.card.frozen ? "Unfreeze card" : "Freeze card";
}

function renderLedger(u) {
  const list = el("ledger-list");
  list.innerHTML = "";
  u.history.forEach((t) => {
    const row = document.createElement("div");
    row.className = "ledger-row" + (t.id === state.highlightId ? " tx-enter" : "");
    row.innerHTML = `
      <span class="tx-date">${t.date}</span>
      <span class="tx-desc">${t.desc}</span>
      <span class="tx-amount ${t.sign === "+" ? "positive" : "negative"}">${t.sign}${formatMoney(t.amount, t.currency)}</span>
      ${t.status !== "Completed" ? `<span class="tx-status">${t.status}</span>` : "<span></span>"}
    `;
    list.appendChild(row);
  });
  state.highlightId = null;
}

function addHistory(user, entry) {
  user.history.unshift(entry);
  state.highlightId = entry.id;
}

// ---------------------------------------------------------------------------
// Modal
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

function currencyOptions(selected) {
  return CURRENCIES.map((c) => `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`).join("");
}

function otherUserOptions(excludeId) {
  return Object.values(users)
    .filter((u) => u.id !== excludeId)
    .map((u) => `<option value="${u.id}">${u.name}</option>`)
    .join("");
}

function formFor(kind) {
  const u = currentUser();
  if (kind === "add") {
    return `
      <p id="modal-title" class="modal-title">Add money</p>
      <p class="helper-text">Simulates an incoming deposit. No real bank is contacted.</p>
      <form id="tx-form">
        <div class="field"><label for="f-currency">Currency</label>
          <select id="f-currency">${currencyOptions(u.homeCurrency)}</select>
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
    return `
      <p id="modal-title" class="modal-title">Send money</p>
      <form id="tx-form">
        <div class="field"><label for="f-recipient">Send to</label>
          <select id="f-recipient">${otherUserOptions(u.id)}</select>
        </div>
        <div class="field"><label for="f-currency">From currency</label>
          <select id="f-currency">${currencyOptions(u.homeCurrency)}</select>
        </div>
        <div class="field"><label for="f-amount">Amount</label>
          <input id="f-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
        </div>
        <p class="form-error" id="f-error" hidden></p>
        <button class="submit-btn" type="submit">Send</button>
      </form>
    `;
  }
  if (kind === "exchange") {
    return `
      <p id="modal-title" class="modal-title">Exchange currency</p>
      <p class="helper-text">Uses a fixed sandbox rate, not a live market feed.</p>
      <form id="tx-form">
        <div class="field"><label for="f-from">From</label>
          <select id="f-from">${currencyOptions(u.homeCurrency)}</select>
        </div>
        <div class="field"><label for="f-to">To</label>
          <select id="f-to">${currencyOptions(CURRENCIES.find((c) => c !== u.homeCurrency))}</select>
        </div>
        <div class="field"><label for="f-amount">Amount</label>
          <input id="f-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
        </div>
        <p class="form-error" id="f-error" hidden></p>
        <button class="submit-btn" type="submit">Exchange</button>
      </form>
    `;
  }
  if (kind === "withdraw") {
    return `
      <p id="modal-title" class="modal-title">Withdraw</p>
      <p class="helper-text">Simulates a payout to an external bank account.</p>
      <form id="tx-form">
        <div class="field"><label for="f-currency">Currency</label>
          <select id="f-currency">${currencyOptions(u.homeCurrency)}</select>
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
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const u = currentUser();
    const amount = parseFloat(el("f-amount").value);

    if (!amount || amount <= 0) {
      showError("Enter an amount greater than zero.");
      return;
    }

    if (kind === "add") {
      const currency = el("f-currency").value;
      u.wallet[currency] = (u.wallet[currency] || 0) + amount;
      addHistory(u, tx({ desc: "Simulated deposit (Sandbox)", amount, currency, sign: "+", date: "Just now" }));
    }

    if (kind === "send") {
      const currency = el("f-currency").value;
      const recipient = users[el("f-recipient").value];
      if ((u.wallet[currency] || 0) < amount) {
        showError(`Not enough ${currency} balance.`);
        return;
      }
      u.wallet[currency] -= amount;
      recipient.wallet[currency] = (recipient.wallet[currency] || 0) + amount;
      addHistory(u, tx({ desc: `Sent to ${recipient.name}`, amount, currency, sign: "-", date: "Just now" }));
      addHistory(recipient, tx({ desc: `Received from ${u.name}`, amount, currency, sign: "+", date: "Just now" }));
    }

    if (kind === "exchange") {
      const from = el("f-from").value;
      const to = el("f-to").value;
      if (from === to) {
        showError("Choose two different currencies.");
        return;
      }
      if ((u.wallet[from] || 0) < amount) {
        showError(`Not enough ${from} balance.`);
        return;
      }
      const converted = amount * rate(from, to);
      u.wallet[from] -= amount;
      u.wallet[to] = (u.wallet[to] || 0) + converted;
      addHistory(
        u,
        tx({
          desc: `Exchanged to ${formatMoney(converted, to)}`,
          amount,
          currency: from,
          sign: "-",
          date: "Just now",
        })
      );
    }

    if (kind === "withdraw") {
      const currency = el("f-currency").value;
      if ((u.wallet[currency] || 0) < amount) {
        showError(`Not enough ${currency} balance.`);
        return;
      }
      u.wallet[currency] -= amount;
      addHistory(u, tx({ desc: "Simulated withdrawal (Sandbox)", amount, currency, sign: "-", date: "Just now" }));
    }

    closeModal();
    renderDashboard();
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function init() {
  renderAccountList();

  el("btn-switch").addEventListener("click", switchAccount);
  el("modal-close").addEventListener("click", closeModal);
  el("modal-backdrop").addEventListener("click", (e) => {
    if (e.target === el("modal-backdrop")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.action));
  });

  el("btn-freeze").addEventListener("click", () => {
    const u = currentUser();
    u.card.frozen = !u.card.frozen;
    renderCard(u);
  });
}

init();
