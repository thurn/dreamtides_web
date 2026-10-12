/** Live conditional target eligibility and resolution-only conditional choices. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, abandonSelfCost, activated, characterYouControl, controls, enemyCharacter, energy, energyX, event, self, target, targetWhen, upTo, x } from "../../../dsl/builders";
import { onDawn, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { effectiveSpark } from "../../../rules/spark";
import { stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { ZONE } from "../../../testing/zone-cards";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { banish } from "../banish";
import { chooseOne } from "../choose-one";
import { choosePlayer } from "../choose-player";
import { dissolve } from "../dissolve";
import { gainAdditionalSpark, gainSpark } from "../gain-spark";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { sequence } from "../sequence";

const deck = Array.from({ length: 6 }, () => v.vanilla1.id);
const removal = DSL.conditionalRemoval;
const watcher = DSL.conditionalDawn;
const warriors = characterYouControl({ subtype: "Warrior" });
const sharedTarget = target(enemyCharacter());
const sharedMode = chooseOne(gainSpark(sharedTarget, 1), gainPoints(4));
function dawn(index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition {
  return { ...watcher, id: syntheticId(0x55300 + index), abilities: () => [triggered(onDawn(), effect)] };
}
const sequential = dawn(2, sequence(ifThen(controls(warriors, 0), sharedMode), ifThen(controls(warriors, 0), sharedMode), gainPoints(1)));
const invalidSequential = dawn(3, sequence(ifThen(controls(warriors, 0), sharedMode), banish({ kind: "all", selector: enemyCharacter({ costAtMost: 1 }) }), ifThen(controls(warriors, 0), sharedMode), gainPoints(1)));
const emptyTarget = upTo(enemyCharacter(), 1);
const emptySequential = dawn(4, sequence(ifThen(controls(warriors, 0), gainSpark(emptyTarget, 1)), ifThen(controls(warriors, 0), gainSpark(emptyTarget, 2)), gainPoints(1)));
const afterSequence = dawn(5, sequence(banish({ kind: "all", selector: warriors }), ifThen(controls(warriors), gainSpark(target(warriors), 1), gainPoints(3))));
const selectedFailure = dawn(6, sequence(ifThen(controls(warriors, 0), gainSpark(target(characterYouControl({ subtype: "Mage" })), 1)), gainPoints(3)));
const modalBranch = dawn(7, chooseOne(ifThen(controls(warriors), gainSpark(target(warriors), 2), gainPoints(3))));
const nested = dawn(8, ifThen(controls(warriors, 0), choosePlayer(() => sequence(
  ifThen(controls(warriors, 0), sharedMode), ifThen(controls(warriors, 0), sharedMode), gainPoints(1),
))));
const broken = dawn(9, ifThen(controls(warriors, 0), sequence(gainPoints(3), gainAdditionalSpark(self(), 1))));
const activationTarget = targetWhen(controls(warriors, 3), characterYouControl(), characterYouControl({ sparkAtMost: 2 }));
const activation: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x55310), status: "authored",
  abilities: () => [activated([abandonCost()], sequence(gainSpark(activationTarget, 2), gainPoints(1)))] };
const xTarget = targetWhen(controls(warriors), enemyCharacter({ sparkAtMost: x() }), enemyCharacter({ sparkAtMost: 1 }));
const variable: EngineCardDefinition = { ...removal, id: syntheticId(0x55311), costs: [energyX(0)], abilities: () => [event(dissolve(xTarget))] };
const departing: EngineCardDefinition = { ...v.vanilla5, id: syntheticId(0x55312), status: "authored",
  abilities: () => [activated([abandonSelfCost()], gainSpark(targetWhen(controls(warriors, 2),
    enemyCharacter({ sparkAtMost: { value: "sourceSpark" } }), enemyCharacter({ sparkAtMost: { value: "sourceSpark" } })), 2))] };
const reuseCard: EngineCardDefinition = { ...removal, id: syntheticId(0x55313), costs: [energy(0)], abilities: () => [event(sequence(
  sharedMode, choosePlayer(() => ifThen(controls(warriors, 0), sharedMode)), gainPoints(1),
))] };
const emptyCard: EngineCardDefinition = { ...removal, id: syntheticId(0x55314), costs: [energy(0)], abilities: () => [event(sequence(
  gainSpark(emptyTarget, 1), choosePlayer(() => ifThen(controls(warriors, 0), gainSpark(emptyTarget, 2))), gainPoints(1),
))] };
const response: EngineCardDefinition = { ...DSL.returnAnyToHand, id: syntheticId(0x55315), speed: "interrupt" };
const cards = [response, ZONE.echo,sequential, invalidSequential, emptySequential, afterSequence, selectedFailure, modalBranch, nested, broken, activation, variable, departing, reuseCard, emptyCard];
const engine = createEngine(testCatalog([...DSL_CARDS, ...cards]));
const slice = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`unexpected fold result ${JSON.stringify(outcome)}`);
  return outcome;
}
function playBoard(side: Side, card = removal.id, own = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], foes = [v.vanilla5.id, v.vanilla2.id]) {
  return boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [card], back: own, energy: 6, deck }, [opponent(side)]: { back: foes, deck } });
}
function startDawn(card: EngineCardDefinition, side: Side = "player", own: BoardSetup["player"] = {}, foes: BoardSetup["player"] = {}) {
  const board = boardState(engine.catalog, { active: opponent(side), phase: "night", round: 2,
    [side]: { back: [card.id], deck, ...own }, [opponent(side)]: { deck, ...foes } });
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const outcome = applied(fold.reduce(slice(board.state), { kind: "battleAction", side: opponent(side), action: { kind: "pass" } }));
  return { ...board, fold, outcome };
}
function answer(fold: ReturnType<typeof createFoldAdapter>, state: BattleSlice, side: Side, value: Answer) {
  const pending = fold.pending(state);
  if (pending === null) throw new Error("missing public pending choice");
  return applied(fold.reduce(state, { kind: "answer", side, promptId: pending.prompt.id, value }));
}

describe("conditional target choices", () => {
  it.each(["player", "enemy"] as const)("%s excludes a high target while the normal condition is false", (side) => {
    const board = playBoard(side, removal.id, [], [v.vanilla5.id]);
    expect(engine.legalActions(board.state, side)).not.toContainEqual({ kind: "play", card: board.ids[side].hand[0], from: "hand" });
    expect(() => engine.apply(board.state, side, { kind: "play", card: board.ids[side].hand[0], from: "hand" }, NO_PROMPTS)).toThrow();
  });

  it.each(["player", "enemy"] as const)("%s prepares only the selected resolution branch", (side) => {
    const { fold, outcome } = startDawn(watcher, side);
    expect(outcome.slice.committed.sides[side].score).toBe(2);
    expect(outcome.published.filter((e) => e.kind === "noLegalTarget")).toEqual([]);
    expect(fold.pending(outcome.slice)).toBeNull();
  });

  it.each(["player", "enemy"] as const)("%s makes one physical choice at the base and amplified threshold", (side) => {
    for (const amplified of [false, true]) for (const met of [false, true]) {
      const count = (amplified ? 2 : 3) - (met ? 0 : 1);
      const board = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [{ cardId: removal.id, amplified }],
        back: Array.from({ length: count }, () => v.vanilla1.id), energy: 3, deck }, [opponent(side)]: { back: [v.vanilla5.id, v.vanilla2.id], deck } });
      const fold = createFoldAdapter(engine);
      const opened = applied(fold.reduce(slice(board.state), { kind: "battleAction", side, action: { kind: "play", card: board.ids[side].hand[0], from: "hand" } }));
      const pending = fold.pending(opened.slice);
      if (met) {
        expect(pending?.prompt).toMatchObject({ kind: "chooseTargets", candidates: board.ids[opponent(side)].back, min: 1, max: 1 });
        expect(opened.slice.committed.sides[side].currentEnergy).toBe(3);
        const done = answer(fold, opened.slice, side, [board.ids[opponent(side)].back[0]!]);
        expect(fold.pending(done.slice)).toBeNull();
        expect(done.slice.committed.instances[board.ids[opponent(side)].back[0]!].zone).toBe("void");
        expect(done.published.filter((e) => e.kind === "dissolved")).toHaveLength(1);
      } else {
        expect(pending).toBeNull();
        expect(opened.slice.committed.instances[board.ids[opponent(side)].back[0]!].zone).toBe("play");
        expect(opened.slice.committed.instances[board.ids[opponent(side)].back[1]!].zone).toBe("void");
      }
    }
  });

  it.each(["player", "enemy"] as const)("%s keeps shared sibling mode and target bindings through reload", (side) => {
    const { fold, outcome, ids } = startDawn(sequential, side, {}, { back: [v.vanilla1.id, v.vanilla2.id] });
    expect(fold.pending(outcome.slice)?.prompt.kind).toBe("chooseMode");
    const pickedMode = answer(fold, outcome.slice, side, 0);
    expect(fold.pending(pickedMode.slice)?.prompt.kind).toBe("chooseTargets");
    const saved = JSON.parse(JSON.stringify(pickedMode.slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const done = answer(fresh, saved, side, [ids[opponent(side)].back[1]!]);
    expect(fresh.pending(done.slice)).toBeNull();
    expect(effectiveSpark(done.slice.committed, engine.catalog, ids[opponent(side)].back[1]!)).toBe(4);
    expect(effectiveSpark(done.slice.committed, engine.catalog, ids[opponent(side)].back[0]!)).toBe(1);
    expect(done.slice.committed.sides[side].score).toBe(1);
    const direct = answer(fold, pickedMode.slice, side, [ids[opponent(side)].back[1]!]);
    expect(stateHash(done.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(invariantViolations(done.slice.committed, engine.catalog)).toEqual([]);
  });

  it("retains inherited mode zero, empty bindings and invalidated conditional targets", () => {
    for (const card of [sequential, invalidSequential, emptySequential]) {
      const { fold, outcome, ids } = startDawn(card, "player", {}, { back: [v.vanilla1.id, v.vanilla2.id] });
      const mode = card === emptySequential ? outcome : answer(fold, outcome.slice, "player", 0);
      const done = answer(fold, mode.slice, "player", card === emptySequential ? [] : [ids.enemy.back[0]!]);
      expect(fold.pending(done.slice)).toBeNull();
      expect(done.slice.committed.sides.player.score).toBe(1);
      expect(effectiveSpark(done.slice.committed, engine.catalog, ids.enemy.back[1]!)).toBe(2);
      expect(done.published.filter((e) => e.kind === "noLegalTarget")).toHaveLength(card === invalidSequential ? 1 : 0);
    }
    const board = playBoard("player", reuseCard.id, [], [v.vanilla1.id, v.vanilla2.id]);
    const direct = engine.apply(board.state, "player", { kind: "play", card: board.ids.player.hand[0], from: "hand" }, new ScriptedSource([0, [board.ids.enemy.back[0]!], 1]));
    expect(effectiveSpark(direct.state, engine.catalog, board.ids.enemy.back[0]!)).toBe(3);
    expect(direct.state.sides.player.score).toBe(1);
    const empty = playBoard("player", emptyCard.id);
    const untouched = engine.apply(empty.state, "player", { kind: "play", card: empty.ids.player.hand[0], from: "hand" }, new ScriptedSource([[], 0]));
    expect(effectiveSpark(untouched.state, engine.catalog, empty.ids.enemy.back[0]!)).toBe(5);
    expect(untouched.events.filter((e) => e.kind === "noLegalTarget")).toEqual([]);
  });

  it("reads conditions after preceding effects, keeps selected failures local, and permits the conditional mode", () => {
    const after = startDawn(afterSequence, "player", { back: [afterSequence.id, v.vanilla1.id] });
    expect(after.outcome.slice.committed.sides.player.score).toBe(3);
    expect(after.outcome.published.filter((e) => e.kind === "noLegalTarget")).toEqual([]);
    const failed = startDawn(selectedFailure);
    expect(failed.outcome.slice.committed.sides.player.score).toBe(3);
    expect(failed.outcome.published.filter((e) => e.kind === "noLegalTarget")).toHaveLength(1);
    const mode = startDawn(modalBranch);
    expect(mode.outcome.slice.committed.sides.player.score).toBe(3);
    expect(mode.outcome.published.filter((e) => e.kind === "noLegalTarget")).toEqual([]);
    const scope = startDawn(nested, "player", {}, { back: [v.vanilla1.id, v.vanilla2.id] });
    const player = answer(scope.fold, scope.outcome.slice, "player", 1);
    const selected = answer(scope.fold, player.slice, "player", 1);
    expect(selected.slice.committed.sides.player.score).toBe(9);
    expect(scope.fold.pending(selected.slice)).toBeNull();
  });

  it("chooses physical targets before an abandonment cost, excludes that target from payment, and rechecks a changed condition", () => {
    const board = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [activation.id, v.vanilla5.id, v.vanilla1.id], deck }, enemy: { deck } });
    const fold = createFoldAdapter(engine);
    const start = slice(board.state);
    const opened = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "activate", source: board.ids.player.back[0]!, ability: 0 } }));
    expect(fold.pending(opened.slice)?.prompt.kind).toBe("chooseTargets");
    const targeted = answer(fold, opened.slice, "player", [board.ids.player.back[1]!]);
    const cost = fold.pending(targeted.slice)!.prompt;
    expect(cost).toMatchObject({ kind: "chooseCards", purpose: { role: "abandonCost" } });
    if (cost.kind !== "chooseCards") throw new Error("missing cost choice");
    expect(cost.candidates).not.toContain(board.ids.player.back[1]!);
    expect(stateHash(targeted.slice.committed)).toBe(stateHash(board.state));
    const done = answer(fold, targeted.slice, "player", [board.ids.player.back[2]!]);
    expect(done.slice.committed.instances[board.ids.player.back[2]!].zone).toBe("void");
    expect(effectiveSpark(done.slice.committed, engine.catalog, board.ids.player.back[1]!)).toBe(5);
    expect(done.published.filter((e) => e.kind === "noLegalTarget")).toHaveLength(1);
    expect(done.slice.committed.sides.player.score).toBe(1);
  });

  it("retains explicit X and the departed source's spark for conditional selectors", () => {
    const board = playBoard("player", variable.id, [v.vanilla1.id], [v.vanilla2.id, v.vanilla5.id]);
    const result = engine.apply(board.state, "player", { kind: "play", card: board.ids.player.hand[0], from: "hand" }, new ScriptedSource([2]));
    expect(result.state.instances[board.ids.enemy.back[0]!].zone).toBe("void");
    expect(result.state.instances[board.ids.enemy.back[1]!].zone).toBe("play");
    const source = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [departing.id, v.vanilla1.id], deck }, enemy: { back: [v.vanilla3.id], deck } });
    const departed = engine.apply(source.state, "player", { kind: "activate", source: source.ids.player.back[0]!, ability: 0 }, NO_PROMPTS);
    expect(departed.state.instances[source.ids.player.back[0]!].zone).toBe("void");
    expect(effectiveSpark(departed.state, engine.catalog, source.ids.enemy.back[0]!)).toBe(5);
  });

  it.each(["player", "enemy"] as const)("%s revalidates conditional targets after an opponent response without replacing them", (side) => {
    const board = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [removal.id], back: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], energy: 3, deck },
      [opponent(side)]: { hand: [response.id], back: [v.vanilla5.id, v.vanilla2.id], energy: 3, deck } });
    const first = engine.apply(board.state, side, { kind: "play", card: board.ids[side].hand[0], from: "hand" }, new ScriptedSource([[board.ids[opponent(side)].back[0]!]]));
    const changed = engine.apply(first.state, opponent(side), { kind: "play", card: board.ids[opponent(side)].hand[0], from: "hand" }, new ScriptedSource([[board.ids[side].back[0]!]]));
    const resolved = changed;
    expect(resolved.state.instances[board.ids[opponent(side)].back[0]!].zone).toBe("play");
    expect(resolved.events.filter((e) => e.kind === "noLegalTarget")).toEqual([{ kind: "noLegalTarget", source: board.ids[side].hand[0] }]);
    expect(resolved.answers.filter((a) => a.auto !== true)).toHaveLength(1);
  });

  it.each(["player", "enemy"] as const)("%s copies a conditional single target and chooses one new target", (side) => {
    const board = playBoard(side, removal.id, [ZONE.echo.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id]);
    const selected = board.ids[opponent(side)].back;
    const answers = new ScriptedSource([[selected[0]!], [selected[1]!]]);
    const result = engine.apply(board.state, side, { kind: "play", card: board.ids[side].hand[0], from: "hand" }, answers);
    answers.assertExhausted();
    expect(result.events.flatMap((e) => e.kind === "dissolved" ? [e.instance] : [])).toEqual([selected[1]!, selected[0]!]);
    expect(result.events.filter((e) => e.kind === "cardCopied")).toHaveLength(1);
    expect(result.events.filter((e) => e.kind === "cardPlayed")).toHaveLength(1);
    expect(result.answers.filter((a) => a.auto !== true)).toHaveLength(2);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each([false, true])("the selected Dawn target gains its variant amount (amplified=%s)", (amplified) => {
    const board = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [{ cardId: watcher.id, amplified }], back: [v.vanilla1.id, v.vanilla2.id], deck }, enemy: { deck } });
    const fold = createFoldAdapter(engine);
    let outcome = applied(fold.reduce(slice(board.state), { kind: "battleAction", side: "player", action: { kind: "play", card: board.ids.player.hand[0], from: "hand" } }));
    for (const side of ["player", "enemy", "player", "enemy", "player", "enemy"] as const) outcome = applied(fold.reduce(outcome.slice, { kind: "battleAction", side, action: { kind: "pass" } }));
    const ids = board.ids;
    expect(fold.pending(outcome.slice)?.prompt).toMatchObject({ kind: "chooseTargets", candidates: ids.player.back });
    const done = answer(fold, outcome.slice, "player", [ids.player.back[0]!]);
    expect(effectiveSpark(done.slice.committed, engine.catalog, ids.player.back[0]!)).toBe(amplified ? 3 : 2);
    expect(done.published.filter((e) => e.kind === "noLegalTarget")).toEqual([]);
    expect(done.slice.committed.sides.player.score).toBe(0);
  });

  it("cancels pre-cost choices and rejects stale, foreign, malformed and duplicate competing answers", () => {
    const board = playBoard("player");
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(board.state), { kind: "battleAction", side: "player", action: { kind: "play", card: board.ids.player.hand[0], from: "hand" } }));
    const prompt = fold.pending(opened.slice)!.prompt;
    const intent = { kind: "answer" as const, side: "player" as const, promptId: prompt.id, value: [board.ids.enemy.back[0]!] };
    expect(fold.reduce(opened.slice, { ...intent, side: "enemy" }).kind).toBe("bounced");
    expect(fold.reduce(opened.slice, { ...intent, value: [board.ids.player.back[0]!] }).kind).toBe("bounced");
    const cancelled = applied(fold.reduce(opened.slice, { kind: "cancel", side: "player", promptId: prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(board.state));
    expect(fold.reduce(cancelled.slice, intent).kind).toBe("bounced");
    const done = applied(fold.reduce(opened.slice, intent));
    expect(fold.reduce(done.slice, { ...intent, value: [board.ids.enemy.back[1]!] }).kind).toBe("bounced");
    expect(done.published.filter((e) => e.kind === "cardPlayed")).toHaveLength(1);
  });

  it("rolls back a selected branch error and its partial state writes, keeping the committed trigger queued", () => {
    const board = boardState(engine.catalog, { active: "enemy", phase: "night", player: { back: [broken.id], deck }, enemy: { deck } });
    const before = stateHash(board.state);
    const result = createFoldAdapter(engine).reduce(slice(board.state), { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (result.kind !== "applied") throw new Error("missing failed trigger outcome");
    expect(result.error).not.toBeNull();
    expect(result.slice.committed.sides.player.score).toBe(0);
    expect(result.slice.committed.triggerQueue).toHaveLength(1);
    expect(result.published.filter((e) => e.kind === "pointsScored")).toEqual([]);
    expect(stateHash(board.state)).toBe(before);
  });
});
