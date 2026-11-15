#!/usr/bin/env bash
# Render the example scenes in several formats/locales for visual review.
# Usage: scripts/render-samples.sh <out-dir>
set -euo pipefail
out="${1:?out dir}"
cd "$(dirname "$0")/.."
mkdir -p "$out"
for f in "order-flow 16:9 nl" "order-flow 1:1 nl" "order-flow 9:16 nl" "order-flow tall en" \
         "smart-home 16:9 en" "smart-home 1:1 nl" "smart-home 9:16 en" "smart-home tall nl"; do
	set -- $f
	n="$1-${2/:/x}-$3"
	node cli/motion-kit.mjs export "examples/$1.json" -f "$2" -l "$3" -o "$out/$n" --png --scale 1 >/dev/null || echo "FAIL $n"
done
ls "$out"
