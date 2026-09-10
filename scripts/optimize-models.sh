#!/usr/bin/env bash
# Regenerate the decimated environment GLBs used by the ring experience.
#
# The six environment scenes account for ~99.7% of the triangles drawn each
# frame (12.6M of 12.65M); the vehicles are ~43k combined and are deliberately
# left alone. Decimating the environments to ~25% takes the per-frame load to
# ~3.0M, which is what makes the site usable on low-power integrated GPUs.
#
# Why gltfpack and not a Blender round-trip or `gltf-transform meshopt`:
#   - main.js selects raycast surfaces by exact material name (e.g. 'desert',
#     'Material.005') and mesh name ('Curve'). Blender's glTF round-trip splits
#     meshes by material and appends .001 suffixes, which silently breaks
#     terrain snapping. gltfpack -kn -km preserves names exactly.
#   - `gltf-transform meshopt` emits quantization filters that three.js 0.160
#     cannot decode: the model loads without error but renders with a
#     degenerate bounding box (verified: [11.35,0,0] vs [22.71,13.18,19.85]).
#
# Flags: -si 0.25 simplify to 25% of triangles; -cc meshopt compression;
#        -kn keep node names; -km keep material names; -kv keep named vertex data.
#
# Requires: gltfpack (npm i -g gltfpack)

set -euo pipefail
cd "$(dirname "$0")/.."

command -v gltfpack >/dev/null || { echo "error: gltfpack not found (npm i -g gltfpack)" >&2; exit 1; }

MODELS=(
  "school_v2_meshopt:school_v2_opt"
  "beach_v2_meshopt:beach_v2_opt"
  "city_at_night_v4_meshopt:city_at_night_v4_opt"
  "landscape_v5_meshopt:landscape_v5_opt"
  "desert_v3_meshopt:desert_v3_opt"
  "cafe_meshopt:cafe_opt"
)

for entry in "${MODELS[@]}"; do
  src="assets/models/${entry%%:*}.glb"
  dst="assets/models/${entry##*:}.glb"
  gltfpack -i "$src" -o "$dst" -si 0.25 -cc -kn -km -kv
  printf '%-34s %7.2f MB -> %6.2f MB\n' "${entry##*:}" \
    "$(echo "scale=4;$(stat -f%z "$src")/1048576" | bc)" \
    "$(echo "scale=4;$(stat -f%z "$dst")/1048576" | bc)"
done
