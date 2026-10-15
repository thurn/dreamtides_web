import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard, printedCardId, type EngineCardDefinition } from "../../catalog";
import { createEngine } from "../../engine";
import { NO_PROMPTS } from "../../steps/sources";
import { boardState } from "../../testing/board";
import { stateHash } from "../../state/hash";
import { FORM_EVENT, FORM_FILLER, formContent, metadata } from "./transfigurations-01.fixtures";
import * as b from "../../dsl/builders";
import * as p from "../../effects/primitives";
import { triggered, onDawn, onMaterialized, onDissolved, whenYouPlay, whenScoreGroup, either } from "../../dsl/triggers";
import { BASE_VARIANT, NO_DECK_MODS, type Variant } from "../../dsl/types";
import { createFoldAdapter, type BattleSlice } from "../../fold/slice";
import { ScriptedSource } from "../../steps/sources";
import { labBoard } from "../../testing/lab-solver";
import { firstLegalAnswer } from "../../prompts/answers";
import { testCatalog, syntheticId } from "../../testing/synthetic-cards";
import { ENGINE_TRANSFIGURATIONS, eligibleEngineTransfigurations } from "../../transfigurations";
import { engineCardFromContent } from "../../content-catalog";
import { eligibleTransfigurations, applyTransfigurationToCard, buildTransfigurationDisplay, TRANSFIGURE_MARK_START, TRANSFIGURE_MARK_END } from "../../../transfiguration/transfiguration-logic";
import { transfigurationFixture } from "../../../testing/transfiguration-fixture";
import { parseCardId, parseCardName } from "../../../types/card-identity";
import { TRANSFIGURATION } from "../../../content/transfiguration";
import { expectedVerifiedText } from "../../dsl/verified-text";
import { catalogManifest, manifestCatalog, type CatalogManifest } from "../../policy/catalog-manifest";
import { battleSeed } from "../../state/ids";
import { PolicyRandom } from "../../policy/random";
import type { Ability } from "../../dsl/types";
import { hasUnknownFirstEventHistory } from "../../../rules/battle/first-event-last-turn-state";
import { hasUnknownLastTurnScoring } from "../../../rules/battle/last-turn-scoring-state";
import { hasUnknownScoreGroup } from "../../../rules/battle/score-group-state";
import { hasInvalidJourneyDeckSparkOrigins } from "../../../rules/battle/journey-deck-spark-state";
import { fuzzInit, randomDeck, withFuzzCardWeights, DECK_SIZE, type FuzzPool } from "../../testing/fuzz";
describe("transfiguration public battle contracts", () => {
  for (const side of ["player", "enemy"] as const) it(`Inspired adds one draw through original and rebuilt catalogs for ${side}`, () => {
    const original = createCatalog([FORM_EVENT, FORM_FILLER], []);
    const catalogs = [original, createCatalog(original.cardDefinitions, []), createCatalog([original.card(FORM_EVENT.id), original.card(FORM_FILLER.id)], [])];
    const hashes = catalogs.map(catalog => {
      const engine = createEngine(catalog);
      const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [{ cardId: FORM_EVENT.id, transfigurations: ["Inspired"] }], deck: [FORM_FILLER.id, FORM_FILLER.id], energy: 3 } });
      const applied = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
      expect(applied.state.sides[side].score).toBe(1);
      expect(applied.state.sides[side].hand).toHaveLength(1);
      expect(applied.events.filter(event => event.kind === "cardDrawn" && event.side === side)).toHaveLength(1);
      return stateHash(applied.state);
    });
    expect(hashes[1]).toBe(hashes[0]);
    expect(hashes[2]).toBe(hashes[0]);
  });
});



const formVariant = (form: Variant["transfigurations"], amplified = false): Variant => ({ amplified, transfigurations: form });
const formEntry = (card: EngineCardDefinition, transfigurations: NonNullable<Variant["transfigurations"]>) => ({ cardId: card.id, transfigurations });
const donor: EngineCardDefinition = { ...FORM_FILLER, id: syntheticId(0x2763), status: "authored", transfiguration: metadata("materialized"), abilities: variant => [triggered(onMaterialized(), p.gainPoints(variant.amplified ? 5 : 2))] };
const learner: EngineCardDefinition = { ...FORM_FILLER, id: syntheticId(0x2764), status: "authored", abilities: () => [b.activated([b.discardCost(1)], p.gainAbilities(p.banishCards([b.everyIn("void")]))) ] };
const dissolver: EngineCardDefinition = { ...FORM_EVENT, id: syntheticId(0x2765), abilities: () => [b.event(p.dissolve(b.target(b.characterYouControl())))] };

