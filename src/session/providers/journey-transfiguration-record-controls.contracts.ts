import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine/engine";
import { createCatalog } from "../../engine/catalog";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { chronologicalInit } from "../../engine/transfigurations/contracts/chronological.fixtures";
import { cloneState } from "../../engine/state/clone";
import { stateHash, serializeState, deserializeState } from "../../engine/state/hash";
import { catalogManifest, manifestCatalog, type CatalogManifest } from "../../engine/policy/catalog-manifest";
import { createPolicyWorkerHandler } from "../../engine/policy/worker-protocol";
import { aiDecision, runPolicy } from "../../engine/policy/decide";
import { engineDeckEntry } from "../../battle/integration/engine-battle-init";
import { resolveDeckEntryCard } from "../../card-type-change";
import { character, eventCard, data, definitions, entry, catalog } from "../../rules/journey/journey-transfiguration-record.fixtures";
import { parseCardTypeChangePredicateId } from "../../types/identifiers";
import type { DeckEntry } from "../../types/journey";
for (const side of ["player", "enemy"] as const) describe(`${side} journey record initialized engine agreement`, () => {
 it("plays every repeated Inspired occasion after JSON, clone and real worker ingress", () => {
  const held = entry([{ form: "Inspired" }, { form: "Inspired" }], { cardNumber: eventCard.cardNumber });
  const dto = engineDeckEntry(held, eventCard, data), init = chronologicalInit(side, dto, { cardId: character.id });
  const manifest = JSON.parse(JSON.stringify(catalogManifest(catalog, init))) as CatalogManifest;
  const handler = createPolicyWorkerHandler(() => 0); expect(handler({ type: "init", manifest })).toEqual({ type: "ready" });
  for (const source of [catalog, manifestCatalog(manifest)]) {
   const engine = createEngine(source), state = engine.createBattle(init, NO_PROMPTS).state;
   expect(cloneState(state)).toEqual(state); expect(stateHash(deserializeState(serializeState(state)))).toBe(stateHash(state));
   const view = engine.view(state, side); expect(view.instances[state.sides[side].hand[0]].variant.transfigurationApplications).toEqual(held.transfigurationApplications);
   const done = engine.apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, NO_PROMPTS);
   expect(done.events.filter(e => e.kind === "cardDrawn" && e.side === side)).toHaveLength(2);
   const decision = aiDecision({ engine, init, slice: { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, pending: null, side, policy: "random", budgets: { turnPlanning: { iterations: 1 }, response: { iterations: 1 } } })!;
   expect(handler({ type: "decide", id: 757, request: structuredClone(decision.request) })).toEqual({ type: "decided", id: 757, result: runPolicy(createEngine(manifestCatalog(manifest)), decision.request, () => 0) });
  }
  const single = engineDeckEntry(entry([{ form: "Inspired" }], { cardNumber: eventCard.cardNumber }), eventCard, data);
  const engine = createEngine(catalog); expect(stateHash(engine.createBattle(chronologicalInit(side, single, { cardId: character.id }), NO_PROMPTS).state)).not.toBe(stateHash(engine.createBattle(init, NO_PROMPTS).state));
 });
 it("agrees on post-form modifiers, Event null, Event-to-Character zero and debugger override boundaries", () => {
  const predicateId = parseCardTypeChangePredicateId("record-type");
  const cases: readonly { card: typeof character; held: DeckEntry }[] = [
   { card: character, held: entry(undefined, { sparkBonus: 2, keywordModification: { energyCostReduction: 1, fast: true, setReclaim: 2 } }) },
   { card: character, held: entry(undefined, { sparkBonus: 2, typeChange: { predicateId, cardType: "Event", subtype: "", label: "" } }) },
   { card: eventCard, held: entry([{ form: "Inspired" }], { cardNumber: eventCard.cardNumber, sparkBonus: 7, typeChange: { predicateId, cardType: "Character", subtype: "Mage", label: "" } }) },
  ];
  for (const { card, held } of cases) {
   const engine = createEngine(catalog), state = engine.createBattle(chronologicalInit(side, engineDeckEntry(held, card, data), { cardId: character.id }), NO_PROMPTS).state;
   const seen = engine.view(state, side).instances[state.sides[side].hand[0]].characteristics;
   const display = resolveDeckEntryCard(data, card, held);
   expect(seen.spark).toBe(display.spark); expect(seen.cardType).toBe(display.cardType === "Event" ? "event" : "character");
   expect(seen.cost).toBe(display.energyCost); expect(seen.subtype).toBe(display.subtype);
   expect(resolveDeckEntryCard(data, card, { ...held, statOverride: { spark: 91 } }).spark).toBe(91);
  }
  const variableCard = { ...character, spark: null, sparkVariable: true };
  const variableCatalog = createCatalog([{ ...definitions[0], spark: "x" }], []), engine = createEngine(variableCatalog);
  const held = entry([{ form: "Kindled" }]);
  const state = engine.createBattle(chronologicalInit(side, engineDeckEntry(held, variableCard, data), { cardId: character.id }), NO_PROMPTS).state;
  expect(engine.view(state, side).instances[state.sides[side].hand[0]].characteristics.spark).toBe(resolveDeckEntryCard(data, variableCard, held).spark);
  expect(resolveDeckEntryCard(data, variableCard, held).sparkVariable).toBe(false);
 });
});
