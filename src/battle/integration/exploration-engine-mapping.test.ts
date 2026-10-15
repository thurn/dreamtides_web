import { afterEach, describe, expect, it } from "vitest";
import { EXPLORATION_EFFECT_KINDS } from "../../data/exploration-effect-kinds";
import { deckModsFromUnknown } from "../../engine/dsl/deck-mods";
import { createEngine } from "../../engine/engine";
import { instanceCard } from "../../engine/catalog";
import { cardLabBattle } from "../../engine/testing/card-lab";
import { SYNTHETIC, testCatalog } from "../../engine/testing/synthetic-cards";
import { buildExplorationRuntime, resolveExplorationChoice } from "../../session/providers/exploration-provider";
import { makeAuguryTestCard, makeAuguryTestContent, makeAuguryTestDreamsignTemplate } from "../../journey_v2/testing/fixtures";
import { applyJourneyRewardEffect } from "../../rules/journey/reward-effects";
import { makeAvatar } from "../../runtime/qa-scenes.fixtures";
import { testJourneyState } from "../../testing/journey-genesis";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { parseCardSubtype, EVENT_CARD_SUBTYPE } from "../../types/card-identity";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { testExplorationActionId, testDreamsignId } from "../../types/test-identities";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import type { ExplorationActionContent } from "../../data/exploration";
import type { DeckEntry, JourneyState, SiteState } from "../../types/journey";
import { createEngineBattleInit, engineDeckEntry } from "./engine-battle-init";
import { explorationEngineDestinations, journeyDeckModFields } from "./exploration-engine-mapping";
import { clearGameProviders } from "../../session/providers/register-game-providers";

const card = makeAuguryTestCard({ id: SYNTHETIC.vanilla2.id, cardNumber: 1, energyCost: 2, spark: 2 });
const duplicate = makeAuguryTestCard({ ...card, id: SYNTHETIC.vanilla1.id, cardNumber: 2 });
const nightmare = makeAuguryTestCard({ id: NIGHTMARE_CARD_ID, cardNumber: 3, cardType: "Event", subtype: EVENT_CARD_SUBTYPE, spark: null });
const sign = makeAuguryTestDreamsignTemplate({ id: testDreamsignId("d0000000-0000-4000-8000-000000062901") });
const avatar = makeAvatar("a0000000-0000-4000-8000-000000062901");
const content = { ...makeAuguryTestContent({ cards: [card, duplicate, nightmare], dreamsignTemplates: [sign] }), avatars: [avatar] };
const entry = (seed: string, cardNumber = 1): DeckEntry => ({ entryId: parseDeckEntryId(seed), cardNumber, transfiguration: null, isBane: false });
const site: SiteState = { id: parseSiteId("mapping-exploration"), type: "Exploration", isVisited: false, isEnhanced: false };

/** A real synthetic offer and its atomic public producer, retaining its complete output for the handoff. */
function produced(fields: Omit<ExplorationActionContent, "id" | "label">, selection: Record<string, unknown> = {}, deck = [entry("a"), entry("b", 2), entry("c", 2)]): JourneyState {
  const action: ExplorationActionContent = { id: testExplorationActionId("mapping-action"), label: "", ...fields };
  const local = { ...content, exploration: { ...content.exploration, encounters: [{ cardId: card.id, prose: "", actions: [action] }] } };
  const before = { ...testJourneyState(), deck };
  const runtime = buildExplorationRuntime(before, site, local, () => 0, card.id);
  if (runtime === null) throw new Error("Synthetic offer failed");
  const journey = { ...before, siteRuntime: { [site.id]: runtime } };
  const snapshot = structuredClone(journey);
  const input = { journey, site, content: local, seq: 1, payload: { actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection } };
  const after = resolveExplorationChoice(input);
  expect(journey).toEqual(snapshot);
  expect(resolveExplorationChoice(input)).toEqual(after);
  if (after === null) throw new Error("Synthetic producer refused its valid offer");
  return after;
}

afterEach(clearGameProviders);