function played(card: EngineCardDefinition, forms: NonNullable<Variant["transfigurations"]>, mods = NO_DECK_MODS) {
  const catalog = createCatalog([card, ...card.id === FORM_FILLER.id ? [] : [FORM_FILLER]], []), engine = createEngine(catalog);
  const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [{ ...formEntry(card, forms), deckMods: mods }], energy: 10, deck: [FORM_FILLER.id, FORM_FILLER.id] } });
  return engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
}

describe("public catalog substitution and ordinary printing", () => {
  it("resolves variants through the public catalog card substitution", () => {
    const source = createCatalog([FORM_EVENT, FORM_FILLER], []);
    const subset = createCatalog([FORM_FILLER], []);
    const substituted = { ...subset, card: (id: typeof FORM_EVENT.id) => source.card(id) };
    const engine = createEngine(substituted);
    const { state, ids } = boardState(substituted, { active: "player", phase: "day", player: { hand: [formEntry(FORM_EVENT, ["Inspired"])], deck: [FORM_FILLER.id], energy: 3 } });
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.state.sides.player.score).toBe(1);
    expect(result.state.sides.player.hand).toHaveLength(1);
  });
  it("preserves ordinary printed values across state changes with entry modifications", () => {
    const catalog = createCatalog([FORM_EVENT, FORM_FILLER], []);
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [{ cardId: FORM_FILLER.id, amplified: true, deckMods: { ...NO_DECK_MODS, sparkBonus: 5 } }] } });
    const instance = state.instances[ids.player.hand[0]];
    const before = instanceCard(catalog, instance);
    instance.status.gainedSpark = 3;
    expect(instanceCard(catalog, instance)).toEqual(before);
  });
});

