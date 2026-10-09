/**
 * Copies (D15, C3): a copy of a card on the stack is a created card directly
 * above the original that is not played, keeps X and paid optional costs,
 * lets its controller choose new targets through a prompt that never offers
 * a card that cannot be targeted, keeps each of the original's choices that
 * has no legal option, and can be prevented; created copies in a hand cease
 * to exist instead of being banished.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import { eventSeenBy, type EngineEvent } from "../events";
import type { Answer, ChooseTargetsPrompt } from "../prompts/types";
import type { Action } from "./actions";
import { SIDES, type InstanceId, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { DSL } from "../testing/dsl-cards";
import { invariantViolations } from "../testing/invariants";
import { STACK } from "../testing/stack-cards";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { at, type Observed, passUntil } from "../testing/trigger-harness";
import { ZONE, zoneCatalog } from "../testing/zone-cards";

const engine = createEngine(zoneCatalog());
const v = SYNTHETIC;
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);

function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, { active: "player", phase: "day", ...setup, player: { deck, ...setup.player }, enemy: { deck, ...setup.enemy } });
}

function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const steps: Observed[] = [];
  const result = engine.apply(state, side, action, source, (next, step, events) => steps.push({ state: next, step, events }));
  source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { ...result, steps };
}

function play(state: BattleState, side: Side, card: InstanceId | null | undefined, answers: readonly Answer[] = []) {
  if (card === null || card === undefined) throw new Error("no card");
  return act(state, side, { kind: "play", card, from: "hand" }, answers);
}

function copyOf(events: readonly EngineEvent[]): InstanceId {
  const copied = events.find((event) => event.kind === "cardCopied");
  if (copied?.kind !== "cardCopied") throw new Error("nothing was copied");
  return copied.copy;
}

/** The state right after the step that made a copy, the copy, and the events up to and after that step. */
function atCopy(steps: readonly Observed[]) {
  const index = steps.findIndex((observed) => observed.events.some((event) => event.kind === "cardCopied"));
  const observed = steps[index];
  if (observed === undefined) throw new Error("nothing was copied");
  const copy = copyOf(observed.events);
  const item = observed.state.stack.find((entry) => entry.kind === "card" && entry.instance === copy);
  return {
    state: observed.state,
    copy,
    item,
    viewItem: engine.view(observed.state, "player").stack.find((entry) => entry.kind === "card" && entry.instance === copy),
    before: steps.slice(0, index + 1).flatMap((step) => step.events),
    after: steps.slice(index + 1).flatMap((step) => step.events),
  };
}

