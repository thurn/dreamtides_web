import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "vitest";

import { buildImagePublication } from "../.llms/skills/ltodd/scripts/ltodd-image-publisher-lib.mjs";
import { validateBook } from "../.llms/skills/ltodd/scripts/ltodd-markdown-lib.mjs";
import {
  uploadIfAbsent,
  verifyPublicImage,
} from "../.llms/skills/ltodd/scripts/publish-image.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cliPath = path.join(
  repositoryRoot,
  ".llms/skills/ltodd/scripts/format-markdown.mjs",
);
const publisherCliPath = path.join(
  repositoryRoot,
  ".llms/skills/ltodd/scripts/publish-image.mjs",
);
const measurementCliPath = path.join(
  repositoryRoot,
  ".llms/skills/ltodd/scripts/measure-chapters.mjs",
);

function validFiles() {
  return {
    "glossary.md": [
      "# Glossary",
      "",
      "This chapter defines canonical Dreamtides terms. Read it whenever a",
      "project-specific term needs a precise meaning or primary chapter.",
      "",
      "## Choice",
      "",
      "A player decision that commits the journey to one outcome. Read",
      "[Journey](journey/journey.md) for the complete resolution",
      "rules.",
      "",
      "## Journey",
      "",
      "The complete sequence of connected Dreamtides experiences.",
      "",
    ].join("\n"),
    "index.md": [
      "# Living Tome of Dreamtides Design",
      "",
      "This index defines the book's authoritative reading order.",
      "",
      "## How to read this book",
      "",
      "Choose a chapter by its scope, then follow its local links for the",
      "prerequisites and deeper systems needed by the current task.",
      "",
      "## Book reference",
      "",
      "The book-level reference defines terminology used throughout LToDD.",
      "",
      "1. [Glossary](glossary.md) — Read this chapter when looking up canonical",
      "   Dreamtides terminology.",
      "",
      "## Journey",
      "",
      "This part specifies the decisions and state that advance a journey.",
      "",
      "1. **Primary:** [Journey](journey/journey.md) — Read this chapter when",
      "   implementing",
      "   the ordered decisions that advance a journey.",
      "",
    ].join("\n"),
    "journey/journey.md": [
      "# Journey",
      "",
      "This chapter specifies how journey decisions advance. Read it when",
      "implementing commitment, resolution, or the transition to a destination.",
      "",
      "## Decisions advance the journey",
      "",
      "Assume an authored destination exists with one available action. Selecting",
      "the action commits the journey before its result becomes visible.",
      "Read the [Glossary](../glossary.md) for canonical journey terminology.",
      "",
      "![One available choice beside its destination][img-0123456789ab]",
      "",
      "_The journey presents one commitment before resolution._",
      "",
      "[img-0123456789ab]: https://storage.googleapis.com/redacted-firebase-project.firebasestorage.app/ltodd/journey/journey/available-choice-0123456789ab.png",
      "",
    ].join("\n"),
  };
}

async function withBook(files, callback) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ltodd-markdown-"));
  const bookDirectory = path.join(temporaryRoot, "ltodd");
  await mkdir(bookDirectory);
  for (const [filename, source] of Object.entries(files)) {
    const absolutePath = path.join(bookDirectory, filename);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source, "utf8");
  }

  try {
    await callback(bookDirectory);
  } finally {
    await rm(temporaryRoot, { recursive: true });
  }
}

test("accepts a part-organized book with valid discovery metadata", async () => {
  await withBook(validFiles(), async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.files.length, 3);
  });
});

test("accepts a labeled supplement after its primary chapter", async () => {
  const files = validFiles();
  files["journey/commitment.md"] = [
    "# Commitment",
    "",
    "This supplement deepens the journey commitment algorithm. Read it when",
    "implementing the exact transition from choice to durable resolution.",
    "",
    "Read [Journey](journey.md) for the complete surrounding system.",
    "",
  ].join("\n");
  files["index.md"] = files["index.md"].replace(
    "   the ordered decisions that advance a journey.\n",
    [
      "   the ordered decisions that advance a journey.",
      "2. **Supplement:** [Commitment](journey/commitment.md) — Read this",
      "   chapter when implementing commitment resolution in full detail.",
      "",
    ].join("\n"),
  );

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.deepEqual(result.errors, []);
  });
});

