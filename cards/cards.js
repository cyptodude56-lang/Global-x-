// ---------------------------------------------------------------------------
// Hallmark — Cards page.
//
// Shows every card the customer has — genuinely more than the old 2-card
// assumption (1 debit + 1 virtual) the dashboard's "Get card" button was
// built around. enable_multiple_cards.sql replaced that hard cap with a
// generous limit (6 total) instead, so both physical and virtual cards can
// be requested more than once. Card issuance here is a real write, same
// owner_insert policy the dashboard's "Get card" already uses — verified
// directly against a real database that a customer can now hold multiple
// physical cards, and that the 7th request is cleanly rejected.
//
// CVV numbers are a real `cvv` column on `cards` (see cvv.sql — a manual
// migration, run once in Supabase's SQL editor, same convention as every
// other schema change in this project). Random 3-digit value, generated
// here at issuance and backed by a DB default for any older card rows.
// Still entirely fake, demo-only data — masked by default, same as
// everything else sensitive-looking here.
// ---------------------------------------------------------------------------

let CURRENT_USER_ID = null;
const AVATAR_COLORS = ["#1F6F5C", "#2451B0", "#C98A3B", "#8B3A62", "#3A6B8A", "#6B7A2E", "#7A3A3A"];
const PAN_FIELD_CANDIDATES = ["full_pan", "card_number", "pan", "unmasked_pan", "card_number_full", "number"];

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
  plus: '<path d="M10 4v12M4 10h12"/>',
};

function icon(name, size = 18) {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}" style="display:block">${ICON_PATHS[name] || ""}</svg>`;
}
function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((elm) => { elm.innerHTML = icon(elm.dataset.icon); });
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Escapes free text pulled from the database before it's interpolated into
// an innerHTML template — see dashboard/app.js for the fuller rationale.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2400);
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
function isNotificationVisible(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= 48 * 60 * 60 * 1000;
}

function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function randomDigits(n) { let s = ""; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10); return s; }

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
let allDetailsVisible = false;
let selectedRequestType = "virtual";

async function loadData() {
  const filters = (q) => q.eq("user_id", CURRENT_USER_ID);
  const [usersRes, profilesRes, cardsRes, notifRes] = await Promise.all([
    sb.from("users").select("*").eq("id", CURRENT_USER_ID),
    filters(sb.from("profiles").select("*")),
    filters(sb.from("cards").select("*")),
    filters(sb.from("notifications").select("*")),
  ]);

  const failed = [usersRes, profilesRes, cardsRes, notifRes].find((r) => r.error);
  if (failed) {
    document.querySelector(".dashboard-content").innerHTML = `<div class="error-box" style="color:var(--ink)">Couldn't load your cards (${escapeHtml(failed.error.message)}).</div>`;
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
    cards: cardsRes.data.map((c) => ({
      id: c.id,
      maskedPan: c.masked_pan,
      fullPan: detectFullPan(c),
      expiry: c.expiry,
      holder: c.card_holder_name,
      cvv: c.cvv,
      network: c.card_network,
      isVirtual: !!c.is_virtual,
      status: c.status,
      frozen: c.status === "frozen",
      revealed: false,
    })),
    notifications: notifRes.data
      .filter((n) => isNotificationVisible(n.created_at))
      .map((n) => ({ id: n.id, message: n.message, isRead: n.is_read, date: n.created_at })),
  };

  renderAll();
}

function initials(acc) { return ((acc.firstName[0] || "") + (acc.lastName[0] || "")).toUpperCase(); }

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll() {
  el("user-avatar").textContent = initials(ACCOUNT);
  el("user-avatar").style.background = ACCOUNT.avatarColor;
  el("user-name").textContent = `${ACCOUNT.firstName} ${ACCOUNT.lastName}`;
  el("user-tier").textContent = ACCOUNT.tier;

  renderNotifications();
  renderCardGrids();
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
    ? ACCOUNT.notifications.map((n) => `<div class="notif-row${n.isRead ? "" : " unread"}"><p class="notif-msg">${escapeHtml(n.message)}</p></div>`).join("")
    : '<p class="notif-empty">No notifications.</p>';
}

