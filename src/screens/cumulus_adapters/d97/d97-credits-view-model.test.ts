// D97 credits view-model rules over a synthetic manifest: every source, and
// each of its licenses and authors, reaches the view in manifest order; the
// attribution files show by file name.

import { describe, expect, it } from "vitest";
import type { D97ArtSource } from "../../../content/d97/art-sources";
import { buildD97CreditsView } from "./d97-credits-view-model";

function source(directory: string, licenses: readonly string[], authors: readonly string[], creditsFiles: readonly string[]): D97ArtSource {
  return {
    title: `title-${directory}`,
    url: `https://example.test/${directory}`,
    pin: { kind: "archive", files: [] },
    licenses,
    authors,
    creditsFiles,
    directory,
    served: [],
  };
}

const MANIFEST = [
  source("alpha", ["license-a", "license-b"], ["author-1", "author-2", "author-3"], ["alpha/files/nested/attribution-a.txt"]),
  source("beta", ["license-c"], ["author-4"], []),
  source("gamma", ["license-a", "license-d", "license-e"], ["author-5", "author-6"], ["gamma/one.txt", "gamma/two.csv"]),
];

describe("buildD97CreditsView", () => {
  it("carries every source with each of its licenses and authors, in manifest order", () => {
    const view = buildD97CreditsView(MANIFEST);
    expect(view.sources.map((entry) => entry.directory)).toEqual(MANIFEST.map((entry) => entry.directory));
    for (const [index, entry] of view.sources.entries()) {
      const expected = MANIFEST[index];
      expect(entry.title).toBe(expected?.title);
      expect(entry.url).toBe(expected?.url);
      expect(entry.licenses).toEqual(expected?.licenses);
      expect(entry.authors).toEqual(expected?.authors);
    }
  });

  it("shows each attribution file by the name it ships under", () => {
    const view = buildD97CreditsView(MANIFEST);
    expect(view.sources.map((entry) => entry.creditsFiles)).toEqual([["attribution-a.txt"], [], ["one.txt", "two.csv"]]);
  });
});