describe("owned form eligibility and ordering", () => {
  it("pins each registered form UUID and verified text against its canonical record", () => {
    for (const form of ENGINE_TRANSFIGURATIONS) {
      const record = TRANSFIGURATION.forms.find(record => record.glossaryUuid === form.uuid);
      expect(record).toBeDefined();
      expect(form.id).toBe(record!.id);
      expect(form.verifiedText).toBe(expectedVerifiedText(record!.description));
    }
  });
  it("agrees with text eligibility on synthetic positive and counterexample definitions", () => {
    const rows = [
      {}, { energyCost: 0 }, { energyCost: null }, { energyCost: 1, energyCosts: ["1", "X"] },
      { amplifiedText: "Gain 2⍟." }, { amplifiedText: "" }, { amplifiedText: "Gain 1⍟." },
      { cardType: "Character" as const, spark: 2, subtype: "Warrior" as const, renderedText: "▸Dawn: Gain 1⍟.", abilities: () => [triggered(onDawn(), p.gainPoints(1))] },
      { cardType: "Character" as const, spark: 2, renderedText: "▸Materialized: Gain 1⍟.", abilities: () => [triggered(onMaterialized(), p.gainPoints(1))] },
      { cardType: "Character" as const, spark: 2, renderedText: "▸Materialized, Dawn: Gain 1⍟.", abilities: () => [triggered(either(onMaterialized(), onDawn()), p.gainPoints(1))] },
      { cardType: "Character" as const, spark: 2, renderedText: "▸Materialized, ▸Dawn: Gain 1⍟.", abilities: () => [triggered(either(onMaterialized(), onDawn()), p.gainPoints(1))] },
      { renderedText: "Once per turn, when you play an event, gain 1⍟.", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.gainPoints(1), { oncePerTurn: true })] },
      { isFast: true }, { isFast: true, isInterrupt: true },
    ];
    for (const row of rows) {
      const content = formContent(row), card = engineCardFromContent(content);
      const display = { ...content, id: parseCardId(content.id), name: parseCardName(content.name), roles: content.roles === undefined ? undefined : [...content.roles], energyCosts: content.energyCosts === undefined ? undefined : [...content.energyCosts] };
      const owned = new Set(ENGINE_TRANSFIGURATIONS.map(form => form.id));
      expect(eligibleEngineTransfigurations(card)).toEqual(eligibleTransfigurations(transfigurationFixture(), display).filter(form => owned.has(form)));
    }
  });
  it("halves before deck reduction and collapses a positive fixed-plus-X base", () => {
    const card = { ...FORM_EVENT, costs: [b.energy(5)] };
    expect(played(card, ["Empowered"], { ...NO_DECK_MODS, costReduction: 1 }).state.sides.player.currentEnergy).toBe(9);
    expect(played({ ...FORM_EVENT, costs: [b.energy(1), b.energyX()] }, ["Empowered"]).state.sides.player.currentEnergy).toBe(10);
    expect(eligibleEngineTransfigurations({ ...FORM_EVENT, costs: [b.energyX()] })).not.toContain("Empowered");
  });
  it("uses authored Amplified once for explicit and boolean variants", () => {
    const card = { ...FORM_EVENT, transfiguration: metadata(), abilities: (variant: Variant) => [b.event(p.gainPoints(variant.amplified ? 3 : 1))] };
    const catalog = createCatalog([card], []), engine = createEngine(catalog);
    const outcomes = [formVariant(["Amplified"]), { amplified: true }, formVariant(["Amplified"], true)].map(variant => {
      const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [{ cardId: card.id, ...variant }], energy: 10 } });
      const applied = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
      expect(applied.state.sides.player.score).toBe(3);
      return applied.state.sides.player.score;
    });
    expect(new Set(outcomes).size).toBe(1);
  });
  it("keeps transformed event instructions through type changes and final copy spark overrides", () => {
    const catalog = createCatalog([FORM_EVENT, FORM_FILLER], []);
    const event = instanceCard(catalog, { printing: { kind: "card", cardId: FORM_EVENT.id }, variant: { ...formVariant(["Inspired"]), deckMods: { ...NO_DECK_MODS, sparkBonus: 9, typeChange: { cardType: "character", subtype: "Warrior" } } } });
    expect(event.cardType).toBe("character"); expect(event.spark).toBe(0);
    const source = { printing: { kind: "figmentCopy" as const, cardId: FORM_FILLER.id, spark: 0 }, variant: { amplified: false, deckMods: { ...NO_DECK_MODS, sparkBonus: 4 } } };
    expect(instanceCard(catalog, source).spark).toBe(0);
    expect(instanceCard(catalog, { ...source, printing: { ...source.printing, spark: 7 } }).spark).toBe(7);
    expect(event.abilities(BASE_VARIANT)).toHaveLength(2);
  });
  it("adds ordinary-cost Reclaim while retaining explicit cost priority and banishment", () => {
    for (const explicit of [false, true]) {
      const card = { ...FORM_EVENT, abilities: () => [...FORM_EVENT.abilities(BASE_VARIANT), ...(explicit ? [b.reclaim(b.energy(4))] : [])] };
      const catalog = createCatalog([card, ...card.id === FORM_FILLER.id ? [] : [FORM_FILLER]], []), engine = createEngine(catalog);
      const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [formEntry(card, ["Enduring"])], energy: 10 } });
      const first = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
      const second = engine.apply(first.state, "player", { kind: "play", card: ids.player.hand[0], from: "void" }, NO_PROMPTS);
      expect(second.state.sides.player.currentEnergy).toBe(explicit ? 5 : 8);
      expect(second.state.instances[ids.player.hand[0]].zone).toBe("banished");
      expect(second.state.sides.player.score).toBe(2);
    }
  });
  it("opens only the ordinary event's Fast window", () => {
    const catalog = createCatalog([FORM_EVENT], []), engine = createEngine(catalog);
    for (const transfigurations of [[], ["Hastened"]] as const) {
      const { state, ids } = boardState(catalog, { active: "enemy", phase: "dusk", player: { hand: [formEntry(FORM_EVENT, transfigurations)], energy: 3 } });
      expect(engine.legalActions(state, "player").some(action => action.kind === "play" && action.card === ids.player.hand[0])).toBe(transfigurations.length > 0);
    }
  });
});

