// ---------------------------------------------------------------------------
// Hallmark — KYC (identity verification) page.
//
// Four steps: document type -> upload -> selfie -> review. Needs a live
// Supabase session (same gate as complete-profile.js); no session sends the
// person back to the login page.
//
// STORAGE (see kyc.sql): on submit, each file is uploaded to the private
// "kyc-documents" bucket under <auth uid>/<submission id>/<slot>.<ext>, then
// the public.submit_kyc() function records the submission. The function is
// the only way to create KYC rows: it re-checks the file set and reads size
// and type from storage, so nothing the browser claims is trusted. If any
// step fails, the files uploaded so far are removed again. A person's
// existing submission is loaded on arrival, so a refresh can't create a
// second one.
//
// Every piece of user-controlled text (file names, first name) is written
// with textContent / DOM APIs, never innerHTML. The only innerHTML use is
// for the fixed SVG strings defined in this file.
// ---------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES_DOC = ["image/jpeg", "image/png", "application/pdf"];
const TYPES_PHOTO = ["image/jpeg", "image/png"];
const SELFIE_KEY = "selfie";
const BUCKET = "kyc-documents";
const CONSENT_VERSION = "2026-09-v1"; // bump whenever the consent wording on the review step changes
const EXT = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

const STEPS = ["Document type", "Upload document", "Selfie with document", "Review and submit"];

const DOC_TYPES = {
  passport: {
    label: "Passport",
    noun: "passport",
    desc: "Add both pages. Make sure all four corners are visible and the text is sharp.",
    slots: [
      { key: "photo", label: "Photo page", hint: "The page with your photo and details", sil: "passportPhoto", ratio: "passport" },
      { key: "signature", label: "Signature page", hint: "The page with your signature", sil: "passportSig", ratio: "passport" },
    ],
  },
  id_card: {
    label: "National ID card",
    noun: "ID card",
    desc: "Add both sides. Make sure all four corners are visible and the text is sharp.",
    slots: [
      { key: "front", label: "Front", hint: "The side with your photo", sil: "cardFront", ratio: "card" },
      { key: "back", label: "Back", hint: "The reverse side", sil: "cardBack", ratio: "card" },
    ],
  },
  license: {
    label: "Driver's license",
    noun: "driver's license",
    desc: "Add both sides. Make sure all four corners are visible and the text is sharp.",
    slots: [
      { key: "front", label: "Front", hint: "The side with your photo", sil: "cardFront", ratio: "card" },
      { key: "back", label: "Back", hint: "The reverse side", sil: "cardBack", ratio: "card" },
    ],
  },
};

const ICONS = {
  passport: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="2.5" width="11" height="15" rx="1.5"/><circle cx="10" cy="8.5" r="2.6"/><path d="M7.5 13.5h5"/></svg>',
  id_card: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><circle cx="7" cy="9" r="1.6"/><path d="M4.6 13c.4-1.4 1.4-2 2.4-2s2 .6 2.4 2M11.5 8.5H15M11.5 11.5H14.5"/></svg>',
  license: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M5 8h5M5 11h3.5"/><rect x="12" y="7.5" width="3.2" height="4" rx=".6"/></svg>',
  pdf: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h6l4 4V17a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 5 17V2.5z"/><path d="M11 2.5v4h4M7.5 11.5h5M7.5 14h3"/></svg>',
};

