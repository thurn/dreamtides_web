import { describe, expect, it } from "vitest";
import { makeBattleTestCardDatabase, makeBattleTestDreamcallers, makeBattleTestSite, makeBattleTestState } from "../test-support";
import { createBattleInit, type CreateBattleInitInput } from "./create-battle-init";
import { deriveBattleSeed } from "../random";
import { buildNameIndex } from "../../data/cards-v2-database";
import { buildPoolData } from "../../draft/pool/pool-data";
import type { RunPoolContext } from "../../data/quest-content";
import type { CardData } from "../../types/cards";
import type { DreamcallerContent } from "../../types/content";
import type { PoolCard } from "../../draft/pool/types";
import type { CardKeywordModification, CardTypeChange } from "../../types/quest";

// The padded minimum battle deck size; the enemy deck is padded up to this.
const MIN_BATTLE_DECK_SIZE = 25;

function makeBaseInput(): CreateBattleInitInput {
  return {
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  };
}

function makePackageCard(
  cardNumber: number,
  cardType: CardData["cardType"],
  energyCost: number,
  packageTide: string,
): CardData {
  return {
    name: `${packageTide} ${String(cardNumber)}`,
    id: `${packageTide}-${String(cardNumber)}`,
    cardNumber,
    cardType,
    subtype: cardType === "Character" ? "Echo" : "Spell",
    isStarter: false,
    energyCost,
    spark: cardType === "Character" ? energyCost : null,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

/**
 * Builds a {@link RunPoolContext} over the battle test card database with two
 * disjoint decklists, each large enough (>= 16 cards) to enter the idf3 corpus.
 * Returns the context plus the card names that make up each decklist so steering
 * assertions can compare against a known set.
 */
function makeSteeredPoolContext(): {
  poolContext: RunPoolContext;
  decklistA: string[];
  decklistB: string[];
} {
  const cardDatabase = makeBattleTestCardDatabase();
  const nameIndex = buildNameIndex(cardDatabase);
  const byNumber = (n: number): string => {
    const card = cardDatabase.get(n);
    if (card === undefined) throw new Error(`missing test card #${String(n)}`);
    return card.name;
  };
  // Decklist A: the "alpha pool" range (1000..1019). Decklist B: the "beta pool"
  // range (1100..1119). Disjoint card sets so a steered draw is distinguishable.
  const decklistA = Array.from({ length: 20 }, (_, i) => byNumber(1000 + i));
  const decklistB = Array.from({ length: 20 }, (_, i) => byNumber(1100 + i));

  const poolCards: PoolCard[] = Array.from(cardDatabase.values()).map((card) => ({
    name: card.name,
  }));
  const poolData = buildPoolData(poolCards, [decklistA, decklistB]);

  const poolContext: RunPoolContext = {
    poolData,
    nameIndex,
    allDreamsignPoolIds: [],
  };
  return { poolContext, decklistA, decklistB };
}

/**
 * Returns a single-Dreamcaller set whose Dreamcaller carries the given signature
 * cards, so the enemy descriptor is deterministic and its signature steers the
 * enemy deck.
 */
function makeSignatureDreamcallers(
  signatureCards: readonly string[],
): DreamcallerContent[] {
  return [
    {
      id: "signature-dc",
      name: "Signature Sentinel",
      title: "Steering Test",
      renderedText: "",
      imageNumber: "001",
      startingEssence: 250,
      signatureCards: [...signatureCards],
    },
  ];
}

describe("createBattleInit", () => {
  it("creates a deterministic frozen battle init for a battle entry", () => {
    const input = makeBaseInput();

    const first = createBattleInit(input);
    const second = createBattleInit(input);

    expect(first.battleEntryKey).toBe("site-7::2::dreamscape-2");
    expect(first.battleId).toBe("battle:site-7::2::dreamscape-2");
    // bug-032: battleId and battleEntryKey are semantically distinct. They
    // share a derivation but must not be compared as equal.
    expect(first.battleId).not.toBe(first.battleEntryKey);
    expect(first.seed).toBe(second.seed);
    expect(first.turnLimit).toBe(50);
    expect(first.scoreToWin).toBe(25);
    expect(first.openingHandSize).toBe(5);
    expect(first.maxEnergyCap).toBe(10);
    expect(first.startingSide).toBe("player");
    expect(first.playerDrawSkipsTurnOne).toBe(true);
  });

  describe("seed determinism (B-10)", () => {
    it("same seed produces identical enemy descriptor and deck orders", () => {
      const input = makeBaseInput();
      const first = createBattleInit(input);
      const second = createBattleInit(input);

      expect(first.enemyDescriptor).toEqual(second.enemyDescriptor);
      expect(first.playerDeckOrder.map((card) => card.sourceDeckEntryId)).toEqual(
        second.playerDeckOrder.map((card) => card.sourceDeckEntryId),
      );
      expect(first.enemyDeckDefinition.map((card) => card.cardNumber)).toEqual(
        second.enemyDeckDefinition.map((card) => card.cardNumber),
      );
    });

    it("different seeds (via different battleEntryKey) diverge in at least one frozen field", () => {
      const baseInput = makeBaseInput();
      const otherInput: CreateBattleInitInput = {
        ...baseInput,
        battleEntryKey: "site-9::4::dreamscape-99",
      };

      const a = createBattleInit(baseInput);
      const b = createBattleInit(otherInput);

      expect(a.seed).not.toBe(b.seed);

      const sameEnemyDescriptor =
        JSON.stringify(a.enemyDescriptor) === JSON.stringify(b.enemyDescriptor);
      const samePlayerDeckOrder =
        JSON.stringify(a.playerDeckOrder.map((c) => c.sourceDeckEntryId)) ===
        JSON.stringify(b.playerDeckOrder.map((c) => c.sourceDeckEntryId));
      const sameEnemyDeck =
        JSON.stringify(a.enemyDeckDefinition.map((c) => c.cardNumber)) ===
        JSON.stringify(b.enemyDeckDefinition.map((c) => c.cardNumber));

      expect(
        sameEnemyDescriptor && samePlayerDeckOrder && sameEnemyDeck,
      ).toBe(false);
    });

    it("same battle entry in different quest seeds uses a different battle seed", () => {
      const baseInput = makeBaseInput();
      const otherInput: CreateBattleInitInput = {
        ...baseInput,
        state: { ...baseInput.state, seed: "another-quest-seed" },
      };

      const a = createBattleInit(baseInput);
      const b = createBattleInit(otherInput);

      expect(a.battleEntryKey).toBe(b.battleEntryKey);
      expect(a.seed).not.toBe(b.seed);
    });
  });

  describe("seedOverride", () => {
    it("uses the explicit seed when provided and reproduces across calls", () => {
      const input: CreateBattleInitInput = {
        ...makeBaseInput(),
        seedOverride: 424242,
      };

      const first = createBattleInit(input);
      const second = createBattleInit(input);

      expect(first.seed).toBe(424242);
      expect(second.seed).toBe(424242);
      expect(first.enemyDescriptor).toEqual(second.enemyDescriptor);
      expect(first.playerDeckOrder.map((c) => c.sourceDeckEntryId)).toEqual(
        second.playerDeckOrder.map((c) => c.sourceDeckEntryId),
      );
    });

    it("falls back to the hash-derived seed when seedOverride is null or omitted", () => {
      const baseInput = makeBaseInput();
      const expectedSeed = deriveBattleSeed(
        `${baseInput.state.seed}:${baseInput.battleEntryKey}`,
      );

      const fromOmitted = createBattleInit(baseInput);
      const fromNull = createBattleInit({ ...baseInput, seedOverride: null });

      expect(fromOmitted.seed).toBe(expectedSeed);
      expect(fromNull.seed).toBe(expectedSeed);
    });

    it("two seedOverride values that differ produce different bootstraps", () => {
      const a = createBattleInit({ ...makeBaseInput(), seedOverride: 1 });
      const b = createBattleInit({ ...makeBaseInput(), seedOverride: 2 });
      expect(a.seed).not.toBe(b.seed);
    });

    it("rejects negative, non-finite, or non-integer seedOverride values (bug-008)", () => {
      for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(() =>
          createBattleInit({ ...makeBaseInput(), seedOverride: invalid }),
        ).toThrow(/seedOverride/);
      }
    });

    it("rejects seedOverride values above Number.MAX_SAFE_INTEGER", () => {
      expect(() =>
        createBattleInit({
          ...makeBaseInput(),
          seedOverride: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).toThrow(/seedOverride/);
    });

    it("accepts zero as a valid seedOverride", () => {
      const first = createBattleInit({ ...makeBaseInput(), seedOverride: 0 });
      const second = createBattleInit({ ...makeBaseInput(), seedOverride: 0 });
      expect(first.seed).toBe(0);
      expect(first.enemyDescriptor).toEqual(second.enemyDescriptor);
    });
  });

  describe("essenceReward", () => {
    it("threads completionLevelAtStart into the documented essenceReward formula", () => {
      const baseState = makeBattleTestState();
      const expectations = [
        { completionLevel: 0, essenceReward: 100 },
        { completionLevel: 1, essenceReward: 150 },
        { completionLevel: 3, essenceReward: 250 },
        { completionLevel: 6, essenceReward: 400 },
      ];

      for (const { completionLevel, essenceReward } of expectations) {
        const init = createBattleInit({
          ...makeBaseInput(),
          state: { ...baseState, completionLevel },
        });
        expect(init.completionLevelAtStart).toBe(completionLevel);
        expect(init.essenceReward).toBe(essenceReward);
      }
    });

    it("applies active flat battle reward reductions and floors the reward at zero", () => {
      const baseState = makeBattleTestState();
      const reduced = createBattleInit({
        ...makeBaseInput(),
        state: {
          ...baseState,
          battleModifiers: [
            {
              kind: "reward_reduction_flat",
              amount: 80,
              battlesRemaining: 2,
              source: "journey:test",
            },
          ],
        },
      });
      const floored = createBattleInit({
        ...makeBaseInput(),
        state: {
          ...baseState,
          battleModifiers: [
            {
              kind: "reward_reduction_flat",
              amount: 999,
              battlesRemaining: 1,
              source: "journey:test",
            },
          ],
        },
      });

      expect(reduced.essenceReward).toBe(120);
      expect(floored.essenceReward).toBe(0);
    });

    it("applies active percent battle reward reductions with final-reward floor rounding", () => {
      const baseState = makeBattleTestState();
      const reduced = createBattleInit({
        ...makeBaseInput(),
        state: {
          ...baseState,
          completionLevel: 1,
          battleModifiers: [
            {
              kind: "reward_reduction_percent",
              percent: 33,
              battlesRemaining: 2,
              source: "journey:test",
            },
          ],
        },
      });
      const floored = createBattleInit({
        ...makeBaseInput(),
        state: {
          ...baseState,
          battleModifiers: [
            {
              kind: "reward_reduction_percent",
              percent: 150,
              battlesRemaining: 1,
              source: "journey:test",
            },
          ],
        },
      });

      expect(reduced.essenceReward).toBe(100);
      expect(floored.essenceReward).toBe(0);
    });

    it("flags miniboss at completion level 3 and final boss at completion level 6", () => {
      const baseState = makeBattleTestState();
      const minibossInit = createBattleInit({
        ...makeBaseInput(),
        state: { ...baseState, completionLevel: 3 },
      });
      const finalInit = createBattleInit({
        ...makeBaseInput(),
        state: { ...baseState, completionLevel: 6 },
      });
      const ordinaryInit = createBattleInit({
        ...makeBaseInput(),
        state: { ...baseState, completionLevel: 2 },
      });

      expect(minibossInit.isMiniboss).toBe(true);
      expect(minibossInit.isFinalBoss).toBe(false);
      expect(finalInit.isMiniboss).toBe(false);
      expect(finalInit.isFinalBoss).toBe(true);
      expect(ordinaryInit.isMiniboss).toBe(false);
      expect(ordinaryInit.isFinalBoss).toBe(false);
    });
  });

  describe("playerDeckOrder", () => {
    it("preserves entryId for every quest deck entry", () => {
      const init = createBattleInit(makeBaseInput());
      // The battle deck is padded up to the minimum size, so the same quest
      // entry id can appear multiple times; the set of distinct ids still
      // matches the quest deck exactly.
      const sourceIds = [
        ...new Set(
          init.playerDeckOrder
            .map((card) => card.sourceDeckEntryId)
            .filter((id): id is string => id !== null),
        ),
      ].sort();
      const inputIds = makeBaseInput().state.deck.map((entry) => entry.entryId).sort();
      expect(sourceIds).toEqual(inputIds);
    });

    it("pads a small quest deck up to the minimum battle deck size", () => {
      const init = createBattleInit(makeBaseInput());
      // makeBattleTestState has an 8-card deck: padded to 32 (8 -> 16 -> 24 -> 32).
      expect(init.playerDeckOrder.length).toBeGreaterThanOrEqual(25);
      expect(init.questDeckEntries).toHaveLength(8);
    });

    it("freezes the player deck order and each card", () => {
      const init = createBattleInit(makeBaseInput());
      expect(Object.isFrozen(init.playerDeckOrder)).toBe(true);
      for (const card of init.playerDeckOrder) {
        expect(Object.isFrozen(card)).toBe(true);
      }
    });

    it("mirrors each quest deck entry into the top-level questDeckEntries field (B-3)", () => {
      const baseInput = makeBaseInput();
      const init = createBattleInit(baseInput);

      expect(init.questDeckEntries).toHaveLength(baseInput.state.deck.length);
      expect(Object.isFrozen(init.questDeckEntries)).toBe(true);

      const byEntryId = new Map(
        init.questDeckEntries.map((entry) => [entry.entryId, entry]),
      );
      for (const sourceEntry of baseInput.state.deck) {
        const mirrored = byEntryId.get(sourceEntry.entryId);
        expect(mirrored).toBeDefined();
        expect(mirrored).toEqual({
          entryId: sourceEntry.entryId,
          cardNumber: sourceEntry.cardNumber,
          transfiguration: sourceEntry.transfiguration,
          isBane: sourceEntry.isBane,
        });
        expect(Object.isFrozen(mirrored)).toBe(true);
      }
    });

    it("keeps questDeckEntries consistent with playerDeckOrder per-card metadata", () => {
      const init = createBattleInit(makeBaseInput());
      const questEntriesByEntryId = new Map(
        init.questDeckEntries.map((entry) => [entry.entryId, entry]),
      );

      for (const card of init.playerDeckOrder) {
        if (card.sourceDeckEntryId === null) {
          continue;
        }
        const questEntry = questEntriesByEntryId.get(card.sourceDeckEntryId);
        expect(questEntry).toBeDefined();
        expect(questEntry).toEqual({
          entryId: card.sourceDeckEntryId,
          cardNumber: card.cardNumber,
          transfiguration: card.transfiguration,
          isBane: card.isBane,
        });
      }
    });

    it("applies quest deck entry type changes to player battle card definitions", () => {
      const baseInput = makeBaseInput();
      const changedEntryId = "deck-5";
      const typeChange: CardTypeChange = {
        predicateId: "spirit_animals",
        cardType: "Character",
        subtype: "Spirit Animal",
        label: "Spirit Animal",
      };
      const stateWithTypeChange = {
        ...baseInput.state,
        deck: baseInput.state.deck.map((entry) =>
          entry.entryId === changedEntryId
            ? {
                ...entry,
                typeChange,
              }
            : entry,
        ),
      };

      const init = createBattleInit({ ...baseInput, state: stateWithTypeChange });
      const changedCard = init.playerDeckOrder.find(
        (card) => card.sourceDeckEntryId === changedEntryId,
      );

      expect(changedCard).toMatchObject({
        cardNumber: 106,
        battleCardKind: "character",
        subtype: "Spirit Animal",
        typeChange,
      });
    });

    it("applies quest deck entry keyword changes to player battle card definitions", () => {
      const baseInput = makeBaseInput();
      const changedEntryId = "deck-5";
      const keywordModification: CardKeywordModification = { fast: true, reclaim: 2 };
      const stateWithKeywordChange = {
        ...baseInput.state,
        deck: baseInput.state.deck.map((entry) =>
          entry.entryId === changedEntryId
            ? {
                ...entry,
                keywordModification,
              }
            : entry,
        ),
      };

      const init = createBattleInit({
        ...baseInput,
        state: stateWithKeywordChange,
      });
      const changedCard = init.playerDeckOrder.find(
        (card) => card.sourceDeckEntryId === changedEntryId,
      );

      expect(changedCard).toMatchObject({
        cardNumber: 106,
        isFast: true,
        reclaimCost: 2,
        keywordModification,
      });
      expect(changedCard?.renderedText).toContain("Reclaim 2●");
    });

    it("throws when a quest deck entry references a missing card number", () => {
      const baseInput = makeBaseInput();
      const stateWithUnknownCard = {
        ...baseInput.state,
        deck: [
          ...baseInput.state.deck,
          {
            entryId: "deck-unknown",
            cardNumber: 9999,
            transfiguration: null,
            isBane: false,
          },
        ],
      };

      expect(() =>
        createBattleInit({ ...baseInput, state: stateWithUnknownCard }),
      ).toThrow(/Missing card data/);
    });
  });

  describe("enemyDescriptor", () => {
    it("freezes the enemy descriptor object", () => {
      const init = createBattleInit(makeBaseInput());
      expect(Object.isFrozen(init.enemyDescriptor)).toBe(true);
    });

    it("uses the selected Dreamcaller's exact identity for real enemies", () => {
      const input = makeBaseInput();
      const init = createBattleInit(input);
      const selectedDreamcaller = input.dreamcallers.find((dreamcaller) =>
        init.enemyDescriptor.id.startsWith(`enemy:${dreamcaller.id}:`),
      );

      expect(selectedDreamcaller).toBeDefined();
      expect(init.enemyDescriptor.name).toBe(selectedDreamcaller?.name);
      expect(init.enemyDescriptor.subtitle).toBe("");
      for (const prefix of ["Shadow", "Nightmare", "Phantom", "Dark"]) {
        expect(init.enemyDescriptor.name.startsWith(`${prefix} `)).toBe(false);
      }
    });

    it("falls back to a synthetic descriptor when no dreamcallers are available", () => {
      const init = createBattleInit({
        ...makeBaseInput(),
        dreamcallers: [],
      });

      expect(init.enemyDescriptor.id).toBe("enemy:fallback");
      expect(init.enemyDescriptor.dreamsigns).toEqual([]);
    });

    it("gives the opponent concrete dreamsigns drawn from the supplied templates", () => {
      const init = createBattleInit({
        ...makeBaseInput(),
        dreamsignTemplates: [
          {
            id: "enemy-sign-1",
            name: "Enemy Sign One",
            effectDescription: "An opposing boon.",
          },
          {
            id: "enemy-sign-2",
            name: "Enemy Sign Two",
            effectDescription: "Another opposing boon.",
          },
        ],
      });

      expect(init.enemyDescriptor.dreamsigns.length).toBeGreaterThanOrEqual(1);
      for (const dreamsign of init.enemyDescriptor.dreamsigns) {
        expect(typeof dreamsign.name).toBe("string");
        expect(dreamsign.isBane).toBe(false);
      }
    });
  });

  describe("enemyDeckDefinition", () => {
    it("builds a non-empty deck whose every entry resolves in the card database (fallback path)", () => {
      const input = makeBaseInput();
      const init = createBattleInit(input);

      expect(init.enemyDeckDefinition.length).toBeGreaterThan(0);
      expect(init.enemyDeckDefinition.length).toBeGreaterThanOrEqual(
        MIN_BATTLE_DECK_SIZE,
      );
      for (const card of init.enemyDeckDefinition) {
        expect(input.cardDatabase.get(card.cardNumber)).toBeDefined();
      }
    });

    it("excludes starters and null-energy cards in the fallback path", () => {
      // With no poolContext the deck is sampled from draftable cards
      // (non-starter, numeric cost). Confirm both exclusions hold over a card
      // database where every non-excluded candidate would otherwise be chosen.
      const baseInput = makeBaseInput();
      const augmented = new Map(baseInput.cardDatabase);
      augmented.set(801, {
        ...makePackageCard(801, "Character", 1, "alpha"),
        energyCost: null,
      });
      augmented.set(802, {
        ...makePackageCard(802, "Event", 2, "alpha"),
        isStarter: true,
      });

      const init = createBattleInit({ ...baseInput, cardDatabase: augmented });
      const cardNumbersChosen = new Set(
        init.enemyDeckDefinition.map((card) => card.cardNumber),
      );
      expect(cardNumbersChosen.has(801)).toBe(false);
      expect(cardNumbersChosen.has(802)).toBe(false);
    });

    it("freezes the enemy deck definition list", () => {
      const init = createBattleInit(makeBaseInput());
      expect(Object.isFrozen(init.enemyDeckDefinition)).toBe(true);
      for (const card of init.enemyDeckDefinition) {
        expect(Object.isFrozen(card)).toBe(true);
      }
    });

    it("builds a steered deck from a poolContext decklist that resolves and pads", () => {
      const { poolContext, decklistA } = makeSteeredPoolContext();
      const cardDatabase = makeBattleTestCardDatabase();
      // Steer toward decklist A: its cards as the Dreamcaller signature.
      const init = createBattleInit({
        ...makeBaseInput(),
        cardDatabase,
        poolContext,
        dreamcallers: makeSignatureDreamcallers(decklistA),
      });

      expect(init.enemyDeckDefinition.length).toBeGreaterThanOrEqual(
        MIN_BATTLE_DECK_SIZE,
      );
      // Every chosen card resolves to a real card-database entry whose name is
      // indexed in the run pool context.
      for (const card of init.enemyDeckDefinition) {
        expect(card.cardNumber).toBeGreaterThan(0);
        expect(cardDatabase.get(card.cardNumber)).toBeDefined();
        expect(poolContext.nameIndex.has(card.name)).toBe(true);
      }
    });

    it("steers the enemy deck toward the signed decklist for fixed battle seeds", () => {
      const { poolContext, decklistA, decklistB } = makeSteeredPoolContext();
      const decklistANumbers = new Set(
        decklistA.map((name) => poolContext.nameIndex.get(name)),
      );
      const decklistBNumbers = new Set(
        decklistB.map((name) => poolContext.nameIndex.get(name)),
      );

      for (const seedOverride of [11, 2024]) {
        const init = createBattleInit({
          ...makeBaseInput(),
          poolContext,
          dreamcallers: makeSignatureDreamcallers(decklistA),
          seedOverride,
        });

        const deckNumbers = init.enemyDeckDefinition.map((c) => c.cardNumber);
        const fromA = deckNumbers.filter((n) => decklistANumbers.has(n)).length;
        const fromB = deckNumbers.filter((n) => decklistBNumbers.has(n)).length;
        // The deck steered toward A draws far more of A's cards than B's. The
        // two decklists are disjoint card ranges, so this is a clean signal.
        expect(fromA).toBeGreaterThan(fromB);
        expect(fromA).toBeGreaterThan(0);
        // Every chosen card belongs to the steered decklist (modulo padding):
        // the resolved set is a subset of decklist A.
        const uniqueChosen = new Set(deckNumbers);
        for (const n of uniqueChosen) {
          expect(decklistANumbers.has(n)).toBe(true);
        }
      }
    });

    it("is deterministic for a fixed seed with a poolContext", () => {
      const { poolContext, decklistA } = makeSteeredPoolContext();
      const input: CreateBattleInitInput = {
        ...makeBaseInput(),
        poolContext,
        dreamcallers: makeSignatureDreamcallers(decklistA),
        seedOverride: 777,
      };
      const first = createBattleInit(input);
      const second = createBattleInit(input);
      expect(first.enemyDeckDefinition.map((c) => c.cardNumber)).toEqual(
        second.enemyDeckDefinition.map((c) => c.cardNumber),
      );
    });

    it("falls back to a non-empty deck when poolContext is undefined", () => {
      const init = createBattleInit({ ...makeBaseInput(), poolContext: undefined });
      expect(init.enemyDeckDefinition.length).toBeGreaterThan(0);
      for (const card of init.enemyDeckDefinition) {
        expect(makeBattleTestCardDatabase().get(card.cardNumber)).toBeDefined();
      }
    });

    it("falls back when a poolContext resolves to an empty starter deck", () => {
      // A poolContext whose name index shares nothing with the generated pool
      // names yields an empty resolved list; the fallback still fills the deck.
      const emptyIndexContext: RunPoolContext = {
        poolData: makeSteeredPoolContext().poolContext.poolData,
        nameIndex: new Map<string, number>([["does-not-exist", -1]]),
        allDreamsignPoolIds: [],
      };
      const init = createBattleInit({
        ...makeBaseInput(),
        poolContext: emptyIndexContext,
      });
      expect(init.enemyDeckDefinition.length).toBeGreaterThanOrEqual(
        MIN_BATTLE_DECK_SIZE,
      );
      for (const card of init.enemyDeckDefinition) {
        expect(makeBattleTestCardDatabase().get(card.cardNumber)).toBeDefined();
      }
    });
  });

  describe("freezes (B-7, B-8, B-9, B-10, B-11)", () => {
    it("freezes the top-level BattleInit object and nested summaries", () => {
      const init = createBattleInit(makeBaseInput());
      expect(Object.isFrozen(init)).toBe(true);
      expect(Object.isFrozen(init.dreamsignSummaries)).toBe(true);
      for (const summary of init.dreamsignSummaries) {
        expect(Object.isFrozen(summary)).toBe(true);
      }
      if (init.dreamcallerSummary !== null) {
        expect(Object.isFrozen(init.dreamcallerSummary)).toBe(true);
      }
      expect(Object.isFrozen(init.atlasSnapshot)).toBe(true);
    });

    it("deep-freezes atlas snapshot and isolates it from later mutations (B-11)", () => {
      const baseInput = makeBaseInput();
      const init = createBattleInit(baseInput);
      const snapshot = init.atlasSnapshot;

      // Every nested container in the snapshot must be frozen so follow-up
      // mutations of the source atlas cannot leak through.
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.nodes)).toBe(true);
      expect(Object.isFrozen(snapshot.edges)).toBe(true);
      for (const nodeId of Object.keys(snapshot.nodes)) {
        const node = snapshot.nodes[nodeId];
        expect(Object.isFrozen(node)).toBe(true);
        expect(Object.isFrozen(node.position)).toBe(true);
        expect(Object.isFrozen(node.sites)).toBe(true);
        for (const site of node.sites) {
          expect(Object.isFrozen(site)).toBe(true);
        }
      }

      // Mutating the source atlas after snapshotting must not affect the
      // snapshot's contents.
      const sourceAtlas = baseInput.state.atlas;
      const firstNodeId = Object.keys(sourceAtlas.nodes)[0];
      const originalBiomeName = snapshot.nodes[firstNodeId].biomeName;
      sourceAtlas.nodes[firstNodeId].biomeName = "Mutated After Snapshot";
      expect(snapshot.nodes[firstNodeId].biomeName).toBe(originalBiomeName);
    });
  });
});
