import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, anyCharacter, energy, energyX, event, keyword, stackItem, target } from "../../../dsl/builders";
import { NO_DECK_MODS, type StackTargetSpec } from "../../../dsl/types";
import { onMaterialized, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { instanceOrigin } from "../../../rules/activation";
import { enterPlay, instanceOf, moveToHand, moveToStack } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, CardStackItem } from "../../../state/types";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parsePromptId } from "../../../../types/identifiers";
import { resolveEffect } from "../../interpreter";
import { gainEnergy } from "../gain-energy";
import { modifyCardCost } from "../modify-card-cost";
import { returnToHand } from "../return-to-hand";

const stackRef = (cap = 3): StackTargetSpec => ({ kind: "stackTarget", selector: stackItem({ costAtMost: cap }) });
const returned = (named = true, cap = 3) => modifyCardCost(returnToHand(stackRef(cap), named ? { toOpponentHand: true } : {}), { increase: 2 });
const fixture = (id: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  ...v.interruptEvent, id: syntheticId(0x62800 + id), costs: [energy(1)], status: "authored", abilities,
});
const named = fixture(1, (variant) => [event(returned(true, variant.amplified ? 3 : 2))]);
const unnamed = fixture(2, () => [event(returned(false))]);
const ordinary = fixture(3, () => [event(returnToHand(target(anyCharacter())))]);
const materialized: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x62804), speed: "interrupt", status: "authored", abilities: () => [triggered(onMaterialized(), returned())] };
const immune: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x62805), status: "authored", abilities: () => [keyword("cannotBePrevented")] };
const untargetable: EngineCardDefinition = { ...immune, id: syntheticId(0x62806), abilities: () => [keyword("cannotBeTargeted")] };
const variable: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x62807), costs: [energy(2), energyX()] };
const activator: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x62808), status: "authored", abilities: () => [activated([], gainEnergy(1))] };
const failures = [false, true].map((withCost, index): EngineCardDefinition => ({
  ...fixture(9 + index, () => []),
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, withCost ? returned() : returnToHand(stackRef(), { toOpponentHand: true }), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: item.choices[0],
    });
    const id = item.choices[0].targets[0][0];
    expect(ctx.state.instances[id].zone).toBe("hand");
    expect(ctx.state.floating).toHaveLength(withCost ? 1 : 0);
    throw new Error("synthetic failure after stack return");
  } },
}));
const engine = createEngine(testCatalog([named, unnamed, ordinary, materialized, immune, untargetable, variable, activator, ...failures]));
const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];
function put(state: BattleState, id: InstanceId, controller: Side, targets: InstanceId[] = [], amplified = false): CardStackItem {
  const ctx = new Context(state, engine.catalog, NO_PROMPTS);
  moveToStack(ctx, id, controller, { choices: [{ modes: [], targets: [targets] }], x: null, optionalPaid: [] });
  state.instances[id] = { ...state.instances[id], variant: { amplified } };
  const item = state.stack.find((entry): entry is CardStackItem => entry.kind === "card" && entry.instance === id)!;
  state.priority = opponent(controller);
  return item;
}
function prepared(side: Side, card = named, targets = [v.vanilla2.id]) {
  const other = opponent(side);
  const board = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: [card.id, v.interruptEvent.id], energy: 8, deck },
    [other]: { hand: [...targets, v.interruptEvent.id], energy: 8, deck },
  });
  const selected = board.ids[other].hand.slice(0, targets.length);
  for (const id of selected) put(board.state, id, other);
  board.state.priority = side;
  return { ...board, selected, source: board.ids[side].hand[0], side, other };
}
function resolve(board: ReturnType<typeof prepared>, chosen = board.selected[0], amplified = false) {
  put(board.state, board.source, board.side, [chosen], amplified);
  return engine.apply(board.state, board.other, { kind: "pass" }, NO_PROMPTS);
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected a successful applied intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const cost = (state: BattleState, id: InstanceId, side: Side) => engine.view(state, side).instances[id]?.characteristics.cost;

for (const side of SIDES) describe(`return a stack card (${side})`, () => {
  it.each(["own", "opponent", "own-controller"] as const)("uses the explicit opponent hand for %s ownership/controller, with a public permanent cost change", (relation) => {
    const board = prepared(side);
    const id = board.selected[0];
    if (relation !== "opponent") board.state.instances[id] = { ...board.state.instances[id], owner: side };
    if (relation === "own-controller") {
      const item = board.state.stack.find((entry): entry is CardStackItem => entry.kind === "card" && entry.instance === id)!;
      board.state.stack = board.state.stack.map((entry) => entry === item ? { ...item, controller: side } : entry);
      board.state.instances[id].controller = side;
    }
    const done = resolve(board);
    expect(done.state.sides[board.other].hand).toContain(id);
    expect(done.state.sides[side].hand).not.toContain(id);
    expect(done.state.instances[id]).toMatchObject({ owner: relation === "opponent" ? board.other : side, controller: board.other, zone: "hand" });
    expect(done.events).toContainEqual({ kind: "returnedToHand", instance: id, side: board.other });
    expect(done.events.some((e) => e.kind === "prevented" || e.kind === "cardDrawn")).toBe(false);
    expect(done.state.floating).toEqual([expect.objectContaining({ expiry: { at: "never" }, change: { kind: "cardCost", instance: id, mode: "increase", amount: 2 } })]);
    expect(cost(done.state, id, board.other)).toBe(4);
    for (const viewer of SIDES) {
      expect(engine.view(done.state, viewer).instances[id]).toBeDefined();
      for (const e of done.events.filter((entry) => entry.kind === "returnedToHand" || entry.kind === "effectStarted")) expect(eventSeenBy(e, viewer, done.state)).not.toBeNull();
    }
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });

  it("uses the owner for an unnamed stack return and preserves ordinary character owner-hand behavior", () => {
    const board = prepared(side, unnamed);
    const id = board.selected[0];
    board.state.instances[id] = { ...board.state.instances[id], owner: side };
    const done = resolve(board);
    expect(done.state.sides[side].hand).toContain(id);
    expect(done.state.sides[board.other].hand).not.toContain(id);
    const character = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [ordinary.id], back: [v.vanilla2.id], deck }, [board.other]: { deck } });
    const owned = character.ids[side].back[0]!;
    character.state.instances[owned] = { ...character.state.instances[owned], owner: board.other };
    put(character.state, character.ids[side].hand[0], side, [owned]);
    const recalled = engine.apply(character.state, board.other, { kind: "pass" }, NO_PROMPTS);
    expect(recalled.state.sides[board.other].hand).toEqual([owned]);
    expect(recalled.state.sides[side].backRank[0]).toBeNull();
    expect(invariantViolations(recalled.state, engine.catalog)).toEqual([]);
  });

  it.each([false, true])("honors the inclusive current variant cap (amplified=%s), deck cost changes, X zero and an unpreventable card", (amplified) => {
    const board = prepared(side, named, [v.vanilla3.id, immune.id, variable.id]);
    const [above, unpreventable, x] = board.selected;
    board.state.instances[x].status.x = 7;
    const chooser = createFoldAdapter(engine);
    board.state.instances[board.source] = { ...board.state.instances[board.source], variant: { amplified } };
    const preparing = applied(chooser.reduce(slice(board.state), { kind: "battleAction", side, action: { kind: "play", card: board.source, from: "hand" } }));
    const prompt = chooser.pending(preparing)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseTargets" });
    if (prompt.kind !== "chooseTargets") throw new Error("expected targets");
    expect(prompt.candidates).toEqual(amplified ? [x, unpreventable, above] : [x, unpreventable]);
    board.state.instances[above] = { ...board.state.instances[above], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 1 } } };
    const selected = resolve(board, above, false);
    expect(selected.state.sides[board.other].hand).toContain(above);
    const immuneBoard = prepared(side, named, [immune.id]);
    expect(resolve(immuneBoard).state.sides[board.other].hand).toContain(immuneBoard.selected[0]);
  });

  it("excludes activated abilities and leaves every unrelated stack item in its original order", () => {
    const board = prepared(side, named, [activator.id, v.vanilla2.id]);
    // Use an existing physical card as the source of an independent synthetic stack ability.
    const id = board.selected[0];
    board.state.stack.push({ kind: "ability", source: id, origin: instanceOrigin(board.state.instances[id]), ability: 0, controller: board.other, choices: { modes: [], targets: [] }, x: null, optionalPaid: [] });
    const before = [...board.state.stack];
    const chosen = board.selected[1];
    const done = resolve(board, chosen);
    expect(done.state.stack).toEqual(before.filter((entry) => entry.kind !== "card" || entry.instance !== chosen));
    expect(done.state.instances[id].zone).toBe("stack");
    // With only an activated item, the required played-card target makes the action illegal.
    const abilityOnly = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [named.id], energy: 8, deck }, [board.other]: { back: [activator.id], deck } });
    const holder = abilityOnly.ids[board.other].back[0]!;
    abilityOnly.state.stack.push({ kind: "ability", source: holder, origin: instanceOrigin(abilityOnly.state.instances[holder]), ability: 0, controller: board.other, choices: { modes: [], targets: [] }, x: null, optionalPaid: [] });
    abilityOnly.state.priority = side;
    expect(engine.legalActions(abilityOnly.state, side)).not.toContainEqual({ kind: "play", card: abilityOnly.ids[side].hand[0], from: "hand" });
  });

  it("does not return an activated source after the chosen card left the stack", () => {
    const board = prepared(side, named, [activator.id]);
    const id = board.selected[0];
    const ctx = new Context(board.state, engine.catalog, NO_PROMPTS);
    enterPlay(ctx, id, board.other, { rank: "back", index: 0 });
    board.state.stack.push({ kind: "ability", source: id, origin: instanceOrigin(board.state.instances[id]), ability: 0, controller: board.other, choices: { modes: [], targets: [] }, x: null, optionalPaid: [] });
    const before = [...board.state.stack];
    const done = resolve(board);
    expect(done.state.instances[id].zone).toBe("play");
    expect(done.state.sides[board.other].backRank[0]).toBe(id);
    expect(done.state.stack).toEqual(before);
    expect(done.events).toContainEqual({ kind: "noLegalTarget", source: board.source });
    expect(done.state.floating).toEqual([]);
  });

  it.each(["gone", "cost", "untargetable"] as const)("rechecks a chosen %s target and changes no card or cost", (invalid) => {
    const board = prepared(side);
    const id = board.selected[0];
    if (invalid === "gone") moveToHand(new Context(board.state, engine.catalog, NO_PROMPTS), id, board.other);
    if (invalid === "cost") board.state.instances[id] = { ...board.state.instances[id], printing: { kind: "card", cardId: v.vanilla5.id } };
    if (invalid === "untargetable") board.state.instances[id] = { ...board.state.instances[id], printing: { kind: "card", cardId: untargetable.id } };
    const done = resolve(board);
    expect(done.events).toContainEqual({ kind: "noLegalTarget", source: board.source });
    expect(done.events.some((e) => e.kind === "returnedToHand" || e.kind === "effectStarted")).toBe(false);
    expect(done.state.floating).toEqual([]);
    expect(done.state.instances[id].zone).toBe(invalid === "gone" ? "hand" : "stack");
  });

  it("keeps a matching physical target valid after departure and reentry", () => {
    const board = prepared(side);
    const id = board.selected[0];
    const ctx = new Context(board.state, engine.catalog, NO_PROMPTS);
    moveToHand(ctx, id, board.other);
    put(board.state, id, board.other);
    const done = resolve(board);
    expect(done.state.sides[board.other].hand).toContain(id);
    expect(done.events).toContainEqual({ kind: "returnedToHand", instance: id, side: board.other });
  });

  it.each(["created", "reclaimed"] as const)("applies %s replacement and starts no arrival cost change", (replacement) => {
    const board = prepared(side);
    const id = board.selected[0];
    board.state.instances[id].status[replacement] = true;
    const done = resolve(board);
    expect(done.state.sides[board.other].hand).not.toContain(id);
    expect(done.state.floating).toEqual([]);
    expect(done.events.some((e) => e.kind === "returnedToHand" || e.kind === "effectStarted")).toBe(false);
    if (replacement === "created") expect(done.state.instances[id]).toBeUndefined();
    else {
      expect(done.state.instances[id].zone).toBe("banished");
      expect(done.state.sides[board.other].banished).toContain(id);
      expect(done.events).toContainEqual({ kind: "banished", instance: id, side: board.other });
    }
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });

  it("reloads and replays a cancellable target choice, refusing stale, foreign and concurrent inputs atomically", () => {
    const board = prepared(side, named, [v.vanilla1.id, v.vanilla2.id]);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const initial = slice(board.state);
    const intent = { kind: "battleAction", side, action: { kind: "play", card: board.source, from: "hand" } } as const;
    const waiting = applied(fold.reduce(initial, intent));
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const reload = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
    const pending = fresh.pending(reload)!.prompt;
    expect(promptFingerprint(pending)).toBe(promptFingerprint(fold.pending(waiting)!.prompt));
    expect(pending.cancellable).toBe(true);
    const hash = stateHash(reload.committed);
    expect(fresh.reduce(reload, { kind: "answer", side: board.other, promptId: pending.id, value: [board.selected[0]] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(reload, { kind: "answer", side, promptId: parsePromptId("999:0:0"), value: [board.selected[0]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reload, { kind: "answer", side, promptId: pending.id, value: [board.source] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reload, intent)).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(stateHash(reload.committed)).toBe(hash);
    const cancelled = applied(fresh.reduce(reload, { kind: "cancel", side, promptId: pending.id }));
    expect(cancelled.committed.sides[side].currentEnergy).toBe(8);
    expect(cancelled.committed.sides[side].hand).toContain(board.source);
    const answer = { kind: "answer", side, promptId: pending.id, value: [board.selected[0]] } as const;
    const a = applied(fresh.reduce(reload, answer));
    const b = applied(fold.reduce(waiting, answer));
    expect(stateHash(a.committed)).toBe(stateHash(b.committed));
    expect(a.committed.sides[side].currentEnergy).toBe(7);
    expect(fresh.pending(a)).toBeNull();
  });

  it("suspends a triggered stack target without undoing the earlier materialization, then reloads to the same return", () => {
    const board = prepared(side, materialized, [v.vanilla1.id, v.vanilla2.id]);
    put(board.state, board.source, side);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const waiting = applied(fold.reduce(slice(board.state), { kind: "battleAction", side: board.other, action: { kind: "pass" } }));
    expect(waiting.committed.instances[board.source].zone).toBe("play");
    const prompt = fold.pending(waiting)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseTargets", cancellable: false, side });
    expect(fold.reduce(waiting, { kind: "cancel", side, promptId: prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const reload = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const intent = { kind: "answer", side, promptId: prompt.id, value: [board.selected[0]] } as const;
    const a = applied(fresh.reduce(reload, intent));
    const b = applied(fold.reduce(waiting, intent));
    expect(stateHash(a.committed)).toBe(stateHash(b.committed));
    expect(a.committed.instances[board.source].zone).toBe("play");
    expect(a.committed.sides[board.other].hand).toContain(board.selected[0]);
  });

  it.each(failures)("rolls back the failing current step after actual relocation and cost mutation ($id)", (card) => {
    const board = prepared(side, card);
    put(board.state, board.source, side, [board.selected[0]]);
    const initial = slice(board.state);
    const before = stateHash(board.state);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const action = { kind: "battleAction", side: board.other, action: { kind: "pass" } } as const;
    const result = fold.reduce(initial, action);
    if (result.kind !== "applied") throw new Error(`expected applied error: ${JSON.stringify(result)}`);
    expect(result.error).toMatchObject({ message: "synthetic failure after stack return" });
    expect(result.published).toEqual([]);
    expect(result.slice.inFlight).toBeNull();
    expect(stateHash(result.slice.committed)).toBe(before);
    expect(result.slice.committed.floating).toEqual([]);
    const reloaded = JSON.parse(JSON.stringify(result.slice)) as BattleSlice;
    const retry = createFoldAdapter(engine).reduce(reloaded, action);
    if (retry.kind !== "applied") throw new Error("expected retry error");
    expect(retry.error).not.toBeNull();
    expect(stateHash(retry.slice.committed)).toBe(before);
  });
});
