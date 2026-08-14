import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { resolveSource } from "../../runtime/localization/runtime";
import { assertLocalized } from "@trox/runtime";
import type { JourneyContent } from "../../data/journey-content";

expect.addEqualityTesters([localizedStringSourceEquality]);
import type {
  DreamAvatar,
  Dreamsign,
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { resolveArtRef } from "../../cumulus/primitives/art";
import { createDefaultState } from "../../state/journey-context";
import { MINIMAL_SITES_DATA } from "../../__test-helpers__/atlas-fixtures";
import {
  battleLabel,
  buildDreamscapeHudView,
  buildDreamscapeGuideDialogue,
  buildDreamscapeView as buildDreamscapeViewImpl,
  buildSiteModels as buildSiteModelsImpl,
  dreamscapeSceneRef,
  dreamscapeTitle,
  toQsbDreamAvatar,
  toQsbDreamsigns,
} from "./dreamscape-view-model";
import { asAtlasNodeId } from "../../types/identifiers";
import { asDreamAvatarId } from "../../types/identifiers";
import { asDreamsignId } from "../../types/identifiers";
import { asDeckEntryId } from "../../types/identifiers";
import { asSiteId } from "../../types/identifiers";
import { asCardId } from "../../types/card-identity";
import type { SiteId } from "../../types/identifiers";
import { asExplorationActionId } from "../../types/identifiers";

const buildSiteModels = (
  dreamscapeNode: DreamscapeNode,
  completionLevel: number,
  sitesData = MINIMAL_SITES_DATA,
) => buildSiteModelsImpl(dreamscapeNode, completionLevel, sitesData, 5);

const buildDreamscapeView = (
  dreamscapeNode: DreamscapeNode,
  state: JourneyState,
  sitesData = MINIMAL_SITES_DATA,
  replacementSiteId: SiteId | null = null,
) =>
  buildDreamscapeViewImpl(
    dreamscapeNode,
    assertLocalized("Fixture Dreamscape"),
    state,
    sitesData,
    5,
    replacementSiteId,
    undefined,
  );

function site(
  overrides: Partial<SiteState> & Pick<SiteState, "id" | "type">,
): SiteState {
  return { isEnhanced: false, isVisited: false, ...overrides };
}

function node(overrides: Partial<DreamscapeNode> = {}): DreamscapeNode {
  return {
    id: asAtlasNodeId("node-1"),
    layer: 0,
    indexInLayer: 0,
    dreamscapeId: "ember_wood",
    sites: [
      site({ id: asSiteId("s-purge"), type: "Purge" }),
      site({ id: asSiteId("s-draft"), type: "Draft" }),
      site({ id: asSiteId("s-battle"), type: "Battle" }),
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
  it("identifies the final boss at the last completion level", () => {
    expect(resolveSource(battleLabel(6, MINIMAL_SITES_DATA))).toBe(
      "Final Boss",
    );
    expect(resolveSource(battleLabel(0, MINIMAL_SITES_DATA))).toBe("Battle");
    expect(resolveSource(battleLabel(3, MINIMAL_SITES_DATA))).toBe("Battle");
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
        site({ id: asSiteId("s-purge"), type: "Purge", isVisited: true }),
        site({ id: asSiteId("s-draft"), type: "Draft", isVisited: true }),
        site({ id: asSiteId("s-battle"), type: "Battle" }),
      ],
    });
    const unlocked = buildSiteModels(visitedNonBattle, 0).find(
      (m) => m.isBattle,
    );
    expect(unlocked?.isLocked).toBe(false);
    expect(unlocked?.isInteractive).toBe(true);
  });

  it("carries guardian tier and draft pick count as semantic values", () => {
    const models = buildSiteModels(node(), 6);
    const battle = models.find((m) => m.isBattle);
    const draft = models.find((m) => m.type === "Draft");
    expect(resolveSource(battle!.label)).toBe("Final Boss");
    expect(resolveSource(draft!.label)).toBe("Draft 5x");
  });
});

describe("toQsbDreamAvatar", () => {
  it("returns undefined before a DreamAvatar is chosen", () => {
    expect(toQsbDreamAvatar(null)).toBeUndefined();
  });

  it("maps the DreamAvatar's title to the epithet and its imageNumber to a portrait ref", () => {
    const dreamAvatar: DreamAvatar = {
      id: asDreamAvatarId("dc-1"),
      name: "Drusus Calvus",
      title: "Triumphator",
      renderedText: "Gain 1 essence.",
      imageNumber: "0007",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 200,
    };
    const qsb = toQsbDreamAvatar(dreamAvatar);
    expect(resolveSource(qsb!.name)).toBe("Drusus Calvus");
    expect(resolveSource(qsb!.epithet!)).toBe("Triumphator");
    expect(resolveSource(qsb!.ability!)).toBe("Gain 1 essence.");
    expect(qsb?.portraitFocus).toEqual({ x: 0.42, y: 0.18 });
    expect(resolveArtRef(qsb!.portrait)).toContain("0007");
  });
});

