import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "vitest";

import { buildImagePublication } from "../.llms/skills/dda/scripts/dda-image-publisher-lib.mjs";
import { validateAnthology } from "../.llms/skills/dda/scripts/dda-markdown-lib.mjs";
import {
  uploadIfAbsent,
  verifyPublicImage,
} from "../.llms/skills/dda/scripts/publish-image.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cliPath = path.join(
  repositoryRoot,
  ".llms/skills/dda/scripts/format-markdown.mjs",
);
const measurementCliPath = path.join(
  repositoryRoot,
  ".llms/skills/dda/scripts/measure-essays.mjs",
);
const publisherCliPath = path.join(
  repositoryRoot,
  ".llms/skills/dda/scripts/publish-image.mjs",
);

function validFiles() {
  return {
    "index.md": [
      "# Dreamtides Design Anthology",
      "",
      "DDA is a selective collection of essays about difficult Dreamtides",
      "design problems. Each essay stands alone at its chosen scope.",
      "",
      "## Essays",
      "",
      "1. [Offer pairing](offer_pairing.md) — Read this essay when",
      "   implementing the offer-pairing algorithm or reasoning about its",
      "   results.",
      "",
    ].join("\n"),
    "offer_pairing.md": [
      "# Offer pairing",
      "",
      "An Exploration offer pairs two choices that fit the current journey in",
      "different ways. The pairing algorithm compares their costs and outcomes",
      "without reducing every choice to the same kind of reward.",
      "",
      "## Choose distinct outcomes",
      "",
      "The algorithm selects two eligible outcomes whose consequences remain",
      "distinct after their targets are resolved.",
      "",
      "![Two distinct choices awaiting selection][img-0123456789ab]",
      "",
      "_The paired choices expose different costs and outcomes._",
      "",
      "[img-0123456789ab]: https://storage.googleapis.com/redacted-firebase-project.firebasestorage.app/dda/offer_pairing/paired-choices-0123456789ab.png",
      "",
    ].join("\n"),
  };
}

async function withAnthology(files, callback) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "dda-markdown-"));
  const anthologyDirectory = path.join(temporaryRoot, "dda");
  await mkdir(anthologyDirectory);
  for (const [filename, source] of Object.entries(files)) {
    const absolutePath = path.join(anthologyDirectory, filename);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source, "utf8");
  }

  try {
    await callback(anthologyDirectory);
  } finally {
    await rm(temporaryRoot, { recursive: true });
  }
}

test("accepts a flat anthology with a discovery index", async () => {
  await withAnthology(validFiles(), async (anthologyDirectory) => {
    const result = await validateAnthology(anthologyDirectory);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.files.length, 2);
  });
});

test("requires every essay to appear once in the flat index", async () => {
  const files = validFiles();
  files["identity_boundary.md"] = [
    "# Identity boundary",
    "",
    "A persistent card and a battle card have different lifetimes. This essay",
    "defines the state that crosses that boundary.",
    "",
  ].join("\n");

  await withAnthology(files, async (anthologyDirectory) => {
    const result = await validateAnthology(anthologyDirectory);
    assert.ok(
      result.errors.some((error) =>
        error.includes("missing essay entry for identity_boundary.md"),
      ),
    );
  });
});

test("rejects grouped indexes, nested essays, and non-Markdown files", async () => {
  const files = validFiles();
  files["index.md"] = files["index.md"].replace(
    "## Essays",
    "## Algorithms\n\nA category that makes the catalog hierarchical.",
  );
  files["systems/identity.md"] = [
    "# Identity",
    "",
    "This essay is incorrectly nested beneath a category directory.",
    "",
  ].join("\n");
  files["notes.txt"] = "not Markdown\n";

  await withAnthology(files, async (anthologyDirectory) => {
    const result = await validateAnthology(anthologyDirectory);
    assert.ok(
      result.errors.some((error) =>
        error.includes("one flat '## Essays' section"),
      ),
    );
    assert.ok(result.errors.some((error) => error.includes("subdirectories")));
    assert.ok(
      result.errors.some((error) => error.includes("contains Markdown only")),
    );
  });
});

