#!/usr/bin/env bash

# Fail-closed Unity command and evidence validation helpers. This file is meant
# to be sourced so callers can run several stages in one shell.

if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  _UNITY_RUN_SOURCE_PATH="${BASH_SOURCE[0]}"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  eval '_UNITY_RUN_SOURCE_PATH="${(%):-%x}"'
else
  _unity_run_source_path_error='unity-run must be sourced from bash or zsh'
  printf 'unity-run: %s\n' "$_unity_run_source_path_error" >&2
  return 1 2>/dev/null || exit 1
fi
UNITY_RUN_SCRIPT_DIR="$(cd "$(dirname "$_UNITY_RUN_SOURCE_PATH")" && pwd)"
unset _UNITY_RUN_SOURCE_PATH
UNITY_RUN_PROJECT_ROOT="$(cd "$UNITY_RUN_SCRIPT_DIR/../.." && pwd)"
UNITY_RUN_ARTIFACT_ROOT="$UNITY_RUN_PROJECT_ROOT/Artifacts/CumulusMvpVerification/stages"
UNITY_RUN_TIMEOUT_SECONDS=900
UNITY_RUN_COMPLETION_MARKER='Exiting batchmode successfully now!'
UNITY_RUN_TEST_COMPLETION_MARKER='Test run completed. Exiting with code 0 (Ok). Run completed.'

_unity_run_error() {
  printf 'unity-run: %s\n' "$*" >&2
}

_log_has_exact_line() {
  local log_path="$1"
  local expected_line="$2"

  LC_ALL=C awk -v expected="$expected_line" '
    { sub(/\r$/, "") }
    $0 == expected { found = 1; exit }
    END { exit(found ? 0 : 1) }
  ' "$log_path"
}

_unity_committed_version() {
  local version_file="$UNITY_RUN_PROJECT_ROOT/ProjectSettings/ProjectVersion.txt"
  local version

  [[ -f "$version_file" ]] || {
    _unity_run_error "missing committed editor version: $version_file"
    return 1
  }

  version="$(sed -n 's/^m_EditorVersion: \([^[:space:]]*\).*$/\1/p' "$version_file")"
  [[ -n "$version" ]] || {
    _unity_run_error "could not parse m_EditorVersion from $version_file"
    return 1
  }
  printf '%s\n' "$version"
}

