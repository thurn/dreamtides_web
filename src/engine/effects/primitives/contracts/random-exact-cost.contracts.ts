/** Dynamic equality is a resolving zone bound, independent of payment prices. */
import { describe, expect, it } from "vitest";
import { parseAvatarId } from "../../../../types/identifiers";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { abandonCostCapture, activated, countCards, energyX, event, plus, randomIn, stackItem, staticAbility, x } from "../../../dsl/builders";
import { NO_DECK_MODS, type ValueExpr } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, type CardId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, placeFigment } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { eventRedactionViolations } from "../../../testing/redaction";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { copyCard } from "../copy-card";
import { costModifier } from "../cost-modifier";
import { materialize } from "../materialize";
import { mill } from "./random-selection-support";

const exact = materialize(randomIn("deck", 1, { cardType: "character" }, { costExactly: plus(x(), 1) }));
const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000057601"), status: "authored" as const,
  abilities: () => [activated([abandonCostCapture()], exact)] };
const activation: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x57602), status: "authored",
  costs: [energyX()], abilities: () => [activated([abandonCostCapture({ another: true })], exact)] };
const tax: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x57603), status: "authored",
  abilities: () => [staticAbility(costModifier("you", {}, 5))] };
const failing: EngineCardDefinition = { ...v.event0, id: syntheticId(0x57604), status: "authored", abilities: () => [],
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, materialize(randomIn("deck", 1, { cardType: "character" }, { costExactly: 2 })), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic exact-selection failure");
  } } };
const zeroFigment: EngineFigmentDefinition = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000057606"), subtype: "Warrior", spark: 1, status: "vanilla" as const, abilities: () => [] };
const copier: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x57607), status: "authored",
  abilities: () => [event(copyCard({ kind: "stackTarget", selector: stackItem({ cardType: "event" }) }))] };
