#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CUMULUS_ROOT="$REPO_ROOT/cumulus"
ARTIFACT_ROOT="$CUMULUS_ROOT/Artifacts/TangoMvpVerification"
STAGE_ROOT="$ARTIFACT_ROOT/stages"
SUMMARY_PATH="$ARTIFACT_ROOT/summary.json"
STAGE_RECORDS="$ARTIFACT_ROOT/stage-records.jsonl"
SCOPE_GUARD="$SCRIPT_DIR/tango-scope-guard.py"
EVIDENCE_VALIDATOR="$SCRIPT_DIR/tango_evidence.py"
PROVENANCE_CHECK="$SCRIPT_DIR/tango-provenance.py"

if [[ "${1:-}" == "--self-test" ]]; then
  bash "$SCRIPT_DIR/test-unity-run.sh"
  bash "$SCRIPT_DIR/test-tango-scope-guard.sh"
  python3 "$SCRIPT_DIR/test-tango-evidence.py"
  python3 "$SCRIPT_DIR/test-tango-provenance.py"
  exit 0
elif (( $# != 0 )); then
  echo "usage: $0" >&2
  exit 2
fi

# shellcheck source=lib/unity-run.sh
source "$SCRIPT_DIR/lib/unity-run.sh"
UNITY_RUN_TIMEOUT_SECONDS=1800

CURRENT_STAGE="bootstrap"
OVERALL="failed"
SUMMARY_WRITTEN=0
VERIFIED_HEAD=""
SETTINGS_RESTORED=0
INCIDENTAL_PATHS=(
  "cumulus/Assets/Settings/DefaultVolumeProfile.asset"
  "cumulus/Assets/Settings/PC_RPAsset.asset"
  "cumulus/Assets/Settings/UniversalRenderPipelineGlobalSettings.asset"
  "cumulus/ProjectSettings/ProjectSettings.asset"
  "cumulus/ProjectSettings/ShaderGraphSettings.asset"
  "cumulus/ProjectSettings/UnityConnectSettings.asset"
  "cumulus/ProjectSettings/SceneTemplateSettings.json"
)

snapshot_incidental_settings() {
  local snapshot="$ARTIFACT_ROOT/incidental-settings-snapshot"
  mkdir -p "$snapshot"
  : > "$snapshot/status"
  local path
  for path in "${INCIDENTAL_PATHS[@]}"; do
    if [[ -f "$REPO_ROOT/$path" ]]; then
      mkdir -p "$snapshot/$(dirname "$path")"
      cp "$REPO_ROOT/$path" "$snapshot/$path"
      printf 'present\t%s\n' "$path" >> "$snapshot/status"
    else
      printf 'absent\t%s\n' "$path" >> "$snapshot/status"
    fi
  done
}

restore_incidental_settings() {
  (( SETTINGS_RESTORED == 0 )) || return 0
  local snapshot="$ARTIFACT_ROOT/incidental-settings-snapshot"
  [[ -f "$snapshot/status" ]] || return 0
  local state path
  while IFS=$'\t' read -r state path; do
    if [[ "$state" == "present" ]]; then
      cp "$snapshot/$path" "$REPO_ROOT/$path"
    else
      rm -f "$REPO_ROOT/$path"
    fi
  done < "$snapshot/status"
  SETTINGS_RESTORED=1
}

record_stage() {
  local name="$1"
  local status="$2"
  local duration="$3"
  python3 - "$STAGE_RECORDS" "$name" "$status" "$duration" <<'PY'
import json
import sys

with open(sys.argv[1], "a", encoding="utf-8") as output:
    json.dump(
        {"name": sys.argv[2], "status": sys.argv[3], "durationSeconds": float(sys.argv[4])},
        output,
        separators=(",", ":"),
    )
    output.write("\n")
PY
}

run_stage() {
  local name="$1"
  shift
  CURRENT_STAGE="$name"
  echo "[$name]"
  local started
  local finished
  local duration
  local status
  local exit_code
  started="$(python3 -c 'import time; print(time.monotonic())')"
  if "$@"; then
    exit_code=0
    status="passed"
  else
    exit_code=$?
    status="failed"
  fi
  finished="$(python3 -c 'import time; print(time.monotonic())')"
  duration="$(python3 - "$started" "$finished" <<'PY'
import sys
print(float(sys.argv[2]) - float(sys.argv[1]))
PY
)"
  record_stage "$name" "$status" "$duration"
  return "$exit_code"
}

write_failure_summary() {
  local failed_stage="$1"
  local process_exit="$2"
  python3 - "$SUMMARY_PATH" "$STAGE_RECORDS" "$failed_stage" "$process_exit" "$REPO_ROOT" <<'PY'
import json
from pathlib import Path
import subprocess
import sys

summary_path = Path(sys.argv[1])
records_path = Path(sys.argv[2])
stages = []
if records_path.exists():
    for line in records_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                stages.append(json.loads(line))
            except json.JSONDecodeError:
                stages.append({"name": "stage-record-parse", "status": "failed", "durationSeconds": 0})
try:
    commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=sys.argv[5], text=True
    ).strip()
except (OSError, subprocess.CalledProcessError):
    commit = "unknown"
payload = {
    "schemaVersion": 1,
    "overall": "failed",
    "failedStage": sys.argv[3],
    "processExit": int(sys.argv[4]),
    "gitCommit": commit,
    "stages": stages,
}
summary_path.parent.mkdir(parents=True, exist_ok=True)
temporary = summary_path.with_suffix(".json.tmp")
temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
temporary.replace(summary_path)
PY
}