test("requires a matching primary chapter and correct index role", async () => {
  const files = validFiles();
  files["journey/commitment.md"] = files["journey/journey.md"]
    .replace("# Journey", "# Commitment")
    .replaceAll("/ltodd/journey/journey/", "/ltodd/journey/commitment/");
  delete files["journey/journey.md"];
  files["index.md"] = files["index.md"]
    .replace(
      "**Primary:** [Journey](journey/journey.md)",
      "**Primary:** [Commitment](journey/commitment.md)",
    )
    .replace("ordered decisions", "commitment decisions");

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(
      result.errors.some((error) =>
        error.includes("primary chapter journey/journey.md"),
      ),
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("journey/commitment.md must be labeled **Supplement:**"),
      ),
    );
  });
});

test("reports an empty book clearly", async () => {
  await withBook({}, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(
      result.errors.some((error) => error.includes("no Markdown files")),
    );
  });
});

test("reports missing catalog structure and unlisted supplements", async () => {
  const files = validFiles();
  delete files["glossary.md"];
  files["index.md"] = files["index.md"].replace(
    /1\. \[Glossary\][\s\S]*?terminology\.\n/,
    "",
  );
  files["journey/extra_chapter.md"] = [
    "# Extra Chapter",
    "",
    "This chapter has enough opening context to be structurally valid.",
    "",
  ].join("\n");

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(
      result.errors.some((error) =>
        error.includes("terminology chapter is missing"),
      ),
    );
    assert.ok(
      result.errors.some((error) => error.includes("extra_chapter.md")),
    );
  });
});

test("rejects root chapters and directories deeper than a part", async () => {
  const files = validFiles();
  files["orphan.md"] = [
    "# Orphan",
    "",
    "This chapter is incorrectly stored at the root of the book.",
    "",
  ].join("\n");
  files["journey/deeper/hidden.md"] = [
    "# Hidden",
    "",
    "This chapter is incorrectly stored below the part directory.",
    "",
  ].join("\n");

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(
      result.errors.some((error) =>
        error.includes("ordinary chapters must live in a part directory"),
      ),
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("exactly one directory deep"),
      ),
    );
  });
});

test("requires each part to have one scoped index section", async () => {
  const files = validFiles();
  files["sites/sites.md"] = [
    "# Sites",
    "",
    "This chapter specifies one site flow and when an implementer needs it.",
    "",
  ].join("\n");
  files["index.md"] = files["index.md"].replace(
    "   the ordered decisions that advance a journey.\n",
    [
      "   the ordered decisions that advance a journey.",
      "2. **Primary:** [Sites](sites/sites.md) — Read this chapter when implementing a",
      "   site visit.",
      "",
    ].join("\n"),
  );

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(
      result.errors.some((error) =>
        error.includes("mixes chapter directories"),
      ),
    );
  });
});

test("resolves chapter links relative to their part directory", async () => {
  const files = validFiles();
  files["journey/journey.md"] = files["journey/journey.md"].replace(
    "../glossary.md",
    "../missing.md",
  );

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(
      result.errors.some((error) => error.includes("broken chapter link")),
    );
  });
});

test("rejects unresolved prose, fenced code, and image-plan comments", async () => {
  const files = validFiles();
  files["journey/journey.md"] = [
    "# Journey",
    "",
    "This chapter contains a TODO that still needs a design decision.",
    "",
    "```text",
    "A code sample.",
    "```",
    "",
    "<!-- ltodd-image",
    "Purpose: Show one state.",
    "State: Show one state.",
    "-->",
    "",
  ].join("\n");

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
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

test("requires published images to use their chapter namespace and caption", async () => {
  const files = validFiles();
  files["journey/journey.md"] = files["journey/journey.md"]
    .replace(
      [
        "![One available choice beside its destination][img-0123456789ab]",
        "",
        "_The journey presents one commitment before resolution._",
      ].join("\n"),
      "![One available choice beside its destination][img-0123456789ab]",
    )
    .replace("/ltodd/journey/journey/", "/ltodd/sites/site_arrival/");

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(result.errors.some((error) => error.includes("italic caption")));
    assert.ok(
      result.errors.some((error) => error.includes("chapter namespace")),
    );
  });
});

