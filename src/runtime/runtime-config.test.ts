import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_VARIANT } from "../draft/pool";
import type { ContentConfig } from "../eventlog/types";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { CARD_ROLE_DATA } from "../data/card-roles";
import { AI } from "../content/ai";
import { testFoldHash } from "../types/test-identities";
import {
  contentConfigFromRuntime,
  contentConfigsEqual,
  parseRuntimeConfig,
} from "./runtime-config";

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
      const stage = JSON.stringify({ enemy: { hand: [card], energy: 4 }, enemyScript: [{ kind: "challenge" }] });
      expect(parseRuntimeConfig(`?goto=card-lab&card=${card}&labStage=${encodeURIComponent(stage)}`).gotoScene).toBe(`card-lab:${card}:base:player:${encodeURIComponent(stage)}`);
    });

    it("keeps explicit dreamsign identities and rejects combined or repeated domains", () => {
      const id = "5e5e5e5e-0000-4000-8000-000000022800";
      for (const side of ["player", "enemy"]) expect(parseRuntimeConfig(`?goto=card-lab&dreamsign=${id}&as=${side}`).gotoScene).toBe(`card-lab-dreamsign:${id}:base:${side}`);
      for (const extra of [`&card=${id}`, `&avatar=${id}`, `&dreamsign=${id}`]) expect(parseRuntimeConfig(`?goto=card-lab&dreamsign=${id}${extra}`).gotoScene).toBe(`card-lab-dreamsign-ambiguous:${id}:base:player`);
    });

    it("keeps explicit avatar requests separate from card UUIDs and preserves ambiguous requests", () => {
      const uuid = "5e5e5e5e-0000-4000-8000-000000021901";
      expect(parseRuntimeConfig(`?goto=card-lab&avatar=${uuid}`).gotoScene).toBe(`card-lab-avatar:${uuid}:base:player`);
      expect(parseRuntimeConfig(`?goto=card-lab&avatar=${uuid}&as=enemy&variant=amplified`).gotoScene).toBe(`card-lab-avatar:${uuid}:amplified:enemy`);
      for (const extra of [`&card=${uuid}`, `&avatar=${uuid}`]) expect(parseRuntimeConfig(`?goto=card-lab&avatar=${uuid}${extra}`).gotoScene).toBe(`card-lab-avatar-ambiguous:${uuid}:base:player`);
      expect(parseRuntimeConfig(`?goto=card-lab&avatar=${uuid}&labStage=%7B%7D`).gotoScene).toBe(`card-lab-avatar:${uuid}:base:player:%7B%7D`);
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