// Faint outlines of what each slot expects, shown while it is empty
const SIL_OPEN = '<svg class="kyc-sil" viewBox="0 0 96 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const SILHOUETTES = {
  cardFront: SIL_OPEN + '<rect x="2" y="4" width="92" height="56" rx="4"/><rect x="10" y="16" width="24" height="30" rx="2"/><path d="M44 20h40M44 29h32M44 38h36M10 53h40"/></svg>',
  cardBack: SIL_OPEN + '<rect x="2" y="4" width="92" height="56" rx="4"/><rect x="2" y="12" width="92" height="10"/><path d="M10 34h60M10 43h44"/><rect x="72" y="40" width="14" height="10" rx="1.5"/></svg>',
  passportPhoto: SIL_OPEN + '<rect x="6" y="2" width="84" height="60" rx="4"/><rect x="13" y="12" width="24" height="30" rx="2"/><path d="M45 16h36M45 25h28M45 34h32M13 50h70M13 56h70"/></svg>',
  passportSig: SIL_OPEN + '<rect x="6" y="2" width="84" height="60" rx="4"/><path d="M14 14h44M14 22h30"/><path d="M14 42c5-9 9 6 14-2s8-6 12 0 8 2 12-4"/><path d="M14 50h68"/></svg>',
  selfie: SIL_OPEN + '<rect x="2" y="4" width="92" height="56" rx="4"/><circle cx="36" cy="26" r="9"/><path d="M18 58c1-11 8-17 18-17s17 6 18 17"/><rect x="58" y="32" width="26" height="17" rx="2"/></svg>',
};

const sb = window.HALLMARK_SB;

const el = (id) => document.getElementById(id);

const state = {
  step: 0,
  docType: null,
  files: {},        // slotKey -> { file, url, isImage }
  slotsFor: null,   // doc type the step-2 slots were built for
  consent: false,
  submitting: false,
  done: false,
  status: null,        // in_review | approved once a submission exists
  rejection: null,     // { note } when the last submission was rejected
  progressText: "",
  firstName: "",
  userId: null,
};
const slotUI = {};  // slotKey -> DOM references

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  kids.flat().forEach((kid) => {
    if (kid != null && kid !== false) node.append(kid);
  });
  return node;
}

function svgNode(markup) {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function joinList(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

function uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  const b = window.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// Some browsers report an empty type: fall back to the extension
function mimeFor(file) {
  if (file.type) return file.type;
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.png$/i.test(file.name)) return "image/png";
  return "image/jpeg";
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isPdf(file) {
  return file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name));
}

function validateFile(file, photoOnly) {
  const allowed = photoOnly ? TYPES_PHOTO : TYPES_DOC;
  const extOk = photoOnly ? /\.(jpe?g|png)$/i.test(file.name) : /\.(jpe?g|png|pdf)$/i.test(file.name);
  if (!(allowed.includes(file.type) || (!file.type && extOk))) {
    return photoOnly ? "Use a JPG or PNG photo." : "Use a JPG, PNG or PDF file.";
  }
  if (file.size === 0) return "That file is empty. Choose another one.";
  if (file.size > MAX_BYTES) return `That file is ${formatBytes(file.size)}. The limit is 5 MB.`;
  return null;
}

// ---------------------------------------------------------------------------
// Session gate
// ---------------------------------------------------------------------------

async function gate() {
  const session = await window.hallmarkRequireSession("../../");
  if (!session) return false;
  state.userId = session.user.id;
  const meta = (session.user && session.user.user_metadata) || {};
  state.firstName = typeof meta.first_name === "string" ? meta.first_name.trim().slice(0, 40) : "";
  return true;
}

// The person's current KYC state. Two tables, both limited to their own rows
// by RLS: kyc_submissions (the attempts and evidence) and kyc_status (the one
// current-state row, which also covers people verified before this page
// existed). A table that can't be read counts as "nothing there".
async function loadKycState() {
  const [subRes, ksRes] = await Promise.all([
    sb.from("kyc_submissions").select("id, status, doc_type, submitted_at, reviewer_note").order("submitted_at", { ascending: false }).limit(1),
    sb.from("kyc_status").select("status, submitted_at").limit(1),
  ]);
  if (subRes.error) console.warn("Couldn't read kyc_submissions (has kyc.sql been run?):", subRes.error.message);
  if (ksRes.error) console.warn("Couldn't read kyc_status:", ksRes.error.message);
  return resolveKycState(
    subRes.data && subRes.data.length ? subRes.data[0] : null,
    ksRes.data && ksRes.data.length ? ksRes.data[0] : null
  );
}