function cardItemHtml(c) {
  const pending = c.status === "pending";
  const hiddenDisplay = `•••• •••• •••• ${lastFour(c.maskedPan)}`;
  const shownDisplay = c.fullPan ? formatPan(c.fullPan) : c.maskedPan;
  const numberToShow = c.revealed && !pending ? shownDisplay : hiddenDisplay;
  const cvv = c.revealed && !pending ? (c.cvv || "•••") : "•••";

  return `
    <div class="card-item" data-card-id="${c.id}">
      <div class="debit-card-visual card-item-visual ${c.frozen ? "frozen" : ""} ${pending ? "pending" : ""}">
        <div class="card-top">
          <span class="card-brand">Hallmark</span>
          ${pending ? '<span class="card-badge">Arriving soon</span>' : c.frozen ? '<span class="frozen-tag">Frozen</span>' : ""}
        </div>
        <div class="card-number">${numberToShow}</div>
        <div class="card-bottom">
          <span>${escapeHtml(c.holder)}</span>
          <span class="card-expiry"><span class="card-expiry-label">VALID THRU</span>${c.expiry || "--/--"}</span>
          <span class="card-network-mark">${(c.network || "").toUpperCase()}${c.isVirtual ? " · Virtual" : ""}</span>
        </div>
      </div>
      <div class="card-info-row">
        <div class="card-info-item"><p class="card-info-label">CVV</p><p class="card-info-value">${cvv}</p></div>
        <div class="card-info-item"><p class="card-info-label">Status</p><p class="card-info-value" style="color:${pending ? "var(--gold-dark)" : c.frozen ? "var(--negative)" : "var(--positive)"};font-size:0.85rem;">${pending ? "Pending" : c.frozen ? "Frozen" : "Active"}</p></div>
      </div>
      <div class="card-actions">
        <button class="ghost-btn" data-action="toggle-details" data-card="${c.id}" ${pending ? "disabled" : ""}>${c.revealed ? "Hide details" : "Show details"}</button>
        <button class="ghost-btn" data-action="toggle-freeze" data-card="${c.id}" ${pending ? "disabled" : ""}>${c.frozen ? "Unfreeze card" : "Freeze card"}</button>
      </div>
    </div>
  `;
}

function renderCardGrids() {
  const physical = ACCOUNT.cards.filter((c) => !c.isVirtual);
  const virtual = ACCOUNT.cards.filter((c) => c.isVirtual);

  el("physical-count").textContent = `${physical.length} card${physical.length === 1 ? "" : "s"}`;
  el("virtual-count").textContent = `${virtual.length} card${virtual.length === 1 ? "" : "s"}`;

  const physGrid = el("physical-cards-grid");
  physGrid.innerHTML = physical.length
    ? physical.map(cardItemHtml).join("")
    : `<div class="add-card-prompt" id="add-physical-prompt"><span class="plus-icon">${icon("plus", 22)}</span><p class="prompt-title">No physical card yet</p><p class="prompt-sub">Request one for ATM withdrawals and in-store payments.</p></div>`;

  const virtGrid = el("virtual-cards-grid");
  virtGrid.innerHTML =
    virtual.map(cardItemHtml).join("") +
    `<div class="add-card-prompt" id="add-virtual-prompt"><span class="plus-icon">${icon("plus", 22)}</span><p class="prompt-title">Create a virtual card</p><p class="prompt-sub">Instantly generate a virtual card for secure online payments.</p></div>`;

  mountIcons(physGrid);
  mountIcons(virtGrid);
  wireCardActions();

  const addPhysPrompt = el("add-physical-prompt");
  if (addPhysPrompt) addPhysPrompt.addEventListener("click", () => openRequestPanel("physical"));
  el("add-virtual-prompt").addEventListener("click", () => issueCard("virtual"));
}

function wireCardActions() {
  document.querySelectorAll('[data-action="toggle-details"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = ACCOUNT.cards.find((c) => c.id === btn.dataset.card);
      if (!card) return;
      if (!card.fullPan) {
        showToast("Full number not loaded for this card");
        return;
      }
      card.revealed = !card.revealed;
      renderCardGrids();
    });
  });
  document.querySelectorAll('[data-action="toggle-freeze"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = ACCOUNT.cards.find((c) => c.id === btn.dataset.card);
      if (!card) return;
      card.frozen = !card.frozen;
      showToast(card.frozen ? "Card frozen" : "Card unfrozen");
      renderCardGrids();
    });
  });
}

// ---------------------------------------------------------------------------
// Card issuance (real write — see enable_multiple_cards.sql)
// ---------------------------------------------------------------------------

