import { beforeEach, describe, expect, it } from "vitest";

import type {
  DreamsignSignature,
  KnownGoodDecklist,
} from "../../data/journey-content";
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamsignTemplate,
} from "../../types/content";
import type { CardData } from "../../types/cards";
import { getLogEntries, resetLog } from "../../logging";
import { STARTER_CARD_NUMBERS } from "../../data/starter-cards";

import {
  STAGE_B_LAYER_SPEC,
  buildCorpusOpponentDeck,
  compareCodeUnits,
} from "./corpus-opponent-deck";

// ---------------------------------------------------------------------------
// Synthetic fixtures
//
// Identity is ALWAYS the lowercased UUID. Card numbers are display-only. We
// deliberately give two distinct cards the SAME display name to prove the
// algorithm keys on the UUID, never on the name.
// ---------------------------------------------------------------------------

function makeCard(
  uuid: string,
  cardNumber: number,
  name: string,
  rarity?: CardData["rarity"],
): CardData {
  return {
    id: uuid,
    cardNumber,
    name,
    cardType: "Character",
    subtype: "",
    isStarter: rarity === "Starter",
    rarity,
    energyCost: 1,
    spark: 1,
  } as CardData;
}

function makeDecklist(
  id: string,
  mainboardIds: string[],
  name = `deck ${id}`,
): KnownGoodDecklist {
  return {
    id,
    draftId: `draft-${id}`,
    seat: 0,
    name,
    mainboardIds,
  };
}

function makeDreamAvatar(
  id: string,
  signatureCardIds: string[],
): DreamAvatarContent {
  return {
    id,
    name: `dreamAvatar ${id}`,
    title: "t",
    renderedText: "",
    imageNumber: "1",
    startingEssence: 200,
    signatureCardIds,
  };
}

function makeAffiliation(
  id: string,
  signatureCards: string[],
): AffiliationContent {
  return {
    id,
    name: `affiliation ${id}`,
    atlasCardTheme: "Fixture",
    signatureCards,
    weightStrength: 1,
    opponentBiasStrength: 1,
  };
}

function cardDb(cards: CardData[]): ReadonlyMap<number, CardData> {
  return new Map(cards.map((c) => [c.cardNumber, c]));
}

// A pool of distinct cards, all distinct UUIDs and card numbers.
const C = {
  a: makeCard("aaaaaaaa-0000-0000-0000-000000000001", 1, "Alpha"),
  b: makeCard("bbbbbbbb-0000-0000-0000-000000000002", 2, "Beta"),
  c: makeCard("cccccccc-0000-0000-0000-000000000003", 3, "Gamma"),
  d: makeCard("dddddddd-0000-0000-0000-000000000004", 4, "Delta"),
  e: makeCard("eeeeeeee-0000-0000-0000-000000000005", 5, "Epsilon"),
  f: makeCard("ffffffff-0000-0000-0000-000000000006", 6, "Zeta"),
  g: makeCard("11111111-0000-0000-0000-000000000007", 7, "Eta"),
  h: makeCard("22222222-0000-0000-0000-000000000008", 8, "Theta"),
};

const ALL_CARDS = Object.values(C);

const baseArgs = {
  dreamsignSignatures: undefined,
  dreamsignTemplates: [],
  completionLevel: 0,
  layerCount: 0,
};