describe("toQsbDreamsigns", () => {
  it("maps owned dreamsigns by imageName and drops those without art", () => {
    const signs: Dreamsign[] = [
      {
        id: asDreamsignId("orb"),
        name: "Dreaming Orb",
        effectDescription: "At Dawn, foresee 1.",
        imageName: "magic-ball.png",
      },
      { name: "Nameless", effectDescription: "No art." },
    ];
    const docked = toQsbDreamsigns(signs);
    expect(docked).toHaveLength(1);
    expect(docked[0]?.id).toBe("orb");
    expect(resolveSource(docked[0].name)).toBe("Dreaming Orb");
    expect(resolveSource(docked[0].effectDescription!)).toBe(
      "At Dawn, foresee 1.",
    );
    expect(docked[0]?.imageName).toBe("magic-ball.png");
  });
});

describe("dreamscapeSceneRef / dreamscapeTitle", () => {
  it("resolves the scene art from the dreamscape id and falls back to null when unrevealed", () => {
    expect(dreamscapeSceneRef(node())).not.toBeNull();
    expect(dreamscapeSceneRef(node({ dreamscapeId: null }))).toBeNull();
  });

  it("resolves canonical dreamscape names and an unrevealed fallback", () => {
    const content = {
      dreamscapes: [{ id: "ember_wood", name: "Fixture Dreamscape" }],
      atlasData: { boss: { dreamscapeId: "fixture-boss", place: "Limbo" } },
    } as unknown as JourneyContent;
    expect(resolveSource(dreamscapeTitle(node(), content))).toBe(
      "Fixture Dreamscape",
    );
    expect(resolveSource(dreamscapeTitle(node({ dreamscapeId: null }), content))).toBe(
      "An Unknown Dream",
    );
  });
});

