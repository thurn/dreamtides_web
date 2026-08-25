// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import { isTroxLocalizationInput } from "./trox-vite-plugin";

const rootDir = path.resolve("/quest");

describe("Trox development bundle inputs", () => {
  it("ignores internal card metadata changed by checkbox tagging", () => {
    expect(
      isTroxLocalizationInput(
        rootDir,
        path.join(rootDir, "data", "internal", "internal_card_metadata.ron"),
      ),
    ).toBe(false);
  });

  it("refreshes for canonical player-facing RON and TypeScript sources", () => {
    expect(
      isTroxLocalizationInput(rootDir, path.join(rootDir, "data", "cards.ron")),
    ).toBe(true);
    expect(
      isTroxLocalizationInput(
        rootDir,
        path.join(rootDir, "src", "cumulus", "screens", "DraftScreen.tsx"),
      ),
    ).toBe(true);
  });
});
