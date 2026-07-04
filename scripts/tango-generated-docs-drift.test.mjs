// @vitest-environment node
//
// Freshness gate for the generated Tango artifacts, mirroring the
// generated-card-data-drift pattern: each test recomputes an artifact from its
// live sources (component prop JSDoc, demo entries, the token stylesheet) and
// compares it byte-for-byte against the committed file. Editing a component,
// demo, or token without running the matching generator fails the build here
// instead of shipping stale agent-facing docs — the docs in
// .llms/skills/tango/ are what coding agents build screens from, so silent
// staleness turns directly into wrong code.
//
// Everything recomputes deterministically from committed sources, so these
// tests never depend on design-data VALUES — they only assert "committed ==
// regenerated".

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeMetadataJson,
  METADATA_OUT_PATH,
} from "./generate-tango-metadata.mjs";
import {
  computeDocOutputs,
  DOC_OUTPUT_PATHS,
} from "./generate-tango-docs.mjs";
import {
  computeTokensSource,
  TOKENS_TS_OUT_PATH,
} from "./generate-tango-tokens.mjs";

const REGENERATE =
  "regenerate with `npm run tango-metadata && npm run tango-docs` (or `npm run regenerate-assets`) and commit the result";

describe("tango generated artifacts are fresh", () => {
  it("tango-metadata.json matches the component sources", () => {
    const committed = readFileSync(METADATA_OUT_PATH, "utf8");
    expect(committed, `stale ${METADATA_OUT_PATH} — ${REGENERATE}`).toBe(
      computeMetadataJson(),
    );
  });

  it("src/tango/primitives/tokens.ts matches tango-tokens.css", () => {
    const committed = readFileSync(TOKENS_TS_OUT_PATH, "utf8");
    expect(
      committed,
      `stale ${TOKENS_TS_OUT_PATH} — regenerate with \`npm run tango-tokens\` and commit`,
    ).toBe(computeTokensSource());
  });

  it("every generated skill doc matches its sources", () => {
    const { files } = computeDocOutputs();
    expect(files.size).toBeGreaterThan(5); // anti-vacuity guard
    for (const [path, content] of files) {
      const committed = readFileSync(path, "utf8");
      expect(committed, `stale ${relative(".", path)} — ${REGENERATE}`).toBe(
        content,
      );
    }
  });

  it("no stale component reference file survives in the skill", () => {
    const { files } = computeDocOutputs();
    for (const existing of readdirSync(DOC_OUTPUT_PATHS.componentsDir)) {
      if (!existing.endsWith(".md")) continue;
      const full = join(DOC_OUTPUT_PATHS.componentsDir, existing);
      expect(
        files.has(full),
        `${existing} is not produced by the generator (renamed or unregistered component) — ${REGENERATE}`,
      ).toBe(true);
    }
  });
});
