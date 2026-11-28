/**
 * Offer panel — the conversion surface.
 *
 * Source of truth: yourdataweb/site-components (offer-panel.css, offer-panel.js).
 * Vendored into every site by scripts/sync-shared.mjs and pinned by src/components.lock.
 *
 * The situation this serves: the business has a finished website it did not commission.
 * The site is live for a fixed period, then it comes down unless they buy. This panel is
 * where that fact is stated and where the decision is made.
 *
 * Read from the site's data file (src/data.json):
 *   offerEnds   ISO date (YYYY-MM-DD) the site stops being offered. Drives the printed
 *               date, the day count and the red escalation — one value, three outputs.
 *   buyUrl      checkout link. When absent the primary action becomes the phone, because
 *               labelling a call "Me la quedo" would be a mislabel.
 *   offerEmail  contact address for the secondary action.
 *
 * Copy lives in each locale's dictionary under `offer`, so translations ride with the
 * rest of the site and no extra request is needed to render the panel.
 *
 * Behaviour:
 *   - Opens on load. The panel is the point of the page while the site is unbought; a
 *     pill nobody notices converts nothing.
 *   - Closes on the X, the backdrop, or Escape. Closing leaves a pill that reopens it,
 *     so the decision is deferred rather than lost, and the site stays usable.
 *   - Opening and closing are remembered per tab (sessionStorage): closing it twice in
 *     the same session does not fight the visitor.
 *   - With JavaScript off nothing renders and the site stays fully readable.
 */
