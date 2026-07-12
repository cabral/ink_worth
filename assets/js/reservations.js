/* ============================================================================
 * INK worth — reservation frontend
 * ----------------------------------------------------------------------------
 * Plain JavaScript, no framework, no build step. Two responsibilities:
 *
 *   1. Fill in live seat availability for any element marked
 *      [data-inkworth-availability] by reading the public event_availability
 *      view over Supabase's REST API (anon key).
 *
 *   2. Wire up the reservation form on an event page
 *      ([data-inkworth-widget]): reveal the form, POST it to the `reserve`
 *      edge function, and show the result. When the event is full the same
 *      form doubles as a waiting-list sign-up.
 *
 * Capacity is enforced by the backend; the numbers shown here are a
 * convenience that the server always re-checks before storing anything.
 * ========================================================================== */
(function () {
  "use strict";

  var PLACEHOLDER = /YOUR-(PROJECT|SUPABASE)/i;

  function isConfigured(url, key) {
    return Boolean(url) && Boolean(key) && !PLACEHOLDER.test(url) && !PLACEHOLDER.test(key);
  }

  /* Find the Supabase URL/key for an element: on the element itself, or on the
   * nearest ancestor that carries them (the widget or the event list). */
  function readConfig(el) {
    var host = el.closest("[data-supabase-url]") || el;
    return {
      url: (host.getAttribute("data-supabase-url") || "").replace(/\/+$/, ""),
      key: host.getAttribute("data-supabase-key") || "",
    };
  }

  function restHeaders(key) {
    return { apikey: key, Authorization: "Bearer " + key };
  }

  /* ── Availability ───────────────────────────────────────────────────────── */

  function fetchAvailability(cfg, slug) {
    var endpoint =
      cfg.url +
      "/rest/v1/event_availability?slug=eq." +
      encodeURIComponent(slug) +
      "&select=capacity,reserved,remaining,is_full,waiting";
    return fetch(endpoint, { headers: restHeaders(cfg.key) }).then(function (res) {
      if (!res.ok) throw new Error("availability request failed: " + res.status);
      return res.json();
    });
  }

  function renderAvailability(el, data) {
    var meter = el.parentElement
      ? el.parentElement.querySelector(".seat-meter__fill") ||
        (el.closest(".reservation-widget") || el.closest(".event-card") || document).querySelector(".seat-meter__fill")
      : null;
    var status = (el.getAttribute("data-status") || "open").toLowerCase();
    var capacityAttr = parseInt(el.getAttribute("data-capacity"), 10);

    if (status === "closed") {
      el.textContent = "Reservations closed";
      el.setAttribute("data-state", "closed");
      if (meter) meter.style.width = "0%";
      return { state: "closed" };
    }

    var capacity = data && typeof data.capacity === "number" ? data.capacity : capacityAttr || 0;
    var remaining = data && typeof data.remaining === "number" ? data.remaining : capacity;
    var isFull = data ? Boolean(data.is_full) || remaining <= 0 : false;
    var reserved = capacity - remaining;

    if (isFull) {
      var waiting = data && data.waiting ? data.waiting : 0;
      el.textContent = "Fully booked" + (waiting ? " · " + waiting + " on the waiting list" : "");
      el.setAttribute("data-state", "full");
    } else {
      el.textContent = remaining + " of " + capacity + " seats remaining";
      el.setAttribute("data-state", "open");
    }

    if (meter && capacity > 0) {
      meter.style.width = Math.min(100, Math.round((reserved / capacity) * 100)) + "%";
      meter.setAttribute("data-full", isFull ? "true" : "false");
    }

    return { state: isFull ? "full" : "open", remaining: remaining, capacity: capacity };
  }

  function loadAvailability(el, onDone) {
    var cfg = readConfig(el);
    var slug = el.getAttribute("data-slug");
    var status = (el.getAttribute("data-status") || "open").toLowerCase();

    if (status === "closed") {
      var closed = renderAvailability(el, null);
      if (onDone) onDone(closed);
      return;
    }

    if (!isConfigured(cfg.url, cfg.key)) {
      el.textContent = "Reservations aren't set up yet";
      el.setAttribute("data-state", "error");
      if (onDone) onDone({ state: "unconfigured" });
      return;
    }

    if (!slug) {
      el.textContent = "";
      el.setAttribute("data-state", "error");
      if (onDone) onDone({ state: "error" });
      return;
    }

    fetchAvailability(cfg, slug)
      .then(function (rows) {
        var row = rows && rows.length ? rows[0] : null;
        if (!row) {
          // No matching row in Supabase yet — event exists on the site but
          // hasn't been seeded in the database.
          el.textContent = "Availability unavailable";
          el.setAttribute("data-state", "error");
          if (onDone) onDone({ state: "error" });
          return;
        }
        var result = renderAvailability(el, row);
        if (onDone) onDone(result);
      })
      .catch(function () {
        el.textContent = "Couldn't load availability";
        el.setAttribute("data-state", "error");
        if (onDone) onDone({ state: "error" });
      });
  }

  /* ── Reservation widget ─────────────────────────────────────────────────── */

  function showMessage(box, kind, text) {
    box.textContent = text;
    box.className = "form-message form-message--" + kind;
    box.hidden = false;
  }

  var REASONS = {
    not_enough_seats: function (r) {
      var n = r && typeof r.remaining === "number" ? r.remaining : 0;
      if (n <= 0) return "Sorry, this event just filled up. You can join the waiting list instead.";
      return "Sorry, only " + n + (n === 1 ? " seat remains." : " seats remain.");
    },
    invalid_seats: "Please enter a valid number of seats.",
    invalid_name: "Please enter your name.",
    missing_event: "Something went wrong identifying this event.",
    event_not_found: "This event isn't open for reservations yet.",
    server_misconfigured: "Reservations aren't fully set up yet. Please try again later.",
    database_error: "Something went wrong on our end. Please try again.",
  };

  function reasonText(reason, result) {
    var entry = REASONS[reason];
    if (typeof entry === "function") return entry(result);
    if (typeof entry === "string") return entry;
    return "Sorry, that didn't work. Please try again.";
  }

  function initWidget(widget) {
    var cfg = readConfig(widget);
    var slug = widget.getAttribute("data-slug");
    var status = (widget.getAttribute("data-status") || "open").toLowerCase();

    var availabilityEl = widget.querySelector("[data-inkworth-availability]");
    var actions = widget.querySelector("[data-inkworth-actions]");
    var toggle = widget.querySelector("[data-inkworth-toggle]");
    var form = widget.querySelector("[data-inkworth-form]");
    var cancel = widget.querySelector("[data-inkworth-cancel]");
    var submit = widget.querySelector("[data-inkworth-submit]");
    var message = widget.querySelector("[data-inkworth-message]");

    var mode = "reserve"; // flips to "waitlist" when the event is full.

    function applyState(result) {
      if (!result) return;
      if (result.state === "unconfigured") {
        showMessage(
          message,
          "info",
          "Online reservations aren't set up yet. Contact the organizer to hold a seat."
        );
        return;
      }
      if (result.state === "closed") {
        showMessage(message, "info", "Reservations for this event are closed.");
        return;
      }
      if (result.state === "error") {
        toggle.hidden = true;
        return;
      }
      if (result.state === "full") {
        mode = "waitlist";
        toggle.textContent = "Join Waiting List";
        toggle.hidden = false;
      } else {
        mode = "reserve";
        toggle.textContent = "Reserve Spot";
        toggle.hidden = false;
      }
    }

    // Initial availability load drives the button label/visibility.
    loadAvailability(availabilityEl, applyState);

    toggle.addEventListener("click", function () {
      form.hidden = false;
      toggle.hidden = true;
      message.hidden = true;
      var firstField = form.querySelector("input, textarea");
      if (firstField) firstField.focus();
    });

    cancel.addEventListener("click", function () {
      form.hidden = true;
      toggle.hidden = false;
      message.hidden = true;
    });

    form.addEventListener("submit", function (evt) {
      evt.preventDefault();

      if (!isConfigured(cfg.url, cfg.key)) {
        showMessage(message, "info", "Online reservations aren't set up yet.");
        return;
      }

      var name = (form.elements.name.value || "").trim();
      var email = (form.elements.email.value || "").trim();
      var seats = parseInt(form.elements.seats.value, 10);
      var notes = (form.elements.notes.value || "").trim();

      if (!name) {
        showMessage(message, "error", "Please enter your name.");
        return;
      }
      if (!Number.isInteger(seats) || seats < 1) {
        showMessage(message, "error", "Please enter how many seats you'd like (at least one).");
        return;
      }

      submit.disabled = true;
      var originalLabel = submit.textContent;
      submit.textContent = "Sending…";
      message.hidden = true;

      fetch(cfg.url + "/functions/v1/reserve", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, restHeaders(cfg.key)),
        body: JSON.stringify({
          action: mode === "waitlist" ? "waitlist" : "reserve",
          event_id: slug,
          name: name,
          email: email,
          seats: seats,
          notes: notes,
        }),
      })
        .then(function (res) {
          return res.json().catch(function () {
            return { ok: false, reason: "database_error" };
          });
        })
        .then(function (result) {
          if (result && result.ok) {
            if (mode === "waitlist") {
              showMessage(
                message,
                "success",
                "You're on the waiting list for " +
                  seats +
                  (seats === 1 ? " seat" : " seats") +
                  ". The organizer will be in touch if a spot opens up."
              );
            } else {
              showMessage(
                message,
                "success",
                "Reservation confirmed. " +
                  seats +
                  (seats === 1 ? " seat is" : " seats are") +
                  " held for " +
                  name +
                  ". See you there!"
              );
            }
            form.hidden = true;
            form.reset();
            // Refresh the live count and button after a successful write.
            loadAvailability(availabilityEl, applyState);
          } else {
            var reason = result && result.reason ? result.reason : "database_error";
            // If seats ran out mid-flow, re-read availability so the widget
            // offers the waiting list next.
            if (reason === "not_enough_seats") {
              loadAvailability(availabilityEl, applyState);
            }
            showMessage(message, "error", reasonText(reason, result));
            toggle.hidden = false;
          }
        })
        .catch(function () {
          showMessage(message, "error", "Couldn't reach the reservation service. Please try again.");
          toggle.hidden = false;
        })
        .finally(function () {
          submit.disabled = false;
          submit.textContent = originalLabel;
        });
    });

    // Keep the widget's own status flag in mind for closed events.
    if (status === "closed") {
      toggle.hidden = true;
    }
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */

  function init() {
    // Standalone availability badges (event index cards).
    var badges = document.querySelectorAll("[data-inkworth-availability]");
    badges.forEach(function (el) {
      // Skip badges that live inside a widget; the widget loads those itself.
      if (el.closest("[data-inkworth-widget]")) return;
      loadAvailability(el);
    });

    // Full reservation widgets (event detail pages).
    var widgets = document.querySelectorAll("[data-inkworth-widget]");
    widgets.forEach(initWidget);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
