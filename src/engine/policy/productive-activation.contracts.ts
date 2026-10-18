/** The frozen Phase 5 Greedy (`greedy@5`) leaves renewable spark pumps while retaining finite useful activations. */
import { describe, expect, it } from "vitest";
import { parseAvatarId } from "../../types/identifiers";
import { AI } from "../../content/ai";
import { type EngineCardDefinition, type EngineFigmentDefinition } from "../catalog";
import { abandonCost, abandonSelfCost, activated, characterYouControl, enemyCharacter, event, exhaustSelf, self, stackItem, target } from "../dsl/builders";
import { atEndOfTurn, onDusk, triggered, whenDissolved } from "../dsl/triggers";
import { dissolve, draw, gainEnergy, gainPoints, gainSpark, materializeFigments, move, prevent, sequence } from "../effects/primitives";
import { createEngine, type Engine } from "../engine";
import type { Action } from "../rules/actions";
import { cloneState } from "../state/clone";
import { stateHash } from "../state/hash";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, battleSeed, opponent, parseFigmentId, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { InlineSource, NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { boardState } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { runPolicy, type PolicyRequest } from "./decide";
import { evaluatePosition } from "./reference/greedy-5";
import { deck, entries } from "./policy.fixtures";

const cap = AI.references["greedy@5"].sparkValueCap;
const energyCap = AI.references["greedy@5"].energyValueCap;
const figment: EngineFigmentDefinition = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000007450"), subtype: SYNTHETIC.vanilla1.subtype, spark: 1, status: "vanilla", abilities: () => [] };
const pump: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x7451), spark: 0, status: "authored", abilities: () => [activated([abandonCost({ another: true })], gainSpark(self(), 2))] };
function fixture(side: Side, adverse = false, energy = false, boundary = false) {
  const subject = boundary ? { ...pump, spark: cap - 2 } : pump;
  const renewer: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x7452), status: "authored", abilities: () => [triggered(whenDissolved(characterYouControl()), materializeFigments(figment.id)), ...(energy ? [triggered(whenDissolved(characterYouControl()), gainEnergy(1))] : []), ...(adverse ? [triggered(onDusk(), gainPoints(100, "opponent"))] : [])] };
  const engine = createEngine(testCatalog([subject, renewer], {}, [figment]));
  const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100, [side]: { energy: boundary && energy ? energyCap - 1 : 0, back: [subject.id, renewer.id], figments: [{ slot: { rank: "back", index: 2 }, printing: { kind: "figment", figment: figment.id, spark: 1 } }], deck }, [opponent(side)]: { deck } });
  const decklists = { [side]: entries([pump.id, renewer.id, ...deck]), [opponent(side)]: entries(deck) } as Record<Side, ReturnType<typeof entries>>;
  return { engine, initial: state, id: ids[side].back[0]!, decklists };
}
function request(engine: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]): PolicyRequest {
  const decision = engine.decision(state);
  if (decision?.side !== side) throw new Error("wrong actor");
  return { policy: "greedy@5", side, key: `${state.version}:0:decision`, view: engine.view(state, side), decision: { kind: "topLevel", decision, legal: engine.legalActions(state, side) }, decklists, seed: battleSeed("productive-activation"), budget: { iterations: 256 } };
}
function deterministic(engine: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]) {
  const input = request(engine, state, side, decklists), before = JSON.stringify({ state, input });
  const chosen = runPolicy(engine, input);
  expect(runPolicy(createEngine(engine.catalog), structuredClone(input))).toEqual(chosen);
  expect(JSON.stringify({ state, input })).toBe(before);
  expect(chosen.trace.used.iterations).toBeLessThanOrEqual(input.budget.iterations);
  if (chosen.choice.kind !== "action") throw new Error("not an action");
  expect(engine.legalActions(state, side)).toContainEqual(chosen.choice.action);
  return chosen.choice.action;
}

