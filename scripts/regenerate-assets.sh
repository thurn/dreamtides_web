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
# where stable IDs, card names, reference membership, draft records, pool data,
# and Cumulus sources are unchanged. glossary.toml is imported directly by the
# runtime and has no generated bundle.
#
# The committed merchant corpus is baked from generated public inputs, while the
# gitignored public/ bundles are derived from canonical sources and generated
# TOML by setup-assets. Setup runs before and after that bake so both phases see
# current inputs.
#
# Order:
#    1. setup-assets         build public/ inputs from canonical RON + records
#    2. bake-merchant-corpus  data/merchant_corpus.json
#    3. setup-assets         copy the fresh artifacts into public/
#    4. generate-cumulus-tokens    src/cumulus/primitives/tokens.ts
#    5. generate-cumulus-metadata  src/cumulus/metadata/cumulus-metadata.json
#    6. generate-cumulus-docs   .llms/skills/cumulus/ component reference + index
#    7. trox extract/check/bundle   reports, locale rows, and runtime bundles
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

  step "2/2  Trox — extract, validate, and bundle localization"
  node scripts/trox.mjs extract
  node scripts/trox.mjs check --deny warnings
  node scripts/trox.mjs bundle --allow-missing

  step "Done — fast content regeneration complete"
  git status --short -- data || true

  cat <<'EOF'

public/ bundles are gitignored and were refreshed in place.
Use full regeneration after changes to IDs, card names, reference membership,
draft records, pool data, or Cumulus sources.
EOF
  exit 0
fi

step "1/7  setup-assets — build public/ inputs from source"
node scripts/setup-assets.mjs

step "2/7  bake-merchant-corpus — data/merchant_corpus.json"
node scripts/bake-merchant-corpus.mjs

step "3/7  setup-assets — copy fresh artifacts into public/"
node scripts/setup-assets.mjs

step "4/7  generate-cumulus-tokens — src/cumulus/primitives/tokens.ts"
node scripts/generate-cumulus-tokens.mjs

step "5/7  generate-cumulus-metadata — src/cumulus/metadata/cumulus-metadata.json"
node scripts/generate-cumulus-metadata.mjs

step "6/7  generate-cumulus-docs — .llms/skills/cumulus component reference"
node scripts/generate-cumulus-docs.mjs

step "7/7  Trox — extract, validate, and bundle localization"
node scripts/trox.mjs extract
node scripts/trox.mjs check --deny warnings
node scripts/trox.mjs bundle --allow-missing

step "Done — git-tracked files changed by this run"
git status --short -- data docs localization src/generated/localization src/cumulus/primitives/tokens.ts src/cumulus/metadata/cumulus-metadata.json .llms/skills/cumulus || true

cat <<'EOF'

public/ bundles are gitignored and were refreshed in place.
Review and commit the data/ + docs/ changes listed above.
Deeper validation (optional, slower):
  npm run merchant-corpus-parity
  npm test
EOF
