import { describe, expect, it } from "vitest";
import type { FitModel } from "../../draft/replay/fit-model";
import { applyMerchantPayloadToState } from "../encounter/resolveMerchantOffer";
import { merchantRng } from "../signals/rng";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/journey";
import type { MerchantContext } from "../types";
import {
  keywordModBuilder,
  keywordModCandidatePairs,
  merchantTransfigurations,
  starterTransfigureBuilder,
  transfigureBuilder,
  transfigureCandidatePairs,
  TRIBES,
  tribalChangeBuilder,
} from "./improve";
import { eligibleTransfigurations } from "../../transfiguration/transfiguration-logic";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardId } from "../../types/card-identity";

function uuid(n: number): CardId {
  const hex = n.toString(16).padStart(12, "0");
  return asCardId(`00000000-0000-4000-8000-${hex}`);
}

/**
 * Builds a merchant context from explicit card + deck-entry fixtures. Cards are
 * registered in the database keyed by cardNumber; the deck is whatever entries
 * are passed.
 */
function makeContext(input: {
  cards: readonly CardData[];
  deckEntries: readonly DeckEntry[];
  corpusCards?: Record<string, { quality: number; multiplicity?: number }>;
  fitModel?: FitModel;
}): MerchantContext {
  const journeyContent = makeMerchantTestContent({
    cards: input.cards,
    fitModel: input.fitModel,
    merchantCorpus: makeMerchantTestCorpus({ cards: input.corpusCards ?? {} }),
  });
  const journeyState = makeMerchantTestJourneyState({ deck: [...input.deckEntries] });
  return buildMerchantContext({
    journeyState,
    journeyContent,
    site: makeMerchantTestSite(),
  });
}

describe("merchantTransfigurations", () => {
  it("never offers Perfected, even when the card is Perfected-eligible", () => {
    // A Character with cost, a digit, and spark is eligible for several
    // transfigurations, which makes it Perfected-eligible.
    const card = makeMerchantTestCard({
      id: uuid(50),
      cardNumber: 50,
      cardType: "Character",
      energyCost: 4,
      spark: 2,
      renderedText: "Deal 2 damage.",
    });
    expect(eligibleTransfigurations(card)).toContain("Perfected");
    expect(merchantTransfigurations(card)).not.toContain("Perfected");
    // It still offers the underlying types.
    expect(merchantTransfigurations(card)).toContain("Empowered");
  });

  it("includes Hastened for a non-fast Event", () => {
    const card = makeMerchantTestCard({
      id: uuid(51),
      cardNumber: 51,
      cardType: "Event",
      energyCost: 2,
      spark: null,
      isFast: false,
      renderedText: "Deal damage.",
    });
    expect(merchantTransfigurations(card)).toContain("Hastened");
  });
});

// --- Task 11: transfigure -----------------------------------------------------

