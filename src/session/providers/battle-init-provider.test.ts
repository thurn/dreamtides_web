// Contracts of the journey battle-init build on synthetic journeys: the
// preview equals the folded init, and the engine init carries every
// next-battle effect and deck-entry modification (D39), checked against the
// engine's computed characteristics after the battle starts.
import { beforeEach, describe, expect, it } from "vitest";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
} from "../../testing/atlas-fixtures";
import {
  makeBattleTestCardDatabase,
  makeBattleTestAvatars,
  makeBattleTestState,
} from "../../battle/test-support";
import type { JourneyContent } from "../../data/journey-content";
import { testJourneyState } from "../../testing/journey-genesis";
import type { BattleModifier, DeckEntry, JourneyState } from "../../types/journey";
import type { CardData } from "../../types/cards";
import { getLogEntries, resetLog } from "../../logging";
import {
  createBattleInitProvider,
  createBattlePreview,
  settleDeferredOpponentLog,
} from "./battle-init-provider";
import {
  testCardId,
  testCardSubtype,
  testDreamwellCardId,
  testDreamwellCardName,
  testJourneyMutationSource,
} from "../../types/test-identities";
import {
  parseCardTypeChangePredicateId,
  parseDeckEntryId,
  parseJourneyId,
  parseSiteId,
} from "../../types/identifiers";
import { parseCardName } from "../../types/card-identity";
import { hashState } from "../../eventlog/hash";
import type { BattleState } from "../../engine";
import { instanceCard } from "../../engine/catalog";
import { characteristicsOf } from "../../engine/continuous/characteristics";
import { fixedEnergy } from "../../engine/dsl/energy";
import { createFoldAdapter, type BattleSlice } from "../../engine/fold/slice";
import type { InstanceId } from "../../engine/state/ids";
import { resolveEnemyAvatarSummary } from "../../battle/components/enemy-avatar-summary";

const SITE_ID = parseSiteId("site-7");

function makeContent(extraCards: readonly CardData[] = []): JourneyContent {
  const cardDatabase = makeBattleTestCardDatabase();
  for (const card of extraCards) cardDatabase.set(card.cardNumber, card);
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase,
    avatars: makeBattleTestAvatars(),
    dreamwellCards: [
      {
        id: testDreamwellCardId("json-safe-battle"),
        name: testDreamwellCardName("JSON-safe Battle"),
        renderedText: "Synthetic Dreamwell fixture.",
        order: 1,
        energyAdded: 1,
        cardNumber: 1,
      },
    ],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}

function makeJourney(overrides: Partial<JourneyState> = {}): JourneyState {
  return {
    ...testJourneyState(),
    ...makeBattleTestState(),
    runId: parseJourneyId("journey:test"),
    dreamsigns: [],
    ...overrides,
  };
}

function begin(content: JourneyContent, journey: JourneyState, seq = 17) {
  const provider = createBattleInitProvider(content);
  const start = provider.beginBattle({
    journey,
    siteId: SITE_ID,
    seedOverride: 4242,
    seq,
    rng: () => 0,
    timestamp: new Date(0).toISOString(),
  });
  if (start === null) throw new Error("the battle did not begin");
  const outcome = createFoldAdapter(provider.engine).start(start.engineInit);
  if (outcome.kind !== "applied" || outcome.error !== null) {
    throw new Error("the engine battle did not start");
  }
  return { start, engine: provider.engine, slice: outcome.slice };
}

function committed(slice: BattleSlice): BattleState {
  return slice.committed;
}

function modifier(battleModifier: Record<string, unknown>): BattleModifier {
  return {
    battlesRemaining: 1,
    source: testJourneyMutationSource("exploration:test"),
    ...battleModifier,
  } as BattleModifier;
}

