# Technical Foundation: AI-Generated, Scroll-Scrubbed Luxury Villa Website (Thanda, South Africa)

## TL;DR
- **Build the scroll-scrub journey as a canvas-drawn image sequence (WebP/JPEG frames), NOT a raw `<video>` with `currentTime` scrubbing** — the canvas/image-sequence approach (the Apple AirPods/MacBook technique) is the only method that is reliably frame-accurate, smooth, and bidirectional across Chrome, Firefox, and iOS Safari. Drive it with GSAP ScrollTrigger (pinned, `scrub:1`) + Lenis smooth scroll.
- **For the AI transitions, use ByteDance Seedance 2.0 image-to-video in first-frame/last-frame mode** (`image_url` + `end_image_url` on fal.ai) — it natively interpolates from photo N to photo N+1; architecture/interior/exterior photos pass the content filter fine (only human faces are blocked). Generate 9 clips (4–15s each), stitch, then export to a frame sequence.
- **Host the site on Cloudflare Pages but serve the heavy media (frame sequence/master video) from Cloudflare R2 (zero egress) behind the Cloudflare CDN** — this is the genuinely best technical fit for a bandwidth-heavy scroll site and aligns with the user's Cloudflare preference; Vercel's overage model (1TB included on Pro, then $40 per additional 100GB ≈ $0.15/GB) is the wrong economic shape for this use case.

## Key Findings

1. **Naive HTML5 `<video>` + `currentTime` scrubbing is unreliable.** It stutters because videos store only periodic keyframes (I-frames) with delta frames between; when scrubbing/reversing, most browsers must decode from the prior keyframe, causing jank. iOS Safari handles it best (it reconstructs delta frames on the fly); Firefox is choppy with MP4 and needs WebM; Chrome is middling. This cross-browser inconsistency makes raw video scrubbing fragile for a flagship luxury site.
2. **The robust, proven method is an image sequence painted to `<canvas>`** — preload frames as `Image`/`ImageBitmap` objects, then on scroll draw the correct frame index. This is what Apple uses on AirPods/MacBook pages. It gives perfect frame accuracy, instant bidirectional scrubbing, and no decode stutter.
3. **If you keep a single video, it must be re-encoded with a very low GOP (keyframe every 1–2 frames).** `-g 1` (every frame a keyframe) is smoothest but ~2× file size; `-g 2` is the sweet spot. Always add `-movflags +faststart` and preload the whole file via fetch→blob.
4. **GSAP ScrollTrigger + Lenis is the current standard stack** for pinning the scrub section, binding playback to scroll (`scrub`), then releasing into normal scroll for the feature sections below. GSAP has been 100% free since the end of April 2025 (following Webflow's October 15, 2024 acquisition of GreenSock) — this covers ScrollTrigger, ScrollSmoother, SplitText and MorphSVG.
5. **Seedance 2.0 is real, current, and ideal here.** It is ByteDance's flagship video model (launched February 12, 2026 by ByteDance's SEED Lab; as of April 2026 available only in preview via partners such as fal.ai rather than a global production API), supports image-to-video with explicit first-frame AND last-frame inputs, 4–15s clips, and is explicitly marketed for "architectural visualization and interior design." Seedance 2.5 (30s native, 4K) was announced June 23, 2026 but is enterprise-beta only — not yet API-available, so build on 2.0.
6. **Hosting: Cloudflare Pages (unlimited bandwidth) + R2 (zero egress) is the best fit.** Vercel's free Hobby tier caps at 100GB bandwidth and its Pro plan includes 1TB then charges $40 per additional 100GB — punitive for a media-heavy site. Bunny CDN/Stream is a strong, cheap alternative for the video specifically.

## Details

### 1. Scroll-Scrubbed Video Implementation

**The three approaches and their tradeoffs:**