describe("improve family — transfigure pair enumeration", () => {
  it("contributes exactly one candidate per (entry, eligible transfiguration) pair", () => {
    // A Character with energyCost>0 and no digit/trigger is eligible for
    // Empowered (cost>0) and Kindled (Character). The merchant never offers
    // Perfected, so this entry contributes exactly those two pairs.
    const card = makeMerchantTestCard({
      id: uuid(100),
      cardNumber: 100,
      cardType: "Character",
      energyCost: 4,
      spark: 2,
      renderedText: "", // no digit, no triggers, no activated -> not Amplified etc
    });
    const context = makeContext({
      cards: [card],
      deckEntries: [makeMerchantTestDeckEntry({ entryId: "e1", cardNumber: 100 })],
    });
    const pairs = transfigureCandidatePairs(context);
    expect(pairs).toHaveLength(2);
    const transfigs = new Set(pairs.map((p) => p.transfiguration));
    expect(transfigs).toEqual(new Set(["Empowered", "Kindled"]));
    // All three pairs reference the same entry.
    expect(new Set(pairs.map((p) => p.entryId))).toEqual(new Set(["e1"]));
  });

  it("never enumerates already-transfigured entries", () => {
    const card = makeMerchantTestCard({
      id: uuid(101),
      cardNumber: 101,
      cardType: "Character",
      energyCost: 4,
      spark: 2,
    });
    const context = makeContext({
      cards: [card],
      deckEntries: [
        makeMerchantTestDeckEntry({
          entryId: "e1",
          cardNumber: 101,
          transfiguration: "Kindled",
        }),
      ],
    });
    expect(transfigureCandidatePairs(context)).toHaveLength(0);
    expect(transfigureBuilder.eligible(context)).toBe(false);
  });

  it("excludes starters while a non-starter pair exists, includes them otherwise", () => {
    const starter = makeMerchantTestCard({
      id: uuid(200),
      cardNumber: 200,
      cardType: "Character",
      isStarter: true,
      energyCost: 4,
      spark: 2,
    });
    const nonStarter = makeMerchantTestCard({
      id: uuid(201),
      cardNumber: 201,
      cardType: "Character",
      isStarter: false,
      energyCost: 4,
      spark: 2,
    });
    // With a non-starter present, starter entries are absent.
    const withBoth = makeContext({
      cards: [starter, nonStarter],
      deckEntries: [
        makeMerchantTestDeckEntry({ entryId: "starter-e", cardNumber: 200 }),
        makeMerchantTestDeckEntry({ entryId: "ns-e", cardNumber: 201 }),
      ],
    });
    const pairsBoth = transfigureCandidatePairs(withBoth);
    expect(pairsBoth.length).toBeGreaterThan(0);
    expect(pairsBoth.every((p) => p.entryId === "ns-e")).toBe(true);

    // With only a starter, starter pairs ARE candidates.
    const starterOnly = makeContext({
      cards: [starter],
      deckEntries: [
        makeMerchantTestDeckEntry({ entryId: "starter-e", cardNumber: 200 }),
      ],
    });
    const pairsStarter = transfigureCandidatePairs(starterOnly);
    expect(pairsStarter.length).toBeGreaterThan(0);
    expect(pairsStarter.every((p) => p.entryId === "starter-e")).toBe(true);
  });

  it("only enumerates pairs with positive benefit", () => {
    // An Event with energyCost 0 and no digit: Empowered ineligible (cost 0),
    // Kindled ineligible (not Character). Inspired/Enduring (Event) have benefit
    // 0.55 > 0. So pairs come only from positive-benefit transfigurations.
    const card = makeMerchantTestCard({
      id: uuid(300),
      cardNumber: 300,
      cardType: "Event",
      energyCost: 0,
      spark: null,
      renderedText: "Deal damage.",
    });
    const context = makeContext({
      cards: [card],
      deckEntries: [makeMerchantTestDeckEntry({ entryId: "e1", cardNumber: 300 })],
    });
    const pairs = transfigureCandidatePairs(context);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((p) => p.benefit > 0)).toBe(true);
  });

  // THE DIREWOLF TEST — the anti-argmax property the whole v3 rewrite exists to
  // deliver. A deck with one high-spark Kindled character (benefit ~1.0) plus
  // many other positive-benefit pairs must NOT collapse to always offering the
  // Kindled pair.
  it("replays one selection from a band of entry-transfiguration pairs", () => {
    const cards: CardData[] = [];
    const deckEntries: DeckEntry[] = [];

    // The Direwolf: a high-spark Character. Kindled benefit = (8-4)/4 = 1.0.
    const direwolf = makeMerchantTestCard({
      id: uuid(900),
      cardNumber: 900,
      name: asCardName("Marked Direwolf"),
      cardType: "Character",
      energyCost: 0, // not Empowered-eligible: Kindled is its ONLY eligibility
      spark: 4,
      renderedText: "", // no digit/trigger/activated
    });
    cards.push(direwolf);
    deckEntries.push(
      makeMerchantTestDeckEntry({ entryId: "direwolf", cardNumber: 900 }),
    );
    // The Kindled pair on the direwolf: benefit clamp01((8-4)/4)=1.0.

    // 7 other Event cards, each eligible for Inspired + Enduring (benefit 0.55)
    // and Hastened (benefit 0.5), so each contributes 3 pairs -> >= 7 distinct
    // positive-benefit pairs easily.
    for (let i = 0; i < 7; i += 1) {
      const n = 800 + i;
      cards.push(
        makeMerchantTestCard({
          id: uuid(n),
          cardNumber: n,
          name: asCardName(`Event ${String(n)}`),
          cardType: "Event",
          energyCost: 0,
          spark: null,
          renderedText: "Deal damage.",
        }),
      );
      deckEntries.push(
        makeMerchantTestDeckEntry({ entryId: `evt-${String(i)}`, cardNumber: n }),
      );
    }

    const context = makeContext({ cards, deckEntries });

    const first = transfigureBuilder.build(context, merchantRng("first"));
    const replay = transfigureBuilder.build(context, merchantRng("unrelated"));
    expect(first).not.toBeNull();
    expect(replay?.targetKey).toBe(first?.targetKey);
    expect(first?.selectionTrace?.candidateCount).toBeGreaterThanOrEqual(3);
    expect(first?.selectionTrace?.band.candidates.some((candidate) =>
      candidate.key === "direwolf:Kindled")).toBe(true);
  });

  it("targetKey is entryId:transfiguration and payload applies", () => {
    const card = makeMerchantTestCard({
      id: uuid(400),
      cardNumber: 400,
      cardType: "Character",
      energyCost: 4,
      spark: 2,
    });
    const deckEntries = [
      makeMerchantTestDeckEntry({ entryId: "e1", cardNumber: 400 }),
    ];
    const context = makeContext({ cards: [card], deckEntries });
    const draft = transfigureBuilder.build(context, merchantRng("s"));
    expect(draft).not.toBeNull();
    expect(draft?.targetKey).toMatch(/^e1:/);
    expect(draft?.applyPayload?.kind).toBe("transfigure_deck_entry");

    const journeyState = makeMerchantTestJourneyState({ deck: deckEntries });
    const journeyContent = makeMerchantTestContent({ cards: [card] });
    const next = applyMerchantPayloadToState({
      state: journeyState,
      journeyContent,
      payload: draft!.applyPayload!,
    });
    expect(next).not.toBeNull();
    expect(next?.deck[0].transfiguration).not.toBeNull();
  });
});

