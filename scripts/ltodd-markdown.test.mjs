import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "vitest";

import { validateBook } from "../.llms/skills/ltodd/scripts/ltodd-markdown-lib.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cliPath = path.join(
  repositoryRoot,
  ".llms/skills/ltodd/scripts/format-markdown.mjs",
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
      "[Journey Flow](journey_flow.md) for the complete resolution rules.",
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
      "1. [Glossary](glossary.md) — Read this chapter when looking up canonical",
      "   Dreamtides terminology.",
      "2. [Journey Flow](journey_flow.md) — Read this chapter when implementing",
      "   the ordered decisions that advance a journey.",
      "",
    ].join("\n"),
    "journey_flow.md": [
      "# Journey Flow",
      "",
      "This chapter specifies how journey decisions advance. Read it when",
      "implementing commitment, resolution, or the transition to a destination.",
      "",
      "## Decisions advance the journey",
      "",
      "Assume an authored destination exists with one available action. Selecting",
      "the action commits the journey before its result becomes visible.",
      "",
      "<!-- ltodd-image",
      "Purpose: Show the relationship between the choice and its destination.",
      "State: Open the journey at one available destination before selection.",
      "Framing: Capture the complete play area at a desktop viewport.",
      "Details: Keep the choice, destination, and journey status visible.",
      "Alt text: One available choice beside its journey destination.",
      "Caption: The journey presents one commitment before resolution.",
      "-->",
      "",
    ].join("\n"),
  };
}

async function withBook(files, callback) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ltodd-markdown-"));
  const bookDirectory = path.join(temporaryRoot, "ltodd");
  await mkdir(bookDirectory);
  for (const [filename, source] of Object.entries(files)) {
    await writeFile(path.join(bookDirectory, filename), source, "utf8");
  }

  try {
    await callback(bookDirectory);
  } finally {
    await rm(temporaryRoot, { recursive: true });
  }
}

test("accepts a complete flat book with valid discovery metadata", async () => {
  await withBook(validFiles(), async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.files.length, 3);
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

test("reports missing catalog structure and orphan chapters", async () => {
  const files = validFiles();
  delete files["glossary.md"];
  files["index.md"] = files["index.md"].replace(
    /1\. \[Glossary\][\s\S]*?terminology\.\n/,
    "",
  );
  files["extra_chapter.md"] = [
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

test("rejects unresolved prose, fenced code, and malformed image briefs", async () => {
  const files = validFiles();
  files["journey_flow.md"] = [
    "# Journey Flow",
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
      result.errors.some((error) => error.includes("must contain 6 fields")),
    );
  });
});

test("warns about implementation leakage without failing validation", async () => {
  const files = validFiles();
  files["journey_flow.md"] = files["journey_flow.md"].replace(
    "Assume an authored destination exists with one available action. Selecting",
    "The React prototype assumes an authored destination exists. Selecting",
  );

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.deepEqual(result.errors, []);
    assert.ok(result.warnings.some((warning) => warning.includes("React")));
  });
});

test("enforces the physical chapter line cap", async () => {
  const files = validFiles();
  files["journey_flow.md"] = [
    "# Journey Flow",
    "",
    "This chapter has a valid scope paragraph followed by excessive padding.",
    ...Array.from({ length: 499 }, () => ""),
  ].join("\n");

  await withBook(files, async (bookDirectory) => {
    const result = await validateBook(bookDirectory);
    assert.ok(result.errors.some((error) => error.includes("maximum is 500")));
  });
});

test("write mode wraps prose and produces a checkable book", async () => {
  const files = validFiles();
  files["journey_flow.md"] = files["journey_flow.md"].replace(
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
      path.join(bookDirectory, "journey_flow.md"),
      "utf8",
    );
    assert.ok(
      formatted
        .trimEnd()
        .split("\n")
        .every((line) => [...line].length <= 80),
    );

    const check = spawnSync(
      process.execPath,
      [cliPath, "--check", "--book", bookDirectory],
      { encoding: "utf8" },
    );
    assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  });
});
