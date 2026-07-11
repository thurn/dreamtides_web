#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$REPO_ROOT/cumulus/Parity/manifest.json"
OUTPUT="${1:-$REPO_ROOT/cumulus/Artifacts/GlassParity/web}"
PORT="${CUMULUS_PARITY_PORT:-5187}"
SESSION="cumulus-parity-web-$$"
SERVER_LOG="$OUTPUT/vite.log"
CAPTURE_DIMENSIONS="$(python3 - "$MANIFEST" <<'PY'
import json, sys
capture = json.load(open(sys.argv[1], encoding="utf-8"))["capture"]
print(capture["width"], capture["height"])
PY
)"
CAPTURE_WIDTH="${CAPTURE_DIMENSIONS%% *}"
CAPTURE_HEIGHT="${CAPTURE_DIMENSIONS##* }"

if [[ -x /opt/homebrew/bin/agent-browser ]]; then
  AGENT_BROWSER=(/opt/homebrew/bin/agent-browser)
else
  AGENT_BROWSER=(npx agent-browser)
fi

mkdir -p "$OUTPUT"
rm -f "$OUTPUT"/*.png

cleanup() {
  "${AGENT_BROWSER[@]}" --session "$SESSION" close >/dev/null 2>&1 || true
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

SCENARIOS="$(python3 - "$MANIFEST" <<'PY'
import json, sys
for scenario in json.load(open(sys.argv[1], encoding="utf-8"))["scenarios"]:
    print(scenario["id"])
PY
)"

for scenario in $SCENARIOS; do
  for mode in bare glass; do
    url="http://127.0.0.1:$PORT/cumulus/Parity/Web/?scenario=$scenario&mode=$mode"
    "${AGENT_BROWSER[@]}" --session "$SESSION" open "$url" >/dev/null
    "${AGENT_BROWSER[@]}" --session "$SESSION" set viewport "$CAPTURE_WIDTH" "$CAPTURE_HEIGHT" 1 >/dev/null
    "${AGENT_BROWSER[@]}" --session "$SESSION" wait '[data-parity-ready="true"]' >/dev/null
    actual_url="$("${AGENT_BROWSER[@]}" --session "$SESSION" get url)"
    [[ "$actual_url" == "$url" ]] || { printf 'unexpected capture URL: %s\n' "$actual_url" >&2; exit 1; }
    "${AGENT_BROWSER[@]}" --session "$SESSION" screenshot '[data-parity-frame]' "$OUTPUT/$scenario-$mode.png" >/dev/null
  done
done

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
