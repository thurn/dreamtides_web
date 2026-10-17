// D97 view-model rules: Avatar select pages the whole roster three at a time
// in roster order and wraps; the overworld HUD shows the act and its tier,
// Essence when the run has some, and the control bar with only built
// surfaces enabled.

import { describe, expect, it } from "vitest";
import type { AvatarContent } from "../../../types/content";
import { testAvatarId } from "../../../types/test-identities";
import { d97AvatarPage, d97AvatarPageCount } from "./d97-avatar-select-view-model";
import { buildD97OverworldHudView } from "./d97-overworld-view-model";

function avatar(seed: string): AvatarContent {
  return {
    id: testAvatarId(seed),
    name: `Name ${seed}`,
    title: `Title ${seed}`,
    renderedText: `Ability ${seed}`,
    imageNumber: "1",
  } as AvatarContent;
}

const ROSTER = ["a", "b", "c", "d", "e", "f", "g"].map(avatar);

describe("d97AvatarPage", () => {
  it("covers every roster Avatar exactly once across its pages, in order", () => {
    const count = d97AvatarPageCount(ROSTER);
    const pages = Array.from({ length: count }, (_, page) =>
      d97AvatarPage(ROSTER, page),
    );
    expect(pages.flat().map((entry) => entry.id)).toEqual(
      ROSTER.map((entry) => entry.id),
    );
    expect(pages.every((page) => page.length > 0 && page.length <= 3)).toBe(true);
  });

  it("wraps past the last page and keeps one page for an empty roster", () => {
    const count = d97AvatarPageCount(ROSTER);
    expect(d97AvatarPage(ROSTER, count)).toEqual(d97AvatarPage(ROSTER, 0));
    expect(d97AvatarPageCount([])).toBe(1);
    expect(d97AvatarPage([], 0)).toEqual([]);
  });
});

describe("buildD97OverworldHudView", () => {
  it("lists every control once, enabling only built surfaces", () => {
    const view = buildD97OverworldHudView({ act: 2, actTiers: [4, 7], essence: 30, enabled: new Set(["menu"]) });
    expect(view.controls.map((control) => [control.id, control.enabled])).toEqual([
      ["deck", false],
      ["quests", false],
      ["menu", true],
    ]);
    expect(view.essence).toBe(30);
    expect(view.actLabel).toContain("2");
    expect(view.tierLabel).toContain("7");
  });

  it("passes through a missing Essence", () => {
    expect(buildD97OverworldHudView({ act: 1, actTiers: [4], essence: null, enabled: new Set() }).essence).toBeNull();
  });
});