describe("Resonant actual occurrences and captured ability groups", () => {
  it("widens just the first selected Dawn and retains the other Materialized instruction", () => {
    const card: EngineCardDefinition = { ...FORM_FILLER, transfiguration: metadata("dawn"), status: "authored", abilities: () => [triggered(onMaterialized(), p.gainPoints(2)), triggered(onDawn(), p.gainPoints(3)), triggered(onDawn(), p.gainPoints(5))] };
    expect(played(card, ["Resonant"]).state.sides.player.score).toBe(5);
    expect(played(card, []).state.sides.player.score).toBe(2);
    const combined = { ...card, abilities: () => [triggered(either(onMaterialized(), onDawn()), p.gainPoints(3))] };
    expect(played(combined, ["Resonant"]).state.sides.player.score).toBe(3);
  });
  it("removes the selected once-per-turn trigger restriction for two actual plays", () => {
    const card: EngineCardDefinition = { ...FORM_FILLER, transfiguration: metadata("oncePerTurn"), status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.gainPoints(2), { oncePerTurn: true })] };
    for (const form of [false, true]) {
      const catalog = createCatalog([card, FORM_EVENT], []), engine = createEngine(catalog);
      const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [formEntry(card, form ? ["Resonant"] : []), FORM_EVENT.id, FORM_EVENT.id], energy: 10 } });
      let current = state;
      for (const id of ids.player.hand) current = engine.apply(current, "player", { kind: "play", card: id, from: "hand" }, NO_PROMPTS).state;
      expect(current.sides.player.score).toBe(form ? 6 : 4);
    }
  });
  it("removes a static permission limit while preserving its condition and real payments", () => {
    const card: EngineCardDefinition = { ...FORM_FILLER, transfiguration: metadata("oncePerTurn"), status: "authored", abilities: () => [b.staticAbility(p.playFromZone("void", { cardType: "event" }, { oncePerTurn: true }), { while: b.conditionCardCounts("hand", 0, { atMost: 0 }) })] };
    const catalog = createCatalog([card, FORM_EVENT], []), engine = createEngine(catalog);
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [formEntry(card, ["Resonant"])], void: [FORM_EVENT.id, FORM_EVENT.id], energy: 10 } });
    let current = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    for (const id of ids.player.void) current = engine.apply(current, "player", { kind: "play", card: id, from: "void" }, NO_PROMPTS).state;
    expect(current.sides.player.score).toBe(2); expect(current.sides.player.currentEnergy).toBe(7);
  });
  it("resolves gained base and Amplified Resonant Dissolved occurrences after source and gain leave play", () => {
    for (const forms of [[], ["Resonant"], ["Resonant", "Amplified"]] as const) {
      const catalog = createCatalog([donor, learner, dissolver, FORM_FILLER], []), engine = createEngine(catalog);
      const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { back: [learner.id], hand: [formEntry(donor, forms), dissolver.id], energy: 10 } });
      const learned = engine.apply(state, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, new ScriptedSource([[ids.player.hand[0]]]));
      const ended = engine.apply(learned.state, "player", { kind: "play", card: ids.player.hand[1], from: "hand" }, new ScriptedSource([[ids.player.back[0]!]]));
      expect(ended.state.sides.player.score).toBe(forms.length === 0 ? 0 : forms.length === 1 ? 2 : 5);
      expect(ended.state.instances[ids.player.back[0]!].zone).toBe("void");
      expect(ended.events.some(event => event.kind === "triggerResolved" && event.applied)).toBe(forms.length > 0);
    }
  });
});

describe("declared Amplified provenance requirements", () => {
  it("requires each legacy history only when the declared authored variant reads it", () => {
    const rows: readonly { abilities: readonly Ability[]; check: typeof hasUnknownFirstEventHistory }[] = [
      { abilities: [b.event(p.copyFirstEventLastTurnToHand({ ephemeral: true }))], check: hasUnknownFirstEventHistory },
      { abilities: [b.event(p.ifThen(b.scoredWithCharacterLastTurn(), p.gainPoints(1)))], check: hasUnknownLastTurnScoring },
      { abilities: [triggered(whenScoreGroup(2), p.gainPoints(1))], check: hasUnknownScoreGroup },
      { abilities: [b.staticAbility(p.journeyDeckSparkModifier(2, 1))], check: hasInvalidJourneyDeckSparkOrigins },
    ];
    for (const row of rows) {
      const card: EngineCardDefinition = { ...FORM_FILLER, transfiguration: metadata(), abilities: variant => variant.amplified ? row.abilities : [] };
      const catalog = createCatalog([card], []);
      const { state } = boardState(catalog, { active: "player", phase: "day" });
      const { firstEventHistory: _first, characterScoring: _scoring, ...legacy } = state;
      const committed = { ...legacy, turn: { ...state.turn, phase: "challenge" as const, challengeLane: 1 } };
      for (const forms of [[], ["Amplified"]] as const) {
        const fold = { init: { seed: battleSeed("form-guard"), scoreToWin: 25, dreamwell: [], decks: { player: [formEntry(card, forms)], enemy: [] } }, slice: { committed, inFlight: null, publishedEvents: 0, attempt: 0 } };
        expect(row.check(fold, catalog)).toBe(forms.length > 0);
      }
    }
  });
});