describe("battle init provider", () => {
  beforeEach(() => resetLog());

  it("builds the same preview init that BEGIN_BATTLE will fold, with its engine init", () => {
    const content = makeContent();
    const journey = makeJourney();

    const preview = createBattlePreview(content, journey, SITE_ID, 4242);
    const { start, slice } = begin(content, journey);

    expect(preview).not.toBeNull();
    expect(start.battle.init).toEqual(preview);
    expect(start.battle.init.seed).toBe(4242);
    expect(start.engineInit.scoreToWin).toBe(start.battle.init.scoreToWin);
    expect(start.engineInit.decks.enemy.map((entry) => entry.cardId)).toEqual(
      start.battle.init.enemyDeckDefinition.map((card) => card.cardId),
    );
    expect(start.engineInit.dreamwell).toEqual([
      testDreamwellCardId("json-safe-battle"),
    ]);
    expect(slice.committed.result).toBeNull();
    expect(() => hashState(start)).not.toThrow();
    expect(hashState(JSON.parse(JSON.stringify(start)))).toBe(hashState(start));
    expect(getLogEntries()).toEqual([]);

    expect(settleDeferredOpponentLog(17, true)).toBe(true);
    expect(
      getLogEntries().some(
        (entry) => entry.event === "opponent_signature_cards_selected",
      ),
    ).toBe(true);
    const count = getLogEntries().length;
    expect(settleDeferredOpponentLog(17, true)).toBe(false);
    expect(getLogEntries()).toHaveLength(count);
  });

  it("names the opponent Avatar by UUID on the enemy descriptor", () => {
    const content = makeContent();
    const { start } = begin(content, makeJourney());
    const descriptor = start.battle.init.enemyDescriptor;

    expect(content.avatars.map((avatar) => avatar.id)).toContain(
      descriptor.avatarId,
    );
    expect(resolveEnemyAvatarSummary(descriptor, content).id).toBe(
      descriptor.avatarId,
    );
  });

  it("pads a short journey deck to the minimum battle deck size with every entry", () => {
    const content = makeContent();
    const journey = makeJourney();
    const { start } = begin(content, journey);
    const deckCards = journey.deck.map(
      (entry) => content.cardDatabase.get(entry.cardNumber)?.id,
    );
    const player = start.engineInit.decks.player.map((entry) => entry.cardId);
    expect(player.length).toBeGreaterThanOrEqual(
      content.opponentsData.battle.minimumDeckSize,
    );
    expect(new Set(player)).toEqual(new Set(deckCards));
  });

  it("never fills a short opponent deck with Starter, Tutorial, or Special cards", () => {
    const special = Array.from({ length: 40 }, (_unused, index) =>
      rarityCard(5000 + index, index % 2 === 0 ? "Special" : "Tutorial"),
    );
    const content = makeContent(special);
    const { start } = begin(content, makeJourney());
    const excluded = new Set(special.map((card) => card.id));
    expect(start.engineInit.decks.enemy.length).toBeGreaterThan(0);
    expect(
      start.engineInit.decks.enemy.filter((entry) => excluded.has(entry.cardId)),
    ).toEqual([]);
  });
});

describe("next-battle effects", () => {
  const baseline = () => begin(makeContent(), makeJourney()).slice;
  const withModifiers = (...modifiers: BattleModifier[]) =>
    begin(makeContent(), makeJourney({ battleModifiers: modifiers }));

  it("adds NextBattleOpeningHand cards to the opening hand", () => {
    const { start, slice } = withModifiers(
      modifier({ kind: "opening_hand_bonus", count: 2 }),
    );
    expect(start.engineInit.nextBattle?.player?.openingHand).toEqual([
      { count: 2, filter: null },
    ]);
    expect(committed(slice).sides.player.hand).toHaveLength(
      committed(baseline()).sides.player.hand.length + 2,
    );
  });

  it("draws NextBattleOpeningHand cards matching its predicate after the ordinary hand", () => {
    const { start, engine, slice } = withModifiers(
      modifier({ kind: "opening_hand_event_draw", count: 2 }),
    );
    expect(start.engineInit.nextBattle?.player?.openingHand).toEqual([
      { count: 2, filter: { cardType: "event" } },
    ]);
    const hand = committed(slice).sides.player.hand;
    const ordinary = committed(baseline()).sides.player.hand.length;
    expect(hand).toHaveLength(ordinary + 2);
    for (const id of hand.slice(ordinary)) {
      expect(characteristicsOf(committed(slice), engine.catalog, id).cardType).toBe(
        "event",
      );
    }
  });

  it("starts the battle with NextBattleStartingEnergy", () => {
    const { start, slice } = withModifiers(
      modifier({ kind: "starting_energy_bonus", count: 3 }),
    );
    expect(start.engineInit.nextBattle?.player?.startingEnergy).toBe(3);
    const before = committed(baseline()).sides.player;
    const after = committed(slice).sides.player;
    expect(after.maxEnergy).toBe(before.maxEnergy + 3);
    expect(after.currentEnergy).toBe(before.currentEnergy + 3);
  });

  it("shrinks the hand and discounts every deck card for NextBattleSmallerHandAndCostDiscount", () => {
    const { engine, slice } = withModifiers(
      modifier({
        kind: "smaller_hand_and_cost_discount",
        openingHandDelta: -1,
        energyCostReduction: 1,
      }),
    );
    const state = committed(slice);
    expect(state.sides.player.hand).toHaveLength(
      committed(baseline()).sides.player.hand.length - 1,
    );
    for (const instance of Object.values(state.instances)) {
      const printed = fixedEnergy(engine.catalog.card(cardIdOf(state, instance.id)).costs);
      const cost = fixedEnergy(instanceCard(engine.catalog, instance).costs);
      expect(cost).toBe(
        instance.owner === "player" ? Math.max(0, printed - 1) : printed,
      );
    }
  });

  it("carries no next-battle effects once every modifier is spent", () => {
    const { start } = withModifiers(
      { ...modifier({ kind: "starting_energy_bonus", count: 3 }), battlesRemaining: 0 },
    );
    expect(start.engineInit.nextBattle).toBeUndefined();
  });
});

