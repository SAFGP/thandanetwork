/* =========================================================================
   Listing page interactions: film player and enquiry form.
   The editorial layout is static by design, no scroll libraries.
   ========================================================================= */
(function () {
  "use strict";

  /* ---- Enquiry form: posts to the Pages Function, real success/error states ---- */
  var form = document.getElementById("enquire-form");
  var note = document.getElementById("enquire-note");
  if (form && note) {
    var nameEl = form.querySelector("#f-name");
    var emailEl = form.querySelector("#f-email");
    var btn = form.querySelector("button[type=submit]");
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    var fail = function (el, msg) {
      el.setAttribute("aria-invalid", "true");
      note.textContent = msg;
      el.focus();
    };

    /* Turnstile issues one token per challenge, reset whenever a submit does not succeed */
    var resetTurnstile = function () {
      if (window.turnstile) { try { window.turnstile.reset(); } catch (err) {} }
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      nameEl.removeAttribute("aria-invalid");
      emailEl.removeAttribute("aria-invalid");

      var name = nameEl.value.trim();
      var email = emailEl.value.trim();
      var noteVal = form.querySelector("#f-note").value.trim();
      var listingEl = form.querySelector("[name=listing]");
      var listing = listingEl ? listingEl.value : "";

      if (!name) return fail(nameEl, "Please add your name.");
      if (!EMAIL_RE.test(email)) return fail(emailEl, "Please add a valid email address.");

      var token = "";
      if (window.turnstile) {
        try { token = window.turnstile.getResponse() || ""; } catch (err) { token = ""; }
      }
      if (!token) {
        var tokenEl = form.querySelector("[name=cf-turnstile-response]");
        token = tokenEl ? tokenEl.value : "";
      }
      if (!token) {
        note.textContent = "Please wait a moment and try again.";
        resetTurnstile();
        return;
      }

      btn.disabled = true;
      note.textContent = "Sending your enquiry...";

      fetch(form.action || "/api/enquire", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ name: name, email: email, note: noteVal, listing: listing, turnstile: token })
      }).then(function (res) {
        if (!res.ok) throw new Error("bad status " + res.status);
        note.textContent = "Thank you, " + name.split(" ")[0] + ". A principal broker will be in touch.";
        form.reset();
        resetTurnstile();
      }).catch(function () {
        note.innerHTML = "Something went wrong. Please email us at " +
          "<a href=\"mailto:info@southafricafgp.com\">info@southafricafgp.com</a>.";
        resetTurnstile();
      }).then(function () {
        btn.disabled = false;
      });
    });
  }

  /* ---- The Film: load the right source on demand, play with sound ---- */
  var filmStage = document.getElementById("film-stage");
  var filmVideo = document.getElementById("film-video");
  var filmPlay = document.getElementById("film-play");
  if (filmStage && filmVideo && filmPlay) {
    var filmStarted = false;
    var playFilm = function () {
      if (!filmStarted) {
        var small = window.matchMedia("(max-width: 860px)").matches;
        filmVideo.src = small
          ? filmVideo.getAttribute("data-src-sd")
          : filmVideo.getAttribute("data-src-hd");
        filmStarted = true;
      }
      filmStage.classList.add("is-playing");
      var p = filmVideo.play();
      if (p && p.catch) p.catch(function () {});
    };
    filmPlay.addEventListener("click", playFilm);
    var filmPoster = filmStage.querySelector(".film__poster");
    if (filmPoster) filmPoster.addEventListener("click", playFilm);
  }
})();