test("requires matching titles and useful index scope", async () => {
  const files = validFiles();
  files["index.md"] = files["index.md"]
    .replace("[Offer pairing]", "[Pairing]")
    .replace("Read this essay when", "A reference for");

  await withAnthology(files, async (anthologyDirectory) => {
    const result = await validateAnthology(anthologyDirectory);
    assert.ok(
      result.errors.some((error) => error.includes("must answer 'when should")),
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("title for offer_pairing.md must be 'Offer pairing'"),
      ),
    );
  });
});

test("resolves essay links within the anthology root", async () => {
  const files = validFiles();
  files["offer_pairing.md"] = files["offer_pairing.md"].replace(
    "## Choose distinct outcomes",
    "Read [Missing essay](missing.md).\n\n## Choose distinct outcomes",
  );

  await withAnthology(files, async (anthologyDirectory) => {
    const result = await validateAnthology(anthologyDirectory);
    assert.ok(
      result.errors.some((error) =>
        error.includes("broken or non-flat essay link"),
      ),
    );
  });
});

test("rejects unresolved prose, fenced code, and image-plan comments", async () => {
  const files = validFiles();
  files["offer_pairing.md"] = [
    "# Offer pairing",
    "",
    "This essay contains a TODO that still needs a design decision.",
    "",
    "```text",
    "A code sample.",
    "```",
    "",
    "<!-- dda-image",
    "Purpose: Show one state.",
    "-->",
    "",
  ].join("\n");

  await withAnthology(files, async (anthologyDirectory) => {
    const result = await validateAnthology(anthologyDirectory);
    assert.ok(
      result.errors.some((error) => error.includes("unresolved placeholder")),
    );
    assert.ok(result.errors.some((error) => error.includes("fenced code")));
    assert.ok(
      result.errors.some((error) =>
        error.includes("image-plan comments are not allowed"),
      ),
    );
  });
});

test("requires images to use their essay namespace and caption", async () => {
  const files = validFiles();
  files["offer_pairing.md"] = files["offer_pairing.md"]
    .replace(
      [
        "![Two distinct choices awaiting selection][img-0123456789ab]",
        "",
        "_The paired choices expose different costs and outcomes._",
      ].join("\n"),
      "![Two distinct choices awaiting selection][img-0123456789ab]",
    )
    .replace("/dda/offer_pairing/", "/dda/identity_boundary/");

  await withAnthology(files, async (anthologyDirectory) => {
    const result = await validateAnthology(anthologyDirectory);
    assert.ok(result.errors.some((error) => error.includes("italic caption")));
    assert.ok(result.errors.some((error) => error.includes("essay namespace")));
  });
});

test("builds content-addressed Markdown for a DDA screenshot", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "dda-image-"));
  const imagePath = path.join(temporaryRoot, "choices.png");
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(imagePath, onePixelPng);

  try {
    const publication = await buildImagePublication({
      alt: "Two distinct choices awaiting selection",
      caption: "The choices expose different costs and outcomes.",
      essay: "offer_pairing",
      file: imagePath,
      slug: "paired-choices",
    });
    assert.match(
      publication.objectName,
      /^dda\/offer_pairing\/paired-choices-[0-9a-f]{12}\.png$/,
    );
    assert.ok(publication.markdown.includes(publication.url));

    const dryRun = spawnSync(
      process.execPath,
      [
        publisherCliPath,
        "--dry-run",
        "--file",
        imagePath,
        "--essay",
        "offer_pairing",
        "--slug",
        "paired-choices",
        "--alt",
        "Two distinct choices awaiting selection",
        "--caption",
        "The choices expose different costs and outcomes.",
      ],
      { encoding: "utf8" },
    );
    assert.equal(dryRun.status, 0, `${dryRun.stdout}\n${dryRun.stderr}`);
    assert.ok(dryRun.stdout.includes("Dry run only"));
    assert.ok(dryRun.stdout.includes(publication.url));
  } finally {
    await rm(temporaryRoot, { recursive: true });
  }
});