on_exit() {
  local exit_code=$?
  trap - EXIT
  restore_incidental_settings || exit_code=1
  if (( SUMMARY_WRITTEN == 0 )); then
    write_failure_summary "$CURRENT_STAGE" "$exit_code" || true
  fi
  if [[ "$OVERALL" == "passed" && $exit_code -eq 0 ]]; then
    echo "Tango MVP verification: PASSED"
  else
    echo "Tango MVP verification: FAILED ($CURRENT_STAGE)"
  fi
  echo "$SUMMARY_PATH"
  exit "$exit_code"
}
trap on_exit EXIT

mkdir -p "$ARTIFACT_ROOT"
rm -rf "$ARTIFACT_ROOT"
mkdir -p "$STAGE_ROOT"
: > "$STAGE_RECORDS"

CURRENT_STAGE="clean-head-provenance"
if ! VERIFIED_HEAD="$(python3 "$PROVENANCE_CHECK" --repo-root "$REPO_ROOT" --summary "$SUMMARY_PATH")"; then
  SUMMARY_WRITTEN=1
  exit 1
fi
snapshot_incidental_settings

shell_self_tests() {
  bash "$SCRIPT_DIR/test-unity-run.sh" > "$STAGE_ROOT/shell-harness.log" 2>&1 || return
  bash "$SCRIPT_DIR/test-tango-scope-guard.sh" > "$STAGE_ROOT/scope-guard-self-test.log" 2>&1 || return
  python3 "$SCRIPT_DIR/test-tango-evidence.py" > "$STAGE_ROOT/evidence-self-test.log" 2>&1 || return
  python3 "$SCRIPT_DIR/test-tango-provenance.py" > "$STAGE_ROOT/provenance-self-test.log" 2>&1 || return
}

clean_unity_import() {
  rm -rf "$CUMULUS_ROOT/Library"
  run_unity_stage clean-import nographics -quit
}

write_asset_manifest() {
  local output="$1"
  (
    cd "$CUMULUS_ROOT"
    for path in \
      Assets/Scenes/TangoGlassLab.unity \
      Assets/Settings/PC_Renderer.asset \
      Assets/TangoMvp/Materials/TangoBackdropUnlit.mat \
      Assets/TangoMvp/Materials/TangoBlur.mat \
      Assets/TangoMvp/Materials/TangoGlassLightingProfile.asset \
      Assets/TangoMvp/Materials/TangoMaterialLibrary.asset \
      Assets/TangoMvp/Materials/TangoOnGlass.mat \
      Assets/TangoMvp/Materials/TangoSceneGlass.mat \
      Assets/TangoMvp/Materials/TangoShadowReceiver.mat \
      Assets/TangoMvp/Materials/TangoSolidChrome.mat \
      Assets/TangoMvp/Materials/TangoTextOutline.mat \
      Assets/TangoMvp/Meshes/TangoPanel.asset \
      Assets/TangoMvp/Prefabs/TangoGlassPanel.prefab \
      ProjectSettings/EditorBuildSettings.asset; do
      [[ -f "$path" ]] || {
        echo "missing authoritative builder asset: $path" >&2
        return 1
      }
      shasum -a 256 "$path"
    done
  ) > "$output"
}

verify_builder_stability() {
  run_unity_stage builder-first nographics -quit -executeMethod TangoMvp.Editor.TangoGlassLabBuilder.Rebuild || return
  write_asset_manifest "$ARTIFACT_ROOT/asset-hashes-first.txt" || return
  run_unity_stage builder-second nographics -quit -executeMethod TangoMvp.Editor.TangoGlassLabBuilder.Rebuild || return
  write_asset_manifest "$ARTIFACT_ROOT/asset-hashes-second.txt" || return
  cmp "$ARTIFACT_ROOT/asset-hashes-first.txt" "$ARTIFACT_ROOT/asset-hashes-second.txt"
}