// Which screen to show. kyc_status 'verified' wins, so a customer verified
// through any route is never asked to start again.
//   -> { status: "approved" | "in_review", docType, submittedAt }
//   -> { status: "rejected", note }
//   -> null (show the wizard)
function resolveKycState(sub, ks) {
  const ksStatus = ks && ks.status;
  if (ksStatus === "verified") {
    return { status: "approved", docType: sub ? sub.doc_type : null, submittedAt: (sub && sub.submitted_at) || (ks && ks.submitted_at) || null };
  }
  if (sub && (sub.status === "in_review" || sub.status === "approved")) {
    return { status: sub.status, docType: sub.doc_type, submittedAt: sub.submitted_at };
  }
  if (ksStatus === "in_review") {
    return { status: "in_review", docType: sub ? sub.doc_type : null, submittedAt: (ks && ks.submitted_at) || null };
  }
  if (sub && sub.status === "rejected") return { status: "rejected", note: sub.reviewer_note || "" };
  return null;
}

// ---------------------------------------------------------------------------
// Upload slots
// ---------------------------------------------------------------------------

function buildSlot(def, opts) {
  const input = h("input", {
    type: "file",
    class: "kyc-file",
    id: `kyc-file-${def.key}`,
    accept: opts.photoOnly ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf",
    capture: opts.capture,
  });
  const preview = h("div", { class: "kyc-preview" });
  const scan = h("span", { class: "kyc-scan", "aria-hidden": "true" });
  const corners = ["tl", "tr", "bl", "br"].map((c) => h("span", { class: `kyc-corner ${c}`, "aria-hidden": "true" }));
  const empty = h(
    "span",
    { class: "kyc-drop-empty" },
    svgNode(SILHOUETTES[def.sil]),
    h("span", { class: "kyc-drop-cta", text: opts.photoOnly ? "Take or choose a photo" : "Choose a file" }),
    h("span", { class: "kyc-drop-sub", text: "or drag it here" })
  );
  const drop = h(
    "label",
    { class: `kyc-drop ratio-${def.ratio}`, for: input.id },
    h("span", { class: "kyc-sr", text: `${def.label}. ` }),
    input,
    empty,
    preview,
    scan,
    corners
  );

  const name = h("span", { class: "kyc-file-name" });
  const size = h("span", { class: "kyc-file-size" });
  const meta = h(
    "div",
    { class: "kyc-slot-meta", hidden: true },
    h("span", { class: "kyc-file-info" }, name, size),
    h(
      "span",
      { class: "kyc-slot-btns" },
      h("button", { type: "button", class: "kyc-link", text: "Replace", onclick: () => input.click() }),
      h("button", {
        type: "button",
        class: "kyc-link",
        text: "Remove",
        onclick: () => {
          clearFile(def.key);
          updateSlot(def.key);
          render();
        },
      })
    )
  );
  const error = h("p", { class: "kyc-slot-error", "aria-live": "polite" });

  const head = h(
    "div",
    { class: "kyc-slot-head" },
    h("span", { class: "kyc-slot-name", text: def.label }),
    def.hint ? h("span", { class: "kyc-slot-hint", text: def.hint }) : null
  );
  const root = h("div", { class: "kyc-slot" }, head, drop, meta, error);

  input.addEventListener("change", () => {
    const f = input.files && input.files[0];
    input.value = ""; // lets the same file be chosen again after removal
    if (f) acceptFile(def.key, f, opts.photoOnly);
  });
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("is-over");
    })
  );
  ["dragleave", "dragend"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) acceptFile(def.key, f, opts.photoOnly);
  });
  scan.addEventListener("animationend", () => drop.classList.remove("is-scanning"));

  slotUI[def.key] = { root, drop, preview, name, size, meta, error, label: def.label };
  return root;
}

