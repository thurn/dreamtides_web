import { describe, expect, it } from "vitest";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import {
  createBattleInit,
  type CreateBattleInitInput,
} from "./create-battle-init";
import { deriveBattleSeed } from "../random";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { DreamAvatarContent } from "../../types/content";
import type {
  CardKeywordModification,
  CardTypeChange,
} from "../../types/journey";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import type { CardTransfigurationDisplay } from "../../runtime/transfiguration-display";
import {
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "../../runtime/transfigure-markers";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";

// The padded minimum battle deck size; the enemy deck is padded up to this.
const MIN_BATTLE_DECK_SIZE = 25;

function makeBaseInput(): CreateBattleInitInput {
  return {
    opponentsData: opponentsFixture(),
    transfigurationData: transfigurationFixture(),
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamAvatars: makeBattleTestDreamAvatars(),
  };
}

function stripTransfigurationMarkers(text: string): string {
  return text
    .split(TRANSFIGURE_MARK_START)
    .join("")
    .split(TRANSFIGURE_MARK_END)
    .join("");
}

function makePackageCard(
  cardNumber: number,
  cardType: CardData["cardType"],
  energyCost: number,
  packageTide: string,
): CardData {
  return {
    name: asCardName(`${packageTide} ${String(cardNumber)}`),
    id: asCardId(`${packageTide}-${String(cardNumber)}`),
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
 * Returns a single-DreamAvatar set whose DreamAvatar carries the given signature
 * cards, so the enemy descriptor is deterministic and its signature steers the
 * enemy deck.
 */
function makeSignatureDreamAvatars(
  signatureCards: readonly string[],
): DreamAvatarContent[] {
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

  it("resolves non-default battle and AI values from opponent configuration", () => {
    const opponentsData = opponentsFixture();
    opponentsData.contentHash = "c".repeat(64);
    opponentsData.battle = {
      ...opponentsData.battle,
      minimumDeckSize: 9,
      playerOpeningHandSize: 3,
      enemyOpeningHandSize: 4,
      scoreTargets: [7, 13],
      turnLimit: 31,
      energyCap: 8,
      handLimit: 6,
      startingSide: "enemy",
      skipPlayerOpeningDraw: false,
      opponentSignatureCardCount: 1,
    };
    opponentsData.progression = {
      ...opponentsData.progression,
      abilityActiveFromLayer: 6,
    };
    opponentsData.ai.presets.standard = {
      ...opponentsData.ai.presets.standard,
      beamWidth: 5,
      searchDepth: 9,
    };
    const state = { ...makeBattleTestState(), completionLevel: 6 };
    const cardDatabase = makeBattleTestCardDatabase();
    const signatureCardIds = [...cardDatabase.values()]
      .slice(0, 2)
      .map((card) => card.id);
    const init = createBattleInit({
      ...makeBaseInput(),
      opponentsData,
      state,
      cardDatabase,
      dreamAvatars: makeSignatureDreamAvatars(signatureCardIds),
    });

    expect(init.playerDeckOrder).toHaveLength(16);
    expect(init.openingHandSize).toBe(3);
    expect(init.enemyOpeningHandSize).toBe(4);
    expect(init.scoreToWin).toBe(13);
    expect(init.turnLimit).toBe(31);
    expect(init.maxEnergyCap).toBe(8);
    expect(init.handLimit).toBe(6);
    expect(init.startingSide).toBe("enemy");
    expect(init.playerDrawSkipsTurnOne).toBe(false);
    expect(init.opponentsContentHash).toBe("c".repeat(64));
    expect(init.opponentAbilityActive).toBe(true);
    expect(init.aiConfiguration).toMatchObject({
      id: "standard",
      beamWidth: 5,
      searchDepth: 9,
    });
    expect(init.enemyDescriptor.signatureCards).toHaveLength(1);
  });

  it("applies active Exploration opening-hand and starting-energy bonuses", () => {
    const baseState = makeBattleTestState();
    const init = createBattleInit({
      ...makeBaseInput(),
      state: {
        ...baseState,
        battleModifiers: [
          {
            kind: "opening_hand_bonus",
            count: 2,
            battlesRemaining: 1,
            source: "exploration:test:hand",
          },
          {
            kind: "starting_energy_bonus",
            count: 3,
            battlesRemaining: 1,
            source: "exploration:test:energy",
          },
        ],
      },
    });

    expect(init.openingHandSize).toBe(7);
    expect(init.enemyOpeningHandSize).toBe(5);
    expect(init.playerStartingEnergy).toBe(3);
  });

  it("applies the next-battle smaller-hand discount only to the player deck", () => {
    const baseInput = makeBaseInput();
    const baseline = createBattleInit(baseInput);
    const discounted = createBattleInit({
      ...baseInput,
      state: {
        ...baseInput.state,
        battleModifiers: [
          {
            kind: "smaller_hand_and_cost_discount",
            openingHandDelta: -1,
            energyCostReduction: 1,
            battlesRemaining: 1,
            source: "exploration:test:discount",
          },
        ],
      },
    });

    expect(discounted.openingHandSize).toBe(4);
    expect(discounted.enemyOpeningHandSize).toBe(5);
    expect(discounted.enemyDeckDefinition).toEqual(
      baseline.enemyDeckDefinition,
    );
    expect(discounted.playerDeckOrder).toHaveLength(
      baseline.playerDeckOrder.length,
    );
    discounted.playerDeckOrder.forEach((card, index) => {
      const original = baseline.playerDeckOrder[index];
      if (original === undefined) throw new Error("Expected a baseline card");
      expect(card.sourceDeckEntryId).toBe(original.sourceDeckEntryId);
      expect(card.energyCost).toBe(Math.max(0, original.energyCost - 1));
    });
  });

  describe("seed determinism (B-10)", () => {
    it("same seed produces identical enemy descriptor and deck orders", () => {
      const input = makeBaseInput();
      const first = createBattleInit(input);
      const second = createBattleInit(input);

      expect(first.enemyDescriptor).toEqual(second.enemyDescriptor);
      expect(
        first.playerDeckOrder.map((card) => card.sourceDeckEntryId),
      ).toEqual(second.playerDeckOrder.map((card) => card.sourceDeckEntryId));
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

      expect(sameEnemyDescriptor && samePlayerDeckOrder && sameEnemyDeck).toBe(
        false,
      );
    });

    it("same battle entry in different journey seeds uses a different battle seed", () => {
      const baseInput = makeBaseInput();
      const otherInput: CreateBattleInitInput = {
        ...baseInput,
        state: { ...baseInput.state, seed: "another-journey-seed" },
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
      for (const invalid of [
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
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
    it("uses an injected battle reward curve and its authored floor", () => {
      const economy = economyFixture();
      economy.battleReward = {
        baseEssence: 43,
        essencePerCompletionLevel: 17,
        minimumEssence: 11,
      };
      const state = {
        ...makeBattleTestState(),
        completionLevel: 3,
        battleModifiers: [
          {
            kind: "reward_reduction_flat" as const,
            amount: 200,
            battlesRemaining: 1,
            source: "journey:test",
          },
        ],
      };

      const init = createBattleInit({
        ...makeBaseInput(),
        state,
        economyData: economy,
      });

      expect(init.essenceReward).toBe(11);
    });

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

    it("flags final boss at completion level 6", () => {
      const baseState = makeBattleTestState();
      const finalInit = createBattleInit({
        ...makeBaseInput(),
        state: { ...baseState, completionLevel: 6 },
      });
      const ordinaryInit = createBattleInit({
        ...makeBaseInput(),
        state: { ...baseState, completionLevel: 2 },
      });

      expect(finalInit.isFinalBoss).toBe(true);
      expect(ordinaryInit.isFinalBoss).toBe(false);
    });
  });

  describe("playerDeckOrder", () => {
    it("preserves entryId for every journey deck entry", () => {
      const init = createBattleInit(makeBaseInput());
      // The battle deck is padded up to the minimum size, so the same journey
      // entry id can appear multiple times; the set of distinct ids still
      // matches the journey deck exactly.
      const sourceIds = [
        ...new Set(
          init.playerDeckOrder
            .map((card) => card.sourceDeckEntryId)
            .filter((id): id is string => id !== null),
        ),
      ].sort();
      const inputIds = makeBaseInput()
        .state.deck.map((entry) => entry.entryId)
        .sort();
      expect(sourceIds).toEqual(inputIds);
    });

    it("pads a small journey deck up to the minimum battle deck size", () => {
      const init = createBattleInit(makeBaseInput());
      // makeBattleTestState has an 8-card deck: padded to 32 (8 -> 16 -> 24 -> 32).
      expect(init.playerDeckOrder.length).toBeGreaterThanOrEqual(25);
      expect(init.journeyDeckEntries).toHaveLength(8);
    });

    it("freezes the player deck order and each card", () => {
      const init = createBattleInit(makeBaseInput());
      expect(Object.isFrozen(init.playerDeckOrder)).toBe(true);
      for (const card of init.playerDeckOrder) {
        expect(Object.isFrozen(card)).toBe(true);
      }
    });

    it("mirrors each journey deck entry into the top-level journeyDeckEntries field (B-3)", () => {
      const baseInput = makeBaseInput();
      const init = createBattleInit(baseInput);

      expect(init.journeyDeckEntries).toHaveLength(baseInput.state.deck.length);
      expect(Object.isFrozen(init.journeyDeckEntries)).toBe(true);

      const byEntryId = new Map(
        init.journeyDeckEntries.map((entry) => [entry.entryId, entry]),
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

    it("keeps journeyDeckEntries consistent with playerDeckOrder per-card metadata", () => {
      const init = createBattleInit(makeBaseInput());
      const journeyEntriesByEntryId = new Map(
        init.journeyDeckEntries.map((entry) => [entry.entryId, entry]),
      );

      for (const card of init.playerDeckOrder) {
        if (card.sourceDeckEntryId === null) {
          continue;
        }
        const journeyEntry = journeyEntriesByEntryId.get(
          card.sourceDeckEntryId,
        );
        expect(journeyEntry).toBeDefined();
        expect(journeyEntry).toEqual({
          entryId: card.sourceDeckEntryId,
          cardNumber: card.cardNumber,
          transfiguration: card.transfiguration,
          isBane: card.isBane,
        });
      }
    });

    it.each([
      {
        type: "Inspired" as const,
        card: {
          cardType: "Event" as const,
          energyCost: 2,
          spark: null,
          isFast: false,
          renderedText: "Foresee.",
        },
      },
      {
        type: "Perfected" as const,
        card: {
          cardType: "Character" as const,
          energyCost: 0,
          spark: 3,
          isFast: false,
          renderedText: "A wall of thorns.",
        },
      },
    ])(
      "persists the exact shared $type display descriptor",
      ({ type, card: overrides }) => {
        const baseInput = makeBaseInput();
        const sourceEntry = baseInput.state.deck[0];
        const original = baseInput.cardDatabase.get(sourceEntry.cardNumber);
        if (original === undefined) throw new Error("expected source card");
        const card = { ...original, ...overrides };
        const input = {
          ...baseInput,
          cardDatabase: new Map(baseInput.cardDatabase).set(
            card.cardNumber,
            card,
          ),
          state: {
            ...baseInput.state,
            deck: baseInput.state.deck.map((entry, index) =>
              index === 0 ? { ...entry, transfiguration: type } : entry,
            ),
          },
        };
        const definition = createBattleInit(input).playerDeckOrder.find(
          (entry) => entry.sourceDeckEntryId === sourceEntry.entryId,
        );
        const display = (
          definition as typeof definition & {
            transfigurationDisplay?: CardTransfigurationDisplay;
          }
        )?.transfigurationDisplay;
        expect(display).toEqual(
          buildTransfigurationDisplay(input.transfigurationData, card, type)
            .display,
        );
      },
    );

    it("keeps later type and keyword changes visible but outside transfiguration markers", () => {
      const baseInput = makeBaseInput();
      const sourceEntry = baseInput.state.deck[0];
      const original = baseInput.cardDatabase.get(sourceEntry.cardNumber);
      if (original === undefined) throw new Error("expected source card");
      const card: CardData = {
        ...original,
        id: asCardId("11111111-1111-4111-8111-111111111111"),
        cardType: "Event",
        subtype: "Vision",
        energyCost: 2,
        spark: null,
        isFast: false,
        renderedText: "Foresee.",
      };
      const keywordModification: CardKeywordModification = { reclaim: 2 };
      const typeChange: CardTypeChange = {
        predicateId: "visions",
        cardType: "Character",
        subtype: "Seer",
        label: "Seer",
      };
      const input: CreateBattleInitInput = {
        ...baseInput,
        cardDatabase: new Map(baseInput.cardDatabase).set(
          card.cardNumber,
          card,
        ),
        state: {
          ...baseInput.state,
          deck: baseInput.state.deck.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  transfiguration: "Inspired",
                  keywordModification,
                  typeChange,
                }
              : entry,
          ),
        },
      };
      const definition = createBattleInit(input).playerDeckOrder.find(
        (entry) => entry.sourceDeckEntryId === sourceEntry.entryId,
      );
      if (definition?.transfigurationDisplay === undefined) {
        throw new Error("expected transfiguration display");
      }

      expect(definition.cardId).toBe(card.id);
      expect(definition.battleCardKind).toBe("character");
      expect(
        stripTransfigurationMarkers(
          definition.transfigurationDisplay.markedText,
        ),
      ).toBe(definition.renderedText);
      expect(definition.transfigurationDisplay.markedText).toBe(
        `Foresee. ${TRANSFIGURE_MARK_START}Draw a card.${TRANSFIGURE_MARK_END}\n\nReclaim 2●`,
      );
      expect(definition.transfigurationDisplay.markedText).not.toContain(
        `${TRANSFIGURE_MARK_START}Reclaim`,
      );
    });

    it("applies journey deck entry type changes to player battle card definitions", () => {
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

      const init = createBattleInit({
        ...baseInput,
        state: stateWithTypeChange,
      });
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

    it("applies journey deck entry keyword changes to player battle card definitions", () => {
      const baseInput = makeBaseInput();
      const changedEntryId = "deck-5";
      const keywordModification: CardKeywordModification = {
        fast: true,
        reclaim: 2,
      };
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

    it("applies journey deck entry stat overrides to player battle card definitions", () => {
      const baseInput = makeBaseInput();
      const changedEntryId = "deck-1";
      const changedEntry = baseInput.state.deck.find(
        (entry) => entry.entryId === changedEntryId,
      );
      if (changedEntry === undefined) {
        throw new Error(`Missing test deck entry: ${changedEntryId}`);
      }
      // Derive the printed stats from the live card database so the test
      // survives edits to the fixture's printed values.
      const printed = makeBattleTestCardDatabase().get(changedEntry.cardNumber);
      if (printed === undefined) {
        throw new Error(
          `Missing test card: ${String(changedEntry.cardNumber)}`,
        );
      }
      const printedEnergyCost = printed.energyCost;
      const printedSpark = printed.spark;
      if (printedEnergyCost === null || printedSpark === null) {
        throw new Error(
          "Expected the chosen test card to have numeric printed stats",
        );
      }
      const overriddenEnergyCost = printedEnergyCost + 7;
      const overriddenSpark = printedSpark + 7;

      const stateWithStatOverride = {
        ...baseInput.state,
        deck: baseInput.state.deck.map((entry) =>
          entry.entryId === changedEntryId
            ? {
                ...entry,
                statOverride: {
                  energyCost: overriddenEnergyCost,
                  spark: overriddenSpark,
                },
              }
            : entry,
        ),
      };

      const init = createBattleInit({
        ...baseInput,
        state: stateWithStatOverride,
      });
      const changedCard = init.playerDeckOrder.find(
        (card) => card.sourceDeckEntryId === changedEntryId,
      );

      expect(changedCard?.printedEnergyCost).toBe(overriddenEnergyCost);
      expect(changedCard?.printedSpark).toBe(overriddenSpark);
    });

    it("applies journey deck entry spark bonuses to player battle card definitions", () => {
      const baseInput = makeBaseInput();
      const changedEntry = baseInput.state.deck[0];
      if (changedEntry === undefined)
        throw new Error("Missing test deck entry");
      const printed = makeBattleTestCardDatabase().get(changedEntry.cardNumber);
      if (printed?.spark === null || printed?.spark === undefined) {
        throw new Error("Expected a numeric printed spark");
      }
      const init = createBattleInit({
        ...baseInput,
        state: {
          ...baseInput.state,
          deck: baseInput.state.deck.map((entry) =>
            entry.entryId === changedEntry.entryId
              ? { ...entry, sparkBonus: 2 }
              : entry,
          ),
        },
      });
      const changedCard = init.playerDeckOrder.find(
        (card) => card.sourceDeckEntryId === changedEntry.entryId,
      );

      expect(changedCard?.printedSpark).toBe(printed.spark + 2);
    });

    it("throws when a journey deck entry references a missing card number", () => {
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

    it("uses the selected DreamAvatar's exact identity for real enemies", () => {
      const input = makeBaseInput();
      const init = createBattleInit(input);
      const selectedDreamAvatar = input.dreamAvatars.find((dreamAvatar) =>
        init.enemyDescriptor.id.startsWith(`enemy:${dreamAvatar.id}:`),
      );

      expect(selectedDreamAvatar).toBeDefined();
      expect(init.enemyDescriptor.name).toBe(selectedDreamAvatar?.name);
      // The descriptor carries the DreamAvatar's title as its subtitle so the
      // Battle Start name plate and the in-battle side summary can show it.
      expect(init.enemyDescriptor.subtitle).toBe(selectedDreamAvatar?.title);
      for (const prefix of ["Shadow", "Nightmare", "Phantom", "Dark"]) {
        expect(init.enemyDescriptor.name.startsWith(`${prefix} `)).toBe(false);
      }
    });

    it("falls back to a synthetic descriptor when no dreamAvatars are available", () => {
      const init = createBattleInit({
        ...makeBaseInput(),
        dreamAvatars: [],
      });

      expect(init.enemyDescriptor.id).toBe("enemy:fallback");
      expect(init.enemyDescriptor.dreamsigns).toEqual([]);
    });

    it("gives a post-midpoint opponent a single concrete dreamsign drawn from the supplied templates", () => {
      const baseState = makeBattleTestState();
      const templates = [
        {
          id: "enemy-sign-1",
          name: "Enemy Sign One",
          effectDescription: "An opposing boon.",
          imageName: "enemy-sign-one.webp",
          imageAlt: "A luminous enemy sigil",
        },
        {
          id: "enemy-sign-2",
          name: "Enemy Sign Two",
          effectDescription: "Another opposing boon.",
        },
      ];
      // makeBattleTestState's atlas has no per-layer node lists, so the run
      // length resolves to the default 7-layer run (midpoint = completion
      // level 3); a battle at completion level 4 is past the midpoint.
      const init = createBattleInit({
        ...makeBaseInput(),
        state: { ...baseState, completionLevel: 4 },
        dreamsignTemplates: templates,
      });

      expect(init.enemyDescriptor.dreamsigns).toHaveLength(1);
      const dreamsignNames = new Set(templates.map((t) => t.name));
      for (const dreamsign of init.enemyDescriptor.dreamsigns) {
        expect(dreamsignNames.has(dreamsign.name)).toBe(true);
      }
      const dreamsign = init.enemyDescriptor.dreamsigns[0];
      const source = templates.find(
        (template) => template.id === dreamsign?.id,
      );
      expect(source).toBeDefined();
      expect(dreamsign).toMatchObject({
        id: source?.id,
        imageName: source?.imageName,
        imageAlt: source?.imageAlt,
      });
    });

    it("gives a pre-midpoint opponent no dreamsigns even when templates are supplied", () => {
      const baseState = makeBattleTestState();
      const init = createBattleInit({
        ...makeBaseInput(),
        // Completion level 0 is the first battle, well before the run midpoint.
        state: { ...baseState, completionLevel: 0 },
        dreamsignTemplates: [
          {
            id: "enemy-sign-1",
            name: "Enemy Sign One",
            effectDescription: "An opposing boon.",
          },
        ],
      });

      expect(init.enemyDescriptor.dreamsigns).toHaveLength(0);
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
      // Minimal fixture content samples from draftable cards (non-starter,
      // numeric cost). Confirm both exclusions hold over a card
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

    it("builds a non-empty deck with minimal content", () => {
      const init = createBattleInit(makeBaseInput());
      expect(init.enemyDeckDefinition.length).toBeGreaterThan(0);
      for (const card of init.enemyDeckDefinition) {
        expect(makeBattleTestCardDatabase().get(card.cardNumber)).toBeDefined();
      }
    });

    it("builds the AI Starter deck (510-519 only) and is deterministic in aiMode", () => {
      // Augment the base card database with the 10 real Starter card numbers
      // (510-519). buildAiStarterDeck filters to isStarter cards, so only these
      // should appear in the enemy deck when aiMode is on.
      const baseInput = makeBaseInput();
      const augmented = new Map(baseInput.cardDatabase);
      const starterNumbers = Array.from({ length: 10 }, (_, i) => 510 + i);
      for (const cardNumber of starterNumbers) {
        const cardId =
          opponentsFixture().journeyAiDeck[cardNumber - 510].cardId;
        augmented.set(cardNumber, {
          ...makePackageCard(cardNumber, "Character", 1, "starter"),
          id: asCardId(cardId),
          isStarter: true,
        });
      }

      const input: CreateBattleInitInput = {
        ...baseInput,
        cardDatabase: augmented,
        aiMode: true,
        seedOverride: 4242,
      };
      const first = createBattleInit(input);
      const second = createBattleInit(input);

      const allowed = new Set(starterNumbers);
      const deckNumbers = first.enemyDeckDefinition.map((c) => c.cardNumber);
      // 3 copies x 10 starters = 30 cards, all within 510-519.
      expect(deckNumbers).toHaveLength(30);
      for (const cardNumber of deckNumbers) {
        expect(allowed.has(cardNumber)).toBe(true);
      }
      // Every starter is present exactly 3 times.
      for (const cardNumber of starterNumbers) {
        expect(deckNumbers.filter((n) => n === cardNumber)).toHaveLength(3);
      }
      // Deterministic for a fixed seed.
      expect(deckNumbers).toEqual(
        second.enemyDeckDefinition.map((c) => c.cardNumber),
      );
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
      if (init.dreamAvatarSummary !== null) {
        expect(Object.isFrozen(init.dreamAvatarSummary)).toBe(true);
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
      expect(Object.isFrozen(snapshot.layers)).toBe(true);
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
      const originalX = snapshot.nodes[firstNodeId].position.x;
      sourceAtlas.nodes[firstNodeId].position.x = originalX + 100;
      expect(snapshot.nodes[firstNodeId].position.x).toBe(originalX);
    });
  });
});
