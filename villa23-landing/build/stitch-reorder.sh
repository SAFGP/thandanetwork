#!/bin/bash
# Stitch the new journey order 1>2>3>4>5>7>8>9>6>10 with short cross-dissolves
# at every seam. Clip endpoints already match (each lands on the next stop's
# frame); the 0.35s xfade insures the seam against any residual pop.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/seedance/4k"
cd "$DIR"

# Order of clips in the new journey
CLIPS=(t1_2.mp4 t2_3.mp4 t3_4.mp4 transition-04-05-kept.mp4 t5_7.mp4 t7_8.mp4 t8_9.mp4 t9_6.mp4 t6_10.mp4)
XF=0.35   # cross-dissolve seconds

for c in "${CLIPS[@]}"; do [ -f "$c" ] || { echo "MISSING $c"; exit 1; }; done

# Normalise every clip to identical timebase/fps/format so xfade aligns.
FPS=24
rm -f norm_*.mp4
i=0
for c in "${CLIPS[@]}"; do
  ffmpeg -y -i "$c" -an -r $FPS -vf "scale=3840:2160:flags=lanczos,setsar=1,format=yuv420p" \
    -c:v libx265 -crf 16 -preset medium -x265-params log-level=error "norm_$(printf %02d $i).mp4" 2>/dev/null
  i=$((i+1))
done

# Build the xfade chain with cumulative offsets from real durations.
inputs=(); for f in norm_*.mp4; do inputs+=(-i "$f"); done
N=${#CLIPS[@]}
dur () { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

fc=""; prev="[0:v]"; offset=0
# offset for first xfade = dur(clip0) - XF
acc=$(dur norm_00.mp4)
for ((k=1;k<N;k++)); do
  off=$(python3 -c "print(round($acc - $XF, 3))")
  cur="[${k}:v]"
  out="[x${k}]"
  fc="${fc}${prev}${cur}xfade=transition=fade:duration=${XF}:offset=${off}${out};"
  prev="${out}"
  d=$(dur "norm_$(printf %02d $k).mp4")
  acc=$(python3 -c "print(round($acc + $d - $XF, 3))")
done
fc="${fc%;}"
final="${prev}"

echo "filter offsets built; final label $final ; total ~${acc}s"
ffmpeg -y "${inputs[@]}" -filter_complex "$fc" -map "$final" \
  -c:v libx265 -crf 16 -preset slow -pix_fmt yuv420p -x265-params log-level=error \
  master4k-reorder.mp4 2>/dev/null
echo "=== result ==="
ffprobe -v error -show_entries format=duration -of csv=p=0 master4k-reorder.mp4
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 master4k-reorder.mp4
rm -f norm_*.mp4