function acceptFile(key, file, photoOnly) {
  const ui = slotUI[key];
  if (!ui) return;
  ui.error.textContent = "";

  const problem = validateFile(file, photoOnly);
  if (problem) {
    ui.error.textContent = problem;
    return;
  }
  if (isPdf(file)) {
    commitFile(key, file, null, false);
    return;
  }
  // Confirm the browser can actually decode the image before accepting it
  const url = URL.createObjectURL(file);
  const probe = new Image();
  probe.onload = () => {
    if (!slotUI[key]) {
      URL.revokeObjectURL(url);
      return;
    }
    commitFile(key, file, url, true);
  };
  probe.onerror = () => {
    URL.revokeObjectURL(url);
    if (slotUI[key]) slotUI[key].error.textContent = "We couldn't read that image. Try a different file.";
  };
  probe.src = url;
}

function commitFile(key, file, url, isImage) {
  clearFile(key);
  state.files[key] = { file, url, isImage };
  updateSlot(key, true);
  render();
}

function clearFile(key) {
  const rec = state.files[key];
  if (rec && rec.url) URL.revokeObjectURL(rec.url);
  delete state.files[key];
}

function pdfTile(file) {
  return h(
    "div",
    { class: "kyc-pdf" },
    svgNode(ICONS.pdf),
    h("span", { class: "kyc-pdf-name", text: file.name }),
    h("span", { class: "kyc-pdf-sub", text: `PDF, ${formatBytes(file.size)}` })
  );
}

function updateSlot(key, animate = false) {
  const ui = slotUI[key];
  if (!ui) return;
  const rec = state.files[key];
  ui.drop.classList.toggle("is-filled", !!rec);
  ui.meta.hidden = !rec;
  ui.preview.replaceChildren();
  if (!rec) return;

  if (rec.isImage) ui.preview.append(h("img", { src: rec.url, alt: `Preview of ${ui.label}` }));
  else ui.preview.append(pdfTile(rec.file));
  ui.name.textContent = rec.file.name;
  ui.size.textContent = formatBytes(rec.file.size);

  if (animate) {
    ui.drop.classList.remove("is-scanning");
    void ui.drop.offsetWidth; // restart the scan pass on replace
    ui.drop.classList.add("is-scanning");
  }
}

function buildDocSlots() {
  if (state.slotsFor === state.docType) return;
  const host = el("kyc-doc-slots");
  host.replaceChildren();
  Object.keys(slotUI).forEach((k) => {
    if (k !== SELFIE_KEY) delete slotUI[k];
  });
  const type = DOC_TYPES[state.docType];
  el("kyc-upload-desc").textContent = type.desc;
  type.slots.forEach((def) => host.append(buildSlot(def, { photoOnly: false })));
  type.slots.forEach((def) => updateSlot(def.key));
  state.slotsFor = state.docType;
}

function buildSelfieSlot() {
  const def = { key: SELFIE_KEY, label: "Selfie with your document", hint: null, sil: "selfie", ratio: "selfie" };
  el("kyc-selfie-slot").append(buildSlot(def, { photoOnly: true, capture: "user" }));
}

// ---------------------------------------------------------------------------
// Review step
// ---------------------------------------------------------------------------

function docSlots() {
  return state.docType ? DOC_TYPES[state.docType].slots : [];
}

function summaryRow({ thumb, label, value, goTo }) {
  return h(
    "li",
    { class: "kyc-sum-row" },
    h("span", { class: "kyc-sum-thumb" }, thumb),
    h("span", { class: "kyc-sum-text" }, h("span", { class: "kyc-sum-label", text: label }), h("span", { class: "kyc-sum-value", text: value })),
    h("button", { type: "button", class: "kyc-link", text: "Change", onclick: () => go(goTo) })
  );
}

function fileThumb(rec, label) {
  if (rec && rec.isImage) return h("img", { src: rec.url, alt: `Preview of ${label}` });
  return svgNode(ICONS.pdf);
}

