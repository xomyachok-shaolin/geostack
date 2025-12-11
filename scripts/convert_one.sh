#!/bin/bash
f=$1
w="${f%.png}.webp"
if [ ! -f "$w" ]; then
    ffmpeg -i "$f" -quality 80 "$w" -y 2>/dev/null
fi
exit 0
