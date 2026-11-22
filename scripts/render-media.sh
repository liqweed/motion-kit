#!/usr/bin/env bash
# Regenerate the committed media: README animations (light + dark baked SVG)
# and the project icon set (assets/icon*, .idea/icon*) from brand/logo.scene.mjs. Deterministic: rerunning with
# no scene changes leaves the files byte-identical.
#
# Usage: scripts/render-media.sh           write the files
#        scripts/render-media.sh --check   fail if any committed file is stale
set -euo pipefail
cd "$(dirname "$0")/.."
check=false
[[ "${1:-}" == "--check" ]] && check=true

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mk() { node cli/motion-kit.mjs "$@" >/dev/null; }
mkdir -p "$tmp/docs/media"

for s in order-flow smart-home bars; do
	scene="examples/$s.json"
	[[ $s == bars ]] && scene="examples/bars.scene.mjs"
	for th in light dark; do
		mk bake "$scene" -f 16:9 --theme "$th" --background -o "$tmp/docs/media/$s-$th.svg"
	done
done
mk icon brand/logo.scene.mjs -o "$tmp"
files=(docs/media/order-flow-light.svg docs/media/order-flow-dark.svg
	docs/media/smart-home-light.svg docs/media/smart-home-dark.svg
	docs/media/bars-light.svg docs/media/bars-dark.svg
	assets/icon.svg assets/icon.png assets/icon-animated.svg .idea/icon.svg .idea/icon_dark.svg)

if $check; then
	stale=0
	for f in "${files[@]}"; do
		cmp -s "$tmp/$f" "$f" || { echo "stale: $f" >&2; stale=1; }
	done
	[[ $stale == 0 ]] || { echo "run: npm run media, and commit the result" >&2; exit 1; }
	echo "media up to date"
else
	for f in "${files[@]}"; do mkdir -p "$(dirname "$f")"; cp "$tmp/$f" "$f"; done
	echo "media written"
fi
