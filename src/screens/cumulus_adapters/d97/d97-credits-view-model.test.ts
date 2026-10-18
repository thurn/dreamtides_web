// D97 credits view-model rules over a synthetic manifest: every source, and
// each of its licenses and authors, reaches the view in manifest order; the
// attribution files show by file name; generated character credits replace
// the character generator's catalog authors and licenses, and only its.

import { describe, expect, it } from "vitest";
import type { D97ArtSource } from "../../../content/d97/art-sources";
import { CHARACTER_CREDITS_FORMAT, CHARACTER_GENERATOR_DIRECTORY, type CharacterCredits } from "../../../d97/overworld/characters/credits";
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

const WITH_GENERATOR = [...MANIFEST, source(CHARACTER_GENERATOR_DIRECTORY, ["license-x"], ["summary"], [`${CHARACTER_GENERATOR_DIRECTORY}/CREDITS.csv`])];

const CHARACTER_CREDITS: CharacterCredits = {
  format: CHARACTER_CREDITS_FORMAT,
  authors: ["part-author-1", "part-author-2"],
  licenses: ["part-license-1"],
  urls: ["https://example.test/part"],
  sheets: 3,
  unmatched: [],
};

describe("buildD97CreditsView", () => {
  it("carries every source with each of its licenses and authors, in manifest order", () => {
    const view = buildD97CreditsView(MANIFEST, null);
    expect(view.sources.map((entry) => entry.directory)).toEqual(MANIFEST.map((entry) => entry.directory));
    for (const [index, entry] of view.sources.entries()) {
      const expected = MANIFEST[index];
      expect(entry.title).toBe(expected?.title);
      expect(entry.url).toBe(expected?.url);
      expect(entry.licenses).toEqual(expected?.licenses);
      expect(entry.authors).toEqual(expected?.authors);
      expect(entry.creditsFrom).toBe("catalog");
    }
  });

  it("shows each attribution file by the name it ships under", () => {
    const view = buildD97CreditsView(MANIFEST, null);
    expect(view.sources.map((entry) => entry.creditsFiles)).toEqual([["attribution-a.txt"], [], ["one.txt", "two.csv"]]);
  });

  it("lists the generated per-part authors and licenses under the character generator only", () => {
    const view = buildD97CreditsView(WITH_GENERATOR, CHARACTER_CREDITS);
    const generator = view.sources.find((entry) => entry.directory === CHARACTER_GENERATOR_DIRECTORY);
    expect(generator?.authors).toEqual(CHARACTER_CREDITS.authors);
    expect(generator?.licenses).toEqual(CHARACTER_CREDITS.licenses);
    expect(generator?.creditsFrom).toBe("parts");
    expect(generator?.creditsFiles).toEqual(["CREDITS.csv"]);
    for (const [index, entry] of view.sources.slice(0, MANIFEST.length).entries()) {
      expect(entry.authors).toEqual(MANIFEST[index]?.authors);
      expect(entry.creditsFrom).toBe("catalog");
    }
  });

  it("keeps the generator's catalog summary without generated credits", () => {
    const generator = buildD97CreditsView(WITH_GENERATOR, null).sources.find((entry) => entry.directory === CHARACTER_GENERATOR_DIRECTORY);
    expect(generator?.authors).toEqual(["summary"]);
    expect(generator?.licenses).toEqual(["license-x"]);
    expect(generator?.creditsFrom).toBe("catalog");
  });
});
