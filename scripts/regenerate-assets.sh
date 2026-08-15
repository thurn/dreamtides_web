#!/usr/bin/env bash
#
# Regenerate canonical assets in one command.
#
#   ./scripts/regenerate-assets.sh          # full regeneration
#   ./scripts/regenerate-assets.sh --fast   # routine RON content changes
#
# Fast mode refreshes the runtime public/ bundles from canonical RON and
# generated compatibility TOML plus
# existing committed data. Use it for player-facing copy or balance changes
# where stable IDs, card names, reference membership, pool data,
# and Cumulus sources are unchanged. glossary.toml is imported directly by the
# runtime and has no generated bundle.
#
# Order:
#    1. setup-assets              build public/ inputs from canonical RON
#    2. generate-cumulus-tokens   src/cumulus/primitives/tokens.ts
#    3. generate-cumulus-metadata src/cumulus/metadata/cumulus-metadata.json
#    4. generate-cumulus-docs     .llms/skills/cumulus/ component reference + index
#    5. generate runtime-template adapters; Trox reports and bundles are
#       release artifacts and are validated separately by `npm run trox:release`
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAST=false
for argument in "$@"; do
  case "$argument" in
    --fast)
      FAST=true
      ;;
    -h|--help)
      # Print the header comment block (stops at the first non-comment line).
      awk 'NR==1{next} /^[^#]/{exit} {sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$argument" >&2
      printf 'Usage: %s [--fast]\n' "$0" >&2
      exit 2
      ;;
  esac
done

step() {
  printf '\n\033[1m========== %s ==========\033[0m\n' "$1"
}

if [[ ! -d node_modules ]]; then
  step "Installing dependencies (node_modules is missing)"
  npm install
fi

if [[ "$FAST" == true ]]; then
  step "1/2  setup-assets — refresh runtime bundles from RON content"
  node scripts/setup-assets.mjs

  step "2/2  localized runtime templates"
  node scripts/generate-localized-runtime-templates.mjs

  step "Done — fast content regeneration complete"
  git status --short -- data || true

  cat <<'EOF'

public/ bundles are gitignored and were refreshed in place.
Use full regeneration after changes to IDs, card names, reference membership,
pool data or Cumulus sources.
EOF
  exit 0
fi

step "1/5  setup-assets — build public/ inputs from source"
node scripts/setup-assets.mjs

step "2/5  generate-cumulus-tokens — src/cumulus/primitives/tokens.ts"
node scripts/generate-cumulus-tokens.mjs

step "3/5  generate-cumulus-metadata — src/cumulus/metadata/cumulus-metadata.json"
node scripts/generate-cumulus-metadata.mjs

step "4/5  generate-cumulus-docs — .llms/skills/cumulus component reference"
node scripts/generate-cumulus-docs.mjs

step "5/5  localized runtime templates"
node scripts/generate-localized-runtime-templates.mjs

step "Done — git-tracked files changed by this run"
git status --short -- data docs localization src/runtime/localization/runtime-templates.generated.ts src/cumulus/primitives/tokens.ts src/cumulus/metadata/cumulus-metadata.json .llms/skills/cumulus || true

cat <<'EOF'

public/ bundles are gitignored and were refreshed in place.
Review and commit the data/ + docs/ changes listed above.
Deeper validation (optional, slower): npm test
EOF