// --- Task 11: starter_transfigure --------------------------------------------

describe("improve family — starter_transfigure", () => {
  it("is eligible only when an untransfigured starter has an eligible transfiguration", () => {
    const starter = makeMerchantTestCard({
      id: uuid(500),
      cardNumber: 500,
      cardType: "Character",
      isStarter: true,
      energyCost: 4,
      spark: 2,
    });
    const eligibleCtx = makeContext({
      cards: [starter],
      deckEntries: [
        makeMerchantTestDeckEntry({ entryId: "s1", cardNumber: 500 }),
      ],
    });
    expect(starterTransfigureBuilder.eligible(eligibleCtx)).toBe(true);

    const transfiguredCtx = makeContext({
      cards: [starter],
      deckEntries: [
        makeMerchantTestDeckEntry({
          entryId: "s1",
          cardNumber: 500,
          transfiguration: "Kindled",
        }),
      ],
    });
    expect(starterTransfigureBuilder.eligible(transfiguredCtx)).toBe(false);
  });

  it("targets only starter entries with a composite payload of 1-2 transfigures", () => {
    const starters = [0, 1].map((i) =>
      makeMerchantTestCard({
        id: uuid(600 + i),
        cardNumber: 600 + i,
        cardType: "Character",
        isStarter: true,
        energyCost: 4,
        spark: 2,
      }),
    );
    const nonStarter = makeMerchantTestCard({
      id: uuid(610),
      cardNumber: 610,
      cardType: "Character",
      isStarter: false,
      energyCost: 4,
      spark: 2,
    });
    const deckEntries = [
      makeMerchantTestDeckEntry({ entryId: "s0", cardNumber: 600 }),
      makeMerchantTestDeckEntry({ entryId: "s1", cardNumber: 601 }),
      makeMerchantTestDeckEntry({ entryId: "ns", cardNumber: 610 }),
    ];
    const context = makeContext({
      cards: [...starters, nonStarter],
      deckEntries,
    });

    for (let seed = 0; seed < 20; seed += 1) {
      const draft = starterTransfigureBuilder.build(
        context,
        merchantRng("s", String(seed)),
      );
      expect(draft).not.toBeNull();
      if (draft === null) continue;
      const payload = draft.applyPayload;
      expect(payload?.kind).toBe("composite");
      if (payload?.kind !== "composite") continue;
      expect(payload.children.length).toBeGreaterThanOrEqual(1);
      expect(payload.children.length).toBeLessThanOrEqual(2);
      for (const child of payload.children) {
        expect(child.kind).toBe("transfigure_deck_entry");
        if (child.kind === "transfigure_deck_entry") {
          expect(["s0", "s1"]).toContain(child.entryId);
        }
      }
    }
  });
});

// --- Task 12: keyword_mod -----------------------------------------------------

