#!/bin/bash
# Stitch the 9 Seedance transition clips into one master, then extract a
# numbered WebP frame sequence (desktop + mobile tiers) for the canvas scrub.
# Run from the villa23-landing/ folder after the clips are in assets/seedance/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/seedance"
SEQ="$ROOT/assets/seq"
SEQM="$ROOT/assets/seq-mobile"
FPS="${1:-6}"          # extraction fps; 6 over ~45s ≈ 270 frames
mkdir -p "$SEQ" "$SEQM"
rm -f "$SEQ"/*.webp "$SEQM"/*.webp 2>/dev/null || true

# Build the ordered concat list
LIST="$(mktemp)"
for p in 01-02 02-03 03-04 04-05 05-06 06-07 07-08 08-09 09-10; do
  f="$SRC/transition-$p.mp4"
  [ -f "$f" ] || { echo "MISSING: $f"; exit 1; }
  echo "file '$f'" >> "$LIST"
done

# Concatenate, normalising to a uniform 30fps 1920x1080, silent
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" \
  -vf "fps=30,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart -an "$SRC/master.mp4"

# Desktop frame tier (1920px) as WebP
ffmpeg -y -loglevel error -i "$SRC/master.mp4" -vf "fps=$FPS,scale=1920:-1" -c:v libwebp -quality 80 "$SEQ/frame_%04d.webp"
# Mobile frame tier (960px)
ffmpeg -y -loglevel error -i "$SRC/master.mp4" -vf "fps=$FPS,scale=960:-1" -c:v libwebp -quality 78 "$SEQM/frame_%04d.webp"

COUNT=$(ls "$SEQ"/*.webp | wc -l | tr -d ' ')
echo "master:  $(du -h "$SRC/master.mp4" | cut -f1)"
echo "frames:  $COUNT (desktop $(du -sh "$SEQ" | cut -f1), mobile $(du -sh "$SEQM" | cut -f1))"
echo "FRAME_COUNT=$COUNT"