describe("replay and public catalog transport", () => {
  it("preserves one Inspired append and C12 paired references through public catalog rebuilds", () => {
    const moved = p.banishCards([b.fromVoid({ subtype: "Warrior" })]);
    const card = { ...FORM_EVENT, abilities: () => [b.event(p.sequence(moved, p.gainPoints(b.costOf(b.cardsMovedBy(moved)))))] };
    const mage = { ...FORM_FILLER, id: syntheticId(0x2766), subtype: "Mage" as const, costs: [b.energy(2)] };
    const original = createCatalog([card, mage, FORM_FILLER], []);
    const catalogs = [original, createCatalog(original.cardDefinitions, []), createCatalog([original.card(card.id), mage, FORM_FILLER], [])];
    const hashes = catalogs.map(catalog => {
      const engine = createEngine(catalog), { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [{ cardId: card.id, transfigurations: ["Inspired"], typeRemap: "Mage" }], void: [mage.id, FORM_FILLER.id], deck: [FORM_FILLER.id], energy: 10 } });
      const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[ids.player.void[0]]]));
      expect(result.state.sides.player.score).toBe(2); expect(result.state.sides.player.hand).toHaveLength(1);
      expect(result.state.instances[ids.player.void[1]].zone).toBe("void");
      return stateHash(result.state);
    });
    expect(new Set(hashes).size).toBe(1);
  });
  it("keeps plain manifest metadata cloneable and unknown original content text-less", () => {
    const card = { ...FORM_EVENT, transfiguration: metadata("dawn") }, original = createCatalog([card, FORM_FILLER], []);
    const init = { seed: battleSeed("form-manifest"), scoreToWin: 25, decks: { player: [{ cardId: card.id }], enemy: [{ cardId: FORM_FILLER.id }] }, dreamwell: [] };
    const manifest = JSON.parse(JSON.stringify(structuredClone(catalogManifest(original, init)))) as CatalogManifest;
    const rebuilt = manifestCatalog(manifest);
    expect(rebuilt.card(card.id).abilities(BASE_VARIANT)).toHaveLength(0);
    expect(rebuilt.card(card.id).transfiguration).toEqual(card.transfiguration);
    const engine = createEngine(rebuilt), { state, ids } = boardState(rebuilt, { active: "player", phase: "day", player: { hand: [formEntry(card, ["Inspired"])], deck: [FORM_FILLER.id], energy: 3 } });
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.state.sides.player.score).toBe(0); expect(result.state.sides.player.hand).toHaveLength(1);
  });
  it("reconstructs the same pending prompt after reload and rejects stale answers", () => {
    const card = { ...FORM_EVENT, abilities: () => [b.event(p.optional(p.gainPoints(1)))] };
    const catalog = createCatalog([card, FORM_FILLER], []), adapter = createFoldAdapter(createEngine(catalog));
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [formEntry(card, ["Inspired"])], deck: [FORM_FILLER.id], energy: 3 } });
    const opened = adapter.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    expect(opened.kind).toBe("applied"); if (opened.kind !== "applied") throw new Error("Synthetic play bounced");
    const loaded = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    expect(adapter.pending(loaded)?.prompt).toEqual(adapter.pending(opened.slice)?.prompt);
    const prompt = adapter.pending(loaded)!.prompt;
    const answer = { kind: "answer" as const, side: "player" as const, promptId: prompt.id, value: false };
    const resolved = adapter.reduce(loaded, answer);
    expect(resolved.kind).toBe("applied"); if (resolved.kind !== "applied") throw new Error("Synthetic answer bounced");
    expect(resolved.slice.committed.sides.player.hand).toHaveLength(1);
    expect(adapter.reduce(resolved.slice, answer).kind).toBe("bounced");
  });
});

describe("form resolution failure and variant isolation", () => {
  it("keeps a failing source resolution transactional before the appended instruction", () => {
    const card: EngineCardDefinition = { ...FORM_EVENT, synthetic: { resolve(ctx) { ctx.state.sides.player.score += 4; throw new Error("synthetic form resolution failure"); } } };
    const catalog = createCatalog([card, FORM_FILLER], []), adapter = createFoldAdapter(createEngine(catalog));
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [formEntry(card, ["Inspired"])], deck: [FORM_FILLER.id, FORM_FILLER.id], energy: 3 } });
    const result = adapter.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    expect(result.kind).toBe("applied"); if (result.kind !== "applied") throw new Error("Synthetic play bounced");
    expect(result.error).not.toBeNull();
    expect(result.slice.committed.sides.player.score).toBe(0);
    expect(result.slice.committed.sides.player.deck).toHaveLength(2);
    expect(result.published.some(event => event.kind === "cardDrawn")).toBe(false);
  });
  it("keeps stronger Resonant category and ordinary physical copies independent", () => {
    const card = { ...FORM_FILLER, id: syntheticId(0x2767), status: "authored" as const,
      transfiguration: { amplified: true, resonant: { base: "dawn" as const, amplified: "materialized" as const } },
      abilities: (variant: Variant) => [triggered(variant.amplified ? onMaterialized() : onDawn(), p.gainPoints(variant.amplified ? 3 : 1))] };
    const catalog = createCatalog([card, dissolver], []), engine = createEngine(catalog);
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [{ cardId: card.id, amplified: true, transfigurations: ["Resonant"] }, card.id, dissolver.id], energy: 10 } });
    let current = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    current = engine.apply(current, "player", { kind: "play", card: ids.player.hand[1], from: "hand" }, NO_PROMPTS).state;
    const result = engine.apply(current, "player", { kind: "play", card: ids.player.hand[2], from: "hand" }, new ScriptedSource([[ids.player.hand[0]]]));
    expect(result.state.sides.player.score).toBe(6);
    expect(result.state.instances[ids.player.hand[1]].zone).toBe("play");
    expect(card.abilities(BASE_VARIANT)[0]).toEqual(triggered(onDawn(), p.gainPoints(1)));
  });
});

