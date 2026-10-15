import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard } from "../../catalog";
import { engineCardFromContent } from "../../content-catalog";
import { BASE_VARIANT } from "../../dsl/types";
import { createEngine } from "../../engine";
import { NO_PROMPTS } from "../../steps/sources";
import { FORM_FILLER, formContent } from "./transfigurations-01.fixtures";
import { chronologicalInit } from "./chronological.fixtures";

// Inferred extra data reaches the old public API too: these REDs concern behavior, not a new-type import.
for (const side of ["player", "enemy"] as const) describe(`${side} initialized chronological applications`, () => {
  it("executes two Inspired applications as two actual draws", () => {
    const subject = engineCardFromContent(formContent());
    const catalog = createCatalog([subject, FORM_FILLER], []), engine = createEngine(catalog);
    const entry = { cardId: subject.id, transfigurationApplications: [{ form: "Inspired" as const }, { form: "Inspired" as const }] };
    const init = chronologicalInit(side, entry, { cardId: FORM_FILLER.id });
    const before = JSON.stringify(init), started = engine.createBattle(init, NO_PROMPTS).state;
    const card = started.sides[side].hand[0];
    const result = engine.apply(started, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
    expect(result.events.filter(event => event.kind === "cardDrawn" && event.side === side)).toHaveLength(2);
    expect(result.state.sides[side].hand).toHaveLength(2);
    expect(JSON.stringify(init)).toBe(before);
  });
  it("executes repeated Kindled through the public catalog and initialized instance", () => {
    const subject = engineCardFromContent(formContent({ cardType: "Character", spark: 3, abilities: () => [] }));
    const catalog = createCatalog([subject, FORM_FILLER], []);
    const tuple = { amplified: false, transfigurationApplications: [{ form: "Kindled" as const }, { form: "Kindled" as const }] };
    expect(catalog.variantCard(subject.id, tuple).spark).toBe(12);
    const engine = createEngine(catalog), entry = { cardId: subject.id, ...tuple };
    const state = engine.createBattle(chronologicalInit(side, entry, { cardId: FORM_FILLER.id }), NO_PROMPTS).state;
    expect(instanceCard(catalog, state.instances[state.sides[side].hand[0]]).spark).toBe(12);
    expect(catalog.card(subject.id).abilities(BASE_VARIANT)).toEqual([]);
  });
  it("retains ordinary explicit legacy membership semantics", () => {
    const subject = engineCardFromContent(formContent());
    const catalog = createCatalog([subject, FORM_FILLER], []), engine = createEngine(catalog);
    const init = chronologicalInit(side, { cardId: subject.id, transfigurations: ["Inspired", "Inspired"] }, { cardId: FORM_FILLER.id });
    const state = engine.createBattle(init, NO_PROMPTS).state;
    const result = engine.apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.events.filter(event => event.kind === "cardDrawn" && event.side === side)).toHaveLength(1);
  });
});
