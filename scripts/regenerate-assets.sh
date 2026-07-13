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
#    1. setup-assets         build public/ inputs from the source TOMLs + records
#    2. bake-merchant-corpus  data/merchant_corpus.json
#    3. bake-affinity-corpus  data/affinity_corpus.jsonc
#    4. bake-tides4           data/tides4.jsonc + docs/cards2/tides4_decklists.md
#    5. bake-tides5           data/tides5.jsonc + docs/cards2/tides5_decklists.md
#    6. setup-assets         copy the fresh artifacts into public/
#    7. generate-cumulus-tokens    src/cumulus/primitives/tokens.ts
#    8. generate-cumulus-metadata  src/cumulus/metadata/cumulus-metadata.json
#    9. generate-cumulus-docs   .llms/skills/cumulus/ component reference + index
#   10. check-tides4          confirm the tides4 freshness gate passes
#   11. check-tides5          confirm the tides5 freshness gate passes
#   12. check-tide-annotations  confirm each tide label matches its deck contents
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

step "1/12  setup-assets — build public/ inputs from source"
node scripts/setup-assets.mjs

step "2/12  bake-merchant-corpus — data/merchant_corpus.json"
node scripts/bake-merchant-corpus.mjs

step "3/12  bake-affinity-corpus — data/affinity_corpus.jsonc"
node scripts/bake-affinity-corpus.mjs

step "4/12  bake-tides4 — data/tides4.jsonc + markdown"
node scripts/bake-tides4.mjs

step "5/12  bake-tides5 — data/tides5.jsonc + markdown"
node scripts/bake-tides5.mjs

step "6/12  setup-assets — copy fresh artifacts into public/"
node scripts/setup-assets.mjs

step "7/12  generate-cumulus-tokens — src/cumulus/primitives/tokens.ts"
node scripts/generate-cumulus-tokens.mjs

step "8/12  generate-cumulus-metadata — src/cumulus/metadata/cumulus-metadata.json"
node scripts/generate-cumulus-metadata.mjs

step "9/12  generate-cumulus-docs — .llms/skills/cumulus component reference"
node scripts/generate-cumulus-docs.mjs

step "10/12  check-tides4 — verify the freshness gate"
node scripts/check-tides4.mjs

step "11/12  check-tides5 — verify the freshness gate"
node scripts/check-tides5.mjs

step "12/12  check-tide-annotations — verify tide labels match their decks"
node scripts/check-tide-annotations.mjs

step "Done — git-tracked files changed by this run"
git status --short -- data docs src/cumulus/primitives/tokens.ts src/cumulus/metadata/cumulus-metadata.json .llms/skills/cumulus || true

cat <<'EOF'

public/ bundles are gitignored and were refreshed in place.
Review and commit the data/ + docs/ changes listed above.
Deeper validation (optional, slower):
  npm run merchant-corpus-parity
  npm run affinity-corpus-parity
  npm test
EOF
