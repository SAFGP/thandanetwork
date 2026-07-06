#!/bin/bash
# Assemble a clean publish folder for Cloudflare Pages direct upload.
# Ships only the real site: the four root files + the lean asset tiers.
# Excludes source media (seedance mp4s, keyframes-4k, old frames) and docs.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"

rm -rf "$DIST"
mkdir -p "$DIST/assets"

# Root site files (film and stills page, scroll engine retired)
for f in index.html styles.css main.js; do
  cp "$ROOT/$f" "$DIST/$f"
done

# Optional root extras if present (favicon, og image, robots)
for f in favicon.ico favicon.png apple-touch-icon.png og.jpg og.png robots.txt sitemap.xml _headers _redirects .assetsignore; do
  [ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$DIST/$f" || true
done

# Asset tiers that ship
for d in img exteriors exteriors-mobile interiors interiors-mobile diagrams brand share vendor video; do
  [ -d "$ROOT/assets/$d" ] && cp -R "$ROOT/assets/$d" "$DIST/assets/$d" || true
done

# Cloudflare Pages Functions (enquiry endpoint etc.) if present
[ -d "$ROOT/functions" ] && cp -R "$ROOT/functions" "$DIST/functions" || true

echo "=== dist assembled ==="
echo "files: $(find "$DIST" -type f | wc -l | tr -d ' ')"
echo "size:  $(du -sh "$DIST" | cut -f1)"
echo "top level:"; ls -1 "$DIST"
echo "assets:"; ls -1 "$DIST/assets"