run_editmode_tests() {
  run_unity_stage full-editmode nographics \
    -runTests \
    -testPlatform EditMode \
    -testResults "$STAGE_ROOT/full-editmode/results.xml"
}

validate_gpu_evidence() {
  python3 "$EVIDENCE_VALIDATOR" "$ARTIFACT_ROOT/render-metrics.json" "$ARTIFACT_ROOT"
}

run_playmode_tests() {
  run_unity_stage full-playmode graphics \
    -runTests \
    -testPlatform PlayMode \
    -testResults "$STAGE_ROOT/full-playmode/results.xml" || return
  validate_gpu_evidence
}

validate_shader_build_evidence() {
  python3 - \
    "$ARTIFACT_ROOT/shader-report.json" \
    "$ARTIFACT_ROOT/build-report.json" \
    "$CUMULUS_ROOT/Builds/TangoMvpVerification/CumulusTangoMvp.app" <<'PY'
import json
from pathlib import Path
import sys

shader_path = Path(sys.argv[1])
build_path = Path(sys.argv[2])
player_path = Path(sys.argv[3])
try:
    shader = json.loads(shader_path.read_text(encoding="utf-8"))
    build = json.loads(build_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError) as error:
    raise SystemExit(f"invalid shader/build evidence: {error}")
expected = [
    "TangoMvp/SceneGlass",
    "TangoMvp/OnGlass",
    "TangoMvp/ShopBackdropShadowReceiver",
    "Hidden/TangoMvp/SeparableBlur",
]
if shader.get("shaderCount") != 4 or shader.get("errorCount") != 0:
    raise SystemExit("shader report has an invalid count or nonzero errors")
records = shader.get("shaders")
if not isinstance(records, list) or [record.get("name") for record in records] != expected:
    raise SystemExit("shader report does not contain the exact required shaders")
if any(record.get("found") is not True or not isinstance(record.get("messages"), list) for record in records):
    raise SystemExit("shader report has missing or malformed shader records")
if build.get("result") != "Succeeded" or build.get("platform") != "StandaloneOSX":
    raise SystemExit("standalone build did not succeed for macOS")
if build.get("outputPath") != "Builds/TangoMvpVerification/CumulusTangoMvp.app":
    raise SystemExit("standalone build output path is not exact")
if build.get("totalErrors") != 0 or not isinstance(build.get("totalSize"), int) or build["totalSize"] <= 0:
    raise SystemExit("standalone build summary is malformed")
if not player_path.is_dir() or not any(path.is_file() for path in player_path.rglob("*")):
    raise SystemExit("standalone player output is missing or empty")
PY
}

run_shader_build() {
  run_unity_stage shader-build graphics \
    -quit \
    -executeMethod TangoMvp.Editor.TangoMvpBatchVerification.InspectShadersAndBuildPlayer || return
  validate_shader_build_evidence
}

run_web_checks() {
  (
    cd "$REPO_ROOT"
    npm run lint > "$STAGE_ROOT/npm-lint.log" 2>&1 || return
    npm run typecheck > "$STAGE_ROOT/npm-typecheck.log" 2>&1 || return
    npm test > "$STAGE_ROOT/npm-test.log" 2>&1
  )
}

run_scope_guard() {
  local scope_base
  if [[ -n "${TANGO_SCOPE_BASE:-}" ]]; then
    scope_base="$TANGO_SCOPE_BASE"
  else
    scope_base="$(git -C "$REPO_ROOT" merge-base HEAD master)"
  fi
  python3 "$SCOPE_GUARD" --repo-root "$REPO_ROOT" --base "$scope_base" \
    > "$STAGE_ROOT/scope-guard.log" 2>&1
}

