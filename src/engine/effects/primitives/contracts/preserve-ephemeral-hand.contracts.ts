import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { anyCharacter, conditionCardCounts, energy, event, everyIn, staticAbility, target } from "../../../dsl/builders";
import type { Ability } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { parseAvatarId, parseDreamsignId } from "../../../../types/identifiers";
import { addFloating } from "../../../rules/floating";
import { createCopyInHand } from "../../../rules/copies";
import { gainControl, moveToHand, moveToStack } from "../../../rules/zones";
import { cloneState } from "../../../state/clone";
import { stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { Context } from "../../../steps/context";
import { runStep } from "../../../steps/runner";
import type { Step } from "../../../steps/kinds";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import * as p from "../index";

function card(index: number, abilities: readonly Ability[], type: "character" | "event" = "character"): EngineCardDefinition {
  return { ...v.vanilla1, id: syntheticId(0x620000 + index), costs: [energy(0)], cardType: type,
    spark: type === "event" ? null : 1, status: "authored", abilities: () => abilities };
}
const keeper = card(1, [staticAbility(p.preserveEphemeralHand())]);
const handKeeper = card(2, [staticAbility(p.preserveEphemeralHand(), { zone: "hand" })]);
const conditional = card(3, [staticAbility(p.preserveEphemeralHand(), { while: conditionCardCounts("void", 1) })]);
const dissolve = card(4, [event(p.dissolve(target(anyCharacter())))], "event");
const lose = card(5, [event(p.loseAllAbilities(target(anyCharacter())))], "event");
const banishHand = card(6, [event(p.banishCards([everyIn("hand")]))], "event");
const invalid = card(7, [event(p.preserveEphemeralHand())], "event");
const avatar = parseAvatarId("5e5e5e5e-0000-4000-8000-000000620101");
const sign = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000620102");
const engine = createEngine(testCatalog([keeper, handKeeper, conditional, dissolve, lose, banishHand, invalid], {
  avatars: [{ id: avatar, status: "authored", abilities: () => [staticAbility(p.preserveEphemeralHand())] }],
  dreamsigns: [{ id: sign, status: "authored", abilities: () => [staticAbility(p.preserveEphemeralHand())] }],
}));
const deck = Array.from({ length: 8 }, () => v.event0.id);
function world(side: Side, mine: SideSetup = {}, theirs: SideSetup = {}) {
  return boardState(engine.catalog, { active: side, phase: "day",
    [side]: { deck, energy: 10, ...mine }, [opponent(side)]: { deck, ...theirs } });
}
function step(state: BattleState, action: Step, source: AnswerSource = NO_PROMPTS) {
  const result = runStep(state, action, source, engine.catalog);
  if (result.kind !== "done") throw new Error("expected completed step");
  return result;
}
function atCleanup(state: BattleState): BattleState {
  return { ...state, turn: { ...state.turn, phase: "challenge", challengeLane: null } };
}
const ending = (state: BattleState, source = NO_PROMPTS) => step(atCleanup(state), { kind: "advancePhase" }, source);
function play(state: BattleState, id: InstanceId, targets: readonly InstanceId[] = []) {
  const played = step(state, { kind: "play", card: id, from: "hand" }, new ScriptedSource(targets.length === 0 ? [] : [targets]));
  return step(played.state, { kind: "resolveTop" });
}
function ephemeral(state: BattleState, ids: readonly InstanceId[]) {
  for (const id of ids) state.instances[id].status.ephemeral = true;
}
function retained(state: BattleState, side: Side, ids: readonly InstanceId[]) {
  expect(state.sides[side].hand).toEqual(expect.arrayContaining([...ids]));
  for (const id of ids) expect(state.instances[id]).toMatchObject({ zone: "hand", controller: side, status: { ephemeral: true } });
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(`expected applied intent: ${result.kind === "applied" ? result.error?.message : result.reason}`);
  return result.slice;
}

describe("preserveEphemeralHand", () => {
  it.each(SIDES)("retains %s held Ephemeral cards and their flag only at its own Ending", side => {
    const other = opponent(side);
    for (const copies of [0, 1, 2]) {
      const w = world(side, { hand: [v.event0.id], dreamsigns: Array.from({ length: copies }, () => sign) }, { hand: [v.event0.id], dreamsigns: [sign] });
      const mine = w.ids[side].hand[0], theirs = w.ids[other].hand[0];
      ephemeral(w.state, [mine, theirs]);
      const ctx = new Context(w.state, engine.catalog, NO_PROMPTS);
      const copy = createCopyInHand(ctx, mine, side, true)!;
      const result = ending(w.state);
      expect(result.state.instances[theirs].zone).toBe("banished");
      if (copies > 0) {
        retained(result.state, side, [mine, copy]);
        expect(result.events.some(e => (e.kind === "banished" || e.kind === "ceasedToExist") && (e.instance === mine || e.instance === copy))).toBe(false);
        expect(result.state.instances[copy].status.created).toBe(true);
      } else {
        expect(result.state.instances[mine].zone).toBe("banished");
        expect(result.state.instances[copy]).toBeUndefined();
      }
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("uses %s hand holder rather than the borrowed card's owner", side => {
    const other = opponent(side);
    for (const covered of [false, true]) {
      const w = world(side, { dreamsigns: covered ? [sign] : [] }, { hand: [v.event0.id], dreamsigns: [sign] });
      const borrowed = w.ids[other].hand[0];
      moveToHand(new Context(w.state, engine.catalog, NO_PROMPTS), borrowed, side);
      ephemeral(w.state, [borrowed]);
      expect(w.state.instances[borrowed].owner).toBe(other);
      const result = ending(w.state);
      if (covered) retained(result.state, side, [borrowed]);
      else expect(result.state.sides[other].banished).toContain(borrowed);
    }
  });

  it.each(SIDES)("does not exempt the %s hand during the opponent's Ending", side => {
    const w = world(opponent(side), {}, { hand: [v.event0.id], dreamsigns: [sign] });
    const id = w.ids[side].hand[0];
    ephemeral(w.state, [id]);
    expect(ending(w.state).state.instances[id].zone).toBe("banished");
  });

  it.each(SIDES)("reads %s source zone, controller and live condition", side => {
    for (const [source, zone, covered] of [
      [keeper, "back", true], [keeper, "hand", false], [keeper, "void", false], [handKeeper, "hand", true],
    ] as const) {
      const w = world(side, { hand: [v.event0.id], [zone]: zone === "hand" ? [v.event0.id, source.id] : [source.id] });
      const id = w.ids[side].hand[0];
      ephemeral(w.state, [id]);
      const result = ending(w.state);
      if (covered) retained(result.state, side, [id]);
      else expect(result.state.instances[id].zone).toBe("banished");
    }
    for (const condition of [false, true]) {
      const w = world(side, { hand: [v.event0.id], back: [conditional.id], void: condition ? [v.event0.id] : [] });
      const id = w.ids[side].hand[0];
      ephemeral(w.state, [id]);
      const result = ending(w.state);
      if (condition) retained(result.state, side, [id]);
      else expect(result.state.instances[id].zone).toBe("banished");
    }
    const moved = world(side, { hand: [v.event0.id] }, { hand: [v.event0.id], back: [keeper.id] });
    gainControl(new Context(moved.state, engine.catalog, NO_PROMPTS), moved.ids[opponent(side)].back[0]!, side);
    ephemeral(moved.state, [moved.ids[side].hand[0], moved.ids[opponent(side)].hand[0]]);
    const result = ending(moved.state);
    retained(result.state, side, [moved.ids[side].hand[0]]);
    expect(result.state.instances[moved.ids[opponent(side)].hand[0]].zone).toBe("banished");
  });

  it.each(SIDES)("stops preserving %s after the last source leaves or loses its abilities", side => {
    for (const spell of [dissolve, lose]) {
      const w = world(side, { back: [keeper.id, keeper.id], hand: [spell.id, spell.id, v.event0.id] });
      const held = w.ids[side].hand[2];
      ephemeral(w.state, [held]);
      const one = play(w.state, w.ids[side].hand[0], [w.ids[side].back[0]!]).state;
      retained(ending(one).state, side, [held]);
      const none = play(one, w.ids[side].hand[1], [w.ids[side].back[1]!]).state;
      expect(ending(none).state.instances[held].zone).toBe("banished");
    }
  });

  it.each(SIDES)("preserves %s Ephemeral without suppressing Offering, explicit banish or created replacement", side => {
    const w = world(side, { back: [keeper.id, v.vanilla1.id], hand: [v.event0.id, v.event0.id, banishHand.id], void: [v.event0.id], avatar });
    const [held, offered, spell] = w.ids[side].hand;
    ephemeral(w.state, [held, offered]);
    w.state.instances[offered].status.offering = true;
    const offeredCharacter = w.ids[side].back[1]!;
    w.state.instances[offeredCharacter].status.offering = true;
    w.state.instances[offeredCharacter].status.exhausted = true;
    w.state.instances[w.ids[side].back[0]!].status.exhausted = true;
    w.state.instances[w.ids[side].void[0]].status.offering = true;
    w.state.sides[side].avatar!.exhausted = true;
    const result = ending(w.state);
    retained(result.state, side, [held]);
    for (const id of [offered, offeredCharacter, w.ids[side].void[0]]) expect(result.state.instances[id].zone).toBe("banished");
    expect(result.state.instances[w.ids[side].back[0]!].status.exhausted).toBe(false);
    expect(result.state.sides[side].avatar!.exhausted).toBe(false);

    const ctx = new Context(w.state, engine.catalog, NO_PROMPTS);
    const copy = createCopyInHand(ctx, held, side, true)!;
    const explicit = play(w.state, spell);
    expect(explicit.state.instances[held].zone).toBe("banished");
    expect(explicit.state.instances[copy]).toBeUndefined();
    const cast = world(side, { hand: [v.event0.id], dreamsigns: [sign] });
    const id = cast.ids[side].hand[0];
    ephemeral(cast.state, [id]);
    const played = step(cast.state, { kind: "play", card: id, from: "hand" });
    expect(played.state.instances[id].status.ephemeral).toBe(false);
  });

  it.each(SIDES)("orders %s ability expiry after Ephemeral cleanup and repeats cleanup at an actual extra-turn Ending", side => {
    for (const gained of [true, false]) {
      const w = world(side, { back: [gained ? v.vanilla1.id : keeper.id], hand: [v.event0.id] });
      const source = w.ids[side].back[0]!, held = w.ids[side].hand[0];
      ephemeral(w.state, [held]);
      const ctx = new Context(w.state, engine.catalog, NO_PROMPTS);
      const effect = addFloating(ctx, { source, controller: side, expiry: { at: "endOfTurn" }, change: gained
        ? { kind: "abilities", instance: source, cardId: keeper.id, variant: { amplified: false } }
        : { kind: "loseAbilities", instance: source } });
      w.state.turn.extraTurns.push(side);
      const first = ending(w.state);
      if (gained) retained(first.state, side, [held]);
      else expect(first.state.instances[held].zone).toBe("banished");
      expect(first.events).toContainEqual({ kind: "effectEnded", effect });
      expect(first.state.floating).toEqual([]);
      const next = step(first.state, { kind: "advancePhase" }).state;
      expect(next.turn).toMatchObject({ active: side, extra: true });
      if (gained) expect(ending(next).state.instances[held].zone).toBe("banished");
    }
    const permanent = world(side, { hand: [v.event0.id], dreamsigns: [sign] });
    const held = permanent.ids[side].hand[0];
    ephemeral(permanent.state, [held]);
    permanent.state.turn.extraTurns.push(side);
    const first = ending(permanent.state).state;
    const extra = step(first, { kind: "advancePhase" }).state;
    const reference = ending(extra);
    retained(reference.state, side, [held]);
    for (const saved of [cloneState(extra), JSON.parse(JSON.stringify(extra)) as BattleState]) {
      const replayed = ending(saved);
      expect(replayed.events).toEqual(reference.events);
      expect(stateHash(replayed.state)).toBe(stateHash(reference.state));
    }
  });

  it("rejects saved floating preservation and non-static resolution without committing its earlier work", () => {
    const w = world("player", { back: [keeper.id], hand: [invalid.id, v.event0.id] });
    const init = { seed: battleSeed("board"), scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] };
    const save = { init, slice: sliceOf(w.state) };
    expect(parseEngineBattleFold(JSON.parse(JSON.stringify(save)))).not.toBeNull();
    const bad = JSON.parse(JSON.stringify(save)) as typeof save;
    addFloating(new Context(bad.slice.committed, engine.catalog, NO_PROMPTS), {
      source: w.ids.player.back[0]!, controller: "player", expiry: { at: "never" },
      change: { kind: "spark", instance: w.ids.player.back[0]!, amount: 1 },
    });
    expect(parseEngineBattleFold(bad)).not.toBeNull();
    bad.slice.committed.floating[0] = { ...bad.slice.committed.floating[0], change: { kind: "preserveEphemeralHand", player: "player" } };
    expect(parseEngineBattleFold(bad)).toBeNull();
    moveToStack(new Context(w.state, engine.catalog, NO_PROMPTS), w.ids.player.hand[0], "player");
    const before = stateHash(w.state);
    expect(() => step(w.state, { kind: "resolveTop" })).toThrow();
    expect(stateHash(w.state)).toBe(before);
    expect(w.state.instances[w.ids.player.hand[0]].zone).toBe("stack");
  });

  it.each(SIDES)("replays %s suspended hand-limit cleanup after reload and rejects stale, invalid, cancelled or racing input", side => {
    const w = world(side, { hand: Array.from({ length: 12 }, () => v.event0.id), dreamsigns: [sign] });
    ephemeral(w.state, w.ids[side].hand);
    const committed = atCleanup(w.state);
    const snapshot = JSON.stringify(committed);
    const suspended = runStep(committed, { kind: "advancePhase" }, INTERACTIVE, engine.catalog);
    if (suspended.kind !== "suspended") throw new Error("expected hand-limit suspension");
    const before = stateHash(committed);
    expect(() => runStep(committed, { kind: "advancePhase" }, { answer() { throw new Error("interrupt"); } }, engine.catalog)).toThrow();
    expect(stateHash(committed)).toBe(before);
    const saved: BattleSlice = { committed, inFlight: { step: { kind: "advancePhase" }, automatic: true, answers: [] }, publishedEvents: suspended.events.length, attempt: 1 };
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const reloaded = JSON.parse(JSON.stringify(saved)) as BattleSlice;
    const pending = fold.pending(saved)!;
    expect(cold.pending(reloaded)).toEqual(pending);
    if (pending.prompt.kind !== "chooseCards") throw new Error("expected hand-limit discard");
    const answer = { kind: "answer", side, promptId: pending.prompt.id, value: pending.prompt.candidates.slice(0, pending.prompt.min) } as const;
    expect(cold.reduce(reloaded, { ...answer, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(reloaded, { ...answer, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(cold.reduce(reloaded, { kind: "cancel", side, promptId: answer.promptId })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const newer = { ...reloaded, attempt: reloaded.attempt + 1 };
    expect(cold.reduce(newer, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const result = cold.reduce(reloaded, answer);
    expect(result).toEqual(fold.reduce(saved, answer));
    const done = applied(result);
    const remaining = w.ids[side].hand.filter(id => !answer.value.includes(id));
    retained(done.committed, side, remaining);
    expect(done.committed.sides[side].hand).toHaveLength(committed.config.handLimit);
    for (const id of answer.value) expect(done.committed.instances[id].zone).toBe("void");
    expect(cold.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const loser = { ...answer, value: pending.prompt.candidates.slice(pending.prompt.min, 2 * pending.prompt.min) };
    expect(fold.reduce(done, loser)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(JSON.stringify(committed)).toBe(snapshot);
  });

  it("cancels a source-removal target choice, then removes protection only when the chosen spell resolves", () => {
    const w = world("player", { back: [keeper.id, v.vanilla1.id], hand: [dissolve.id, v.event0.id] });
    const held = w.ids.player.hand[1], source = w.ids.player.back[0]!;
    ephemeral(w.state, [held]);
    const fold = createFoldAdapter(engine);
    const intent = { kind: "battleAction", side: "player", action: { kind: "play", card: w.ids.player.hand[0], from: "hand" } } as const;
    const opened = applied(fold.reduce(sliceOf(w.state), intent));
    const pending = fold.pending(opened)!;
    const cancel = { kind: "cancel", side: "player", promptId: pending.prompt.id } as const;
    const cancelled = applied(fold.reduce(opened, cancel));
    retained(ending(cancelled.committed).state, "player", [held]);
    const cold = createFoldAdapter(createEngine(engine.catalog));
    const restarted = applied(cold.reduce(JSON.parse(JSON.stringify(cancelled)) as BattleSlice, intent));
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [source] } as const;
    expect(cold.reduce(restarted, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const accepted = applied(cold.reduce(restarted, { ...answer, promptId: cold.pending(restarted)!.prompt.id }));
    const resolved = passUntil(engine, accepted.committed, state => state.stack.length === 0).state;
    expect(resolved.instances[source].zone).toBe("void");
    expect(ending(resolved).state.instances[held].zone).toBe("banished");
  });
});
