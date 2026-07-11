#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS="$SCRIPT_DIR/lib/unity-run.sh"

if [[ ! -f "$HARNESS" ]]; then
  echo "FAIL: Unity harness is missing: $HARNESS" >&2
  exit 1
fi

# shellcheck source=lib/unity-run.sh
source "$HARNESS"

TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/unity-run-test.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT

PASS_COUNT=0
FAIL_COUNT=0
COMPLETION_MARKER="Exiting batchmode successfully now!"
TEST_COMPLETION_MARKER="Test run completed. Exiting with code 0 (Ok). Run completed."

make_stage() {
  local stage_name="$1"
  local stage_dir="$TEST_ROOT/$stage_name"
  mkdir -p "$stage_dir"
  printf '0\n' > "$stage_dir/exit-code"
  printf '%s\n' "$COMPLETION_MARKER" > "$stage_dir/unity.log"
  printf '%s\n' "$stage_dir"
}

write_passing_nunit() {
  local path="$1"
  cat > "$path" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<test-run id="2" testcasecount="1" result="Passed" total="1" passed="1" failed="0" inconclusive="0" skipped="0" asserts="0">
  <test-suite type="TestSuite" id="1000" name="Synthetic" result="Passed" />
</test-run>
XML
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

expect_reject() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "FAIL: accepted $description" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo "PASS: rejected $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
}

valid_dir="$(make_stage valid-stage)"
valid_xml="$valid_dir/results.xml"
write_passing_nunit "$valid_xml"
expect_accept "valid process, log, completion marker, and NUnit evidence" \
  validate_unity_result valid-stage "$valid_dir/unity.log" "$valid_xml"

nonzero_dir="$(make_stage nonzero-exit)"
printf '17\n' > "$nonzero_dir/exit-code"
expect_reject "nonzero process exit" \
  validate_unity_result nonzero-exit "$nonzero_dir/unity.log"

missing_exit_dir="$(make_stage missing-exit)"
rm "$missing_exit_dir/exit-code"
expect_reject "missing process exit evidence" \
  validate_unity_result missing-exit "$missing_exit_dir/unity.log"

malformed_exit_dir="$(make_stage malformed-exit)"
printf 'not-a-number\n' > "$malformed_exit_dir/exit-code"
expect_reject "malformed process exit evidence" \
  validate_unity_result malformed-exit "$malformed_exit_dir/unity.log"

missing_log_dir="$(make_stage missing-log)"
rm "$missing_log_dir/unity.log"
expect_reject "missing Unity log" \
  validate_unity_result missing-log "$missing_log_dir/unity.log"

fake_unity="$TEST_ROOT/fake-unity"
cat > "$fake_unity" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-version" ]]; then
  echo "${FAKE_UNITY_VERSION:?}"
  exit 0
fi
if [[ -n "${FAKE_UNITY_LAUNCH_MARKER:-}" ]]; then
  printf 'launched\n' > "$FAKE_UNITY_LAUNCH_MARKER"
fi
log_path=""
results_path=""
while (( $# > 0 )); do
  case "$1" in
    -logFile)
      log_path="$2"
      shift 2
      ;;
    -testResults)
      results_path="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s\n' "${FAKE_UNITY_COMPLETION:-Exiting batchmode successfully now!}" > "$log_path"
if [[ "${FAKE_UNITY_WRITE_NUNIT:-0}" == "1" ]]; then
  printf '%s\n' '<test-run result="Passed" total="1" passed="1" failed="0" errors="0" />' > "$results_path"
fi
exit "${FAKE_UNITY_EXIT:-9}"
SH
chmod +x "$fake_unity"
errexit_stage_dir="$UNITY_RUN_ARTIFACT_ROOT/self-test-errexit"
rm -rf "$errexit_stage_dir"

fresh_test_stage_dir="$UNITY_RUN_ARTIFACT_ROOT/self-test-fresh-nunit"
rm -rf "$fresh_test_stage_dir"
fresh_test_xml="$fresh_test_stage_dir/results.xml"
expect_accept "fresh passing NUnit XML with Unity test-run completion evidence" \
  env \
  FAKE_UNITY_VERSION="$(_unity_committed_version)" \
  FAKE_UNITY_EXIT=0 \
  FAKE_UNITY_COMPLETION="$TEST_COMPLETION_MARKER" \
  FAKE_UNITY_WRITE_NUNIT=1 \
  UNITY="$fake_unity" \
  bash -c "source '$HARNESS'; run_unity_stage self-test-fresh-nunit nographics -runTests -testResults '$fresh_test_xml'"
rm -rf "$fresh_test_stage_dir"
FAKE_UNITY_VERSION="$(_unity_committed_version)" UNITY="$fake_unity" bash -e -c \
  "source '$HARNESS'; run_unity_stage self-test-errexit nographics -quit" \
  >/dev/null 2>&1 || true
if [[ -f "$errexit_stage_dir/exit-code" ]] && [[ "$(< "$errexit_stage_dir/exit-code")" == "9" ]]; then
  echo "PASS: recorded nonzero process evidence for an errexit caller"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "FAIL: did not record nonzero process evidence for an errexit caller" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
rm -rf "$errexit_stage_dir"

