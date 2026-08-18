#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$REPO_ROOT/cumulus/Parity/manifest.json"
OUTPUT="${1:-$REPO_ROOT/cumulus/Artifacts/GlassParity/web}"
PORT="${CUMULUS_PARITY_PORT:-5187}"
SERVER_LOG="$OUTPUT/vite.log"
CAPTURE_DIMENSIONS="$(python3 - "$MANIFEST" <<'PY'
import json, sys
capture = json.load(open(sys.argv[1], encoding="utf-8"))["capture"]
print(capture["width"], capture["height"])
PY
)"
CAPTURE_WIDTH="${CAPTURE_DIMENSIONS%% *}"
CAPTURE_HEIGHT="${CAPTURE_DIMENSIONS##* }"

mkdir -p "$OUTPUT"
rm -f "$OUTPUT"/*.png

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

"$REPO_ROOT/node_modules/.bin/vite" --port "$PORT" --strictPort >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:$PORT/cumulus/Parity/Web/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -fsS "http://127.0.0.1:$PORT/cumulus/Parity/Web/" >/dev/null

CAPTURE_JOBS="$OUTPUT/capture-jobs.json"
python3 - "$MANIFEST" "$CAPTURE_JOBS" "$OUTPUT" "$PORT" "$CAPTURE_WIDTH" "$CAPTURE_HEIGHT" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
jobs = []
for scenario in manifest["scenarios"]:
    for mode in ("bare", "glass"):
        jobs.append({
            "url": f"http://127.0.0.1:{sys.argv[4]}/cumulus/Parity/Web/?scenario={scenario['id']}&mode={mode}",
            "width": int(sys.argv[5]),
            "height": int(sys.argv[6]),
            "waitSelector": '[data-parity-ready="true"]',
            "selector": '[data-parity-frame]',
            "output": f"{sys.argv[3]}/{scenario['id']}-{mode}.png",
        })
json.dump(jobs, open(sys.argv[2], "w", encoding="utf-8"))
PY
node "$REPO_ROOT/scripts/playwright-mcp-capture.mjs" --jobs "$CAPTURE_JOBS"

python3 - "$MANIFEST" "$OUTPUT" <<'PY'
import json, struct, sys
from pathlib import Path
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
root = Path(sys.argv[2])
expected = {(scenario["id"], mode) for scenario in manifest["scenarios"] for mode in ("bare", "glass")}
for scenario, mode in expected:
    path = root / f"{scenario}-{mode}.png"
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise SystemExit(f"not a PNG: {path}")
    width, height = struct.unpack(">II", data[16:24])
    if (width, height) != (manifest["capture"]["width"], manifest["capture"]["height"]):
        raise SystemExit(f"wrong capture dimensions for {path}: {width}x{height}")
print(f"captured {len(expected)} web parity images in {root}")
PY
