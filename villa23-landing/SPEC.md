# Thanda Royal Residence — scroll-scrub landing page

Build spec and status. Source research: `../compass_artifact_*.md` (the technical foundation).

## Concept
A flagship, AI-assisted scroll-scrubbed landing page for Thanda Royal Residence (Villa 23), presented by South Africa | Forbes Global Properties. A pinned cinematic journey scrubs through ten 4K stills of the estate, with editorial feature sections below. The journey upgrades from ten stills (crossfade) to a dense, AI-interpolated frame sequence generated with Seedance 2.0.

## The journey (10 stops, `THANDA VILLA 23/Landing Page/1..10.jpg`)
1 high aerial establishing, 2 lower aerial onto pool and pavilions, 3 ground approach up the deck stairs, 4 under the covered dining deck, 5 pool-deck eye level, 6 pool corner, 7 infinity edge straight on, 8 pool with pavilion left, 9 pool and round spa, 10 boma walkway out to the bushveld. Continuity is strong; mild jumps at 3 to 4 and 9 to 10 handled with single-axis camera moves.

## Stack
- Canvas image-sequence scrub (the Apple AirPods technique), crossfade between stops.
- GSAP + ScrollTrigger (pinned, `scrub:1`) + Lenis smooth scroll. GSAP is free.
- Vanilla HTML/CSS/JS, no build step. FreightNeo display face (FGP brand), system sans for UI.
- Cinematic dark editorial look (see `../DESIGN.md`), photography dominant, zero shadows.

## Files
- `index.html` — semantic structure, SEO/OG, real text (not locked in canvas), no-JS gallery fallback.
- `styles.css` — design system and layout.
- `scroll-engine.js` — preloading, canvas crossfade engine, pin + scrub, reduced-motion and no-lib fallbacks. Pin is created synchronously before section triggers; one authoritative `ScrollTrigger.refresh()` after load keeps spacers and triggers in sync.
- `main.js` — nav state, section parallax + reveals, pointer-only mouse depth, enquiry form stub.
- `assets/frames/` desktop tier (1920px), `assets/mobile/` (960px), `assets/seedance/` AI clips, `assets/brand/` logos + fonts.

## Status
- [x] Stage 1 prototype: scrub engine, journey, sections, fallbacks. Verified in Chrome (pin 0 to 5832, sections after, crossfade and captions working).
- [x] Stage 2 AI pilot: transition 1 to 2 via Higgsfield Seedance 2.0. Clean motion, no morphing.
- [x] Stage 3: all 9 transitions generated, stitched, extracted to a dense WebP sequence; engine rewired with progressive preload (10 stop frames first, then stream the rest, drawing the nearest loaded frame). Browser-verified throughout.
- [x] Stage 3.1 (client revision, 4K + feedback): whole journey re-done in 4K. Stop 1 re-cropped WIDER (bottom-anchored) so the boma shows. 1→2 reworked (descend + rotate, lands on stop 2's angle, no jump cut). 8→9 reworked (sky and clouds blend continuously, no hard cut). The 7 approved transitions preserved exactly and upscaled to 4K (6 contiguous as one segment + 9→10) rather than re-rolled. Stitched to `assets/seedance/4k/master4k.mp4` (3840x2160, 45.4s), extracted to a 273-frame sequence at 2560px desktop (`assets/seq`, 80MB) and 1280px mobile (`assets/seq-mobile`, 30MB). Engine FRAMES=273. QC'd: wider boma opening, rotation, sky blend all confirmed.
- [x] Stage 3.2 (content): real listing built from `../TRTC - Villa 23_2026.pdf`. Property is **Villa Mhlosinga** ("the fever tree", ERF 23A), a turnkey 4-bed (661 m²) Royal Residence at The Royal Thanda Club, within 16,500 ha Thanda Safari. Sections after the journey: realm intro + fact strip, Residence feature, three interior galleries (the 27 enhanced interiors, scattered), four rendered diagram pages woven between (floor plan p13, Thanda area map p10, site plan p11 with ERF23A, world access p8), Forty-four members / Great Rift copy, access with flight times, Leading Hotels of the World quote, specification (definition list), enquiry, footer. All copy verbatim/adapted from the PDF (dash-free). Diagrams rendered with pdftoppm to `assets/diagrams/`. Browser-verified. Naming flagged to client (Villa Mhlosinga vs their "Thanda Royal Residence").
- [ ] Stage 4: performance and a11y hardening, deploy. Specifics below.

### Stage 4 open items
- Frame payload: 54MB desktop is heavy. Re-extract at lower WebP quality or ~180 frames, and serve from R2 with on-demand in-between loading. (ffmpeg here lacks libwebp, so frames were extracted as JPEG then converted with `cwebp`; `build/make-sequence.sh` still targets WebP for machines that have it.)
- LCP: confirm the first frame is under ~500KB; preload it with `fetchpriority="high"`.
- Aspect: journey is now 16:9 throughout (keyframes cropped, clips 16:9). The feature-section stills remain 3:2 with object-fit cover, which is fine.
- Deploy: Cloudflare Pages (site) + R2 (`assets/seq`, `assets/seq-mobile`, `assets/seedance`), content-hashed immutable caching.
- Copy/facts and enquiry endpoint as before.

## Seedance generation (Higgsfield, not fal.ai)
Pipeline per transition: stage the pair at ~1920px, `media_upload` to presigned, curl PUT, `media_confirm`, `generate_video` model `seedance_2_0` with `start_image`=N, `end_image`=N+1, `resolution:1080p`, `mode:std`, `duration:5`, `generate_audio:false`, then poll `job_status` and download. About 5 credits-equivalent per clip; balance is ample.

Prompt template: `[Camera move] from [frame N] to [frame N+1]. [Slow speed]. [Architectural anchor lines]. Photorealistic, natural light, no people, smooth cinematic motion, no morphing.`

Per-transition camera moves (one primary axis each):
1→2 aerial crane-down descent (DONE). 2→3 continued descent and forward push to the foot of the deck. 3→4 steadicam walk-in up the deck under the covered dining roof. 4→5 forward dolly out to the infinity pool edge. 5→6 side-track along the pool to the deck corner. 6→7 forward push to the infinity edge meeting the horizon. 7→8 lateral reveal of the pavilion and loungers. 8→9 forward-around move to the round spa. 9→10 crane-back and turn to the boma walkway and the panorama.

## Open decisions and follow-ups
- **Aspect ratio:** Seedance returned 16:9; the stills are 3:2. Standardise the journey to 16:9 (crop the ten stop frames to 16:9 for the dense sequence) so there is no jump at keyframe boundaries. The canvas already cover-fits.
- **Frame extraction:** stitch the 9 clips with ffmpeg, extract a numbered WebP sequence (quality ~82) at 1920px desktop and 960px mobile. Preload the ten keyframe stops first, then in-betweens.
- **Performance:** compress the hero/first frame under ~500KB for LCP (currently ~990KB). Content-hash and cache-immutable the frames.
- **Hosting:** Cloudflare Pages for the site, Cloudflare R2 for the frame sequence and clips (zero egress). Do not commit the heavy media to git.
- **Copy and facts:** exact bedroom count, price and broker contact to come from `../Thanda_Royal_Residence_Sales_Action_Plan.pdf`. Wire the enquiry form to a real endpoint.
- **Production libraries:** vendor GSAP/ScrollTrigger/Lenis locally instead of CDN before launch.
