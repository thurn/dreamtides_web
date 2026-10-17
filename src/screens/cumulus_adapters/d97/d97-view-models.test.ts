// D97 view-model rules: Avatar select pages the whole roster three at a time
// in roster order and wraps; the placeholder overworld resolves the run's
// Avatar by UUID and tolerates one missing from the catalog.

import { describe, expect, it } from "vitest";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { AvatarContent } from "../../../types/content";
import { parseD97RunId, parseD97RunSeed } from "../../../types/identifiers";
import { testAvatarId } from "../../../types/test-identities";
import { d97AvatarPage, d97AvatarPageCount } from "./d97-avatar-select-view-model";
import { buildD97OverworldPlaceholderView } from "./d97-overworld-view-model";

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

describe("buildD97OverworldPlaceholderView", () => {
  const run: D97Run = {
    runId: parseD97RunId("event:1"),
    runSeed: parseD97RunSeed("seed"),
    avatarId: ROSTER[2].id,
    startedAt: "1970-01-01T00:00:00.000Z",
  };

  it("resolves the run's Avatar by UUID", () => {
    const view = buildD97OverworldPlaceholderView(run, ROSTER);
    expect(view.runId).toBe(run.runId);
    expect(view.avatar?.id).toBe(ROSTER[2].id);
    expect(view.avatar?.imageNumber).toBe(ROSTER[2].imageNumber);
  });

  it("shows no Avatar when the catalog lacks it", () => {
    expect(
      buildD97OverworldPlaceholderView(
        { ...run, avatarId: testAvatarId("missing") },
        ROSTER,
      ).avatar,
    ).toBeNull();
  });
});
