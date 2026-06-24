#!/usr/bin/env bash
#
# Regenerate all canonical committed assets in one command.
#
#   ./scripts/regenerate-assets.sh        # or: npm run regenerate-assets
#
# The committed, git-tracked artifacts (data/*.jsonc, data/*.json, docs/cards2/*)
# are baked from source by the scripts below, while the gitignored public/ bundles
# are derived from those artifacts and the source TOMLs by setup-assets. The bakes
# READ the public/ bundles and setup-assets COPIES the baked artifacts back into
# public/, so setup-assets must bracket the bakes — run once before (to give them
# inputs) and once after (to refresh the bundles from the fresh artifacts).
#
# Order:
#   1. setup-assets         build public/ inputs from the source TOMLs + records
#   2. bake-merchant-corpus  data/merchant_corpus.json
#   3. bake-affinity-corpus  data/affinity_corpus.jsonc
#   4. bake-tides4           data/tides4.jsonc + docs/cards2/tides4_decklists.md
#   5. bake-tides5           data/tides5.jsonc + docs/cards2/tides5_decklists.md
#   6. setup-assets         copy the fresh artifacts into public/
#   7. check-tides4          confirm the tides4 freshness gate passes
#   8. check-tides5          confirm the tides5 freshness gate passes
#   9. check-tide-annotations  confirm each tide label matches its deck contents
#
# Scope is the actively-maintained, freshness-gated artifacts. The legacy tides /
# tides2 / tides3 bakes and the upstream MTG draft-record import are intentionally
# excluded; run those by hand when you specifically need them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  # Print the header comment block (stops at the first non-comment line).
  awk 'NR==1{next} /^[^#]/{exit} {sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
  exit 0
fi

step() {
  printf '\n\033[1m========== %s ==========\033[0m\n' "$1"
}

if [[ ! -d node_modules ]]; then
  step "Installing dependencies (node_modules is missing)"
  npm install
fi

step "1/9  setup-assets — build public/ inputs from source"
node scripts/setup-assets.mjs

step "2/9  bake-merchant-corpus — data/merchant_corpus.json"
node scripts/bake-merchant-corpus.mjs

step "3/9  bake-affinity-corpus — data/affinity_corpus.jsonc"
node scripts/bake-affinity-corpus.mjs

step "4/9  bake-tides4 — data/tides4.jsonc + markdown"
node scripts/bake-tides4.mjs

step "5/9  bake-tides5 — data/tides5.jsonc + markdown"
node scripts/bake-tides5.mjs

step "6/9  setup-assets — copy fresh artifacts into public/"
node scripts/setup-assets.mjs

step "7/9  check-tides4 — verify the freshness gate"
node scripts/check-tides4.mjs

step "8/9  check-tides5 — verify the freshness gate"
node scripts/check-tides5.mjs

step "9/9  check-tide-annotations — verify tide labels match their decks"
node scripts/check-tide-annotations.mjs

step "Done — git-tracked files changed by this run"
git status --short -- data docs || true

cat <<'EOF'

public/ bundles are gitignored and were refreshed in place.
Review and commit the data/ + docs/ changes listed above.
Deeper validation (optional, slower):
  npm run merchant-corpus-parity
  npm run affinity-corpus-parity
  npm test
EOF
