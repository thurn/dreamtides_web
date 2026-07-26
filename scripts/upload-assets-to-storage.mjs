#!/usr/bin/env node
/**
 * Publishes the binary game art (card / dreamAvatar / dreamsign / atlas images)
 * to the Firebase Storage bucket that serves it in production.
 *
 * The art is intentionally kept out of git: `scripts/setup-assets.mjs` symlinks
 * it into `public/<dir>/` from the developer's `~/Documents` source folders (and
 * the image cache). The deployed site loads it from the bucket via `assetUrl()`
 * (see `src/runtime/asset-url.ts`) instead of bundling it into the Hosting
 * deploy, so this script keeps the bucket in sync with the local art.
 *
 * Run `npm run setup-assets` first so `public/` is populated, then:
 *   npm run upload-assets
 *
 * Requires the Google Cloud SDK (`gcloud`) on PATH and an authenticated account
 * with write access to the bucket (`gcloud auth login`). One-time bucket setup
 * (creation, public read, CORS) is documented in
 * docs/quest_prototype/asset-hosting.md.
 *
 * The bucket defaults to the project's Firebase Storage bucket and can be
 * overridden with the ASSET_BUCKET env var; it must match the origin in
 * `.env.production` (VITE_ASSET_BASE_URL).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");

const BUCKET =
  process.env.ASSET_BUCKET ?? "redacted-firebase-project.firebasestorage.app";

/**
 * Art directories offloaded to the bucket. Each mirrors its `public/` path so a
 * served URL (`/<dir>/<file>`) maps 1:1 to a bucket object. Keep in sync with
 * the folders routed through `assetUrl()` in the app and gitignored in
 * `.gitignore`.
 */
const ART_DIRS = [
  "cards",
  "dream-avatars",
  "dreamsigns",
  "journeys",
  "main-menu",
  "dreamscapes",
  "dreamscape-icons",
  "dream-guides",
  "atlas",
];

function preflight() {
  try {
    execFileSync("gcloud", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "gcloud not found on PATH. Install the Google Cloud SDK and run `gcloud auth login`.",
    );
  }
  try {
    execFileSync("gcloud", ["storage", "ls", `gs://${BUCKET}`], {
      stdio: "ignore",
    });
  } catch {
    throw new Error(
      `Cannot reach gs://${BUCKET}. Run \`gcloud auth login\`, select the ` +
        "project, and confirm the bucket exists (see " +
        "docs/quest_prototype/asset-hosting.md).",
    );
  }
}

function main() {
  preflight();

  // Stage real files before upload: `public/<dir>` entries are symlinks into
  // ~/Documents (and the image cache), and `gcloud storage rsync` skips
  // symlinks. `cp -RL` follows them so the staged tree holds the actual bytes.
  const staging = mkdtempSync(join(tmpdir(), "quest-assets-"));
  try {
    const present = [];
    for (const dir of ART_DIRS) {
      const src = join(PUBLIC_DIR, dir);
      if (!existsSync(src)) {
        console.warn(
          `skip ${dir}: not found in public/ (run \`npm run setup-assets\` first)`,
        );
        continue;
      }
      console.log(`staging ${dir}...`);
      execFileSync("cp", ["-RL", src, join(staging, dir)], { stdio: "inherit" });
      present.push(dir);
    }
    if (present.length === 0) {
      throw new Error(
        "No art directories found in public/. Run `npm run setup-assets` first.",
      );
    }

    console.log(
      `Uploading ${present.join(", ")} to gs://${BUCKET} (this can take a while)...`,
    );
    // rsync the staged tree to the bucket root, mirroring paths. No
    // delete-unmatched flag, so the upload is purely additive and never removes
    // an unrelated bucket object.
    //
    // `--checksums-only` compares content hashes instead of modification times.
    // The staging copy above (`cp -RL` into a fresh temp dir) stamps every file
    // with the current mtime on each run, so rsync's default mtime comparison
    // would treat all art as changed and re-upload the entire set every time.
    // Hashing local files is cheap; this makes the upload skip unchanged art and
    // only push files whose bytes actually differ from the bucket.
    execFileSync(
      "gcloud",
      [
        "storage",
        "rsync",
        "--recursive",
        "--checksums-only",
        staging,
        `gs://${BUCKET}`,
      ],
      { stdio: "inherit" },
    );
    console.log("Upload complete.");
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

main();
