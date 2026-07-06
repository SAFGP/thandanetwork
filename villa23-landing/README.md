# Thanda Royal Residence — landing page

A scroll-scrubbed, AI-assisted landing page for Thanda Royal Residence, presented by South Africa | Forbes Global Properties.

## Run locally
Static site, no build step. From this folder:

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123. Use a local server, not `file://`, so the canvas can load the frames.

## What it does
A pinned cinematic journey scrubs through ten 4K stills of the estate (crossfading between stops), then opens into editorial feature sections. Built on GSAP ScrollTrigger (pinned, scrub) + Lenis smooth scroll, with a canvas image-sequence (the Apple AirPods technique). Reduced-motion and no-JS visitors get a static, readable fallback.

## Status
Stage 1 prototype and the Stage 2 AI pilot (transition 1 to 2) are complete. The next step replaces the ten stills with a dense Seedance frame sequence for true interpolated motion. See `SPEC.md`.

## Structure
- `index.html`, `styles.css`, `scroll-engine.js`, `main.js`
- `assets/frames/` (1920px), `assets/mobile/` (960px), `assets/seedance/` (AI clips), `assets/brand/`

## Deploy
Target: Cloudflare Pages for the site, Cloudflare R2 for the frame sequence and clips. Keep heavy media out of git.
