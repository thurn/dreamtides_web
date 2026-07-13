#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$REPO_ROOT/cumulus/SceneComparison/manifest.json"
SCENE_ID="${1:-cumulus-shop-glass-demo}"
WIDTH="${2:-}"
HEIGHT="${3:-}"

DIMENSIONS="$(python3 - "$MANIFEST" "$SCENE_ID" "$WIDTH" "$HEIGHT" <<'PY'
import json, sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
scene = next((item for item in manifest["scenes"] if item["id"] == sys.argv[2]), None)
if scene is None:
    raise SystemExit(f"unknown comparison scene: {sys.argv[2]}")
width = int(sys.argv[3]) if sys.argv[3] else manifest["defaultCapture"]["width"]
height = int(sys.argv[4]) if sys.argv[4] else manifest["defaultCapture"]["height"]
if width <= 0 or height <= 0:
    raise SystemExit("capture width and height must be positive")
print(width)
print(height)
PY
)"
WIDTH="$(sed -n '1p' <<<"$DIMENSIONS")"
HEIGHT="$(sed -n '2p' <<<"$DIMENSIONS")"

bash "$SCRIPT_DIR/compare-scene.sh" "$SCENE_ID" "$WIDTH" "$HEIGHT"

ARTIFACT_ROOT="$REPO_ROOT/cumulus/Artifacts/SceneComparison/$SCENE_ID/${WIDTH}x${HEIGHT}"
TEMP_ROOT="${TMPDIR:-/tmp}"
OUTPUT_DIR="$(mktemp -d "${TEMP_ROOT%/}/cumulus-scene-comparison.XXXXXX")"
cp "$ARTIFACT_ROOT/unity.png" "$ARTIFACT_ROOT/web.png" "$OUTPUT_DIR/"

printf 'Unity and web captures written to:\n%s\n' "$OUTPUT_DIR"
open "$OUTPUT_DIR/unity.png" "$OUTPUT_DIR/web.png"