function movementFixture(side: Side, useful = false, response = false) {
  const mover: EngineCardDefinition = {
    ...SYNTHETIC.vanilla0, id: syntheticId(0x7711), spark: 0, status: "authored",
    abilities: () => [
      activated([], move(self()), { speed: "fast" }),
      triggered(atEndOfTurn("you"), useful
        ? gainPoints({ value: "count", of: { controller: "you", rank: "front" } })
        : gainPoints(1, "opponent")),
    ],
  };
  const filler: EngineCardDefinition = { ...SYNTHETIC.vanilla0, id: syntheticId(0x7712), spark: 0 };
  const interrupt: EngineCardDefinition = { ...SYNTHETIC.vanilla0, id: syntheticId(0x7713), spark: 0, status: "authored", abilities: () => [activated([exhaustSelf()], gainEnergy(1), { speed: "interrupt" })] };
  const engine = createEngine(testCatalog([mover, filler, interrupt])), other = opponent(side);
  const front = useful ? [null, ...Array.from({ length: FRONT_RANK_SIZE - 1 }, () => filler.id)] : [];
  const back = useful ? [mover.id, ...Array.from({ length: BACK_RANK_SIZE - 1 }, () => filler.id)] : [mover.id];
  const { state, ids } = boardState(engine.catalog, { active: side, phase: "night", scoreToWin: useful ? FRONT_RANK_SIZE : 100, [side]: { front, back, deck }, [other]: { back: response ? [interrupt.id] : [], deck } });
  const id = ids[side].back[0]!;
  state.instances[id].status.exhausted = true;
  expect(invariantViolations(state, engine.catalog)).toEqual([]);
  const decklists = { [side]: entries([...front.filter(card => card !== null), ...back, ...deck]), [other]: entries([...(response ? [interrupt.id] : []), ...deck]) } as Record<Side, ReturnType<typeof entries>>;
  return { engine, state, id, decklists };
}
function windowRequest(engine: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]): PolicyRequest {
  return { ...request(engine, state, side, decklists), budget: { iterations: 64 } };
}
function windowAction(engine: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]) {
  const input = windowRequest(engine, state, side, decklists), before = JSON.stringify({ state, input });
  const result = runPolicy(engine, input);
  expect(runPolicy(createEngine(engine.catalog), structuredClone(input))).toEqual(result);
  expect(JSON.stringify({ state, input })).toBe(before);
  expect(result.trace.used.iterations).toBeLessThanOrEqual(input.budget.iterations);
  if (result.choice.kind !== "action") throw new Error("not an action");
  expect(engine.legalActions(state, side)).toContainEqual(result.choice.action);
  return result.choice.action;
}
function movementAnswers(engine: Engine, decklists: PolicyRequest["decklists"]) {
  const answer = (prompt: Parameters<InlineSource["answer"]>[0], work: BattleState) => {
    const state = cloneState(work), side = prompt.side;
    const result = runPolicy(engine, { policy: "greedy@5", side, key: `${state.version}:0:decision`, view: engine.view(state, side), decision: { kind: "prompt", prompt }, decklists, seed: battleSeed("movement-answer"), budget: { iterations: 64 } });
    if (result.choice.kind !== "answer") throw new Error("not an answer");
    return result.choice.value;
  };
  return new InlineSource({ player: answer, enemy: answer });
}

