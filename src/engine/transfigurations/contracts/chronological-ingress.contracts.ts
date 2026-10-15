import { TRANSFIGURE_MARK_START, TRANSFIGURE_MARK_END } from "../../../transfiguration/transfiguration-logic";
import { triggered, onDawn } from "../../dsl/triggers";
import { describe, expect, it } from "vitest";
import { createCatalog } from "../../catalog";
import { engineCardFromContent } from "../../content-catalog";
import { createEngine } from "../../engine";
import { appendEngineTransfiguration, eligibleEngineTransfigurations } from "../../transfigurations";
import { BASE_VARIANT, type Variant } from "../../dsl/types";
import * as b from "../../dsl/builders";
import * as p from "../../effects/primitives";
import { NO_PROMPTS } from "../../steps/sources";
import { cloneState } from "../../state/clone";
import { stateHash, canonicalHash, serializeState, deserializeState } from "../../state/hash";
import { parseEngineBattleFold } from "../../../rules/battle/fold";
import { catalogManifest, manifestCatalog, type CatalogManifest } from "../../policy/catalog-manifest";
import { createPolicyWorkerHandler } from "../../policy/worker-protocol";
import { aiDecision, runPolicy } from "../../policy/decide";
import { FORM_FILLER, formContent } from "./transfigurations-01.fixtures";
import { chronologicalInit } from "./chronological.fixtures";

function fixture(side: "player" | "enemy" = "player") {
  const card = engineCardFromContent(formContent({ renderedText: "1●: Gain 1⍟.", amplifiedText: "2●: Gain 2⍟.",
    abilities: v => [b.activated([b.energy(v.amplified ? 2 : 1)], p.gainPoints(1))] }));
  const catalog = createCatalog([card, FORM_FILLER], []), engine = createEngine(catalog);
  const variant = appendEngineTransfiguration(card, BASE_VARIANT, "Perfected");
  const init = chronologicalInit(side, { cardId: card.id, ...variant }, { cardId: FORM_FILLER.id });
  const state = engine.createBattle(init, NO_PROMPTS).state;
  const fold = { init, slice: { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 } };
  return { card, catalog, engine, variant, init, state, fold };
}
const forged: Variant = { amplified: false, transfigurationApplications: [{ form: "Perfected", constituents: ["Inspired", "Enduring"] }] };

