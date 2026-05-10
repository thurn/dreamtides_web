#!/usr/bin/env bash
# Append a "# How to Implement This Task" section with universal
# implementation guidance to backlog task files.
#
# Usage:
#   append-general-instructions.sh                              # all NNN-*.md in /tmp/backlog/
#   append-general-instructions.sh /tmp/backlog/                # explicit directory
#   append-general-instructions.sh /tmp/backlog/005-foo.md      # single file
#
# Idempotent: files that already contain the marker heading are skipped.
set -euo pipefail

MARKER='# How to Implement This Task'

read -r -d '' GENERAL_INSTRUCTIONS <<'END_GENERAL' || true
# How to Implement This Task

These are the universal expectations for every backlog task. The sections
above hold task-specific extensions to these — read both before starting.

## Standard acceptance criteria

In addition to any task-specific criteria stated above, every task must
satisfy:

- [ ] Bug reproduced in agent-browser **before** the fix, with screenshot
      saved under `/tmp/backlog/screenshots/`.
- [ ] Fix verified in agent-browser **after** the change, with a second
      screenshot for comparison.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` all pass.
- [ ] Targeted regression test added or updated where it would have caught
      this bug.

## Going one level deeper

Beyond the literal bug, always consider:

- Does this same problem exist in adjacent surfaces? Search for the pattern.
- Is this a symptom of an architectural issue (e.g. RTDB stripping, missing
  normalization, screen-orchestration coupling)? If so, fix the root cause.
- Could a logging or debug-surface improvement make this class of bug
  cheaper to diagnose next time? Add it.
- Are there related UX issues you noticed while testing that should become
  follow-up tasks? File them as new task files in `/tmp/backlog/` using the
  same template (load the `backlog` skill again to do this).

If the task above lists task-specific deeper considerations, treat those as
additions to this list, not replacements.

## QA blocker policy

If you cannot reproduce this issue via agent-browser, that is a **hard
blocker**, not a reason to skip the task. Options in order of preference:

1. Re-read the reproduction steps above and try again with a fresh room.
2. Inspect RTDB directly (`curl …/rooms/<id>.json | jq .`) to see whether
   the underlying state is in the expected shape.
3. Build a temporary debug surface (URL param, debug-overlay button, log
   line) that exposes the relevant state, then reproduce.
4. Ask the user for clarification only after 1-3 have failed.

Do not declare the task complete without a post-fix screenshot showing the
expected behavior.

## UX expectations

This is a prototype where UX quality matters. While fixing the literal bug:

- View the final UI in screenshots and evaluate it as a designer, not just
  as a coder.
- Adjust spacing, copy, affordances, and adjacent components if the fix
  exposes an awkward result.
- Prefer changes that make the surface clearer for a first-time player over
  micro-optimizations.
END_GENERAL

append_to_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "missing: $file" >&2
    return 1
  fi
  if grep -qF "$MARKER" "$file"; then
    echo "skip (already has '$MARKER'): $file"
    return 0
  fi
  # Ensure file ends with a newline before appending.
  local last_char
  last_char=$(tail -c1 "$file"; printf x)
  last_char=${last_char%x}
  if [ -n "$last_char" ] && [ "$last_char" != $'\n' ]; then
    printf '\n' >> "$file"
  fi
  printf '\n%s\n' "$GENERAL_INSTRUCTIONS" >> "$file"
  echo "appended: $file"
}

main() {
  local target="${1:-/tmp/backlog/}"
  if [ -d "$target" ]; then
    shopt -s nullglob
    local files=("${target%/}"/[0-9][0-9][0-9]-*.md)
    if [ ${#files[@]} -eq 0 ]; then
      echo "no NNN-*.md files found in $target" >&2
      exit 1
    fi
    local f
    for f in "${files[@]}"; do
      append_to_file "$f"
    done
  elif [ -f "$target" ]; then
    append_to_file "$target"
  else
    echo "not a file or directory: $target" >&2
    exit 1
  fi
}

main "$@"
