import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard } from "../../catalog";
import { engineCardFromContent } from "../../content-catalog";
import { createEngine } from "../../engine";
import { appendEngineTransfiguration, eligibleEngineTransfigurations } from "../../transfigurations";
import { BASE_VARIANT, NO_DECK_MODS, type Variant } from "../../dsl/types";
import * as b from "../../dsl/builders";
import * as p from "../../effects/primitives";
import { triggered, onDawn, onMaterialized, onDissolved, either } from "../../dsl/triggers";
import { NO_PROMPTS } from "../../steps/sources";
import { FORM_FILLER, formContent } from "./transfigurations-01.fixtures";
import { chronologicalInit } from "./chronological.fixtures";

const ordered = (...forms: readonly Exclude<import("../../../types/journey").TransfigurationType, "Perfected">[]): Variant => ({ amplified: false, transfigurationApplications: forms.map(form => ({ form })) });
const authored = () => engineCardFromContent(formContent({ amplifiedText: "Gain 4⍟.", abilities: v => [b.event(p.gainPoints(v.amplified ? 4 : 1))] }));
function result(card: ReturnType<typeof authored>, variant: Variant, side: "player" | "enemy" = "player") {
  const catalog = createCatalog([card, FORM_FILLER], []), engine = createEngine(catalog);
  const started = engine.createBattle(chronologicalInit(side, { cardId: card.id, ...variant }, { cardId: FORM_FILLER.id }), NO_PROMPTS).state;
  return engine.apply(started, side, { kind: "play", card: started.sides[side].hand[0], from: "hand" }, NO_PROMPTS);
}

for (const side of ["player", "enemy"] as const) describe(`${side} chronological source execution`, () => {
  it("replaces abilities at the recorded position and can Amplify again after an append", () => {
    const card = authored();
    for (const [forms, draws] of [[ordered("Inspired", "Amplified"), 0], [ordered("Amplified", "Inspired"), 1], [ordered("Amplified", "Inspired", "Amplified", "Inspired"), 1]] as const) {
      const done = result(card, forms, side);
      expect(done.state.sides[side].score).toBe(4);
      expect(done.events.filter(e => e.kind === "cardDrawn" && e.side === side)).toHaveLength(draws);
    }
    expect(result(card, { amplified: true, transfigurationApplications: [{ form: "Inspired" }] }, side).state.sides[side].score).toBe(4);
  });
  it("captures each Perfected from current values and retains later independent operations", () => {
    const card = authored();
    const once = appendEngineTransfiguration(card, BASE_VARIANT, "Perfected");
    expect(once.transfigurationApplications).toEqual([{ form: "Perfected", constituents: ["Empowered", "Amplified", "Inspired", "Enduring", "Hastened"] }]);
    const twice = appendEngineTransfiguration(card, once, "Perfected");
    expect(twice.transfigurationApplications?.[1]).toEqual({ form: "Perfected", constituents: ["Empowered", "Amplified", "Inspired", "Enduring"] });
    const later = appendEngineTransfiguration(card, once, "Inspired");
    expect(result(card, once, side).events.filter(e => e.kind === "cardDrawn" && e.side === side)).toHaveLength(1);
    expect(result(card, later, side).events.filter(e => e.kind === "cardDrawn" && e.side === side)).toHaveLength(2);
    expect(result(card, twice, side).events.filter(e => e.kind === "cardDrawn" && e.side === side)).toHaveLength(1);
    expect(BASE_VARIANT).toEqual({ amplified: false });
  });
  it("targets the selected later header even when an earlier combined header would change", () => {
    const card = engineCardFromContent(formContent({ cardType: "Character", spark: 2,
      renderedText: "▸Dissolved, Dawn: Gain 1⍟.\n\n▸Dawn: Gain 2⍟.",
      abilities: () => [triggered(either(onDissolved(), onDawn()), p.gainPoints(1)), triggered(onDawn(), p.gainPoints(2))] }));
    expect(result(card, ordered("Resonant"), side).state.sides[side].score).toBe(2);
    const resolved = createCatalog([card], []).variantCard(card.id, ordered("Resonant")).abilities(BASE_VARIANT);
    expect(resolved[0]).toEqual(card.abilities(BASE_VARIANT)[0]);
    expect(resolved[1]).toEqual(triggered(either(onDawn(), onMaterialized()), p.gainPoints(2)));
  });
  it("advances across two headers, removes a limit then widens the same ability, and resets on replacement", () => {
    const card = engineCardFromContent(formContent({ cardType: "Character", spark: 2,
      renderedText: "▸Dawn: Gain 1⍟. Once per turn.\n\n▸Dawn: Gain 2⍟.", amplifiedText: "▸Dawn: Gain 7⍟.",
      abilities: v => v.amplified ? [triggered(onDawn(), p.gainPoints(7))] : [triggered(onDawn(), p.gainPoints(1), { oncePerTurn: true }), triggered(onDawn(), p.gainPoints(2))] }));
    expect(result(card, ordered("Resonant", "Resonant", "Resonant"), side).state.sides[side].score).toBe(3);
    expect(result(card, ordered("Resonant", "Resonant", "Amplified", "Resonant"), side).state.sides[side].score).toBe(7);
  });
  it("applies numeric forms before permanent modifications and charges the actual final cost", () => {
    const card = engineCardFromContent(formContent({ cardType: "Character", spark: 3, energyCost: 7, abilities: () => [] }));
    const variant = { ...ordered("Kindled", "Empowered", "Kindled", "Empowered"), deckMods: { ...NO_DECK_MODS, sparkBonus: -5, costReduction: 1 } };
    const catalog = createCatalog([card, FORM_FILLER], []), engine = createEngine(catalog);
    const state = engine.createBattle(chronologicalInit(side, { cardId: card.id, ...variant }, { cardId: FORM_FILLER.id }), NO_PROMPTS).state;
    const id = state.sides[side].hand[0];
    expect(instanceCard(catalog, state.instances[id]).spark).toBe(7);
    const done = engine.apply(state, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS);
    expect(done.state.sides[side].currentEnergy).toBe(20);
  });
});