_unity_reported_version() {
  local executable="$1"
  python3 - "$executable" <<'PY'
import subprocess
import sys

try:
    result = subprocess.run(
        [sys.argv[1], "-version"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=30,
        check=False,
    )
except (OSError, subprocess.TimeoutExpired) as error:
    print(error, file=sys.stderr)
    raise SystemExit(1)

if result.returncode != 0:
    print(result.stdout, file=sys.stderr, end="")
    raise SystemExit(result.returncode)
print(result.stdout, end="")
PY
}

_resolve_unity_editor() {
  local committed_version
  local executable
  local reported_version

  committed_version="$(_unity_committed_version)" || return 1
  if [[ -n "${UNITY:-}" ]]; then
    executable="$UNITY"
    [[ -x "$executable" && ! -d "$executable" ]] || {
      _unity_run_error "UNITY override is not an executable file: $executable"
      return 1
    }
    reported_version="$(_unity_reported_version "$executable")" || {
      _unity_run_error "could not read version from UNITY override: $executable"
      return 1
    }
    if ! grep -Eq "(^|[^[:alnum:].])${committed_version//./\\.}([^[:alnum:].]|$)" <<< "$reported_version"; then
      _unity_run_error "UNITY override does not report committed version $committed_version"
      return 1
    fi
  else
    executable="/Applications/Unity/Hub/Editor/$committed_version/Unity.app/Contents/MacOS/Unity"
    [[ -x "$executable" && ! -d "$executable" ]] || {
      _unity_run_error "committed Unity editor is not installed: $executable"
      return 1
    }
  fi
  printf '%s\n' "$executable"
}

_validate_nunit_xml() {
  local xml_path="$1"
  python3 - "$xml_path" <<'PY'
import sys
import xml.etree.ElementTree as ET

path = sys.argv[1]
try:
    root = ET.parse(path).getroot()
except (OSError, ET.ParseError) as error:
    print(f"invalid NUnit XML {path}: {error}", file=sys.stderr)
    raise SystemExit(1)

if root.tag.split("}")[-1] != "test-run":
    print(f"NUnit root is {root.tag!r}, expected 'test-run'", file=sys.stderr)
    raise SystemExit(1)
if root.attrib.get("result", "").lower() != "passed":
    print(f"NUnit root result is {root.attrib.get('result')!r}, expected 'Passed'", file=sys.stderr)
    raise SystemExit(1)

required = ("total", "passed", "failed")
counts = {}
for name in required:
    raw = root.attrib.get(name)
    try:
        counts[name] = int(raw)
    except (TypeError, ValueError):
        print(f"NUnit root has invalid {name} count: {raw!r}", file=sys.stderr)
        raise SystemExit(1)

for name in ("errors", "inconclusive", "skipped", "warnings"):
    raw = root.attrib.get(name, "0")
    try:
        counts[name] = int(raw)
    except ValueError:
        print(f"NUnit root has invalid {name} count: {raw!r}", file=sys.stderr)
        raise SystemExit(1)

if any(value < 0 for value in counts.values()):
    print("NUnit root contains a negative count", file=sys.stderr)
    raise SystemExit(1)
if counts["total"] == 0:
    print("NUnit root reports zero tests", file=sys.stderr)
    raise SystemExit(1)
if counts["failed"] != 0 or counts["errors"] != 0:
    print("NUnit root reports failed or errored tests", file=sys.stderr)
    raise SystemExit(1)

accounted_for = sum(counts[name] for name in ("passed", "failed", "errors", "inconclusive", "skipped", "warnings"))
if counts["total"] != accounted_for:
    print(f"NUnit counts disagree: total={counts['total']}, accounted={accounted_for}", file=sys.stderr)
    raise SystemExit(1)
PY
}

validate_unity_result() {
  local stage_name="${1:-}"
  local log_path="${2:-}"
  local nunit_xml_path="${3:-}"
  local stage_dir
  local exit_code_path
  local launcher_log
  local process_exit
  local signal_summary
  local failure_pattern
  local completion_evidence=0

  [[ "$stage_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || {
    _unity_run_error "invalid stage name: $stage_name"
    return 1
  }
  [[ -n "$log_path" ]] || {
    _unity_run_error "$stage_name: missing Unity log path"
    return 1
  }

  stage_dir="$(cd "$(dirname "$log_path")" && pwd)"
  [[ "$(basename "$stage_dir")" == "$stage_name" ]] || {
    _unity_run_error "$stage_name: log is not in its named stage directory"
    return 1
  }
  exit_code_path="$stage_dir/exit-code"
  launcher_log="$stage_dir/launcher.log"
  [[ -f "$exit_code_path" ]] || {
    _unity_run_error "$stage_name: missing process exit evidence"
    return 1
  }
  process_exit="$(tr -d '[:space:]' < "$exit_code_path")"
  [[ "$process_exit" =~ ^[0-9]+$ ]] || {
    _unity_run_error "$stage_name: malformed process exit evidence: $process_exit"
    return 1
  }
  (( process_exit == 0 )) || {
    signal_summary=""
    if [[ -f "$launcher_log" ]]; then
      signal_summary="$(LC_ALL=C sed -n '/^Unity terminated by signal /p' "$launcher_log" | tail -n 1)"
    fi
    if [[ -n "$signal_summary" ]]; then
      _unity_run_error "$stage_name: $signal_summary (shell status $process_exit)"
      return 1
    fi
    _unity_run_error "$stage_name: Unity exited with status $process_exit"
    return 1
  }
  [[ -f "$log_path" ]] || {
    _unity_run_error "$stage_name: missing Unity log: $log_path"
    return 1
  }

  failure_pattern='error CS[0-9]+|Shader error|Compilation failed|Scripts have compiler errors|Unhandled[[:space:]]+(Exception|exception)|NullReferenceException|MissingReferenceException|Assertion failed|AssertionException|Unity Editor[^[:cntrl:]]*(crash|Crashed)|Crash!!!|Fatal Error|Received signal|Segmentation fault|Aborting batchmode due to failure|^[[:space:]]*([A-Za-z_][A-Za-z0-9_+]*\.)*[A-Za-z_][A-Za-z0-9_+]*Exception([[:space:]]*:|[[:space:]]*$)'
  if LC_ALL=C grep -Eiq "$failure_pattern" "$log_path"; then
    _unity_run_error "$stage_name: Unity log contains a strict failure signature"
    return 1
  fi
  if _log_has_exact_line "$log_path" "$UNITY_RUN_COMPLETION_MARKER"; then
    completion_evidence=1
  fi

  if [[ -n "$nunit_xml_path" ]]; then
    [[ -f "$nunit_xml_path" ]] || {
      _unity_run_error "$stage_name: missing NUnit XML: $nunit_xml_path"
      return 1
    }
    _validate_nunit_xml "$nunit_xml_path" || {
      _unity_run_error "$stage_name: NUnit evidence was rejected"
      return 1
    }
    if _log_has_exact_line "$log_path" "$UNITY_RUN_TEST_COMPLETION_MARKER"; then
      completion_evidence=1
    fi
  fi

  if (( completion_evidence == 0 )); then
    _unity_run_error "$stage_name: Unity log is missing successful batch or validated test-run completion evidence"
    return 1
  fi
}

_run_with_process_group_timeout() {
  local timeout_seconds="$1"
  local launcher_log="$2"
  shift 2

  python3 - "$timeout_seconds" "$launcher_log" "$@" <<'PY'
import os
import signal
import subprocess
import sys

timeout_seconds = int(sys.argv[1])
launcher_log = sys.argv[2]
command = sys.argv[3:]

with open(launcher_log, "w", encoding="utf-8") as output:
    try:
        process = subprocess.Popen(
            command,
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except OSError as error:
        print(f"could not launch {command[0]}: {error}", file=output)
        raise SystemExit(127)

    try:
        return_code = process.wait(timeout=timeout_seconds)
        if return_code < 0:
            signal_number = -return_code
            try:
                signal_name = signal.Signals(signal_number).name
            except ValueError:
                signal_name = "UNKNOWN"
            print(
                f"Unity terminated by signal {signal_name} ({signal_number})",
                file=output,
            )
            raise SystemExit(128 + signal_number)
        raise SystemExit(return_code)
    except subprocess.TimeoutExpired:
        print(f"Unity exceeded {timeout_seconds} seconds; terminating process group", file=output)
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            print("Unity process group ignored SIGTERM; sending SIGKILL", file=output)
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        raise SystemExit(124)
PY
}

_path_is_within_directory() {
  local candidate_path="$1"
  local directory_path="$2"

  python3 - "$candidate_path" "$directory_path" <<'PY'
import os
import sys

candidate = os.path.realpath(os.path.abspath(sys.argv[1]))
directory = os.path.realpath(os.path.abspath(sys.argv[2]))
try:
    common = os.path.commonpath((candidate, directory))
except ValueError:
    raise SystemExit(1)
raise SystemExit(0 if common == directory and candidate != directory else 1)
PY
}

run_unity_stage() {
  local stage_name="${1:-}"
  local graphics_mode="${2:-}"
  shift 2 || {
    _unity_run_error "usage: run_unity_stage <stage-name> <graphics|nographics> <unity arguments...>"
    return 2
  }

  [[ "$stage_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || {
    _unity_run_error "invalid stage name: $stage_name"
    return 2
  }
  [[ "$graphics_mode" == "graphics" || "$graphics_mode" == "nographics" ]] || {
    _unity_run_error "invalid graphics mode: $graphics_mode"
    return 2
  }

  local argument
  local previous_argument=""
  local nunit_xml_path=""
  for argument in "$@"; do
    case "$argument" in
      -projectPath|-logFile|-batchmode|-nographics)
        _unity_run_error "$stage_name: caller may not supply harness-owned argument $argument"
        return 2
        ;;
    esac
    if [[ "$previous_argument" == "-testResults" ]]; then
      nunit_xml_path="$argument"
    fi
    previous_argument="$argument"
  done
  if [[ "$previous_argument" == "-testResults" ]]; then
    _unity_run_error "$stage_name: -testResults requires a path"
    return 2
  fi

  local unity_executable
  local stage_dir="$UNITY_RUN_ARTIFACT_ROOT/$stage_name"
  local log_path="$stage_dir/unity.log"
  local launcher_log="$stage_dir/launcher.log"
  local process_exit
  local -a unity_arguments

  mkdir -p "$stage_dir" || {
    _unity_run_error "$stage_name: could not create stage directory: $stage_dir"
    return 1
  }
  if [[ -n "$nunit_xml_path" ]]; then
    _path_is_within_directory "$nunit_xml_path" "$stage_dir" || {
      _unity_run_error "$stage_name: NUnit XML must be inside its named stage directory: $nunit_xml_path"
      return 2
    }
    rm -f -- "$nunit_xml_path" || {
      _unity_run_error "$stage_name: could not remove previous NUnit XML: $nunit_xml_path"
      return 1
    }
  fi

  unity_executable="$(_resolve_unity_editor)" || return 1
  rm -f "$stage_dir/exit-code" "$log_path" "$launcher_log"

  unity_arguments=(
    -batchmode
    -projectPath "$UNITY_RUN_PROJECT_ROOT"
    -logFile "$log_path"
  )
  if [[ "$graphics_mode" == "nographics" ]]; then
    unity_arguments+=(-nographics)
  fi
  unity_arguments+=("$@")

  if _run_with_process_group_timeout \
    "$UNITY_RUN_TIMEOUT_SECONDS" \
    "$launcher_log" \
    "$unity_executable" \
    "${unity_arguments[@]}"; then
    process_exit=0
  else
    process_exit=$?
  fi
  printf '%s\n' "$process_exit" > "$stage_dir/exit-code"

  validate_unity_result "$stage_name" "$log_path" "$nunit_xml_path"
}
