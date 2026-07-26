#!/usr/bin/env bash
#
# Deploy everything needed to make the production site match local.
#
#   ./scripts/deploy.sh        # or: npm run deploy
#
# Production is served from TWO origins, and a full deploy must update both:
#
#   1. Firebase Hosting — the code, HTML, and the small version-coupled
#      `*-data.json` catalogs, built into `dist/` by `npm run build`.
#   2. Firebase Storage bucket — the large binary art (card / dreamAvatar /
#      dreamsign / atlas images), which `firebase.json` intentionally excludes
#      from the Hosting deploy. The app loads it from the bucket via `assetUrl()`
#      (see src/runtime/asset-url.ts). `npm run upload-assets` syncs it there.
#
# Deploying Hosting alone leaves newly-keyed art 404ing in the bucket (the image
# shows blank with no console error), so both steps run here unconditionally.
#
# This script deploys the CURRENT local state. If you have changed TOML game data
# and need to re-bake the committed artifacts first, run `npm run regenerate-assets`
# (and commit the result) before deploying.
#
# Requirements:
#   - `.env` + `.env.production` populated (VITE_FIREBASE_* and VITE_ASSET_BASE_URL);
#     the build fails fast if they are missing.
#   - `firebase` CLI authenticated (`firebase login`).
#   - `gcloud` CLI authenticated with write access to the bucket (`gcloud auth login`);
#     see docs/quest_prototype/asset-hosting.md.
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

step "1/3  build — compile + bundle code, HTML, and data catalogs into dist/"
npm run build

step "2/3  firebase deploy — publish dist/ to Hosting"
firebase deploy --only hosting

step "3/3  upload-assets — sync binary art to the Storage bucket"
npm run upload-assets

step "Done — Hosting and the art bucket are both up to date"
cat <<'EOF'

Production now matches local. Newly-keyed art may take up to an hour to appear
behind the CDN cache (cache-control: max-age=3600); hard-refresh to bypass.
EOF
