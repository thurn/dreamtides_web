// What the battle screen model shows of a waiting delayed ability: a badge on
// its controller's side and on each card it captured that the viewer sees in
// play, naming the moment it fires when the trigger is a turn boundary.
import { describe, expect, it } from "vitest";
import { createEngine, SIDES, type BattleView, type InstanceId, type Side } from "../../engine";
import type { EngineCardDefinition } from "../../engine/catalog";
import { energy, event } from "../../engine/dsl/builders";
import { atEndOfTurn, atStartOfTurn, whenDraw } from "../../engine/dsl/triggers";
import { Answers, endTurn, engine, F, handCard, play, setup } from "../../engine/effects/primitives/contracts/at-end-of-turn-trigger-support";
import { deck } from "../../engine/effects/primitives/contracts/cards-support";
import { draw } from "../../engine/effects/primitives/draw";
import { delayed } from "../../engine/effects/primitives/floating-trigger";
import type { ResolvingEffect } from "../../engine/effects/registry";
import type { BattleState } from "../../engine/state/types";
import { boardState } from "../../engine/testing/board";
import { syntheticId, SYNTHETIC, testCatalog } from "../../engine/testing/synthetic-cards";
import { passUntil } from "../../engine/testing/trigger-harness";
import { engineStatusLabel, type TriggerMoment } from "../../runtime/battle-prompt-messages";
import { parseBattleCardId } from "../../types/identifiers";
import { enginePrintedKeywords, engineStatuses } from "./engine-battle-view-model";
import { screenOf } from "./engine-battle-view-model.fixtures";

/** The delayed-ability badges of `view` for `viewer` (sources unnamed), by the card they mark, and on each side. */
function delayedBadges(view: BattleView, viewer: Side, on = engine) {
  const statuses = engineStatuses(view, viewer, enginePrintedKeywords(on.catalog), new Set(), undefined, on.catalog);
  const marked = new Map(
    [...statuses.cards].flatMap(([id, badges]) => {
      const waiting = badges.filter((badge) => badge.kind === "delayedTrigger");
      return waiting.length === 0 ? [] : [[id, waiting] as const];
    }),
  );
  const sides = Object.fromEntries(SIDES.map((side) => [side, statuses.sides[side].filter((badge) => badge.kind === "delayedTrigger")]));
  return { marked, sides: sides as Record<Side, typeof statuses.sides.player> };
}

/** Borrowed Minutes' shape for X = 2 over a void of two 1● and 2● characters, resolved. */
function borrowed(extraHand: readonly (typeof F.bounce.id)[] = []) {
  const { state, ids } = setup({ hand: [F.borrow.id, ...extraHand], void: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] });
  const source = handCard(state, F.borrow);
  const resolved = play(state, source, new Answers([2])).state;
  const members = ids.player.void;
  expect(members.map((id) => resolved.instances[id].zone)).toEqual(["play", "play"]);
  return { state: resolved, members, source };
}

/** The label of a delayed ability with no source name that fires at `moment`. */
const label = (moment: TriggerMoment | null, viewer: Side) =>
  engineStatusLabel({ kind: "delayedTrigger", once: true, expiry: { at: "never" }, moment }, viewer);

