// D97 view-model rules: Avatar select pages the whole roster three at a time
// in roster order and wraps; the overworld HUD shows the act and its tier,
// Essence when the run has some, and the control bar with only built
// surfaces enabled; opening an overworld panel replaces the open one and
// closing returns to the world; beaten opponents lose their badge.

import { describe, expect, it } from "vitest";
import type { AvatarContent } from "../../../types/content";
import { testAvatarId } from "../../../types/test-identities";
import { d97AvatarPage, d97AvatarPageCount } from "./d97-avatar-select-view-model";
import type { D97Run } from "../../../rules/d97/d97-state";
import { parseD97CharacterId, parseDreamAnchorId } from "../../../types/identifiers";
import { beatenOpponentsText, buildD97OverworldHudView, overworldPanelReducer, withBeatenOpponents } from "./d97-overworld-view-model";

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

describe("overworldPanelReducer", () => {
  it("replaces the open panel on open and returns to the world on close", () => {
    const anchorId = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000e1");
    const conversation = overworldPanelReducer(null, { type: "open", panel: { kind: "conversation", anchorId } });
    expect(conversation).toEqual({ kind: "conversation", anchorId });
    expect(overworldPanelReducer(conversation, { type: "open", panel: { kind: "preview", anchorId } })).toEqual({ kind: "preview", anchorId });
    expect(overworldPanelReducer(conversation, { type: "close" })).toBeNull();
  });
});

describe("withBeatenOpponents", () => {
  it("drops the badge of beaten opponents only", () => {
    const beaten = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000e2");
    const standing = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000e3");
    const character = parseD97CharacterId("d9791000-0000-4000-8000-0000000000e1");
    const occupant = { character, badge: "challenger", scale: "standard", dialogue: null } as const;
    const encounters = { [beaten]: { anchorId: beaten, beaten: true }, [standing]: { anchorId: standing, beaten: false } } as unknown as D97Run["encounters"];
    const shown = withBeatenOpponents(new Map([[beaten, occupant], [standing, occupant]]), beatenOpponentsText(encounters));
    expect(shown.get(beaten)).toMatchObject({ badge: null, beaten: true });
    expect(shown.get(standing)).toBe(occupant);
  });
});