describe("copies on the stack", () => {
  it("puts a copy above the original that resolves first, with new targets chosen through a prompt", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.dissolveEnemy.id], energy: 2 }, enemy: { back: [v.vanilla1.id, v.vanilla2.id] } });
    const [first, second] = ids.enemy.back;
    const { state: after, events, answers } = play(state, "player", ids.player.hand[0], [[first!], [second!]]);
    const copy = copyOf(events);
    const dissolved = events.flatMap((event) => (event.kind === "dissolved" ? [event.instance] : []));
    expect(dissolved).toEqual([second, first]);
    // The copy's controller chose its target in its own prompt.
    expect(answers.filter((answer) => answer.auto !== true)).toHaveLength(2);
    expect(after.instances[copy]).toBeUndefined();
    expect(events.filter((event) => event.kind === "cardPlayed")).toHaveLength(1);
    expect(after.turnLog.played.player.map((card) => card.instance)).toEqual([ids.player.hand[0]]);
    expect(after.sides.player.void).toEqual([ids.player.hand[0]]);
  });

  it("answers the copy's target choice automatically when there is no alternative", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.dissolveEnemy.id], energy: 2 }, enemy: { back: [v.vanilla1.id] } });
    const { events } = play(state, "player", ids.player.hand[0]);
    expect(events.some((event) => event.kind === "cardCopied")).toBe(true);
    // The original's only target was dissolved by the copy first.
    expect(events).toContainEqual(expect.objectContaining({ kind: "noLegalTarget", source: ids.player.hand[0] }));
  });

  it("never offers a character that cannot be targeted to the copy's new-target choice", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.dissolveEnemy.id], energy: 2 }, enemy: { back: [DSL.untargetableCharacter.id, v.vanilla1.id, v.vanilla2.id] } });
    const [shielded, first, second] = ids.enemy.back;
    const asked: ChooseTargetsPrompt[] = [];
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, {
      answer(prompt) {
        if (prompt.kind !== "chooseTargets") throw new Error(`Unexpected ${prompt.kind} prompt`);
        asked.push(prompt);
        return prompt.candidates.slice(0, 1);
      },
    });
    // The original's prompt, then the copy's, each offering only the targetable enemies.
    expect(asked.map((prompt) => prompt.candidates)).toEqual([[first, second], [first, second]]);
    expect(result.state.instances[shielded!]?.zone).toBe("play");
  });

  it("keeps the original's target for a copy's target choice with no legal option, and skips it at resolution while it is illegal", () => {
    const { state, ids } = board({ player: { back: [DSL.untargetableCharacter.id], hand: [DSL.dissolveEnemy.id], energy: 2 }, enemy: { back: [v.vanilla2.id], hand: [ZONE.mirror.id], energy: 1 } });
    const shielded = ids.player.back[0]!;
    const original = ids.enemy.back[0]!;
    const played = play(state, "player", ids.player.hand[0]).state;
    // The enemy copies the dissolve: for the copy, "an enemy" is a player's character, and the only one cannot be targeted.
    const mirrored = play(played, "enemy", ids.enemy.hand[0]);
    const copied = atCopy(mirrored.steps);
    expect(copied.item).toMatchObject({ choices: [{ modes: [], targets: [[original]] }] });
    expect(copied.viewItem).toMatchObject({ choices: [{ targets: [[original]] }] });
    // Keeping the original's target raises no prompt and reports nothing as the copy is made.
    expect(mirrored.answers).toEqual([expect.objectContaining({ auto: true })]);
    expect(copied.before.filter((event) => event.kind === "noLegalTarget")).toEqual([]);
    // The kept target is the copier's own character, not an enemy, so the copy does nothing; the original still dissolves it.
    expect(copied.after).toContainEqual({ kind: "noLegalTarget", source: copied.copy });
    expect(mirrored.state.stack).toEqual([]);
    expect(mirrored.state.instances[shielded]?.zone).toBe("play");
    expect(mirrored.state.instances[original]?.zone).toBe("void");
  });

  it("resolves a kept original target that becomes legal for the copy's controller before the copy resolves", () => {
    const { state, ids } = board({
      player: { hand: [DSL.dissolveEnemy.id, ZONE.quickSeize.id], energy: 3 },
      enemy: { back: [v.vanilla2.id], hand: [v.interruptEvent.id, ZONE.mirror.id], energy: 2 },
    });
    const [dissolve, seize] = ids.player.hand;
    const [response, mirror] = ids.enemy.hand;
    const original = ids.enemy.back[0]!;
    // The stack becomes dissolve, response, seize, mirror: the mirror's copy goes directly above the dissolve, below the seize.
    const played = play(state, "player", dissolve).state;
    const responded = play(played, "enemy", response).state;
    const seizing = play(responded, "player", seize).state;
    const mirrored = play(seizing, "enemy", mirror, [[dissolve]]);
    // The player controls no characters as the copy is made, so it keeps the original's target, the enemy's own character.
    const copied = atCopy(mirrored.steps);
    expect(copied.item).toMatchObject({ choices: [{ targets: [[original]] }] });
    expect(copied.state.stack.map((item) => (item.kind === "card" ? item.instance : null))).toEqual([dissolve, copied.copy, response, seize]);
    // The seize resolves first and makes it an enemy of the copy's controller, so the copy dissolves it.
    expect(copied.after).toContainEqual(expect.objectContaining({ kind: "controlChanged", instance: original, to: "player" }));
    expect(mirrored.state.stack).toEqual([]);
    expect(mirrored.state.instances[original]?.zone).toBe("void");
    expect(copied.after).not.toContainEqual({ kind: "noLegalTarget", source: copied.copy });
    // The original, resolving last, finds its target gone.
    expect(copied.after).toContainEqual({ kind: "noLegalTarget", source: dissolve });
  });

  it("keeps the original's choices one at a time, choosing anew wherever a legal option exists", () => {
    const { state, ids } = board({ player: { hand: [ZONE.modalThenPump.id] }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], hand: [ZONE.mirror.id], energy: 1 } });
    const [first, second] = ids.enemy.back;
    if (first === null || first === undefined || second === null || second === undefined) throw new Error("fixture has empty backs");
    // The original exhausts the first enemy and pumps the second.
    const played = play(state, "player", ids.player.hand[0], [1, [first], [second]]).state;
    const spark = (from: BattleState, id: InstanceId) => engine.view(from, "player").instances[id]?.characteristics?.spark ?? 0;
    const before = [spark(played, first), spark(played, second)];
    // The player controls no characters: the copy keeps the original's mode and that mode's target, and pumps the first enemy instead.
    const mirrored = play(played, "enemy", ids.enemy.hand[0], [[first]]);
    const copied = atCopy(mirrored.steps);
    expect(copied.item).toMatchObject({ choices: [{ modes: [1], targets: [[first], [first]] }] });
    expect(mirrored.answers.filter((answer) => answer.auto !== true).map((answer) => answer.value)).toEqual([[first]]);
    expect(copied.before.filter((event) => event.kind === "noLegalTarget")).toEqual([]);
    expect(copied.after).toContainEqual({ kind: "noLegalTarget", source: copied.copy });
    expect([spark(mirrored.state, first), spark(mirrored.state, second)]).toEqual(before.map((value) => value + 1));
    expect(mirrored.state.instances[first]).toMatchObject({ zone: "play", status: { exhausted: true } });
  });

  it("keeps the original's X without paying again", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.fixedPlusXPoints.id], energy: 4 } });
    const { state: after } = play(state, "player", ids.player.hand[0], [3]);
    expect(after.sides.player.score).toBe(6);
    expect(after.sides.player.currentEnergy).toBe(0);
  });

  it("can be prevented, and then ceases to exist while the original still resolves", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.drawTwo.id], energy: 1 }, enemy: { hand: [STACK.preventEvent.id], energy: 1 } });
    const played = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" });
    const copy = copyOf(played.events);
    expect(played.state.stack.map((item) => (item.kind === "card" ? item.instance : null))).toEqual([ids.player.hand[0], copy]);
    expect(played.state.priority).toBe("enemy");
    const { state: after, events } = play(played.state, "enemy", ids.enemy.hand[0], [[copy]]);
    expect(events).toContainEqual({ kind: "prevented", instance: copy, side: "player", to: null, zoneOf: null });
    expect(after.instances[copy]).toBeUndefined();
    expect(after.sides.player.hand).toHaveLength(2);
    expect(after.sides.player.void).toEqual([ids.player.hand[0]]);
  });

  it("copies an opponent's card for the copier, who gets its effect", () => {
    const { state, ids } = board({ player: { hand: [DSL.gainThreePoints.id], energy: 1 }, enemy: { hand: [ZONE.mirror.id], energy: 1 } });
    const played = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }).state;
    const mirrored = play(played, "enemy", ids.enemy.hand[0]).state;
    const done = passUntil(engine, mirrored, (next) => next.stack.length === 0).state;
    expect(done.sides.enemy.score).toBe(3);
    expect(done.sides.player.score).toBe(3);
  });
});

