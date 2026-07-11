#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GUARD="$SCRIPT_DIR/tango-scope-guard.py"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/tango-scope-guard.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT

PASS_COUNT=0
FAIL_COUNT=0

write_source() {
  local fixture="$1"
  local source="$2"
  local body="$3"
  mkdir -p "$fixture/$(dirname "$source")"
  printf '%s\n' "$body" > "$fixture/$source"
  printf 'fileFormatVersion: 2\nguid: 11111111111111111111111111111111\n' > "$fixture/$source.meta"
}

expect_accept() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS: accepted $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: rejected $description" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

expect_reject_with() {
  local description="$1"
  local signature="$2"
  shift 2
  local output
  if output="$("$@" 2>&1)"; then
    echo "FAIL: accepted $description" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  elif grep -Fq "$signature" <<< "$output"; then
    echo "PASS: rejected $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: rejected $description without signature '$signature': $output" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

allowed="$TEST_ROOT/allowed"
write_source "$allowed" "cumulus/Assets/TangoMvp/Runtime/Allowed.cs" \
  'using UnityEngine; public sealed class Allowed : MonoBehaviour { }'
expect_accept "allowed runtime source with meta" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$allowed"

forbidden_path="$TEST_ROOT/forbidden-path"
mkdir -p "$forbidden_path/cumulus/Assets/Settings"
printf 'fixture\n' > "$forbidden_path/cumulus/Assets/Settings/Mobile_Renderer.asset"
printf 'fileFormatVersion: 2\n' > "$forbidden_path/cumulus/Assets/Settings/Mobile_Renderer.asset.meta"
expect_reject_with "Mobile renderer mutation" "forbidden renderer mutation" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$forbidden_path"

allocation="$TEST_ROOT/allocation"
write_source "$allocation" "cumulus/Assets/TangoMvp/Runtime/BadAllocation.cs" \
  'using UnityEngine; public sealed class BadAllocation { Material Create(Shader shader) { return new Material(shader); } }'
expect_reject_with "runtime Material allocation" "runtime material allocation" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$allocation"

per_pane="$TEST_ROOT/per-pane"
write_source "$per_pane" "cumulus/Assets/TangoMvp/Runtime/BadPane.cs" \
  'using UnityEngine; public sealed class BadPane : MonoBehaviour { [SerializeField] private Camera paneCamera; }'
expect_reject_with "per-pane camera field" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$per_pane"

ui_import="$TEST_ROOT/ui-import"
write_source "$ui_import" "cumulus/Assets/TangoMvp/Runtime/BadUi.cs" \
  'using UnityEngine.UIElements; public sealed class BadUi { }'
expect_reject_with "UI Toolkit import" "forbidden UI namespace import" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$ui_import"

missing_meta="$TEST_ROOT/missing-meta"
mkdir -p "$missing_meta/cumulus/Assets/TangoMvp"
printf 'fixture\n' > "$missing_meta/cumulus/Assets/TangoMvp/NoMeta.asset"
expect_reject_with "missing Unity meta partner" "missing Unity meta partner" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$missing_meta"

echo "$PASS_COUNT scope-guard checks passed; $FAIL_COUNT failed"
(( FAIL_COUNT == 0 ))
