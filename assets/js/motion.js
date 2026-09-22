// ---------------------------------------------------------------------------
// Hallmark — motion.js. Load in <head>, right after motion.css (all pages
// except kyc.html).
//
// The pieces CSS can't do on its own:
//   * balances count up to their value (and count between values when a
//     transaction changes them)
//   * the spending donut sweeps in clockwise
//   * a list arriving for the first time staggers in; rows that start below
//     the fold wait until scrolled to
//   * the payment card tilts a few degrees toward the pointer
//   * the bell badge pops when its number changes
//
// Nothing here touches app logic or data: it only watches the DOM the page
// scripts already produce. Every piece is wrapped so a failure here can never
// break a page, and people who prefer reduced motion get none of it.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  // -- First visit of a session? -------------------------------------------
  // Runs in <head>, before first paint. Arriving from sign-in (or from
  // outside the app) lets the sidebar build itself; moving between app pages
  // does not, so the chrome stays still while the content changes.
  try {
    var ref = doc.referrer ? new URL(doc.referrer) : null;
    var fromApp = ref && ref.origin === location.origin &&
      /\/(dashboard|accounts|cards|payments|transfers|statements|settings)\.html$/.test(ref.pathname);
    if (!fromApp) root.classList.add("m-intro");
  } catch (e) { /* referrer unreadable: treat as a first visit */ }

  function ready(fn) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function safe(name, fn) {
    try { fn(); } catch (err) { console.warn("motion:", name, err); }
  }

  // =========================================================================
  // 1. Count-up
  // =========================================================================

  var COUNT_SEL = "#total-balance, #available-balance, .account-card-balance, #spend-total, .account-detail-balance";
  var NUMBER = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/;
  var lastValue = {};                 // remembered per element position, so a re-render of the same number doesn't replay
  var running = new WeakMap();        // element -> { raf, written }

  function keyOf(el) {
    if (el.id) return "#" + el.id;
    var all = doc.querySelectorAll(COUNT_SEL);
    return Array.prototype.indexOf.call(all, el) + ":" + el.className;
  }

  function format(n, decimals) {
    return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function countTo(el, pre, from, to, decimals, post) {
    var start = null;
    var duration = 900;
    var state = { raf: 0, written: "" };
    running.set(el, state);

    function write(v) {
      state.written = pre + format(v, decimals) + post;
      el.textContent = state.written;
    }
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        write(from + (to - from) * eased);
        state.raf = requestAnimationFrame(frame);
      } else {
        write(to);
        running.delete(el);
      }
    }
    write(from);                       // synchronous: the final value never flashes before the count begins
    state.raf = requestAnimationFrame(frame);
  }

  function handleCount(el) {
    var state = running.get(el);
    if (state) {
      if (el.textContent === state.written) return;   // our own write
      cancelAnimationFrame(state.raf);                 // the page set a new value mid-count: start over from it
      running.delete(el);
    }
    var m = NUMBER.exec(el.textContent.trim());
    if (!m) return;                                    // hidden ("•••") or not a number: leave it alone
    var key = keyOf(el);
    var to = parseFloat(m[2].replace(/,/g, ""));
    var decimals = (m[2].split(".")[1] || "").length;
    var from = Object.prototype.hasOwnProperty.call(lastValue, key) ? lastValue[key] : 0;
    lastValue[key] = to;
    if (from === to || !isFinite(to)) return;
    countTo(el, m[1], from, to, decimals, m[3]);
  }

  // =========================================================================
  // 2. Donut sweep
  // =========================================================================

  var donutCount = 0;
  var lastDonut = "";
  var lastDonutAt = 0;
  function decorateDonut(host) {
    var svg = host.querySelector("svg");
    if (!svg || svg.getAttribute("data-m")) return;
    svg.setAttribute("data-m", "1");
    // Sweep only when the numbers behind the ring changed, not on every re-render
    var signature = svg.innerHTML;
    if (signature === lastDonut && Date.now() - lastDonutAt > 1500) return;
    lastDonut = signature;
    lastDonutAt = Date.now();
    var NS = "http://www.w3.org/2000/svg";
    var id = "m-donut-" + (++donutCount);

    var ring = doc.createElementNS(NS, "circle");
    ring.setAttribute("class", "m-donut-mask");
    ring.setAttribute("cx", "34");
    ring.setAttribute("cy", "34");
    ring.setAttribute("r", "26");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#fff");
    ring.setAttribute("stroke-width", "20");
    ring.setAttribute("pathLength", "1");
    ring.setAttribute("transform", "rotate(-90 34 34)");

    var mask = doc.createElementNS(NS, "mask");
    mask.setAttribute("id", id);
    mask.appendChild(ring);
    var defs = doc.createElementNS(NS, "defs");
    defs.appendChild(mask);

    var group = doc.createElementNS(NS, "g");
    group.setAttribute("mask", "url(#" + id + ")");
    while (svg.firstChild) group.appendChild(svg.firstChild);
    svg.appendChild(defs);
    svg.appendChild(group);
  }

  // =========================================================================
  // 3. Lists arriving for the first time
  // =========================================================================

  var LIST_SEL = ".accounts-grid, .tx-list, .accounts-detail-list, .cards-grid";
  var handledLists = new WeakSet();

  function isPlaceholder(node) {
    return /empty/.test(node.className || "");     // tx-empty, spend-empty, stmt-empty-row ...
  }

  // Rows that start below the fold wait here. A scroll check (not an
  // IntersectionObserver) reveals anything that is in view OR above the
  // viewport, so jumping straight to the bottom never strands hidden rows.
  var pending = [];
  var ticking = false;

  function flush() {
    ticking = false;
    var vh = window.innerHeight || 800;
    pending = pending.filter(function (el) {
      if (!el.isConnected) return false;
      if (el.getBoundingClientRect().top >= vh) return true;     // still below the fold
      el.classList.add("m-visible");
      setTimeout(function () { el.classList.remove("m-await", "m-visible"); }, 1200);
      return false;
    });
    if (!pending.length) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    }
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(flush); }
  }
  function wait(el) {
    el.classList.add("m-await");
    if (!pending.length) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
    }
    pending.push(el);
  }

  function revealList(list) {
    if (handledLists.has(list)) return;
    var kids = Array.prototype.filter.call(list.children, function (k) { return !isPlaceholder(k); });
    if (!kids.length) return;                        // still only an empty-state message: wait for real content
    handledLists.add(list);

    var vh = window.innerHeight || 800;
    kids.slice(0, 40).forEach(function (kid, i) {
      kid.style.setProperty("--m-i", String(Math.min(i, 10)));
      if (kid.getBoundingClientRect().top < vh * 0.95) {
        kid.classList.add("m-stagger");
        kid.addEventListener("animationend", function done(e) {
          if (e.target !== kid) return;
          kid.classList.remove("m-stagger");
          kid.removeEventListener("animationend", done);
        });
      } else {
        wait(kid);
      }
    });
  }

  // =========================================================================
  // 4. Payment card tilt
  // =========================================================================

  function setupTilt() {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    var active = null;
    function reset() {
      if (active) { active.style.transform = ""; active = null; }
    }
    doc.addEventListener("pointermove", function (e) {
      var card = e.target && e.target.closest ? e.target.closest(".debit-card-visual") : null;
      if (!card) { reset(); return; }
      if (active && active !== card) reset();
      active = card;
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = "perspective(800px) rotateX(" + (-py * 6).toFixed(2) + "deg) rotateY(" + (px * 8).toFixed(2) + "deg)";
    }, { passive: true });
    doc.addEventListener("pointerout", function (e) {
      if (active && !active.contains(e.relatedTarget)) reset();
    }, { passive: true });
  }

  // =========================================================================
  // 5. Watching the page
  // =========================================================================

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches && node.matches(COUNT_SEL)) safe("count", function () { handleCount(node); });
    if (node.querySelectorAll) {
      node.querySelectorAll(COUNT_SEL).forEach(function (el) { safe("count", function () { handleCount(el); }); });
      node.querySelectorAll("#spend-donut").forEach(function (h) { safe("donut", function () { decorateDonut(h); }); });
    }
    if (node.id === "spend-donut") safe("donut", function () { decorateDonut(node); });
    var lists = [];
    if (node.matches && node.matches(LIST_SEL)) lists.push(node);
    if (node.querySelectorAll) node.querySelectorAll(LIST_SEL).forEach(function (l) { lists.push(l); });
    lists.forEach(function (l) { safe("list", function () { revealList(l); }); });
  }

  function onMutations(records) {
    records.forEach(function (rec) {
      var target = rec.target && rec.target.nodeType === 1 ? rec.target : rec.target && rec.target.parentElement;
      if (target) {
        var counted = target.closest ? target.closest(COUNT_SEL) : null;
        if (counted) safe("count", function () { handleCount(counted); });

        var badge = target.closest ? target.closest(".bell-badge") : null;
        if (badge && !badge.hidden) {
          badge.classList.remove("m-pop");
          void badge.offsetWidth;
          badge.classList.add("m-pop");
        }

        var donut = target.closest ? target.closest("#spend-donut") : null;
        if (donut) safe("donut", function () { decorateDonut(donut); });

        var list = target.closest ? target.closest(LIST_SEL) : null;
        if (list) safe("list", function () { revealList(list); });
      }
      rec.addedNodes.forEach(scan);
    });
  }

  ready(function () {
    safe("initial scan", function () {
      scan(doc.body);
    });
    safe("observer", function () {
      new MutationObserver(onMutations).observe(doc.body, { childList: true, characterData: true, subtree: true });
    });
    safe("tilt", setupTilt);
  });
})();
