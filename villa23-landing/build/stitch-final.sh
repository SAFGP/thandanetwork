#!/bin/bash
# Cameron's hand-picked edit: snippets cut from the two existing masters.
#   1>2  reorder (t1_2)          6>7  master4k [25.00-29.40]
#   2>3  master4k [5.00-10.00]   7>8  master4k [29.40-35.00]
#   3>4  master4k [10.00-15.20]  8>9  reorder (t9_6)
#   4>5  reorder (kept rotation) 9>10 reorder (t6_10)
#   5>6  master4k [20.20-25.00]
# Every seam cross-dissolves 0.35s. All but one join lands on a matching held
# frame; the 7>8 to 8>9 join dissolves panorama into jacuzzi (the one spot the
# two source films order those shots differently).
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/seedance/4k"
cd "$DIR"
M=master4k.mp4
XF=0.35
FPS=24

# 1. Cut the five master4k snippets (input-seek is accurate by default).
cut () { # name start dur
  ffmpeg -y -ss "$2" -i "$M" -t "$3" -an -r $FPS \
    -vf "scale=3840:2160:flags=lanczos,setsar=1,format=yuv420p" \
    -c:v libx265 -crf 16 -preset medium -x265-params log-level=error "seg_$1.mp4" 2>/dev/null
}
cut 2_3  5.00  5.00
cut 3_4 10.00  5.20
cut 5_6 20.20  4.80
cut 6_7 25.00  4.40
cut 7_8 29.40  5.60

# 2. Assemble the nine clips in Cameron's order.
CLIPS=(t1_2.mp4 seg_2_3.mp4 seg_3_4.mp4 transition-04-05-kept.mp4 seg_5_6.mp4 seg_6_7.mp4 seg_7_8.mp4 t9_6.mp4 t6_10.mp4)
for c in "${CLIPS[@]}"; do [ -f "$c" ] || { echo "MISSING $c"; exit 1; }; done

# 3. Normalise every clip to identical timebase/fps/format so xfade aligns.
rm -f nf_*.mp4
i=0
for c in "${CLIPS[@]}"; do
  ffmpeg -y -i "$c" -an -r $FPS -vf "scale=3840:2160:flags=lanczos,setsar=1,format=yuv420p" \
    -c:v libx265 -crf 16 -preset medium -x265-params log-level=error "nf_$(printf %02d $i).mp4" 2>/dev/null
  i=$((i+1))
done

# 4. Build the xfade chain with cumulative offsets from real durations.
inputs=(); for f in nf_*.mp4; do inputs+=(-i "$f"); done
N=${#CLIPS[@]}
dur () { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
fc=""; prev="[0:v]"
acc=$(dur nf_00.mp4)
for ((k=1;k<N;k++)); do
  off=$(python3 -c "print(round($acc - $XF, 3))")
  fc="${fc}${prev}[${k}:v]xfade=transition=fade:duration=${XF}:offset=${off}[x${k}];"
  prev="[x${k}]"
  d=$(dur "nf_$(printf %02d $k).mp4")
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
rm -f nf_*.mp4 seg_*.mp4