test("builds content-addressed Markdown for a validated screenshot", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ltodd-image-"));
  const imagePath = path.join(temporaryRoot, "choice.png");
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(imagePath, onePixelPng);

  try {
    const publication = await buildImagePublication({
      alt: "One available destination before commitment",
      caption: "The destination holds focus before the player commits.",
      chapter: "journey",
      file: imagePath,
      part: "journey",
      slug: "available-destination",
    });
    assert.match(
      publication.objectName,
      /^ltodd\/journey\/journey\/available-destination-[0-9a-f]{12}\.png$/,
    );
    assert.ok(publication.markdown.includes(`![One available destination`));
    assert.ok(publication.markdown.includes(publication.url));

    const dryRun = spawnSync(
      process.execPath,
      [
        publisherCliPath,
        "--dry-run",
        "--file",
        imagePath,
        "--part",
        "journey",
        "--chapter",
        "journey",
        "--slug",
        "available-destination",
        "--alt",
        "One available destination before commitment",
        "--caption",
        "The destination holds focus before the player commits.",
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

test("publishes without overwriting existing content-addressed objects", () => {
  const publication = {
    absoluteFile: "/tmp/ltodd-choice.png",
    contentType: "image/png",
    gcsUri: "gs://example/ltodd/journey/journey/choice-abc.png",
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
    url: "https://storage.googleapis.com/example/ltodd/image.png",
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

test("warns about implementation leakage without failing validation", async () => {
  const files = validFiles();
  files["journey/journey.md"] = files["journey/journey.md"].replace(
    "Assume an authored destination exists with one available action. Selecting",
    "The React prototype assumes an authored destination exists. Selecting",
  );

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.deepEqual(result.errors, []);
    assert.ok(result.warnings.some((warning) => warning.includes("React")));
  });
});

test("enforces the Unicode chapter character cap", async () => {
  const files = validFiles();
  files["journey/journey.md"] = [
    "# Journey",
    "",
    "This chapter has a valid scope paragraph followed by excessive padding.",
    ...Array.from({ length: 600 }, () => "x".repeat(70)),
  ].join("\n");

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(
      result.errors.some((error) => error.includes("maximum is 40,000")),
    );
  });
});

test("reports chapter roles and character counts", async () => {
  await withBook(validFiles(), async (bookDirectory) => {
    const measurement = spawnSync(
      process.execPath,
      [measurementCliPath, "--book", bookDirectory],
      { encoding: "utf8" },
    );
    assert.equal(
      measurement.status,
      0,
      `${measurement.stdout}\n${measurement.stderr}`,
    );
    assert.match(measurement.stdout, /journey\/journey\.md\s+primary/);
    assert.ok(measurement.stdout.includes("Editorial target: 20,000"));
    assert.ok(measurement.stdout.includes("hard limit: 40,000"));
  });
});

test("write mode wraps prose and produces a checkable book", async () => {
  const files = validFiles();
  files["journey/journey.md"] = files["journey/journey.md"].replace(
    "Assume an authored destination exists with one available action. Selecting\n" +
      "the action commits the journey before its result becomes visible.",
    "Assume an authored destination exists with one available action. Selecting the action commits the journey before its result becomes visible and before the next destination can be considered.",
  );

  await withBook(files, async (bookDirectory) => {
    const write = spawnSync(
      process.execPath,
      [cliPath, "--write", "--book", bookDirectory],
      { encoding: "utf8" },
    );
    assert.equal(write.status, 0, `${write.stdout}\n${write.stderr}`);

    const formatted = await readFile(
      path.join(bookDirectory, "journey/journey.md"),
      "utf8",
    );
    assert.ok(
      formatted
        .trimEnd()
        .split("\n")
        .every(
          (line) =>
            [...line].length <= 80 ||
            /^(?:\[[^\]]+\]:\s*)?https?:\/\/\S+$/.test(line.trim()),
        ),
    );

    const check = spawnSync(
      process.execPath,
      [cliPath, "--check", "--book", bookDirectory],
      { encoding: "utf8" },
    );
    assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  });
});