write_success_summary() {
  python3 - \
    "$SUMMARY_PATH" \
    "$STAGE_RECORDS" \
    "$REPO_ROOT" \
    "$CUMULUS_ROOT" \
    "$ARTIFACT_ROOT" \
    "$VERIFIED_HEAD" <<'PY'
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

summary_path = Path(sys.argv[1])
records_path = Path(sys.argv[2])
repo_root = Path(sys.argv[3])
cumulus_root = Path(sys.argv[4])
artifact_root = Path(sys.argv[5])
verified_head = sys.argv[6]

stages = [json.loads(line) for line in records_path.read_text(encoding="utf-8").splitlines() if line.strip()]
if len(stages) != 8 or any(stage.get("status") != "passed" for stage in stages):
    raise SystemExit("summary stage evidence is incomplete")

def test_counts(path: Path) -> dict:
    root = ET.parse(path).getroot()
    if root.tag.split("}")[-1] != "test-run" or root.attrib.get("result", "").lower() != "passed":
        raise SystemExit(f"invalid passing NUnit root: {path}")
    result = {}
    for field in ("total", "passed", "failed", "errors", "inconclusive", "skipped", "warnings"):
        result[field] = int(root.attrib.get(field, "0"))
    if result["total"] <= 0 or result["failed"] != 0 or result["errors"] != 0:
        raise SystemExit(f"invalid NUnit counts: {path}")
    return result

project_version = (cumulus_root / "ProjectSettings/ProjectVersion.txt").read_text(encoding="utf-8")
match = re.search(r"^m_EditorVersion:\s*(\S+)", project_version, re.MULTILINE)
if match is None:
    raise SystemExit("missing exact Unity version")
manifest = json.loads((cumulus_root / "Packages/manifest.json").read_text(encoding="utf-8"))
urp_version = manifest.get("dependencies", {}).get("com.unity.render-pipelines.universal")
if not isinstance(urp_version, str) or not urp_version:
    raise SystemExit("missing exact URP version")

render = json.loads((artifact_root / "render-metrics.json").read_text(encoding="utf-8"))
metrics = render["metrics"]
if not metrics or any(metric.get("passed") is not True for metric in metrics):
    raise SystemExit("summary found failed or missing render metrics")
shader = json.loads((artifact_root / "shader-report.json").read_text(encoding="utf-8"))
build = json.loads((artifact_root / "build-report.json").read_text(encoding="utf-8"))
first_metric = metrics[0]
asset_hashes = []
for line in (artifact_root / "asset-hashes-second.txt").read_text(encoding="utf-8").splitlines():
    parts = line.split(None, 1)
    if len(parts) != 2 or len(parts[0]) != 64:
        raise SystemExit("asset hash manifest is malformed")
    asset_hashes.append({"sha256": parts[0], "path": parts[1]})
if not asset_hashes:
    raise SystemExit("asset hash manifest is empty")
payload = {
    "schemaVersion": 1,
    "overall": "passed",
    "failedStage": None,
    "unityVersion": match.group(1),
    "urpVersion": urp_version,
    "graphicsApi": first_metric["graphicsApi"],
    "graphicsDevice": first_metric["deviceName"],
    "gitCommit": verified_head,
    "stages": stages,
    "tests": {
        "editMode": test_counts(artifact_root / "stages/full-editmode/results.xml"),
        "playMode": test_counts(artifact_root / "stages/full-playmode/results.xml"),
    },
    "shaderErrorCount": shader["errorCount"],
    "build": {
        "result": build["result"],
        "sizeBytes": build["totalSize"],
        "warnings": build["totalWarnings"],
        "outputPath": build["outputPath"],
    },
    "renderMetrics": metrics,
    "assetHashManifest": str(artifact_root / "asset-hashes-second.txt"),
    "assetHashes": asset_hashes,
    "artifacts": {
        "root": str(artifact_root),
        "editModeResults": str(artifact_root / "stages/full-editmode/results.xml"),
        "playModeResults": str(artifact_root / "stages/full-playmode/results.xml"),
        "shaderReport": str(artifact_root / "shader-report.json"),
        "buildReport": str(artifact_root / "build-report.json"),
        "renderMetrics": str(artifact_root / "render-metrics.json"),
    },
}
temporary = summary_path.with_suffix(".json.tmp")
temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
temporary.replace(summary_path)
PY
}

run_stage shell-harness-self-tests shell_self_tests
run_stage clean-unity-import clean_unity_import
run_stage deterministic-builder verify_builder_stability
run_stage editmode-tests run_editmode_tests
run_stage gpu-playmode-tests run_playmode_tests
run_stage shader-inspection-and-build run_shader_build
run_stage repository-checks run_web_checks
run_stage static-scope-guard run_scope_guard

CURRENT_STAGE="summary"
restore_incidental_settings
if ! python3 "$PROVENANCE_CHECK" --repo-root "$REPO_ROOT" --summary "$SUMMARY_PATH" --expect-head "$VERIFIED_HEAD" >/dev/null; then
  SUMMARY_WRITTEN=1
  exit 1
fi
write_success_summary
OVERALL="passed"
SUMMARY_WRITTEN=1
