import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_VARIANT } from "../draft/pool";
import type { ContentConfig } from "../eventlog/types";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { CARD_ROLE_DATA } from "../data/card-roles";
import { AI } from "../content/ai";
import {
  testDreamscapeArtKey,
  testDreamscapeId,
  testFoldHash,
} from "../types/test-identities";
import type { DreamscapeArtCatalog } from "../data/dreamscapes";
import {
  contentConfigFromRuntime,
  contentConfigsEqual,
  parseRuntimeConfig,
} from "./runtime-config";
import { testJourneyState } from "../testing/journey-genesis";
import type {
  DreamscapeNode,
  JourneyState,
  SiteState,
  SiteType,
} from "../types/journey";
import { screenToJourneyPath, siteTypeSlug, slugify } from "./screen-url";
import { LayerName, layerAtOrdinal } from "../types/layer-name";
import { parseSiteId, parseAtlasNodeId } from "../types/identifiers";
import { formatNumber } from "./format-number";
import { annotatedTextValue, annotateText, fillTemplate } from "./text";

describe("runtime-config", () => {
  describe("parseRuntimeConfig", () => {
    it("returns the default config when no params are present", () => {
      expect(parseRuntimeConfig("")).toEqual({
        seedOverride: null,
        enemyPolicy: AI.enginePolicy.journeyDefault,
        tutorialPlaybackSpeed: 1,
        gameId: null,
        gotoScene: null,
        explorationCardId: null,
        explorationDreamsignCount: null,
        explorationDreamsignCap: null,
        explorationStarterCount: null,
        gambleGameId: null,
      });
    });

    it("folds the card-lab parameters into its scene id, with the default variant and side", () => {
      const card = "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481";
      expect(parseRuntimeConfig(`?goto=card-lab&card=${card}&variant=amplified&as=enemy`).gotoScene).toBe(
        `card-lab:${card}:amplified:enemy`,
      );
      expect(parseRuntimeConfig(`?goto=card-lab&card=${card}`).gotoScene).toBe(`card-lab:${card}:base:player`);
    });

    describe("gambleGameId", () => {
      it("forces any implemented Gamble game by its URL value", () => {
        expect(parseRuntimeConfig("?gambleGame=three-gate").gambleGameId).toBe(
          "gravok-three-gate-wager",
        );
        expect(
          parseRuntimeConfig("?gambleGame=ladder-climb").gambleGameId,
        ).toBe("tidemark-ladder-climb");
        expect(
          parseRuntimeConfig("?gambleGame=starway-stairs").gambleGameId,
        ).toBe("starway-stairs");
        expect(
          parseRuntimeConfig("?gambleGame=four-suit-reprise").gambleGameId,
        ).toBe("four-suit-reprise");
        expect(parseRuntimeConfig("?gambleGame=blackjack").gambleGameId).toBe(
          "blackjack",
        );
      });
    });

    describe("gotoScene", () => {
      it("returns null when goto is absent or blank", () => {
        expect(parseRuntimeConfig("").gotoScene).toBeNull();
        expect(parseRuntimeConfig("?goto=").gotoScene).toBeNull();
        expect(parseRuntimeConfig("?goto=%20%20").gotoScene).toBeNull();
      });

      it("returns the trimmed, decoded scene id when goto is present", () => {
        expect(parseRuntimeConfig("?goto=atlas").gotoScene).toBe("atlas");
        expect(parseRuntimeConfig("?goto=%20atlas%20").gotoScene).toBe("atlas");
      });
    });

    describe("explorationCardId", () => {
      const cardId = "a7c4e2b1-5d83-4f09-9a16-2cb8e6d71f30";

      it("normalizes a UUID from card", () => {
        expect(
          parseRuntimeConfig(
            `?goto=exploration&card=%20${cardId.toUpperCase()}%20`,
          ).explorationCardId,
        ).toBe(cardId);
      });

      it("returns null when card is absent, blank, or not a UUID", () => {
        expect(
          parseRuntimeConfig("?goto=exploration").explorationCardId,
        ).toBeNull();
        expect(
          parseRuntimeConfig("?goto=exploration&card=%20%20").explorationCardId,
        ).toBeNull();
        expect(
          parseRuntimeConfig("?goto=exploration&card=Moonlit%20Guide")
            .explorationCardId,
        ).toBeNull();
      });
    });

    describe("Exploration Dreamsign QA counts", () => {
      it("parses bounded nonnegative integer counts and caps", () => {
        const config = parseRuntimeConfig(
          "?goto=exploration&dreamsignCount=4&dreamsignCap=12",
        );

        expect(config.explorationDreamsignCount).toBe(4);
        expect(config.explorationDreamsignCap).toBe(12);
        expect(
          parseRuntimeConfig("?dreamsignCount=0").explorationDreamsignCount,
        ).toBe(0);
      });
    });

    describe("Exploration starter-card QA count", () => {
      it("parses a bounded nonnegative integer", () => {
        expect(
          parseRuntimeConfig("?goto=exploration&starterCount=4")
            .explorationStarterCount,
        ).toBe(4);
        expect(
          parseRuntimeConfig("?goto=exploration&starterCount=0")
            .explorationStarterCount,
        ).toBe(0);
      });
    });

    describe("enemyPolicy", () => {
      it("selects the engine enemy policy with ai=random or ai=greedy", () => {
        expect(parseRuntimeConfig("?ai=random").enemyPolicy).toBe("random");
        expect(parseRuntimeConfig("?ai=greedy").enemyPolicy).toBe("greedy");
      });

      it("runs the journey default for any other value", () => {
        for (const search of ["", "?ai=1", "?ai=expert", "?ai="]) {
          expect(parseRuntimeConfig(search).enemyPolicy).toBe(AI.enginePolicy.journeyDefault);
        }
      });
    });

    describe("tutorialPlaybackSpeed", () => {
      it("parses a positive decimal multiplier", () => {
        expect(
          parseRuntimeConfig("?tutorialSpeed=4").tutorialPlaybackSpeed,
        ).toBe(4);
        expect(
          parseRuntimeConfig("?tutorialSpeed=0.5").tutorialPlaybackSpeed,
        ).toBe(0.5);
        expect(
          parseRuntimeConfig("?tutorialSpeed=.25").tutorialPlaybackSpeed,
        ).toBe(0.25);
      });
    });

    describe("seedOverride", () => {
      it("returns the parsed integer when seed is a non-negative integer", () => {
        expect(parseRuntimeConfig("?seed=42").seedOverride).toBe(42);
        expect(parseRuntimeConfig("?seed=0").seedOverride).toBe(0);
        expect(parseRuntimeConfig("?seed=12345").seedOverride).toBe(12345);
      });

      it("rejects non-numeric, negative, or empty seed values", () => {
        expect(parseRuntimeConfig("?seed=foo").seedOverride).toBeNull();
        expect(parseRuntimeConfig("?seed=-5").seedOverride).toBeNull();
        expect(parseRuntimeConfig("?seed=").seedOverride).toBeNull();
        expect(parseRuntimeConfig("?seed=1.5").seedOverride).toBeNull();
        expect(parseRuntimeConfig("?seed=1e3").seedOverride).toBeNull();
      });
    });

    describe("gameId", () => {
      it("returns a normalized game id from game", () => {
        expect(parseRuntimeConfig("?game=JourneyGame123").gameId).toBe(
          "journeygame123",
        );
      });
    });
  });

  describe("contentConfigFromRuntime", () => {
    const atlasFoldHash = testFoldHash("fixture-atlas-fold-hash");
    const sitesFoldHash = testFoldHash("fixture-sites-fold-hash");
    const draftData = draftDataFixture();
    const economyData = economyFixture();
    const opponentsData = opponentsFixture();
    const explorationFoldHash = testFoldHash("fixture-exploration-fold-hash");
    const tutorialFoldHash = testFoldHash("fixture-tutorial-fold-hash");

    it("extracts the fold-relevant slice with defaults for absent optionals", () => {
      expect(
        contentConfigFromRuntime(
          atlasFoldHash,
          sitesFoldHash,
          draftData,
          economyData,
          CONFIG_DATA_FIXTURE.gambleData,
          CONFIG_DATA_FIXTURE.transfigurationData,
          opponentsData,
          CONFIG_DATA_FIXTURE.rewardSelectionData,
          CONFIG_DATA_FIXTURE.auguryData,
          explorationFoldHash,
          tutorialFoldHash,
        ),
      ).toEqual({
        poolVariant: DEFAULT_POOL_VARIANT,
        atlasFoldHash,
        sitesFoldHash,
        draftFoldHash: draftData.foldHash,
        cardRolesFoldHash: CARD_ROLE_DATA.foldHash,
        economyFoldHash: economyData.foldHash,
        gambleFoldHash: CONFIG_DATA_FIXTURE.gambleData.foldHash,
        transfigurationFoldHash:
          CONFIG_DATA_FIXTURE.transfigurationData.foldHash,
        rewardSelectionFoldHash:
          CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
        auguryFoldHash: CONFIG_DATA_FIXTURE.auguryData.foldHash,
        explorationFoldHash,
        tutorialFoldHash,
        opponentsFoldHash: opponentsData.foldHash,
        defaultStartingEssence: economyData.journey.defaultStartingEssence,
        dreamsignCap: economyData.journey.dreamsignCap,
      });
    });

    it("pins the strategy compiled into draft data", () => {
      expect(
        contentConfigFromRuntime(
          atlasFoldHash,
          sitesFoldHash,
          draftData,
          economyData,
          CONFIG_DATA_FIXTURE.gambleData,
          CONFIG_DATA_FIXTURE.transfigurationData,
          opponentsData,
          CONFIG_DATA_FIXTURE.rewardSelectionData,
          CONFIG_DATA_FIXTURE.auguryData,
          explorationFoldHash,
          tutorialFoldHash,
        ).poolVariant,
      ).toBe("tides4");
    });
  });

  describe("contentConfigsEqual", () => {
    const economyData = economyFixture();
    const base: ContentConfig = {
      poolVariant: "tides4",
      atlasFoldHash: testFoldHash("fixture-atlas-fold-hash"),
      sitesFoldHash: testFoldHash("fixture-sites-fold-hash"),
      draftFoldHash: testFoldHash("fixture-draft-fold-hash"),
      cardRolesFoldHash: testFoldHash("fixture-card-roles-fold-hash"),
      economyFoldHash: economyData.foldHash,
      gambleFoldHash: CONFIG_DATA_FIXTURE.gambleData.foldHash,
      transfigurationFoldHash: CONFIG_DATA_FIXTURE.transfigurationData.foldHash,
      rewardSelectionFoldHash: CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
      auguryFoldHash: CONFIG_DATA_FIXTURE.auguryData.foldHash,
      explorationFoldHash: testFoldHash("fixture-exploration-fold-hash"),
      tutorialFoldHash: testFoldHash("fixture-tutorial-fold-hash"),
      opponentsFoldHash: opponentsFixture().foldHash,
      defaultStartingEssence: economyData.journey.defaultStartingEssence,
      dreamsignCap: economyData.journey.dreamsignCap,
    };

    it("is false when any single field differs", () => {
      expect(
        contentConfigsEqual(base, {
          ...base,
          atlasFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          draftFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          cardRolesFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          economyFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          gambleFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          transfigurationFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          sitesFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          rewardSelectionFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          auguryFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          explorationFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          tutorialFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, {
          ...base,
          opponentsFoldHash: testFoldHash("different"),
        }),
      ).toBe(false);
      expect(
        contentConfigsEqual(base, { ...base, defaultStartingEssence: 999 }),
      ).toBe(false);
      expect(contentConfigsEqual(base, { ...base, dreamsignCap: 999 })).toBe(
        false,
      );
    });
  });
});

describe("screen-url", () => {
  const ART_CATALOG: DreamscapeArtCatalog = {
    dreamscapes: [
      {
        id: testDreamscapeId("ember-wood"),
        artKey: testDreamscapeArtKey("ember_wood"),
      },
      {
        id: testDreamscapeId("Ember Wood"),
        artKey: testDreamscapeArtKey("ember_wood"),
      },
    ],
    atlasData: {
      boss: {
        dreamscapeId: testDreamscapeId("fixture-boss"),
        sceneArtKey: testDreamscapeArtKey("fixture_limbo"),
      },
    },
  };

  function makeSite(idSeed: string, type: SiteType): SiteState {
    return {
      id: parseSiteId(idSeed),
      type,
      isEnhanced: false,
      isVisited: false,
    };
  }

  function makeNode(
    idSeed: string,
    dreamscapeIdSeed: string | null,
    sites: SiteState[],
    layerOrdinal = 2,
  ): DreamscapeNode {
    return {
      id: parseAtlasNodeId(idSeed),
      layer: layerAtOrdinal(layerOrdinal) ?? LayerName.One,
      indexInLayer: 0,
      dreamscapeId:
        dreamscapeIdSeed === null ? null : testDreamscapeId(dreamscapeIdSeed),
      sites,
      position: { x: 0, y: 0 },
      state: "available",
      enhancedSiteType: null,
      forwardIds: [],
      backwardIds: [],
      knownDreamsignId: null,
    };
  }

  /** A default state parked in a single-node dreamscape with the given sites. */
  function stateInDreamscape(
    dreamscapeIdSeed: string | null,
    sites: SiteState[],
    nodeId = "dreamscape-3",
    layer = 2,
  ): JourneyState {
    const node = makeNode(nodeId, dreamscapeIdSeed, sites, layer);
    const base = testJourneyState();
    return {
      ...base,
      currentDreamscape: parseAtlasNodeId(nodeId),
      atlas: {
        ...base.atlas,
        layers: [[parseAtlasNodeId(nodeId)]],
        nodes: { [nodeId]: node },
        startingNodeId: parseAtlasNodeId(nodeId),
        currentNodeId: parseAtlasNodeId(nodeId),
      },
    };
  }

  describe("screenToJourneyPath", () => {
    it("maps the top-level screens", () => {
      const base = testJourneyState();
      expect(
        screenToJourneyPath(
          { ...base, screen: { type: "journeyStart" } },
          ART_CATALOG,
        ),
      ).toBe("/");
      expect(
        screenToJourneyPath(
          { ...base, screen: { type: "atlas" } },
          ART_CATALOG,
        ),
      ).toBe("/atlas");
      expect(
        screenToJourneyPath(
          { ...base, screen: { type: "journeyComplete" } },
          ART_CATALOG,
        ),
      ).toBe("/complete");
      expect(
        screenToJourneyPath(
          { ...base, screen: { type: "journeyFailed" } },
          ART_CATALOG,
        ),
      ).toBe("/failed");
    });

    it("keys the dreamscape screen by the layer and dreamscape id", () => {
      const state = stateInDreamscape("ember-wood", [], "dreamscape-3", 2);
      expect(
        screenToJourneyPath(
          { ...state, screen: { type: "dreamscape" } },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/2-ember-wood");
    });

    it("appends the site-type slug for a site screen", () => {
      const purge = makeSite("site-7", "Purge");
      const augury = makeSite("site-8", "Augury");
      const state = stateInDreamscape(
        "Ember Wood",
        [purge, augury],
        "dreamscape-3",
        2,
      );
      expect(
        screenToJourneyPath(
          {
            ...state,
            screen: { type: "site", siteId: parseSiteId("site-7") },
          },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/2-ember-wood/purge");
      expect(
        screenToJourneyPath(
          {
            ...state,
            screen: { type: "site", siteId: parseSiteId("site-8") },
          },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/2-ember-wood/augury");
    });

    it("keys the boss node by its scene art key", () => {
      const state = stateInDreamscape("fixture-boss", [], "boss", 2);
      expect(
        screenToJourneyPath(
          { ...state, screen: { type: "dreamscape" } },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/2-fixture-limbo");
    });

    it("falls back to the node id slug while identity is concealed", () => {
      const state = stateInDreamscape(null, [], "dreamscape-4", 3);
      expect(
        screenToJourneyPath(
          { ...state, screen: { type: "dreamscape" } },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/3-dreamscape-4");
    });
  });

  describe("siteTypeSlug", () => {
    it("kebab-cases camel-case site types and lowercases simple ones", () => {
      expect(siteTypeSlug("Purge")).toBe("purge");
      expect(siteTypeSlug("Augury")).toBe("augury");
      expect(siteTypeSlug("DreamsignBazaar")).toBe("dreamsign-bazaar");
      expect(siteTypeSlug("Exploration")).toBe("exploration");
    });
  });

  describe("slugify", () => {
    it("lowercases, hyphenates, and strips punctuation", () => {
      expect(slugify("Ember Wood")).toBe("ember-wood");
      expect(slugify("  The Sunken City!  ")).toBe("the-sunken-city");
    });
  });
});

describe("text", () => {
  describe("formatNumber", () => {
    it("groups thousands and keeps the shortest decimal form", () => {
      expect(formatNumber(999)).toBe("999");
      expect(formatNumber(1000)).toBe("1,000");
      expect(formatNumber(-1234567.5)).toBe("-1,234,567.5");
      expect(formatNumber(-0)).toBe("0");
    });
  });

  describe("fillTemplate", () => {
    it("fills placeholders by exact or snake_case name", () => {
      expect(
        fillTemplate("{count} of {deck_card}", { count: 1200, deckCard: "x" }),
      ).toBe("1,200 of x");
    });

    it("rejects a placeholder without a value", () => {
      expect(() => fillTemplate("{missing}")).toThrow();
    });
  });

  describe("annotateText", () => {
    it("splits annotated placeholder runs out of rendered copy", () => {
      const text = annotateText(
        (values) => `Gain ${values.card} and ${values.other}.`,
        { card: "Alpha", other: "Beta" },
        { card: 7 },
      );
      expect(text.parts).toEqual([
        { kind: "literal", value: "Gain " },
        { kind: "placeholder", name: "card", value: "Alpha", annotation: 7 },
        { kind: "literal", value: " and Beta." },
      ]);
      expect(text.annotations).toEqual({ card: 7 });
      expect(annotatedTextValue(text)).toBe("Gain Alpha and Beta.");
    });
  });
});
