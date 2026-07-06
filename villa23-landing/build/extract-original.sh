#!/bin/bash
# Restore the ORIGINAL first-round journey: extract master4k.mp4 (sequential
# 1..10) into the numbered WebP sequence the site scrubs (desktop 2560px,
# mobile 1280px). ffmpeg here has no libwebp, so frames go out as JPEG then
# convert with cwebp. Targets ~273 frames to match the engine's stop math.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/seedance/4k/master4k.mp4"
SEQ="$ROOT/assets/seq"
SEQM="$ROOT/assets/seq-mobile"
TMP="$ROOT/build/_frames_tmp"
[ -f "$SRC" ] || { echo "MISSING $SRC"; exit 1; }

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
FPS=$(python3 -c "print(round(273/$DUR, 4))")
echo "duration=${DUR}s  extract fps=${FPS}"

rm -rf "$TMP"; mkdir -p "$TMP/d" "$TMP/m"
ffmpeg -y -loglevel error -i "$SRC" -vf "fps=${FPS},scale=2560:-1" -q:v 2 "$TMP/d/f_%04d.jpg"
ffmpeg -y -loglevel error -i "$SRC" -vf "fps=${FPS},scale=1280:-1" -q:v 3 "$TMP/m/f_%04d.jpg"

rm -f "$SEQ"/*.webp "$SEQM"/*.webp 2>/dev/null || true
i=1
for f in "$TMP"/d/f_*.jpg; do n=$(printf "%04d" $i); cwebp -quiet -q 80 "$f" -o "$SEQ/frame_${n}.webp"; i=$((i+1)); done
i=1
for f in "$TMP"/m/f_*.jpg; do n=$(printf "%04d" $i); cwebp -quiet -q 78 "$f" -o "$SEQM/frame_${n}.webp"; i=$((i+1)); done

COUNT=$(ls "$SEQ"/*.webp | wc -l | tr -d ' ')
rm -rf "$TMP"
echo "desktop $(du -sh "$SEQ" | cut -f1)  mobile $(du -sh "$SEQM" | cut -f1)"
echo "FRAME_COUNT=$COUNT"
