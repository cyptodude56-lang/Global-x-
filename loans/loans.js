// ---------------------------------------------------------------------------
// Hallmark — Loans page.
//
// Apply for Loan writes a real row to public.loans (see loans.sql at the
// repo root — run it once in the Supabase SQL editor before this page will
// work). Everything else on this page is derived from real data rather than
// invented numbers:
//   - Loan Status reads the real `status` + timestamp columns on the
//     customer's own loan rows. There's no admin dashboard yet (same gap as
//     KYC review), so an application sits in "submitted" until someone with
//     SQL editor access advances it by hand — see the comment block at the
//     top of loans.sql for the exact update statements.
//   - Loan Usage shows real disbursed amounts for the customer's own loans.
//     Repayments aren't tracked yet in this phase, so "repaid" is honestly
//     shown as $0 with a note, not invented.
//   - Loan Limit is a heuristic estimate computed from this account's real
//     wallets/transactions/loan history (see computeLoanLimit below) — it's
//     clearly labeled as an estimate, not a real underwriting decision.
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

// ---- Icons (same set as elsewhere) ----

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

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function createNotification(type, message) {
  const { error } = await sb.from("notifications").insert({
    user_id: CURRENT_USER_ID, type, message, is_read: false,
  });
  if (error) console.warn(`Couldn't create ${type} notification (action still proceeds):`, error);
}

// ---- Ticker (same as elsewhere) ----

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
// Loan math — clearly-labeled estimates, not real underwriting.
// ---------------------------------------------------------------------------

// Flat annual rate per loan type, used only to preview/store an estimated
// offer at submission time. A reviewer can override interest_rate_pct /
// monthly_repayment by hand later if the real approved terms differ.
const INTEREST_RATES = { personal: 15, business: 18, auto: 12, education: 8, mortgage: 10 };

function estimateRepayment(amount, months, loanType) {
  const rate = INTEREST_RATES[loanType] ?? 15;
  const totalInterest = amount * (rate / 100) * (months / 12);
  const monthly = (amount + totalInterest) / months;
  return { rate, monthly };
}

// Weighted "loan limit" score, computed entirely from this account's real
// data (not invented). This mirrors the shape of a typical scoring model
// but is a heuristic estimate — see the disclaimer shown next to it in the UI.
function computeLoanLimit(account) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // Account Activity — recent transaction frequency.
  const recentTx = account.transactions.filter((t) => now - new Date(t.rawDate).getTime() <= 90 * DAY).length;
  const activityScore = Math.min(100, recentTx * 8);

  // Deposit History — total balance held across wallets, relative to a
  // flat benchmark (this is an estimate, not a real underwriting threshold).
  const totalBalance = account.wallets.reduce((s, w) => s + Number(w.current_balance || 0), 0);
  const depositScore = Math.min(100, (totalBalance / 15000) * 100);

  // Repayment Record — based on this account's own loan history.
  const pastLoans = account.loans.filter((l) => ["completed", "active", "disbursed"].includes(l.status));
  const rejectedLoans = account.loans.filter((l) => l.status === "rejected");
  let repaymentScore = 60; // neutral baseline — no history yet
  let repaymentNote = "No loan history yet";
  if (pastLoans.length > 0 && rejectedLoans.length === 0) {
    repaymentScore = 100;
    repaymentNote = `${pastLoans.length} loan${pastLoans.length === 1 ? "" : "s"} in good standing`;
  } else if (rejectedLoans.length > 0) {
    repaymentScore = 40;
    repaymentNote = `${rejectedLoans.length} rejected application${rejectedLoans.length === 1 ? "" : "s"}`;
  }

  // Account Age — how long this has been a Hallmark account.
  let ageScore = 50;
  let ageNote = "Age unavailable";
  if (account.createdAt) {
    const days = (now - new Date(account.createdAt).getTime()) / DAY;
    ageScore = Math.min(100, (days / 365) * 100);
    ageNote = days < 30 ? "New account" : `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"} with Hallmark`;
  }

  // Relationship Value — how many Hallmark products are held.
  const productCount = account.wallets.length + account.cards.length + (account.loans.length > 0 ? 1 : 0);
  const relationshipScore = Math.min(100, productCount * 20);

  const factors = [
    { key: "activity", name: "Account Activity", weight: 25, score: activityScore, note: `${recentTx} transaction${recentTx === 1 ? "" : "s"} in the last 90 days` },
    { key: "deposits", name: "Deposit History", weight: 25, score: depositScore, note: formatMoney(totalBalance, (account.wallets[0] && account.wallets[0].currency) || "USD") + " held across your wallets" },
    { key: "repayment", name: "Repayment Record", weight: 20, score: repaymentScore, note: repaymentNote },
    { key: "age", name: "Account Age", weight: 15, score: ageScore, note: ageNote },
    { key: "relationship", name: "Relationship Value", weight: 15, score: relationshipScore, note: `${productCount} Hallmark product${productCount === 1 ? "" : "s"}` },
  ];

  const overallScore = factors.reduce((s, f) => s + f.score * (f.weight / 100), 0);

  // Available limit — a bounded, estimate-only formula: up to half of total
  // balance, scaled by the overall score, floored so it never reads as
  // literally zero for an active account.
  const rawLimit = totalBalance * 0.5 * (overallScore / 100);
  const availableLimit = totalBalance > 0 ? Math.max(500, Math.round(rawLimit)) : 0;

  return { factors, overallScore, availableLimit, homeCurrency: (account.wallets[0] && account.wallets[0].currency) || "USD" };
}

