#!/usr/bin/env node
/**
 * Sends one or more screenshots to a Discord channel via an incoming webhook.
 *
 * Discord delivers up to 10 attachments in a single webhook message, so this
 * script batches the given images into groups of 10 and posts each group as its
 * own message. Every image in a batch appears as an inline attachment, which is
 * how Discord renders a "group" of screenshots side by side.
 *
 * Usage:
 *   node scripts/send-screenshots-to-discord.mjs shot1.png shot2.png ...
 *   npm run send-screenshots -- shot1.png shot2.png ...
 *
 * The webhook URL is read from (in order of precedence):
 *   1. --webhook <url>
 *   2. the DISCORD_WEBHOOK_URL environment variable
 *   3. a built-in default (the project's screenshot channel)
 *
 * Run with --help for the full flag list.
 *
 * Requires only Node 18+ (global fetch / FormData / Blob); no npm dependencies.
 */

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";

// The project's default screenshot channel. Override per-invocation with
// --webhook or the DISCORD_WEBHOOK_URL env var (either takes precedence).
const DEFAULT_WEBHOOK_URL =
  "https://discord.com/api/webhooks/REDACTED";

// Discord accepts at most 10 attachments per message.
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

// Discord's default per-request upload limit is 10 MiB (higher only on boosted
// servers). We warn rather than hard-fail so a boosted server still works.
const SOFT_REQUEST_LIMIT_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const HELP = `Send groups of screenshots to a Discord channel via webhook.

Usage:
  node scripts/send-screenshots-to-discord.mjs [options] <image> [<image> ...]
  npm run send-screenshots -- [options] <image> [<image> ...]

Arguments:
  <image>              One or more image files (png/jpg/gif/webp). Images are
                       batched into Discord messages of up to ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.

Options:
  -m, --message <str>  Text posted alongside the (first) batch of images.
  -u, --username <str> Override the webhook's display name for this post.
  -w, --webhook <url>  Discord webhook URL. Defaults to $DISCORD_WEBHOOK_URL,
                       then a built-in project default.
      --per-message    Post each batch as a separate message with its own copy
                       of --message (default: message attached to first batch).
  -n, --dry-run        Validate inputs and print the plan without sending.
  -h, --help           Show this help.

Examples:
  # Send two screenshots with a caption
  node scripts/send-screenshots-to-discord.mjs -m "New pool viewer" a.png b.png

  # Dry run to preview batching
  node scripts/send-screenshots-to-discord.mjs --dry-run *.png
`;

function parseCliArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        message: { type: "string", short: "m" },
        username: { type: "string", short: "u" },
        webhook: { type: "string", short: "w" },
        "per-message": { type: "boolean", default: false },
        "dry-run": { type: "boolean", short: "n", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (err) {
    throw new UserError(`${err.message}\n\nRun with --help for usage.`);
  }
  return parsed;
}

/** An error caused by bad user input; reported without a stack trace. */
class UserError extends Error {}

function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

/** Reads each image into memory, validating existence and type up front. */
async function loadImages(paths) {
  const images = [];
  for (const path of paths) {
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new UserError(`File not found: ${path}`);
    }
    if (!info.isFile()) {
      throw new UserError(`Not a regular file: ${path}`);
    }
    if (!(extname(path).toLowerCase() in CONTENT_TYPES)) {
      throw new UserError(
        `Unsupported image type: ${path} (expected ${Object.keys(CONTENT_TYPES).join(", ")})`,
      );
    }
    const data = await readFile(path);
    images.push({
      path,
      name: basename(path),
      contentType: contentTypeFor(path),
      size: info.size,
      data,
    });
  }
  return images;
}

/** Splits images into Discord-sized batches (<= 10 attachments each). */
function batchImages(images) {
  const batches = [];
  for (let i = 0; i < images.length; i += MAX_ATTACHMENTS_PER_MESSAGE) {
    batches.push(images.slice(i, i + MAX_ATTACHMENTS_PER_MESSAGE));
  }
  return batches;
}

/** Posts a single batch of images (with optional text) to the webhook. */
async function sendBatch(webhookUrl, batch, { content, username } = {}) {
  const form = new FormData();

  const payload = {};
  if (content) payload.content = content;
  if (username) payload.username = username;
  // attachments[] descriptors let Discord order files predictably.
  payload.attachments = batch.map((img, idx) => ({
    id: idx,
    filename: img.name,
  }));
  form.append("payload_json", JSON.stringify(payload));

  batch.forEach((img, idx) => {
    const blob = new Blob([img.data], { type: img.contentType });
    form.append(`files[${idx}]`, blob, img.name);
  });

  // wait=true makes Discord return the created message (and a 4xx body on
  // failure) instead of an opaque 204, which we surface on error.
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");

  const res = await fetch(url, { method: "POST", body: form });

  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const retryAfter = Number(body.retry_after ?? 1);
    throw new Error(
      `Rate limited by Discord; retry after ${retryAfter}s (retry_after=${body.retry_after}).`,
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord returned ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json().catch(() => ({}));
}

async function main() {
  const { values: flags, positionals } = parseCliArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }

  if (positionals.length === 0) {
    throw new UserError("No images provided.\n\nRun with --help for usage.");
  }

  const webhookUrl =
    flags.webhook ?? process.env.DISCORD_WEBHOOK_URL ?? DEFAULT_WEBHOOK_URL;
  if (!/^https:\/\/discord(app)?\.com\/api\/webhooks\//.test(webhookUrl)) {
    throw new UserError(`Not a valid Discord webhook URL: ${webhookUrl}`);
  }

  const images = await loadImages(positionals);
  const batches = batchImages(images);

  console.log(
    `Prepared ${images.length} image(s) in ${batches.length} message(s):`,
  );
  batches.forEach((batch, i) => {
    const total = batch.reduce((sum, img) => sum + img.size, 0);
    console.log(`  Message ${i + 1}: ${batch.length} attachment(s), ${humanBytes(total)}`);
    for (const img of batch) {
      console.log(`    - ${img.name} (${humanBytes(img.size)})`);
    }
    if (total > SOFT_REQUEST_LIMIT_BYTES) {
      console.warn(
        `    ! Batch exceeds Discord's default ${humanBytes(SOFT_REQUEST_LIMIT_BYTES)} limit; ` +
          `may be rejected on a non-boosted server.`,
      );
    }
  });

  if (flags["dry-run"]) {
    console.log("\nDry run: nothing sent.");
    return;
  }

  for (let i = 0; i < batches.length; i++) {
    const isFirst = i === 0;
    // By default only the first message carries the caption; --per-message
    // repeats it on every batch.
    const content =
      flags.message && (isFirst || flags["per-message"])
        ? flags.message
        : undefined;
    process.stdout.write(`Sending message ${i + 1}/${batches.length}... `);
    await sendBatch(webhookUrl, batches[i], {
      content,
      username: flags.username,
    });
    console.log("ok");
  }

  console.log(`\nDone. Sent ${images.length} image(s) to Discord.`);
}

main().catch((err) => {
  if (err instanceof UserError) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error(`Failed: ${err.message}`);
  }
  process.exit(1);
});
