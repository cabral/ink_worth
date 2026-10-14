/* ============================================================================
 * INK worth: reservation frontend
 * ----------------------------------------------------------------------------
 * Plain JavaScript, no framework, no build step. Two responsibilities:
 *
 *   1. Fill in live seat availability for any element marked
 *      [data-inkworth-availability] (see _includes/seats.html) by reading the
 *      public event_availability view over Supabase's REST API (anon key).
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
  var MAX_SEATS_PER_REQUEST = 20; // matches the edge function's sanity bound.

  function isConfigured(url, key) {
    return Boolean(url) && Boolean(key) && !PLACEHOLDER.test(url) && !PLACEHOLDER.test(key);
  }

  /* Find the Supabase URL/key for an element: on the element itself, or on the
   * nearest ancestor that carries them. */
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

  /* GitHub Pages only rebuilds on push, so a page built before an event can
   * outlive it. Compare the event's date with today in Stockholm. */
  function isPast(el) {
    var date = el.getAttribute("data-date");
    var today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    return Boolean(date) && date < today;
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

  function setState(el, state, text) {
    el.setAttribute("data-state", state);
    el.querySelector(".seats__label").textContent = text;
  }

  /* One square per seat, taken seats first. */
  function drawSeats(el, capacity, taken) {
    var pips = el.querySelector(".seats__pips");
    pips.textContent = "";
    for (var i = 0; i < capacity; i++) {
      var seat = document.createElement("span");
      seat.className = i < taken ? "seat seat--taken" : "seat";
      pips.appendChild(seat);
    }
  }

  function renderAvailability(el, row) {
    var capacity = row.capacity;
    var remaining = Math.max(0, row.remaining);
    var isFull = Boolean(row.is_full) || remaining <= 0;

    drawSeats(el, capacity, capacity - remaining);
    if (isFull) {
      setState(el, "full", "Fully booked" + (row.waiting ? " · " + row.waiting + " on the waiting list" : ""));
    } else {
      setState(el, "open", remaining + " of " + capacity + (capacity === 1 ? " seat" : " seats") + " left");
    }
    return { state: isFull ? "full" : "open", remaining: remaining, capacity: capacity };
  }

  function loadAvailability(el, onDone) {
    var cfg = readConfig(el);
    var slug = el.getAttribute("data-slug");
    var status = (el.getAttribute("data-status") || "open").toLowerCase();
    var done = onDone || function () {};

    if (isPast(el)) {
      setState(el, "past", "This session has passed");
      done({ state: "past" });
    } else if (status === "closed") {
      setState(el, "closed", "Reservations closed");
      done({ state: "closed" });
    } else if (!isConfigured(cfg.url, cfg.key) || !slug) {
      setState(el, "error", "Reservations aren't set up yet");
      done({ state: "unconfigured" });
    } else {
      fetchAvailability(cfg, slug)
        .then(function (rows) {
          var row = rows && rows.length ? rows[0] : null;
          if (row) {
            done(renderAvailability(el, row));
          } else {
            // The event is on the site but hasn't been seeded in Supabase yet.
            setState(el, "error", "Availability unavailable");
            done({ state: "error" });
          }
        })
        .catch(function () {
          setState(el, "error", "Couldn't load availability");
          done({ state: "error" });
        });
    }
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
    var seatsEl = widget.querySelector("[data-inkworth-availability]");
    var cfg = readConfig(seatsEl);
    var slug = seatsEl.getAttribute("data-slug");

    var toggle = widget.querySelector("[data-inkworth-toggle]");
    var form = widget.querySelector("[data-inkworth-form]");
    var cancel = widget.querySelector("[data-inkworth-cancel]");
    var submit = widget.querySelector("[data-inkworth-submit]");
    var message = widget.querySelector("[data-inkworth-message]");
    var nameError = widget.querySelector("[data-inkworth-name-error]");
    var seatsHint = widget.querySelector("[data-inkworth-seats-hint]");
    var nameInput = form.elements.name;
    var seatsInput = form.elements.seats;

    var mode = "reserve"; // flips to "waitlist" when the event is full.
    var booked = false; // after a successful booking the toggle stays hidden.

    function submitLabel() {
      return mode === "waitlist" ? "Join the waiting list" : "Confirm reservation";
    }

    // Called with every availability result: drives labels, limits and
    // which controls are visible.
    function applyState(result) {
      if (result.state === "open" || result.state === "full") {
        mode = result.state === "full" ? "waitlist" : "reserve";
        toggle.textContent = mode === "waitlist" ? "Join the waiting list" : "Reserve a seat";
        toggle.hidden = booked || !form.hidden;
        if (!submit.disabled) submit.textContent = submitLabel();
        if (mode === "waitlist") {
          seatsInput.max = MAX_SEATS_PER_REQUEST;
          seatsHint.textContent = "How many seats you'd take if some open up.";
        } else {
          seatsInput.max = result.remaining;
          seatsHint.textContent = "Up to " + result.remaining + " available.";
        }
      } else {
        toggle.hidden = true;
        form.hidden = true;
        if (result.state === "unconfigured") {
          showMessage(message, "info", "Online reservations aren't set up yet. Contact the organizer to hold a seat.");
        } else if (result.state === "closed") {
          showMessage(message, "info", "Reservations for this event are closed.");
        } else if (result.state === "past") {
          showMessage(message, "info", "This session has already happened, so reservations are closed.");
        }
      }
    }

    function flagName(invalid) {
      nameInput.setAttribute("aria-invalid", invalid ? "true" : "false");
      nameError.hidden = !invalid;
    }

    function send(name, seats) {
      submit.disabled = true;
      submit.textContent = "Sending…";
      message.hidden = true;

      fetch(cfg.url + "/functions/v1/reserve", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, restHeaders(cfg.key)),
        body: JSON.stringify({
          action: mode,
          event_id: slug,
          name: name,
          email: form.elements.email.value.trim(),
          seats: seats,
          notes: form.elements.notes.value.trim(),
        }),
      })
        .then(function (res) {
          return res.json().catch(function () {
            return { ok: false, reason: "database_error" };
          });
        })
        .then(function (result) {
          if (result && result.ok) {
            booked = true;
            form.hidden = true;
            toggle.hidden = true;
            form.reset();
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
            // The form that had focus is gone; hand focus to the confirmation.
            message.focus();
            loadAvailability(seatsEl, applyState);
          } else {
            var reason = result && result.reason ? result.reason : "database_error";
            // If seats ran out mid-flow, re-read availability so the open form
            // switches to the waiting list.
            if (reason === "not_enough_seats") {
              loadAvailability(seatsEl, applyState);
            }
            showMessage(message, "error", reasonText(reason, result));
          }
        })
        .catch(function () {
          showMessage(message, "error", "Couldn't reach the reservation service. Please try again.");
        })
        .finally(function () {
          submit.disabled = false;
          submit.textContent = submitLabel();
        });
    }

    loadAvailability(seatsEl, applyState);

    toggle.addEventListener("click", function () {
      form.hidden = false;
      toggle.hidden = true;
      message.hidden = true;
      nameInput.focus();
    });

    cancel.addEventListener("click", function () {
      form.hidden = true;
      toggle.hidden = false;
      message.hidden = true;
      flagName(false);
      toggle.focus();
    });

    nameInput.addEventListener("input", function () {
      if (nameInput.value.trim()) flagName(false);
    });

    form.addEventListener("submit", function (evt) {
      evt.preventDefault();
      var name = nameInput.value.trim();
      var seats = parseInt(seatsInput.value, 10);
      var max = parseInt(seatsInput.max, 10) || MAX_SEATS_PER_REQUEST;

      if (!name) {
        flagName(true);
        nameInput.focus();
      } else if (!Number.isInteger(seats) || seats < 1 || seats > max) {
        showMessage(message, "error", "Choose between 1 and " + max + (max === 1 ? " seat." : " seats."));
        seatsInput.focus();
      } else {
        send(name, seats);
      }
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */

  function init() {
    // Standalone availability (event list, home page). Widgets load their own.
    document.querySelectorAll("[data-inkworth-availability]").forEach(function (el) {
      if (!el.closest("[data-inkworth-widget]")) loadAvailability(el);
    });
    document.querySelectorAll("[data-inkworth-widget]").forEach(initWidget);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
