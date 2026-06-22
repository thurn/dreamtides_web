#!/usr/bin/env bash
#
# Kill all running Firebase database emulators and quest prototype dev servers.
#
#   ./scripts/kill-dev-servers.sh        # or: npm run kill-dev-servers
#
# Useful when stale emulators or Vite servers are left running across worktrees
# (often the cause of the "running multiple instances of the emulator suite"
# warning). Matches the dev-server processes this repo starts:
#
#   - scripts/dev-with-emulator.mjs   the dev wrapper
#   - vite                            the Vite dev server
#   - firebase emulators:start        the Firebase emulator launcher (node)
#   - the firebase-database-emulator  the Java database emulator process
#
# Only this project's dev processes are targeted; unrelated node/java processes
# are left alone.

set -uo pipefail

# Patterns identifying this project's dev-server processes. Each is matched
# against the full command line with `pgrep -f`.
patterns=(
  "scripts/dev-with-emulator.mjs"
  "vite --strictPort"
  "firebase emulators:start"
  "firebase-database-emulator"
)

found_any=0

for pattern in "${patterns[@]}"; do
  # `pgrep -f` matches against the full argument list. Exclude this script's
  # own PID so we never signal ourselves.
  pids=$(pgrep -f "$pattern" | grep -v "^$$\$" || true)
  if [[ -n "${pids}" ]]; then
    found_any=1
    echo "Killing processes matching '${pattern}':"
    # shellcheck disable=SC2086
    ps -o pid=,command= -p ${pids} | sed 's/^/  /'
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
  fi
done

if [[ "${found_any}" -eq 0 ]]; then
  echo "No Firebase emulators or quest prototype dev servers running."
  exit 0
fi

# Give processes a moment to exit, then force-kill any stragglers.
sleep 1
for pattern in "${patterns[@]}"; do
  pids=$(pgrep -f "$pattern" | grep -v "^$$\$" || true)
  if [[ -n "${pids}" ]]; then
    echo "Force-killing stragglers matching '${pattern}': ${pids}"
    # shellcheck disable=SC2086
    kill -9 ${pids} 2>/dev/null || true
  fi
done

echo "Done."
