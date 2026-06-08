import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_VARIANT } from "../draft/pool";
import { parseRuntimeConfig } from "./runtime-config";

describe("parseRuntimeConfig", () => {
  it("returns the default config when no params are present", () => {
    expect(parseRuntimeConfig("")).toEqual({
      seedOverride: null,
      startInBattle: false,
      aiMode: true,
      basicAutomation: true,
      gameId: null,
      databaseMode: "emulator",
      journeyVariant: "classic",
      poolVariant: DEFAULT_POOL_VARIANT,
      draftMode: "pool",
      fresh20PackSize: undefined,
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
    it("defaults to classic when journey is absent", () => {
      expect(parseRuntimeConfig("").journeyVariant).toBe("classic");
    });

    it("returns v2 only when journey=v2", () => {
      expect(parseRuntimeConfig("?journey=v2").journeyVariant).toBe("v2");
    });

    it("returns classic for any other journey value", () => {
      expect(parseRuntimeConfig("?journey=").journeyVariant).toBe("classic");
      expect(parseRuntimeConfig("?journey=classic").journeyVariant).toBe(
        "classic",
      );
      expect(parseRuntimeConfig("?journey=V2").journeyVariant).toBe("classic");
      expect(parseRuntimeConfig("?journey=v2x").journeyVariant).toBe("classic");
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

  describe("journeyVariant", () => {
    it("defaults to classic when journey is absent or unrecognised", () => {
      expect(parseRuntimeConfig("").journeyVariant).toBe("classic");
      expect(parseRuntimeConfig("?journey=").journeyVariant).toBe("classic");
      expect(parseRuntimeConfig("?journey=classic").journeyVariant).toBe(
        "classic",
      );
      expect(parseRuntimeConfig("?journey=other").journeyVariant).toBe("classic");
    });

    it("returns v2 when journey=v2", () => {
      expect(parseRuntimeConfig("?journey=v2").journeyVariant).toBe("v2");
    });
  });
});