describe("buildDreamscapeView", () => {
  it("builds first-dream guidance only after the tutorial deck modal closes", () => {
    const configuration = {
      speechBubble: {
        speaker: "mira" as const,
        delay: 2,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Visit [purple]Dream Sites[/purple].",
      },
    };
    const tutorialState = {
      isTutorialJourney: true,
      completionLevel: 0,
      hasSeenStartingDeckPopup: false,
    } as JourneyState;
    expect(
      buildDreamscapeGuideDialogue(node(), tutorialState, configuration),
    ).toBeUndefined();
    expect(
      buildDreamscapeGuideDialogue(
        node(),
        { ...tutorialState, hasSeenStartingDeckPopup: true },
        configuration,
      ),
    ).toMatchObject({
      delaySeconds: 2,
      bubbleWidth: 700,
      model: {
        speakerName: "Mira",
        text: "Visit [purple]Dream Sites[/purple].",
      },
    });
    expect(
      buildDreamscapeGuideDialogue(
        node(),
        {
          ...tutorialState,
          completionLevel: 1,
          hasSeenStartingDeckPopup: true,
        },
        configuration,
      ),
    ).toBeUndefined();
  });

  it("omits first-dream guidance when returning after a Draft visit", () => {
    const configuration = {
      speechBubble: {
        speaker: "mira" as const,
        delay: 2,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Visit [purple]Dream Sites[/purple].",
      },
    };
    const tutorialState = {
      isTutorialJourney: true,
      completionLevel: 0,
      hasSeenStartingDeckPopup: true,
    } as JourneyState;
    const returnedNode = node({
      sites: [
        site({ id: asSiteId("s-purge"), type: "Purge" }),
        site({ id: asSiteId("s-draft"), type: "Draft", isVisited: true }),
        site({ id: asSiteId("s-battle"), type: "Battle" }),
      ],
    });

    expect(
      buildDreamscapeGuideDialogue(returnedNode, tutorialState, configuration),
    ).toBeUndefined();
  });

  it("assembles the scene, placed sites, and bottom-HUD data", () => {
    const state = {
      essence: 240,
      deck: [{}, {}, {}],
      dreamAvatar: null,
      dreamsigns: [],
      completionLevel: 2,
    } as unknown as JourneyState;
    const view = buildDreamscapeView(node(), state, MINIMAL_SITES_DATA);
    expect(resolveSource(view.title)).toBe("Fixture Dreamscape");
    expect(view.sites).toHaveLength(3);
    expect(view.inlineRewards).toEqual({});
  });

  it("maps generated Essence rewards by site id for the in-place animation", () => {
    const essenceNode = node({
      sites: [site({ id: asSiteId("s-essence"), type: "Essence" })],
    });
    const state = {
      essence: 240,
      deck: [],
      dreamAvatar: null,
      dreamsigns: [],
      completionLevel: 2,
      siteRuntime: {
        "s-essence": { kind: "essence", amount: 275, accepted: false },
      },
    } as unknown as JourneyState;

    expect(
      buildDreamscapeView(essenceNode, state, MINIMAL_SITES_DATA).inlineRewards,
    ).toMatchObject({
      "s-essence": { kind: "essence", amount: 275 },
    });
  });

  it("maps generated Reward site results by site id for in-place collection", () => {
    const rewardNode = node({
      sites: [site({ id: asSiteId("s-reward"), type: "Reward" })],
    });
    const dreamsign = {
      id: asDreamsignId("dreamsign-uuid"),
      name: "Lantern in the Rain",
      effectDescription: "Your first dream each dawn costs 1 less.",
      imageName: "lantern-in-the-rain.webp",
    };
    const state = {
      essence: 240,
      deck: [],
      dreamAvatar: null,
      dreamsigns: [],
      completionLevel: 2,
      siteRuntime: {
        "s-reward": {
          kind: "reward",
          reward: { rewardType: "dreamsign", dreamsign },
          remainingDreamsignPoolIds: [],
          accepted: false,
        },
      },
    } as unknown as JourneyState;

    expect(
      buildDreamscapeView(rewardNode, state, MINIMAL_SITES_DATA).inlineRewards,
    ).toMatchObject({
      "s-reward": {
        kind: "dreamsign",
        dreamsign,
        requiresReplacement: false,
      },
    });
  });

  it("builds an at-cap Dreamsign replacement view from a Reward runtime", () => {
    const rewardNode = node({
      sites: [site({ id: asSiteId("s-reward"), type: "Reward" })],
    });
    const pendingDreamsign = {
      id: asDreamsignId("pending-dreamsign"),
      name: "Pending",
      effectDescription: "Pending effect.",
    };
    const heldDreamsign = {
      id: asDreamsignId("held-dreamsign"),
      name: "Held",
      effectDescription: "Held effect.",
    };
    const state = {
      dreamsigns: [heldDreamsign],
      maxDreamsigns: 1,
      completionLevel: 2,
      siteRuntime: {
        "s-reward": {
          kind: "reward",
          reward: { rewardType: "dreamsign", dreamsign: pendingDreamsign },
          accepted: false,
        },
      },
    } as unknown as JourneyState;

    const view = buildDreamscapeView(
      rewardNode,
      state,
      MINIMAL_SITES_DATA,
      asSiteId("s-reward"),
    );
    expect(view.inlineRewards["s-reward"]).toMatchObject({
      kind: "dreamsign",
      requiresReplacement: true,
    });
    expect(view.replacement).toMatchObject({
      incoming: { id: pendingDreamsign.id },
      held: [{ id: heldDreamsign.id }],
      capacity: 1,
    });
  });
});

describe("buildDreamscapeHudView", () => {
  it("reads essence, deck size, dreamAvatar, and dreamsigns from live state", () => {
    const state = {
      ...createDefaultState(),
      essence: 10,
      deck: [
        {
          entryId: asDeckEntryId("entry-a"),
          cardNumber: 1,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: asDeckEntryId("entry-b"),
          cardNumber: 2,
          transfiguration: null,
          isBane: false,
        },
      ],
      dreamAvatar: null,
      dreamsigns: [],
    } satisfies JourneyState;
    const hud = buildDreamscapeHudView(state);
    expect(hud.essence).toBe(10);
    expect(hud.deck).toBe(2);
    expect(hud.dreamsigns).toEqual([]);
  });

  it("holds an Exploration Essence reward out of the HUD until the site presentation completes", () => {
    const state = {
      ...createDefaultState(),
      essence: 290,
      screen: { type: "site" as const, siteId: asSiteId("exploration-site") },
      siteRuntime: {
        "exploration-site": {
          kind: "exploration" as const,
          encounterCardId: asCardId("encounter-card-id"),
          actionOffers: [],
          resolution: {
            actionId: asExplorationActionId("gain-essence"),
            gainedCardIds: [],
            gainedDreamsignIds: [],
            purgedCardIds: [],
            affectedEntryIds: [asDeckEntryId("spirit-animal-entry")],
            essenceGained: 90,
          },
        },
      },
    };

    expect(buildDreamscapeHudView(state).essence).toBe(200);
    expect(
      buildDreamscapeHudView({
        ...state,
        screen: { type: "dreamscape" as const },
      }).essence,
    ).toBe(290);
  });
});
