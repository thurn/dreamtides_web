// Adapter wiring tests.
//
// `createJourneyMutations` delegates every `JourneyMutations` method to a
// corresponding `QuestMutations` method. Tests are grouped by translation
// *class* — passthrough, transfiguration null/positional rewriting,
// source-string verbatim forwarding, and the `removeSiteTypeFromNextDreamscapes`
// narrowing — rather than enumerating every method delegate. Per-template
// apply tests in later tasks exercise the methods individually.

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Dreamsign, SiteType } from "../../types/quest";
import type { QuestMutations } from "../../state/quest-context";
import { createJourneyMutations } from "./journeyMutations";

interface RecordedCall {
  readonly method: keyof QuestMutations;
  readonly args: readonly unknown[];
}

/**
 * Build a `QuestMutations` stub whose every method appends a
 * `{ method, args }` record to `calls`. The returned `mutations` object is
 * typed as `QuestMutations` so the adapter compiles against it; the runtime
 * implementation is the recording shim.
 */
function createRecordingQuestMutations(): {
  mutations: QuestMutations;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const record =
    <M extends keyof QuestMutations>(method: M) =>
    (...args: unknown[]): void => {
      calls.push({ method, args });
    };
  // Build the stub via a Proxy so any unspecified method records its call
  // automatically. This keeps the test resilient to future QuestMutations
  // additions; only the methods the adapter calls are exercised below.
  const handler: ProxyHandler<QuestMutations> = {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      if (prop === "addCardById") {
        return (...args: unknown[]): string => {
          calls.push({ method: "addCardById", args });
          return "quest-entry-1";
        };
      }
      return record(prop as keyof QuestMutations);
    },
  };
  const mutations = new Proxy({} as QuestMutations, handler);
  return { mutations, calls };
}

const sampleDreamsign: Dreamsign = {
  name: "Test Sign",
  effectDescription: "Sample",
  isBane: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createJourneyMutations passthrough", () => {
  it("forwards same-named methods with args unchanged (representative samples)", () => {
    const { mutations, calls } = createRecordingQuestMutations();
    const adapter = createJourneyMutations(mutations);

    adapter.changeEssence(-3, "dream_journey:pay_essence");
    adapter.changeOmens(2, "dream_journey:gain_omens");
    adapter.setEssence(0, "dream_journey:zero_essence");
    adapter.changeMaxEssence(10, "dream_journey:increase_max_essence");
    const addedEntryId = adapter.addCardById("card-501", "dream_journey:gain_card");
    adapter.addBaneCardById("bane-1", "dream_journey:gain_bane");
    adapter.removeDeckEntry("entry-7", "dream_journey:purge");
    adapter.duplicateDeckEntry("entry-7", "dream_journey:duplicate");
    adapter.addDreamsign(sampleDreamsign, "dream_journey:gain_dreamsign", 3);
    adapter.removeDreamsign(2, "dream_journey:purge_dreamsign");
    adapter.purgeRandomBaneCards(2, "dream_journey:purge_X_banes");
    adapter.purgeAllBaneCards("dream_journey:purge_all_banes");
    adapter.addSiteToDreamscape("next", "Shop", "dream_journey:add_site");
    adapter.replaceSiteType("Battle", "Essence", "dream_journey:replace_site");
    adapter.pushBattleRewardModifier("flat", 5, 3, "dream_journey:reward_red");
    adapter.pushTemporaryBaneGrant("Despair", 1, 3, "dream_journey:temp_bane");
    adapter.grantFreeShopRerolls(2, "dream_journey:free_rerolls");
    adapter.applyShopEssenceDiscount(20, "dream_journey:shop_disc");
    adapter.grantShopOmenDiscounts(3, "dream_journey:omen_disc");
    adapter.boostSiteAppearance("Shop", 20, 3, "dream_journey:boost_site");

    expect(calls).toEqual([
      { method: "changeEssence", args: [-3, "dream_journey:pay_essence"] },
      { method: "changeOmens", args: [2, "dream_journey:gain_omens"] },
      { method: "setEssence", args: [0, "dream_journey:zero_essence"] },
      { method: "changeMaxEssence", args: [10, "dream_journey:increase_max_essence"] },
      { method: "addCardById", args: ["card-501", "dream_journey:gain_card"] },
      { method: "addBaneCardById", args: ["bane-1", "dream_journey:gain_bane"] },
      { method: "removeDeckEntry", args: ["entry-7", "dream_journey:purge"] },
      { method: "duplicateDeckEntry", args: ["entry-7", "dream_journey:duplicate"] },
      { method: "addDreamsign", args: [sampleDreamsign, "dream_journey:gain_dreamsign", 3] },
      { method: "removeDreamsign", args: [2, "dream_journey:purge_dreamsign"] },
      { method: "purgeRandomBaneCards", args: [2, "dream_journey:purge_X_banes"] },
      { method: "purgeAllBaneCards", args: ["dream_journey:purge_all_banes"] },
      { method: "addSiteToDreamscape", args: ["next", "Shop", "dream_journey:add_site"] },
      { method: "replaceSiteType", args: ["Battle", "Essence", "dream_journey:replace_site"] },
      { method: "pushBattleRewardModifier", args: ["flat", 5, 3, "dream_journey:reward_red"] },
      { method: "pushTemporaryBaneGrant", args: ["Despair", 1, 3, "dream_journey:temp_bane"] },
      { method: "grantFreeShopRerolls", args: [2, "dream_journey:free_rerolls"] },
      { method: "applyShopEssenceDiscount", args: [20, "dream_journey:shop_disc"] },
      { method: "grantShopOmenDiscounts", args: [3, "dream_journey:omen_disc"] },
      { method: "boostSiteAppearance", args: ["Shop", 20, 3, "dream_journey:boost_site"] },
    ]);
    expect(addedEntryId).toBe("quest-entry-1");
  });
});

