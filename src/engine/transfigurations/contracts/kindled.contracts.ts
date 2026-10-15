import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard, type EngineCardDefinition } from "../../catalog";
import { characteristicsOf } from "../../continuous/characteristics";
import { engineCardFromContent } from "../../content-catalog";
import { energy, energyX, self, x } from "../../dsl/builders";
import { BASE_VARIANT, NO_DECK_MODS, type Variant } from "../../dsl/types";
import { triggered, onMaterialized } from "../../dsl/triggers";
import { gainPoints, gainSpark } from "../../effects/primitives";
import { createEngine } from "../../engine";
import { createFoldAdapter, type BattleSlice } from "../../fold/slice";
import { stateHash } from "../../state/hash";
import { NO_PROMPTS, ScriptedSource } from "../../steps/sources";
import { boardState } from "../../testing/board";
import { syntheticId } from "../../testing/synthetic-cards";
import { eligibleEngineTransfigurations } from "../../transfigurations";
import { formContent } from "./transfigurations-01.fixtures";
import { applyTransfigurationToCard, eligibleTransfigurations } from "../../../transfiguration/transfiguration-logic";
import { transfigurationFixture } from "../../../testing/transfiguration-fixture";
import { parseCardId, parseCardName } from "../../../types/card-identity";

const KINDLED: Variant = { amplified: false, transfigurations: ["Kindled"] };
const character = (spark: EngineCardDefinition["spark"]): EngineCardDefinition => ({
  id: syntheticId(0x2770), cardType: "character", subtype: "Warrior", spark,
  costs: [energy(1)], speed: "standard", status: "authored",
  transfiguration: { amplified: true, resonant: { base: "materialized", amplified: "materialized" } },
  abilities: variant => [triggered(onMaterialized(), gainPoints(variant.amplified ? 5 : 2))],
});

