import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_VARIANT } from "../draft/pool";
import type { ContentConfig } from "../eventlog/types";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import {
  applyContentConfigToSearch,
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
      poolVariant: undefined,
      draftMode: "pool",
      fresh20PackSize: undefined,
      loadJourneyName: null,
      gotoScene: null,
      explorationCardId: null,
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
    });

    it("uses random selection for absent or unrecognized values", () => {
      expect(parseRuntimeConfig("").gambleGameId).toBeNull();
      expect(parseRuntimeConfig("?gambleGame=").gambleGameId).toBeNull();
      expect(
        parseRuntimeConfig("?gambleGame=twenty-one").gambleGameId,
      ).toBeNull();
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

  describe("poolVariant", () => {
    it("defers an absent algo to compiled draft data", () => {
      expect(parseRuntimeConfig("").poolVariant).toBeUndefined();
      expect(parseRuntimeConfig("?algo=").poolVariant).toBeUndefined();
    });

    it("throws on an unrecognised algo (no silent fallback)", () => {
      expect(() => parseRuntimeConfig("?algo=nonsense")).toThrow(
        /Unrecognized \?algo=/,
      );
    });

    it("returns a registered strategy id when algo matches one", () => {
      expect(parseRuntimeConfig("?algo=color_pool").poolVariant).toBe(
        "color_pool",
      );
      expect(parseRuntimeConfig("?algo=diverse").poolVariant).toBe("diverse");
      expect(parseRuntimeConfig("?algo=idf2").poolVariant).toBe("idf2");
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

  describe("draftMode", () => {
    it("returns replay when algo=replay", () => {
      expect(parseRuntimeConfig("?algo=replay").draftMode).toBe("replay");
    });

    it("returns fresh20 when algo=fresh20", () => {
      expect(parseRuntimeConfig("?algo=fresh20").draftMode).toBe("fresh20");
    });

    it("returns pool when algo is absent or a known pool variant", () => {
      expect(parseRuntimeConfig("").draftMode).toBe("pool");
      expect(parseRuntimeConfig("?algo=idf3").draftMode).toBe("pool");
      expect(parseRuntimeConfig("?algo=color_pool").draftMode).toBe("pool");
    });

    it("returns pool when algo is empty", () => {
      expect(parseRuntimeConfig("?algo=").draftMode).toBe("pool");
    });

    it("defers pool resolution when algo=replay", () => {
      expect(parseRuntimeConfig("?algo=replay").poolVariant).toBeUndefined();
    });

    it("defers pool resolution when algo=fresh20", () => {
      expect(parseRuntimeConfig("?algo=fresh20").poolVariant).toBeUndefined();
    });
  });

  describe("fresh20PackSize", () => {
    it("is undefined when packsize is absent", () => {
      expect(parseRuntimeConfig("").fresh20PackSize).toBeUndefined();
      expect(
        parseRuntimeConfig("?algo=fresh20").fresh20PackSize,
      ).toBeUndefined();
    });

    it("parses a positive integer packsize", () => {
      expect(parseRuntimeConfig("?packsize=15").fresh20PackSize).toBe(15);
      expect(parseRuntimeConfig("?packsize=1").fresh20PackSize).toBe(1);
    });

    it("ignores zero, negative, non-integer, and non-numeric packsize", () => {
      expect(parseRuntimeConfig("?packsize=0").fresh20PackSize).toBeUndefined();
      expect(
        parseRuntimeConfig("?packsize=-4").fresh20PackSize,
      ).toBeUndefined();
      expect(
        parseRuntimeConfig("?packsize=2.5").fresh20PackSize,
      ).toBeUndefined();
      expect(
        parseRuntimeConfig("?packsize=abc").fresh20PackSize,
      ).toBeUndefined();
      expect(parseRuntimeConfig("?packsize=").fresh20PackSize).toBeUndefined();
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
        "?game=room-7&ui=legacy&algo=fresh20&ui=cumulus&deviceFrame=iphone16",
      ),
    ).toBe("?game=room-7&algo=fresh20&deviceFrame=iphone16");
  });

  it("returns an empty search when ui was the only key", () => {
    expect(removeUiParamFromSearch("?ui=legacy")).toBe("");
  });
});

describe("contentConfigFromRuntime", () => {
  const atlasFoldHash = "fixture-atlas-fold-hash";
  const draftData = draftDataFixture();
  const economyData = economyFixture();
  const opponentsData = opponentsFixture();
  const explorationFoldHash = "fixture-exploration-fold-hash";

  it("extracts the fold-relevant slice with defaults for absent optionals", () => {
    expect(
      contentConfigFromRuntime(
        parseRuntimeConfig(""),
        atlasFoldHash,
        draftData,
        economyData,
        opponentsData,
        CONFIG_DATA_FIXTURE.rewardSelectionData,
        CONFIG_DATA_FIXTURE.auguryData,
        explorationFoldHash,
      ),
    ).toEqual({
      poolVariant: DEFAULT_POOL_VARIANT,
      draftMode: "pool",
      fresh20PackSize: null,
      atlasFoldHash,
      draftFoldHash: draftData.foldHash,
      economyFoldHash: economyData.foldHash,
      rewardSelectionFoldHash: CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
      auguryFoldHash: CONFIG_DATA_FIXTURE.auguryData.foldHash,
      explorationFoldHash,
      opponentsFoldHash: opponentsData.foldHash,
      defaultStartingEssence: economyData.journey.defaultStartingEssence,
      dreamsignCap: economyData.journey.dreamsignCap,
    });
  });

  it("reflects the fresh20 draft mode, pack size, and current journey", () => {
    expect(
      contentConfigFromRuntime(
        parseRuntimeConfig("?algo=fresh20&packsize=15"),
        atlasFoldHash,
        draftData,
        economyData,
        opponentsData,
        CONFIG_DATA_FIXTURE.rewardSelectionData,
        CONFIG_DATA_FIXTURE.auguryData,
        explorationFoldHash,
      ),
    ).toEqual({
      poolVariant: DEFAULT_POOL_VARIANT,
      draftMode: "fresh20",
      fresh20PackSize: 15,
      atlasFoldHash,
      draftFoldHash: draftData.foldHash,
      economyFoldHash: economyData.foldHash,
      rewardSelectionFoldHash: CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
      auguryFoldHash: CONFIG_DATA_FIXTURE.auguryData.foldHash,
      explorationFoldHash,
      opponentsFoldHash: opponentsData.foldHash,
      defaultStartingEssence: economyData.journey.defaultStartingEssence,
      dreamsignCap: economyData.journey.dreamsignCap,
    });
  });

  it("reflects a named pool variant", () => {
    expect(
      contentConfigFromRuntime(
        parseRuntimeConfig("?algo=idf2"),
        atlasFoldHash,
        draftData,
        economyData,
        opponentsData,
        CONFIG_DATA_FIXTURE.rewardSelectionData,
        CONFIG_DATA_FIXTURE.auguryData,
        explorationFoldHash,
      ).poolVariant,
    ).toBe("idf2");
  });
});

describe("contentConfigsEqual", () => {
  const economyData = economyFixture();
  const base: ContentConfig = {
    poolVariant: "tides4",
    draftMode: "pool",
    fresh20PackSize: null,
    atlasFoldHash: "fixture-atlas-fold-hash",
    draftFoldHash: "fixture-draft-fold-hash",
    economyFoldHash: economyData.foldHash,
    rewardSelectionFoldHash: CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
    auguryFoldHash: CONFIG_DATA_FIXTURE.auguryData.foldHash,
    explorationFoldHash: "fixture-exploration-fold-hash",
    opponentsFoldHash: opponentsFixture().foldHash,
    defaultStartingEssence: economyData.journey.defaultStartingEssence,
    dreamsignCap: economyData.journey.dreamsignCap,
  };

  it("is true for field-wise equal configs", () => {
    expect(contentConfigsEqual(base, { ...base })).toBe(true);
  });

  it("is false when any single field differs", () => {
    expect(contentConfigsEqual(base, { ...base, poolVariant: "idf3" })).toBe(
      false,
    );
    expect(contentConfigsEqual(base, { ...base, draftMode: "replay" })).toBe(
      false,
    );
    expect(contentConfigsEqual(base, { ...base, fresh20PackSize: 20 })).toBe(
      false,
    );
    expect(
      contentConfigsEqual(base, { ...base, atlasFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, draftFoldHash: "different" }),
    ).toBe(false);
    expect(
      contentConfigsEqual(base, { ...base, economyFoldHash: "different" }),
    ).toBe(false);
    expect(contentConfigsEqual(base, { ...base, rewardSelectionFoldHash: "different" })).toBe(false);
    expect(contentConfigsEqual(base, { ...base, auguryFoldHash: "different" })).toBe(false);
    expect(contentConfigsEqual(base, { ...base, explorationFoldHash: "different" })).toBe(false);
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

describe("applyContentConfigToSearch", () => {
  it("round-trips: reparsing the result yields the same content slice", () => {
    const economyData = economyFixture();
    const pinnedEconomy = {
      draftFoldHash: draftDataFixture().foldHash,
      economyFoldHash: economyData.foldHash,
      rewardSelectionFoldHash: CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
      auguryFoldHash: CONFIG_DATA_FIXTURE.auguryData.foldHash,
      explorationFoldHash: "fixture-exploration-fold-hash",
      opponentsFoldHash: opponentsFixture().foldHash,
      defaultStartingEssence: economyData.journey.defaultStartingEssence,
      dreamsignCap: economyData.journey.dreamsignCap,
    };
    const configs: ContentConfig[] = [
      {
        poolVariant: "idf2",
        draftMode: "pool",
        fresh20PackSize: null,
        atlasFoldHash: "fixture-atlas-fold-hash",
        ...pinnedEconomy,
      },
      {
        poolVariant: DEFAULT_POOL_VARIANT,
        draftMode: "replay",
        fresh20PackSize: null,
        atlasFoldHash: "fixture-atlas-fold-hash",
        ...pinnedEconomy,
      },
      {
        poolVariant: DEFAULT_POOL_VARIANT,
        draftMode: "fresh20",
        fresh20PackSize: 12,
        atlasFoldHash: "fixture-atlas-fold-hash",
        ...pinnedEconomy,
      },
      {
        poolVariant: DEFAULT_POOL_VARIANT,
        draftMode: "fresh20",
        fresh20PackSize: null,
        atlasFoldHash: "fixture-atlas-fold-hash",
        ...pinnedEconomy,
      },
    ];
    for (const config of configs) {
      const search = applyContentConfigToSearch("", config);
      expect(
        contentConfigFromRuntime(
          parseRuntimeConfig(search),
          config.atlasFoldHash ?? "fixture-atlas-fold-hash",
          {
            ...draftDataFixture(),
            foldHash:
              config.draftFoldHash ?? draftDataFixture().foldHash,
          },
          {
            ...economyData,
            foldHash: config.economyFoldHash ?? economyData.foldHash,
          },
          {
            ...opponentsFixture(),
            foldHash: config.opponentsFoldHash ?? opponentsFixture().foldHash,
          },
          {
            ...CONFIG_DATA_FIXTURE.rewardSelectionData,
            foldHash: config.rewardSelectionFoldHash ?? CONFIG_DATA_FIXTURE.rewardSelectionData.foldHash,
          },
          {
            ...CONFIG_DATA_FIXTURE.auguryData,
            foldHash: config.auguryFoldHash ?? CONFIG_DATA_FIXTURE.auguryData.foldHash,
          },
          config.explorationFoldHash ?? "fixture-exploration-fold-hash",
        ),
      ).toEqual(config);
    }
  });

  it("preserves unrelated gameplay and device params while overriding content params", () => {
    const config: ContentConfig = {
      poolVariant: "idf2",
      draftMode: "pool",
      fresh20PackSize: null,
    };
    const result = applyContentConfigToSearch(
      "?game=abc123&deviceFrame=iphone16&algo=fresh20&packsize=9&journey=classic&debugJourneyShape=single_offer",
      config,
    );
    const params = new URLSearchParams(result);
    expect(params.get("game")).toBe("abc123");
    expect(params.get("deviceFrame")).toBe("iphone16");
    expect(params.get("algo")).toBe("idf2");
    // packsize is dropped when the adopted mode is not fresh20.
    expect(params.get("packsize")).toBeNull();
    expect(params.get("journey")).toBeNull();
    expect(params.get("debugJourneyShape")).toBeNull();
  });
});
