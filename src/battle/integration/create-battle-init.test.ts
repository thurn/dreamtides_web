import { describe, expect, it } from "vitest";
import { makeBattleTestCardDatabase, makeBattleTestDreamcallers, makeBattleTestSite, makeBattleTestState } from "../test-support";
import { createBattleInit, type CreateBattleInitInput } from "./create-battle-init";
import { deriveBattleSeed } from "../random";
import type { CardData } from "../../types/cards";
import type { DreamcallerContent, PackageTideId } from "../../types/content";
import type { CardKeywordModification, CardTypeChange } from "../../types/quest";

const ENEMY_DECK_SIZE = 40;
const REMOVAL_TIDES = new Set<PackageTideId>([
  "cheap_removal",
  "premium_removal",
]);

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

function isRemovalEventCard(card: CardData): boolean {
  return (
    card.cardType === "Event" &&
    card.tides.some((tide) => REMOVAL_TIDES.has(tide))
  );
}

function overlapsTides(
  card: CardData,
  packageTides: readonly PackageTideId[],
): boolean {
  const packageTideSet = new Set(packageTides);
  return card.tides.some((tide) => packageTideSet.has(tide));
}

async function readGeneratedQuestContent(): Promise<{
  cards: CardData[];
  dreamcallers: DreamcallerContent[];
} | null> {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    const cardJsonPath = path.resolve(dir, "../../../public/card-data.json");
    const dreamcallerJsonPath = path.resolve(
      dir,
      "../../../public/dreamcaller-data.json",
    );
    if (!fs.existsSync(cardJsonPath) || !fs.existsSync(dreamcallerJsonPath)) {
      return null;
    }
    return {
      cards: JSON.parse(fs.readFileSync(cardJsonPath, "utf8")) as CardData[],
      dreamcallers: JSON.parse(
        fs.readFileSync(dreamcallerJsonPath, "utf8"),
      ) as DreamcallerContent[],
    };
  } catch {
    return null;
  }
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

    it("uses the selected Dreamcaller's exact identity for real enemies", () => {
      const input = makeBaseInput();
      const init = createBattleInit(input);
      const selectedDreamcaller = input.dreamcallers.find((dreamcaller) =>
        init.enemyDescriptor.id.startsWith(`enemy:${dreamcaller.id}:`),
      );

      expect(selectedDreamcaller).toBeDefined();
      expect(init.enemyDescriptor.name).toBe(selectedDreamcaller?.name);
      expect(init.enemyDescriptor.subtitle).toBe("");
      expect(init.enemyDescriptor.packageTides).toEqual(
        selectedDreamcaller?.mandatoryTides,
      );
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
    it("builds a unique 40-card deck from card-database entries", () => {
      const input = makeBaseInput();
      const init = createBattleInit(input);
      const cardNumbers = init.enemyDeckDefinition.map((card) => card.cardNumber);

      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);
      expect(new Set(cardNumbers).size).toBe(ENEMY_DECK_SIZE);

      for (const card of init.enemyDeckDefinition) {
        const databaseCard = input.cardDatabase.get(card.cardNumber);
        expect(databaseCard).toBeDefined();
      }
    });

    it("starts from four removal events and fills the rest from required tides", () => {
      const input = makeBaseInput();
      const init = createBattleInit(input);
      const removalCards: CardData[] = [];
      const nonRemovalCards: CardData[] = [];

      for (const deckCard of init.enemyDeckDefinition) {
        const databaseCard = input.cardDatabase.get(deckCard.cardNumber);
        expect(databaseCard).toBeDefined();
        if (databaseCard === undefined) {
          continue;
        }
        if (isRemovalEventCard(databaseCard)) {
          removalCards.push(databaseCard);
        } else {
          nonRemovalCards.push(databaseCard);
        }
      }

      expect(removalCards.length).toBeGreaterThanOrEqual(4);
      for (const card of nonRemovalCards) {
        expect(overlapsTides(card, init.enemyDescriptor.packageTides)).toBe(true);
      }
    });

    it("excludes starters and cards with null energyCost from enemy candidates", () => {
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
      const cardNumbersChosen = init.enemyDeckDefinition.map(
        (card) => card.cardNumber,
      );
      expect(cardNumbersChosen).not.toContain(801);
      expect(cardNumbersChosen).not.toContain(802);
    });

    it("freezes the enemy deck definition list and per-card tides", () => {
      const init = createBattleInit(makeBaseInput());
      expect(Object.isFrozen(init.enemyDeckDefinition)).toBe(true);
      for (const card of init.enemyDeckDefinition) {
        expect(Object.isFrozen(card)).toBe(true);
        expect(Object.isFrozen(card.tides)).toBe(true);
      }
    });

    it("prefers removal events that overlap the enemy's required tides", () => {
      const baseInput = makeBaseInput();
      const db = new Map<number, CardData>();
      const matchingRemovalNumbers = new Set<number>();

      for (let i = 0; i < 40; i += 1) {
        const isRemoval = i < 4;
        const card = makePackageCard(
          400 + i,
          isRemoval ? "Event" : "Character",
          1 + (i % 4),
          "tide_beta",
        );
        db.set(card.cardNumber, {
          ...card,
          tides: isRemoval ? ["tide_beta", "cheap_removal"] : ["tide_beta"],
        });
        if (isRemoval) {
          matchingRemovalNumbers.add(card.cardNumber);
        }
      }
      for (let i = 0; i < 4; i += 1) {
        const card = makePackageCard(500 + i, "Event", 2, "cheap_removal");
        db.set(card.cardNumber, card);
      }
      const init = createBattleInit({
        ...baseInput,
        cardDatabase: db,
        dreamcallers: [
          {
            id: "tide-beta-dc",
            name: "Tide Beta Sentinel",
            title: "Required Tide Test",
            renderedText: "",
            imageNumber: "001",
            startingEssence: 250,
            mandatoryTides: ["tide_beta"],
            optionalTides: [],
          },
        ],
        state: { ...baseInput.state, deck: [] },
      });

      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);
      const selectedRemovalNumbers = init.enemyDeckDefinition
        .filter((card) => {
          const databaseCard = db.get(card.cardNumber);
          return databaseCard !== undefined && isRemovalEventCard(databaseCard);
        })
        .map((card) => card.cardNumber);
      expect(selectedRemovalNumbers.sort((a, b) => a - b)).toEqual(
        [...matchingRemovalNumbers].sort((a, b) => a - b),
      );
    });

    it("falls back to global removal events for the four removal slots", () => {
      const baseInput = makeBaseInput();
      const db = new Map<number, CardData>();
      const globalRemovalNumbers = new Set<number>();

      for (let i = 0; i < 36; i += 1) {
        const card = makePackageCard(600 + i, "Character", 1 + (i % 5), "alpha");
        db.set(card.cardNumber, card);
      }
      for (let i = 0; i < 4; i += 1) {
        const card = makePackageCard(700 + i, "Event", 2, "cheap_removal");
        db.set(card.cardNumber, card);
        globalRemovalNumbers.add(card.cardNumber);
      }

      const init = createBattleInit({
        ...baseInput,
        cardDatabase: db,
        dreamcallers: [
          {
            id: "alpha-dc",
            name: "Alpha Sentinel",
            title: "Removal Fallback Test",
            renderedText: "",
            imageNumber: "001",
            startingEssence: 250,
            mandatoryTides: ["alpha"],
            optionalTides: [],
          },
        ],
        state: { ...baseInput.state, deck: [] },
      });

      expect(init.enemyDeckDefinition).toHaveLength(ENEMY_DECK_SIZE);
      const selectedNumbers = new Set(
        init.enemyDeckDefinition.map((card) => card.cardNumber),
      );
      for (const cardNumber of globalRemovalNumbers) {
        expect(selectedNumbers.has(cardNumber)).toBe(true);
      }
    });

    it("throws when the required-tide pool cannot fill the unique deck", () => {
      const baseInput = makeBaseInput();
      const db = new Map<number, CardData>();
      for (let i = 0; i < 4; i += 1) {
        const card = makePackageCard(800 + i, "Event", 2, "cheap_removal");
        db.set(card.cardNumber, card);
      }
      for (let i = 0; i < 12; i += 1) {
        const card = makePackageCard(900 + i, "Character", 2, "alpha");
        db.set(card.cardNumber, card);
      }

      expect(() =>
        createBattleInit({
          ...baseInput,
          cardDatabase: db,
          dreamcallers: [
            {
              id: "alpha-dc",
              name: "Alpha Sentinel",
              title: "Sparse Pool Test",
              renderedText: "",
              imageNumber: "001",
              startingEssence: 250,
              mandatoryTides: ["alpha"],
              optionalTides: [],
            },
          ],
          state: { ...baseInput.state, deck: [] },
        }),
      ).toThrow(/enemy deck needs 40 unique cards/);
    });

    it("treats an empty required-tide enemy as accepting all candidates", () => {
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
      expect(
        new Set(init.enemyDeckDefinition.map((card) => card.cardNumber)).size,
      ).toBe(ENEMY_DECK_SIZE);
    });

    it("shuffles the final enemy deck deterministically", () => {
      const init = createBattleInit(makeBaseInput());
      const numbers = init.enemyDeckDefinition.map((card) => card.cardNumber);
      const sortedNumbers = [...numbers].sort((a, b) => a - b);

      expect(numbers.length).toBe(ENEMY_DECK_SIZE);
      expect(numbers).not.toEqual(sortedNumbers);
      const again = createBattleInit(makeBaseInput());
      expect(
        [...again.enemyDeckDefinition.map((c) => c.cardNumber)].sort(
          (a, b) => a - b,
        ),
      ).toEqual(sortedNumbers);
    });

    it("has enough real content for every Dreamcaller recipe", async () => {
      const content = await readGeneratedQuestContent();
      if (content === null) {
        return;
      }
      const eligibleCards = content.cards.filter(
        (card) => !card.isStarter && card.energyCost !== null,
      );
      const globalRemovalEvents = eligibleCards.filter(isRemovalEventCard);

      expect(globalRemovalEvents.length).toBeGreaterThanOrEqual(4);

      for (const dreamcaller of content.dreamcallers) {
        const requiredPool = eligibleCards.filter((card) =>
          overlapsTides(card, dreamcaller.mandatoryTides),
        );
        expect(
          requiredPool.length,
          `${dreamcaller.name} required-pool count`,
        ).toBeGreaterThanOrEqual(36);
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
