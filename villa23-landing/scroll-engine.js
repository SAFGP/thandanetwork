/* =========================================================================
   Journey scroll-scrub engine — dense AI frame sequence
   Canvas image-sequence (the Apple AirPods technique) scrubbing a
   Seedance-interpolated sequence of the estate. Progressive preload: the 10
   stop frames load first (instant coarse journey), the scrub starts, then the
   in-between frames stream in and sharpen the motion.

   Sequences are cut per viewport: portrait phones get a 9:16 crop of the 4K
   master (sharp at device resolution, roughly half the payload), small
   landscape viewports get the 1280px landscape set, desktop gets 2560px.

   Touch devices scroll natively out of sync with compositing on iOS, which
   makes a pinned stage jitter and lets the Safari toolbar collapse fire
   resize mid-scroll; ScrollTrigger.normalizeScroll plus ignoreMobileResize
   is the documented remedy, so Lenis runs on fine pointers only.

   Ordering: the pin is created synchronously before main.js builds its
   section triggers; one authoritative ScrollTrigger.refresh() runs after the
   priority frames load so all pin spacers and triggers agree.
   ========================================================================= */
(function () {
  "use strict";

  var STOPS = 10;     // narrative stops, for captions
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TOUCH = window.matchMedia("(pointer: coarse)").matches;
  var HAS_LIBS = !!(window.gsap && window.ScrollTrigger && window.Lenis);

  /* per-viewport sequence choice; 860px matches the CSS layout flip */
  function pickSeq() {
    var small = window.matchMedia("(max-width: 860px)").matches;
    var portrait = window.matchMedia("(orientation: portrait)").matches;
    if (small && portrait) return { dir: "assets/seq-portrait/frame_", frames: 137 };
    if (small) return { dir: "assets/seq-mobile/frame_", frames: 273 };
    return { dir: "assets/seq/frame_", frames: 273 };
  }
  var seq = pickSeq();
  var gen = 0;   // bumps when the sequence swaps (rotation), stale loads discard

  var canvas = document.getElementById("journey");
  var stage = document.getElementById("scrub-stage");
  var intro = document.getElementById("scrub-intro");
  var cue = document.getElementById("cue");
  var progressFill = document.getElementById("progress-fill");
  var preloader = document.getElementById("preloader");
  var preloadFill = document.getElementById("preloader-fill");
  var captions = Array.prototype.slice.call(document.querySelectorAll("#captions span"));
  var ctx = canvas.getContext("2d", { alpha: false });

  var images = new Array(seq.frames);
  var loaded = new Array(seq.frames);
  var lastP = 0;

  function src(i) {
    return seq.dir + String(i + 1).padStart(4, "0") + ".webp";
  }
  function stopFrame(k) { return Math.round(k * (seq.frames - 1) / (STOPS - 1)); }

  /* ---- canvas sizing (cover-fit, dpr-aware) ---- */
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = stage.clientWidth || window.innerWidth;
    var h = stage.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    draw(lastP);
  }

  function drawCover(img) {
    if (!img || !img.complete || !img.naturalWidth) return;
    var cw = canvas.width, ch = canvas.height;
    var scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    var dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  /* nearest already-loaded frame, so the scrub is never blank while filling */
  function nearestLoaded(idx) {
    if (loaded[idx]) return idx;
    for (var d = 1; d < seq.frames; d++) {
      if (idx - d >= 0 && loaded[idx - d]) return idx - d;
      if (idx + d < seq.frames && loaded[idx + d]) return idx + d;
    }
    return -1;
  }

  function draw(p) {
    lastP = p;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var idx = Math.round(p * (seq.frames - 1));
    var use = nearestLoaded(idx);
    if (use >= 0) drawCover(images[use]);
    updateOverlay(p);
  }

  function updateOverlay(p) {
    if (progressFill) progressFill.style.width = (p * 100).toFixed(2) + "%";
    if (intro) {
      var io = Math.max(0, 1 - p / 0.08);
      intro.style.opacity = io;
      intro.style.transform = "translate(-50%, calc(-50% - " + (p * 70).toFixed(0) + "px))";
      intro.style.pointerEvents = io < 0.05 ? "none" : "auto";
    }
    if (cue) cue.classList.toggle("is-hidden", p > 0.02);
    var active = p > 0.05 ? Math.round(p * (STOPS - 1)) : -1;
    for (var k = 0; k < captions.length; k++) captions[k].classList.toggle("is-active", k === active);
  }

  /* ---- GSAP ScrollTrigger pin + scrub ---- */
  function setupScrub() {
    gsap.registerPlugin(ScrollTrigger);
    /* the iOS toolbar collapse fires resize mid-scroll; without this the pin
       recalculates under the reader's thumb and the journey jumps */
    ScrollTrigger.config({ ignoreMobileResize: true });

    if (TOUCH) {
      ScrollTrigger.normalizeScroll(true);
    } else {
      var lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
      window.__lenis = lenis;
    }

    var proxy = { p: 0 };
    gsap.to(proxy, {
      p: 1, ease: "none",
      scrollTrigger: {
        trigger: stage, start: "top top",
        end: function () {
          var small = window.matchMedia("(max-width: 860px)").matches;
          return "+=" + Math.round(window.innerHeight * (STOPS - 1) * (small ? 0.6 : 0.72));
        },
        pin: stage, pinSpacing: true, anticipatePin: 1,
        scrub: TOUCH ? 0.6 : 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) { draw(self.progress); }
      }
    });
  }

  /* ---- frame loading ---- */
  function loadFrame(i) {
    var g = gen;
    return new Promise(function (resolve) {
      if (loaded[i]) return resolve();
      var img = new Image();
      img.decoding = "async";
      img.onload = function () {
        if (g === gen) { images[i] = img; loaded[i] = true; draw(lastP); }
        resolve();
      };
      img.onerror = function () {  // skip a missing frame, draw nearest instead of black
        if (g === gen) loaded[i] = false;
        resolve();
      };
      img.src = src(i);
    });
  }

  function loadStops(onProgress) {
    var stops = [];
    for (var k = 0; k < STOPS; k++) stops.push(stopFrame(k));
    var done = 0;
    return Promise.all(stops.map(function (s) {
      return loadFrame(s).then(function () {
        done++;
        if (onProgress) onProgress(done / stops.length);
      });
    }));
  }

  function finishPreloader() {
    if (preloader) preloader.classList.add("is-done");
    if (HAS_LIBS && !REDUCED && window.ScrollTrigger) {
      requestAnimationFrame(function () { ScrollTrigger.refresh(); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  }

  /* fill the in-between frames in the background, a few at a time */
  function fillRest() {
    var g = gen, i = 0, active = 0, MAX = 6;
    function pump() {
      if (g !== gen) return;
      while (active < MAX && i < seq.frames) {
        while (i < seq.frames && loaded[i]) i++;
        if (i >= seq.frames) break;
        active++;
        loadFrame(i++).then(function () { active--; pump(); });
      }
    }
    pump();
  }

  /* rotation, or a desktop window crossing the 860px flip: swap to the
     sequence cut for the new viewport and refill it */
  function reseed() {
    var next = pickSeq();
    if (next.dir === seq.dir) return;
    seq = next;
    gen++;
    images = new Array(seq.frames);
    loaded = new Array(seq.frames);
    loadStops(null).then(fillRest);
  }

  /* ---- boot ---- */
  resize();
  if (!HAS_LIBS || REDUCED) document.body.classList.add("is-reduced");
  else setupScrub();

  loadStops(function (f) {
    if (preloadFill) preloadFill.style.width = Math.round(f * 100) + "%";
  }).then(function () {
    finishPreloader();
    fillRest();
  });

  /* ---- resize (debounced) ---- */
  var rt, lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var wChanged = window.innerWidth !== lastW;
      lastW = window.innerWidth;
      /* iOS fires resize when the toolbar shows or hides; a height-only
         change on touch must not refresh the pin mid-scroll */
      if (TOUCH && !wChanged) return;
      reseed();
      resize();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }, 180);
  });

  setTimeout(function () { if (preloader && !preloader.classList.contains("is-done")) finishPreloader(); }, 12000);
})();