for (const side of ["player", "enemy"] as const) describe(`${side} chronological ingress and transport`, () => {
  it("preserves serialized, cloned, observed and determinized tuples with ordered hash identity", () => {
    const { state, engine, init, variant, catalog, fold } = fixture(side), bytes = serializeState(state);
    expect(cloneState(state)).toEqual(state);
    expect(serializeState(deserializeState(bytes))).toBe(bytes);
    expect(stateHash(cloneState(state))).toBe(stateHash(state));
    expect(canonicalHash(cloneState(state))).toBe(canonicalHash(state));
    const seen = engine.view(state, side), restored = engine.determinize(seen, init.decks, () => 0);
    expect(engine.view(restored, side)).toEqual(seen);
    expect(restored.instances[state.sides[side].hand[0]].variant).toEqual(variant);
    const copy = cloneState(state), first = state.sides[side].hand[0];
    Object.assign(copy.instances[first], { variant: { ...variant, transfigurationApplications: [...variant.transfigurationApplications!, { form: "Inspired" }] } });
    expect(stateHash(copy)).not.toBe(stateHash(state));
    expect(canonicalHash(copy)).not.toBe(canonicalHash(state));
    expect(parseEngineBattleFold(JSON.parse(JSON.stringify(fold)), catalog)).not.toBeNull();
  });
  it("carries canonical Perfected and Attuned states through real textless worker initialization", () => {
    const { card, catalog, init, variant } = fixture(side);
    const raw = catalogManifest(catalog, init), manifest = JSON.parse(JSON.stringify(structuredClone(raw))) as CatalogManifest;
    expect(manifest).toEqual(raw);
    const workerCatalog = manifestCatalog(manifest), worker = createEngine(workerCatalog);
    expect(workerCatalog.card(card.id).abilities(BASE_VARIANT)).toEqual([]);
    expect(eligibleEngineTransfigurations(workerCatalog.card(card.id), variant)).toEqual(eligibleEngineTransfigurations(card, variant));
    const state = worker.createBattle(init, NO_PROMPTS).state;
    const done = worker.apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, NO_PROMPTS);
    expect(done.events.filter(e => e.kind === "cardDrawn" && e.side === side)).toHaveLength(1);
    expect(done.state.sides[side].score).toBe(0);
    const handler = createPolicyWorkerHandler(() => 0);
    expect(handler({ type: "init", manifest })).toEqual({ type: "ready" });
    const decision = aiDecision({ engine: worker, init, slice: { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, pending: null, side, policy: "random", budgets: { turnPlanning: { iterations: 1 }, response: { iterations: 1 } } });
    expect(decision).not.toBeNull();
    expect(handler({ type: "decide", id: 754, request: structuredClone(decision!.request) })).toEqual({ type: "decided", id: 754, result: runPolicy(worker, decision!.request, () => 0) });
    const unmanifested = { ...init, decks: { ...init.decks, [side]: [{ cardId: card.id, transfigurationApplications: [...variant.transfigurationApplications!, { form: "Inspired" as const }] }] } };
    const bytes = JSON.stringify(unmanifested);
    expect(() => worker.createBattle(unmanifested, NO_PROMPTS)).toThrow();
    expect(JSON.stringify(unmanifested)).toBe(bytes);
    expect(() => appendEngineTransfiguration(workerCatalog.card(card.id), variant, "Inspired")).toThrow();
    const { transfigurationStates: _table, ...without } = manifest.cards.find(c => c.id === card.id)!;
    const missing = manifestCatalog({ ...manifest, cards: manifest.cards.map(c => c.id === card.id ? without : c) });
    expect(() => createEngine(missing).createBattle(init, NO_PROMPTS)).toThrow();
    const fold = { init: unmanifested, slice: { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 } };
    expect(parseEngineBattleFold(fold, workerCatalog)).toBeNull();
  });
  it("transports safe forms and executes canonical marker-prefixed Resonant headers", () => {
    const card = engineCardFromContent(formContent({ cardType: "Character", spark: 2,
      renderedText: TRANSFIGURE_MARK_START + "▸Dawn: Gain 1⍟." + TRANSFIGURE_MARK_END,
      abilities: () => [triggered(onDawn(), p.gainPoints(1))] }));
    const main = createCatalog([card, FORM_FILLER], []);
    for (const form of ["Kindled", "Resonant"] as const) {
      const variant: Variant = { amplified: false, transfigurationApplications: [{ form }] };
      const init = chronologicalInit(side, { cardId: card.id, ...variant }, { cardId: FORM_FILLER.id });
      const worker = manifestCatalog(JSON.parse(JSON.stringify(structuredClone(catalogManifest(main, init)))) as CatalogManifest);
      for (const catalog of [main, worker]) {
        const engine = createEngine(catalog), state = engine.createBattle(init, NO_PROMPTS).state;
        const done = engine.apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, NO_PROMPTS);
        expect(done.state.sides[side].score).toBe(catalog === main && form === "Resonant" ? 1 : 0);
        expect(catalog.variantCard(card.id, variant).spark).toBe(form === "Kindled" ? 4 : 2);
      }
    }
  });
  it("rejects malformed new inputs equally before ordinary and setup initialization", () => {
    const { card, engine, init } = fixture(side);
    const samples: unknown[] = [
      [{ form: "Hastened" }, { form: "Hastened" }], [{ form: "Empowered" }, { form: "Empowered" }, { form: "Empowered" }], [{ form: "Attuned" }, { form: "Attuned" }], [{ form: "unknown" }], [{ form: "Inspired", snapshot: [] }], [{ form: "Perfected" }], [{ form: "Kindled" }],
      [{ form: "Perfected", constituents: ["Enduring", "Inspired"] }], [{ form: "Perfected", constituents: ["Inspired", "Inspired"] }],
      [{ form: "Perfected", constituents: ["Inspired", "Enduring"] }], new Array(1),
      [Object.assign(Object.create({ form: "Inspired" }), { extra: true })],
      [Object.assign(Object.create({ form: "Perfected", constituents: ["Inspired", "Enduring"] }), { x: 1, y: 2 })],
    ];
    for (const applications of samples) for (const declaredSetup of [true, false]) {
      const candidate = { ...init, ...(declaredSetup ? {} : { setup: undefined }), decks: { ...init.decks, [side]: [{ cardId: card.id, transfigurationApplications: applications }] } } as typeof init;
      const bytes = JSON.stringify(candidate), events: unknown[] = [];
      expect(() => engine.createBattle(candidate, NO_PROMPTS, e => events.push(e))).toThrow();
      expect(events).toEqual([]); expect(JSON.stringify(candidate)).toBe(bytes);
    }
    for (const extra of [{ amplified: "yes" }, { surprise: true }, { transfigurations: [] }]) {
      const candidate = { ...init, setup: undefined, decks: { ...init.decks, [side]: [{ cardId: card.id, transfigurationApplications: [], ...extra }] } } as typeof init;
      const bytes = JSON.stringify(candidate), events: unknown[] = [];
      expect(() => engine.createBattle(candidate, NO_PROMPTS, e => events.push(e))).toThrow();
      expect(events).toEqual([]); expect(JSON.stringify(candidate)).toBe(bytes);
    }
  });
  it("rejects forged snapshots in init, committed, debug-history, gained, remembered and played tuples", () => {
    const { fold, catalog, state, card } = fixture(side), id = state.sides[side].hand[0];
    const tuple = { printing: { kind: "card" as const, cardId: card.id }, variant: forged };
    const corruptions = [
      () => ({ ...fold, init: { ...fold.init, decks: { ...fold.init.decks, [side]: [{ cardId: card.id, ...forged }] } } }),
      () => ({ ...fold, slice: { ...fold.slice, committed: { ...state, instances: { ...state.instances, [id]: { ...state.instances[id], variant: forged } } } } }),
      () => ({ ...fold, slice: { ...fold.slice, history: { base: { ...fold.slice, committed: { ...state, instances: { ...state.instances, [id]: { ...state.instances[id], variant: forged } } } }, entries: [] } } }),
      () => ({ ...fold, slice: { ...fold.slice, committed: { ...state, instances: { ...state.instances, [id]: { ...state.instances[id], status: { ...state.instances[id].status, gainedAbilities: [{ cardId: card.id, variant: forged }] } } } } } }),
      () => ({ ...fold, slice: { ...fold.slice, committed: { ...state, rememberedCards: { player: [{ instance: id, owner: side, ...tuple, status: state.instances[id].status, effects: [] }], enemy: [] } } } }),
      () => ({ ...fold, slice: { ...fold.slice, committed: { ...state, firstEventHistory: { current: { player: null, enemy: null, [side]: { instance: id, ...tuple } }, previous: null } } } }),
    ];
    for (const corrupt of corruptions) {
      const value = corrupt(), bytes = JSON.stringify(value);
      expect(parseEngineBattleFold(value, catalog)).toBeNull(); expect(JSON.stringify(value)).toBe(bytes);
    }
    const nativeFigment = { ...fold, slice: { ...fold.slice, committed: { ...state, instances: { ...state.instances, [id]: { ...state.instances[id], printing: { kind: "figment", figment: card.id, spark: 1 } } } } } };
    expect(parseEngineBattleFold(nativeFigment, catalog)).toBeNull();
    const absent = { ...nativeFigment, slice: { ...nativeFigment.slice, committed: { ...nativeFigment.slice.committed, instances: { ...nativeFigment.slice.committed.instances, [id]: { ...state.instances[id], printing: { kind: "figment", figment: card.id, spark: 1 }, variant: BASE_VARIANT } } } } };
    expect(parseEngineBattleFold(absent, catalog)).not.toBeNull();
  });
});

it("supports pending source metadata without inventing authored instructions", () => {
  const card = engineCardFromContent(formContent({ abilities: undefined, renderedText: "▸Dawn: Gain 9⍟." }));
  const variant: Variant = { amplified: false, transfigurationApplications: [{ form: "Resonant" }, { form: "Inspired" }] };
  const catalog = createCatalog([card, FORM_FILLER], []), init = chronologicalInit("player", { cardId: card.id, ...variant }, { cardId: FORM_FILLER.id });
  const rebuilt = manifestCatalog(structuredClone(catalogManifest(catalog, init)));
  for (const source of [catalog, rebuilt]) {
    const engine = createEngine(source), state = engine.createBattle(init, NO_PROMPTS).state;
    const done = engine.apply(state, "player", { kind: "play", card: state.sides.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(done.state.sides.player.score).toBe(0);
    expect(done.events.filter(e => e.kind === "cardDrawn")).toHaveLength(1);
  }
});