describe("engineStatuses for a delayed ability with captured cards", () => {
  it("marks each captured card in play and its controller's side, for both viewers, with the end-of-turn moment", () => {
    const { state, members, source } = borrowed();
    for (const viewer of SIDES) {
      const { marked, sides } = delayedBadges(engine.view(state, viewer), viewer);
      expect([...marked.keys()].sort()).toEqual([...members].sort());
      expect(sides.player).toHaveLength(1);
      expect(sides.enemy).toEqual([]);
      for (const member of members) expect(marked.get(member)).toEqual(sides.player);
      const [side] = sides.player;
      expect(side.label).toBe(label({ at: "endOfTurn", side: null }, viewer));
      expect(side.source).toBe(parseBattleCardId(source));
    }
  });

  it("shows the captured badges on the battlefield cards of the screen model", () => {
    const { state, members } = borrowed();
    const model = screenOf(state, null, state, true, engine);
    const near = model.view.near.backRank.flatMap((slot) => (slot.card === null ? [] : [slot.card]));
    const badged = near.filter((card) => card.statuses?.some((badge) => badge.kind === "delayedTrigger") === true);
    expect(badged.map((card) => card.id).sort()).toEqual(members.map((id) => parseBattleCardId(id)).sort());
  });

  it("marks no captured card that left play, and none after the banish", () => {
    const { state, members } = borrowed([F.bounce.id]);
    const [returned, stayed] = members;
    const bounced = play(state, handCard(state, F.bounce), new Answers([], [[returned]])).state;
    expect(bounced.instances[returned].zone).toBe("hand");
    for (const viewer of SIDES) expect([...delayedBadges(engine.view(bounced, viewer), viewer).marked.keys()]).toEqual([stayed]);

    const ended = endTurn(bounced).state;
    expect(ended.instances[stayed].zone).toBe("banished");
    for (const viewer of SIDES) {
      const { marked, sides } = delayedBadges(engine.view(ended, viewer), viewer);
      expect([marked.size, sides.player.length, sides.enemy.length]).toEqual([0, 0, 0]);
    }
  });

  it("marks only identified cards: a hidden captured card marks nothing", () => {
    const { state, members } = borrowed();
    const view = engine.view(state, "enemy");
    const hidden: BattleView = {
      ...view,
      floating: view.floating.map((effect) =>
        effect.change.kind === "trigger"
          ? { ...effect, change: { ...effect.change, captured: [{ member: 0, owner: "player", printing: state.instances[members[0]].printing, variant: state.instances[members[0]].variant }, members[1]] } }
          : effect,
      ),
    };
    expect([...delayedBadges(hidden, "enemy").marked.keys()]).toEqual([members[1]]);
  });
});

const momentId = (index: number) => syntheticId(0xe1e100 + index);
const spell = (index: number, effect: ResolvingEffect): EngineCardDefinition => ({
  id: momentId(index), cardType: "event", costs: [energy(0)], spark: null, subtype: "", speed: "standard", status: "authored", abilities: () => [event(effect)],
});
const M = {
  opponentEnd: spell(1, delayed(atEndOfTurn("opponent"), draw(1))),
  yourEnd: spell(2, delayed(atEndOfTurn("you"), draw(1))),
  nextStart: spell(3, delayed(atStartOfTurn(), draw(1))),
  nextDraw: spell(4, delayed(whenDraw(), draw(1))),
};
const moments = createEngine(testCatalog(Object.values(M)));

/** The view, for `viewer`, of `side` having resolved `card`. */
function after(card: EngineCardDefinition, side: Side, viewer: Side): BattleView {
  const state: BattleState = boardState(moments.catalog, { active: side, phase: "day", player: { deck, ...(side === "player" ? { hand: [card.id] } : {}) }, enemy: { deck, ...(side === "enemy" ? { hand: [card.id] } : {}) } }).state;
  const instance: InstanceId = state.sides[side].hand[0];
  const played = moments.apply(state, side, { kind: "play", card: instance, from: "hand" }, new Answers()).state;
  return moments.view(passUntil(moments, played, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, new Answers()).state, viewer);
}

describe("the moment a delayed ability names", () => {
  it("resolves turn-boundary triggers from the controller's side and falls back for any other trigger", () => {
    const cases: readonly [EngineCardDefinition, Side, TriggerMoment | null][] = [
      [M.opponentEnd, "player", { at: "endOfTurn", side: "enemy" }],
      [M.opponentEnd, "enemy", { at: "endOfTurn", side: "player" }],
      [M.yourEnd, "enemy", { at: "endOfTurn", side: "enemy" }],
      [M.nextStart, "player", { at: "startOfTurn" }],
      [M.nextDraw, "player", null],
    ];
    for (const [card, side, moment] of cases) {
      for (const viewer of SIDES) {
        const [badge] = delayedBadges(after(card, side, viewer), viewer, moments).sides[side];
        expect(badge.label).toBe(label(moment, viewer));
      }
    }
  });
});