const baseCards = [DSL.exactCostGenesis, activation, tax, failing, mill, copier, DSL.variableSpark];
const E = createEngine(testCatalog(baseCards, { avatars: [avatar] }, [zeroFigment]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.event1.id];
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected fold outcome ${JSON.stringify(outcome)}`);
  return outcome;
}
function fixture(side: Side, form: "event" | "card" | "avatar" = "event", cards: readonly CardId[] = deck) {
  const f = boardState(E.catalog, { active: side, phase: "day", [side]: {
    hand: form === "event" ? [DSL.exactCostGenesis.id] : [],
    back: form === "card" ? [activation.id, v.vanilla1.id] : [v.vanilla1.id],
    ...(form === "avatar" ? { avatar: avatar.id } : {}), deck: cards, energy: 10 }, [opponent(side)]: { deck: [v.event0.id] } });
  const state = { ...f.state, config: { ...f.state.config, autoAnswerForcedPrompts: false } };
  const payment = f.ids[side].back[form === "card" ? 1 : 0]!;
  const action = form === "event" ? { kind: "play" as const, card: f.ids[side].hand[0], from: "hand" as const }
    : { kind: "activate" as const, source: form === "avatar" ? { kind: "avatar" as const, side } : f.ids[side].back[0]!, ability: 0 };
  return { ...f, state, payment, action, side };
}
function resolve(f: ReturnType<typeof fixture>) {
  const answers = new ScriptedSource([[f.payment]]);
  const result = E.apply(f.state, f.side, f.action, answers);
  answers.assertExhausted();
  const rest = passUntil(E, result.state, next => next.stack.length === 0);
  return { state: rest.state, events: [...result.events, ...rest.events] };
}
function reader(value: ValueExpr, options: { zone?: "deck" | "hand" | "void"; count?: number; other?: boolean; above?: ValueExpr } = {}) {
  const def: EngineCardDefinition = { ...v.event0, id: syntheticId(0x57605), status: "authored", abilities: () => [event(materialize(randomIn(
    options.zone ?? "deck", options.count ?? 1, { cardType: "character", subtype: "Warrior", costAtMost: 3 },
    { costExactly: value, ...(options.other ? { player: "opponent" as const } : {}), ...(options.above === undefined ? {} : { costGreaterThan: options.above }) },
  )))] };
  return { def, engine: createEngine(testCatalog([...baseCards, def])) };
}

describe("random exact copiable cost", () => {
  for (const side of ["player", "enemy"] as const) for (const form of ["event", "card", "avatar"] as const) {
    it(`${side} ${form} captured cost plus one excludes lower, higher and non-character printings`, () => {
      const f = fixture(side, form);
      if (form === "card") f.state.instances[f.ids[side].back[0]!].status.x = 7;
      const result = resolve(f);
      const selected = f.ids[side].deck[1];
      expect(result.state.instances[f.payment].zone).toBe("void");
      expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([selected]);
      expect(result.state.sides[side].deck).toEqual(f.ids[side].deck.filter(id => id !== selected));
      expect(result.state.rng["random:selection"]).toBe(1);
      expect(result.state.rng[`shuffle:${side}`]).toBe(f.state.rng[`shuffle:${side}`]);
      expect(result.state.instances[selected]).toMatchObject({ zone: "play", owner: side, controller: side });
      if (form === "card") expect(result.state.instances[f.ids[side].back[0]!].status.x).toBe(7);
      for (const viewer of ["player", "enemy"] as const) for (const id of result.state.sides[side].deck) expect(view(result.state, viewer, E.catalog).instances[id]).toBeUndefined();
      expect(eventRedactionViolations(result.events, f.state, result.state)).toEqual([]);
      expect(invariantViolations(result.state, E.catalog)).toEqual([]);
      const higherOnly = fixture(side, form, [v.vanilla3.id]);
      const excluded = resolve(higherOnly);
      expect(excluded.events.filter(e => e.kind === "materialized")).toEqual([]);
      expect(excluded.state.sides[side].deck).toEqual(higherOnly.ids[side].deck);
      expect(excluded.state.rng["random:selection"] ?? 0).toBe(0);
    });
  }

  it("has no RNG draws or removal when equality has no match, including an empty deck", () => {
    for (const cards of [[v.vanilla1.id, v.vanilla3.id, v.event1.id], []]) {
      const f = fixture("player", "event", cards);
      const result = resolve(f);
      expect(result.state.sides.player.deck).toEqual(f.ids.player.deck);
      expect(result.state.rng["random:selection"] ?? 0).toBe(f.state.rng["random:selection"] ?? 0);
      expect(result.events.filter(e => e.kind === "materialized" || e.kind === "noLegalTarget")).toEqual([]);
    }
  });

  it("conjoins equality, exclusive lower bounds, static bounds and effective type", () => {
    for (const above of [1, 2]) {
      const { def, engine } = reader(2, { above, count: 3 });
      const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], deck: [v.vanilla2.id, v.vanilla3.id, v.event1.id, v.vanilla2.id] } });
      const transformed = f.ids.player.deck[2];
      f.state.instances[transformed] = { ...f.state.instances[transformed], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } } };
      const result = engine.apply(f.state, "player", { kind: "play", card: f.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
      const expected = above === 1 ? [f.ids.player.deck[0], f.ids.player.deck[3]] : [];
      expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual(expected);
      expect(result.state.rng["random:selection"] ?? 0).toBe(expected.length);
    }
  });

  it("reads the equality expression once before multiple distinct removals from a void", () => {
    const { def, engine } = reader(countCards("void"), { zone: "void", count: 5 });
    const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], void: [v.vanilla3.id, v.vanilla3.id, v.vanilla3.id] } });
    const result = engine.apply(f.state, "player", { kind: "play", card: f.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual(f.ids.player.void);
    expect(result.state.sides.player.void).toEqual([f.ids.player.hand[0]]);
    expect(result.state.rng["random:selection"]).toBe(3);
  });

  it.each(["player", "enemy"] as const)("%s applies the bound to the other controller's hand while retaining owner", side => {
    const { def, engine } = reader(2, { zone: "hand", other: true });
    const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [def.id] }, [opponent(side)]: { hand: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] } });
    const result = engine.apply(f.state, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.state.instances[f.ids[opponent(side)].hand[1]]).toMatchObject({ zone: "play", owner: opponent(side), controller: side });
    expect(result.state.sides[opponent(side)].hand).toEqual([f.ids[opponent(side)].hand[0], f.ids[opponent(side)].hand[2]]);
  });

  it("uses deck-entry cost and type transforms, with payment-only increases excluded", () => {
    const { def, engine } = reader(2, { count: 4 });
    const f = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [tax.id], hand: [def.id], energy: 20,
      deck: [v.vanilla3.id, v.event1.id, v.vanilla2.id, v.vanilla1.id] } });
    f.state.instances[f.ids.player.deck[0]] = { ...f.state.instances[f.ids.player.deck[0]], variant: { amplified: false, transfigurations: ["Kindled"], deckMods: { ...NO_DECK_MODS, costReduction: 1 } } };
    f.state.instances[f.ids.player.deck[2]] = { ...f.state.instances[f.ids.player.deck[2]], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } } };
    const result = engine.apply(f.state, "player", { kind: "play", card: f.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([f.ids.player.deck[0]]);
  });

  it("captures copied cost and figment zero before their departure, and treats candidate X cost as zero", () => {
    for (const copied of [false, true]) {
      const f = fixture("player", "avatar", [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id]);
      const zero = placeFigment(f.state, "player", { rank: "back", index: 1 }, copied
        ? { kind: "figmentCopy", cardId: v.vanilla1.id, spark: null }
        : { kind: "figment", figment: zeroFigment.id, spark: 1 });
      const result = resolve({ ...f, payment: zero });
      expect(result.state.instances[zero]).toBeUndefined();
      expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([f.ids.player.deck[copied ? 1 : 0]]);
    }
    const { def, engine } = reader(0);
    const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], deck: [DSL.variableSpark.id, v.vanilla1.id] } });
    const result = engine.apply(f.state, "player", { kind: "play", card: f.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([f.ids.player.deck[0]]);
  });

  it("uses paid source X and restores the same exact selection from serialized stack state", () => {
    const { def } = reader(x());
    const priced = { ...def, costs: [energyX()] };
    const local = createEngine(testCatalog([...baseCards, priced]));
    const f = boardState(local.catalog, { active: "player", phase: "day", player: { hand: [priced.id], deck, energy: 5 }, enemy: { hand: [v.interruptEvent.id], energy: 1 } });
    const played = local.apply(f.state, "player", { kind: "play", card: f.ids.player.hand[0], from: "hand" }, new ScriptedSource([2]));
    expect(played.state.stack).toHaveLength(1);
    const saved = deserializeState(serializeState(played.state));
    const done = passUntil(local, played.state, s => s.stack.length === 0);
    const again = passUntil(local, saved, s => s.stack.length === 0);
    expect(stateHash(again.state)).toBe(stateHash(done.state));
    expect(done.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([f.ids.player.deck[1]]);
  });

  it("copies captured X to the new source and resolves each controller's exact deck bound", () => {
    const f = boardState(E.catalog, { active: "player", phase: "day",
      player: { hand: [DSL.exactCostGenesis.id], back: [v.vanilla1.id], deck },
      enemy: { hand: [copier.id], deck, energy: 1 } });
    const source = f.ids.player.hand[0];
    const played = E.apply(f.state, "player", { kind: "play", card: source, from: "hand" }, new ScriptedSource([[f.ids.player.back[0]!]]));
    const response = E.apply(played.state, "enemy", { kind: "play", card: f.ids.enemy.hand[0], from: "hand" }, new ScriptedSource([[source]]));
    const done = passUntil(E, response.state, s => s.stack.length === 0);
    const events = [...response.events, ...done.events];
    expect(events.filter(e => e.kind === "cardCopied")).toHaveLength(1);
    expect(events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([f.ids.enemy.deck[1], f.ids.player.deck[1]]);
    expect(done.state.rng["random:selection"]).toBe(2);
    expect(invariantViolations(done.state, E.catalog)).toEqual([]);
  });

  it("reads remaining eligibility after a live interrupt empties the deck", () => {
    const staged = boardState(E.catalog, { active: "player", phase: "day", player: { hand: [DSL.exactCostGenesis.id], back: [v.vanilla1.id], deck }, enemy: { hand: [mill.id], energy: 1 } });
    const played = E.apply(staged.state, "player", { kind: "play", card: staged.ids.player.hand[0], from: "hand" }, new ScriptedSource([[staged.ids.player.back[0]!]]));
    const response = E.apply(played.state, "enemy", { kind: "play", card: staged.ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    const done = passUntil(E, response.state, s => s.stack.length === 0);
    expect(done.state.sides.player.deck).toEqual([staged.ids.player.deck[3]]);
    expect(done.state.rng["random:selection"] ?? 0).toBe(0);
    expect(done.events.filter(e => e.kind === "materialized")).toEqual([]);
  });
});

describe("exact bound transaction recovery", () => {
  it.each(["player", "enemy"] as const)("%s reloads the captured-cost prompt, cancels, and rejects sequential competing and stale inputs", side => {
    const f = fixture(side, "avatar");
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    const prompt = fold.pending(opened.slice)!.prompt;
    const intent = { kind: "answer" as const, side, promptId: prompt.id, value: [f.payment] };
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(E.catalog), { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(fold.pending(opened.slice));
    expect(fresh.reduce(saved, { ...intent, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(saved, { ...intent, value: [f.ids[side].deck[1]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(saved, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(fresh.reduce(saved, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.slice.committed).toEqual(f.state);
    expect(cancelled.published).toEqual([]);
    const reopened = applied(fresh.reduce(cancelled.slice, { kind: "battleAction", side, action: f.action }));
    expect(fresh.reduce(reopened.slice, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const done = applied(fresh.reduce(saved, intent));
    expect(done.slice).toEqual(applied(fold.reduce(opened.slice, intent)).slice);
    expect(done.published.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([f.ids[side].deck[1]]);
    expect(done.slice.committed.rng["random:selection"]).toBe(1);
    expect(fresh.reduce(done.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(invariantViolations(done.slice.committed, E.catalog)).toEqual([]);
  });

  it("rolls back a genuine error after an exact selection without publishing partial materialization", () => {
    const f = boardState(E.catalog, { active: "player", phase: "day", player: { hand: [failing.id], deck }, enemy: { deck: [v.event0.id] } });
    const fold = createFoldAdapter(E);
    const outcome = fold.reduce(slice(f.state), { kind: "battleAction", side: "player", action: { kind: "play", card: f.ids.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("Expected synthetic resolver error");
    expect(outcome.error.message).toContain("synthetic exact-selection failure");
    expect(outcome.published.filter(e => e.kind === "materialized")).toEqual([]);
    expect(outcome.slice.committed.sides.player.deck).toEqual(f.ids.player.deck);
    expect(outcome.slice.committed.sides.player.backRank.filter(Boolean)).toEqual([]);
    expect(outcome.slice.committed.rng["random:selection"] ?? 0).toBe(0);
    expect(outcome.slice.committed.knownTo).toEqual(f.state.knownTo);
    expect(outcome.slice.inFlight).toBeNull();
    expect(invariantViolations(outcome.slice.committed, E.catalog)).toEqual([]);
  });
});
