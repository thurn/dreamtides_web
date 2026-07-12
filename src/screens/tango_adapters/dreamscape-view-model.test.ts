import { describe, expect, it } from "vitest";
import type {
  Dreamcaller,
  Dreamsign,
  DreamscapeNode,
  QuestState,
  SiteState,
} from "../../types/quest";
import { resolveArtRef } from "../../tango/primitives/art";
import {
  battleLabel,
  buildDreamscapeHudView,
  buildDreamscapeView,
  buildSiteModels,
  dreamscapeSceneRef,
  dreamscapeTitle,
  toQsbDreamcaller,
  toQsbDreamsigns,
} from "./dreamscape-view-model";

function site(overrides: Partial<SiteState> & Pick<SiteState, "id" | "type">): SiteState {
  return { isEnhanced: false, isVisited: false, ...overrides };
}

function node(overrides: Partial<DreamscapeNode> = {}): DreamscapeNode {
  return {
    id: "node-1",
    layer: 0,
    indexInLayer: 0,
    dreamscapeId: "ember_wood",
    biomeName: "Ember Wood",
    biomeColor: "",
    sites: [
      site({ id: "s-purge", type: "Purge" }),
      site({ id: "s-draft", type: "Draft" }),
      site({ id: "s-battle", type: "Battle" }),
    ],
    position: { x: 0, y: 0 },
    state: "revealed",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
    ...overrides,
  } as DreamscapeNode;
}

describe("battleLabel", () => {
  it("names the final boss at the last completion level and a plain battle otherwise", () => {
    expect(battleLabel(6)).toBe("Final Boss");
    expect(battleLabel(0)).toBe("Battle");
    expect(battleLabel(3)).toBe("Battle");
  });
});

describe("buildSiteModels", () => {
  it("places one model per site with a seeded scatter position", () => {
    const models = buildSiteModels(node(), 0);
    expect(models).toHaveLength(3);
    for (const model of models) {
      expect(model.pos.x).toBeGreaterThanOrEqual(0);
      expect(model.pos.x).toBeLessThanOrEqual(100);
      expect(model.pos.y).toBeGreaterThanOrEqual(0);
      expect(model.pos.y).toBeLessThanOrEqual(100);
    }
  });

  it("locks the guardian battle until every non-battle site is visited", () => {
    const locked = buildSiteModels(node(), 0).find((m) => m.isBattle);
    expect(locked?.isLocked).toBe(true);
    expect(locked?.isInteractive).toBe(false);

    const visitedNonBattle = node({
      sites: [
        site({ id: "s-purge", type: "Purge", isVisited: true }),
        site({ id: "s-draft", type: "Draft", isVisited: true }),
        site({ id: "s-battle", type: "Battle" }),
      ],
    });
    const unlocked = buildSiteModels(visitedNonBattle, 0).find((m) => m.isBattle);
    expect(unlocked?.isLocked).toBe(false);
    expect(unlocked?.isInteractive).toBe(true);
  });

  it("labels the guardian by tier and the draft site with its pick count", () => {
    const models = buildSiteModels(node(), 6);
    const battle = models.find((m) => m.isBattle);
    const draft = models.find((m) => m.site.type === "Draft");
    expect(battle?.label).toBe("Final Boss");
    expect(draft?.label).toMatch(/^Draft \d+x$/);
  });
});

describe("toQsbDreamcaller", () => {
  it("returns undefined before a Dreamcaller is chosen", () => {
    expect(toQsbDreamcaller(null)).toBeUndefined();
  });

  it("maps the Dreamcaller's title to the epithet and its imageNumber to a portrait ref", () => {
    const dreamcaller: Dreamcaller = {
      id: "dc-1",
      name: "Drusus Calvus",
      title: "Triumphator",
      renderedText: "Gain 1 essence.",
      imageNumber: "0007",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 200,
    };
    const qsb = toQsbDreamcaller(dreamcaller);
    expect(qsb?.name).toBe("Drusus Calvus");
    expect(qsb?.epithet).toBe("Triumphator");
    expect(qsb?.ability).toBe("Gain 1 essence.");
    expect(qsb?.portraitFocus).toEqual({ x: 0.42, y: 0.18 });
    expect(resolveArtRef(qsb!.portrait)).toContain("0007");
  });
});

describe("toQsbDreamsigns", () => {
  it("maps owned dreamsigns by imageName and drops those without art", () => {
    const signs: Dreamsign[] = [
      { id: "orb", name: "Dreaming Orb", effectDescription: "At Dawn, foresee 1.", imageName: "magic-ball.png", isBane: false },
      { name: "Nameless", effectDescription: "No art.", isBane: false },
    ];
    const docked = toQsbDreamsigns(signs);
    expect(docked).toHaveLength(1);
    expect(docked[0]?.id).toBe("orb");
    expect(docked[0]?.name).toBe("Dreaming Orb");
    expect(docked[0]?.effectDescription).toBe("At Dawn, foresee 1.");
    expect(docked[0]?.imageName).toBe("magic-ball.png");
    expect(docked[0]?.isBane).toBe(false);
  });
});

describe("dreamscapeSceneRef / dreamscapeTitle", () => {
  it("resolves the scene art from the dreamscape id and falls back to null when unrevealed", () => {
    expect(dreamscapeSceneRef(node())).not.toBeNull();
    expect(dreamscapeSceneRef(node({ dreamscapeId: null }))).toBeNull();
  });

  it("uses the biome name, or a fallback title when the dream is unrevealed", () => {
    expect(dreamscapeTitle(node())).toBe("Ember Wood");
    expect(dreamscapeTitle(node({ biomeName: "" }))).toBe("An Unknown Dream");
  });
});

describe("buildDreamscapeView", () => {
  it("assembles the scene, placed sites, and bottom-HUD data", () => {
    const state = {
      essence: 240,
      deck: [{}, {}, {}],
      dreamcaller: null,
      dreamsigns: [],
      completionLevel: 2,
    } as unknown as QuestState;
    const view = buildDreamscapeView(node(), state);
    expect(view.title).toBe("Ember Wood");
    expect(view.sites).toHaveLength(3);
  });
});

describe("buildDreamscapeHudView", () => {
  it("reads essence, deck size, dreamcaller, and dreamsigns from live state", () => {
    const state = {
      essence: 10,
      deck: [{}, {}],
      dreamcaller: null,
      dreamsigns: [],
      completionLevel: 0,
    } as unknown as QuestState;
    const hud = buildDreamscapeHudView(state);
    expect(hud.essence).toBe(10);
    expect(hud.deck).toBe(2);
    expect(hud.dreamsigns).toEqual([]);
  });
});