describe("improve family — keyword_mod", () => {
  function eventCard(
    overrides: Partial<CardData> & Pick<CardData, "id" | "cardNumber">,
  ): CardData {
    return makeMerchantTestCard({
      cardType: "Event",
      spark: null,
      isFast: false,
      renderedText: "Deal damage.",
      ...overrides,
    });
  }

  it("offers reduce_reclaim only for Events whose Reclaim cost exceeds 1", () => {
    // A plain Event with no Reclaim: no candidate (granting Reclaim is the
    // Enduring transfiguration, granting Fast is Hastened).
    const plain = eventCard({ id: uuid(1000), cardNumber: 1000 });
    // An Event with reclaimCost 3: reduce_reclaim.
    const reclaimer = eventCard({
      id: uuid(1001),
      cardNumber: 1001,
      isFast: true,
      reclaimCost: 3,
      renderedText: "Deal damage. Reclaim 3●",
    });
    const context = makeContext({
      cards: [plain, reclaimer],
      deckEntries: [
        makeMerchantTestDeckEntry({ entryId: "plain", cardNumber: 1000 }),
        makeMerchantTestDeckEntry({ entryId: "reclaimer", cardNumber: 1001 }),
      ],
    });
    const pairs = keywordModCandidatePairs(context);
    const byEntry = (id: string) =>
      new Set(pairs.filter((p) => p.entryId === id).map((p) => p.variant));
    expect(byEntry("plain")).toEqual(new Set([]));
    expect(byEntry("reclaimer")).toEqual(new Set(["reduce_reclaim"]));
  });

  it("never pairs non-Events", () => {
    const character = makeMerchantTestCard({
      id: uuid(1100),
      cardNumber: 1100,
      cardType: "Character",
    });
    const context = makeContext({
      cards: [character],
      deckEntries: [
        makeMerchantTestDeckEntry({ entryId: "c", cardNumber: 1100 }),
      ],
    });
    expect(keywordModCandidatePairs(context)).toHaveLength(0);
    expect(keywordModBuilder.eligible(context)).toBe(false);
  });

  it("excludes reduce_reclaim when the effective Reclaim cost is exactly 1", () => {
    const ev = eventCard({ id: uuid(1200), cardNumber: 1200 });
    const context = makeContext({
      cards: [ev],
      deckEntries: [
        makeMerchantTestDeckEntry({
          entryId: "e",
          cardNumber: 1200,
          keywordModification: { reclaim: 1 },
        }),
      ],
    });
    // The modified Reclaim cost is exactly 1, so reduce_reclaim is excluded and
    // the entry yields no keyword_mod candidate.
    expect(keywordModCandidatePairs(context)).toHaveLength(0);
  });

  it("offers reduce_reclaim against the effective (modified) cost", () => {
    const ev = eventCard({
      id: uuid(1300),
      cardNumber: 1300,
      isFast: true,
    });
    const context = makeContext({
      cards: [ev],
      deckEntries: [
        makeMerchantTestDeckEntry({
          entryId: "e",
          cardNumber: 1300,
          keywordModification: { setReclaim: 4 },
        }),
      ],
    });
    const reduce = keywordModCandidatePairs(context).find(
      (p) => p.variant === "reduce_reclaim",
    );
    expect(reduce).toBeDefined();
    expect(reduce?.payload.kind).toBe("change_deck_entry_keywords");
    if (reduce?.payload.kind === "change_deck_entry_keywords") {
      // Effective cost 4 -> setReclaim 3.
      expect(reduce.payload.keywords.setReclaim).toBe(3);
    }
  });

  it("reduces the Reclaim cost and applies the payload", () => {
    const ev = eventCard({
      id: uuid(1400),
      cardNumber: 1400,
      reclaimCost: 3,
      renderedText: "Deal damage. Reclaim 3●",
    });
    const deckEntries = [
      makeMerchantTestDeckEntry({ entryId: "e", cardNumber: 1400 }),
    ];
    const context = makeContext({ cards: [ev], deckEntries });
    const draft = keywordModBuilder.build(context, merchantRng("k", "0"));
    expect(draft).not.toBeNull();
    expect(draft?.applyPayload?.kind).toBe("change_deck_entry_keywords");
    if (draft?.applyPayload?.kind === "change_deck_entry_keywords") {
      // Effective Reclaim cost 3 -> setReclaim 2.
      expect(draft.applyPayload.keywords.setReclaim).toBe(2);
    }

    const journeyState = makeMerchantTestJourneyState({ deck: deckEntries });
    const journeyContent = makeMerchantTestContent({ cards: [ev] });
    const next = applyMerchantPayloadToState({
      state: journeyState,
      journeyContent,
      payload: draft!.applyPayload!,
    });
    expect(next).not.toBeNull();
    expect(next?.deck[0].keywordModification).toBeDefined();
  });
});

// --- Task 12: tribal_change ---------------------------------------------------

