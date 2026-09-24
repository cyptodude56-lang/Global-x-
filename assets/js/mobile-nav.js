// ---------------------------------------------------------------------------
// Hallmark — mobile-nav.js. Load at the end of <body> on every signed-in page
// (anything with the .sidebar-nav), before or after the page's own script.
//
// Phones get a native-app style bottom tab bar: four primary destinations
// plus "More", which opens the existing sidebar drawer for everything else.
// The bar is hidden by CSS from 641px up, where the sidebar rail takes over,
// so desktop is unchanged. It builds itself from the sidebar markup already
// on the page, so page HTML and page scripts need no changes.
//
// Also: Escape closes the drawer, and the page behind an open drawer or
// sheet stops scrolling.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  var TABS = [
    { nav: "dashboard", label: "Home", href: "../dashboard/", d: '<path d="M3 10.5 10 4l7 6.5M5 9.5V16h10V9.5"/>' },
    { nav: "transfers", label: "Transfer", href: "../transfers/", d: '<path d="M4 7h9M13 7l-3-3M13 7l-3 3M16 13H7M7 13l3-3M7 13l3 3"/>' },
    { nav: "payments", label: "Pay", href: "../payments/", d: '<rect x="5" y="3" width="10" height="14" rx="1.5"/><path d="M7.5 7h5M7.5 10h5M7.5 13h3"/>' },
    { nav: "cards", label: "Cards", href: "../cards/", d: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M2.5 8.5h15"/>' },
  ];
  var MORE = '<circle cx="4.5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/>';

  function svg(d) {
    return '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }

  function init() {
    var nav = document.querySelector(".sidebar-nav");
    if (!nav || document.querySelector(".tabbar")) return;

    var activeBtn = nav.querySelector(".nav-item.active");
    var current = activeBtn ? activeBtn.getAttribute("data-nav") : "";
    var inTabs = TABS.some(function (t) { return t.nav === current; });

    var bar = document.createElement("nav");
    bar.className = "tabbar";
    bar.setAttribute("aria-label", "Primary");

    TABS.forEach(function (t) {
      var a = document.createElement("a");
      a.className = "tabbar-item" + (t.nav === current ? " active" : "");
      a.href = t.href;
      if (t.nav === current) a.setAttribute("aria-current", "page");
      a.innerHTML = svg(t.d) + "<span>" + t.label + "</span>";
      bar.appendChild(a);
    });

    var more = document.createElement("button");
    more.type = "button";
    more.className = "tabbar-item" + (!inTabs && current ? " active" : "");
    more.setAttribute("aria-label", "More: accounts, loans, statements, settings");
    more.innerHTML = svg(MORE) + "<span>More</span>";
    more.addEventListener("click", function () {
      var burger = document.getElementById("btn-hamburger");
      if (burger) burger.click();
    });
    bar.appendChild(more);

    document.body.appendChild(bar);
    document.body.classList.add("has-tabbar");

    // Escape closes the drawer.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var sidebar = document.getElementById("sidebar");
      if (sidebar && sidebar.classList.contains("open")) {
        var close = document.getElementById("btn-sidebar-close");
        if (close) close.click();
      }
    });

    // Freeze the page behind the drawer / a modal sheet.
    var sidebar = document.getElementById("sidebar");
    var backdrop = document.getElementById("modal-backdrop");
    function syncLock() {
      var open = (sidebar && sidebar.classList.contains("open")) || (backdrop && !backdrop.hidden);
      document.documentElement.classList.toggle("scroll-locked", !!open);
    }
    if (window.MutationObserver) {
      var mo = new MutationObserver(syncLock);
      if (sidebar) mo.observe(sidebar, { attributes: true, attributeFilter: ["class"] });
      if (backdrop) mo.observe(backdrop, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
