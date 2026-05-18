import { describe, expect, it } from "vitest";
import { makeBattleTestCardDatabase, makeBattleTestDreamcallers, makeBattleTestSite, makeBattleTestState } from "../test-support";
import { createBattleInit, type CreateBattleInitInput } from "./create-battle-init";
import { deriveBattleSeed } from "../random";
import type { CardData } from "../../types/cards";
import type { CardKeywordModification, CardTypeChange } from "../../types/quest";

const ENEMY_DECK_SIZE = 12;

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
    tides: [packageTide],
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
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
      const expectedSeed = deriveBattleSeed(baseInput.battleEntryKey);

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

    it("freezes the player deck order and each card's tides array", () => {
      const init = createBattleInit(makeBaseInput());
      expect(Object.isFrozen(init.playerDeckOrder)).toBe(true);
      for (const card of init.playerDeckOrder) {
        expect(Object.isFrozen(card)).toBe(true);
        expect(Object.isFrozen(card.tides)).toBe(true);
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

    it("falls back to a synthetic descriptor when no dreamcallers are available", () => {
      const init = createBattleInit({
        ...makeBaseInput(),
        dreamcallers: [],
      });

      expect(init.enemyDescriptor.id).toBe("enemy:fallback");
      expect(init.enemyDescriptor.packageTides).toEqual([]);
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
            packageTides: [],
          },
          {
            id: "enemy-sign-2",
            name: "Enemy Sign Two",
            effectDescription: "Another opposing boon.",
            packageTides: [],
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
    it("builds a 12-card deck from real card-database entries (B-13, B-17)", () => {
      const init = createBattleInit(makeBaseInput());
      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);

      const cardDatabase = makeBaseInput().cardDatabase;
      for (const card of init.enemyDeckDefinition) {
        const databaseCard = cardDatabase.get(card.cardNumber);
        expect(databaseCard).toBeDefined();
      }
    });

    it("excludes cards with null energyCost from enemy candidates (B-15)", () => {
      const stripCard = (number: number): CardData =>
        ({
          name: `cost-null-${String(number)}`,
          id: `cost-null-${String(number)}`,
          cardNumber: number,
          cardType: "Character",
          subtype: "Echo",
          isStarter: false,
          energyCost: null,
          spark: 1,
          isFast: false,
          tides: ["alpha"],
          renderedText: "no cost",
          imageNumber: number,
          artOwned: true,
        });
      const baseInput = makeBaseInput();
      const augmented = new Map(baseInput.cardDatabase);
      augmented.set(801, stripCard(801));
      augmented.set(802, stripCard(802));

      const init = createBattleInit({ ...baseInput, cardDatabase: augmented });
      const cardNumbersChosen = init.enemyDeckDefinition.map(
        (card) => card.cardNumber,
      );
      expect(cardNumbersChosen).not.toContain(801);
      expect(cardNumbersChosen).not.toContain(802);
    });

    it("matches the requested character/event split when the pool is large enough (B-17)", () => {
      const init = createBattleInit(makeBaseInput());
      const characters = init.enemyDeckDefinition.filter(
        (card) => card.battleCardKind === "character",
      );
      const events = init.enemyDeckDefinition.filter(
        (card) => card.battleCardKind === "event",
      );
      expect(characters.length).toBe(8);
      expect(events.length).toBe(4);
    });

    it("freezes the enemy deck definition list and per-card tides", () => {
      const init = createBattleInit(makeBaseInput());
      expect(Object.isFrozen(init.enemyDeckDefinition)).toBe(true);
      for (const card of init.enemyDeckDefinition) {
        expect(Object.isFrozen(card)).toBe(true);
        expect(Object.isFrozen(card.tides)).toBe(true);
      }
    });

    it("gives each duplicate-fallback entry its own tides array (B-8, B-18)", () => {
      const baseInput = makeBaseInput();
      const tinyDb = new Map<number, CardData>();
      // Single character and a single event — every bucket must fall back to
      // duplicates of the same underlying card, forcing the duplicate-fallback
      // path that used to share tides references.
      tinyDb.set(700, {
        name: "Solo Character",
        id: "solo-char",
        cardNumber: 700,
        cardType: "Character",
        subtype: "Echo",
        isStarter: false,
        energyCost: 2,
        spark: 1,
        isFast: false,
        tides: ["alpha"],
        renderedText: "",
        imageNumber: 700,
        artOwned: true,
      });
      tinyDb.set(701, {
        name: "Solo Event",
        id: "solo-event",
        cardNumber: 701,
        cardType: "Event",
        subtype: "Spell",
        isStarter: false,
        energyCost: 2,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "",
        imageNumber: 701,
        artOwned: true,
      });

      const init = createBattleInit({
        ...baseInput,
        cardDatabase: tinyDb,
        state: {
          ...baseInput.state,
          deck: baseInput.state.deck.filter((entry) => tinyDb.has(entry.cardNumber)),
        },
      });

      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);
      const tidesReferences = init.enemyDeckDefinition.map((card) => card.tides);
      // Every copied card should have a distinct frozen tides array so later
      // mutations (if unfrozen in a future caller) cannot leak across copies.
      const uniqueReferences = new Set(tidesReferences);
      expect(uniqueReferences.size).toBe(tidesReferences.length);
    });

    it("backfills the deck up to 12 cards even when the matching-tide pool is tiny (B-18)", () => {
      const baseInput = makeBaseInput();
      const tinyDb = new Map<number, CardData>();
      const cards: CardData[] = [];
      for (let i = 0; i < 4; i += 1) {
        cards.push({
          name: `Solo Char ${String(i)}`,
          id: `solo-char-${String(i)}`,
          cardNumber: 700 + i,
          cardType: "Character",
          subtype: "Echo",
          isStarter: false,
          energyCost: i % 4,
          spark: 1,
          isFast: false,
          tides: ["alpha"],
          renderedText: "",
          imageNumber: 700 + i,
          artOwned: true,
        });
      }
      for (let i = 0; i < 2; i += 1) {
        cards.push({
          name: `Solo Event ${String(i)}`,
          id: `solo-event-${String(i)}`,
          cardNumber: 800 + i,
          cardType: "Event",
          subtype: "Spell",
          isStarter: false,
          energyCost: 2,
          spark: null,
          isFast: false,
          tides: ["alpha"],
          renderedText: "",
          imageNumber: 800 + i,
          artOwned: true,
        });
      }
      for (const card of cards) {
        tinyDb.set(card.cardNumber, card);
      }

      const init = createBattleInit({
        ...baseInput,
        cardDatabase: tinyDb,
        state: {
          ...baseInput.state,
          deck: baseInput.state.deck.filter((entry) =>
            tinyDb.has(entry.cardNumber),
          ),
        },
      });

      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);
    });

    it("treats a empty-tide enemy as accepting all candidates (empty package tides accept all candidates)", () => {
      const baseInput = makeBaseInput();
      const init = createBattleInit({
        ...baseInput,
        dreamcallers: [
          {
            id: "neutral-dc",
            name: "Empty Echo",
            title: "Test",
            renderedText: "",
            imageNumber: "001",
            startingEssence: 250,
            mandatoryTides: [],
            optionalTides: [],
          },
        ],
      });

      expect(init.enemyDescriptor.packageTides).toEqual([]);
      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);
    });

    it("strongly prefers accent-matching candidates over off-accent candidates in a mixed pool (B-14)", () => {
      // Force an tide_beta-accent enemy and provide enough tide_beta-accent supply to
      // fill every bucket — plus extra tide_alpha-accent noise as distractors.
      const baseInput = makeBaseInput();
      const db = new Map<number, CardData>();
      const packageNumbers = new Set<number>();
      for (let i = 0; i < 6; i += 1) {
        const card = makePackageCard(400 + i, "Character", 1 + (i % 2), "tide_beta");
        db.set(card.cardNumber, card);
        packageNumbers.add(card.cardNumber);
      }
      for (let i = 0; i < 4; i += 1) {
        const card = makePackageCard(410 + i, "Character", 3 + (i % 2), "tide_beta");
        db.set(card.cardNumber, card);
        packageNumbers.add(card.cardNumber);
      }
      for (let i = 0; i < 4; i += 1) {
        const card = makePackageCard(420 + i, "Character", 5 + (i % 2), "tide_beta");
        db.set(card.cardNumber, card);
        packageNumbers.add(card.cardNumber);
      }
      for (let i = 0; i < 6; i += 1) {
        const card = makePackageCard(430 + i, "Event", (i % 4) + 1, "tide_beta");
        db.set(card.cardNumber, card);
        packageNumbers.add(card.cardNumber);
      }
      // tide_alpha distractors at every cost band for characters and events.
      for (let i = 0; i < 6; i += 1) {
        const card = makePackageCard(500 + i, "Character", 1 + (i % 6), "tide_alpha");
        db.set(card.cardNumber, card);
      }
      for (let i = 0; i < 4; i += 1) {
        const card = makePackageCard(520 + i, "Event", 2 + (i % 3), "tide_alpha");
        db.set(card.cardNumber, card);
      }

      const init = createBattleInit({
        ...baseInput,
        cardDatabase: db,
        dreamcallers: [
          {
            id: "tide-beta-dc",
            name: "Tide Beta Sentinel",
            title: "Accent Test",
            renderedText: "",
            imageNumber: "001",
            startingEssence: 250,
            mandatoryTides: ["tide_beta"],
            optionalTides: [],
          },
        ],
        state: { ...baseInput.state, deck: [] },
      });

      expect(init.enemyDescriptor.packageTides).toEqual(["tide_beta"]);
      const matchingTideCount = init.enemyDeckDefinition.filter((card) =>
        packageNumbers.has(card.cardNumber),
      ).length;
      // With enough accent-matching supply to fill every bucket, the final
      // deck should be all-accent per spec §B-14.
      expect(matchingTideCount).toBe(ENEMY_DECK_SIZE);
    });

    it("falls through accent -> kind+cost -> wide numeric-cost pool before duplicating (B-19)", () => {
      // Build an tide_beta enemy with zero tide_beta-accent cards in the pool. The fallback
      // is tide_alpha candidates that cover every bucket exactly, so duplicates must
      // not appear even though layer 1 (accent) is empty.
      const pool: CardData[] = [
        makePackageCard(600, "Character", 1, "tide_alpha"),
        makePackageCard(601, "Character", 2, "tide_alpha"),
        makePackageCard(602, "Character", 2, "tide_alpha"),
        makePackageCard(603, "Character", 3, "tide_alpha"),
        makePackageCard(604, "Character", 4, "tide_alpha"),
        makePackageCard(605, "Character", 4, "tide_alpha"),
        makePackageCard(606, "Character", 5, "tide_alpha"),
        makePackageCard(607, "Character", 6, "tide_alpha"),
        makePackageCard(608, "Event", 2, "tide_alpha"),
        makePackageCard(609, "Event", 2, "tide_alpha"),
        makePackageCard(610, "Event", 4, "tide_alpha"),
        makePackageCard(611, "Event", 5, "tide_alpha"),
      ];
      const db = new Map(pool.map((card) => [card.cardNumber, card]));
      const baseInput = makeBaseInput();
      const init = createBattleInit({
        ...baseInput,
        cardDatabase: db,
        dreamcallers: [
          {
            id: "tide-beta-dc",
            name: "Tide Beta Sentinel",
            title: "Accent Test",
            renderedText: "",
            imageNumber: "001",
            startingEssence: 250,
            mandatoryTides: ["tide_beta"],
            optionalTides: [],
          },
        ],
        state: { ...baseInput.state, deck: [] },
      });

      expect(init.enemyDescriptor.packageTides).toEqual(["tide_beta"]);
      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);
      // Every card we emit must come from the tide_alpha pool — no phantom accent
      // matches can appear because tide_beta pool is empty. Cross-bucket duplicates
      // are acceptable under the current bucket model, but single-card
      // duplication from an empty layer-2 fallback is not: assert the deck
      // spans several distinct cards across both kinds, proving the fallback
      // layer actually widens past the accent-empty layer before duplicating.
      const fallbackNumbers = new Set(pool.map((c) => c.cardNumber));
      const distinct = new Set<number>();
      for (const card of init.enemyDeckDefinition) {
        expect(fallbackNumbers.has(card.cardNumber)).toBe(true);
        distinct.add(card.cardNumber);
      }
      expect(distinct.size).toBeGreaterThanOrEqual(8);
    });

    it("widens to the non-starter numeric-cost pool when accent and kind+cost layers are empty (B-19 bug-009)", () => {
      // Only cheap characters exist — no mid, no expensive, no events. The
      // mid/expensive character buckets and both event buckets must widen to
      // the full non-starter numeric-cost pool (which here is just the cheap
      // characters) before falling back to duplicates.
      const pool: CardData[] = [];
      for (let i = 0; i < 6; i += 1) {
        pool.push(makePackageCard(700 + i, "Character", 1, "tide_alpha"));
      }
      const db = new Map(pool.map((card) => [card.cardNumber, card]));
      const baseInput = makeBaseInput();
      const init = createBattleInit({
        ...baseInput,
        cardDatabase: db,
        dreamcallers: [
          {
            id: "tide-beta-dc",
            name: "Tide Beta Sentinel",
            title: "",
            renderedText: "",
            imageNumber: "001",
            startingEssence: 250,
            mandatoryTides: ["tide_beta"],
            optionalTides: [],
          },
        ],
        state: { ...baseInput.state, deck: [] },
      });
      expect(init.enemyDescriptor.packageTides).toEqual(["tide_beta"]);
      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);
      // All cards should come from the pool — every hit is a cheap character,
      // confirming the widening layer actually ran for mid/expensive/event
      // buckets instead of skipping to duplicates.
      const sourceNumbers = new Set(pool.map((c) => c.cardNumber));
      for (const card of init.enemyDeckDefinition) {
        expect(sourceNumbers.has(card.cardNumber)).toBe(true);
      }
    });

    it("shuffles the final enemy deck once so it differs from construction order (B-20)", () => {
      // The construction order is deterministic (accent-first, bucket-by-bucket),
      // so we can reconstruct the pre-shuffle ordering and assert the post-
      // shuffle output is a permutation of it — but not identical.
      const init = createBattleInit(makeBaseInput());
      const numbers = init.enemyDeckDefinition.map((card) => card.cardNumber);
      const sortedNumbers = [...numbers].sort((a, b) => a - b);

      expect(numbers.length).toBe(ENEMY_DECK_SIZE);
      // Sanity: the deck isn't trivially already sorted or grouped by kind.
      // A deterministic bucket-order would place the 8 characters before the 4
      // events. Confirm the shuffle breaks that.
      const firstEightKinds = init.enemyDeckDefinition
        .slice(0, 8)
        .map((card) => card.battleCardKind);
      const allCharactersFirst = firstEightKinds.every((kind) => kind === "character");
      expect(allCharactersFirst).toBe(false);
      // Post-shuffle deck still contains the same multiset of cards — just
      // reordered — so sorting the numbers matches sorting of a repeat call.
      const again = createBattleInit(makeBaseInput());
      expect([...again.enemyDeckDefinition.map((c) => c.cardNumber)].sort((a, b) => a - b))
        .toEqual(sortedNumbers);
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
