/** Native paid play during resolution: stack, response, transaction and cold replay contracts. */
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../../../catalog";
import { additionalCost, choiceCost, discardCost, energy, energyX, event, keyword, optionalCost, reclaim, self, staticAbility } from "../../../dsl/builders";
import { triggered, whenMaterialize, whenPlayFromVoid } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { parsePromptId, parseDreamwellCardId } from "../../../../types/identifiers";
import { opponent, SIDES, type Side } from "../../../state/ids";
import { stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import { Context } from "../../../steps/context";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { moveToStack } from "../../../rules/zones";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, testCatalog, SYNTHETIC, SYNTHETIC_CARDS } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { costModifier } from "../cost-modifier";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { playImmediately } from "../play-immediately";
import { playFromZone } from "../play-from-zone";
import { cannotPlay } from "../play-restriction";
import { prevent } from "../prevent";
import { sequence } from "../sequence";
import { gainAdditionalSpark } from "../gain-spark";

function card(index: number, type: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"] = () => []): EngineCardDefinition {
  return { id: syntheticId(0x56800 + index), cardType: type, costs: [energy(cost)], spark: type === "character" ? 2 : null,
    subtype: type === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities };
}
const immediate = playImmediately("void", { costAtMost: 2 });
const D = {
  source: card(0, "event", 0, () => [event(sequence(immediate, gainPoints(1)))]),
  character: card(1, "character", 2), awake: card(2, "character", 2, () => [keyword("awakened")]),
  expensive: card(3, "character", 3), event: card(4, "event", 1), reclaim: card(5, "character", 2, () => [reclaim(energy(0))]),
  extra: card(6, "character", 1, () => [additionalCost(discardCost(3))]),
  variable: { ...card(7, "character", 1, () => [additionalCost(choiceCost([discardCost(1)], [energy(2)]), optionalCost(energy(1)))]), costs: [energy(1), energyX()] },
  watch: card(8, "character", 0, () => [triggered(whenPlayFromVoid(), gainEnergy(1)), triggered(whenMaterialize(), gainPoints(5))]),
  fail: card(9, "event", 0, () => [event(sequence(immediate, gainAdditionalSpark(self(), 1)))]),
  interrupt: { ...card(10, "event", 0, () => [event(prevent({ kind: "stackItem", controller: "opponent" }))]), speed: "interrupt" as const },
  ban: card(11, "character", 0, () => [staticAbility(cannotPlay("you", { cardType: "character" }))]),
  tax: card(13, "character", 0, () => [staticAbility(costModifier("you", { cardType: "character" }, 1))]),
  permission: card(12, "character", 0, () => [staticAbility(playFromZone("void", { cardType: "character" }, { oncePerTurn: true }))]),
};
const E = createEngine(testCatalog(Object.values(D)));
const filler = [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id];
function setup(side: Side, options: { readonly void?: readonly EngineCardDefinition[]; readonly energy?: number; readonly source?: EngineCardDefinition; readonly back?: readonly EngineCardDefinition[]; readonly hand?: readonly EngineCardDefinition[] } = {}) {
  return boardState(E.catalog, { active: side, phase: "day",
    [side]: { hand: [options.source?.id ?? D.source.id, ...(options.hand ?? []).map((c) => c.id)], void: (options.void ?? [D.character]).map((c) => c.id),
      energy: options.energy ?? 4, back: (options.back ?? []).map((c) => c.id), deck: filler },
    [opponent(side)]: { hand: [D.interrupt.id], void: [D.character.id], deck: filler } });
}
function apply(state: BattleState, side: Side, action: Parameters<typeof E.apply>[2], answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const out = E.apply(state, side, action, answers.length === 0 ? NO_PROMPTS : source);
  source.assertExhausted(); expect(invariantViolations(out.state, E.catalog)).toEqual([]); return out;
}
function open(side: Side, options: Parameters<typeof setup>[1] = {}) {
  const placed = setup(side, options);
  return { ...placed, state: apply(placed.state, side, { kind: "play", card: placed.ids[side].hand[0], from: "hand" }).state };
}
function applied(out: IntentOutcome) { if (out.kind !== "applied") throw new Error(`Bounced ${out.reason}`); return out; }
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("playImmediately", () => {
  it.each(SIDES)("plays one owned physical copy for %s and finishes the effect and played triggers before opponent priority", (side) => {
    const { state, ids } = open(side, { void: [D.character, D.character, D.expensive, D.event], back: [D.watch] });
    const chosen = ids[side].void[1];
    const out = E.apply(state, opponent(side), { kind: "pass" }, { answer: () => [chosen] });
    expect(out.state.instances[chosen].zone).toBe("stack");
    expect(out.state.instances[ids[side].void[0]].zone).toBe("void");
    expect(out.state.instances[ids[opponent(side)].void[0]].zone).toBe("void");
    expect(out.state.sides[side]).toMatchObject({ currentEnergy: 3, score: 1 });
    expect(out.state.turn.phase).toBe("day"); expect(out.state.priority).toBe(opponent(side));
    expect(out.state.turnLog.played[side].map((c) => c.instance)).toEqual([ids[side].hand[0], chosen]);
    expect(out.state.floating).toEqual([]); expect(out.events.filter((e) => e.kind === "cardPlayed")).toHaveLength(1);
    expect(out.events.some((e) => e.kind === "materialized")).toBe(false);
    const entered = apply(out.state, opponent(side), { kind: "pass" });
    expect(entered.state.instances[chosen]).toMatchObject({ zone: "play", status: { exhausted: true, playedViaReclaim: false } });
    expect(entered.state.sides[side].score).toBe(6);
  });
  it.each(SIDES)("offers an actual Interrupt against the immediate %s play and retains payment after Prevent", (side) => {
    const { state, ids } = open(side); const chosen = ids[side].void[0];
    const played = apply(state, opponent(side), { kind: "pass" }, [[chosen]]);
    const interrupted = apply(played.state, opponent(side), { kind: "play", card: ids[opponent(side)].hand[0], from: "hand" });
    const ended = passUntil(E, interrupted.state, (s) => s.stack.length === 0);
    expect(ended.state.instances[chosen].zone).toBe("void"); expect(ended.state.sides[side].currentEnergy).toBe(2);
    expect(ended.state.turnLog.played[side]).toHaveLength(2); expect(ended.state.turnLog.materialized?.[side]).toEqual([]);
    expect([...interrupted.events, ...ended.events].some((e) => e.kind === "prevented")).toBe(true);
  });
  it.each(SIDES)("runs the actual Dreamwell bonus for %s before its new play's opponent response", (side) => {
    const well = { id: parseDreamwellCardId("00000000-0000-4000-8000-000000056800"), order: 3, energyAdded: 1,
      status: "authored" as const, abilities: () => [event(sequence(immediate, gainPoints(1)))] };
    const engine = createEngine(createCatalog([...SYNTHETIC_CARDS, ...Object.values(D)], [well]));
    const board = boardState(engine.catalog, { active: opponent(side), phase: "night", round: 2,
      [side]: { void: [D.character.id], energy: 2, deck: filler }, [opponent(side)]: { hand: [D.interrupt.id], deck: filler } });
    board.state.dreamwell = { deck: [well.id], next: 0, catalog: [well.id] };
    const chosen = board.ids[side].void[0];
    const out = engine.apply(board.state, opponent(side), { kind: "pass" }, new ScriptedSource([[chosen]]));
    expect(out.state.instances[chosen].zone).toBe("stack"); expect(out.state.priority).toBe(opponent(side));
    expect(out.state.sides[side]).toMatchObject({ currentEnergy: 1, maxEnergy: 3, score: 1 });
    expect(out.state.triggerQueue).toEqual([]); expect(out.state.floating).toEqual([]);
    expect(out.events.filter((e) => e.kind === "cardPlayed")).toEqual([{ kind: "cardPlayed", side, instance: chosen }]);
    expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
  });
  it("uses copiable cost for selection while paying a live cost increase", () => {
    const { state, ids } = open("player", { void: [D.character, D.expensive], back: [D.tax] });
    const out = apply(state, "enemy", { kind: "pass" }, [[ids.player.void[0]]]);
    expect(out.state.sides.player.currentEnergy).toBe(1);
    expect(out.state.instances[ids.player.void[1]].zone).toBe("void");
  });
  it("uses available Reclaim without spending an unrelated permission allowance", () => {
    const { state, ids } = open("player", { void: [D.reclaim, D.character], back: [D.permission], energy: 2 }); const chosen = ids.player.void[0];
    const out = apply(state, "enemy", { kind: "pass" }, [[chosen], 1]);
    expect(out.state.sides.player.currentEnergy).toBe(2); expect(out.state.oncePerTurn).toEqual([]);
    expect(out.state.instances[chosen].status).toMatchObject({ reclaimed: true, playedViaReclaim: true });
    const interrupted = apply(out.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" });
    const ended = passUntil(E, interrupted.state, (s) => s.stack.length === 0);
    expect(ended.state.instances[chosen].zone).toBe("banished");
    expect(E.legalActions(ended.state, "player").some((a) => a.kind === "play" && a.card === ids.player.void[1])).toBe(true);
  });
  it("the normal immediate route leaves an unrelated once-per-turn permission available", () => {
    const { state, ids } = open("player", { void: [D.character, D.character], back: [D.permission] });
    const out = apply(state, "enemy", { kind: "pass" }, [[ids.player.void[0]]]); expect(out.state.oncePerTurn).toEqual([]);
    const ended = apply(out.state, "enemy", { kind: "pass" });
    expect(E.legalActions(ended.state, "player").some((a) => a.kind === "play" && a.card === ids.player.void[1])).toBe(true);
  });
  it("plans X, alternative and optional additional costs before paying their combined total", () => {
    const { state, ids } = open("player", { void: [D.variable], hand: [D.event, D.event], energy: 5 });
    const out = apply(state, "enemy", { kind: "pass" }, [[ids.player.void[0]], 2, 0, [ids.player.hand[1]], true]);
    expect(out.state.sides.player.currentEnergy).toBe(1); expect(out.state.instances[ids.player.hand[1]].zone).toBe("void");
    expect(out.state.stack[0]).toMatchObject({ x: 2, optionalPaid: [true] });
  });
  it("withholds an impossible additional cost while keeping a payable same-cost character", () => {
    const { state, ids } = open("player", { void: [D.extra, D.character] }); const F = createFoldAdapter(E);
    const out = applied(F.reduce(sliceOf(state), { kind: "battleAction", side: "enemy", action: { kind: "pass" } })); const prompt = F.pending(out.slice)?.prompt;
    if (prompt?.kind !== "chooseCards") throw new Error("missing card choice"); expect(prompt.candidates).toEqual([ids.player.void[1]]);
    expect(prompt).toMatchObject({ min: 0, max: 1 });
    expect(F.reduce(out.slice, { kind: "answer", side: "player", promptId: prompt.id, value: [ids.player.void[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
  });
  it.each(["empty", "unaffordable", "impossible", "restricted", "full"] as const)("a resolving effect with %s choices pays and moves nothing", (kind) => {
    const options = { void: kind === "empty" ? [] : kind === "impossible" ? [D.extra] : [D.character], energy: kind === "unaffordable" ? 1 : 4,
      back: kind === "restricted" ? [D.ban] : kind === "full" ? Array.from({ length: 10 }, () => D.character) : [] };
    const { state, ids } = setup("player", options);
    // A fixture already resolving its source can be at capacity; the ordinary announcement gate still forbids a fresh play there.
    moveToStack(new Context(state, E.catalog, NO_PROMPTS), ids.player.hand[0], "player", { choices: [{ modes: [], targets: [] }], x: null, optionalPaid: [] });
    const out = runStep(state, { kind: "resolveTop" }, NO_PROMPTS, E.catalog); if (out.kind !== "done") throw new Error("unexpected prompt");
    expect(out.state.sides.player.currentEnergy).toBe(options.energy);
    for (const id of ids.player.void) expect(out.state.instances[id].zone).toBe("void");
    expect(out.events.some((e) => e.kind === "cardPlayed")).toBe(false); expect(out.state.floating).toEqual([]);
  });
  it("declines without paying, moving, or creating a future permission", () => {
    const { state, ids } = open("player"); const out = apply(state, "enemy", { kind: "pass" }, [[]]);
    expect(out.state.instances[ids.player.void[0]].zone).toBe("void"); expect(out.state.sides.player).toMatchObject({ currentEnergy: 4, score: 1 });
    expect(out.state.floating).toEqual([]); expect(E.legalActions(out.state, "player").some((a) => a.kind === "play" && a.from === "void")).toBe(false);
  });
  it("uses native Awakened readiness on the chosen character's own resolution", () => {
    const { state, ids } = open("player", { void: [D.awake] }); const out = apply(state, "enemy", { kind: "pass" }, [[ids.player.void[0]]]);
    const entered = apply(out.state, "enemy", { kind: "pass" }); expect(entered.state.instances[ids.player.void[0]]).toMatchObject({ zone: "play", status: { exhausted: false } });
  });
  it("rolls back a later failure's immediate payment, movement, turn log and queued triggers", () => {
    const { state, ids } = open("player", { source: D.fail, back: [D.watch] }); const F = createFoldAdapter(E);
    const opened = applied(F.reduce(sliceOf(state), { kind: "battleAction", side: "enemy", action: { kind: "pass" } })); const prompt = F.pending(opened.slice)!.prompt;
    const out = applied(F.reduce(opened.slice, { kind: "answer", side: "player", promptId: prompt.id, value: [ids.player.void[0]] }));
    expect(out.error).not.toBeNull(); expect(stateHash(out.slice.committed)).toBe(stateHash(state));
    expect(out.slice.committed.instances[ids.player.void[0]].zone).toBe("void"); expect(out.slice.committed.sides.player.currentEnergy).toBe(4);
    expect(out.slice.committed.turnLog.played.player).toHaveLength(1);
  });
  it("cold reload reproduces bounded choice proofs, budget events and one payment", () => {
    const initial = open("player", { void: [D.variable], hand: [D.event, D.event], energy: 5 });
    const ids = initial.ids;
    const state: BattleState = { ...initial.state, config: { ...initial.state.config, feasibilitySearchRuns: 2 } };
    const F = createFoldAdapter(E); const opened = applied(F.reduce(sliceOf(state), { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const answer = { kind: "answer", side: "player", promptId: F.pending(opened.slice)!.prompt.id, value: [ids.player.void[0]] } as const;
    const cold = createFoldAdapter(E); const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    expect(cold.pending(saved)).toEqual(F.pending(opened.slice));
    const replay = applied(cold.reduce(saved, answer)); const direct = applied(F.reduce(opened.slice, answer));
    expect(replay.published).toEqual(direct.published); expect(stateHash(replay.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(replay.published.some((e) => e.kind === "feasibilityBounded")).toBe(true);
    expect(replay.slice.committed.turnLog.played.player).toHaveLength(2);
    const item = replay.slice.committed.stack[0];
    if (item?.kind !== "card") throw new Error("missing chosen stack card");
    const discarded = ids.player.hand.slice(1).some((id) => replay.slice.committed.instances[id].zone === "void");
    expect(replay.slice.committed.sides.player.currentEnergy).toBe(5 - 1 - (item.x ?? 0) - (item.optionalPaid[0] ? 1 : 0) - (discarded ? 0 : 2));
  });
  it("cold-replays suspended complex payment, bounces stale/concurrent answers, and charges once", () => {
    const { state, ids } = open("player", { void: [D.variable], hand: [D.event, D.event], energy: 5 }); const F = createFoldAdapter(E);
    let out = applied(F.reduce(sliceOf(state), { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    for (const value of [[ids.player.void[0]], 2, 0] as readonly Answer[]) {
      const prompt = F.pending(out.slice)!.prompt; out = applied(F.reduce(out.slice, { kind: "answer", side: "player", promptId: prompt.id, value }));
    }
    const pending = F.pending(out.slice)!; expect(pending.display.sides.player.currentEnergy).toBe(5);
    expect(pending.display.instances[ids.player.void[0]].zone).toBe("void");
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] } as const;
    expect(F.reduce(out.slice, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(F.reduce(out.slice, { ...answer, promptId: parsePromptId("0:0:0") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(F.reduce(out.slice, { ...answer, value: [ids.enemy.hand[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(F.reduce(out.slice, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const coldFold = createFoldAdapter(E);
    const cold = applied(coldFold.reduce(JSON.parse(JSON.stringify(out.slice)) as BattleSlice, answer));
    const warm = applied(F.reduce(out.slice, answer));
    expect(coldFold.pending(cold.slice)).toEqual(F.pending(warm.slice));
    expect(cold.published).toEqual(warm.published);
    const complete = (fold: ReturnType<typeof createFoldAdapter>, slice: BattleSlice) => applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: fold.pending(slice)!.prompt.id, value: true }));
    const resumed = complete(coldFold, cold.slice); const direct = complete(F, warm.slice);
    expect(resumed.published).toEqual(direct.published);
    expect(stateHash(resumed.slice.committed)).toBe(stateHash(direct.slice.committed)); expect(resumed.slice.committed.sides.player.currentEnergy).toBe(1);
    expect(resumed.slice.committed.turnLog.played.player).toHaveLength(2); expect(F.reduce(resumed.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });
});
