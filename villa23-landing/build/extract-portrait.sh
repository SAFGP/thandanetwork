#!/bin/bash
# Portrait frame set for phones: 9:16 center crop of the 4K master, 900x1600,
# 137 frames (half the desktop count, same journey math since the engine maps
# progress to frame index per sequence). Phones were getting the landscape
# 1280x720 frames cover-cropped to a 26% slice and upscaled 2.3x, which is why
# the journey looked soft and unreadable on mobile.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/seedance/4k/master4k-final.mp4"
SEQP="$ROOT/assets/seq-portrait"
TMP="$ROOT/build/_frames_p_tmp"
FRAMES=137
[ -f "$SRC" ] || { echo "MISSING $SRC"; exit 1; }

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
FPS=$(python3 -c "print(round($FRAMES/$DUR, 4))")
echo "duration=${DUR}s  extract fps=${FPS}"

rm -rf "$TMP"; mkdir -p "$TMP"
# crop=ih*9/16:ih centers automatically; local ffmpeg has no libwebp so JPEG then cwebp
ffmpeg -y -loglevel error -i "$SRC" -vf "fps=${FPS},crop=ih*9/16:ih,scale=900:1600" -q:v 2 "$TMP/f_%04d.jpg"

mkdir -p "$SEQP"
rm -f "$SEQP"/*.webp 2>/dev/null || true
i=1
for f in "$TMP"/f_*.jpg; do n=$(printf "%04d" $i); cwebp -quiet -q 78 "$f" -o "$SEQP/frame_${n}.webp"; i=$((i+1)); done

COUNT=$(ls "$SEQP"/*.webp | wc -l | tr -d ' ')
rm -rf "$TMP"
echo "portrait $(du -sh "$SEQP" | cut -f1)"
echo "FRAME_COUNT=$COUNT"