describe("createJourneyMutations transfigureDeckEntry translation", () => {
  it("forwards a positive transfiguration with source as description and empty details", () => {
    const { mutations, calls } = createRecordingQuestMutations();
    const adapter = createJourneyMutations(mutations);

    adapter.transfigureDeckEntry(
      "entry-12",
      "Prismatic",
      "dream_journey:transfigure_card",
    );

    expect(calls).toEqual([
      {
        method: "transfigureCard",
        args: ["entry-12", "Prismatic", "dream_journey:transfigure_card", {}],
      },
    ]);
  });

  it("forwards a null transfiguration as the remove-transfiguration variant", () => {
    const { mutations, calls } = createRecordingQuestMutations();
    const adapter = createJourneyMutations(mutations);

    adapter.transfigureDeckEntry(
      "entry-12",
      null,
      "dream_journey:remove_transfiguration",
    );

    expect(calls).toEqual([
      {
        method: "transfigureCard",
        args: [
          "entry-12",
          null,
          "dream_journey:remove_transfiguration",
          {},
        ],
      },
    ]);
  });
});

describe("createJourneyMutations source-string convention", () => {
  it("forwards the source string verbatim without rewriting", () => {
    const { mutations, calls } = createRecordingQuestMutations();
    const adapter = createJourneyMutations(mutations);

    const source = "dream_journey:opt#3:gain_essence";
    adapter.changeEssence(5, source);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[1]).toBe(source);
  });
});

describe("createJourneyMutations removeSiteTypeFromNextDreamscapes narrowing", () => {
  it("forwards Shop and DreamsignOffering to the underlying mutation", () => {
    const { mutations, calls } = createRecordingQuestMutations();
    const adapter = createJourneyMutations(mutations);

    adapter.removeSiteTypeFromNextDreamscapes(
      "Shop",
      2,
      "dream_journey:hide_shops",
    );
    adapter.removeSiteTypeFromNextDreamscapes(
      "DreamsignOffering",
      1,
      "dream_journey:hide_dreamsigns",
    );

    expect(calls).toEqual([
      {
        method: "removeSiteTypeFromNextDreamscapes",
        args: ["Shop", 2, "dream_journey:hide_shops"],
      },
      {
        method: "removeSiteTypeFromNextDreamscapes",
        args: ["DreamsignOffering", 1, "dream_journey:hide_dreamsigns"],
      },
    ]);
  });

  it("warns and no-ops on unsupported site types", () => {
    const { mutations, calls } = createRecordingQuestMutations();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const adapter = createJourneyMutations(mutations);

    // `Battle` is a legal `SiteType` but not in the narrowed QuestMutations
    // signature; the adapter is the narrowing boundary.
    const unsupported: SiteType = "Battle";
    adapter.removeSiteTypeFromNextDreamscapes(
      unsupported,
      2,
      "dream_journey:hide_unsupported",
    );

    expect(calls).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("removeSiteTypeFromNextDreamscapes"),
    );
  });
});