function buildReview() {
  const list = el("kyc-summary");
  list.replaceChildren();
  list.append(summaryRow({ thumb: svgNode(ICONS[state.docType]), label: "Document", value: DOC_TYPES[state.docType].label, goTo: 0 }));
  docSlots().forEach((s) => {
    const rec = state.files[s.key];
    list.append(summaryRow({ thumb: fileThumb(rec, s.label), label: s.label, value: `${rec.file.name}, ${formatBytes(rec.file.size)}`, goTo: 1 }));
  });
  const selfie = state.files[SELFIE_KEY];
  list.append(summaryRow({ thumb: fileThumb(selfie, "selfie"), label: "Selfie with document", value: `${selfie.file.name}, ${formatBytes(selfie.file.size)}`, goTo: 2 }));
  el("kyc-submit-error").textContent = "";
}

// ---------------------------------------------------------------------------
// Step logic
// ---------------------------------------------------------------------------

function complete(i) {
  switch (i) {
    case 0: return !!state.docType;
    case 1: return docSlots().length > 0 && docSlots().every((s) => state.files[s.key]);
    case 2: return !!state.files[SELFIE_KEY];
    case 3: return state.done;
    default: return false;
  }
}

function canEnter(i) {
  for (let j = 0; j < i; j++) if (!complete(j)) return false;
  return true;
}

function canContinue() {
  if (state.submitting) return false;
  if (state.step === 3) return state.consent;
  return complete(state.step);
}

function hintText() {
  if (state.submitting) return state.progressText || "Submitting your documents";
  if (canContinue()) return "";
  switch (state.step) {
    case 0: return "Choose a document to continue.";
    case 1: {
      const missing = docSlots().filter((s) => !state.files[s.key]).map((s) => s.label.toLowerCase());
      return `Add the ${joinList(missing)} to continue.`;
    }
    case 2: return "Add your selfie to continue.";
    case 3: return "Confirm the statement above to submit.";
    default: return "";
  }
}

function subLabel(i) {
  if (state.done) {
    const docLabel = state.docType && DOC_TYPES[state.docType] ? DOC_TYPES[state.docType].label : "On file";
    return [docLabel, "Uploaded", "Added", state.status === "approved" ? "Verified" : "Submitted"][i];
  }
  switch (i) {
    case 0: return state.docType ? DOC_TYPES[state.docType].label : "Choose one";
    case 1: {
      if (!state.docType) return "Choose a document first";
      const slots = docSlots();
      return `${slots.filter((s) => state.files[s.key]).length} of ${slots.length} added`;
    }
    case 2: return state.files[SELFIE_KEY] ? "Added" : "Not added yet";
    case 3: return state.consent ? "Ready to submit" : "Needs your consent";
    default: return "";
  }
}

function render() {
  const items = document.querySelectorAll("#kyc-tracker .kyc-track");
  const segs = document.querySelectorAll("#kyc-mobile-progress span");

  items.forEach((li, i) => {
    const btn = li.querySelector(".kyc-track-btn");
    const done = state.done || (i < state.step && complete(i));
    const active = !state.done && i === state.step;
    li.classList.toggle("is-done", done);
    li.classList.toggle("is-active", active);
    btn.disabled = state.done || !canEnter(i) || active;
    if (active) btn.setAttribute("aria-current", "step");
    else btn.removeAttribute("aria-current");
    const sub = subLabel(i);
    li.querySelector("[data-sub]").textContent = sub;
    btn.setAttribute("aria-label", `${STEPS[i]}${done ? ", completed" : ""}. ${sub}`);
    segs[i].classList.toggle("is-done", done);
    segs[i].classList.toggle("is-active", active);
  });

  el("kyc-step-count").textContent = state.done ? (state.status === "approved" ? "Verified" : "Complete") : `Step ${state.step + 1} of ${STEPS.length}`;
  el("kyc-notice").hidden = !state.rejection || state.step !== 0 || state.done;

  const next = el("kyc-next");
  next.textContent = state.submitting ? "Submitting" : state.step === 3 ? "Submit for review" : "Continue";
  next.disabled = !canContinue();
  next.classList.toggle("is-loading", state.submitting);
  el("kyc-back").hidden = state.step === 0 || state.submitting;
  el("kyc-hint").textContent = hintText();
}

