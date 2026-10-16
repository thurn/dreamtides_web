import { afterEach, describe, expect, it } from "vitest";
import { additionalWindow, apply, resolveWindow, POUCH, TOME, WINDOW, TAIL, ENTRY_ID } from "./journey-additional-transfiguration.fixtures";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { engineDeckEntry } from "../../battle/integration/engine-battle-init";
import { resolveDeckEntryCard } from "../../card-type-change";
import { toDeckCardView } from "../../screens/cumulus_adapters/mobile-deck-view-model";
import { journeyContentEngine } from "../../session/providers/journey-content-engine";
import { createEngine } from "../../engine";
import { createCatalog, instanceCard } from "../../engine/catalog";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { chronologicalInit } from "../../engine/transfigurations/contracts/chronological.fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { event as eventAbility } from "../../engine/dsl/builders";
import { gainPoints } from "../../engine/effects/primitives";
import { parseCardSubtype } from "../../types/card-identity";
import { hashState } from "../../eventlog/hash";

function twiceKindled() {
  const f = additionalWindow({ held: [POUCH, TOME, WINDOW, TAIL] });
  f.state.journey.deck[0] = { ...f.state.journey.deck[0], sparkBonus: 2, keywordModification: { fast: true, energyCostReduction: 1 } };
  const forms = f.provider.resolve(f.state.journey.deck[0])!.applicableForms!.filter(form => form !== "Perfected");
  const root = resolveWindow(f, f.state, [ENTRY_ID], { seq: 10, rng: () => (forms.indexOf("Kindled") + 0.25) / forms.length });
  const removed = apply(f, root.state, "REMOVE_DREAMSIGN", { dreamsignId: POUCH }, { seq: 11 });
  const current = f.provider.resolve(removed.state.journey.deck[0])!.applicableForms!;
  const result = resolveWindow(f, removed.state, [], { seq: 12, rng: () => (current.indexOf("Kindled") + 0.25) / current.length });
  if (result.outcome !== "applied") throw new Error("finite additional application refused");
  return { ...f, state: result.state };
}
describe("actual additional histories reach existing consumers", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it.each(["player", "enemy"] as const)("charges and resolves the complete finite record in the real %s engine", side => {
    const f = twiceKindled(), entry = f.state.journey.deck[0], card = resolveDeckEntryCard(f.data, f.base, entry);
    expect(entry.transfigurationApplications).toEqual([{ form: "Kindled" }, { form: "Kindled" }]);
    expect(card.spark).toBe(14); expect(card.energyCost).toBe(5); expect(card.isFast).toBe(true);
    const dto = engineDeckEntry(entry, f.base, f.data), other = engineDeckEntry(f.state.journey.deck[1], f.neighbor, f.data);
    expect(dto).toMatchObject({ cardId: f.base.id, transfigurationApplications: entry.transfigurationApplications, deckMods: { sparkBonus: 2, costReduction: 1, fast: true } });
    const catalog = journeyContentEngine(f.content).catalog, engine = createEngine(catalog);
    const started = engine.createBattle(chronologicalInit(side, dto, other), NO_PROMPTS).state;
    const id = started.sides[side].hand[0], actual = instanceCard(catalog, started.instances[id]);
    expect(actual.spark).toBe(14); expect(actual.speed).toBe("fast");
    expect(started.instances[id].variant).toMatchObject({ transfigurationApplications: entry.transfigurationApplications, deckMods: { sparkBonus: 2, costReduction: 1, fast: true } });
    const played = engine.apply(started, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS);
    expect(played.state.sides[side].currentEnergy).toBe(15);
  });
  it("projects chronological display metadata/tint and preserves clone/hash/codec bytes", () => {
    const f = twiceKindled(), entry = f.state.journey.deck[0], view = toDeckCardView(f.data, entry, f.content.cardDatabase);
    expect(view?.model.displaySnapshot).toMatchObject({ spark: 14, energyCost: 5, isFast: true });
    expect(view?.model.transfiguration).toMatchObject({ type: "Kindled", applications: entry.transfigurationApplications!.map(application => ({ application })) });
    const bytes = GAME_ENGINE_CONFIG.encode(f.state), hash = hashState(f.state);
    expect(hashState(structuredClone(f.state))).toBe(hash); expect(hashState(GAME_ENGINE_CONFIG.decode(bytes))).toBe(hash); expect(GAME_ENGINE_CONFIG.encode(GAME_ENGINE_CONFIG.decode(bytes))).toBe(bytes);
    const neighbor = f.state.journey.deck[1]; expect(neighbor).not.toHaveProperty("transfigurationApplications");
    expect(JSON.stringify(GAME_ENGINE_CONFIG.decode(bytes).journey.deck[1])).toBe(JSON.stringify(neighbor));
  });
  it("treats each captured Perfected as one occasion and retains earlier/later copy snapshots", () => {
    const f = additionalWindow({ cardType: "Event", authored: true, held: [POUCH, TOME, WINDOW, TAIL] });
    const first = f.provider.apply!(f.state.journey.deck[0], "Perfected"); if (!first.ok) throw new Error("Perfected unavailable");
    const occurrence = { entry: first.value, cardId: f.base.id, cardType: "Event" as const };
    const root = f.registry.apply({ before: f.state.journey, journey: { ...f.state.journey, deck: [first.value, f.state.journey.deck[1]] }, eventType: "RESOLVE_EXPLORATION_CHOICE", seq: 30, random: () => ({ value: 0, drawIndex: 0 }), transfigurations: [occurrence], siteId: null });
    expect(root.journey.pendingJourneyLoop!.instructions).toHaveLength(1); expect(root.journey.deck).toHaveLength(3);
    const removed = apply(f, { ...f.state, journey: root.journey }, "REMOVE_DREAMSIGN", { dreamsignId: POUCH }, { seq: 31 });
    const current = f.provider.resolve(removed.state.journey.deck[0])!.applicableForms!;
    const advanced = resolveWindow(f, removed.state, [], { seq: 32 });
    const done = resolveWindow(f, advanced.state, [], { seq: 33, rng: () => (current.indexOf("Perfected") + 0.25) / current.length });
    const original = done.state.journey.deck[0];
    expect(original.transfigurationApplications).toHaveLength(2); expect(original.transfigurationApplications![0]).toEqual(first.value.transfigurationApplications![0]);
    expect(original.transfigurationApplications![1].form).toBe("Perfected");
    expect(done.state.journey.deck[2].transfigurationApplications).toEqual(first.value.transfigurationApplications);
    expect(done.state.journey.deck[3].transfigurationApplications).toEqual(original.transfigurationApplications);
    expect(done.logRecords?.filter(row => row.event === "journey_loop_finite_application")).toHaveLength(1);
  });
  it.each(["player", "enemy"] as const)("executes authored replacement order through actual additional children for %s", side => {
    for (const rootForm of ["Inspired", "Amplified"] as const) {
      const childForm = rootForm === "Inspired" ? "Amplified" : "Inspired";
      const f = additionalWindow({ cardType: "Event", authored: true, renderedText: "Gain 1⍟.", abilities: variant => [eventAbility(variant.amplified ? { op: "draw", count: 1, player: "you" } : gainPoints(1))] });
      const rootForms = f.provider.resolve(f.state.journey.deck[0])!.applicableForms!.filter(form => form !== "Perfected");
      const first = resolveWindow(f, f.state, [ENTRY_ID], { seq: 20, rng: () => (rootForms.indexOf(rootForm) + 0.25) / rootForms.length });
      const removed = apply(f, first.state, "REMOVE_DREAMSIGN", { dreamsignId: POUCH }, { seq: 21 });
      const forms = f.provider.resolve(removed.state.journey.deck[0])!.applicableForms!;
      expect(forms).toContain(childForm);
      const done = resolveWindow(f, removed.state, [], { seq: 22, rng: () => (forms.indexOf(childForm) + 0.25) / forms.length });
      const original = done.state.journey.deck[0];
      expect(original.transfigurationApplications).toEqual([{ form: rootForm }, { form: childForm }]);
      const engine = journeyContentEngine(f.content), dto = engineDeckEntry(original, f.base, f.data), filler = engineDeckEntry(f.state.journey.deck[1], f.neighbor, f.data);
      const started = engine.createBattle(chronologicalInit(side, dto, filler), NO_PROMPTS).state;
      const played = engine.apply(started, side, { kind: "play", card: started.sides[side].hand[0], from: "hand" }, NO_PROMPTS);
      expect(played.state.sides[side].score).toBe(0);
      expect(played.events.filter(event => event.kind === "cardDrawn" && event.side === side)).toHaveLength(rootForm === "Inspired" ? 1 : 2);
      expect(done.state.journey.deck[2].transfigurationApplications).toEqual(first.state.journey.deck[0].transfigurationApplications);
      expect(done.state.journey.deck[3].transfigurationApplications).toEqual(original.transfigurationApplications);
    }
  });

  it.each(["player", "enemy"] as const)("keeps C12, deck modifications and physical opening guarantees independent for %s", side => {
    const f = twiceKindled(), dto = engineDeckEntry(f.state.journey.deck[0], f.base, f.data), filler = engineDeckEntry(f.state.journey.deck[1], f.neighbor, f.data);
    const chosen = parseCardSubtype("Mage"), source = journeyContentEngine(f.content), engine = createEngine(createCatalog([source.catalog.card(f.base.id), source.catalog.card(f.neighbor.id)], [], { dreamsigns: [{ id: TOME, status: "vanilla", abilities: () => [] }] }));
    const { setup: _setup, ...init } = chronologicalInit(side, { ...dto, typeRemap: chosen }, filler);
    const started = engine.createBattle({ ...init, dreamsigns: { [side]: [TOME] }, guaranteedOpeningHand: { [side]: [{ deckIndex: 0, entryId: ENTRY_ID, dreamsignId: TOME, heldIndex: 0 }] } }, NO_PROMPTS).state;
    const physical = started.sides[side].hand.map(id => started.instances[id]).find(instance => instance.printing.kind === "card" && instance.printing.cardId === f.base.id)!;
    expect(physical).toBeDefined(); expect(physical.variant).toMatchObject({ typeRemap: chosen, transfigurationApplications: [{ form: "Kindled" }, { form: "Kindled" }], deckMods: { sparkBonus: 2, costReduction: 1, fast: true } });
    expect(instanceCard(engine.catalog, physical).spark).toBe(14);
    expect(f.state.journey.deck[0]).not.toHaveProperty("typeRemap");
  });

});