describe("buildCorpusOpponentDeck Stage A (selection)", () => {
  it("returns null when there are no known-good decklists", () => {
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamAvatar: makeDreamAvatar("dc", [C.a.id]),
      knownGoodDecklists: [],
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 1,
    });
    expect(result).toBeNull();
  });

  it("is deterministic and pure for identical args including poolSeed", () => {
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id, C.c.id]),
      makeDecklist("d2", [C.a.id, C.d.id, C.e.id]),
      makeDecklist("d3", [C.a.id, C.f.id, C.g.id]),
    ];
    const args = {
      ...baseArgs,
      opponentDreamAvatar: makeDreamAvatar("dc", [C.a.id]),
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 42,
    };
    const first = buildCorpusOpponentDeck(args);
    const second = buildCorpusOpponentDeck(args);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.source.id).toBe(second?.source.id);
    // Calling did not mutate the input arrays.
    expect(decks).toHaveLength(3);
  });

  it("produces selection variety across many seeds when ≥2 candidates exist", () => {
    // Three decks all sharing the signature card C.a (all candidates), but
    // with otherwise distinct contents so their fits differ only slightly.
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id, C.c.id]),
      makeDecklist("d2", [C.a.id, C.b.id, C.d.id]),
      makeDecklist("d3", [C.a.id, C.c.id, C.e.id]),
    ];
    const selected = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamAvatar: makeDreamAvatar("dc", [C.a.id]),
        knownGoodDecklists: decks,
        affiliation: null,
        cardDatabase: cardDb(ALL_CARDS),
        poolSeed: seed,
      });
      if (result) selected.add(result.source.id);
    }
    expect(selected.size).toBeGreaterThan(1);
  });

  it("gates candidates on shared signature cards (UUID overlap)", () => {
    // d1 + d2 share signature C.a; d3 shares no signature card.
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id, C.c.id]),
      makeDecklist("d2", [C.a.id, C.d.id, C.e.id]),
      makeDecklist("d3", [C.f.id, C.g.id, C.h.id]),
    ];
    const dreamAvatar = makeDreamAvatar("dc", [C.a.id]);
    const everSelected = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamAvatar: dreamAvatar,
        knownGoodDecklists: decks,
        affiliation: null,
        cardDatabase: cardDb(ALL_CARDS),
        poolSeed: seed,
      });
      expect(result).not.toBeNull();
      // Every member of topK must share ≥1 signature card.
      for (const member of result!.topK) {
        const deck = decks.find((d) => d.id === member.id)!;
        expect(deck.mainboardIds).toContain(C.a.id);
      }
      if (result) everSelected.add(result.source.id);
    }
    // The non-candidate deck is never selected.
    expect(everSelected.has("d3")).toBe(false);
    expect(everSelected.size).toBeGreaterThan(0);
  });

  it("treats signature fit as primary; a single high affiliationFit deck does not overtake a much-higher signatureFit deck (λ=0.25)", () => {
    // Build so the signatureFit gap between dHigh and dLow exceeds 0.25.
    // dHigh shares two rare signature cards; dLow shares one common one.
    // Affiliation probe targets dLow's contents to boost its affiliationFit.
    const sigHigh = [C.a.id, C.b.id];
    const decks = [
      // dHigh: contains BOTH signature cards (high signatureFit), nothing else.
      makeDecklist("dHigh", [C.a.id, C.b.id]),
      // dLow: contains only ONE signature card plus affiliation-aligned cards.
      makeDecklist("dLow", [C.a.id, C.d.id, C.e.id, C.f.id]),
      // Filler decks so idf has spread and dHigh's sig cards are rare.
      makeDecklist("f1", [C.d.id, C.e.id, C.f.id]),
      makeDecklist("f2", [C.d.id, C.e.id, C.g.id]),
      makeDecklist("f3", [C.f.id, C.g.id, C.h.id]),
    ];
    // Affiliation aligned with dLow's filler cards to inflate its affinity.
    const affiliation = makeAffiliation("aff", [C.d.id, C.e.id, C.f.id]);
    const everSelected = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamAvatar: makeDreamAvatar("dc", sigHigh),
        knownGoodDecklists: decks,
        affiliation,
        cardDatabase: cardDb(ALL_CARDS),
        poolSeed: seed,
      });
      expect(result).not.toBeNull();
      if (result) everSelected.add(result.source.id);
    }
    // dHigh's signatureFit lead exceeds the max affiliation contribution (0.25),
    // so dLow must never overtake it: dHigh is always the top-ranked candidate.
    // Across seeds we sample the window, but dHigh must be selectable and dLow
    // must not strictly dominate — verify dHigh's combined beats dLow's.
    const probe = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamAvatar: makeDreamAvatar("dc", sigHigh),
      knownGoodDecklists: decks,
      affiliation,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    })!;
    const high = probe.topK.find((t) => t.id === "dHigh");
    const low = probe.topK.find((t) => t.id === "dLow");
    expect(high).toBeDefined();
    expect(low).toBeDefined();
    expect(high!.combined).toBeGreaterThan(low!.combined);
    // Sanity: at least dHigh and dLow are candidates that get selected.
    expect(everSelected.has("dHigh")).toBe(true);
  });

  it("falls back to all decks ranked by affiliationFit when the DreamAvatar has no signature cards", () => {
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id]),
      makeDecklist("d2", [C.c.id, C.d.id]),
      makeDecklist("d3", [C.e.id, C.f.id]),
    ];
    // Affiliation strongly aligned with d1's cards.
    const affiliation = makeAffiliation("aff", [C.a.id, C.b.id]);
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamAvatar: makeDreamAvatar("dc", []),
      knownGoodDecklists: decks,
      affiliation,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });
    expect(result).not.toBeNull();
    // Candidate set = all decks (signature-less fallback).
    expect(result!.candidateCount).toBe(3);
    // signatureFit must be 0 since there is no signature probe.
    expect(result!.signatureFit).toBe(0);
    // The highest-affiliationFit deck (d1) ranks first.
    expect(result!.topK[0]?.id).toBe("d1");
  });

  it("handles a null DreamAvatar as a signature-less build", () => {
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id]),
      makeDecklist("d2", [C.c.id, C.d.id]),
    ];
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamAvatar: null,
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.candidateCount).toBe(2);
    expect(result!.signatureFit).toBe(0);
  });

  it("uses locale-free code-unit ordering for tied deck ids", () => {
    expect(compareCodeUnits("B", "a")).toBeLessThan(0);

    const decks = [
      makeDecklist("a", [C.a.id, C.b.id]),
      makeDecklist("B", [C.c.id, C.d.id]),
    ];
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamAvatar: null,
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.topK.map((member) => member.id)).toEqual(["a", "B"]);
  });

  it("produces 0 affiliationFit and no NaN/Infinity when affiliation is null (neutral dreamscape)", () => {
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id, C.c.id]),
      makeDecklist("d2", [C.a.id, C.d.id, C.e.id]),
    ];
    for (let seed = 0; seed < 20; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamAvatar: makeDreamAvatar("dc", [C.a.id]),
        knownGoodDecklists: decks,
        affiliation: null,
        cardDatabase: cardDb(ALL_CARDS),
        poolSeed: seed,
      });
      expect(result).not.toBeNull();
      expect(result!.affiliationFit).toBe(0);
      expect(Number.isFinite(result!.signatureFit)).toBe(true);
      expect(Number.isFinite(result!.combined)).toBe(true);
      for (const member of result!.topK) {
        expect(Number.isFinite(member.combined)).toBe(true);
      }
    }
  });

  it("preserves the Stage A selection fields (baseCards = selected deck's distinct cards)", () => {
    const decks = [makeDecklist("d1", [C.a.id, C.b.id, C.c.id])];
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamAvatar: makeDreamAvatar("dc", [C.a.id]),
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });
    expect(result).not.toBeNull();
    // The selection axis is unaffected by Stage B tuning: baseCards still holds
    // the selected deck's distinct cards in order, and the source/topK reflect
    // the single candidate.
    expect(result!.baseCards.map((c) => c.id)).toEqual([C.a.id, C.b.id, C.c.id]);
    expect(result!.source.id).toBe("d1");
    expect(result!.topK.map((t) => t.id)).toEqual(["d1"]);
  });

  it("dedups baseCards by UUID and resolves cards via the database", () => {
    // A decklist that lists the same UUID twice (defensive dedup).
    const decks = [makeDecklist("d1", [C.a.id, C.a.id, C.b.id])];
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamAvatar: makeDreamAvatar("dc", [C.a.id]),
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });
    expect(result).not.toBeNull();
    const ids = result!.baseCards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // distinct
    expect(ids).toContain(C.a.id);
    expect(ids).toContain(C.b.id);
    expect(ids).toHaveLength(2);
  });

  it("keys candidacy, fit, and selection on the UUID even when two cards share a display name (load-bearing)", () => {
    // Two DISTINCT cards share the display name "Twin". One is the signature
    // card (sigTwin); the other (decoyTwin) is NOT a signature.
    const sigTwin = makeCard(
      "99999999-0000-0000-0000-00000000aaaa",
      101,
      "Twin",
    );
    const decoyTwin = makeCard(
      "88888888-0000-0000-0000-00000000bbbb",
      102,
      "Twin",
    );
    const filler1 = makeCard("77777777-0000-0000-0000-00000000cccc", 103, "F1");
    const filler2 = makeCard("66666666-0000-0000-0000-00000000dddd", 104, "F2");
    const filler3 = makeCard("55555555-0000-0000-0000-00000000eeee", 105, "F3");
    const db = cardDb([sigTwin, decoyTwin, filler1, filler2, filler3]);

    // sigDeck contains the SIGNATURE uuid; decoyDeck contains the SAME-NAMED
    // but distinct non-signature uuid.
    const decks = [
      makeDecklist("sigDeck", [sigTwin.id, filler1.id, filler2.id]),
      makeDecklist("decoyDeck", [decoyTwin.id, filler1.id, filler3.id]),
    ];
    const dreamAvatar = makeDreamAvatar("dc", [sigTwin.id]);

    const everSelected = new Set<string>();
    let observedTopK: { id: string; name: string; combined: number }[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamAvatar: dreamAvatar,
        knownGoodDecklists: decks,
        affiliation: null,
        cardDatabase: db,
        poolSeed: seed,
      });
      expect(result).not.toBeNull();
      observedTopK = result!.topK;
      // Only the deck holding the signature UUID is a candidate.
      expect(result!.candidateCount).toBe(1);
      if (result) everSelected.add(result.source.id);
    }
    // The decoy deck (same display name, different UUID) is never a candidate
    // nor selected.
    expect(everSelected.has("decoyDeck")).toBe(false);
    expect(everSelected).toEqual(new Set(["sigDeck"]));
    expect(observedTopK.map((t) => t.id)).toEqual(["sigDeck"]);
    // The selected deck has positive signatureFit (the signature UUID overlapped).
    const selected = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamAvatar: dreamAvatar,
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: db,
      poolSeed: 0,
    })!;
    expect(selected.signatureFit).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Stage B (layer tuning) fixtures + tests