test("publishes without overwriting content-addressed objects", () => {
  const publication = {
    absoluteFile: "/tmp/dda-choices.png",
    contentType: "image/png",
    gcsUri: "gs://example/dda/offer_pairing/choices-abc.png",
  };

  const existingCalls = [];
  const existing = uploadIfAbsent(publication, (argumentsList, options) => {
    existingCalls.push({ argumentsList, options });
    return true;
  });
  assert.equal(existing, "existing");
  assert.equal(existingCalls.length, 1);
  assert.deepEqual(existingCalls[0].argumentsList.slice(0, 3), [
    "storage",
    "objects",
    "describe",
  ]);

  const uploadCalls = [];
  const uploadOutcomes = [false, true];
  const uploaded = uploadIfAbsent(publication, (argumentsList, options) => {
    uploadCalls.push({ argumentsList, options });
    return uploadOutcomes.shift();
  });
  assert.equal(uploaded, "uploaded");
  assert.ok(uploadCalls[1].argumentsList.includes("--if-generation-match=0"));
  assert.ok(
    uploadCalls[1].argumentsList.includes(
      "--cache-control=public,max-age=31536000,immutable",
    ),
  );

  const raceOutcomes = [false, false, true];
  assert.equal(
    uploadIfAbsent(publication, () => raceOutcomes.shift()),
    "existing",
  );

  const failureOutcomes = [false, false, false];
  assert.throws(
    () => uploadIfAbsent(publication, () => failureOutcomes.shift()),
    /upload failed/,
  );
});

test("verifies that a published image is publicly readable", async () => {
  const publication = {
    contentType: "image/png",
    url: "https://storage.googleapis.com/example/dda/choices.png",
  };
  let requested;
  await verifyPublicImage(publication, async (url, options) => {
    requested = { options, url };
    return {
      headers: { get: () => "image/png" },
      ok: true,
      status: 200,
    };
  });
  assert.equal(requested.url, publication.url);
  assert.equal(requested.options.method, "HEAD");
  assert.ok(requested.options.signal instanceof AbortSignal);

  await assert.rejects(
    verifyPublicImage(publication, async () => ({
      headers: { get: () => "application/xml" },
      ok: false,
      status: 403,
    })),
    /not publicly readable/,
  );
  await assert.rejects(
    verifyPublicImage(publication, async () => ({
      headers: { get: () => "text/html" },
      ok: true,
      status: 200,
    })),
    /unexpected content type/,
  );
});

test("warns about implementation leakage without failing", async () => {
  const files = validFiles();
  files["offer_pairing.md"] = files["offer_pairing.md"].replace(
    "An Exploration offer pairs two choices",
    "The React prototype pairs two choices",
  );

  await withAnthology(files, async (anthologyDirectory) => {
    const result = await validateAnthology(anthologyDirectory);
    assert.deepEqual(result.errors, []);
    assert.ok(result.warnings.some((warning) => warning.includes("React")));
  });
});

test("format and measurement CLIs operate on a flat anthology", async () => {
  await withAnthology(validFiles(), async (anthologyDirectory) => {
    const writeResult = spawnSync(
      process.execPath,
      [cliPath, "--write", "--anthology", anthologyDirectory],
      { encoding: "utf8" },
    );
    assert.equal(
      writeResult.status,
      0,
      `${writeResult.stdout}\n${writeResult.stderr}`,
    );

    const formatResult = spawnSync(
      process.execPath,
      [cliPath, "--check", "--anthology", anthologyDirectory],
      { encoding: "utf8" },
    );
    assert.equal(
      formatResult.status,
      0,
      `${formatResult.stdout}\n${formatResult.stderr}`,
    );
    assert.ok(formatResult.stdout.includes("DDA Markdown checked"));

    const measurementResult = spawnSync(
      process.execPath,
      [measurementCliPath, "--anthology", anthologyDirectory],
      { encoding: "utf8" },
    );
    assert.equal(
      measurementResult.status,
      0,
      `${measurementResult.stdout}\n${measurementResult.stderr}`,
    );
    assert.ok(measurementResult.stdout.includes("offer_pairing.md"));
    assert.ok(!measurementResult.stdout.includes("index.md"));
  });
});
