/** Hidden physical scorer provenance uses existing anonymous observations without exposing positions. */
import { describe, expect, it } from "vitest";
import { opponent, SIDES } from "../../../state/ids";
import { invariantViolations } from "../../../testing/invariants";
import { scoringApply, scoringBoard, scoringCards as c, scoringCopy, scoringEngine as engine, scoringHolds, scoringLists, scoringNext, scoringPlay, v } from "./last-turn-scoring-support";

describe.each(SIDES)("last-turn scoring privacy for %s", side => {
  const other = opponent(side);
  it("keeps hidden membership anonymous through a real shuffle, determinization, reveal and re-entry", () => {
    const b = scoringBoard(side, { front: [c.shuffled.id], hand: [c.extra.id, c.reveal.id], deck: [v.vanilla1.id, v.vanilla2.id] });
    const granted = scoringPlay(b.state, side, b.ids[side].hand[0]);
    const next = scoringNext(granted.state, side).state;
    const scorer = b.ids[side].front[0]!;
    for (const viewer of SIDES) {
      const seen = engine.view(next, viewer);
      expect(scoringHolds(next, side)).toBe(false);
      const reference = seen.characterScoring!.previous![0].instance;
      if (next.instances[scorer].zone === "deck" || viewer !== side) {
        expect(reference).toHaveProperty("member");
        expect(Object.keys(reference!)).toEqual(["member"]);
        expect(JSON.stringify(seen.characterScoring)).not.toContain(`"${scorer}"`);
      }
      const reordered = scoringCopy(next);
      reordered.sides[side].deck.reverse();
      expect(engine.view(reordered, viewer)).toEqual(seen);
      const sampled = engine.determinize(seen, scoringLists(b.state), () => .4);
      expect(engine.view(sampled, viewer)).toEqual(seen);
      expect(invariantViolations(sampled, engine.catalog)).toEqual([]);
      if (viewer === side) {
        const restored = scoringPlay(sampled, side, b.ids[side].hand[1]).state;
        expect(scoringHolds(restored, side)).toBe(true);
        const member = restored.characterScoring!.previous![0].instance;
        expect(restored.instances[member].zone).toBe("play");
        expect(restored.instances[member].printing).toMatchObject({ cardId: c.shuffled.id });
      }
    }
    const returned = scoringPlay(next, side, b.ids[side].hand[1]).state;
    expect(returned.instances[scorer].zone).toBe("play");
    expect(scoringHolds(returned, side)).toBe(true);
    expect(scoringHolds(returned, other)).toBe(false);
  });

  it("relates the same hidden physical scorer across simultaneous previous and current windows", () => {
    const b = scoringBoard(side, { front: [c.shuffled.id], hand: [c.extra.id, c.extra.id, c.reveal.id], deck: [v.vanilla1.id, v.vanilla2.id] });
    const granted = scoringPlay(b.state, side, b.ids[side].hand[0]);
    const next = scoringNext(granted.state, side).state;
    const returned = scoringPlay(next, side, b.ids[side].hand[2]).state;
    const scorer = b.ids[side].front[0]!;
    const positioned = scoringApply(returned, side, { kind: "reposition", card: scorer, to: { rank: "front", index: 0 } }).state;
    const again = scoringPlay(positioned, side, b.ids[side].hand[1]);
    const finished = scoringNext(again.state, side);
    const concealed = finished.steps.find(step => step.state.turn.turnNumber === next.turn.turnNumber && step.events.some(event => event.kind === "shuffledIntoDeck"));
    expect(concealed).toBeDefined();
    for (const viewer of SIDES) {
      const seen = engine.view(concealed!.state, viewer);
      const current = seen.characterScoring!.current![0].instance;
      const previous = seen.characterScoring!.previous![0].instance;
      expect(current).toHaveProperty("member");
      expect(Object.keys(current!)).toEqual(["member"]);
      expect(previous).toEqual(current);
      const sampled = engine.determinize(seen, scoringLists(b.state), () => .25);
      expect(sampled.characterScoring!.current![0].instance).toBe(sampled.characterScoring!.previous![0].instance);
      expect(engine.view(sampled, viewer)).toEqual(seen);
      expect(scoringHolds(sampled, side)).toBe(false);
    }
  });

  it("never turns a ceased physical scorer into a surviving matching copy", () => {
    const b = scoringBoard(side, { hand: [c.extra.id] });
    const made = scoringApply(b.state, side, { kind: "activate", source: b.ids[side].front[0]!, ability: 1 }).state;
    const copy = Object.values(made.instances).find(card => card.printing.kind === "figmentCopy")!;
    const absent = scoringApply(made, side, { kind: "activate", source: b.ids[side].front[0]!, ability: 0 }).state;
    const awakened = scoringApply(absent, side, { kind: "activate", source: copy.id, ability: 2 }).state;
    const moved = scoringApply(awakened, side, { kind: "reposition", card: copy.id, to: { rank: "front", index: 0 } }).state;
    const granted = scoringPlay(moved, side, b.ids[side].hand[0]);
    const next = scoringNext(granted.state, side).state;
    expect(scoringHolds(next, side)).toBe(true);
    const gone = scoringApply(next, side, { kind: "activate", source: copy.id, ability: 0 }).state;
    expect(gone.instances[copy.id]).toBeUndefined();
    for (const viewer of SIDES) {
      const seen = engine.view(gone, viewer);
      expect(seen.characterScoring!.previous).toEqual([{ instance: null, controller: side }]);
      const sampled = engine.determinize(seen, scoringLists(b.state), () => .6);
      expect(engine.view(sampled, viewer).characterScoring).toEqual(seen.characterScoring);
      expect(scoringHolds(sampled, side)).toBe(false);
    }
  });
});