describe("main activation progress", () => {
  for (const side of ["player", "enemy"] as const) {
    it(`leaves ${side}'s repeatable zero-utility movement through the public runner`, () => {
      const { engine, state, id, decklists } = movementFixture(side), source = movementAnswers(engine, decklists);
      const records: { side: Side; action: Action; answers: readonly RecordedAnswer[] }[] = [];
      let current = state;
      const apply = (action: Action) => { const next = engine.apply(current, side, action, source); records.push({ side, action, answers: next.answers }); current = next.state; };
      const window = (value: BattleState) => [value.turn.phase, value.turn.active, value.turn.turnNumber];
      const initialWindow = window(state), initialUtility = evaluatePosition(engine.view(state, side), side);
      // Ordinary legal movement can renew indefinitely without improving this position.
      for (let count = 0; count < 2; count++) {
        const action = { kind: "activate" as const, source: id, ability: 0 };
        expect(engine.legalActions(current, side)).toContainEqual(action);
        apply(action);
        expect(evaluatePosition(engine.view(current, side), side)).toBe(initialUtility);
        expect(window(current)).toEqual(initialWindow);
      }
      expect(current.sides[side].backRank).toEqual(state.sides[side].backRank);
      const passed = engine.apply(current, side, { kind: "pass" }, source).state;
      expect(window(passed)).not.toEqual(initialWindow);
      expect(evaluatePosition(engine.view(passed, side), side)).toBeLessThan(initialUtility);
      for (let count = 0; count < 3 && JSON.stringify(window(current)) === JSON.stringify(initialWindow); count++) {
        apply(windowAction(engine, current, side, decklists));
      }
      expect(window(current)).not.toEqual(initialWindow);
      let replay = cloneState(state);
      for (const record of records) { const answers = new ScriptedSource(record.answers.filter(answer => !answer.auto).map(answer => answer.value)); replay = engine.apply(replay, record.side, record.action, answers).state; answers.assertExhausted(); }
      expect(stateHash(replay)).toBe(stateHash(current));
    });

    it(`keeps ${side}'s renewable point gains under an adverse boundary without source spark growth`, () => {
      const card: EngineCardDefinition = { ...SYNTHETIC.vanilla0, id: syntheticId(0x7714), spark: 0, status: "authored", abilities: () => [activated([abandonCost({ another: true })], gainPoints(1), { speed: "fast" }), triggered(atEndOfTurn("you"), gainPoints(3, "opponent"))] };
      const renewer: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x7715), status: "authored", abilities: () => [triggered(whenDissolved(characterYouControl()), materializeFigments(figment.id))] };
      const engine = createEngine(testCatalog([card, renewer], {}, [figment])), other = opponent(side);
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "night", scoreToWin: 3, [side]: { back: [card.id, renewer.id], figments: [{ slot: { rank: "back", index: 2 }, printing: { kind: "figment", figment: figment.id, spark: 1 } }], deck }, [other]: { deck } });
      expect(invariantViolations(state, engine.catalog)).toEqual([]);
      const decklists = { [side]: entries([card.id, renewer.id, ...deck]), [other]: entries(deck) } as Record<Side, ReturnType<typeof entries>>;
      let current = state;
      for (let count = 0; count < 3; count++) {
        const action = windowAction(engine, current, side, decklists);
        expect(action).toEqual({ kind: "activate", source: ids[side].back[0], ability: 0 });
        const previous = evaluatePosition(engine.view(current, side), side);
        current = engine.apply(current, side, action, movementAnswers(engine, decklists)).state;
        expect(evaluatePosition(engine.view(current, side), side)).toBeGreaterThan(previous);
        expect(engine.view(current, side).instances[ids[side].back[0]!]?.characteristics.spark).toBe(0);
      }
      expect(current.result).toMatchObject({ kind: "victory", winner: side });
    });

    it(`keeps ${side}'s productive activation settling on the final allowed response pass`, () => {
      const card: EngineCardDefinition = { ...SYNTHETIC.vanilla0, id: syntheticId(0x7716), status: "authored", abilities: () => [activated([], gainEnergy(1), { speed: "fast" })] };
      const engine = createEngine(testCatalog([card])), other = opponent(side);
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "night", [side]: { back: [card.id], deck }, [other]: { deck } });
      expect(invariantViolations(state, engine.catalog)).toEqual([]);
      const decklists = { [side]: entries([card.id, ...deck]), [other]: entries(deck) } as Record<Side, ReturnType<typeof entries>>;
      const passes = new WeakMap<BattleState, number>();
      let mostPasses = 0;
      const delayed: Engine = {
        ...engine,
        decision(current) {
          const count = passes.get(current);
          return count !== undefined && count < AI.references["greedy@5"].stackPassLimit ? { kind: "respond", side } : engine.decision(current);
        },
        apply(current, actor, action, source, observe) {
          const count = passes.get(current);
          if (action.kind === "pass" && count !== undefined) {
            passes.set(current, count + 1);
            mostPasses = Math.max(mostPasses, count + 1);
            return { state: current, events: [], answers: [], bounded: [] };
          }
          const applied = engine.apply(current, actor, action, source, observe);
          if (action.kind === "activate") passes.set(applied.state, 0);
          return applied;
        },
      };
      const input = windowRequest(engine, state, side, decklists), before = JSON.stringify({ state, input });
      expect(runPolicy(delayed, input).choice).toEqual({ kind: "action", action: { kind: "activate", source: ids[side].back[0], ability: 0 } });
      expect(mostPasses).toBe(AI.references["greedy@5"].stackPassLimit);
      expect(JSON.stringify({ state, input })).toBe(before);
    });

    it(`keeps ${side}'s immediately neutral activation that improves its positional boundary`, () => {
      const { engine, state, id, decklists } = movementFixture(side, true), source = movementAnswers(engine, decklists);
      expect(engine.apply(state, side, { kind: "pass" }, source).state.result).toBeNull();
      const action = windowAction(engine, state, side, decklists);
      expect(action).toEqual({ kind: "activate", source: id, ability: 0 });
      const moved = engine.apply(state, side, action, source).state;
      expect(evaluatePosition(engine.view(moved, side), side)).toBe(evaluatePosition(engine.view(state, side), side));
      expect(moved.sides[side].frontRank[0]).toBe(id);
      const next = windowAction(engine, moved, side, decklists);
      expect(next).toEqual({ kind: "pass" });
      expect(engine.apply(moved, side, next, source).state.result).toMatchObject({ kind: "victory", winner: side });
    });

    for (const stage of ["response", "boundary"] as const) {
      it.each(["error", "non-settling"] as const)(`rejects ${side}'s %s activation ${stage} continuation`, failure => {
        const { engine, state, decklists } = movementFixture(side, true, stage === "response");
        const stuck = new WeakSet<BattleState>();
        const failing: Engine = {
          ...engine,
          decision(current) { return stuck.has(current) ? { kind: "respond", side } : engine.decision(current); },
          apply(current, actor, action, source, observe) {
            if (current.version > state.version && current.turn.phase === "night" && action.kind === "pass" && (stage === "response" ? current.stack.length > 0 : current.stack.length === 0)) {
              if (failure === "error") throw new Error("activation continuation failure");
              stuck.add(current);
              return { state: current, events: [], answers: [], bounded: [] };
            }
            return engine.apply(current, actor, action, source, observe);
          },
        };
        const input = windowRequest(engine, state, side, decklists), before = JSON.stringify({ state, input });
        const result = runPolicy(failing, input);
        expect(result.choice).toEqual({ kind: "action", action: { kind: "pass" } });
        expect(result.trace.candidates.some(candidate => candidate.choice.kind === "action" && candidate.choice.action.kind === "activate")).toBe(false);
        expect(JSON.stringify({ state, input })).toBe(before);
        expect(engine.apply(state, side, { kind: "pass" }, movementAnswers(engine, decklists)).state.turn).not.toEqual(state.turn);
      });
    }
  }
});