stale_stage_dir="$UNITY_RUN_ARTIFACT_ROOT/self-test-stale-nunit"
rm -rf "$stale_stage_dir"
mkdir -p "$stale_stage_dir"
stale_xml="$stale_stage_dir/results.xml"
write_passing_nunit "$stale_xml"
expect_reject "stale NUnit XML not rewritten by Unity" \
  env FAKE_UNITY_VERSION="$(_unity_committed_version)" FAKE_UNITY_EXIT=0 UNITY="$fake_unity" \
  bash -c "source '$HARNESS'; run_unity_stage self-test-stale-nunit nographics -runTests -testResults '$stale_xml'"
rm -rf "$stale_stage_dir"

outside_stage_dir="$UNITY_RUN_ARTIFACT_ROOT/self-test-outside-nunit"
outside_xml="$TEST_ROOT/outside-results.xml"
outside_launch_marker="$TEST_ROOT/outside-launched"
rm -rf "$outside_stage_dir" "$outside_launch_marker"
if env \
  FAKE_UNITY_VERSION="$(_unity_committed_version)" \
  FAKE_UNITY_EXIT=0 \
  FAKE_UNITY_LAUNCH_MARKER="$outside_launch_marker" \
  UNITY="$fake_unity" \
  bash -c "source '$HARNESS'; run_unity_stage self-test-outside-nunit nographics -runTests -testResults '$outside_xml'" \
  >/dev/null 2>&1 || [[ -e "$outside_launch_marker" ]]; then
  echo "FAIL: outside-stage NUnit path was not rejected before Unity launch" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "PASS: rejected outside-stage NUnit path before Unity launch"
  PASS_COUNT=$((PASS_COUNT + 1))
fi
rm -rf "$outside_stage_dir"

for fixture in \
  "compiler-error|error CS0246: The type or namespace name 'Missing' could not be found" \
  "shader-error|Shader error in 'TangoMvp/SceneGlass': syntax error" \
  "compilation-failed|Compilation failed: 1 error(s), 0 warnings" \
  "scripts-compiler-errors|Scripts have compiler errors." \
  "unhandled-exception|Unhandled Exception: System.InvalidOperationException" \
  "invalid-operation-exception|System.InvalidOperationException: Operation is not valid" \
  "target-invocation-exception|System.Reflection.TargetInvocationException: Exception has been thrown by the target" \
  "null-reference|NullReferenceException: Object reference not set" \
  "missing-reference|MissingReferenceException: The object has been destroyed" \
  "assertion-failure|Assertion failed on expression: 'm_Valid'" \
  "crash-marker|Unity Editor crashed!"; do
  fixture_name="${fixture%%|*}"
  signature="${fixture#*|}"
  fixture_dir="$(make_stage "$fixture_name")"
  printf '%s\n%s\n' "$signature" "$COMPLETION_MARKER" > "$fixture_dir/unity.log"
  expect_reject "$fixture_name signature" \
    validate_unity_result "$fixture_name" "$fixture_dir/unity.log"
done

missing_completion_dir="$(make_stage missing-completion)"
printf 'Batch mode stopped without a success marker.\n' > "$missing_completion_dir/unity.log"
expect_reject "missing completion marker" \
  validate_unity_result missing-completion "$missing_completion_dir/unity.log"

arbitrary_xml_dir="$(make_stage arbitrary-nunit-without-completion)"
arbitrary_xml="$arbitrary_xml_dir/results.xml"
write_passing_nunit "$arbitrary_xml"
printf 'A caller supplied XML without Unity completion evidence.\n' > "$arbitrary_xml_dir/unity.log"
expect_reject "optional NUnit XML without Unity test-run completion evidence" \
  validate_unity_result arbitrary-nunit-without-completion "$arbitrary_xml_dir/unity.log" "$arbitrary_xml"

absent_xml_dir="$(make_stage absent-nunit)"
expect_reject "absent NUnit XML" \
  validate_unity_result absent-nunit "$absent_xml_dir/unity.log" "$absent_xml_dir/results.xml"

malformed_xml_dir="$(make_stage malformed-nunit)"
printf '<test-run result="Passed" failed="0" errors="0">\n' > "$malformed_xml_dir/results.xml"
expect_reject "malformed NUnit XML" \
  validate_unity_result malformed-nunit "$malformed_xml_dir/unity.log" "$malformed_xml_dir/results.xml"

failed_result_dir="$(make_stage failed-nunit-result)"
printf '%s\n' '<test-run result="Failed" total="1" passed="0" failed="1" errors="0" />' > "$failed_result_dir/results.xml"
expect_reject "failed NUnit root result" \
  validate_unity_result failed-nunit-result "$failed_result_dir/unity.log" "$failed_result_dir/results.xml"

failed_count_dir="$(make_stage failed-nunit-count)"
printf '%s\n' '<test-run result="Passed" total="2" passed="1" failed="1" errors="0" />' > "$failed_count_dir/results.xml"
expect_reject "nonzero NUnit failed count" \
  validate_unity_result failed-nunit-count "$failed_count_dir/unity.log" "$failed_count_dir/results.xml"

error_count_dir="$(make_stage error-nunit-count)"
printf '%s\n' '<test-run result="Passed" total="2" passed="1" failed="0" errors="1" />' > "$error_count_dir/results.xml"
expect_reject "nonzero NUnit error count" \
  validate_unity_result error-nunit-count "$error_count_dir/unity.log" "$error_count_dir/results.xml"

echo "$PASS_COUNT validator checks passed; $FAIL_COUNT failed"
(( FAIL_COUNT == 0 ))