//
// Tests are driven off STAGE_B_LAYER_SPEC (the exported schedule descriptor)
// rather than hardcoding constants/counts: we assert the SCHEDULE shape,
// ordering, determinism, and size preservation, not specific TOML values.
// ---------------------------------------------------------------------------

/** Ten Starter cards resolved from the production STARTER_CARD_NUMBERS. */
const STARTERS: CardData[] = STARTER_CARD_NUMBERS.map((num, i) =>
  makeCard(
    `5000${i}000-0000-0000-0000-0000000005${String(10 + i).padStart(2, "0")}`,
    num,
    `Starter ${String(num)}`,
    "Starter",
  ),
);

/** Two Legendary cards (rarity "Legendary"). */
const LEG = {
  l1: makeCard("aaaa1111-0000-0000-0000-0000000000l1", 201, "Leg One", "Legendary"),
  l2: makeCard("aaaa2222-0000-0000-0000-0000000000l2", 202, "Leg Two", "Legendary"),
};

/**
 * Twelve ordinary (non-starter, non-legendary) cards. The supporting corpus
 * below arranges a clear synergy gradient: the "core" cards (n00..n05) co-occur
 * in many decks (high synergy), while the "fringe" cards (n06..n11) appear in
 * isolated decks (low synergy, the first to be cut).
 */