describe("current canonical source and snapshot boundaries", () => {
  it("does not import a newly enabled Attuned target into a Perfected snapshot", () => {
    const card = engineCardFromContent(formContent({ cardType: "Character", spark: 2, renderedText: "", amplifiedText: "1●: Gain 3⍟.", abilities: v => v.amplified ? [b.activated([b.energy(1)], p.gainPoints(3))] : [] }));
    const snapshot = appendEngineTransfiguration(card, BASE_VARIANT, "Perfected");
    expect(snapshot.transfigurationApplications?.[0]).toEqual({ form: "Perfected", constituents: ["Empowered", "Amplified", "Kindled"] });
    expect(eligibleEngineTransfigurations(card, snapshot)).toContain("Attuned");
    const later = appendEngineTransfiguration(card, snapshot, "Attuned");
    expect(eligibleEngineTransfigurations(card, later)).not.toContain("Attuned");
  });
  it("retains captured Attuned when internal Amplified removes its instruction", () => {
    const card = engineCardFromContent(formContent({ cardType: "Character", spark: 2, renderedText: "1●: Gain 1⍟.", amplifiedText: "▸Dawn: Gain 3⍟.", abilities: v => v.amplified ? [triggered(onDawn(), p.gainPoints(3))] : [b.activated([b.energy(1)], p.gainPoints(1))] }));
    const snapshot = appendEngineTransfiguration(card, BASE_VARIANT, "Perfected");
    expect(snapshot.transfigurationApplications?.[0]).toEqual({ form: "Perfected", constituents: ["Empowered", "Amplified", "Kindled", "Attuned"] });
    expect(eligibleEngineTransfigurations(card, snapshot)).toContain("Resonant");
    expect(result(card, snapshot).state.sides.player.score).toBe(0);
  });
  it("uses immutable source strings and actual equality after an append", () => {
    const input = formContent({ amplifiedText: "Gain 1⍟. Draw a card.", abilities: () => [b.event(p.gainPoints(1))] });
    const card = engineCardFromContent(input);
    const before = eligibleEngineTransfigurations(card, ordered("Inspired"));
    Object.assign(input, { renderedText: "▸Dawn: Gain 8⍟.", amplifiedText: "different", tags: ["changed"] });
    expect(eligibleEngineTransfigurations(card, ordered("Inspired"))).toEqual(before);
    expect(before).not.toContain("Amplified");
  });
  for (const replacement of [undefined, "", "   ", "▸Dawn: Gain 1⍟."]) it(`retains selected authored source semantics for ${JSON.stringify(replacement)}`, () => {
    const card = engineCardFromContent(formContent({ cardType: "Character", spark: 1, renderedText: "▸Dawn: Gain 1⍟.", amplifiedText: replacement,
      abilities: () => [triggered(onDawn(), p.gainPoints(1))] }));
    const initial: Variant = { amplified: true, transfigurationApplications: [] };
    expect(eligibleEngineTransfigurations(card, initial)).not.toContain("Amplified");
    expect(eligibleEngineTransfigurations(card, initial).includes("Resonant")).toBe(replacement === undefined || replacement === "▸Dawn: Gain 1⍟.");
  });
  it("refuses incoherent authored Resonant only at its execution and leaves caller input intact", () => {
    const card = engineCardFromContent(formContent({ cardType: "Character", spark: 1, renderedText: "▸Dawn: Gain 1⍟.", abilities: () => [] }));
    expect(() => result(card, ordered("Kindled"))).not.toThrow();
    const variant = ordered("Resonant"), bytes = JSON.stringify(variant);
    expect(() => result(card, variant)).toThrow();
    expect(JSON.stringify(variant)).toBe(bytes);
  });
});
