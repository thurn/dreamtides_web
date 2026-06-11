import { describe, expect, it } from "vitest";
import type { FitModel } from "../../draft/replay/fit-model";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import { buildMerchantContext } from "../context/buildMerchantContext";
import { merchantRng } from "../signals/rng";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignProfile,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestFitModel,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { MerchantContext } from "../types";
import { strongCardBuilder } from "./grant";
import { dreamsignBuilder } from "./dreamsign";
import { duplicateBuilder } from "./duplicate";
import { purgeBuilder } from "./remove";
import { addSiteBuilder } from "./site";
import { MERCHANT_PLACEABLE_SITE_TYPES } from "./site";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function makePoolCards(count: number): CardData[] {
  return Array.from({ length: count }, (_, i) =>
    makeMerchantTestCard({
      id: uuid(100 + i),
      cardNumber: 100 + i,
      name: `Pool ${String(100 + i)}`,
      energyCost: 2,
      spark: 2,
    }),
  );
}

function rankedFitModel(cards: readonly CardData[]): FitModel {
  const model = makeMerchantTestFitModel();
  const numberToName = new Map<number, string>();
  const nameIndex = new Map<string, number>();
  const prior = new Map<string, number>();
  for (const card of cards) {
    numberToName.set(card.cardNumber, card.name);
    nameIndex.set(card.name, card.cardNumber);
    prior.set(card.name, card.cardNumber / 100000);
  }
  return {
    ...model,
    numberToName,
    nameIndex,
    prior,
    tuning: { ...model.tuning, alpha: 0, beta: 0, gamma: 1 },
  };
}

function grantContext(input: {
  poolCards: readonly CardData[];
  deckEntries?: { entryId: string; cardNumber: number }[];
  corpusCards?: Record<string, { quality: number }>;
  fitModel?: FitModel;
}): MerchantContext {
  const questContent = makeMerchantTestContent({
    cards: input.poolCards,
    fitModel: input.fitModel,
    merchantCorpus: makeMerchantTestCorpus({ cards: input.corpusCards ?? {} }),
  });
  const deck = (input.deckEntries ?? []).map((e) =>
    makeMerchantTestDeckEntry({ entryId: e.entryId, cardNumber: e.cardNumber }),
  );
  return buildMerchantContext({
    questState: makeMerchantTestQuestState({ deck }),
    questContent,
    site: makeMerchantTestSite(),
  });
}

describe("strong_card trace", () => {
  it("attaches a scored_cards trace whose selected candidate is the target", () => {
    const pool = makePoolCards(10);
    const context = grantContext({
      poolCards: pool,
      corpusCards: Object.fromEntries(
        pool.map((card, i) => [card.id, { quality: 0.1 + i / 20 }]),
      ),
      deckEntries: Array.from({ length: 6 }, (_, i) => ({
        entryId: `d${String(i)}`,
        cardNumber: 100 + i,
      })),
      fitModel: rankedFitModel(pool),
    });
    const draft = strongCardBuilder.build(context, merchantRng("strong", "1"));
    expect(draft).not.toBeNull();
    const trace = draft?.trace;
    expect(trace?.decision).toBe("scored_cards");
    expect(trace?.keyKind).toBe("cardUuid");
    // With a full deck the blend is active (not the cold-start fallback).
    expect(trace?.coldStartQualityFallback).toBe(false);
    expect(trace?.blend).toBeDefined();
    const selected = trace?.candidates.filter((c) => c.selected) ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]?.key).toBe(draft?.targetKey);
    // The selected candidate exposes the blended components.
    expect(selected[0]?.components).toHaveProperty("quality");
    expect(selected[0]?.components).toHaveProperty("fit");
  });

  it("flags the cold-start quality fallback when the deck is below minDeckForFit", () => {
    const pool = makePoolCards(10);
    const context = grantContext({
      poolCards: pool,
      corpusCards: Object.fromEntries(
        pool.map((card, i) => [card.id, { quality: 0.1 + i / 20 }]),
      ),
      deckEntries: [],
      fitModel: rankedFitModel(pool),
    });
    const draft = strongCardBuilder.build(context, merchantRng("strong", "2"));
    expect(draft?.trace?.coldStartQualityFallback).toBe(true);
    // Cold start ranks on quality alone — no blend snapshot.
    expect(draft?.trace?.blend).toBeUndefined();
  });
});

