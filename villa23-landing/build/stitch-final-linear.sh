#!/bin/bash
# Cameron's mathematical edit: treat each master as 10 evenly spaced stops along
# its own timeline (9 equal segments). Take each numbered select from its source
# and lay them in linear order 1>2..9>10. 0.35s cross-dissolve at every join.
#   1>2 reorder   2>3 m4k   3>4 m4k   4>5 reorder   5>6 m4k
#   6>7 m4k       7>8 m4k   8>9 reorder   9>10 reorder
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/seedance/4k"
cd "$DIR"
M4K=master4k.mp4
RE=master4k-reorder.mp4
XF=0.35
FPS=24
ENC=(-c:v libx265 -crf 16 -preset medium -x265-params log-level=error)
VF="scale=3840:2160:flags=lanczos,setsar=1,format=yuv420p"

DM=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$M4K")
DR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$RE")
echo "master4k=${DM}s  reorder=${DR}s"

# seam k (1..9) -> source master
SRC=(x re m4k m4k re m4k m4k m4k re re)   # index 1..9 ; [0] unused
KEPT=transition-04-05-kept.mp4            # the reorder 4>5 rotation, standalone
KEPT_TRIM=1.6                             # skip its redundant run-up over the table

rm -f lin_*.mp4
for k in 1 2 3 4 5 6 7 8 9; do
  if [ "$k" = "4" ]; then
    # 4>5: use the reorder rotation clip, trimmed past the second table run-up so
    # it continues straight from where master4k's 3>4 ends (forward over the table).
    kd=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$KEPT")
    seg=$(python3 -c "print(round($kd-$KEPT_TRIM,3))")
    ffmpeg -y -ss "$KEPT_TRIM" -i "$KEPT" -t "$seg" -an -r $FPS -vf "$VF" "${ENC[@]}" "lin_04.mp4" 2>/dev/null
    echo "seam 4 <- kept(trim ${KEPT_TRIM}s) [+${seg}s]"
    continue
  fi
  s=${SRC[$k]}
  if [ "$s" = "m4k" ]; then f="$M4K"; d="$DM"; else f="$RE"; d="$DR"; fi
  start=$(python3 -c "print(round(($k-1)/9*$d,3))")
  seg=$(python3 -c "print(round($d/9,3))")
  ffmpeg -y -ss "$start" -i "$f" -t "$seg" -an -r $FPS -vf "$VF" "${ENC[@]}" "lin_$(printf %02d $k).mp4" 2>/dev/null
  echo "seam $k <- $s  [${start}s +${seg}s]"
done

# xfade chain
inputs=(); for f in lin_*.mp4; do inputs+=(-i "$f"); done
dur () { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
fc=""; prev="[0:v]"
acc=$(dur lin_01.mp4)
for ((k=1;k<9;k++)); do
  off=$(python3 -c "print(round($acc - $XF, 3))")
  fc="${fc}${prev}[${k}:v]xfade=transition=fade:duration=${XF}:offset=${off}[x${k}];"
  prev="[x${k}]"
  d=$(dur "lin_$(printf %02d $((k+1)) ).mp4")
  acc=$(python3 -c "print(round($acc + $d - $XF, 3))")
done
fc="${fc%;}"

echo "final label $prev ; total ~${acc}s"
ffmpeg -y "${inputs[@]}" -filter_complex "$fc" -map "$prev" \
  -c:v libx265 -crf 16 -preset slow -pix_fmt yuv420p -x265-params log-level=error \
  master4k-final.mp4 2>/dev/null
echo "=== result ==="
ffprobe -v error -show_entries format=duration -of csv=p=0 master4k-final.mp4
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 master4k-final.mp4
rm -f lin_*.mp4