describe("public weighted form fuzz recipes", () => {
  const pool: FuzzPool = { cards: [{ ...FORM_EVENT, transfiguration: metadata() }, donor], dreamwell: [], emblems: {}, figments: [] };
  it("reserves each exact owned form on each side, retains mods and reproduces the recipe", () => {
    const weighted = withFuzzCardWeights(pool, ENGINE_TRANSFIGURATIONS.map(form => form.uuid).join(","));
    const first = fuzzInit(battleSeed("form-targets"), weighted);
    expect(fuzzInit(battleSeed("form-targets"), weighted)).toEqual(first);
    for (const side of ["player", "enemy"] as const) {
      expect(first.decks[side]).toHaveLength(DECK_SIZE);
      for (const form of ENGINE_TRANSFIGURATIONS) expect(first.decks[side].some(entry => entry.transfigurations?.includes(form.id))).toBe(true);
      expect(first.decks[side].every(entry => entry.deckMods !== undefined)).toBe(true);
    }
  });
  it("targets an eligible authored tuple while preserving unrelated random fields", () => {
    class Controlled extends PolicyRandom {
      constructor(private readonly value: number) { super(battleSeed("form-eligibility-recipe")); }
      override next(): number { return this.value; }
      override pick<T>(items: readonly T[]): T { const first = items[0]; if (first === undefined) throw new Error("Empty synthetic recipe choice"); return first; }
    }
    for (const row of [
      { base: "dawn", amplified: null, randomValue: 0.05, expectedAmplified: false },
      { base: null, amplified: "dawn", randomValue: 0.75, expectedAmplified: true },
      { base: "dawn", amplified: "dawn", randomValue: 0.05, expectedAmplified: true },
    ] as const) {
      const card: EngineCardDefinition = { ...FORM_FILLER, id: syntheticId(0x2768), status: "authored",
        transfiguration: { amplified: true, resonant: { base: row.base, amplified: row.amplified } },
        abilities: variant => (variant.amplified ? row.amplified : row.base) === null ? [] : [triggered(onDawn(), p.gainPoints(1))] };
      const plain: FuzzPool = { ...pool, cards: [card] };
      const weighted = withFuzzCardWeights(plain, "c3fa83af-ee3b-47cd-8112-5e5cc38821de");
      const before = randomDeck(new Controlled(row.randomValue), plain), generated = randomDeck(new Controlled(row.randomValue), weighted);
      expect(generated.map(entry => entry.deckMods)).toEqual(before.map(entry => entry.deckMods));
      const entry = generated.find(entry => entry.cardId === card.id && entry.transfigurations?.includes("Resonant"));
      expect(entry).toBeDefined(); if (entry === undefined) throw new Error("Targeted synthetic form absent");
      expect(entry.amplified).toBe(row.expectedAmplified);
      const catalog = createCatalog([card], []), engine = createEngine(catalog);
      const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [entry], energy: 10 } });
      expect(engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state.sides.player.score).toBe(1);
    }
  });
  it("rejects unavailable form subjects and combined physical target overflow", () => {
    expect(() => withFuzzCardWeights(pool, "5e5e5e5e-0000-4000-8000-0000000027ff")).toThrow();
    expect(() => withFuzzCardWeights({ ...pool, cards: [FORM_EVENT, FORM_FILLER] }, "c3fa83af-ee3b-47cd-8112-5e5cc38821de")).toThrow();
    const cards = Array.from({ length: DECK_SIZE }, (_, index) => ({ ...FORM_EVENT, id: syntheticId(0x2800 + index) }));
    expect(() => withFuzzCardWeights({ ...pool, cards }, [...cards.map(card => card.id), ENGINE_TRANSFIGURATIONS[0].uuid].join(","))).toThrow();
  });
});