// ---------------------------------------------------------------------------
// Data + rendering
// ---------------------------------------------------------------------------

let ACCOUNT = null;
let LIMIT_INFO = null;

async function loadData() {
  const filters = (q) => q.eq("user_id", CURRENT_USER_ID);

  const [usersRes, profilesRes, walletsRes, cardsRes, txRes, notifRes, loansRes] = await Promise.all([
    sb.from("users").select("*").eq("id", CURRENT_USER_ID),
    filters(sb.from("profiles").select("*")),
    filters(sb.from("wallets").select("*")),
    filters(sb.from("cards").select("*")),
    filters(sb.from("ledger_transactions").select("*")),
    filters(sb.from("notifications").select("*")),
    filters(sb.from("loans").select("*")),
  ]);

  const failed = [usersRes, profilesRes, walletsRes, cardsRes, txRes, notifRes].find((r) => r.error);
  if (failed) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Couldn't load your loans (${failed.error.message}).</div>`;
    return;
  }

  const u = usersRes.data[0];
  const p = profilesRes.data[0] || {};
  SHOW_CENTS = !(u && u.preferences && u.preferences.showCents === false);

  // loans.sql may not have been run yet — treat that specific failure as
  // "no loans" rather than a hard error, so the rest of the page still works.
  let loans = [];
  if (loansRes.error) {
    console.warn("Couldn't read loans (has loans.sql been run?):", loansRes.error.message);
  } else {
    loans = loansRes.data.slice().sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  }

  ACCOUNT = {
    id: u.id,
    createdAt: u.created_at || null,
    firstName: p.first_name || "Customer",
    lastName: p.last_name || "",
    tier: p.tier || "Standard",
    avatarColor: AVATAR_COLORS[Math.abs(hashCode(u.id)) % AVATAR_COLORS.length],
    wallets: walletsRes.data,
    cards: cardsRes.data,
    transactions: txRes.data.map((t) => ({ rawDate: t.posted_at })),
    loans,
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

  LIMIT_INFO = computeLoanLimit(ACCOUNT);
  el("loan-currency-label").textContent = LIMIT_INFO.homeCurrency;

  renderNotifications();
  renderSummary();
  renderApplyMeter();
  renderStatusTab();
  renderUsageTab();
  renderLimitTab();
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

// ---- Summary cards ----

function renderSummary() {
  const cur = LIMIT_INFO.homeCurrency;
  el("loan-summary-limit").textContent = formatMoney(LIMIT_INFO.availableLimit, cur);

  const activeLoans = ACCOUNT.loans.filter((l) => ["disbursed", "active"].includes(l.status));
  const activeBalance = activeLoans.reduce((s, l) => s + Number(l.amount), 0);
  el("loan-summary-balance").textContent = formatMoney(activeBalance, cur);
  el("loan-summary-balance-sub").textContent = activeLoans.length
    ? `Across ${activeLoans.length} active loan${activeLoans.length === 1 ? "" : "s"}`
    : "No active loans";

  const next = activeLoans[0];
  el("loan-summary-repayment").textContent = next ? formatMoney(next.monthly_repayment, cur) : "—";
  el("loan-summary-repayment-sub").textContent = next ? `${capitalize(next.loan_type)} loan` : "No repayments due";
}

// ---- Apply tab ----

function currentWalletCurrency() {
  return (ACCOUNT.wallets[0] && ACCOUNT.wallets[0].currency) || "USD";
}

function renderApplyMeter() {
  const amount = Number(el("loan-amount").value) || 0;
  const months = Number(el("loan-period").value) || 12;
  const type = el("loan-type").value;
  const limit = LIMIT_INFO ? LIMIT_INFO.availableLimit : 0;
  const cur = currentWalletCurrency();

  const pct = limit > 0 ? Math.min(100, (amount / limit) * 100) : (amount > 0 ? 100 : 0);
  const overLimit = amount > limit;

  el("loan-meter-value").textContent = `${formatMoney(amount, cur)} / ${formatMoney(limit, cur)}`;
  const fill = el("loan-meter-fill");
  fill.style.width = `${pct}%`;
  fill.classList.toggle("over-limit", overLimit);

  const note = el("loan-meter-note");
  if (amount > 0) {
    const { rate, monthly } = estimateRepayment(amount, months, type);
    note.textContent = `Estimated monthly repayment: ${formatMoney(monthly, cur)} at ${rate}% APR (estimate)`;
    note.classList.toggle("warn", overLimit);
  } else {
    note.textContent = "Estimated monthly repayment: —";
    note.classList.remove("warn");
  }
}

async function submitLoanApplication(e) {
  e.preventDefault();
  const errorEl = el("loan-apply-error");
  errorEl.hidden = true;

  const type = el("loan-type").value;
  const amount = Number(el("loan-amount").value);
  const months = Number(el("loan-period").value);
  const purpose = el("loan-purpose").value;
  const details = el("loan-details").value.trim();
  const cur = currentWalletCurrency();

  if (!amount || amount <= 0) {
    errorEl.textContent = "Enter an amount greater than 0.";
    errorEl.hidden = false;
    return;
  }

  const { rate, monthly } = estimateRepayment(amount, months, type);

  const submitBtn = el("loan-apply-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  const { data, error } = await sb
    .from("loans")
    .insert({
      user_id: CURRENT_USER_ID,
      loan_type: type,
      amount,
      currency: cur,
      repayment_period_months: months,
      purpose,
      additional_details: details || null,
      interest_rate_pct: rate,
      monthly_repayment: Math.round(monthly * 100) / 100,
      status: "submitted",
    })
    .select()
    .single();

  submitBtn.disabled = false;
  submitBtn.textContent = "Submit application";

  if (error) {
    console.error("Loan application error:", error);
    if (error.code === "42P01" || /relation .*loans.* does not exist/i.test(error.message || "")) {
      errorEl.textContent = "Loans aren't set up yet on this database — see loans.sql in the project root.";
    } else {
      errorEl.textContent = `Couldn't submit your application: ${error.message}`;
    }
    errorEl.hidden = false;
    return;
  }

  ACCOUNT.loans.unshift(data);
  showToast("Loan application submitted");
  await createNotification("loan", `You applied for a ${capitalize(type)} loan of ${formatMoney(amount, cur)}.`);

  el("loan-apply-form").reset();
  el("loan-period").value = "12";
  renderApplyMeter();
  renderSummary();
  renderStatusTab();
  renderUsageTab();

  // Jump to Status so the customer immediately sees their new application.
  document.querySelector('.pay-tab[data-tab="status"]').click();
}

// ---- Status tab ----

const STEP_ORDER = ["submitted", "document_verification", "credit_assessment", "approval_decision", "disbursed", "active"];
const STEP_LABELS = {
  submitted: "Application Submitted",
  document_verification: "Document Verification",
  credit_assessment: "Credit Assessment",
  approval_decision: "Approval Decision",
  disbursed: "Disbursement",
  active: "Loan Active",
};
const STEP_TS_FIELD = {
  submitted: "submitted_at",
  document_verification: "document_verification_at",
  credit_assessment: "credit_assessment_at",
  approval_decision: "approval_decision_at",
  disbursed: "disbursed_at",
  active: "disbursed_at",
};
const STATUS_LABELS = {
  submitted: "Submitted", document_verification: "In review", credit_assessment: "In review",
  approval_decision: "In review", rejected: "Rejected", disbursed: "Disbursed", active: "Active", completed: "Completed",
};

function renderTimeline(loan) {
  const host = document.createElement("div");
  host.className = "loan-timeline";

  const isRejected = loan.status === "rejected";
  const isCompleted = loan.status === "completed";
  const currentIdx = isCompleted ? STEP_ORDER.length - 1 : STEP_ORDER.indexOf(loan.status);
  // If rejected, everything up through approval_decision is "reached".
  const rejectedAtIdx = STEP_ORDER.indexOf("approval_decision");

  const stepsToShow = isRejected ? STEP_ORDER.slice(0, rejectedAtIdx + 1) : STEP_ORDER;

  stepsToShow.forEach((stepKey, idx) => {
    const step = document.createElement("div");
    const isDone = isCompleted || idx < currentIdx || (isRejected && idx <= rejectedAtIdx - 1);
    const isCurrent = !isCompleted && !isRejected && idx === currentIdx;
    step.className = `loan-timeline-step${isDone ? " done" : ""}${isCurrent ? " current" : ""}`;
    const ts = loan[STEP_TS_FIELD[stepKey]];
    step.innerHTML = `
      <div class="loan-timeline-dot">${isDone || isCurrent ? "✓" : idx + 1}</div>
      <div class="loan-timeline-body">
        <p class="loan-timeline-title">${STEP_LABELS[stepKey]}</p>
        <p class="loan-timeline-when">${ts ? formatDate(ts) : isCurrent ? "In progress" : "Pending"}</p>
      </div>`;
    host.appendChild(step);
  });

  if (isRejected) {
    const step = document.createElement("div");
    step.className = "loan-timeline-step rejected";
    step.innerHTML = `
      <div class="loan-timeline-dot">✕</div>
      <div class="loan-timeline-body">
        <p class="loan-timeline-title">Application Rejected</p>
        <p class="loan-timeline-when">${loan.approval_decision_at ? formatDate(loan.approval_decision_at) : ""}${loan.reviewer_note ? " — " + loan.reviewer_note : ""}</p>
      </div>`;
    host.appendChild(step);
  }

  return host;
}

function renderStatusTab() {
  const timelineHost = el("loan-status-timeline-host");
  const historyHost = el("loan-status-history-host");
  timelineHost.innerHTML = "";
  historyHost.innerHTML = "";

  if (ACCOUNT.loans.length === 0) {
    timelineHost.innerHTML = `
      <div class="loan-empty">
        <p class="loan-empty-title">No applications yet</p>
        <p class="loan-empty-sub">Apply for a loan and its progress will show up here.</p>
      </div>`;
    historyHost.innerHTML = '<p class="loan-empty-sub" style="padding:8px 0;">Nothing to show yet.</p>';
    return;
  }

  const latest = ACCOUNT.loans[0];
  const label = document.createElement("p");
  label.className = "helper-text";
  label.style.margin = "0 0 12px";
  label.textContent = `${capitalize(latest.loan_type)} loan · ${formatMoney(latest.amount, latest.currency)} · ${STATUS_LABELS[latest.status] || capitalize(latest.status)}`;
  timelineHost.appendChild(label);
  timelineHost.appendChild(renderTimeline(latest));

  ACCOUNT.loans.forEach((l) => {
    const row = document.createElement("div");
    row.className = "tx-row";
    row.innerHTML = `
      <div class="tx-icon in" style="background:var(--gold);">${icon("loans", 16)}</div>
      <div class="tx-main">
        <p class="tx-label">${capitalize(l.loan_type)} loan<span class="tx-status-pill">${STATUS_LABELS[l.status] || capitalize(l.status)}</span></p>
        <p class="tx-sub">${l.purpose} · ${formatDate(l.submitted_at)}</p>
      </div>
      <span class="tx-amount out">${formatMoney(l.amount, l.currency)}</span>
    `;
    historyHost.appendChild(row);
  });
}

// ---- Usage tab ----

function renderUsageTab() {
  const host = el("loan-usage-host");
  host.innerHTML = "";

  const active = ACCOUNT.loans.filter((l) => ["disbursed", "active", "completed"].includes(l.status));
  if (active.length === 0) {
    host.innerHTML = `
      <div class="loan-empty">
        <p class="loan-empty-title">No disbursed loans yet</p>
        <p class="loan-empty-sub">Once one of your applications is approved and disbursed, its usage will show up here.</p>
      </div>`;
    return;
  }

  active.forEach((l) => {
    const repaid = 0; // Repayments aren't tracked yet in this phase — shown honestly, not invented.
    const pct = 0;
    const row = document.createElement("div");
    row.className = "loan-usage-row";
    row.innerHTML = `
      <div class="loan-usage-top">
        <span class="loan-usage-name">${capitalize(l.loan_type)} loan — ${l.purpose}</span>
        <span class="loan-usage-amounts">${formatMoney(repaid, l.currency)} repaid of ${formatMoney(l.amount, l.currency)}</span>
      </div>
      <div class="loan-usage-track"><div class="loan-usage-fill" style="width:${pct}%"></div></div>
      <p class="loan-empty-sub" style="text-align:left;padding:0;">Repayment tracking isn't available yet in this phase.</p>
    `;
    host.appendChild(row);
  });
}

// ---- Limit tab ----

function renderLimitTab() {
  const body = el("loan-factor-table-body");
  body.innerHTML = LIMIT_INFO.factors
    .map(
      (f) => `
      <tr>
        <td><div class="loan-factor-name">${f.name}</div><div class="loan-factor-weight">${f.note}</div></td>
        <td class="loan-factor-weight">${f.weight}%</td>
        <td><div class="loan-factor-bar-track"><div class="loan-factor-bar-fill" style="width:${Math.round(f.score)}%"></div></div></td>
        <td class="loan-factor-score">${Math.round(f.score)}%</td>
      </tr>`
    )
    .join("");
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
    if (btn.dataset.nav === "loans") return; // already here
    if (btn.dataset.nav === "dashboard") {
      btn.addEventListener("click", () => (window.location.href = "../dashboard/"));
      return;
    }
    if (btn.dataset.nav === "accounts") {
      btn.addEventListener("click", () => (window.location.href = "../accounts/"));
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
    if (btn.dataset.nav === "statements") {
      btn.addEventListener("click", () => (window.location.href = "../statements/"));
      return;
    }
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

  // Tabs
  const tabButtons = document.querySelectorAll(".pay-tab");
  const panels = { apply: el("panel-apply"), status: el("panel-status"), usage: el("panel-usage"), limit: el("panel-limit") };
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => { b.classList.toggle("active", b === btn); b.setAttribute("aria-selected", b === btn ? "true" : "false"); });
      Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== btn.dataset.tab; });
    });
  });

  // Apply form live preview + submit
  ["loan-amount", "loan-period", "loan-type"].forEach((id) => {
    el(id).addEventListener("input", renderApplyMeter);
  });
  el("loan-apply-form").addEventListener("submit", submitLoanApplication);

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