| Approach | Smoothness | Mobile reliability | File size | Verdict |
|---|---|---|---|---|
| (a) `<video>` + `currentTime` on scroll | Janky on reverse/seek unless GOP=1–2 | Poor on Firefox/inconsistent | Smallest | Avoid as primary |
| (b) Image sequence → `<canvas>` (Apple method) | Excellent, frame-accurate, bidirectional | Best (with resolution tiers) | Largest (mitigated by WebP) | **Recommended** |
| (c) Library: ScrollyVideo.js | Good; uses WebCodecs where available | WebCodecs Chrome-only; falls back to playbackRate/currentTime | Medium | Good fast-path option |

**Why naive video scrubbing stutters:** Video compression uses I-frames (full keyframes), P-frames and B-frames (deltas referencing other frames). To seek to an arbitrary time, the player finds the nearest *previous* keyframe and decodes forward. With sparse keyframes, scrubbing — especially backward — forces repeated heavy decodes, producing visible lag. Known fixes: (1) encode with frequent keyframes (`-g 1` or `-g 2`); (2) preload the entire file as a blob/ArrayBuffer (the `preload` attribute is only a hint and won't force full download); (3) provide both MP4 (H.264) and WebM because Firefox is choppy with MP4 and iOS Safari dislikes WebM; (4) ultimately, extract to frames and paint to canvas to eliminate decode-on-seek entirely.

**Recommended architecture for THIS site: image sequence on canvas.**
- Extract the stitched master video into a numbered frame sequence (WebP preferred — ~25–35% smaller than JPEG at equal quality; per geyer.dev, Apple's AirPods 65-PNG sequence of 15.2MB would compress to ~1.7MB as WebP, a nearly 90% reduction).
- Preload frames (ideally decode via `createImageBitmap()` off the main thread / in a Web Worker with OffscreenCanvas), keep `ImageBitmap` objects in memory, and `drawImage` the current index on scroll.
- Use GSAP's official `imageSequence` helper pattern: animate a `{frame: 0}` proxy object to `frameCount-1` with `ease:"none"`, `snap:"frame"`, inside a ScrollTrigger with `scrub:true`, `pin:true`.

**Frame count & scroll distance:** Map the journey (10 stops) across a pinned scroll distance. Rule of thumb: total scroll distance ÷ frame count = pixels per frame. Apple stretches 65 frames over ~1200px (~18.5px/frame) and it's acceptable; for buttery feel aim closer to a frame every ~10–15px of scroll. For 10 stops with smooth interpolation you'll likely have 150–300 frames total; budget e.g. `end: "+=3000"` to `"+=6000"` for the pinned section.

**Concrete ffmpeg commands:**

*Scrub-optimised single master video (if using video approach):*
```
ffmpeg -i input.mp4 -vf scale=1920:-1 -movflags +faststart \
  -vcodec libx264 -crf 18 -g 1 -pix_fmt yuv420p -an output_scrub.mp4
```
(`-g 1` = every frame a keyframe = smoothest; use `-g 2` to roughly halve size with still-excellent scrubbing. `-an` strips audio. `yuv420p` + baseline/level profile for max browser compatibility. `+faststart` moves the moov atom to the front so playback/seeking can begin before full download.) This is the community-standard "smooth scrubbing" encode; for maximum compatibility add `-profile:v baseline -level 3`.

*Extract a WebP frame sequence for the canvas approach:*
```
# 1. Extract frames as high-quality PNG first (lossless intermediate)
ffmpeg -i master.mp4 -vsync 0 frames/frame_%04d.png
# 2. Convert to web-optimised WebP (quality 75–85 is the sweet spot)
ffmpeg -i frames/frame_%04d.png -quality 82 web/frame_%04d.webp
# OR extract straight to WebP:
ffmpeg -i master.mp4 -vsync 0 -quality 82 web/frame_%04d.webp
```
Provide a downscaled second tier for mobile (e.g. `scale=960:-1`).

**Codec/encoding guidance:** For the canvas path, codec is irrelevant for the final master (you're shipping images) — but encode the intermediate at high quality (CRF 18). For the optional single-video path: H.264 (libx264) for universal compatibility + WebM/VP9 for Firefox; H.265/AV1 give smaller files but have weaker/uneven browser decode support and aren't worth the risk for scrubbing. Keep frame rate modest (24–30fps); resolution 1920px desktop / 960px mobile.

**Newer libraries:** ScrollyVideo.js (dkaoster) handles encoding/buffering headaches automatically, uses WebCodecs for true frame decode where supported (Chromium), and falls back to playbackRate (forward) + currentTime (reverse) elsewhere; it auto-detects Safari and forces the currentTime method. It's the fastest path if you want to keep a video. But for maximum control and guaranteed smoothness on a flagship build, the hand-rolled canvas image-sequence + GSAP is the more robust choice.

**Responsive/mobile:** serve lower-resolution frame tiers (e.g. 960px wide) on small screens; lazy-preload in priority order (load keyframe stops 1,2,3…10 first so a degraded version is ready fast, then fill in-betweens — Apple does exactly this); show a loader until enough frames are buffered to start; on very low-end devices or `prefers-reduced-motion`, fall back to a single static hero image (Apple's documented fallback).

### 2. Smooth-Scroll + Animation Stack

**Core stack:** GSAP + ScrollTrigger + Lenis. Wire them together so Lenis drives ScrollTrigger:
```js
gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis({ autoRaf: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

**Pinning the scrub section:** create a ScrollTrigger on the canvas wrapper with `start:"top top"`, `end:"+=4000"` (the scroll distance that defines the journey length), `pin:true`, `scrub:1` (the `1` adds ~1s smoothing so the playhead eases toward the scrollbar — gives the luxury "catch-up" feel). Tween the frame proxy across that range. When the trigger ends, the section unpins and normal scroll continues into the feature-overview sections. Use `invalidateOnRefresh:true` and recompute canvas size on resize (throttled/debounced). For pinning use `pinType:"fixed"` and consider `anticipatePin:1` to avoid a flash at pin start. Note a known gotcha: ScrollTrigger `once:true` + pin + scrub + Lenis can leave a blank space — avoid `once` here; the journey should remain scrubbable both directions.

**"Stays at the end" behaviour:** by default once you scroll past the pinned video it can snap back to frame 0 if not handled. Ensure the final frame persists by keeping the last drawn index when the trigger completes (set frame to `frameCount-1` on leave).

**Effect 2 — "3D scroll" (parallax depth):** Two patterns:
- GSAP ScrollSmoother `data-speed` attributes (`1.2` = moves faster/appears closer, `0.7` = slower/farther) for cinematic layered depth; or plain ScrollTrigger tweens on `yPercent` per layer with `scrub:true`.
- For true perspective, use CSS `perspective` on a container and translate layers on Z, or Three.js for a depth-based gallery (planes on the Z-axis).

**Effect 3 — "mouse tracking":** Track pointer position and `gsap.to()` each layer's `x/y` proportional to `(mouse - center)/size * depthFactor`, with eased catch-up (e.g. `power2`, duration 0.5). Deeper layers shift more for parallax. The Codrops scroll-reactive 3D gallery pattern combines three inputs cleanly: parallax = mouse position, scroll-drift = scroll direction, "breath" = scroll velocity (tilt/scale on fast scroll, settle at rest). Libraries like SuperParallax expose `data-parallax-layer` / `data-parallax-depth` attributes if you want a declarative approach. Always gate mouse-tracking behind a pointer/hover media query so it doesn't fire on touch.

### 3. Seedance 2 (AI Video Generation) — First/Last-Frame Interpolation

**What "Seedance 2" is (verified):** Seedance is ByteDance's text/image-to-video model line. Seedance 1.0 launched June 2025; **Seedance 2.0 launched February 12, 2026** (ByteDance SEED Lab) with a unified multimodal audio-video architecture (text, image, audio, video inputs). Per TechTimes (June 24, 2026): *"On the Artificial Analysis Video Arena... Seedance 2.0 currently ranks first for text-to-video with audio, with an Elo score of 1,218, ahead of Kling 3.0 and Google Veo 3.1."* As of April 2026 there was no global production API — access was preview-only via partners including fal.ai. **Seedance 2.5** (native 30-second single-pass, 4K, up to 50 reference inputs) was announced June 23, 2026 at the Volcano Engine FORCE conference but is **enterprise-beta only, public launch targeted early July 2026 — not yet API-available.** Seedance 2.0 itself gained a 4K/10-bit upgrade at the same event. **Recommendation: build on Seedance 2.0 (image-to-video) now.**

**Image-to-video / first-last-frame capability (verified via fal.ai API):**
- The `bytedance/seedance-2.0/image-to-video` endpoint takes a **required `image_url` (start frame)** and an **optional `end_image_url` (last frame)**. Verbatim from the fal.ai API page: *"The URL of the image to use as the last frame of the video. When provided, the generated video will transition from the starting image to this ending image. Supported formats: JPEG, PNG, WebP. Max 30 MB."* This is exactly the photo-N → photo-N+1 interpolation the pipeline needs.
- Inputs: JPEG/PNG/WebP, max 30MB per image (no published pixel cap; ≥1080p reference recommended).
- Output: **480p/720p on fal's image-to-video** (1080p on the standard tier per fal's model page; up to 2K on BytePlus/Volcengine "Pro" tier; WaveSpeedAI exposes up to 1080p). **Duration 4–15s** (or `auto`, per fal: *"Supports 4 to 15 seconds, or auto"*). Aspect ratios: auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16.
- Other params: `prompt` (required), `resolution`, `duration`, `aspect_ratio`, `generate_audio` (default true; cost unaffected — set false here since we strip audio), `seed`.
- Endpoints also include `/fast/image-to-video` (cheaper) and `/reference-to-video` (the `@Image1` tagging multimodal mode — different from plain first/last-frame).
- Pricing (fal, 2026): 720p ≈ **$0.30/second**, 1080p ≈ **$0.68/second**. Per fal's Seedance 2.0 Fast model page: *"A 10-second fast clip costs approximately $2.42, versus ~$3.03 on standard"* (resolution enum 480p/720p/1080p, default 720p, 1080p standard-tier only). WaveSpeedAI: $0.60/5s at 480p, 720p 2×, 1080p 3×; Fast −33%, Mini −50%. BytePlus official ≈ $0.14/s token-based.
- Other API surfaces: WaveSpeedAI uses `last_image` for the end frame; official BytePlus/Volcengine ModelArk uses model IDs like `dreamina-seedance-2-0-260128` with an async create-task→poll→retrieve pattern (`ratio` instead of `aspect_ratio`). Higgsfield is credit-based but reportedly unavailable in the US/Japan.

**Content filter — architecture is safe (verified):** Seedance 2.0 runs face detection on uploaded reference images and rejects real human faces (deepfake liability) — per ByteDance/Volcengine's own spec, *"Seedance 2.0 series models do not support direct upload of reference images/videos containing real human faces."* It does **not** block buildings/interiors/exteriors; fal explicitly markets it for "architectural visualization and interior design workflows." Caveat: a property photo with a clearly visible person could trip the face filter — prefer photos without prominent people, or expect occasional false positives.

**Best practices for first→last-frame camera-movement prompting (architecture):**
- **Use cinematographer vocabulary, not vague instructions.** Name one primary camera move per clip: push-in (dolly in), pull-back, pan, tilt, orbit, crane up/down, aerial flyover, tracking/side-slide.
- **One dominant motion axis at a time.** Stacking "dolly in while orbiting and panning" produces morphing/mush because the model can't satisfy multiple geometric constraints at once. Pick one primary axis + at most one subtle secondary drift.
- **Anchor start and end explicitly** ("camera begins at high aerial three-quarter view, descends to pool-deck eye level"). Clear start/end states reduce ambiguous motion artifacts — and you're already giving it both frames.
- **Specify speed** ("slow," "smooth," "gentle") — AI video degrades/warps at fast camera speeds; slow is the cinematic default and the safest for clean interpolation.
- **Reference the architectural lines the move crosses** (roofline, pool edge, doorway, horizon) to keep geometry stable.
- **Keep motion physically plausible** — describe a real camera rig move (drone descent, steadicam walk-in), not impossible teleports.

**What makes a good vs bad first/last frame PAIR (guidance for Claude Code to analyse the 10 photos):**
- **Framing overlap:** consecutive photos should share visual content/overlapping subject matter so the model has anchors to interpolate (e.g. photo 1 aerial shows the pool that becomes the subject of photo 2). Big disjoint jumps cause morphing.
- **Lighting/time-of-day consistency:** both frames should share lighting direction and warmth; mismatched exposure forces the model to invent transitions.
- **Avoid impossible jumps:** don't pair an exterior aerial directly with a deep interior with no spatial relationship — insert an establishing/threshold frame if needed.
- **Consistent aspect ratio & resolution** across all 10 photos.
- **Per-transition prompt template Claude Code should generate:** `[Camera move] from [frame N description] to [frame N+1 description]. [Speed]. [Architectural anchor lines]. Photorealistic, natural light, no people, smooth cinematic motion, no morphing.`

Example: *"Slow aerial crane-down from a high three-quarter view of the villa rooftop and surrounding bush, descending smoothly toward the pool deck below, keeping the pool's edge centered, gentle steady motion, photorealistic golden-hour light, no people, no morphing."*

### 4. Hosting / Delivery

**Recommendation: Cloudflare Pages (site) + Cloudflare R2 (media, zero egress) behind Cloudflare's CDN.** Reasoning:
- **Bandwidth economics:** This is a heavy-media site; bandwidth is the dominant cost driver (in media apps, delivery commonly dwarfs storage — one analysis cited delivery at 18× storage cost). Cloudflare Pages has **unlimited bandwidth on all tiers** (free tier genuinely unlimited under fair use; Pro $5/mo). Vercel's free Hobby caps at **100GB**, and on Pro you get 1TB included then **$40 per additional 100GB** (≈$0.15/GB / $550 per TB), versus Cloudflare's $0 egress — exactly the wrong shape for a scroll site that ships hundreds of MB of frames per visit. Per Waymaker OS's 2026 Vercel pricing analysis, a team running three production apps at 50,000 MAU faces *"$500-2,000/month"* on Vercel Pro with realistic overages versus *"$150-300/month"* on a flat-rate edge platform.
- **R2 = zero egress fees** ($0.015/GB storage, $0 egress), S3-compatible, and Cloudflare's 330+ PoP CDN is included free — ideal for serving the frame sequence/master video without per-GB delivery charges.
- **Global edge:** Cloudflare's 300+ PoPs beat Vercel's ~30 regions, which matters for a South-African-asset site serving an international luxury audience (Asia-Pacific, Middle East buyers).
- This also matches the user's stated Cloudflare Pages + Workers preference — and here it's also the genuinely correct technical call, not a compromise.

**Alternatives:** Bunny CDN / Bunny Stream is excellent and cheap for the video specifically (CDN from ~$0.005/GB in EU/NA; Bunny Stream handles transcoding + adaptive bitrate + player), and a pragmatic hybrid is Bunny for media + Cloudflare for the site. Vercel only wins if you needed deep Next.js SSR features — you don't for a largely static showcase. Avoid bundling the heavy media into the deploy/repo; serve from object storage + CDN.

**Delivery best practices:**
- Serve frames/video from R2/CDN, not the app bundle. Cache aggressively (immutable, long max-age, content-hashed filenames).
- Preload in priority order: the 10 keyframe-stop frames first (fast degraded journey), then in-betweens.
- Use WebP/AVIF for frames; provide resolution tiers (mobile vs desktop).
- Preload the LCP hero (first frame) eagerly with `fetchpriority="high"` — never `loading="lazy"` it.
- Use HTTP/2+ so parallel frame requests aren't bottlenecked (HTTP/1 caps parallel connections).
- For the single-video fallback, fetch→blob the whole file before enabling scrub.

### 5. Reference Examples / Inspiration

- **Apple AirPods Pro / MacBook Pro product pages** — canonical scroll-driven image sequence on canvas. AirPods Pro hero is a 148-frame JPG sequence (confirmed in the canonical j-v-w CodePen: `const frameCount = 148;` drawing Apple's `01-hero-lightpass` sequence to a `#hero-lightpass` canvas); the specs section uses an 86-frame sequence. They preload all frames, draw to a fixed canvas, map `scrollFraction` → frame index, and fall back to a static image on mobile/slow connections. This is the exact pattern to emulate.
- **Samsung, Sony** product pages — similar image-sequence technique, used more sparingly.
- **Awwwards luxury real-estate / villa sites:** "Villa – 3D Immersive Property" (Awwwards nominee, 360° walkthrough), Belyi Ostrov House (horizontal-scroll parallax, CSS Design Awards Special Kudos + Awwwards Honorable Mention), K11 ARTUS ("clock"-style homepage with full-screen video), Avantgarde Properties (sticky nav morphing into search). Many top real-estate sites use GSAP + Three.js/WebGL.
- **GSAP's own `imageSequenceScrub` helper** and the chrisjdesigner / j-v-w CodePens are working canvas-sequence references.

### 6. Performance, Accessibility, Fallbacks

**Performance budget:**
- LCP target < 2.5s at the 75th percentile. The first visible frame is the LCP element — preload it eagerly with `fetchpriority="high"`, never lazy-load it (lazy-loading the LCP image is the single most common LCP mistake; CrUX data shows ~16% of mobile sites do it).
- Hero image budget: keep the first frame under ~500KB (above ~800KB it measurably hurts LCP; Lighthouse flags >1.5MB; >3MB is a real Core Web Vitals problem).
- Decode is the most expensive scroll-time operation: use `createImageBitmap()` + Web Worker + OffscreenCanvas where supported to keep the main thread free.
- Watch CLS (define canvas dimensions to avoid layout shift) and INP (keep scroll handlers lightweight; let native scroll drive — don't scroll-jack beyond the smoothing layer).
- Total frame-sequence payload: budget aggressively; tier by device; lazy-preload in-betweens after keyframes.

**Accessibility — `prefers-reduced-motion`:**
- Detect `window.matchMedia("(prefers-reduced-motion: reduce)").matches` in JS and skip ScrollTrigger/Lenis setup entirely for those users; render a static gallery of the 10 stop photos instead.
- In CSS, wrap motion in `@media (prefers-reduced-motion: no-preference)` (progressive/opt-in approach protects sensitive users who haven't set a preference). Gate `scroll-behavior:smooth` the same way.
- For Lenis, either don't instantiate it, or pass effectively-instant settings (e.g. `lerp:1`) for reduced-motion users.
- Ensure content remains fully readable when motion is disabled (the feature/spec text must not depend on scroll animation to appear) — this satisfies WCAG 2.3.3 (Animation from Interactions).

**Graceful degradation / fallbacks:**
- If JS fails or frames can't load: show a static high-quality hero of the villa + the 10 stop photos as a normal responsive gallery.
- Provide the single-image fallback Apple uses on low-end/mobile.
- Offer both MP4 + WebM if any `<video>` is used.

**SEO for a JS-heavy visual page:**
- Server-render real HTML text for the feature/amenities/specs content (don't lock copy inside canvas) — search engines execute JS but index in stages; canvas content is invisible to crawlers.
- Use semantic headings, `alt` text on the 10 stop photos, structured data (e.g. real-estate / `Residence` / `Product` schema), Open Graph tags for sharing, and a meaningful `<title>`/meta description.
- Keep the LCP and Core Web Vitals green — they're ranking signals.

## Recommendations

**Recommended end-to-end architecture:**
1. **Content prep (Claude Code):** Analyse the 10 photos in the project folder; verify consistent aspect ratio/resolution, framing overlap and lighting continuity between consecutive pairs; flag any disjoint pairs that need an intermediate frame. Auto-generate 9 per-transition Seedance prompts using the camera-move template (one primary axis, slow speed, named architectural anchors, "no people, no morphing").
2. **AI generation (Seedance 2.0 image-to-video):** For each pair (1→2 … 9→10), call `bytedance/seedance-2.0/image-to-video` with `image_url`=photo N, `end_image_url`=photo N+1, the generated prompt, `generate_audio:false`, highest available resolution (1080p standard tier, or 2K via BytePlus Pro). Iterate on fast tier first to validate motion, then final-render on standard.
3. **Stitch:** Concatenate the 9 clips into one master with ffmpeg (re-encode to uniform fps/resolution).
4. **Optimise:** Extract the master to a numbered WebP frame sequence (quality ~82) at desktop tier (1920px) and mobile tier (960px). Optionally also produce a `-g 1` scrub-MP4 as a secondary path.
5. **Build (canvas + GSAP):** Pinned ScrollTrigger section, `scrub:1`, Lenis smooth scroll, frame proxy → `drawImage`, priority preloading + loader, reduced-motion + static fallbacks. Below it, feature-overview sections with ScrollSmoother `data-speed` parallax and mouse-tracking depth.
6. **Deploy:** Site on Cloudflare Pages; frame sequence + master video on Cloudflare R2 behind Cloudflare CDN; content-hashed immutable caching; eager `fetchpriority="high"` first frame.

**Staged plan & thresholds:**
- **Stage 1 (prototype):** Build the canvas scrub with placeholder frames; validate smooth bidirectional scrub on iPhone Safari + Android Chrome + Firefox desktop before investing in AI generation. *Threshold to proceed:* 60fps scrub on a mid-range phone.
- **Stage 2 (AI pilot):** Generate ONE transition (photo 1→2) on Seedance fast tier; inspect for morphing/artifacts. *Threshold:* clean, plausible camera move with no warping → proceed to all 9; if morphing, fix the frame pair (overlap/lighting) or add an intermediate frame before continuing.
- **Stage 3 (full build + optimise):** Generate all 9, stitch, extract frames, wire up GSAP/Lenis, add parallax + mouse-tracking feature sections.
- **Stage 4 (perf/a11y hardening):** Lighthouse pass — LCP <2.5s, CLS <0.1, good INP; verify reduced-motion + no-JS fallbacks; test payload on throttled 4G.
- **Decision triggers:** If frame-sequence payload can't get under budget on mobile even at 960px → reduce frame count (fewer in-betweens per transition) or drop mobile to a short auto-playing teaser + static gallery. If Seedance 2.5 reaches public API before launch and you need 4K/longer single passes → re-evaluate, but don't block on it.

## Caveats
- **Seedance specifics carry version flux.** Seedance 2.0 image-to-video first/last-frame mode, 4–15s, fal pricing (~$0.30/s 720p, 10s fast ≈$2.42 / standard ≈$3.03) and the architecture-friendly content filter are verified from fal.ai docs and provider pages. But resolution ceilings differ by provider (fal docs enum shows 480p/720p for image-to-video while fal's model page references 1080p; BytePlus Pro reaches 2K; a June 23 2026 upgrade added 4K to 2.0 inconsistently across endpoints) — **verify the exact resolution/price by a live API call before production.** Seedance 2.5's specs (30s, 4K) are ByteDance's own announced claims, not yet independently benchmarked or API-available.
- **No published max input-image pixel dimension** for Seedance on fal — only the 30MB file cap is documented.
- **Marketing vs reality:** Several Seedance capability descriptions come from provider marketing pages; treat performance superlatives ("cinema-quality," "perfect consistency") as vendor claims.
- **iOS Safari remains the riskiest target** for any video-based approach; the canvas image-sequence method specifically exists to sidestep its `currentTime`/`position:fixed` video quirks. Test on real iOS hardware.
- **GSAP licensing:** ScrollTrigger and ScrollSmoother have been free since end of April 2025 (post-Webflow acquisition); only premium plugins (SplitText, MorphSVG) historically needed Club GSAP and are also now free — none are required for this build regardless.
- The "9 clips stitched into one video" then "extracted back into frames" pipeline is intentional: AI generates per-pair, but the *website* should ultimately scrub a frame sequence (or a single GOP-1 video) for smoothness — don't try to scrub 9 separate video files.