const N: CardData[] = Array.from({ length: 12 }, (_, i) =>
  makeCard(
    `bbbb${String(i).padStart(4, "0")}-0000-0000-0000-00000000n${String(i).padStart(3, "0")}`,
    300 + i,
    `Normal ${String(i)}`,
  ),
);

/**
 * A signature card. The DreamAvatar keys on this UUID; both candidate decks
 * carry it, so the candidate window is exactly those two decks — this gives
 * Stage B's legendary-replacement step a pool of non-deck cards to draw from
 * (the other window deck's cards). Both candidate decks share the same
 * structural shape, so the layer invariants hold regardless of which the
 * seeded sampler picks.
 */
const SIG = makeCard("c5161111-0000-0000-0000-0000000005ig", 400, "Sig Card");

/**
 * Replacement-pool ordinary cards: live in the SECOND candidate deck only, so
 * after legendary suppression they are available as non-legendary, non-deck
 * replacements regardless of which candidate deck was selected.
 */
const R: CardData[] = Array.from({ length: 4 }, (_, i) =>
  makeCard(
    `cccc${String(i).padStart(4, "0")}-0000-0000-0000-00000000r${String(i).padStart(3, "0")}`,
    420 + i,
    `Repl ${String(i)}`,
  ),
);

const STAGE_B_DB = cardDb([...STARTERS, LEG.l1, LEG.l2, ...N, SIG, ...R]);

/**
 * The target deck: the signature card, both legendaries, and all twelve
 * ordinary cards.
 */
const STAGE_B_DECK_IDS = [
  SIG.id,
  LEG.l1.id,
  LEG.l2.id,
  ...N.map((c) => c.id),
];

// Supporting corpus decks shape co-occurrence. The "core" cluster (n00..n05 +
// the legendaries) appears together in many decks → high synergy. The "fringe"
// cards (n06..n11) appear in isolated decks → low synergy, cut first. The
// second candidate deck (`target2`) also carries SIG so it joins the window and
// supplies the R cards as legendary replacements; it shares target's core/
// fringe shape so the synergy gradient is the same whichever is selected.
const STAGE_B_DECKS: KnownGoodDecklist[] = [
  makeDecklist("target", STAGE_B_DECK_IDS, "Target Deck"),
  makeDecklist(
    "target2",
    [SIG.id, LEG.l1.id, LEG.l2.id, ...N.map((c) => c.id), ...R.map((c) => c.id)],
    "Target Deck 2",
  ),
  makeDecklist("core1", [LEG.l1.id, N[0].id, N[1].id, N[2].id, N[3].id]),
  makeDecklist("core2", [LEG.l1.id, N[0].id, N[1].id, N[2].id, N[4].id]),
  makeDecklist("core3", [LEG.l2.id, N[0].id, N[1].id, N[3].id, N[5].id]),
  makeDecklist("core4", [LEG.l2.id, N[1].id, N[2].id, N[4].id, N[5].id]),
  makeDecklist("core5", [N[0].id, N[2].id, N[3].id, N[4].id, N[5].id]),
  makeDecklist("fringe1", [N[6].id, STARTERS[0].id]),
  makeDecklist("fringe2", [N[7].id, STARTERS[1].id]),
  makeDecklist("fringe3", [N[8].id]),
  makeDecklist("fringe4", [N[9].id]),
  makeDecklist("fringe5", [N[10].id]),
  makeDecklist("fringe6", [N[11].id]),
];

