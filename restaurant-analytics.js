(function () {
  "use strict";

  var SUPABASE_URL = "https://tehxobdokbvqtwtgqzrh.supabase.co";
  var SUPABASE_KEY = "sb_publishable_CrlY9xXYdhI7qCQwuMnDWg_hFQ3mXCJ";
  var STORAGE_KEY = "restaurant_deluxe_analytics_session";
  if (window.restaurantDeluxeTrackerInstalled) return;
  window.restaurantDeluxeTrackerInstalled = true;
  var enquiryStarted = false;
  var memorySession = null;
  var params = new URLSearchParams(location.search);
  var ordering = /\/Resto-order-test(?:\/|$)/i.test(location.pathname);
  var editor = params.get("edit") === "1";
  var customer = /\/(table-order|terms)\.html$/i.test(location.pathname);
  var scope = ordering ? (customer ? "ordering" : "staff") : (editor ? "editor" : "website");

  function sessionId() {
    if (memorySession) return memorySession;
    try {
      var existing = localStorage.getItem(STORAGE_KEY);
      if (existing) return (memorySession = existing);
      var created = (crypto && crypto.randomUUID) ? crypto.randomUUID() : "session-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem(STORAGE_KEY, created);
      return (memorySession = created);
    } catch {
      return (memorySession = "session-" + Date.now() + "-" + Math.random().toString(36).slice(2));
    }
  }

  function deviceType() {
    var width = window.innerWidth || 1200;
    return width < 700 ? "mobile" : width < 1050 ? "tablet" : "desktop";
  }

  function campaign() {
    var params = new URLSearchParams(location.search);
    return {
      journey_id: (params.get("journey_id") || "").slice(0, 100) || null,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign")
    };
  }

  function track(eventName, extra) {
    var payload = Object.assign({
      session_id: sessionId(),
      event_name: eventName,
      page_path: location.pathname,
      page_url: (location.origin + location.pathname).slice(0, 1000),
      referrer: document.referrer ? new URL(document.referrer).origin : null,
      device_type: deviceType(),
      metadata: { tracker: "restaurant-analytics-v1", scope: scope, product: ordering ? "table_ordering" : "restaurant_deluxe", audience: ordering && !customer ? "staff" : "visitor", mode: editor ? "editor" : "live" }
    }, campaign(), extra || {});

    try {
      fetch(SUPABASE_URL + "/rest/v1/analytics_events", {
        method: "POST",
        keepalive: true,
        headers: {
          "apikey": SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch {}
  }

  var isDemo = location.hostname === "mteleki-wq.github.io" || /cafe-bojo/i.test(location.pathname);
  track("page_view");
  if (isDemo) track("demo_arrival");

  var ctaEvents = {
    demo: "demo_click",
    ordering: "ordering_click",
    pricing: "pricing_click",
    booking: "booking_demo_click",
    trial: "trial_click",
    presentation: "presentation_click",
    contact: "contact_click",
    alex: "contact_click"
  };

  document.addEventListener("click", function (event) {
    var element = event.target && event.target.closest ? event.target.closest("[data-cta]") : null;
    if (!element) return;
    var cta = element.getAttribute("data-cta");
    var eventName = ctaEvents[cta];
    if (!eventName) return;
    track(eventName, { cta: cta, target_url: element.href ? new URL(element.href, location.href).origin + new URL(element.href, location.href).pathname : null });
  }, true);

  var enquiryForm = document.getElementById("enquiryForm");
  if (enquiryForm) {
    enquiryForm.addEventListener("focusin", function () {
      if (!enquiryStarted) { enquiryStarted = true; track("enquiry_start", { cta: "enquiry-form" }); }
    });
    enquiryForm.addEventListener("submit", function () { track("enquiry_submit", { cta: "enquiry-form" }); }, true);
  }

  if (isDemo) {
    var bookingForm = document.querySelector("form");
    if (bookingForm) bookingForm.addEventListener("focusin", function once() {
      track("booking_start", { cta: "booking-form" });
      bookingForm.removeEventListener("focusin", once);
    });
  }
})();