describe("dreamsign trace", () => {
  function warriorContext(input: {
    coveredSignIds: string[];
    genericSignIds: string[];
  }): MerchantContext {
    const deckCards = Array.from({ length: 3 }, (_, i) =>
      makeMerchantTestCard({
        id: `warrior-${String(i)}`,
        cardNumber: 200 + i,
        subtype: "Warrior",
      }),
    );
    const templates = [...input.coveredSignIds, ...input.genericSignIds].map(
      (id) => makeMerchantTestDreamsignTemplate({ id }),
    );
    const profiles = new Map<string, DreamsignProfile>(
      input.coveredSignIds.map((id) => [
        id,
        makeMerchantTestDreamsignProfile({ id, subtypes: ["Warrior"] }),
      ]),
    );
    const questContent = makeMerchantTestContent({
      cards: deckCards,
      dreamsignTemplates: templates,
      dreamsignProfiles: profiles,
    });
    const questState = makeMerchantTestQuestState({
      deck: deckCards.map((card, i) =>
        makeMerchantTestDeckEntry({
          entryId: `deck-${String(i)}`,
          cardNumber: card.cardNumber,
        }),
      ),
    });
    return buildMerchantContext({
      questState,
      questContent,
      site: makeMerchantTestSite(),
    });
  }

  it("reports the covered tier and coverage components for a deck-matched sign", () => {
    const context = warriorContext({
      coveredSignIds: ["ds-warrior"],
      genericSignIds: ["ds-generic-1", "ds-generic-2"],
    });
    const draft = dreamsignBuilder.build(context, merchantRng("ds", "1"));
    expect(draft).not.toBeNull();
    const trace = draft?.trace;
    expect(trace?.decision).toBe("dreamsign_match");
    expect(trace?.keyKind).toBe("dreamsignId");
    expect(trace?.dreamsignTier).toBe("covered");
    const selected = trace?.candidates.filter((c) => c.selected) ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]?.key).toBe(draft?.targetKey);
    expect(selected[0]?.components).toHaveProperty("meanCoverage");
    expect(selected[0]?.components).toHaveProperty("featureCount");
  });

  it("falls back when every candidate sign scores zero against the deck", () => {
    // A Warrior deck with a single sign profiled for a subtype the deck lacks:
    // not covered (meanCoverage 0) and not featureless (it has a feature), so
    // its match score is 0 and neither the covered nor the generic tier forms.
    const deckCards = Array.from({ length: 3 }, (_, i) =>
      makeMerchantTestCard({
        id: `warrior-only-${String(i)}`,
        cardNumber: 210 + i,
        subtype: "Warrior",
      }),
    );
    const questContent = makeMerchantTestContent({
      cards: deckCards,
      dreamsignTemplates: [makeMerchantTestDreamsignTemplate({ id: "ds-off" })],
      dreamsignProfiles: new Map<string, DreamsignProfile>([
        [
          "ds-off",
          makeMerchantTestDreamsignProfile({
            id: "ds-off",
            subtypes: ["Spirit Animal"],
          }),
        ],
      ]),
    });
    const questState = makeMerchantTestQuestState({
      deck: deckCards.map((card, i) =>
        makeMerchantTestDeckEntry({
          entryId: `off-${String(i)}`,
          cardNumber: card.cardNumber,
        }),
      ),
    });
    const context = buildMerchantContext({
      questState,
      questContent,
      site: makeMerchantTestSite(),
    });
    const draft = dreamsignBuilder.build(context, merchantRng("ds", "2"));
    expect(draft?.trace?.dreamsignTier).toBe("fallback");
  });
});

describe("purge trace", () => {
  it("ranks deck entries and records the misfit threshold notes", () => {
    const starters = Array.from({ length: 9 }, (_, i) =>
      makeMerchantTestCard({
        id: uuid(300 + i),
        cardNumber: 300 + i,
        isStarter: true,
      }),
    );
    const context = grantContext({
      poolCards: starters,
      deckEntries: starters.map((card, i) => ({
        entryId: `s${String(i)}`,
        cardNumber: card.cardNumber,
      })),
    });
    const draft = purgeBuilder.build(context, merchantRng("purge", "1"));
    expect(draft).not.toBeNull();
    const trace = draft?.trace;
    expect(trace?.decision).toBe("deck_entry_rank");
    expect(trace?.keyKind).toBe("entryId");
    const selected = trace?.candidates.filter((c) => c.selected) ?? [];
    expect(selected[0]?.key).toBe(draft?.targetKey);
    expect(trace?.notes?.some((n) => n.startsWith("looThreshold="))).toBe(true);
  });
});

describe("duplicate trace", () => {
  it("attaches a deck_entry_rank trace covering the chosen entry", () => {
    const cards = makePoolCards(2);
    const context = grantContext({
      poolCards: cards,
      corpusCards: Object.fromEntries(
        cards.map((card, i) => [card.id, { quality: 0.2 + i / 10 }]),
      ),
      deckEntries: cards.map((card, i) => ({
        entryId: `dup${String(i)}`,
        cardNumber: card.cardNumber,
      })),
    });
    const draft = duplicateBuilder.build(context, merchantRng("dup", "1"));
    expect(draft).not.toBeNull();
    const trace = draft?.trace;
    expect(trace?.decision).toBe("deck_entry_rank");
    const selectedKeys = new Set(
      trace?.candidates.filter((c) => c.selected).map((c) => c.key) ?? [],
    );
    for (const key of (draft?.targetKey ?? "").split(",")) {
      expect(selectedKeys.has(key)).toBe(true);
    }
  });
});

describe("add_site trace", () => {
  it("lists every placeable site type and selects the offered one", () => {
    const context = grantContext({ poolCards: [] });
    const draft = addSiteBuilder.build(context, merchantRng("site", "1"));
    expect(draft).not.toBeNull();
    const trace = draft?.trace;
    expect(trace?.decision).toBe("uniform");
    expect(trace?.keyKind).toBe("siteType");
    expect(trace?.candidateCount).toBe(MERCHANT_PLACEABLE_SITE_TYPES.length);
    const selected = trace?.candidates.filter((c) => c.selected) ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]?.key).toBe(draft?.targetKey);
  });
});
