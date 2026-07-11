#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CUMULUS_ROOT="$REPO_ROOT/cumulus"
ARTIFACT_ROOT="$CUMULUS_ROOT/Artifacts/GlassParity"
RESULTS="$CUMULUS_ROOT/Artifacts/TangoMvpVerification/stages/glass-parity-unity/results.xml"

cd "$REPO_ROOT"
python3 cumulus/scripts/generate-parity-backgrounds.py >/dev/null
python3 cumulus/scripts/test-glass-parity.py
bash cumulus/scripts/capture-web-parity.sh "$ARTIFACT_ROOT/web"

source cumulus/scripts/lib/unity-run.sh
run_unity_stage glass-parity-unity graphics \
  -runTests \
  -testPlatform PlayMode \
  -testFilter TangoMvp.Tests.PlayMode.TangoGlassParityTests \
  -testResults "$RESULTS"

python3 cumulus/scripts/glass_parity.py \
  --manifest cumulus/Parity/manifest.json \
  --web "$ARTIFACT_ROOT/web" \
  --unity "$ARTIFACT_ROOT/unity" \
  --output "$ARTIFACT_ROOT/report"
