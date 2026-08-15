// @vitest-environment node
//
// Contract gate for disposable Cumulus materializations. Runtime-consumed
// outputs must match canonical sources byte-for-byte, while the optional
// Markdown export must remain complete and computable without committed copies.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeDocOutputs } from "./generate-cumulus-docs.mjs";
import {
  computeMetadataJson,
  METADATA_OUT_PATH,
} from "./generate-cumulus-metadata.mjs";
import {
  computeTokensSource,
  TOKENS_TS_OUT_PATH,
} from "./generate-cumulus-tokens.mjs";

describe("Cumulus materialization contracts", () => {
  it("src/cumulus/primitives/tokens.ts matches cumulus-tokens.css", () => {
    expect(readFileSync(TOKENS_TS_OUT_PATH, "utf8")).toBe(computeTokensSource());
  });

  it("src/cumulus/metadata/cumulus-metadata.json matches component sources", () => {
    expect(readFileSync(METADATA_OUT_PATH, "utf8")).toBe(computeMetadataJson());
  });

  it("computes a complete optional Markdown reference from canonical sources", () => {
    const { files, docs, dedupedTokens } = computeDocOutputs();
    expect(docs.length).toBeGreaterThan(5);
    expect(dedupedTokens.length).toBeGreaterThan(5);
    expect(files.size).toBe(docs.length + 2);
    expect(new Set(docs.map((doc) => doc.id)).size).toBe(docs.length);
  });
});
