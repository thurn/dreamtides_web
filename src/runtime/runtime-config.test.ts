import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_VARIANT } from "../draft/pool";
import type { ContentConfig } from "../eventlog/types";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { CARD_ROLE_DATA } from "../data/card-roles";
import {
  contentConfigFromRuntime,
  contentConfigsEqual,
  parseRuntimeConfig,
  removeUiParamFromSearch,
} from "./runtime-config";

describe("parseRuntimeConfig", () => {
  it("returns the default config when no params are present", () => {
    expect(parseRuntimeConfig("")).toEqual({
      seedOverride: null,
      aiMode: false,
      tutorialPlaybackSpeed: 1,
      gameId: null,
      databaseMode: "emulator",
      loadJourneyName: null,
      gotoScene: null,
      explorationCardId: null,
      explorationDreamsignCount: null,
      explorationDreamsignCap: null,
      explorationStarterCount: null,
      viewLogs: null,
      gambleGameId: null,
    });
  });

  describe("gambleGameId", () => {
    it("forces any implemented Gamble game by its URL value", () => {
      expect(parseRuntimeConfig("?gambleGame=three-gate").gambleGameId).toBe(
        "gravok-three-gate-wager",
      );
      expect(parseRuntimeConfig("?gambleGame=ladder-climb").gambleGameId).toBe(
        "tidemark-ladder-climb",
      );
      expect(
        parseRuntimeConfig("?gambleGame=starway-stairs").gambleGameId,
      ).toBe("starway-stairs");
      expect(
        parseRuntimeConfig("?gambleGame=four-suit-reprise").gambleGameId,
      ).toBe("four-suit-reprise");
      expect(
        parseRuntimeConfig("?gambleGame=blackjack").gambleGameId,
      ).toBe("blackjack");
    });

    it("uses random selection for absent or unrecognized values", () => {
      expect(parseRuntimeConfig("").gambleGameId).toBeNull();
      expect(parseRuntimeConfig("?gambleGame=").gambleGameId).toBeNull();
      expect(
        parseRuntimeConfig("?gambleGame=progressive-draw").gambleGameId,
      ).toBeNull();
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
      expect(parseRuntimeConfig("?dreamsignCount=0").explorationDreamsignCount).toBe(
        0,
      );
    });

    it.each([
      "",
      "-1",
      "1.5",
      "1e2",
      "101",
      "not-a-count",
    ])("rejects an invalid QA Dreamsign integer %j", (value) => {
      const config = parseRuntimeConfig(
        `?dreamsignCount=${encodeURIComponent(value)}&dreamsignCap=${encodeURIComponent(value)}`,
      );

      expect(config.explorationDreamsignCount).toBeNull();
      expect(config.explorationDreamsignCap).toBeNull();
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

    it.each(["", "-1", "1.5", "1e2", "101", "not-a-count"])(
      "rejects an invalid QA starter-card count %j",
      (value) => {
        expect(
          parseRuntimeConfig(`?starterCount=${encodeURIComponent(value)}`)
            .explorationStarterCount,
        ).toBeNull();
      },
    );
  });

  describe("loadJourneyName", () => {
    it("returns null when loadJourney is absent or blank", () => {
      expect(parseRuntimeConfig("").loadJourneyName).toBeNull();
      expect(parseRuntimeConfig("?loadJourney=").loadJourneyName).toBeNull();
      expect(
        parseRuntimeConfig("?loadJourney=%20%20").loadJourneyName,
      ).toBeNull();
    });

    it("returns the trimmed, decoded name when loadJourney is present", () => {
      expect(
        parseRuntimeConfig("?loadJourney=warriors%20draft").loadJourneyName,
      ).toBe("warriors draft");
      expect(parseRuntimeConfig("?loadJourney=%20foo%20").loadJourneyName).toBe(
        "foo",
      );
    });
  });

  describe("aiMode", () => {
    it("enables the journey battle AI only when ai=1", () => {
      expect(parseRuntimeConfig("").aiMode).toBe(false);
      expect(parseRuntimeConfig("?ai=1").aiMode).toBe(true);
      expect(parseRuntimeConfig("?ai=0").aiMode).toBe(false);
      expect(parseRuntimeConfig("?ai=true").aiMode).toBe(false);
      expect(parseRuntimeConfig("?ai=").aiMode).toBe(false);
    });
  });

  describe("tutorialPlaybackSpeed", () => {
    it("parses a positive decimal multiplier", () => {
      expect(parseRuntimeConfig("?tutorialSpeed=4").tutorialPlaybackSpeed).toBe(
        4,
      );
      expect(
        parseRuntimeConfig("?tutorialSpeed=0.5").tutorialPlaybackSpeed,
      ).toBe(0.5);
      expect(
        parseRuntimeConfig("?tutorialSpeed=.25").tutorialPlaybackSpeed,
      ).toBe(0.25);
    });

    it("uses normal speed for absent or invalid values", () => {
      expect(parseRuntimeConfig("").tutorialPlaybackSpeed).toBe(1);
      expect(parseRuntimeConfig("?tutorialSpeed=0").tutorialPlaybackSpeed).toBe(
        1,
      );
      expect(
        parseRuntimeConfig("?tutorialSpeed=-2").tutorialPlaybackSpeed,
      ).toBe(1);
      expect(
        parseRuntimeConfig("?tutorialSpeed=fast").tutorialPlaybackSpeed,
      ).toBe(1);
      expect(
        parseRuntimeConfig("?tutorialSpeed=Infinity").tutorialPlaybackSpeed,
      ).toBe(1);
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
      expect(parseRuntimeConfig("?game=JourneyRoom123").gameId).toBe(
        "journeyroom123",
      );
    });

    it("returns null for invalid game ids", () => {
      expect(parseRuntimeConfig("?game=abc").gameId).toBeNull();
      expect(parseRuntimeConfig("?game=bad_id").gameId).toBeNull();
      expect(parseRuntimeConfig("?game=").gameId).toBeNull();
    });
  });

  describe("databaseMode", () => {
    it("returns realtime only when realtime=1", () => {
      expect(parseRuntimeConfig("?realtime=1").databaseMode).toBe("realtime");
    });

    it("defaults to emulator for missing or non-1 realtime values", () => {
      expect(parseRuntimeConfig("").databaseMode).toBe("emulator");
      expect(parseRuntimeConfig("?realtime=").databaseMode).toBe("emulator");
      expect(parseRuntimeConfig("?realtime=0").databaseMode).toBe("emulator");
      expect(parseRuntimeConfig("?realtime=true").databaseMode).toBe(
        "emulator",
      );
      expect(parseRuntimeConfig("?realtime=2").databaseMode).toBe("emulator");
    });
  });

  describe("viewLogs", () => {
    it("returns a normalized room id from viewLogs", () => {
      expect(parseRuntimeConfig("?viewLogs=JourneyRoom123").viewLogs).toBe(
        "journeyroom123",
      );
    });

    it("returns null when absent or malformed", () => {
      expect(parseRuntimeConfig("").viewLogs).toBeNull();
      expect(parseRuntimeConfig("?viewLogs=").viewLogs).toBeNull();
      expect(parseRuntimeConfig("?viewLogs=bad_id").viewLogs).toBeNull();
    });
  });
});

describe("removeUiParamFromSearch", () => {
  it("removes every ui key while preserving unrelated parameters", () => {
    expect(
      removeUiParamFromSearch(
        "?game=room-7&ui=legacy&seed=42&ui=cumulus&deviceFrame=iphone16",
      ),
    ).toBe("?game=room-7&seed=42&deviceFrame=iphone16");
  });

  it("returns an empty search when ui was the only key", () => {
    expect(removeUiParamFromSearch("?ui=legacy")).toBe("");
  });
});

describe("contentConfigFromRuntime", () => {
  const atlasFoldHash = "fixture-atlas-fold-hash";
  const sitesFoldHash = "fixture-sites-fold-hash";
  const draftData = draftDataFixture();
  const economyData = economyFixture();
  const opponentsData = opponentsFixture();
  const explorationFoldHash = "fixture-exploration-fold-hash";
  const tutorialFoldHash = "fixture-tutorial-fold-hash";

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
      transfigurationFoldHash: CONFIG_DATA_FIXTURE.transfigurationData.foldHash,
      rewardSelectionFoldHash: CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
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
    atlasFoldHash: "fixture-atlas-fold-hash",
    sitesFoldHash: "fixture-sites-fold-hash",
    draftFoldHash: "fixture-draft-fold-hash",
    cardRolesFoldHash: "fixture-card-roles-fold-hash",
    economyFoldHash: economyData.foldHash,
    gambleFoldHash: CONFIG_DATA_FIXTURE.gambleData.foldHash,
    transfigurationFoldHash: CONFIG_DATA_FIXTURE.transfigurationData.foldHash,
    rewardSelectionFoldHash: CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
    auguryFoldHash: CONFIG_DATA_FIXTURE.auguryData.foldHash,
    explorationFoldHash: "fixture-exploration-fold-hash",
    tutorialFoldHash: "fixture-tutorial-fold-hash",
    opponentsFoldHash: opponentsFixture().foldHash,
    defaultStartingEssence: economyData.journey.defaultStartingEssence,
    dreamsignCap: economyData.journey.dreamsignCap,
  };

  it("is true for field-wise equal configs", () => {
    expect(contentConfigsEqual(base, { ...base })).toBe(true);
  });

  it("is false when any single field differs", () => {
    expect(
      contentConfigsEqual(base, { ...base, atlasFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, draftFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, cardRolesFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, economyFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, gambleFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, {
        ...base,
        transfigurationFoldHash: "different",
      }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, sitesFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, {
        ...base,
        rewardSelectionFoldHash: "different",
      }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, auguryFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, explorationFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, tutorialFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, opponentsFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, defaultStartingEssence: 999 }),
    ).toBe(false);
    expect(contentConfigsEqual(base, { ...base, dreamsignCap: 999 })).toBe(
      false,
    );
  });
});
