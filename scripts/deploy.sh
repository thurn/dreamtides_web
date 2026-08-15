#!/usr/bin/env bash
#
# Deploy everything needed to make the production site match local.
#
#   ./scripts/deploy.sh             # or: npm run deploy
#   ./scripts/deploy.sh --dry-run   # build and validate without external writes
#
# Production is served from TWO origins, and a full deploy must update both:
#
#   1. Firebase Hosting — the code, HTML, and the small version-coupled
#      `*-data.json` catalogs, built into `dist/` by `npm run build`.
#   2. Firebase Storage bucket — the large binary art (card / avatar /
#      dreamsign / atlas images), which `firebase.json` intentionally excludes
#      from the Hosting deploy. The app loads it from the bucket via `assetUrl()`
#      (see src/runtime/asset-url.ts). `npm run upload-assets` syncs it there.
#
# Deploying Hosting alone leaves newly-keyed art 404ing in the bucket (the image
# shows blank with no console error), so both steps run here unconditionally.
#
# This script deploys the CURRENT local state. Localization reports and bundles
# are generated and validated as release artifacts immediately before the build.
#
# Requirements:
#   - `.env` + `.env.production` populated (VITE_FIREBASE_* and VITE_ASSET_BASE_URL);
#     the build fails fast if they are missing.
#   - `firebase` CLI authenticated (`firebase login`).
#   - `gcloud` CLI authenticated with write access to the bucket (`gcloud auth login`);
#     see docs/journey_prototype/asset-hosting.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  # Print the header comment block (stops at the first non-comment line).
  awk 'NR==1{next} /^[^#]/{exit} {sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
  exit 0
fi

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
elif [[ -n "${1:-}" ]]; then
  printf 'Unknown argument: %s\nUsage: %s [--dry-run]\n' "$1" "$0" >&2
  exit 2
fi

step() {
  printf '\n\033[1m========== %s ==========\033[0m\n' "$1"
}

step "Installing locked dependencies"
npm ci --include=dev

step "1/5  prepare — materialize current canonical workspace data"
npm run prepare-workspace

step "2/5  localization — generate and validate release artifacts"
npm run trox:extract
npm run trox:check-artifacts -- --deny warnings
npm run trox:bundle -- --allow-missing
npm run trox:check-generated

step "3/5  build — compile + bundle code, HTML, and data catalogs into dist/"
tsc && vite build

if [[ "$DRY_RUN" == true ]]; then
  step "Dry run complete — generation and production build passed"
  exit 0
fi

step "4/5  firebase deploy — publish dist/ to Hosting"
firebase deploy --only hosting

step "5/5  upload-assets — sync binary art to the Storage bucket"
npm run upload-assets

step "Done — Hosting and the art bucket are both up to date"
cat <<'EOF'

Production now matches local. Newly-keyed art may take up to an hour to appear
behind the CDN cache (cache-control: max-age=3600); hard-refresh to bypass.
EOF