(function () {
  "use strict";

  var KEY = "sm-offer-dismissed-v1";

  function readConfig() {
    var el = document.getElementById("sm-offer-config");
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function daysLeft(iso) {
    if (!iso) return null;
    var end = new Date(iso + "T23:59:59").getTime();
    if (isNaN(end)) return null;
    var d = Math.ceil((end - Date.now()) / 86400000);
    return d < 0 ? 0 : d;
  }

  function dismissed() {
    try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function remember() {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* private mode */ }
  }

  function hasPhone(cfg) {
    return !!(cfg.phoneE164 && String(cfg.phoneE164).replace(/[^0-9]/g, "").length >= 6);
  }

  function build(cfg, t) {
    var days = daysLeft(cfg.offerEnds);
    /* The red state is an escalation, not a separate message: same sentence, warmer
       colour, and only inside the last three weeks. */
    var urgent = days !== null && days <= 21;

    /* Nothing to act on means nothing to show. A panel with no working action is a
       dead end dressed as an offer. */
    var primaryHref = cfg.buyUrl || (hasPhone(cfg) ? "tel:" + cfg.phoneE164 : (cfg.offerEmail ? "mailto:" + cfg.offerEmail : ""));
    if (!primaryHref) return null;

    var primaryLabel = cfg.buyUrl ? t.cta : (hasPhone(cfg) ? t.ctaPhone : t.ctaMail);
    var primaryAttrs = cfg.buyUrl ? ' target="_blank" rel="noopener"' : "";

    /* The secondary must go somewhere different from the primary, or it is a dead end
       dressed as a choice. */
    var secondaryHref = "", secondaryLabel = "", secondaryAttrs = "";
    if (cfg.buyUrl) {
      if (cfg.offerEmail) { secondaryHref = "mailto:" + cfg.offerEmail; secondaryLabel = t.contact; }
      else if (hasPhone(cfg)) { secondaryHref = "tel:" + cfg.phoneE164; secondaryLabel = t.call; }
    } else if (cfg.offerEmail && hasPhone(cfg)) {
      secondaryHref = "tel:" + cfg.phoneE164;
      secondaryLabel = t.call;
    }

    var overlay = document.createElement("div");
    overlay.className = "sm-offer";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "sm-offer-title");
    overlay.setAttribute("aria-describedby", "sm-offer-lead");

    var features = (t.features || []).map(function (f) {
      return '<li class="sm-offer__feature">' + f + "</li>";
    }).join("");

    var when = "";
    if (cfg.offerEnds) {
      when =
        '<div class="sm-offer__when' + (urgent ? " is-urgent" : "") + '">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>' +
          "<div>" + t.until + " <strong>" + cfg.offerEndsLabel + "</strong>" +
            (days !== null ? '<span class="sm-offer__days">' + t.days.replace("{n}", days) + "</span>" : "") +
          "</div>" +
        "</div>";
    }

    overlay.innerHTML =
      '<div class="sm-offer__backdrop" data-offer-close></div>' +
      '<div class="sm-offer__panel">' +
        '<button class="sm-offer__close" type="button" data-offer-close aria-label="' + t.close + '">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>' +
        "</button>" +
        '<p class="sm-offer__kicker">' + t.kicker + "</p>" +
        '<h2 class="sm-offer__title" id="sm-offer-title">' + t.title + "</h2>" +
        '<p class="sm-offer__lead" id="sm-offer-lead">' + t.lead + "</p>" +

        /* Price: two labelled rows, not a side-by-side. The reader must be able to say
           "800–1800 to build it, 120 a year with them" without reading twice. */
        '<div class="sm-offer__prices">' +
          '<div class="sm-offer__price-row sm-offer__price-row--was">' +
            '<span class="sm-offer__price-label">' + t.priceWasLabel + "</span>" +
            '<span class="sm-offer__price-value">' + t.priceWas + "</span>" +
          "</div>" +
          '<div class="sm-offer__price-row sm-offer__price-row--now">' +
            '<span class="sm-offer__price-label">' + t.priceNowLabel + "</span>" +
            '<span class="sm-offer__price-value">' + t.priceNow + "<small>" + t.priceNowNote + "</small></span>" +
          "</div>" +
          '<div class="sm-offer__price-equiv">' + t.priceEquiv + "</div>" +
        "</div>" +

        (features ? '<ul class="sm-offer__features">' + features + "</ul>" : "") +
        when +
        '<div class="sm-offer__actions">' +
          '<a class="sm-offer__cta" href="' + primaryHref + '"' + primaryAttrs + ">" + primaryLabel +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 12 5.5 5.5L20 6.5"/></svg>' +
          "</a>" +
          (secondaryHref
            ? '<a class="sm-offer__secondary" href="' + secondaryHref + '"' + secondaryAttrs + ">" + secondaryLabel + "</a>"
            : "") +
        "</div>" +
        '<p class="sm-offer__foot">' + t.foot + "</p>" +
      "</div>";

    return overlay;
  }

  function init() {
    var cfg = readConfig();
    if (!cfg || !cfg.copy) return;

    var page = document.body;
    var opener = null;

    function open() {
      if (document.getElementById("sm-offer-root")) return;
      var overlay = build(cfg, cfg.copy);
      if (!overlay) return;
      overlay.id = "sm-offer-root";
      page.appendChild(overlay);
      page.classList.add("sm-offer-open");
      document.documentElement.classList.add("sm-offer-open");

      var focusables = overlay.querySelectorAll('a[href], button:not([disabled])');
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      /* Focus the panel's close button, not the CTA: sending focus straight to the buy
         button means a keyboard user can trigger a purchase by pressing Enter to dismiss
         a dialog they have not read. */
      var closeBtn = overlay.querySelector(".sm-offer__close");
      if (closeBtn) closeBtn.focus({ preventScroll: true });

      overlay.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { close(); return; }
        if (e.key !== "Tab" || !focusables.length) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }

    function close() {
      var overlay = document.getElementById("sm-offer-root");
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      page.classList.remove("sm-offer-open");
      document.documentElement.classList.remove("sm-offer-open");
      remember();
      showPill();
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }

    function showPill() {
      if (document.getElementById("sm-offer-pill")) return;
      var pill = document.createElement("button");
      pill.id = "sm-offer-pill";
      pill.className = "sm-offer-pill";
      pill.type = "button";
      pill.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v4h1"/></svg>' +
        "<span>" + (cfg.copy.pill || "Què passa amb aquesta web?") + "</span>";
      pill.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        opener = pill;
        if (pill.parentNode) pill.parentNode.removeChild(pill);
        open();
      }, true);
      page.appendChild(pill);
    }

    page.addEventListener("click", function (e) {
      if (e.target.closest("[data-offer-close]")) close();
    });

    /* Open on load, but let the page paint first: a dialog that covers a blank screen
       reads as an interstitial, and interstitials get closed on reflex. One frame is
       enough; any longer and it feels like a pop-up. */
    if (dismissed()) {
      showPill();
    } else {
      if (document.readyState === "complete") open();
      else window.addEventListener("load", function () { window.setTimeout(open, 60); }, { once: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