// DreamAvatar signature is the SIG card carried by the two candidate decks.
const STAGE_B_DC = makeDreamAvatar("dcB", [SIG.id]);

// Synthetic dreamsigns: two tailored (one overlapping the deck strongly, one
// weakly) and one neutral.
const DS_STRONG = "ds-strong-0000-0000-0000-000000000001";
const DS_WEAK = "ds-weak-0000-0000-0000-0000000000002";
const DS_NEUTRAL = "ds-neutral-0000-0000-0000-00000000003";

const STAGE_B_SIGNATURES: ReadonlyMap<string, DreamsignSignature> = new Map([
  [
    DS_STRONG,
    {
      id: DS_STRONG,
      category: "tailored",
      // Overlaps several core (high-idf-ish) cards in the deck.
      signatureCardIds: [N[0].id, N[1].id, N[2].id],
    },
  ],
  [
    DS_WEAK,
    {
      id: DS_WEAK,
      category: "tailored",
      // Overlaps just one fringe card in the deck.
      signatureCardIds: [N[11].id],
    },
  ],
  [
    DS_NEUTRAL,
    { id: DS_NEUTRAL, category: "neutral", signatureCardIds: [] },
  ],
]);

const STAGE_B_TEMPLATES: DreamsignTemplate[] = [
  {
    id: DS_STRONG,
    name: "Strong Sign",
    effectDescription: "",
  },
  {
    id: DS_WEAK,
    name: "Weak Sign",
    effectDescription: "",
  },
  {
    id: DS_NEUTRAL,
    name: "Neutral Sign",
    effectDescription: "",
  },
];

function buildAtLayer(
  completionLevel: number,
  overrides: Partial<{
    dreamsignSignatures: ReadonlyMap<string, DreamsignSignature> | undefined;
    dreamsignTemplates: DreamsignTemplate[];
    poolSeed: number;
  }> = {},
) {
  // `?? ` would swallow an explicit `undefined` override (which several tests
  // pass deliberately), so detect presence via the `in` operator.
  const dreamsignSignatures =
    "dreamsignSignatures" in overrides
      ? overrides.dreamsignSignatures
      : STAGE_B_SIGNATURES;
  return buildCorpusOpponentDeck({
    opponentDreamAvatar: STAGE_B_DC,
    knownGoodDecklists: STAGE_B_DECKS,
    affiliation: null,
    cardDatabase: STAGE_B_DB,
    dreamsignSignatures,
    dreamsignTemplates: overrides.dreamsignTemplates ?? STAGE_B_TEMPLATES,
    completionLevel,
    layerCount: STAGE_B_LAYER_SPEC.length,
    poolSeed: overrides.poolSeed ?? 7,
  })!;
}

const STARTER_NUMBER_SET = new Set<number>(STARTER_CARD_NUMBERS);

function isStarter(card: CardData): boolean {
  return STARTER_NUMBER_SET.has(card.cardNumber);
}
function isLegendary(card: CardData): boolean {
  return card.rarity === "Legendary";
}

