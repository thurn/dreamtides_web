/**
 * Presentation observation of random deck picks (RD-hv-umm2.83-1): every
 * state the fold copies while picked cards leave a deck shows each viewer
 * only the deck places the removals seen so far determine.
 */
import { describe, expect, it } from "vitest";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { CardId, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { playFromHand } from "../../../testing/scenario";
import { view } from "../../../view/view";
import { engine, knowingOnly, leftDeck, plainDeck, twin, v } from "./random-selection-support";

const VIEWERS: readonly Side[] = ["player", "enemy"];

/** Plays Twin from `state`, presenting every event; the published events, the state copied at each, and the committed state. */
function observePlay(state: BattleState, ids: ReturnType<typeof boardState>["ids"]) {
  const fold = createFoldAdapter(engine);
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }, { presented: () => true, limit: 256 });
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("play failed");
  const snapshots = outcome.published.map((event) => {
    const observed = fold.observed(event);
    if (observed === undefined) throw new Error(`no observed state at ${event.kind}`);
    return observed;
  });
  return { published: outcome.published, snapshots, committed: outcome.slice.committed };
}

/** The copied states taken after a card has left the player's deck. */
const afterRemovals = (state: BattleState, snapshots: readonly BattleState[]) => snapshots.filter((observed) => leftDeck(state, observed, "player").length > 0);

const sees = (state: BattleState, viewer: Side, id: InstanceId) => view(state, viewer, engine.catalog).instances[id] !== undefined;

const twinOn = (deck: readonly CardId[], back: readonly CardId[] = []) =>
  boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [twin.id], back, deck, energy: 5 }, enemy: { deck: plainDeck } });

describe("randomSelection presentation", () => {
  it("hides a known card whose place the removals leave open in every state copied as the picks leave, for both viewers", () => {
    // The player knows the events at 0 and 2, the enemy the one at 2; the characters at 1, 3, 4 are the only matches.
    const { state: placed, ids } = twinOn([v.event0.id, v.vanilla1.id, v.event1.id, v.vanilla2.id, v.vanilla0.id]);
    const [top, , middle] = ids.player.deck;
    const state = knowingOnly(knowingOnly(placed, "player", [top, middle]), "enemy", [middle]);
    const { published, snapshots, committed } = observePlay(state, ids);
    const removing = afterRemovals(state, snapshots);
    expect(published.filter((event) => event.kind === "materialized")).toHaveLength(2);
    expect(removing.length).toBeGreaterThanOrEqual(2);
    for (const observed of removing) {
      for (const viewer of VIEWERS) expect(sees(observed, viewer, middle)).toBe(false);
      expect(sees(observed, "player", top)).toBe(true);
    }
    expect(committed.knownTo).toEqual({ player: [top], enemy: [] });
  });

  it("hides a known card while the removals so far leave its place open, and shows it once they determine it", () => {
    // Both characters are picked: after the first leaves the event's place is open; after both, it is the whole deck.
    const { state: placed, ids } = twinOn([v.vanilla1.id, v.event0.id, v.vanilla2.id]);
    const [, known] = ids.player.deck;
    const state = knowingOnly(placed, "player", [known]);
    const { published, snapshots, committed } = observePlay(state, ids);
    const removing = afterRemovals(state, snapshots);
    const partial = removing.filter((observed) => leftDeck(state, observed, "player").length === 1);
    expect(partial.length).toBeGreaterThanOrEqual(1);
    for (const observed of partial) expect(sees(observed, "player", known)).toBe(false);
    expect(committed.sides.player.deck).toEqual([known]);
    expect(committed.knownTo.player).toEqual([known]);
    expect(sees(committed, "player", known)).toBe(true);
    expect(eventRedactionViolations(published, state, committed)).toEqual([]);
    expect(invariantViolations(committed, engine.catalog)).toEqual([]);
  });

  it("keeps a pick held back by capacity hidden in place and the open known place hidden at the capacity event", () => {
    const { state: placed, ids } = twinOn([v.vanilla1.id, v.event0.id, v.vanilla2.id], Array.from({ length: 9 }, () => v.vanilla1.id));
    const [, known] = ids.player.deck;
    const state = knowingOnly(placed, "player", [known]);
    const { published, snapshots, committed } = observePlay(state, ids);
    const capacity = published.findIndex((event) => event.kind === "capacityReached");
    expect(capacity).toBeGreaterThanOrEqual(0);
    for (const observed of afterRemovals(state, snapshots)) expect(sees(observed, "player", known)).toBe(false);
    expect(sees(snapshots[capacity], "player", known)).toBe(false);
    expect(committed.knownTo.player).toEqual([]);
  });
});
