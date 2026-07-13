import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_VARIANT } from "../draft/pool";
import type { ContentConfig } from "../eventlog/types";
import {
  applyContentConfigToSearch,
  contentConfigFromRuntime,
  contentConfigsEqual,
  parseRuntimeConfig,
} from "./runtime-config";

describe("parseRuntimeConfig", () => {
  it("returns the default config when no params are present", () => {
    expect(parseRuntimeConfig("")).toEqual({
      seedOverride: null,
      aiMode: true,
      basicAutomation: true,
      gameId: null,
      databaseMode: "emulator",
      journeyVariant: "v2",
      uiVariant: "cumulus",
      poolVariant: DEFAULT_POOL_VARIANT,
      draftMode: "pool",
      fresh20PackSize: undefined,
      debugJourneyShape: null,
      debugJourneyReward: null,
      debugJourneyCost: null,
      loadQuestName: null,
      gotoScene: null,
      viewLogs: null,
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

  describe("loadQuestName", () => {
    it("returns null when loadQuest is absent or blank", () => {
      expect(parseRuntimeConfig("").loadQuestName).toBeNull();
      expect(parseRuntimeConfig("?loadQuest=").loadQuestName).toBeNull();
      expect(parseRuntimeConfig("?loadQuest=%20%20").loadQuestName).toBeNull();
    });

    it("returns the trimmed, decoded name when loadQuest is present", () => {
      expect(parseRuntimeConfig("?loadQuest=warriors%20draft").loadQuestName).toBe(
        "warriors draft",
      );
      expect(parseRuntimeConfig("?loadQuest=%20foo%20").loadQuestName).toBe("foo");
    });
  });

  describe("uiVariant", () => {
    it("defaults to cumulus when ui is absent or an unknown value", () => {
      expect(parseRuntimeConfig("").uiVariant).toBe("cumulus");
      expect(parseRuntimeConfig("?ui=").uiVariant).toBe("cumulus");
      expect(parseRuntimeConfig("?ui=something").uiVariant).toBe("cumulus");
    });

    it("selects the legacy UI only for the exact value legacy", () => {
      expect(parseRuntimeConfig("?ui=legacy").uiVariant).toBe("legacy");
      expect(parseRuntimeConfig("?ui=cumulus").uiVariant).toBe("cumulus");
      expect(parseRuntimeConfig("?ui=Legacy").uiVariant).toBe("cumulus");
    });
  });

  describe("aiMode", () => {
    it("defaults to true when ai is absent or any value other than 0", () => {
      expect(parseRuntimeConfig("").aiMode).toBe(true);
      expect(parseRuntimeConfig("?ai=1").aiMode).toBe(true);
      expect(parseRuntimeConfig("?ai=true").aiMode).toBe(true);
      expect(parseRuntimeConfig("?ai=").aiMode).toBe(true);
    });

    it("returns false only when ai=0", () => {
      expect(parseRuntimeConfig("?ai=0").aiMode).toBe(false);
    });
  });

  describe("basicAutomation", () => {
    it("defaults to true when automation is absent or any value other than 0", () => {
      expect(parseRuntimeConfig("").basicAutomation).toBe(true);
      expect(parseRuntimeConfig("?automation=1").basicAutomation).toBe(true);
      expect(parseRuntimeConfig("?automation=true").basicAutomation).toBe(true);
      expect(parseRuntimeConfig("?automation=").basicAutomation).toBe(true);
    });

    it("returns false only when automation=0", () => {
      expect(parseRuntimeConfig("?automation=0").basicAutomation).toBe(false);
    });
  });

  describe("journeyVariant", () => {
    it("defaults to v2 when journey is absent", () => {
      expect(parseRuntimeConfig("").journeyVariant).toBe("v2");
    });

    it("returns classic only when journey=classic", () => {
      expect(parseRuntimeConfig("?journey=classic").journeyVariant).toBe(
        "classic",
      );
    });

    it("returns v2 for any other journey value", () => {
      expect(parseRuntimeConfig("?journey=").journeyVariant).toBe("v2");
      expect(parseRuntimeConfig("?journey=v2").journeyVariant).toBe("v2");
      expect(parseRuntimeConfig("?journey=Classic").journeyVariant).toBe("v2");
      expect(parseRuntimeConfig("?journey=classicx").journeyVariant).toBe("v2");
      expect(parseRuntimeConfig("?journey=other").journeyVariant).toBe("v2");
    });
  });

  describe("Dream Journey debug params", () => {
    it("returns non-empty debug journey ids verbatim", () => {
      const config = parseRuntimeConfig(
        "?debugJourneyShape=single_offer&debugJourneyReward=gain_essence&debugJourneyCost=pay_essence",
      );

      expect(config.debugJourneyShape).toBe("single_offer");
      expect(config.debugJourneyReward).toBe("gain_essence");
      expect(config.debugJourneyCost).toBe("pay_essence");
    });

    it("returns null for empty debug journey params", () => {
      const config = parseRuntimeConfig(
        "?debugJourneyShape=&debugJourneyReward=&debugJourneyCost=",
      );

      expect(config.debugJourneyShape).toBeNull();
      expect(config.debugJourneyReward).toBeNull();
      expect(config.debugJourneyCost).toBeNull();
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
      expect(parseRuntimeConfig("?game=QuestRoom123").gameId).toBe("questroom123");
    });

    it("returns null for invalid game ids", () => {
      expect(parseRuntimeConfig("?game=abc").gameId).toBeNull();
      expect(parseRuntimeConfig("?game=bad_id").gameId).toBeNull();
      expect(parseRuntimeConfig("?game=").gameId).toBeNull();
    });
  });

  describe("poolVariant", () => {
    it("uses the default pool variant when algo is absent", () => {
      expect(parseRuntimeConfig("").poolVariant).toBe(DEFAULT_POOL_VARIANT);
      expect(parseRuntimeConfig("?algo=").poolVariant).toBe(DEFAULT_POOL_VARIANT);
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
      expect(parseRuntimeConfig("?realtime=true").databaseMode).toBe("emulator");
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

    it("uses the default pool variant when algo=replay", () => {
      // replay is a draft mode, not a pool variant, so it never reaches the
      // pool-variant resolution; the resolved package still needs a pool variant,
      // so it uses the default.
      expect(parseRuntimeConfig("?algo=replay").poolVariant).toBe(
        DEFAULT_POOL_VARIANT,
      );
    });

    it("uses the default pool variant when algo=fresh20", () => {
      // fresh20 is likewise a draft mode; the resolved package still needs a pool
      // variant, so it uses the default.
      expect(parseRuntimeConfig("?algo=fresh20").poolVariant).toBe(
        DEFAULT_POOL_VARIANT,
      );
    });
  });

  describe("fresh20PackSize", () => {
    it("is undefined when packsize is absent", () => {
      expect(parseRuntimeConfig("").fresh20PackSize).toBeUndefined();
      expect(parseRuntimeConfig("?algo=fresh20").fresh20PackSize).toBeUndefined();
    });

    it("parses a positive integer packsize", () => {
      expect(parseRuntimeConfig("?packsize=15").fresh20PackSize).toBe(15);
      expect(parseRuntimeConfig("?packsize=1").fresh20PackSize).toBe(1);
    });

    it("ignores zero, negative, non-integer, and non-numeric packsize", () => {
      expect(parseRuntimeConfig("?packsize=0").fresh20PackSize).toBeUndefined();
      expect(parseRuntimeConfig("?packsize=-4").fresh20PackSize).toBeUndefined();
      expect(parseRuntimeConfig("?packsize=2.5").fresh20PackSize).toBeUndefined();
      expect(parseRuntimeConfig("?packsize=abc").fresh20PackSize).toBeUndefined();
      expect(parseRuntimeConfig("?packsize=").fresh20PackSize).toBeUndefined();
    });
  });

  describe("viewLogs", () => {
    it("returns a normalized room id from viewLogs", () => {
      expect(parseRuntimeConfig("?viewLogs=QuestRoom123").viewLogs).toBe(
        "questroom123",
      );
    });

    it("returns null when absent or malformed", () => {
      expect(parseRuntimeConfig("").viewLogs).toBeNull();
      expect(parseRuntimeConfig("?viewLogs=").viewLogs).toBeNull();
      expect(parseRuntimeConfig("?viewLogs=bad_id").viewLogs).toBeNull();
    });
  });
});

describe("contentConfigFromRuntime", () => {
  it("extracts the fold-relevant slice with defaults for absent optionals", () => {
    expect(contentConfigFromRuntime(parseRuntimeConfig(""))).toEqual({
      poolVariant: DEFAULT_POOL_VARIANT,
      draftMode: "pool",
      fresh20PackSize: null,
      journeyVariant: "v2",
    });
  });

  it("reflects the fresh20 draft mode, pack size, and journey", () => {
    expect(
      contentConfigFromRuntime(parseRuntimeConfig("?algo=fresh20&packsize=15&journey=classic")),
    ).toEqual({
      poolVariant: DEFAULT_POOL_VARIANT,
      draftMode: "fresh20",
      fresh20PackSize: 15,
      journeyVariant: "classic",
    });
  });

  it("reflects a named pool variant", () => {
    expect(contentConfigFromRuntime(parseRuntimeConfig("?algo=idf2")).poolVariant).toBe("idf2");
  });
});

describe("contentConfigsEqual", () => {
  const base: ContentConfig = {
    poolVariant: "tides4",
    draftMode: "pool",
    fresh20PackSize: null,
    journeyVariant: "v2",
  };

  it("is true for field-wise equal configs", () => {
    expect(contentConfigsEqual(base, { ...base })).toBe(true);
  });

  it("is false when any single field differs", () => {
    expect(contentConfigsEqual(base, { ...base, poolVariant: "idf3" })).toBe(false);
    expect(contentConfigsEqual(base, { ...base, draftMode: "replay" })).toBe(false);
    expect(contentConfigsEqual(base, { ...base, fresh20PackSize: 20 })).toBe(false);
    expect(contentConfigsEqual(base, { ...base, journeyVariant: "classic" })).toBe(false);
  });
});

describe("applyContentConfigToSearch", () => {
  it("round-trips: reparsing the result yields the same content slice", () => {
    const configs: ContentConfig[] = [
      { poolVariant: "idf2", draftMode: "pool", fresh20PackSize: null, journeyVariant: "classic" },
      { poolVariant: DEFAULT_POOL_VARIANT, draftMode: "replay", fresh20PackSize: null, journeyVariant: "v2" },
      { poolVariant: DEFAULT_POOL_VARIANT, draftMode: "fresh20", fresh20PackSize: 12, journeyVariant: "v2" },
      { poolVariant: DEFAULT_POOL_VARIANT, draftMode: "fresh20", fresh20PackSize: null, journeyVariant: "classic" },
    ];
    for (const config of configs) {
      const search = applyContentConfigToSearch("", config);
      expect(contentConfigFromRuntime(parseRuntimeConfig(search))).toEqual(config);
    }
  });

  it("preserves unrelated params (game, ui) while overriding content params", () => {
    const config: ContentConfig = {
      poolVariant: "idf2",
      draftMode: "pool",
      fresh20PackSize: null,
      journeyVariant: "classic",
    };
    const result = applyContentConfigToSearch("?game=abc123&ui=legacy&algo=fresh20&packsize=9", config);
    const params = new URLSearchParams(result);
    expect(params.get("game")).toBe("abc123");
    expect(params.get("ui")).toBe("legacy");
    expect(params.get("algo")).toBe("idf2");
    // packsize is dropped when the adopted mode is not fresh20.
    expect(params.get("packsize")).toBeNull();
    expect(params.get("journey")).toBe("classic");
  });
});