describe("productive activation selection", () => {
  for (const side of ["player", "enemy"] as const) {
    it.each([{ adverse: false, energy: false }, { adverse: true, energy: false }, { adverse: false, energy: true }, { adverse: true, energy: true }])(`leaves ${side}'s renewable pump (adverse: $adverse, energy: $energy)`, ({ adverse, energy }) => {
      // Each actor keeps one unsaturated combined walk. Other branches begin
      // one actual spark/energy gain below their catalog saturation boundary.
      const boundary = !(adverse && energy);
      const { engine, initial, id, decklists } = fixture(side, adverse, energy, boundary);
      expect(invariantViolations(initial, engine.catalog)).toEqual([]);
      expect(engine.view(initial, side).instances[id]?.characteristics.spark).toBe(boundary ? cap - 2 : 0);
      expect(initial.sides[side].currentEnergy).toBe(boundary && energy ? energyCap - 1 : 0);
      expect(initial.sides[side].maxEnergy).toBe(initial.sides[side].currentEnergy);
      const records: { side: Side; action: Action; answers: readonly RecordedAnswer[] }[] = [];
      const source = new InlineSource(Object.fromEntries((["player", "enemy"] as const).map(actor => [actor, (prompt: Parameters<InlineSource["answer"]>[0], work: BattleState) => {
        const state = cloneState(work), base: PolicyRequest = { policy: "greedy@5" as const, side: actor, key: `${state.version}:0:decision`, view: engine.view(state, actor), decision: { kind: "prompt" as const, prompt }, decklists, seed: battleSeed("productive-answer"), budget: { iterations: 64 } };
        const before = JSON.stringify({ state, base }), result = runPolicy(engine, base);
        expect(JSON.stringify({ state, base })).toBe(before);
        expect(result.trace.used.iterations).toBeLessThanOrEqual(base.budget.iterations);
        const choice = result.choice;
        if (choice.kind !== "answer") throw new Error("not an answer");
        return choice.value;
      }])) as ConstructorParameters<typeof InlineSource>[0]);
      let current = initial, activations = 0, left = false;
      let exitAction: Action | undefined;
      const apply = (actor: Side, action: Action) => { const next = engine.apply(current, actor, action, source); records.push({ side: actor, action, answers: next.answers }); current = next.state; };
      for (let count = 0; count < cap + energyCap + 4; count++) {
        const input = request(engine, current, side, decklists), before = JSON.stringify({ current, input });
        const chosen = runPolicy(engine, input);
        if (chosen.choice.kind !== "action") throw new Error("not an action");
        const action = chosen.choice.action;
        const pumping = action.kind === "activate" && action.source === id;
        const saturated = (engine.view(current, side).instances[id]?.characteristics.spark ?? 0) >= cap &&
          (!energy || current.sides[side].currentEnergy >= energyCap);
        if (saturated) expect(pumping).toBe(false);
        // Fresh-engine determinism is checked at both ends of every walk.
        if (count === 0 || !pumping) expect(runPolicy(createEngine(engine.catalog), structuredClone(input))).toEqual(chosen);
        expect(JSON.stringify({ current, input })).toBe(before);
        expect(chosen.trace.used.iterations).toBeLessThanOrEqual(input.budget.iterations);
        expect(engine.legalActions(current, side)).toContainEqual(action);
        if (!pumping) { exitAction = action; left = true; break; }
        const previous = Object.values(current.instances).find(card => card.printing.kind === "figment")?.id;
        const previousEnergy = current.sides[side].currentEnergy;
        apply(side, action);
        while (engine.decision(current)?.kind === "respond") apply(engine.decision(current)!.side, { kind: "pass" });
        expect(invariantViolations(current, engine.catalog)).toEqual([]);
        expect(current.instances[id].status.gainedSpark).toBeGreaterThan(0);
        if (energy) expect(current.sides[side].currentEnergy).toBeGreaterThan(previousEnergy);
        expect(Object.values(current.instances).some(card => card.printing.kind === "figment" && card.id !== previous)).toBe(true);
        activations++;
      }
      expect(activations).toBeGreaterThan(0);
      expect(left).toBe(true);
      expect(engine.view(current, side).instances[id]?.characteristics.spark).toBeGreaterThanOrEqual(cap);
      if (energy) expect(current.sides[side].currentEnergy).toBeGreaterThanOrEqual(energyCap);
      expect(engine.legalActions(current, side)).toContainEqual({ kind: "activate", source: id, ability: 0 });
      if (adverse) {
        const passed = engine.apply(current, side, { kind: "pass" }, NO_PROMPTS).state;
        expect(passed.sides[opponent(side)].score).toBeGreaterThan(current.sides[opponent(side)].score);
      }
      if (exitAction === undefined) throw new Error("no exit action");
      const beforeExit = current;
      apply(side, exitAction);
      expect(current.turn).not.toEqual(beforeExit.turn);
      expect(invariantViolations(current, engine.catalog)).toEqual([]);
      let replay = cloneState(initial);
      for (const record of records) { const answers = new ScriptedSource(record.answers.filter(answer => !answer.auto).map(answer => answer.value)); replay = engine.apply(replay, record.side, record.action, answers).state; answers.assertExhausted(); }
      expect(stateHash(replay)).toBe(stateHash(current));
    });

    it.each(["spark", "energy", "draw", "points"] as const)(`keeps ${side}'s finite useful %s activation`, benefit => {
      const effect = benefit === "spark" ? gainSpark(self(), 1) : sequence(gainSpark(self(), 1), benefit === "energy" ? gainEnergy(1) : benefit === "draw" ? draw(1) : gainPoints(1));
      const card: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x7453), spark: benefit === "spark" ? 0 : cap, status: "authored", abilities: () => [activated([exhaustSelf()], effect)] };
      const engine = createEngine(testCatalog([card]));
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id], deck }, [opponent(side)]: { deck } });
      const decklists = { [side]: entries([card.id, ...deck]), [opponent(side)]: entries(deck) } as Record<Side, ReturnType<typeof entries>>;
      const action = deterministic(engine, state, side, decklists);
      expect(action).toEqual({ kind: "activate", source: ids[side].back[0], ability: 0 });
      let after = engine.apply(state, side, action, NO_PROMPTS).state;
      while (engine.decision(after)?.kind === "respond") after = engine.apply(after, engine.decision(after)!.side, { kind: "pass" }, NO_PROMPTS).state;
      expect(after.instances[ids[side].back[0]!].status.exhausted).toBe(true);
      expect(after.instances[ids[side].back[0]!].status.gainedSpark).toBe(1);
      if (benefit === "energy") expect(after.sides[side].currentEnergy).toBeGreaterThan(state.sides[side].currentEnergy);
      if (benefit === "draw") expect(after.sides[side].hand).toHaveLength(1);
      if (benefit === "points") expect(after.sides[side].score).toBeGreaterThan(state.sides[side].score);
    });

    it(`keeps ${side}'s finite source-departure and emblem activations`, () => {
      const departing: EngineCardDefinition = { ...SYNTHETIC.vanilla0, id: syntheticId(0x7456), status: "authored", abilities: () => [activated([abandonSelfCost()], gainEnergy(1))] };
      const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000007457"), status: "authored" as const, abilities: () => [activated([exhaustSelf()], gainEnergy(1))] };
      const engine = createEngine(testCatalog([departing], { avatars: [avatar] }));
      for (const emblem of [false, true]) {
        const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: emblem ? [] : [departing.id], ...(emblem ? { avatar: avatar.id } : {}), deck }, [opponent(side)]: { deck } });
        const decklists = { [side]: entries([...(emblem ? [] : [departing.id]), ...deck]), [opponent(side)]: entries(deck) } as Record<Side, ReturnType<typeof entries>>;
        const action = deterministic(engine, state, side, decklists);
        expect(action).toEqual({ kind: "activate", source: emblem ? { kind: "avatar", side } : ids[side].back[0], ability: 0 });
        let after = engine.apply(state, side, action, NO_PROMPTS).state;
        while (engine.decision(after)?.kind === "respond") after = engine.apply(after, engine.decision(after)!.side, { kind: "pass" }, NO_PROMPTS).state;
        expect(after.sides[side].currentEnergy).toBe(1);
        if (emblem) expect(after.sides[side].avatar?.exhausted).toBe(true);
        else expect(after.instances[ids[side].back[0]!].zone).toBe("void");
      }
    });

    it(`keeps ${side}'s finite defensive spark activation against pending removal`, () => {
      const counter: EngineCardDefinition = { ...pump, id: syntheticId(0x7491), spark: 2, abilities: () => [activated([abandonCost({ another: true })], gainSpark(self(), 1), { speed: "interrupt" })] };
      const threat: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(0x7492), status: "authored", abilities: () => [event(dissolve(target(enemyCharacter({ sparkAtMost: 2 }))))] };
      const engine = createEngine(testCatalog([counter, threat], {}, [figment])), other = opponent(side);
      const { state, ids } = boardState(engine.catalog, { active: other, phase: "day", [side]: { back: [counter.id], figments: [{ slot: { rank: "back", index: 1 }, printing: { kind: "figment", figment: figment.id, spark: 1 } }], deck }, [other]: { hand: [threat.id], deck } });
      const ownDeck = entries([counter.id, ...deck]), otherDeck = entries([threat.id, ...deck]);
      const decklists = side === "player" ? { player: ownDeck, enemy: otherDeck } : { player: otherDeck, enemy: ownDeck };
      const sourceId = ids[side].back[0]!, figmentId = ids[side].back[1]!;
      const records: { side: Side; action: Action; answers: readonly RecordedAnswer[] }[] = [];
      const source = new InlineSource({ player: () => [sourceId], enemy: () => [sourceId] });
      let current = state;
      const apply = (actor: Side, action: Action) => { const next = engine.apply(current, actor, action, source); records.push({ side: actor, action, answers: next.answers }); current = next.state; };
      apply(other, { kind: "play", card: ids[other].hand[0], from: "hand" });
      const pending = current;
      let passed = engine.apply(pending, side, { kind: "pass" }, NO_PROMPTS).state;
      while (engine.decision(passed)?.kind === "respond") passed = engine.apply(passed, engine.decision(passed)!.side, { kind: "pass" }, NO_PROMPTS).state;
      expect(passed.instances[sourceId].zone).toBe("void");
      expect(passed.instances[figmentId].zone).toBe("play");
      const action = deterministic(engine, pending, side, decklists);
      expect(action).toEqual({ kind: "activate", source: sourceId, ability: 0 });
      apply(side, action);
      while (engine.decision(current)?.kind === "respond") apply(engine.decision(current)!.side, { kind: "pass" });
      expect(current.instances[figmentId]).toBeUndefined();
      expect(current.instances[sourceId].zone).toBe("play");
      expect(engine.view(current, side).instances[sourceId]?.characteristics.spark).toBe(3);
      expect(current.turn.phase).toBe(pending.turn.phase);
      expect(records.some(record => record.answers.some(answer => !answer.auto))).toBe(true);
      let replay = cloneState(state);
      for (const record of records) { const answers = new ScriptedSource(record.answers.filter(answer => !answer.auto).map(answer => answer.value)); replay = engine.apply(replay, record.side, record.action, answers).state; answers.assertExhausted(); }
      expect(stateHash(replay)).toBe(stateHash(current));
    });

    it(`keeps ${side}'s finite neutral counter against a damaging response horizon`, () => {
      const counter: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x7454), spark: cap, status: "authored", abilities: () => [activated([exhaustSelf()], prevent(stackItem({ controller: "opponent" })), { speed: "interrupt" })] };
      const threat: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(0x7455), status: "authored", abilities: () => [event(gainPoints(1))] };
      const engine = createEngine(testCatalog([counter, threat])), other = opponent(side);
      const { state, ids } = boardState(engine.catalog, { active: other, phase: "day", [side]: { back: [counter.id], deck }, [other]: { hand: [threat.id], deck } });
      const pending = engine.apply(state, other, { kind: "play", card: ids[other].hand[0], from: "hand" }, NO_PROMPTS).state;
      const decklists = { [side]: entries([counter.id, ...deck]), [other]: entries([threat.id, ...deck]) } as Record<Side, ReturnType<typeof entries>>;
      const action = deterministic(engine, pending, side, decklists);
      expect(action).toEqual({ kind: "activate", source: ids[side].back[0], ability: 0 });
      let after = engine.apply(pending, side, action, NO_PROMPTS).state;
      while (engine.decision(after)?.kind === "respond") after = engine.apply(after, engine.decision(after)!.side, { kind: "pass" }, NO_PROMPTS).state;
      expect(after.instances[ids[other].hand[0]].zone).toBe("void");
      expect(after.sides[other].score).toBe(0);
    });
  }
});