describe("Exploration engine destinations", () => {
  it("covers the closed source union with actual typed destinations", () => {
    for (const kind of EXPLORATION_EFFECT_KINDS) expect(explorationEngineDestinations(kind).length).toBeGreaterThan(0);
    expect(explorationEngineDestinations("purge-duplicates-and-grant-reclaim")).toEqual([{ target: "deck-mod", field: "reclaim" }, { target: "battle-init", field: "decks" }]);
    expect(explorationEngineDestinations("purge-random-subtype-and-increase-spark")).toEqual([{ target: "deck-mod", field: "sparkBonus" }, { target: "battle-init", field: "decks" }]);
    expect(explorationEngineDestinations("purge-for-essence")).toEqual([{ target: "battle-init", field: "decks" }, { target: "nonbattle", field: "essence" }]);
    expect(explorationEngineDestinations("gain-nightmare-and-dreamsign")).toEqual([{ target: "battle-init", field: "dreamsigns" }, { target: "battle-init", field: "decks" }]);
    expect(explorationEngineDestinations("make-predicate-fast-and-gain-nightmares")).toEqual([{ target: "deck-mod", field: "fast" }, { target: "battle-init", field: "decks" }]);
    expect(explorationEngineDestinations("transfigure-all-for-essence")).toEqual([{ target: "variant", field: "transfigurations" }, { target: "nonbattle", field: "essence" }]);
  });

  it("projects values into the existing journey DTO and actual lab physical entry on either side", () => {
    const mods = deckModsFromUnknown({ sparkBonus: 3, costReduction: 1, fast: true, reclaim: 0, typeChange: { cardType: "character", subtype: "Mage" } });
    const journey = { ...entry("source"), ...journeyDeckModFields(mods) };
    const catalog = testCatalog();
    const engine = createEngine(catalog);
    const requestEntry = engineDeckEntry(journey, card, content.transfigurationData);
    expect(requestEntry).toEqual({ cardId: card.id, deckMods: mods });
    for (const side of ["player", "enemy"] as const) {
      const lab = cardLabBattle(engine, { entry: requestEntry, variant: "base", side, stage: {} }, [SYNTHETIC.vanilla2]);
      const subject = lab.slice.committed.sides[side].hand[0];
      const instance = lab.slice.committed.instances[subject];
      expect(instance).toMatchObject({ owner: side, controller: side, printing: { kind: "card", cardId: card.id }, variant: { deckMods: mods } });
      expect(instanceCard(catalog, instance)).toMatchObject({ cardType: "character", subtype: "Mage", spark: 5, speed: "fast", costs: [{ cost: "energy", amount: 1 }] });
      const other = side === "player" ? "enemy" : "player";
      expect(Object.values(lab.slice.committed.instances).filter(i => i.controller === other).every(i => i.variant.deckMods === undefined)).toBe(true);
    }
    expect(journey.entryId).toBe(parseDeckEntryId("source"));
    expect(card).toMatchObject({ energyCost: 2, spark: 2, subtype: "Warrior" });
  });

  it("passes actual producer spark and Fast rewards through the existing engine entry", () => {
    for (const fields of [{ effectKind: "increase-spark-all", sparkBonus: 3 }, { effectKind: "make-fast-all" }] as const) {
      const after = produced(fields);
      const emitted = engineDeckEntry(after.deck[0], card, content.transfigurationData);
      expect(emitted.cardId).toBe(card.id);
      expect(emitted.deckMods).toMatchObject(fields.effectKind === "increase-spark-all" ? { sparkBonus: 3 } : { fast: true });
    }
  });

  it("hands actual type, subtype and compound cost producer DTOs to the existing engine fields", () => {
    const changedSubtype = produced({ effectKind: "change-subtype-selected", subtype: parseCardSubtype("Mage") }, { entryIds: ["a"] });
    expect(engineDeckEntry(changedSubtype.deck[0], card, content.transfigurationData).deckMods?.typeChange).toEqual({ cardType: "character", subtype: "Mage" });
    const changedType = produced({ effectKind: "change-card-type-selected", deckTarget: "chosen", cardType: "Event" }, { entryIds: ["a"] });
    expect(engineDeckEntry(changedType.deck[0], card, content.transfigurationData).deckMods?.typeChange).toEqual({ cardType: "event", subtype: "" });
    const discounted = produced({ effectKind: "reduce-cost-all-and-gain-nightmares", energyCostReduction: 2, nightmareCount: 1 });
    expect(discounted.deck).toHaveLength(4);
    expect(discounted.deck[3].cardNumber).toBe(nightmare.cardNumber);
    expect(engineDeckEntry(discounted.deck[0], card, content.transfigurationData).deckMods?.costReduction).toBe(2);
    const formed = engineDeckEntry({ ...discounted.deck[0], transfiguration: "Amplified" }, card, content.transfigurationData);
    expect(formed).toMatchObject({ cardId: card.id, amplified: true, transfigurations: ["Amplified"], deckMods: { costReduction: 2 } });
  });

  it("retains compound removal and the survivor's actual setReclaim DTO through the engine", () => {
    const after = produced({ effectKind: "purge-duplicates-and-grant-reclaim" });
    expect(after.deck.map(e => e.entryId)).toEqual([parseDeckEntryId("a")]);
    expect(after.deck[0].keywordModification).toEqual({ setReclaim: 2 });
    expect(engineDeckEntry(after.deck[0], card, content.transfigurationData).deckMods?.reclaim).toBe(2);
  });

  it("preserves composition, transfiguration, Dreamsign, Avatar and explicit nonbattle handoffs", () => {
    const before = { ...testJourneyState(), deck: [entry("a")] };
    const after = applyJourneyRewardEffect({ state: before, journeyContent: content, effect: { kind: "composite", children: [
      { kind: "transfigure_deck_entry", entryId: before.deck[0].entryId, cardUuid: card.id, cardNumber: card.cardNumber, transfiguration: "Amplified" },
      { kind: "add_catalog_card", cardUuid: duplicate.id, cardNumber: duplicate.cardNumber },
      { kind: "add_dreamsign", dreamsignId: sign.id, dreamsignTemplate: sign },
      { kind: "add_essence", amount: 3 },
    ] } });
    if (after === null) throw new Error("Synthetic reward DTO refused");
    const initialized = (journey: JourneyState) => createEngineBattleInit({ seed: 1, scoreToWin: 25, startingSide: "player", journey, enemy: { deck: [], avatar: null, dreamsigns: [] }, cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] });
    expect(initialized(after)).toMatchObject({ decks: { player: [{ cardId: card.id, amplified: true, transfigurations: ["Amplified"] }, { cardId: duplicate.id }] }, dreamsigns: { player: [sign.id], enemy: [] } });
    expect(after.essence).toBe(before.essence + 3);
    const currencyOnly = produced({ effectKind: "gain-essence", essence: 3 }, {}, before.deck);
    expect(initialized(currencyOnly)).toEqual(initialized(before));
    expect(currencyOnly.essence).toBe(before.essence + 3);
    const chosen = produced({ effectKind: "choose-avatar", offerCount: 1 }, { avatarId: avatar.id });
    expect(initialized(chosen).avatars).toEqual({ player: avatar.id });
    expect(before.deck[0].transfiguration).toBeNull();
  });

  it("hands each actual next-battle modifier to the existing typed init on its owner", () => {
    for (const effectKind of ["next-battle-opening-hand", "next-battle-starting-energy", "next-battle-smaller-hand-and-cost-discount"] as const) {
      const after = produced({ effectKind, ...(effectKind === "next-battle-smaller-hand-and-cost-discount" ? {} : { count: 2 }) });
      const init = createEngineBattleInit({ seed: 1, scoreToWin: 25, startingSide: "player", journey: after, enemy: { deck: [duplicate.id], avatar: null, dreamsigns: [] }, cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] });
      expect(init.nextBattle?.enemy).toBeUndefined();
      expect(init.nextBattle?.player).toMatchObject(effectKind === "next-battle-opening-hand" ? { openingHand: [{ count: 2, filter: null }] } : effectKind === "next-battle-starting-energy" ? { startingEnergy: 2 } : { smallerHandAndCostDiscount: [{ openingHandDelta: -1, costReduction: 1 }] });
      expect(init.decks.player.map(e => e.cardId)).toEqual(after.deck.map(e => content.cardDatabase.get(e.cardNumber)?.id));
    }
  });
});