describe("buildCorpusOpponentDeck Stage B (layer tuning)", () => {
  it("exposes a non-trivial layer spec", () => {
    expect(STAGE_B_LAYER_SPEC.length).toBeGreaterThan(1);
    // Each entry describes the four modifications for its layer.
    for (const layer of STAGE_B_LAYER_SPEC) {
      expect(typeof layer.abilityActive).toBe("boolean");
      expect(typeof layer.legendaryAllowed).toBe("boolean");
      expect(typeof layer.startersAdded).toBe("number");
      expect(typeof layer.dreamsignAssigned).toBe("boolean");
    }
  });

  it("preserves deck size at every scheduled layer", () => {
    for (let layer = 0; layer < STAGE_B_LAYER_SPEC.length; layer += 1) {
      const result = buildAtLayer(layer);
      expect(result.finalCards.length).toBe(result.baseCards.length);
    }
  });

  it("applies the ability flag per the schedule at every layer", () => {
    for (let layer = 0; layer < STAGE_B_LAYER_SPEC.length; layer += 1) {
      const result = buildAtLayer(layer);
      expect(result.abilityActive).toBe(STAGE_B_LAYER_SPEC[layer].abilityActive);
    }
  });

  it("suppresses legendaries until the schedule allows them, then retains", () => {
    for (let layer = 0; layer < STAGE_B_LAYER_SPEC.length; layer += 1) {
      const result = buildAtLayer(layer);
      const finalLegendaries = result.finalCards.filter(isLegendary);
      const baseLegendaries = result.baseCards.filter(isLegendary);
      if (STAGE_B_LAYER_SPEC[layer].legendaryAllowed) {
        // Boundary: legendaries that were in the base deck are retained.
        expect(finalLegendaries.length).toBe(baseLegendaries.length);
        expect(result.modifications.legendariesRemoved).toHaveLength(0);
      } else {
        // No legendary survives in the final deck.
        expect(finalLegendaries).toHaveLength(0);
        // Every base legendary was recorded as removed.
        expect(result.modifications.legendariesRemoved.map((c) => c.id).sort()).toEqual(
          baseLegendaries.map((c) => c.id).sort(),
        );
        // Replacements are non-legendary and not already used.
        for (const rep of result.modifications.legendaryReplacements) {
          expect(isLegendary(rep)).toBe(false);
        }
      }
    }
  });

  it("adds the scheduled number of starters per layer (and zero when scheduled)", () => {
    for (let layer = 0; layer < STAGE_B_LAYER_SPEC.length; layer += 1) {
      const result = buildAtLayer(layer);
      const expected = STAGE_B_LAYER_SPEC[layer].startersAdded;
      const added = result.modifications.startersAdded;
      // Every "added starter" is in fact a Starter card by NUMBER.
      for (const s of added) expect(isStarter(s)).toBe(true);
      expect(added.length).toBe(expected);
      // The final deck contains those starters.
      const finalIds = new Set(result.finalCards.map((c) => c.id));
      for (const s of added) expect(finalIds.has(s.id)).toBe(true);
    }
  });

  it("never cuts a starter, and cardsCut are the least-synergistic non-starters", () => {
    // Use a layer that performs a starter dilution cut.
    const layerWithCut = STAGE_B_LAYER_SPEC.findIndex(
      (l) => l.startersAdded > 0 && l.startersAdded < 10,
    );
    expect(layerWithCut).toBeGreaterThanOrEqual(0);
    const result = buildAtLayer(layerWithCut);
    for (const cut of result.modifications.cardsCut) {
      expect(isStarter(cut)).toBe(false);
    }
    // No starter id appears among cut cards.
    const cutIds = new Set(result.modifications.cardsCut.map((c) => c.id));
    for (const s of STARTERS) expect(cutIds.has(s.id)).toBe(false);
    // The cut cards must be lower-synergy than the retained ordinary cards:
    // the fringe cards (n06..n11) are designed to be the least-synergistic, so
    // any cut at a small N takes from the fringe, never the tightly-clustered
    // core cards (n00..n05).
    const coreIds = new Set([N[0].id, N[1].id, N[2].id, N[3].id, N[4].id, N[5].id]);
    for (const cut of result.modifications.cardsCut) {
      expect(coreIds.has(cut.id)).toBe(false);
    }
  });

  it("assigns no dreamsign below the scheduled start layer", () => {
    for (let layer = 0; layer < STAGE_B_LAYER_SPEC.length; layer += 1) {
      if (STAGE_B_LAYER_SPEC[layer].dreamsignAssigned) continue;
      const result = buildAtLayer(layer);
      expect(result.dreamsign).toBeNull();
    }
  });

  it("assigns the best-fitting tailored dreamsign from the scheduled start layer", () => {
    const startLayer = STAGE_B_LAYER_SPEC.findIndex((l) => l.dreamsignAssigned);
    expect(startLayer).toBeGreaterThanOrEqual(0);
    const result = buildAtLayer(startLayer);
    expect(result.dreamsign).not.toBeNull();
    // The strongly-overlapping tailored dreamsign wins over the weak one.
    expect(result.dreamsign!.id).toBe(DS_STRONG);
    expect(result.dreamsign!.fit).toBeGreaterThan(0);
    expect(result.dreamsign!.name).toBe("Strong Sign");
  });

  it("falls back to a neutral dreamsign when no tailored sign overlaps", () => {
    const startLayer = STAGE_B_LAYER_SPEC.findIndex((l) => l.dreamsignAssigned);
    // No tailored sign overlaps: only a neutral signature, and only the neutral
    // template is offered, so the neutral fallback is unambiguous.
    const onlyNeutral = new Map<string, DreamsignSignature>([
      [DS_NEUTRAL, { id: DS_NEUTRAL, category: "neutral", signatureCardIds: [] }],
    ]);
    const result = buildAtLayer(startLayer, {
      dreamsignSignatures: onlyNeutral,
      dreamsignTemplates: [
        { id: DS_NEUTRAL, name: "Neutral Sign", effectDescription: "" },
      ],
    });
    expect(result.dreamsign).not.toBeNull();
    expect(result.dreamsign!.id).toBe(DS_NEUTRAL);
  });

  it("falls back to a neutral dreamsign when dreamsignSignatures is undefined", () => {
    const startLayer = STAGE_B_LAYER_SPEC.findIndex((l) => l.dreamsignAssigned);
    // With no signature map, every template counts as neutral; offer just the
    // neutral template so the fallback selection is unambiguous.
    const result = buildAtLayer(startLayer, {
      dreamsignSignatures: undefined,
      dreamsignTemplates: [
        { id: DS_NEUTRAL, name: "Neutral Sign", effectDescription: "" },
      ],
    });
    expect(result.dreamsign).not.toBeNull();
    expect(result.dreamsign!.id).toBe(DS_NEUTRAL);
  });

  it("is deterministic for identical args across all layers", () => {
    for (let layer = 0; layer < STAGE_B_LAYER_SPEC.length; layer += 1) {
      const a = buildAtLayer(layer);
      const b = buildAtLayer(layer);
      expect(a.finalCards.map((c) => c.id)).toEqual(b.finalCards.map((c) => c.id));
      expect(a.dreamsign?.id ?? null).toBe(b.dreamsign?.id ?? null);
      expect(a.modifications.cardsCut.map((c) => c.id)).toEqual(
        b.modifications.cardsCut.map((c) => c.id),
      );
      expect(a.modifications.startersAdded.map((c) => c.id)).toEqual(
        b.modifications.startersAdded.map((c) => c.id),
      );
    }
  });
});