// Regression contracts for the shared own-header and materialized-fixture boundaries.
const formDisplay = (content: ReturnType<typeof formContent>) => ({ ...content, id: parseCardId(content.id), name: parseCardName(content.name), roles: content.roles === undefined ? undefined : [...content.roles], energyCosts: content.energyCosts === undefined ? undefined : [...content.energyCosts] });
describe("Resonant own headers and composite lab resources", () => {
  it("rejects quoted external names and headers without changing an ineligible card", () => {
    for (const reference of ["'▸Dawn'", "'▸Dawn:'", "'▸Materialized:'"]) {
      const content = formContent({ renderedText: `Trigger the ${reference} ability of another character.` });
      const display = formDisplay(content), definition = engineCardFromContent(content);
      expect(eligibleTransfigurations(transfigurationFixture(), display)).not.toContain("Resonant");
      expect(eligibleEngineTransfigurations(definition)).not.toContain("Resonant");
      expect(applyTransfigurationToCard(transfigurationFixture(), display, "Resonant")).toBe(display);
      const catalog = createCatalog([definition], []);
      expect(catalog.variantCard(definition.id, formVariant(["Resonant"])).abilities(BASE_VARIANT)).toEqual(definition.abilities(BASE_VARIANT));
    }
  });
  it("selects a real header after an earlier quoted reference in both display paths", () => {
    for (const heading of ["▸Dawn:", "▸Materialized:"]) {
      const content = formContent({ renderedText: `Trigger the '▸Dawn:' ability of another character.\n\n${heading} Gain 1⍟.` });
      const display = formDisplay(content), data = transfigurationFixture();
      const built = buildTransfigurationDisplay(data, display, "Resonant");
      expect(eligibleTransfigurations(data, display)).toContain("Resonant");
      expect(eligibleTransfigurations(data, built.card)).not.toContain("Resonant");
      expect(built.display.markedText.split(TRANSFIGURE_MARK_START).join("").split(TRANSFIGURE_MARK_END).join("")).toBe(built.card.renderedText);
    }
  });
  it("retains the unsupported single-marker combined spelling", () => {
    const content = formContent({ renderedText: "▸Materialized, Dawn: Gain 1⍟." });
    expect(eligibleEngineTransfigurations(engineCardFromContent(content))).not.toContain("Resonant");
    expect(eligibleTransfigurations(transfigurationFixture(), formDisplay(content))).not.toContain("Resonant");
  });
  it("preserves public marked/plain equivalence after authored Amplified text", () => {
    const data = transfigurationFixture();
    for (const [renderedText, amplifiedText] of [["Gain 1⍟.", "▸Dawn: Gain 2⍟."], ["▸Dawn: Gain 1⍟.", "Veil\n\n▸Dawn: Gain 2⍟."]]) {
      const display = formDisplay(formContent({ renderedText, amplifiedText }));
      const built = buildTransfigurationDisplay(data, display, "Perfected");
      expect(built.display.markedText.split(TRANSFIGURE_MARK_START).join("").split(TRANSFIGURE_MARK_END).join("")).toBe(built.card.renderedText);
    }
  });
  for (const side of ["player", "enemy"] as const) {
    it(`keeps actual base/amplified eligibility and physical plays aligned for ${side}`, () => {
      for (const baseDawn of [false, true]) for (const amplified of [false, true]) {
        const content = formContent({ cardType: "Character", spark: 1, renderedText: baseDawn ? "▸Dawn: Gain 2⍟." : "Trigger the '▸Dawn' ability of another character.",
          amplifiedText: baseDawn ? "Trigger the '▸Dawn' ability of another character." : "▸Dawn: Gain 2⍟.",
          abilities: variant => variant.amplified !== baseDawn ? [triggered(onDawn(), p.gainPoints(2))] : [],
        });
        const definition = engineCardFromContent(content);
        const variant = formVariant(["Resonant"], amplified), eligible = amplified !== baseDawn;
        expect(eligibleEngineTransfigurations(definition, variant).includes("Resonant")).toBe(eligible);
        const display = formDisplay({ ...content, renderedText: amplified ? content.amplifiedText! : content.renderedText });
        expect(eligibleTransfigurations(transfigurationFixture(), display).includes("Resonant")).toBe(eligible);
        const catalog = createCatalog([definition], []), engine = createEngine(catalog);
        const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [{ cardId: definition.id, ...variant }], energy: 10 } });
        const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
        expect(result.state.sides[side].score).toBe(eligible ? 2 : 0);
        expect(definition.transfiguration).toEqual(engineCardFromContent(content).transfiguration);
      }
    });
    it(`preserves first category, first occurrence and combined admission for ${side}`, () => {
      const mat = triggered(onMaterialized(), p.gainPoints(2)), dawn = triggered(onDawn(), p.gainPoints(3));
      const rows = [
        { text: "▸Materialized: Gain 2⍟.\n\nTrigger '▸Dawn'.\n\n▸Dawn: Gain 3⍟.\n\n▸Dawn: Gain 5⍟.", abilities: [mat, dawn, triggered(onDawn(), p.gainPoints(5))], score: 5 },
        { text: "Trigger '▸Dawn'.\n\n▸Materialized: Gain 2⍟.", abilities: [mat], score: 2 },
        { text: "▸Materialized, ▸Dawn: Gain 3⍟.", abilities: [triggered(either(onMaterialized(), onDawn()), p.gainPoints(3))], score: 3 },
        { text: "▸Dawn: Gain 3⍟.\n\n▸Materialized: Gain 2⍟.\n\n▸Dawn: Gain 5⍟.", abilities: [dawn, mat, triggered(onDawn(), p.gainPoints(5))], score: 5 },
      ];
      for (const row of rows) {
        const definition = engineCardFromContent(formContent({ cardType: "Character", spark: 1, renderedText: row.text, abilities: () => row.abilities }));
        const catalog = createCatalog([definition, dissolver], []), engine = createEngine(catalog);
        const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [formEntry(definition, ["Resonant"]), dissolver.id], energy: 10 } });
        const first = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
        expect(first.state.sides[side].score).toBe(row.score);
        if (row.abilities.length === 1 && row.abilities[0] === mat) {
          const second = engine.apply(first.state, side, { kind: "play", card: ids[side].hand[1], from: "hand" }, new ScriptedSource([[ids[side].hand[0]]]));
          expect(second.state.sides[side].score).toBe(4);
        }
      }
    });
    it(`stages and resolves direct, composite and transformed entry resources for ${side}`, () => {
      const mage = { ...FORM_FILLER, id: syntheticId(0x7431), subtype: "Mage" as const };
      const effects = p.sequence(p.returnFromVoid(b.fromVoid({ cardType: "event" })), p.banishChosen(), p.discover({ cardType: "character", subtype: "Mage" }), p.dissolve(b.target(b.characterYouControl({ subtype: "Mage" }))));
      const triggers = [onMaterialized(), either(onMaterialized(), onDissolved()), either(onDawn(), either(onDissolved(), onMaterialized())), onMaterialized(), onDawn()];
      for (const [index, trigger] of triggers.entries()) {
        const card: EngineCardDefinition = { ...FORM_FILLER, id: syntheticId(0x7432), costs: [b.energy(3)], status: "authored", transfiguration: metadata(index === 4 ? "dawn" : "materialized"), abilities: () => [triggered(trigger, effects)] };
        const variant = { ...formVariant(index >= 3 ? ["Resonant"] : []), deckMods: { ...NO_DECK_MODS, costReduction: 1, sparkBonus: 2 } };
        const catalog = testCatalog([card, mage]), engine = createEngine(catalog), other = side === "player" ? "enemy" : "player";
        const solved = labBoard(engine, { cardId: card.id, ...variant }, [mage, FORM_EVENT], side);
        expect(boardState(catalog, solved.setup).state).toEqual(solved.state);
        expect(solved.state.sides[side].void).toHaveLength(1);
        expect(solved.state.sides[other].hand).toHaveLength(1);
        expect(solved.state.sides[side].backRank.filter(id => id !== null)).toHaveLength(1);
        expect(solved.state.sides[side].deck.filter(id => printedCardId(solved.state.instances[id].printing) === mage.id)).toHaveLength(1);
        const source = solved.state.sides[side].hand[0], target = solved.state.sides[side].backRank[0]!;
        const result = engine.apply(solved.state, side, { kind: "play", card: source, from: "hand" }, { answer: firstLegalAnswer });
        expect(result.state.sides[side].hand).toHaveLength(2);
        expect(result.state.instances[target].zone).toBe("void");
        expect(result.state.sides[other].banished).toHaveLength(1);
        expect(result.state.sides[side].currentEnergy).toBe(8);
        expect(instanceCard(catalog, result.state.instances[source]).spark).toBe(3);
        expect(result.events.some(event => event.kind === "triggerResolved" && event.source === source && event.applied)).toBe(true);
        expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
      }
      const dawnOnly: EngineCardDefinition = { ...FORM_FILLER, id: syntheticId(0x7433), status: "authored", abilities: () => [triggered(either(onDawn(), onDissolved()), effects)] };
      const control = labBoard(createEngine(testCatalog([dawnOnly, mage])), dawnOnly.id, [mage, FORM_EVENT], side).state;
      expect(control.sides[side].void).toEqual([]); expect(control.sides[side === "player" ? "enemy" : "player"].hand).toEqual([]);
      expect(control.sides[side].backRank.every(id => id === null)).toBe(true);
      expect(control.sides[side].deck.every(id => printedCardId(control.instances[id].printing) !== mage.id)).toBe(true);
    });
  }
});
