#!/bin/zsh
# Pulls the "burning" and "outrage" cut-outs from the assets branch (read-only: nothing is staged or merged
# into this branch's own tree), generates their depth maps, and drops both into the app bundle folder.
# usage: ios/tools/sync-cutouts.sh [branch]      default branch: assets-picsart-v2
# Prereqs (one-off): the compiled depth model + tool, see tools/fetch_depth_model.py / depthgen.swift:
#   DEPTH_MLMODELC=<path to DepthAnythingV2SmallF16.mlmodelc>   (default ios/build/DepthAnythingV2SmallF16.mlmodelc)
set -euo pipefail
here="${0:A:h}"
root="${here:h}"                 # ios/
repo="${root:h}"                 # repo root
branch="${1:-assets-picsart-v2}"
out="$root/PocketEurocrat/Cutouts"
model="${DEPTH_MLMODELC:-$root/build/DepthAnythingV2SmallF16.mlmodelc}"
tool="$root/build/depthgen"
tmp="$(mktemp -d)"

cd "$repo"
git fetch -q origin "$branch"
names=("${(@f)$(git ls-tree -r --name-only "origin/$branch" | grep -E 'assets/generated/cutout/[a-z0-9-]+-(burning|outrage)\.png$' || true)}")
if [[ -z "${names[1]:-}" ]]; then echo "no burning/outrage cut-outs on origin/$branch yet"; exit 0; fi
git archive "origin/$branch" "${names[@]}" | tar -x -C "$tmp"
new=()
for f in "$tmp"/assets/generated/cutout/*.png; do
  cp "$f" "$out/"
  new+=("$out/${f:t}")
done
echo "copied ${#new[@]} cut-outs"
if [[ -x "$tool" && -d "$model" ]]; then
  "$tool" "$model" "$out" "${new[@]}"
else
  echo "depth tool/model missing — build with: swiftc -O ios/tools/depthgen.swift -o ios/build/depthgen and compile the model into \$DEPTH_MLMODELC"
fi
rm -rf "$tmp"