function showStep(step, dir) {
  el("kyc-stage").style.setProperty("--k-dx", dir >= 0 ? "14px" : "-14px");
  if (step === 1) buildDocSlots();
  if (step === 3) buildReview();
  state.step = step;
  document.querySelectorAll(".kyc-step").forEach((sec) => {
    sec.hidden = Number(sec.dataset.step) !== step;
  });
  render();
}

function go(step) {
  if (state.done || state.submitting || step === state.step || !canEnter(step)) return;
  showStep(step, step > state.step ? 1 : -1);
  el(`kyc-h${step}`).focus();
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

function fail(code, message, extra = {}) {
  return Object.assign(new Error(message), { code }, extra);
}

function setProgress(fraction) {
  el("kyc-next").style.setProperty("--k-p", String(Math.max(0, Math.min(1, fraction))));
}

// Uploads every file, then records the submission. Any failure removes the
// files this attempt uploaded (the storage policy allows that only while the
// submission has not been recorded), then rethrows.
async function submitVerification(onProgress) {
  const submissionId = uuid();
  const slots = [...docSlots().map((s) => s.key), SELFIE_KEY];
  const store = sb.storage.from(BUCKET);
  const uploaded = [];
  const docs = [];
  let finished = 0;

  const settled = await Promise.allSettled(
    slots.map(async (slot) => {
      const file = state.files[slot].file;
      const mime = mimeFor(file);
      const path = `${state.userId}/${submissionId}/${slot}.${EXT[mime]}`;
      const { error } = await store.upload(path, file, { contentType: mime, upsert: false });
      if (error) throw fail("upload", error.message, { slot });
      uploaded.push(path);
      docs.push({ slot, path });
      finished += 1;
      onProgress(finished, slots.length);
    })
  );

  const cleanup = () => (uploaded.length ? store.remove(uploaded).catch(() => {}) : Promise.resolve());

  const failed = settled.find((r) => r.status === "rejected");
  if (failed) {
    await cleanup();
    throw failed.reason;
  }

  const { error } = await sb.rpc("submit_kyc", {
    p_submission_id: submissionId,
    p_doc_type: state.docType,
    p_documents: docs,
    p_consent: state.consent,
    p_consent_version: CONSENT_VERSION,
  });
  if (error) {
    await cleanup();
    const msg = error.message || "";
    if (msg.includes("kyc_already_submitted")) throw fail("already_submitted", msg);
    if (error.code === "PGRST202" || error.code === "42883") throw fail("setup", msg);
    throw fail("server", msg);
  }
  return submissionId;
}

function submitErrorMessage(err) {
  if (err && err.code === "upload") {
    const slot = Object.values(DOC_TYPES).flatMap((d) => d.slots).find((s) => s.key === err.slot);
    const label = err.slot === SELFIE_KEY ? "selfie" : slot ? slot.label.toLowerCase() : "file";
    if (/bucket not found/i.test(err.message)) return "Verification isn't available right now. Please try again later.";
    return `We couldn't upload your ${label}. Check your connection and try again.`;
  }
  if (err && err.code === "setup") return "Verification isn't available right now. Please try again later.";
  return "We couldn't submit your documents. Check your connection and try again.";
}

async function submit() {
  if (state.submitting || !canContinue() || state.step !== 3) return;
  state.submitting = true;
  state.progressText = `Uploading 0 of ${docSlots().length + 1}`;
  setProgress(0);
  el("kyc-submit-error").textContent = "";
  render();

  try {
    await submitVerification((done, total) => {
      state.progressText = `Uploading ${done} of ${total}`;
      setProgress(done / (total + 1));
      el("kyc-hint").textContent = state.progressText;
    });
  } catch (err) {
    console.error("KYC submission failed:", err);
    state.submitting = false;
    state.progressText = "";
    // A submission from an earlier attempt already exists: show it instead
    if (err && err.code === "already_submitted") {
      const known = await loadKycState().catch(() => null);
      if (known && known.status !== "rejected") {
        Object.keys(state.files).forEach(clearFile);
        showStatus({ ...known, fresh: false });
        return;
      }
    }
    el("kyc-submit-error").textContent = submitErrorMessage(err);
    render();
    return;
  }

  setProgress(1);
  state.submitting = false;
  // The images are no longer needed here: release them from memory right away
  Object.keys(state.files).forEach(clearFile);
  showStatus({ status: "in_review", docType: state.docType, submittedAt: null, fresh: true });
}

// Full-page result: used right after submitting and when someone returns
// to this page with a submission that is already in review or approved.
function showStatus({ status, docType, submittedAt, fresh }) {
  state.done = true;
  state.status = status;
  state.docType = DOC_TYPES[docType] ? docType : null;
  const approved = status === "approved";
  const subject = state.docType ? `Your ${DOC_TYPES[state.docType].noun} and selfie` : "Your documents";
  const greeting = state.firstName ? `Thanks, ${state.firstName}. ` : "Thanks. ";

  el("kyc-done-title").textContent = approved ? "Identity verified" : fresh ? "Documents submitted" : "Verification in review";
  el("kyc-done-text").textContent = approved
    ? "Your identity has been verified. You're all set."
    : `${fresh ? greeting : ""}${subject} are in the review queue. We'll notify you here when your status changes.`;

  const setRow = (id, { done, current, when }) => {
    const li = el(id);
    li.classList.toggle("is-done", !!done);
    li.classList.toggle("is-current", !!current);
    li.querySelector(".kyc-status-when").textContent = when;
  };
  setRow("kyc-st-received", { done: true, when: fresh ? "Just now" : submittedAt ? formatWhen(submittedAt) : "" });
  setRow("kyc-st-review", approved ? { done: true, when: "Completed" } : { current: true, when: "Usually 24 to 48 hours" });
  setRow("kyc-st-decision", approved ? { done: true, when: "Approved" } : { when: "You'll be notified" });

  el("kyc-flow").hidden = true;
  el("kyc-topbar").querySelector(".kyc-skip").hidden = true;
  el("kyc-done").hidden = false;
  render();
  if (fresh) el("kyc-done-title").focus();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function bind() {
  document.querySelectorAll(".kyc-track-btn").forEach((btn) => {
    btn.addEventListener("click", () => go(Number(btn.dataset.go)));
  });

  el("kyc-next").addEventListener("click", () => {
    if (state.step === 3) submit();
    else go(state.step + 1);
  });
  el("kyc-back").addEventListener("click", () => go(state.step - 1));

  document.querySelectorAll('input[name="kyc-doctype"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      if (state.docType !== radio.value) {
        // A different document has different slots: drop the old uploads
        docSlots().forEach((s) => clearFile(s.key));
        state.slotsFor = null;
        state.docType = radio.value;
      }
      document.querySelectorAll(".kyc-doc").forEach((lab) => {
        lab.classList.toggle("is-selected", lab.contains(radio));
      });
      render();
    });
  });

  el("kyc-consent").addEventListener("change", (e) => {
    state.consent = e.target.checked;
    render();
  });

  // A file dropped outside a frame should not navigate the tab away
  ["dragover", "drop"].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));
  window.addEventListener("pagehide", () => Object.keys(state.files).forEach(clearFile));
}

async function init() {
  let ok = false;
  try {
    ok = await gate();
  } catch (err) {
    console.error("Session check failed:", err);
    window.location.href = "../../";
  }
  if (!ok) return;
  buildSelfieSlot();
  bind();

  let known = null;
  try {
    known = await loadKycState();
  } catch (err) {
    console.warn("KYC status check failed:", err);
  }
  if (known && known.status !== "rejected") {
    showStatus({ ...known, fresh: false });
  } else {
    if (known && known.status === "rejected") {
      state.rejection = { note: known.note };
      el("kyc-notice-text").textContent = state.rejection.note
        ? `${state.rejection.note} Upload new, clear images to try again.`
        : "Upload new, clear images to try again.";
    }
    render();
  }
  document.body.classList.add("is-ready");
}

init();