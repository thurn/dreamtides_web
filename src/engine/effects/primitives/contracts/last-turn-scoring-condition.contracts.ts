/** Actual scoring, present control, and preceding-global-turn conditions through public engine consumers. */
import { describe, expect, it } from "vitest";
import { costModifier } from "../../../continuous/costs";
import { createCatalog } from "../../../catalog";
import { event } from "../../../dsl/builders";
import { createEngine, IllegalAction } from "../../../engine";
import { initialState } from "../../../state/create";
import { cloneState } from "../../../state/clone";
import { serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES } from "../../../state/ids";
import { invariantViolations } from "../../../testing/invariants";
import { boardState } from "../../../testing/board";
import { SYNTHETIC_CARDS } from "../../../testing/synthetic-cards";
import { passUntil, at } from "../../../testing/trigger-harness";
import { parseDreamwellCardId } from "../../../../types/identifiers";
import { gainPoints } from "../gain-points";
import { scoringApply, scoringBoard, scoringCards as c, scoringCopy, scoringEngine as engine, scoringHolds, scoringNext, scoringPlay, NO_PROMPTS, v } from "./last-turn-scoring-support";

describe.each(SIDES)("preceding-turn physical scoring for %s", side => {
  const other = opponent(side);
  it("requires a positive actual Challenge award, including blocked wins but excluding ties and losses", () => {
    for (const [challenger, blocker, positive] of [
      [c.scorer.id, null, true], [c.scorer.id, v.vanilla1.id, true], [c.zero.id, null, false],
      [c.scorer.id, v.vanilla3.id, false], [c.scorer.id, v.vanilla5.id, false], [null, null, false],
    ] as const) {
      const b = scoringBoard(side, { front: [challenger] }, { front: [blocker] });
      expect(scoringHolds(b.state, side)).toBe(false);
      const out = scoringNext(b.state);
      expect(out.events.some(e => e.kind === "laneResolved" && e.scored > 0)).toBe(positive);
      expect(scoringHolds(out.state, side)).toBe(positive);
      expect(scoringHolds(out.state, other, "opponent")).toBe(positive);
      expect(scoringHolds(out.state, other)).toBe(false);
      expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
    }
  });

  it("excludes flat and Fatigue point gains from character scoring", () => {
    const b = scoringBoard(side, { front: [], hand: [c.flat.id], deck: [] }, { front: [], deck: [] });
    const flat = scoringPlay(b.state, side, b.ids[side].hand[0]);
    expect(flat.state.sides[side].score).toBe(7);
    const next = scoringNext(flat.state);
    expect(next.state.sides[side].score).toBeGreaterThan(7);
    expect(scoringHolds(next.state, side)).toBe(false);
    expect(scoringHolds(next.state, other)).toBe(false);
  });

  it("excludes an actual flat Dreamwell bonus in the preceding turn", () => {
    const id = parseDreamwellCardId("5e5e5e5e-0000-4000-8000-000000623200");
    const local = createEngine(createCatalog([...SYNTHETIC_CARDS, ...Object.values(c)], [{ id, order: 1, energyAdded: 0, status: "authored", abilities: () => [event(gainPoints(7))] }]));
    const b = boardState(local.catalog, { active: side, phase: "day", scoreToWin: 1000,
      [side]: { deck: [v.vanilla1.id, v.vanilla1.id] }, [other]: { deck: [v.vanilla1.id, v.vanilla1.id] } });
    b.state.dreamwell = { deck: [id], next: 0, catalog: [id] };
    const opposing = passUntil(local, b.state, at(local, other, "day"));
    expect(opposing.events).toContainEqual(expect.objectContaining({ kind: "pointsScored", side: other, amount: 7, cause: "effect" }));
    const next = passUntil(local, opposing.state, at(local, side, "day")).state;
    expect(scoringHolds(next, other)).toBe(false);
    expect(scoringHolds(next, side)).toBe(false);
  });

  it("resolves both relative players and gates real static nth costs and play legality without mutation", () => {
    const b = scoringBoard(side, { hand: [c.extra.id, c.reader.id, c.opponentReader.id, c.gated.id] });
    const gated = b.ids[side].hand[3];
    expect(engine.legalActions(b.state, side).some(a => a.kind === "play" && a.card === gated)).toBe(false);
    expect(() => engine.apply(b.state, side, { kind: "play", card: gated, from: "hand" }, NO_PROMPTS)).toThrow(IllegalAction);
    const extra = scoringPlay(b.state, side, b.ids[side].hand[0]);
    const ready = scoringNext(extra.state, side).state;
    const before = serializeState(ready);
    const hash = stateHash(ready);
    for (let n = 0; n < 3; n++) {
      for (const viewer of SIDES) engine.view(ready, viewer);
      engine.legalActions(ready, side);
      expect(costModifier(ready, engine.catalog, gated, side).reduction).toBe(2);
      expect(scoringHolds(ready, side)).toBe(true);
    }
    expect(serializeState(ready)).toBe(before);
    expect(stateHash(ready)).toBe(hash);
    expect(engine.legalActions(ready, side).some(a => a.kind === "play" && a.card === gated)).toBe(true);
    const own = scoringPlay(ready, side, b.ids[side].hand[1]);
    expect(own.state.sides[side].currentEnergy - ready.sides[side].currentEnergy).toBe(3);
    const opposing = scoringPlay(own.state, side, b.ids[side].hand[2]);
    expect(opposing.state.sides[side].currentEnergy - own.state.sides[side].currentEnergy).toBe(1);
    const paid = scoringPlay(opposing.state, side, gated);
    expect(paid.state.sides[side].currentEnergy).toBe(opposing.state.sides[side].currentEnergy);
  });

  it("uses present control of the actual scorer rather than its scoring controller or owner", () => {
    const b = scoringBoard(side, {}, { hand: [c.steal.id, c.reader.id, c.opponentReader.id, c.returnAny.id] });
    const scored = scoringNext(b.state).state;
    const scorer = b.ids[side].front[0]!;
    const taken = scoringPlay(scored, other, b.ids[other].hand[0], scorer);
    expect(taken.state.instances[scorer]).toMatchObject({ owner: side, controller: other, zone: "play" });
    expect(engine.view(taken.state, side).characterScoring?.previous).toContainEqual({ instance: scorer, controller: side });
    expect(scoringHolds(taken.state, side)).toBe(false);
    expect(scoringHolds(taken.state, other)).toBe(true);
    const own = scoringPlay(taken.state, other, b.ids[other].hand[1]);
    expect(own.state.sides[other].currentEnergy - taken.state.sides[other].currentEnergy).toBe(3);
    const lost = scoringPlay(own.state, other, b.ids[other].hand[2]);
    expect(lost.state.sides[other].currentEnergy - own.state.sides[other].currentEnergy).toBe(1);
    const absent = scoringPlay(lost.state, other, b.ids[other].hand[3], scorer).state;
    expect(scoringHolds(absent, other)).toBe(false);
    expect(scoringHolds(absent, side)).toBe(false);
  });

  it("reads an opponent's completed turn during the player's first own turn", () => {
    const b = scoringBoard(side, {}, { hand: [c.steal.id] });
    const first = { ...b.state, config: { ...b.state.config, startingSide: side }, turn: { ...b.state.turn,
      turnNumber: 1, round: 1, sideTurns: { player: Number(side === "player"), enemy: Number(side === "enemy") } } };
    const next = scoringNext(first).state;
    expect(next.turn.sideTurns[other]).toBe(1);
    expect(scoringHolds(next, side)).toBe(true);
    const taken = scoringPlay(next, other, b.ids[other].hand[0], b.ids[side].front[0]!).state;
    expect(scoringHolds(taken, other)).toBe(true);
  });

  it("captures a borrowed scorer's actual occurrence controller independently of its owner", () => {
    const b = scoringBoard(side, { hand: [] }, { hand: [c.steal.id, c.extra.id] });
    const next = scoringNext(b.state).state;
    const scorer = b.ids[side].front[0]!;
    const taken = scoringPlay(next, other, b.ids[other].hand[0], scorer).state;
    const awakened = scoringApply(taken, other, { kind: "activate", source: scorer, ability: 2 }).state;
    const positioned = scoringApply(awakened, other, { kind: "reposition", card: scorer, to: { rank: "front", index: 0 } }).state;
    const granted = scoringPlay(positioned, other, b.ids[other].hand[1]);
    const scored = scoringNext(granted.state, other).state;
    expect(scored.instances[scorer]).toMatchObject({ owner: side, controller: other });
    expect(engine.view(scored, side).characterScoring!.previous).toEqual([{ instance: scorer, controller: other }]);
    expect(scoringHolds(scored, other)).toBe(true);
    expect(scoringHolds(scored, side)).toBe(false);
  });

  it("preserves ordinary returning physical identity and gives distinct copies no inherited scoring", () => {
    const b = scoringBoard(side, { hand: [c.extra.id] });
    const granted = scoringPlay(b.state, side, b.ids[side].hand[0]);
    const next = scoringNext(granted.state, side).state;
    const scorer = b.ids[side].front[0]!;
    const copied = scoringApply(next, side, { kind: "activate", source: scorer, ability: 1 });
    const copy = Object.values(copied.state.instances).find(card => card.printing.kind === "figmentCopy")!;
    expect(copy.id).not.toBe(scorer);
    const left = scoringApply(copied.state, side, { kind: "activate", source: scorer, ability: 0 }).state;
    expect(left.instances[scorer].zone).toBe("hand");
    expect(scoringHolds(left, side)).toBe(false);
    expect(copy.printing).toMatchObject({ cardId: c.scorer.id });
    const returned = scoringPlay(left, side, scorer).state;
    expect(returned.instances[scorer].zone).toBe("play");
    expect(scoringHolds(returned, side)).toBe(true);
    const onlyCopy = scoringApply(returned, side, { kind: "activate", source: scorer, ability: 0 }).state;
    const ceased = scoringApply(onlyCopy, side, { kind: "activate", source: copy.id, ability: 0 }).state;
    expect(ceased.instances[copy.id]).toBeUndefined();
    expect(scoringHolds(ceased, side)).toBe(false);
  });

  it("keeps prior membership when the same scorer scores in the current consecutive extra turn", () => {
    const b = scoringBoard(side, { hand: [c.extra.id, c.extra.id] });
    const first = scoringPlay(b.state, side, b.ids[side].hand[0]);
    const next = scoringNext(first.state, side);
    expect(next.state.turn.extra).toBe(true);
    expect(scoringHolds(next.state, side)).toBe(true);
    const second = scoringPlay(next.state, side, b.ids[side].hand[1]);
    const following = scoringNext(second.state, side);
    const rescore = following.steps.find(step => step.state.turn.turnNumber === next.state.turn.turnNumber && step.events.some(e => e.kind === "laneResolved" && e.scored > 0));
    expect(rescore).toBeDefined();
    expect(scoringHolds(rescore!.state, side)).toBe(true);
    expect(engine.view(rescore!.state, side).characterScoring).toMatchObject({
      current: [{ instance: b.ids[side].front[0], controller: side }], previous: [{ instance: b.ids[side].front[0], controller: side }],
    });
    expect(scoringHolds(following.state, side)).toBe(true);
    const normal = scoringNext(following.state).state;
    expect(normal.turn.extra).toBe(false);
    const intervening = scoringNext(normal, side).state;
    expect(scoringHolds(intervening, side)).toBe(false);
  });

  it("rotates on the opponent's extra turn and preserves only the immediately preceding global window", () => {
    const b = scoringBoard(side, { hand: [c.otherExtra.id] });
    const granted = scoringPlay(b.state, side, b.ids[side].hand[0]);
    const opposing = scoringNext(granted.state, other).state;
    expect(opposing.turn.extra).toBe(true);
    expect(scoringHolds(opposing, side)).toBe(true);
    const own = scoringNext(opposing, side).state;
    expect(own.turn.extra).toBe(true);
    expect(scoringHolds(own, side)).toBe(false);
  });

  it("starts empty before the first completed turn and preserves save and clone isolation", () => {
    const fresh = initialState({ seed: battleSeed(`scoring-first-${side}`), scoreToWin: 100, startingSide: side, decks: { player: [], enemy: [] }, dreamwell: [] }, engine.catalog);
    expect(scoringHolds(fresh, side)).toBe(false);
    const begun = engine.createBattle({ seed: fresh.seed, scoreToWin: 100, startingSide: side, decks: { player: [], enemy: [] }, dreamwell: [] }, NO_PROMPTS).state;
    expect(begun.turn.turnNumber).toBe(1);
    expect(scoringHolds(begun, side)).toBe(false);
    const out = scoringNext(scoringBoard(side).state).state;
    expect(scoringHolds(scoringCopy(out), side)).toBe(true);
    const cloned = cloneState(out);
    expect(serializeState(cloned)).toBe(serializeState(out));
    cloned.characterScoring!.previous!.splice(0);
    expect(scoringHolds(cloned, side)).toBe(false);
    expect(scoringHolds(out, side)).toBe(true);
  });
});
