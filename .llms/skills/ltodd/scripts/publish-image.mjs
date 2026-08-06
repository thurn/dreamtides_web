#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  buildImagePublication,
  DEFAULT_BUCKET,
} from "./ltodd-image-publisher-lib.mjs";

const CACHE_CONTROL = "public,max-age=31536000,immutable";

function usage() {
  return [
    "Usage: publish-image.mjs --file <image> --part <part> --chapter <chapter>",
    "  --slug <slug> --alt <text> --caption <text>",
    "  [--dry-run]",
    "",
    "Uploads one content-addressed LToDD screenshot and prints its Markdown.",
  ].join("\n");
}

function parseArguments(argumentsList) {
  const options = { bucket: DEFAULT_BUCKET, dryRun: false };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const key = {
      "--alt": "alt",
      "--caption": "caption",
      "--chapter": "chapter",
      "--file": "file",
      "--part": "part",
      "--slug": "slug",
    }[argument];
    if (!key) {
      throw new Error(`unknown argument: ${argument}`);
    }
    const value = argumentsList[index + 1];
    if (!value) {
      throw new Error(`${argument} requires a value`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function runGcloud(argumentsList, { quiet = false } = {}) {
  const result = spawnSync("gcloud", argumentsList, {
    encoding: "utf8",
    stdio: quiet ? "ignore" : "inherit",
  });
  if (result.error?.code === "ENOENT") {
    throw new Error("gcloud is unavailable; install the Google Cloud SDK");
  }
  return result.status === 0;
}

function ensureBucketAccess(bucket) {
  if (!runGcloud(["storage", "ls", `gs://${bucket}`], { quiet: true })) {
    throw new Error(
      `cannot access gs://${bucket}; authenticate with \`gcloud auth login\``,
    );
  }
}

export function uploadIfAbsent(publication, gcloudRunner = runGcloud) {
  const exists = gcloudRunner(
    ["storage", "objects", "describe", publication.gcsUri],
    { quiet: true },
  );
  if (exists) {
    return "existing";
  }

  const uploaded = gcloudRunner([
    "storage",
    "cp",
    `--cache-control=${CACHE_CONTROL}`,
    `--content-type=${publication.contentType}`,
    "--if-generation-match=0",
    publication.absoluteFile,
    publication.gcsUri,
  ]);
  if (!uploaded) {
    if (
      gcloudRunner(["storage", "objects", "describe", publication.gcsUri], {
        quiet: true,
      })
    ) {
      return "existing";
    }
    throw new Error(`upload failed: ${publication.gcsUri}`);
  }
  return "uploaded";
}

export async function verifyPublicImage(publication, fetchImage = fetch) {
  const response = await fetchImage(publication.url, {
    method: "HEAD",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `published image is not publicly readable (${response.status}): ${publication.url}`,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith(`${publication.contentType}`)) {
    throw new Error(
      `published image has unexpected content type '${contentType}'`,
    );
  }
}

async function main(argumentsList) {
  try {
    const options = parseArguments(argumentsList);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }

    const publication = await buildImagePublication(options);
    if (options.dryRun) {
      process.stdout.write(
        "Dry run only; no upload or public verification occurred.\n",
      );
    } else {
      ensureBucketAccess(publication.bucket);
      const uploadResult = uploadIfAbsent(publication);
      process.stdout.write(
        `${uploadResult === "uploaded" ? "Uploaded" : "Already published"} ${publication.gcsUri}\n`,
      );
      await verifyPublicImage(publication);
      process.stdout.write(`Verified ${publication.url}\n`);
    }
    process.stdout.write(
      `Image: ${publication.byteLength} bytes, ${publication.contentType}\n\n`,
    );
    process.stdout.write(`${publication.markdown}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main(process.argv.slice(2));
}