async function issueCard(cardType) {
  const isVirtual = cardType === "virtual";
  const last4 = randomDigits(4);
  const fullPan = "4111" + randomDigits(8) + last4;
  const expiryYears = isVirtual ? 3 : 4;
  const expiry = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + expiryYears);
    return String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getFullYear()).slice(-2);
  })();

  const { data, error } = await sb
    .from("cards")
    .insert({
      user_id: ACCOUNT.id,
      card_network: "Visa",
      card_type: isVirtual ? "virtual" : "debit",
      masked_pan: `4111 **** **** ${last4}`,
      full_pan: fullPan,
      expiry,
      card_holder_name: `${ACCOUNT.firstName} ${ACCOUNT.lastName}`,
      cvv: randomDigits(3),
      status: isVirtual ? "active" : "pending",
      is_virtual: isVirtual,
    })
    .select()
    .single();

  if (error) {
    console.error("card issuance error:", error);
    if (/limit reached/i.test(error.message)) {
      showToast("Card limit reached for this demo account.");
    } else {
      showToast(`Couldn't create the card: ${error.message}`);
    }
    return;
  }

  ACCOUNT.cards.push({
    id: data.id,
    maskedPan: data.masked_pan,
    fullPan: detectFullPan(data),
    expiry: data.expiry,
    holder: data.card_holder_name,
    cvv: data.cvv,
    network: data.card_network,
    isVirtual: data.is_virtual,
    status: data.status,
    frozen: false,
    revealed: false,
  });
  showToast(isVirtual ? "New virtual card created" : "Physical card requested — arriving in 5–7 business days");
  renderCardGrids();
}

// ---------------------------------------------------------------------------
// Request panel
// ---------------------------------------------------------------------------

function openRequestPanel(defaultType) {
  selectedRequestType = defaultType || "virtual";
  document.querySelectorAll(".type-option").forEach((o) => o.classList.toggle("selected", o.dataset.type === selectedRequestType));
  el("request-panel").hidden = false;
  el("request-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function closeRequestPanel() {
  el("request-panel").hidden = true;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function init() {
  mountIcons();
  loadFxTicker();

  el("btn-logout").addEventListener("click", async () => { await sb.auth.signOut(); window.location.href = "../"; });
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
    if (btn.dataset.nav === "cards") return;
    if (btn.dataset.nav === "dashboard") { btn.addEventListener("click", () => (window.location.href = "../dashboard/")); return; }
    if (btn.dataset.nav === "accounts") { btn.addEventListener("click", () => (window.location.href = "../accounts/")); return; }
    if (btn.dataset.nav === "transfers") { btn.addEventListener("click", () => (window.location.href = "../transfers/")); return; }
    if (btn.dataset.nav === "payments") { btn.addEventListener("click", () => (window.location.href = "../payments/")); return; }
    if (btn.dataset.nav === "loans") { btn.addEventListener("click", () => (window.location.href = "../loans/")); return; }
    if (btn.dataset.nav === "statements") { btn.addEventListener("click", () => (window.location.href = "../statements/")); return; }
    if (btn.dataset.nav === "settings") { btn.addEventListener("click", () => (window.location.href = "../settings/")); return; }
    btn.addEventListener("click", () => { showToast(`${btn.textContent.trim()} coming soon in a later phase`); closeSidebar(); });
  });
  document.querySelectorAll("[data-coming-soon]").forEach((elm) => {
    elm.addEventListener("click", () => showToast(`${elm.dataset.comingSoon} coming soon in a later phase`));
  });
  el("btn-explore").addEventListener("click", () => showToast("Explore Opportunities coming soon in a later phase"));

  el("btn-toggle-all-details").addEventListener("click", () => {
    allDetailsVisible = !allDetailsVisible;
    ACCOUNT.cards.forEach((c) => { if (c.fullPan && c.status !== "pending") c.revealed = allDetailsVisible; });
    el("btn-toggle-all-details").textContent = allDetailsVisible ? "Hide all details" : "Show all details";
    renderCardGrids();
  });

  el("btn-request-card").addEventListener("click", () => openRequestPanel("virtual"));
  el("btn-cancel-request").addEventListener("click", closeRequestPanel);
  document.querySelectorAll(".type-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      selectedRequestType = opt.dataset.type;
      document.querySelectorAll(".type-option").forEach((o) => o.classList.toggle("selected", o === opt));
    });
  });
  el("btn-confirm-request").addEventListener("click", () => {
    closeRequestPanel();
    issueCard(selectedRequestType);
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