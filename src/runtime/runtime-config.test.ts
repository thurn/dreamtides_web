import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./runtime-config";

describe("parseRuntimeConfig", () => {
  it("returns the default config when no params are present", () => {
    expect(parseRuntimeConfig("")).toEqual({
      seedOverride: null,
      startInBattle: false,
      aiMode: true,
      gameId: null,
      databaseMode: "emulator",
      poolVariant: "idf3",
      draftMode: "pool",
      debugJourneyShape: null,
      debugJourneyReward: null,
      debugJourneyCost: null,
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

  describe("startInBattle", () => {
    it("returns true when startInBattle=1", () => {
      expect(parseRuntimeConfig("?startInBattle=1").startInBattle).toBe(true);
    });

    it("returns false for non-1 values of startInBattle", () => {
      expect(parseRuntimeConfig("?startInBattle=0").startInBattle).toBe(false);
      expect(parseRuntimeConfig("?startInBattle=true").startInBattle).toBe(
        false,
      );
      expect(parseRuntimeConfig("?startInBattle=").startInBattle).toBe(false);
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
    it("defaults to idf3 when algo is absent or unrecognised", () => {
      expect(parseRuntimeConfig("").poolVariant).toBe("idf3");
      expect(parseRuntimeConfig("?algo=").poolVariant).toBe("idf3");
      expect(parseRuntimeConfig("?algo=nonsense").poolVariant).toBe("idf3");
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

    it("returns pool when algo is absent or a known pool variant", () => {
      expect(parseRuntimeConfig("").draftMode).toBe("pool");
      expect(parseRuntimeConfig("?algo=idf3").draftMode).toBe("pool");
      expect(parseRuntimeConfig("?algo=color_pool").draftMode).toBe("pool");
    });

    it("returns pool when algo is an unknown value", () => {
      expect(parseRuntimeConfig("?algo=nonsense").draftMode).toBe("pool");
      expect(parseRuntimeConfig("?algo=").draftMode).toBe("pool");
    });

    it("falls back poolVariant to idf3 (the default) when algo=replay", () => {
      // replay is not a registered pool variant, so resolvePoolVariant falls
      // back to the default (idf3). This is intentional: replay still needs a
      // pool variant for the resolved package.
      expect(parseRuntimeConfig("?algo=replay").poolVariant).toBe("idf3");
    });
  });
});
