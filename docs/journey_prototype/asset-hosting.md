# Asset hosting (binary game art)

The game's binary art — card images, dream avatar portraits, dreamsign icons,
journey scenes, and the Dream Atlas scenery — is large (~400 MB) and lives
outside git. The source files sit on the developer's machine under `~/Documents`
(plus the Shutterstock image cache); `scripts/setup-assets.mjs` symlinks them
into `public/<dir>/`, and `.gitignore` keeps those folders out of version
control.

Two origins serve this art, selected by the `VITE_ASSET_BASE_URL` env var that
`src/runtime/asset-url.ts` reads through the `assetUrl()` helper:

| Environment | `VITE_ASSET_BASE_URL` | Origin |
| --- | --- | --- |
| Local dev (`npm run dev`) | empty | Vite serves `public/<dir>/`, symlinked from `~/Documents` |
| Production (`vite build` / `vite preview`) | bucket origin (set in `.env.production`) | Firebase Storage bucket |

Only binary art routes through `assetUrl()`. The generated `*-data.json`
catalogs stay on Firebase Hosting alongside the code that fetches them — they are
small and version-coupled to the build.

## Folders served from the bucket

`cards`, `dreamAvatars`, `dreamsigns`, `journeys`, `dreamscapes`,
`dreamscape-icons`, `dream-guides`, `atlas`. Each mirrors its `public/` path, so
a served URL `/<dir>/<file>` maps 1:1 to a bucket object. These folders are
excluded from the Hosting deploy by the `ignore` list in `firebase.json`, so the
deploy bundle stays small.

The list is duplicated in three places that must stay in sync: `assetUrl()` call
sites in the app, `ART_DIRS` in `scripts/upload-assets-to-storage.mjs`, and the
`firebase.json` hosting `ignore` globs.

## Bucket

Production serves from the project's Firebase Storage bucket
`redacted-firebase-project.firebasestorage.app`, reachable at
`https://storage.googleapis.com/redacted-firebase-project.firebasestorage.app/<path>`.
The origin is set in `.env.production` (committed, not a secret).

## One-time bucket setup

Requires the Google Cloud SDK (`gcloud`) and an authenticated account with
access to the project.

```bash
gcloud auth login
gcloud config set project redacted-firebase-project

# Confirm the bucket exists (Firebase Storage must be enabled for the project;
# enable it once from the Firebase console > Build > Storage if this fails).
gcloud storage ls gs://redacted-firebase-project.firebasestorage.app

# Grant public read so the deployed game can load the art without auth.
gcloud storage buckets add-iam-policy-binding \
  gs://redacted-firebase-project.firebasestorage.app \
  --member=allUsers --role=roles/storage.objectViewer
```

CORS is not required for `<img>` loads. If a future feature fetches art via
`fetch()` or draws it to a canvas, apply a permissive read policy:

```bash
printf '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > /tmp/cors.json
gcloud storage buckets update gs://redacted-firebase-project.firebasestorage.app \
  --cors-file=/tmp/cors.json
```

## Publishing art

Keep the bucket in sync with the local art whenever the source images change:

```bash
npm run setup-assets   # populate public/ from ~/Documents
npm run upload-assets   # stage real files (dereference symlinks) and rsync to the bucket
```

The upload is additive (no delete), so an unrelated bucket object is never
removed.

## Deploy flow

```bash
npm run build           # mode=production -> .env.production sets the bucket origin
firebase deploy --only hosting
```

The Hosting bundle ships the app and the `*-data.json` catalogs; the art is
served from the bucket. Deploys work from any machine because the served art
lives in the bucket rather than depending on a local `~/Documents` copy — only a
fresh `npm run upload-assets` needs the local source.