describe("copies in hand", () => {
  it("creates an Ephemeral copy in hand that ceases to exist at Ending instead of being banished", () => {
    const { state, ids } = board({ player: { back: [v.vanilla2.id], hand: [ZONE.handEcho.id], energy: 1 } });
    const { state: after } = play(state, "player", ids.player.hand[0]);
    const [copy] = after.sides.player.hand;
    expect(after.instances[copy]).toMatchObject({ printing: { kind: "card", cardId: v.vanilla2.id }, owner: "player", status: { created: true, ephemeral: true } });
    const { state: ended, steps } = passUntil(engine, after, at(engine, "enemy", "day"));
    expect(ended.instances[copy]).toBeUndefined();
    expect(ended.sides.player.banished).toEqual([]);
    // It ceases from a hidden hand: only its holder sees the event naming it.
    const ceasing = steps.find((step) => step.events.some((event) => event.kind === "ceasedToExist"));
    if (ceasing === undefined) throw new Error("no step ceased the copy");
    const ceased = ceasing.events.find((event) => event.kind === "ceasedToExist");
    expect(ceased).toEqual({ kind: "ceasedToExist", instance: copy, side: "player", from: "hand" });
    for (const viewer of SIDES) {
      const seen = ceasing.events.flatMap((event) => {
        const visible = eventSeenBy(event, viewer, ceasing.state);
        return visible === null ? [] : [visible];
      });
      expect(JSON.stringify(seen).includes(copy)).toBe(viewer === "player");
    }
  });
});