describe("improve family — tribal_change", () => {
  function tribeChar(
    n: number,
    subtype: string,
    extra: Partial<CardData> = {},
  ): CardData {
    return makeMerchantTestCard({
      id: uuid(n),
      cardNumber: n,
      cardType: "Character",
      subtype,
      ...extra,
    });
  }

  it("is ineligible at 3 in-tribe Characters and eligible at 4", () => {
    // 3 Warriors + 1 off-tribe Character. Threshold 4: not active.
    const warriors3 = [0, 1, 2].map((i) => tribeChar(1500 + i, "Warrior"));
    const off = tribeChar(1599, "Spirit Animal");
    const ctx3 = makeContext({
      cards: [...warriors3, off],
      deckEntries: [
        ...warriors3.map((c, i) =>
          makeMerchantTestDeckEntry({ entryId: `w${i}`, cardNumber: c.cardNumber }),
        ),
        makeMerchantTestDeckEntry({ entryId: "off", cardNumber: 1599 }),
      ],
    });
    expect(tribalChangeBuilder.eligible(ctx3)).toBe(false);

    // 4 Warriors + 1 off-tribe Character. Active.
    const warriors4 = [0, 1, 2, 3].map((i) => tribeChar(1600 + i, "Warrior"));
    const off2 = tribeChar(1699, "Spirit Animal");
    const ctx4 = makeContext({
      cards: [...warriors4, off2],
      deckEntries: [
        ...warriors4.map((c, i) =>
          makeMerchantTestDeckEntry({ entryId: `w${i}`, cardNumber: c.cardNumber }),
        ),
        makeMerchantTestDeckEntry({ entryId: "off", cardNumber: 1699 }),
      ],
    });
    expect(tribalChangeBuilder.eligible(ctx4)).toBe(true);
  });

  it("excludes in-tribe Characters, Events, and entries with a prior typeChange", () => {
    const warriors = [0, 1, 2, 3].map((i) => tribeChar(1700 + i, "Warrior"));
    const offChar = tribeChar(1798, "Survivor");
    const event = makeMerchantTestCard({
      id: uuid(1799),
      cardNumber: 1799,
      cardType: "Event",
      subtype: "Survivor",
      spark: null,
    });
    const alreadyChanged = tribeChar(1797, "Outsider");
    const context = makeContext({
      cards: [...warriors, offChar, event, alreadyChanged],
      deckEntries: [
        ...warriors.map((c, i) =>
          makeMerchantTestDeckEntry({ entryId: `w${i}`, cardNumber: c.cardNumber }),
        ),
        makeMerchantTestDeckEntry({ entryId: "off", cardNumber: 1798 }),
        makeMerchantTestDeckEntry({ entryId: "evt", cardNumber: 1799 }),
        makeMerchantTestDeckEntry({
          entryId: "changed",
          cardNumber: 1797,
          typeChange: {
            predicateId: "x",
            cardType: "Character",
            subtype: "Warrior",
            label: "x",
          },
        }),
      ],
    });

    const seen = new Set<string>();
    for (let s = 0; s < 40; s += 1) {
      const draft = tribalChangeBuilder.build(context, merchantRng("t", String(s)));
      if (draft === null) continue;
      const payload = draft.applyPayload;
      if (payload?.kind === "change_deck_entry_type") {
        seen.add(payload.entryId);
      }
    }
    // Only the off-tribe Character with no prior typeChange is a candidate.
    expect(seen).toEqual(new Set(["off"]));
  });

  it("applies a Character subtype change preserving the Character type", () => {
    const warriors = [0, 1, 2, 3].map((i) => tribeChar(1800 + i, "Warrior"));
    const off = tribeChar(1899, "Spirit Animal");
    const deckEntries = [
      ...warriors.map((c, i) =>
        makeMerchantTestDeckEntry({ entryId: `w${i}`, cardNumber: c.cardNumber }),
      ),
      makeMerchantTestDeckEntry({ entryId: "off", cardNumber: 1899 }),
    ];
    const cards = [...warriors, off];
    const context = makeContext({ cards, deckEntries });
    const draft = tribalChangeBuilder.build(context, merchantRng("t"));
    expect(draft).not.toBeNull();
    const payload = draft?.applyPayload;
    expect(payload?.kind).toBe("change_deck_entry_type");
    if (payload?.kind !== "change_deck_entry_type") return;
    expect(payload.typeChange.cardType).toBe("Character");
    expect(TRIBES).toContain(payload.typeChange.subtype);
    expect(payload.typeChange.predicateId).toBe(
      `merchant:tribal:${payload.typeChange.subtype}`,
    );

    const journeyState = makeMerchantTestJourneyState({ deck: deckEntries });
    const journeyContent = makeMerchantTestContent({ cards });
    const next = applyMerchantPayloadToState({
      state: journeyState,
      journeyContent,
      payload,
    });
    expect(next).not.toBeNull();
    const changed = next?.deck.find((e) => e.entryId === "off");
    expect(changed?.typeChange?.cardType).toBe("Character");
  });
});