describe("buildCorpusOpponentDeck Stage B starter-dilution size preservation (boundary cases)", () => {
  // These tests exercise edge cases where naive clamping would cause deck-size
  // drift.  They use synthetic mini-fixtures so they do NOT pin any tunable
  // constant (STARTER_DILUTION values, layer thresholds, etc.).
  //
  // The shared invariant under test:
  //   finalCards.length === baseCards.length
  //   startersAdded.length === cardsCut.length
  //   no duplicate UUIDs in finalCards

  function assertSizePreserved(result: ReturnType<typeof buildCorpusOpponentDeck>) {
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.finalCards.length).toBe(r.baseCards.length);
    expect(r.modifications.startersAdded.length).toBe(r.modifications.cardsCut.length);
    const finalUuids = r.finalCards.map((c) => c.id.toLowerCase());
    expect(new Set(finalUuids).size).toBe(finalUuids.length);
  }

  it("preserves size at layer 0 when the base deck has fewer non-starter cards than the desired dilution count", () => {
    // Layer 0 wants to add all 10 Starters (STARTER_DILUTION[0]), but we build
    // a base deck with only 2 non-starter cards — fewer than 10 — so cuts < 10.
    // The three-way min must clamp additions to match cuts.
    //
    // Deck: 1 signature card (not a starter) + 1 ordinary card = 2 non-starters.
    // Desired dilution at layer 0 = 10 (whatever STARTER_DILUTION[0] is).
    // Available non-starters = 2, addable starters = 10, desired = 10 → count = 2.
    const layer0DilutionSpec = STAGE_B_LAYER_SPEC[0];
    // Guard: this test only makes sense if layer 0 has a dilution > 2.
    expect(layer0DilutionSpec.startersAdded).toBeGreaterThan(2);

    const tinyCard1 = makeCard("fe000001-0000-0000-0000-000000000001", 9001, "Tiny A");
    const tinyCard2 = makeCard("fe000002-0000-0000-0000-000000000002", 9002, "Tiny B");
    const tinySig = makeCard("fe000003-0000-0000-0000-000000000003", 9003, "Tiny Sig");

    // All STARTERS + the tiny cards must be in the database.
    const tinyDb = cardDb([...STARTERS, tinyCard1, tinyCard2, tinySig]);

    // Two decklists: target (only the tiny non-starters) and a filler for corpus.
    const tinyDeck = makeDecklist("tiny", [tinySig.id, tinyCard1.id, tinyCard2.id]);
    const fillerDeck = makeDecklist("filler", [tinyCard1.id, tinyCard2.id]);

    const result = buildCorpusOpponentDeck({
      opponentDreamAvatar: makeDreamAvatar("dc-tiny", [tinySig.id]),
      knownGoodDecklists: [tinyDeck, fillerDeck],
      affiliation: null,
      cardDatabase: tinyDb,
      dreamsignSignatures: undefined,
      dreamsignTemplates: [],
      completionLevel: 0,
      layerCount: STAGE_B_LAYER_SPEC.length,
      poolSeed: 0,
    });

    assertSizePreserved(result);
    // We cut at most 2 non-starters (tinyCard1, tinyCard2) but tinySig is also
    // non-starter — so up to 3 could be cut, but we add at most 3 starters.
    // The key invariant: cuts === additions.
    expect(result!.modifications.cardsCut.length).toBeLessThanOrEqual(
      result!.baseCards.filter((c) => !isStarter(c)).length,
    );
  });

  it("preserves size at layer 0 when the base deck already contains a Starter card", () => {
    // The base deck already includes one Starter (STARTERS[0]).  At layer 0 the
    // desired dilution wants to add all 10 Starters, but STARTERS[0] is already
    // present — so only 9 are addable, while the naive code would try to cut 10
    // non-starters (or add 10 including the already-present one via the duplicate
    // guard skipping it).  The fix must keep cuts === additions.
    const layer0DilutionSpec = STAGE_B_LAYER_SPEC[0];
    expect(layer0DilutionSpec.startersAdded).toBeGreaterThan(1);

    // Build a deck: 1 sig card + 1 ordinary card + 1 starter already present.
    // This guarantees addable = total_starters - 1 < desired (at layer 0 desired
    // = total starters) — so the cap from addable.length kicks in.
    const preseedSig = makeCard("fd000001-0000-0000-0000-000000000001", 9101, "PS Sig");
    const preseedOrd = makeCard("fd000002-0000-0000-0000-000000000002", 9102, "PS Ord");
    const preseededStarter = STARTERS[0]; // already in deck

    const preseedDb = cardDb([...STARTERS, preseedSig, preseedOrd]);

    // Deck includes the starter explicitly.
    const preseedDeckIds = [preseedSig.id, preseedOrd.id, preseededStarter.id];
    const preseedDeck = makeDecklist("preseed", preseedDeckIds);
    const fillerDeck2 = makeDecklist("filler2", [preseedOrd.id, preseedSig.id]);

    const result = buildCorpusOpponentDeck({
      opponentDreamAvatar: makeDreamAvatar("dc-ps", [preseedSig.id]),
      knownGoodDecklists: [preseedDeck, fillerDeck2],
      affiliation: null,
      cardDatabase: preseedDb,
      dreamsignSignatures: undefined,
      dreamsignTemplates: [],
      completionLevel: 0,
      layerCount: STAGE_B_LAYER_SPEC.length,
      poolSeed: 0,
    });

    assertSizePreserved(result);
    // The already-present starter must not be duplicated in finalCards.
    const finalUuids = result!.finalCards.map((c) => c.id.toLowerCase());
    const starterUuid = preseededStarter.id.toLowerCase();
    expect(finalUuids.filter((id) => id === starterUuid).length).toBe(1);
  });
});