describe("deck-entry variants", () => {
  const kinds: Record<string, DeckEntry> = {
    sparkBonus: { ...entry("spark", 101), sparkBonus: 2 },
    costReduction: { ...entry("cost", 104), keywordModification: { energyCostReduction: 2 } },
    fast: { ...entry("fast", 106), keywordModification: { fast: true } },
    grantedReclaim: { ...entry("granted", 107), keywordModification: { reclaim: 2 } },
    overriddenReclaim: { ...entry("override", 108), keywordModification: { setReclaim: 0 } },
    subtype: {
      ...entry("subtype", 102),
      typeChange: typeChange("Character", "Ancient"),
    },
    cardType: { ...entry("type", 205), typeChange: typeChange("Character", "Spirit") },
    transfiguration: { ...entry("kindled", 103), transfiguration: "Kindled" },
    amplified: { ...entry("amplified", 9001), transfiguration: "Amplified" },
  };

  function started() {
    const amplifiable: CardData = {
      ...rarityCard(9001, "Common"),
      amplifiedText: "Amplified text.",
    };
    const content = makeContent([amplifiable]);
    const result = begin(
      content,
      makeJourney({ deck: Object.values(kinds) }),
    );
    const state = committed(result.slice);
    const of = (kind: keyof typeof kinds): InstanceId => {
      const cardId = content.cardDatabase.get(kinds[kind].cardNumber)?.id;
      const found = Object.values(state.instances).find(
        (instance) =>
          instance.owner === "player" &&
          instance.printing.kind === "card" &&
          instance.printing.cardId === cardId,
      );
      if (found === undefined) throw new Error(`no ${kind} instance`);
      return found.id;
    };
    const card = (kind: keyof typeof kinds) =>
      instanceCard(result.engine.catalog, state.instances[of(kind)]);
    const characteristics = (kind: keyof typeof kinds) =>
      characteristicsOf(state, result.engine.catalog, of(kind));
    return { state, of, card, characteristics };
  }

  it("adds the spark bonus to a character's spark", () => {
    expect(started().characteristics("sparkBonus").spark).toBe(2 + 2);
  });

  it("reduces the energy cost", () => {
    expect(fixedEnergy(started().card("costReduction").costs)).toBe(4 - 2);
  });

  it("makes the card Fast", () => {
    expect(started().card("fast").speed).toBe("fast");
  });

  it("grants Reclaim at the modification's cost", () => {
    const reclaim = started()
      .card("grantedReclaim")
      .abilities({ amplified: false })
      .filter((ability) => ability.kind === "reclaim");
    expect(reclaim).toEqual([{ kind: "reclaim", costs: [{ cost: "energy", amount: 2 }] }]);
  });

  it("overrides Reclaim with the set cost", () => {
    const reclaim = started()
      .card("overriddenReclaim")
      .abilities({ amplified: false })
      .filter((ability) => ability.kind === "reclaim");
    expect(reclaim).toEqual([{ kind: "reclaim", costs: [{ cost: "energy", amount: 0 }] }]);
  });

  it("changes the subtype that selectors read", () => {
    expect(started().characteristics("subtype").subtype).toBe("Ancient");
  });

  it("turns an Event into a Character with 0 spark", () => {
    const characteristics = started().characteristics("cardType");
    expect(characteristics.cardType).toBe("character");
    expect(characteristics.subtype).toBe("Spirit");
    expect(characteristics.spark).toBe(0);
  });

  it("carries the transfiguration on the variant", () => {
    const { state, of } = started();
    expect(state.instances[of("transfiguration")].variant.transfigurations).toEqual([
      "Kindled",
    ]);
  });

  it("plays an Amplified entry as its amplified variant", () => {
    const { state, of } = started();
    expect(state.instances[of("amplified")].variant.amplified).toBe(true);
    expect(state.instances[of("sparkBonus")].variant.amplified).toBe(false);
  });
});

function entry(label: string, cardNumber: number): DeckEntry {
  return {
    entryId: parseDeckEntryId(`entry-${label}`),
    cardNumber,
    transfiguration: null,
    isBane: false,
  };
}

function typeChange(
  cardType: CardData["cardType"],
  subtype: string,
): NonNullable<DeckEntry["typeChange"]> {
  return {
    predicateId: parseCardTypeChangePredicateId("predicate-test"),
    cardType,
    subtype: testCardSubtype(subtype),
    label: subtype,
  };
}

function rarityCard(cardNumber: number, rarity: CardData["rarity"]): CardData {
  return {
    name: parseCardName(`Rarity ${String(cardNumber)}`),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: testCardSubtype("Warrior"),
    isStarter: false,
    rarity,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function cardIdOf(state: BattleState, id: InstanceId) {
  const printing = state.instances[id].printing;
  if (printing.kind === "figment") throw new Error("a figment has no card");
  return printing.cardId;
}