// These contracts exercise the public tuple, physical-instance and fold boundaries.
describe("Kindled printed characteristics", () => {
  it("agrees with display eligibility and numeric previews for either authored variant", () => {
    for (const spark of [0, 1, 3, null, "x"] as const) for (const cardType of ["Character", "Event"] as const) for (const amplified of [false, true]) {
      const content = formContent({ cardType, spark: cardType === "Event" || spark === "x" ? null : spark, sparkVariable: cardType === "Character" && spark === "x", renderedText: "▸Materialized: Gain 2⍟.", amplifiedText: "▸Materialized: Gain 5⍟.", abilities: character(spark).abilities });
      const definition = engineCardFromContent(content);
      const display = { ...content, id: parseCardId(content.id), name: parseCardName(content.name), roles: content.roles === undefined ? undefined : [...content.roles], energyCosts: content.energyCosts === undefined ? undefined : [...content.energyCosts] };
      const variant = { ...KINDLED, amplified }, data = transfigurationFixture();
      expect(eligibleEngineTransfigurations(definition, variant).includes("Kindled")).toBe(cardType === "Character");
      expect(eligibleTransfigurations(data, display).includes("Kindled")).toBe(cardType === "Character");
      const result = createCatalog([definition], []).variantCard(definition.id, variant);
      const preview = applyTransfigurationToCard(data, display, "Kindled");
      if (cardType === "Character") expect(result.spark).toBe(preview.spark);
      expect(result.spark).toBe(cardType === "Event" ? null : spark === 1 ? 2 : spark === 3 ? 6 : 1);
      expect(result.abilities(BASE_VARIANT)).toEqual(definition.abilities({ amplified }));
      expect(result.costs).toEqual(definition.costs);
      expect(definition.spark).toBe(cardType === "Event" ? null : spark);
    }
  });

  for (const side of ["player", "enemy"] as const) {
    it(`keeps same-UUID neighbors, authored variants and reusable source factories independent for ${side}`, () => {
      for (const spark of [0, 3]) for (const variant of [KINDLED, { ...KINDLED, amplified: true }, { ...KINDLED, transfigurations: ["Amplified", "Kindled"] as const }]) {
        const card = character(spark), original = createCatalog([card], []);
        const catalogs = [original, createCatalog(original.cardDefinitions, []), createCatalog([original.card(card.id)], [])];
        const hashes = catalogs.map(catalog => {
          const engine = createEngine(catalog);
          const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [{ cardId: card.id, ...variant }, card.id], energy: 10 } });
          const [changed, ordinary] = ids[side].hand;
          const before = stateHash(state);
          expect(characteristicsOf(state, catalog, changed).spark).toBe(spark === 0 ? 1 : 6);
          expect(characteristicsOf(state, catalog, ordinary).spark).toBe(spark);
          const first = engine.apply(state, side, { kind: "play", card: changed, from: "hand" }, NO_PROMPTS);
          const second = engine.apply(first.state, side, { kind: "play", card: ordinary, from: "hand" }, NO_PROMPTS);
          expect(stateHash(state)).toBe(before);
          expect(second.state.sides[side].score).toBe(variant.amplified || variant.transfigurations?.includes("Amplified") === true ? 7 : 4);
          expect(second.state.sides[side].currentEnergy).toBe(8);
          for (let read = 0; read < 3; read++) {
            expect(engine.view(second.state, side).instances[changed].characteristics.spark).toBe(spark === 0 ? 1 : 6);
            expect(engine.view(second.state, side).instances[ordinary].characteristics.spark).toBe(spark);
            expect(catalog.variantCard(card.id, variant).spark).toBe(spark === 0 ? 1 : 6);
          }
          expect(catalog.card(card.id).spark).toBe(spark);
          expect(catalog.card(card.id).abilities({ amplified: true })).toEqual([triggered(onMaterialized(), gainPoints(5))]);
          return stateHash(second.state);
        });
        expect(hashes[1]).toBe(hashes[0]);
        expect(hashes[2]).toBe(hashes[0]);
      }
    });

    it(`applies the form before permanent and gained spark, type changes and copy overrides for ${side}`, () => {
      const card = { ...character(2), abilities: () => [triggered(onMaterialized(), gainSpark(self(), 4))] };
      const event: EngineCardDefinition = { ...character(null), id: syntheticId(0x2771), cardType: "event", abilities: () => [] };
      const catalog = createCatalog([card, event], []), engine = createEngine(catalog);
      const variant = { ...KINDLED, deckMods: { ...NO_DECK_MODS, sparkBonus: 3 } };
      const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [{ cardId: card.id, ...variant }], energy: 10 } });
      const id = ids[side].hand[0];
      expect(characteristicsOf(state, catalog, id).spark).toBe(7);
      const result = engine.apply(state, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS);
      expect(characteristicsOf(result.state, catalog, id).spark).toBe(11);
      expect(result.events.some(event => event.kind === "sparkGained" && event.instance === id && event.amount === 4)).toBe(true);
      const printing = { kind: "card" as const, cardId: card.id };
      expect(instanceCard(catalog, { printing, variant: { ...variant, deckMods: { ...variant.deckMods, typeChange: { cardType: "event", subtype: "" } } } }).spark).toBeNull();
      expect(instanceCard(catalog, { printing: { ...printing, cardId: event.id }, variant: { ...variant, deckMods: { ...variant.deckMods, typeChange: { cardType: "character", subtype: "Warrior" } } } }).spark).toBe(0);
      for (const spark of [0, 7, null]) expect(instanceCard(catalog, { printing: { kind: "figmentCopy", cardId: card.id, spark }, variant }).spark).toBe(spark ?? 7);
    });

    it(`retains a paid X above one while fixing Kindled base spark for ${side}`, () => {
      const card = { ...character("x"), costs: [energyX()], abilities: () => [triggered(onMaterialized(), gainPoints(x()))] };
      const catalog = createCatalog([card], []), engine = createEngine(catalog);
      for (const kindled of [false, true]) {
        const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [{ cardId: card.id, ...KINDLED, transfigurations: kindled ? ["Kindled"] : [], deckMods: { ...NO_DECK_MODS, sparkBonus: kindled ? 2 : 0 } }], energy: 10 } });
        const id = ids[side].hand[0];
        expect(instanceCard(catalog, state.instances[id]).spark).toBe(kindled ? 3 : "x");
        const result = engine.apply(state, side, { kind: "play", card: id, from: "hand" }, new ScriptedSource([4]));
        expect(result.state.sides[side].currentEnergy).toBe(6);
        expect(result.state.instances[id].status.x).toBe(4);
        expect(result.state.sides[side].score).toBe(4);
        expect(characteristicsOf(result.state, catalog, id).spark).toBe(kindled ? 3 : 4);
        expect(instanceCard(catalog, result.state.instances[id]).costs).toEqual([energyX()]);
      }
    });

    it(`replays an actual fold action and reloads the same physical tuple for ${side}`, () => {
      const card = character(3), catalog = createCatalog([card], []), engine = createEngine(catalog), adapter = createFoldAdapter(engine);
      const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [{ cardId: card.id, ...KINDLED }], energy: 10 } });
      const slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const intent = { kind: "battleAction" as const, side, action: { kind: "play" as const, card: ids[side].hand[0], from: "hand" as const } };
      const first = adapter.reduce(slice, intent), replay = adapter.reduce(JSON.parse(JSON.stringify(slice)) as BattleSlice, intent);
      expect(first.kind).toBe("applied"); expect(replay.kind).toBe("applied");
      if (first.kind !== "applied" || replay.kind !== "applied") throw new Error("Synthetic Kindled play bounced");
      expect(first.error).toBeNull(); expect(first.slice.inFlight).toBeNull();
      expect(stateHash(replay.slice.committed)).toBe(stateHash(first.slice.committed));
      const loaded = JSON.parse(JSON.stringify(first.slice)) as BattleSlice;
      expect(loaded.committed.instances[ids[side].hand[0]].variant).toEqual(state.instances[ids[side].hand[0]].variant);
      expect(loaded.committed.instances[ids[side].hand[0]].zone).toBe("play");
      expect(engine.view(loaded.committed, side).instances[ids[side].hand[0]].characteristics.spark).toBe(6);
      expect(loaded.committed.sides[side].score).toBe(2);
    });
  }
});