describe("buildCorpusOpponentDeck Stage B logging", () => {
  beforeEach(() => {
    resetLog();
  });

  it("emits a corpus_opponent_deck_constructed event with UUID-keyed provenance", () => {
    const startLayer = STAGE_B_LAYER_SPEC.findIndex((l) => l.dreamsignAssigned);
    const result = buildAtLayer(startLayer);
    const entry = getLogEntries().find(
      (e) => e.event === "corpus_opponent_deck_constructed",
    );
    expect(entry).toBeDefined();
    // Source identity is the selected deck.
    expect(entry!.sourceId).toBe(result.source.id);
    expect(entry!.completionLevel).toBe(startLayer);
    expect(entry!.abilityActive).toBe(result.abilityActive);

    // Modification arrays are keyed by UUID and match the build's counts.
    const log = entry as Record<string, unknown>;
    const cardsCut = log.cardsCut as { id: string }[];
    const startersAdded = log.startersAdded as { id: string }[];
    const legendariesRemoved = log.legendariesRemoved as { id: string }[];
    const legendaryReplacements = log.legendaryReplacements as { id: string }[];
    expect(cardsCut.map((c) => c.id)).toEqual(
      result.modifications.cardsCut.map((c) => c.id),
    );
    expect(startersAdded.map((c) => c.id)).toEqual(
      result.modifications.startersAdded.map((c) => c.id),
    );
    expect(legendariesRemoved.map((c) => c.id)).toEqual(
      result.modifications.legendariesRemoved.map((c) => c.id),
    );
    expect(legendaryReplacements.map((c) => c.id)).toEqual(
      result.modifications.legendaryReplacements.map((c) => c.id),
    );
    // Dreamsign provenance.
    const dreamsign = log.dreamsign as { id: string } | null;
    expect(dreamsign?.id ?? null).toBe(result.dreamsign?.id ?? null);
  });

  it("logs layer-correct modification counts at layer 0", () => {
    resetLog();
    buildAtLayer(0);
    const entry = getLogEntries().find(
      (e) => e.event === "corpus_opponent_deck_constructed",
    ) as Record<string, unknown>;
    expect(entry).toBeDefined();
    expect((entry.startersAdded as unknown[]).length).toBe(
      STAGE_B_LAYER_SPEC[0].startersAdded,
    );
    expect(entry.abilityActive).toBe(STAGE_B_LAYER_SPEC[0].abilityActive);
    expect(entry.dreamsign).toBeNull();
  });
});
