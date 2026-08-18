#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$REPO_ROOT/cumulus/SceneComparison/manifest.json"
SCENE_ID="${1:-cumulus-shop-glass-demo}"
WIDTH="${2:-}"
HEIGHT="${3:-}"
PORT="${CUMULUS_SCENE_COMPARE_PORT:-5188}"

CONFIG="$(python3 - "$MANIFEST" "$SCENE_ID" "$WIDTH" "$HEIGHT" <<'PY'
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
print(scene["unityScene"])
print(scene["unityRebuildMethod"])
print(scene["webPath"])
PY
)"
WIDTH="$(sed -n '1p' <<<"$CONFIG")"
HEIGHT="$(sed -n '2p' <<<"$CONFIG")"
UNITY_SCENE="$(sed -n '3p' <<<"$CONFIG")"
REBUILD_METHOD="$(sed -n '4p' <<<"$CONFIG")"
WEB_PATH="$(sed -n '5p' <<<"$CONFIG")"
ARTIFACT_ROOT="$REPO_ROOT/cumulus/Artifacts/SceneComparison/$SCENE_ID/${WIDTH}x${HEIGHT}"
UNITY_CAPTURE="$ARTIFACT_ROOT/unity.png"
WEB_CAPTURE="$ARTIFACT_ROOT/web.png"
SERVER_LOG="$ARTIFACT_ROOT/vite.log"

mkdir -p "$ARTIFACT_ROOT"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

source "$SCRIPT_DIR/lib/unity-run.sh"
run_unity_stage "scene-compare-$SCENE_ID" graphics \
  -quit \
  -executeMethod CumulusMvp.Editor.CumulusSceneComparisonCapture.CaptureBatch \
  -comparisonScene "$UNITY_SCENE" \
  -comparisonRebuildMethod "$REBUILD_METHOD" \
  -comparisonWidth "$WIDTH" \
  -comparisonHeight "$HEIGHT" \
  -comparisonOutput "$UNITY_CAPTURE"

"$REPO_ROOT/node_modules/.bin/vite" --port "$PORT" --strictPort >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:$PORT$WEB_PATH" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
URL="http://127.0.0.1:$PORT$WEB_PATH"
curl -fsS "$URL" >/dev/null
CAPTURE_JOBS="$ARTIFACT_ROOT/capture-jobs.json"
python3 - "$CAPTURE_JOBS" "$URL" "$WIDTH" "$HEIGHT" "$WEB_CAPTURE" <<'PY'
import json, sys
json.dump([{
    "url": sys.argv[2],
    "width": int(sys.argv[3]),
    "height": int(sys.argv[4]),
    "waitSelector": '[data-scene-comparison-ready="true"]',
    "selector": '[data-scene-comparison-frame]',
    "output": sys.argv[5],
}], open(sys.argv[1], "w", encoding="utf-8"))
PY
CAPTURE_RESULT="$(node "$REPO_ROOT/scripts/playwright-mcp-capture.mjs" --jobs "$CAPTURE_JOBS" --json)"
python3 - "$CAPTURE_RESULT" "$URL" "$WIDTH" "$HEIGHT" <<'PY'
import json, sys
actual = json.loads(sys.argv[1])["results"][0]
expected = {"url": sys.argv[2], "width": int(sys.argv[3]), "height": int(sys.argv[4])}
observed = {key: actual[key] for key in expected}
if observed != expected:
    raise SystemExit(f"browser capture target mismatch: expected={expected}, actual={observed}")
PY

python3 "$SCRIPT_DIR/scene_compare.py" \
  --web "$WEB_CAPTURE" \
  --unity "$UNITY_CAPTURE" \
  --output "$ARTIFACT_ROOT/report"
printf 'scene captures and comparison written to %s\n' "$ARTIFACT_ROOT"
