/** Chosen hand subsets use existing private prompts, one discard occasion and ordinary draws. */
import { describe, expect, it } from "vitest";
import { parsePromptId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, discardCost, energy, event, self } from "../../../dsl/builders";
import type { PlayerRef } from "../../../dsl/types";
import { triggered, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleInit } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView } from "../../../view/view";
import { createCard } from "../create-card";
import { gainPoints } from "../gain-points";
import { gainAdditionalSpark } from "../gain-spark";
import { optional } from "../optional";
import { redrawChosenHand } from "../partial-redraw-hand";
import { sequence } from "../sequence";

const card = (index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x619100 + index), status: "authored", costs: [energy(0)], abilities,
});
const own = card(0, () => [event(redrawChosenHand())]);
const other = card(1, () => [event(redrawChosenHand("opponent"))]);
const created = card(2, () => [event(sequence(createCard(v.vanilla3.id), redrawChosenHand()))]);
const payment = card(3, () => [additionalCost(discardCost(1)), event(redrawChosenHand())]);
const paused = card(4, () => [event(sequence(redrawChosenHand(), optional(gainPoints(1))))]);
const failing = card(5, () => [event(sequence(redrawChosenHand(), gainAdditionalSpark(self(), 1)))]);
const may = card(6, () => [event(optional(redrawChosenHand()))]);
const heldSource = card(7, () => [triggered(whenYouPlay({ cardType: "event" }), redrawChosenHand(), { zone: "hand", oncePerTurn: true })]);
const engine = createEngine(testCatalog([own, other, created, payment, paused, failing, may, heldSource]));
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const applied = (out: IntentOutcome) => {
  if (out.kind !== "applied" || out.error !== null) throw new Error("public redraw intent failed");
  return out;
};

function scene(controller: Side, player: PlayerRef = "you", source = player === "you" ? own : other, count = 3, deckCount = 4) {
  const holder = player === "you" ? controller : opponent(controller);
  const held = [v.vanilla1.id, v.vanilla1.id, v.vanilla2.id].slice(0, count);
  const board = boardState(engine.catalog, { active: controller, phase: "day",
    player: { hand: [...(controller === "player" ? [source.id] : []), ...(holder === "player" ? held : [v.vanilla3.id])], deck: Array.from({ length: deckCount }, () => v.vanilla2.id), energy: 10 },
    enemy: { hand: [...(controller === "enemy" ? [source.id] : []), ...(holder === "enemy" ? held : [v.vanilla3.id])], deck: Array.from({ length: deckCount }, () => v.vanilla2.id), energy: 10 } });
  const initial: BattleSlice = { committed: board.state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const init: BattleInit = { seed: board.state.seed, scoreToWin: board.state.config.scoreToWin, startingSide: controller,
    decks: { player: [...board.ids.player.hand, ...board.ids.player.deck].map((id) => ({ cardId: board.state.instances[id].printing.kind === "card" ? board.state.instances[id].printing.cardId : v.vanilla1.id })),
      enemy: [...board.ids.enemy.hand, ...board.ids.enemy.deck].map((id) => ({ cardId: board.state.instances[id].printing.kind === "card" ? board.state.instances[id].printing.cardId : v.vanilla1.id })) }, dreamwell: [] };
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const opened = applied(fold.reduce(initial, { kind: "battleAction", side: controller,
    action: { kind: "play", card: board.ids[controller].hand[0], from: "hand" } }));
  return { ...board, controller, holder, fold, initial, init, opened };
}
const subsetPrompt = (b: ReturnType<typeof scene>, slice = b.opened.slice) => {
  const pending = b.fold.pending(slice);
  if (pending === null || pending.prompt.kind !== "chooseCards") throw new Error("subset prompt missing");
  return { ...pending, prompt: pending.prompt };
};
function answer(b: ReturnType<typeof scene>, value: readonly InstanceId[], slice = b.opened.slice) {
  const pending = subsetPrompt(b, slice);
  return applied(b.fold.reduce(slice, { kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value }));
}
const redrawEvents = (out: ReturnType<typeof applied>) => out.published.filter((event) =>
  event.kind === "discarded" || event.kind === "discardBatch" || event.kind === "cardDrawn" || event.kind === "fatigue");

describe("redrawChosenHand", () => {
  it.each(["player", "enemy"] as const)("includes a genuinely held source in %s's available subset", (side) => {
    const board = boardState(engine.catalog, { active: side, phase: "day", [side]: {
      hand: [v.event0.id, heldSource.id, v.vanilla1.id], deck: [v.vanilla2.id], energy: 10 }, [opponent(side)]: { deck: [v.vanilla2.id] } });
    const fold = createFoldAdapter(engine), initial: BattleSlice = { committed: board.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = applied(fold.reduce(initial, { kind: "battleAction", side, action: { kind: "play", card: board.ids[side].hand[0], from: "hand" } }));
    const pending = fold.pending(opened.slice);
    if (pending === null || pending.prompt.kind !== "chooseCards") throw new Error("held source prompt missing");
    const source = board.ids[side].hand[1]; expect(pending.prompt.candidates).toContain(source);
    const done = applied(fold.reduce(opened.slice, { kind: "answer", side, promptId: pending.prompt.id, value: [source] }));
    expect(done.slice.committed.sides[side].void).toContain(source);
    expect(done.slice.committed.sides[side].hand).toEqual([board.ids[side].hand[2], board.ids[side].deck[0]]);
  });

  it("redraws only the chosen physical subset and retains held order", () => {
    for (const controller of ["player", "enemy"] as const) for (const player of ["you", "opponent"] as const) for (const count of [0, 2, 3]) {
      const b = scene(controller, player), pending = subsetPrompt(b), held = pending.prompt.candidates;
      expect(pending.prompt).toMatchObject({ side: b.holder, min: 0, max: held.length, purpose: { role: "discard" }, cancellable: false });
      const selected = count === 2 ? [held[2], held[0]] : held.slice(0, count);
      const done = answer(b, selected), canonical = held.filter((id) => selected.includes(id));
      expect(done.published.filter((event) => event.kind === "discarded").map((event) => event.instance)).toEqual(canonical);
      expect(done.slice.committed.sides[b.holder].hand).toEqual([...held.filter((id) => !selected.includes(id)), ...b.ids[b.holder].deck.slice(0, count)]);
      expect(done.published.filter((event) => event.kind === "cardDrawn")).toHaveLength(count);
      expect(done.slice.committed.sides[opponent(b.holder)].hand).toEqual(b.opened.slice.committed.sides[opponent(b.holder)].hand);
      expect(invariantViolations(done.slice.committed, engine.catalog)).toEqual([]);
    }
  });

  it("counts completed selected discards across created replacements and earlier payments", () => {
    for (const side of ["player", "enemy"] as const) {
      const b = scene(side, "you", created), pending = subsetPrompt(b);
      const added = pending.prompt.candidates.find((id) => pending.display.instances[id].status.created);
      if (added === undefined) throw new Error("genuine created card missing");
      const done = answer(b, [added, pending.prompt.candidates[0]]);
      expect(done.slice.committed.instances[added]).toBeUndefined();
      expect(done.published.filter((event) => event.kind === "cardDrawn")).toHaveLength(2);
      expect(done.published.filter((event) => event.kind === "discardBatch")).toEqual([{ kind: "discardBatch", side, count: 2 }]);
      const paid = scene(side, "you", payment), cost = subsetPrompt(paid);
      expect(cost.prompt.cancellable).toBe(true);
      const committed = answer(paid, [cost.prompt.candidates[0]]), remaining = subsetPrompt(paid, committed.slice);
      const redrawn = answer(paid, [remaining.prompt.candidates[0]], committed.slice);
      expect([...committed.published, ...redrawn.published].filter((event) => event.kind === "discardBatch")).toEqual([
        { kind: "discardBatch", side, count: 1 }, { kind: "discardBatch", side, count: 1 }]);
      expect(redrawn.published.filter((event) => event.kind === "cardDrawn")).toHaveLength(1);
    }
  });

  it("completes one batch after ordered selected discards and none for zero", () => {
    for (const selectedCount of [0, 1, 3]) {
      const b = scene("player"), held = subsetPrompt(b).prompt.candidates, done = answer(b, held.slice(0, selectedCount));
      const kinds = redrawEvents(done).map((event) => event.kind);
      expect(kinds).toEqual(selectedCount === 0 ? [] : [
        ...Array.from({ length: selectedCount }, () => "discarded"), "discardBatch", ...Array.from({ length: selectedCount }, () => "cardDrawn")]);
      expect(done.published.filter((event) => event.kind === "discardBatch")).toEqual(selectedCount === 0 ? [] : [{ kind: "discardBatch", side: "player", count: selectedCount }]);
    }
  });

  it("keeps unselected and replacement draws private while exposing the completed count", () => {
    for (const side of ["player", "enemy"] as const) {
      const b = scene(side), pending = subsetPrompt(b), viewer = opponent(side), chosen = pending.prompt.candidates[1];
      expect(promptView(pending.prompt, viewer, pending.display)).toMatchObject({ candidates: [] });
      const done = answer(b, [chosen]);
      expect(eventRedactionViolations(done.published, pending.display, done.slice.committed)).toEqual([]);
      for (const event of done.published) {
        if (event.kind === "discardBatch") expect(eventSeenBy(event, viewer, done.slice.committed)).toEqual({ kind: "discardBatch", side, count: 1 });
        if (event.kind === "cardDrawn") expect(eventSeenBy(event, viewer, done.slice.committed)).toMatchObject({ kind: "cardDrawn", instance: null });
      }
      const hidden = engine.view(done.slice.committed, viewer);
      for (const id of done.slice.committed.sides[side].hand) expect(hidden.instances[id]).toBeUndefined();
    }
  });

  it("refuses invalid stale foreign and competing subset answers without partial redraw", () => {
    for (const side of ["player", "enemy"] as const) {
      const b = scene(side), pending = subsetPrompt(b), held = pending.prompt.candidates, before = copy(b.opened.slice);
      const invalid = [[held[0], held[0]], [b.ids[opponent(side)].hand[0]], [...held, b.ids[opponent(side)].hand[0]], true] as const;
      for (const value of invalid) expect(b.fold.reduce(b.opened.slice, { kind: "answer", side, promptId: pending.prompt.id, value })).toMatchObject({ kind: "bounced", reason: "illegalAnswer" });
      expect(b.fold.reduce(b.opened.slice, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: [] })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
      expect(b.fold.reduce(b.opened.slice, { kind: "answer", side, promptId: parsePromptId("0:0:0"), value: [] })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
      expect(b.fold.reduce(b.opened.slice, { kind: "cancel", side, promptId: pending.prompt.id })).toMatchObject({ kind: "bounced", reason: "notCancellable" });
      expect(b.opened.slice).toEqual(before);
      const done = answer(b, [held[0]]);
      expect(b.fold.reduce(done.slice, { kind: "answer", side, promptId: pending.prompt.id, value: [held[1]] })).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
      const cost = scene(side, "you", payment), startHash = stateHash(cost.initial.committed), prompt = subsetPrompt(cost);
      const cancelled = applied(cost.fold.reduce(cost.opened.slice, { kind: "cancel", side, promptId: prompt.prompt.id }));
      expect(stateHash(cancelled.slice.committed)).toBe(startHash); expect(cancelled.published).toEqual([]);
      const reopened = applied(cost.fold.reduce(cancelled.slice, { kind: "battleAction", side, action: { kind: "play", card: cost.ids[side].hand[0], from: "hand" } }));
      expect(cost.fold.reduce(reopened.slice, { kind: "answer", side, promptId: prompt.prompt.id, value: [] })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    }
  });

  it("reloads pending and partially presented redraws without duplicate publication", () => {
    for (const side of ["player", "enemy"] as const) {
      const b = scene(side, "you", paused), pending = subsetPrompt(b);
      const saved = parseEngineBattleFold(copy({ init: b.init, slice: b.opened.slice }));
      if (saved === null) throw new Error("pending subset strict load rejected");
      const cold = createFoldAdapter(engine, { checkEventPrefix: true });
      expect(cold.pending(saved.slice)).toEqual(pending);
      const intent = { kind: "answer" as const, side, promptId: pending.prompt.id, value: [pending.prompt.candidates[2], pending.prompt.candidates[0]] };
      const warm = applied(b.fold.reduce(b.opened.slice, intent)), replayed = applied(cold.reduce(saved.slice, intent));
      expect(replayed).toEqual(warm);
      expect(warm.published.filter((event) => event.kind === "cardDrawn")).toHaveLength(2);
      const after = parseEngineBattleFold(copy({ init: b.init, slice: warm.slice }));
      if (after === null) throw new Error("redraw prefix strict load rejected");
      const confirm = cold.pending(after.slice);
      if (confirm === null || confirm.prompt.kind !== "confirm") throw new Error("trailing genuine suspension missing");
      const final = applied(cold.reduce(after.slice, { kind: "answer", side, promptId: confirm.prompt.id, value: false }));
      expect(redrawEvents(final)).toEqual([]);
      expect(final.slice.committed.sides[side].hand).toEqual([pending.prompt.candidates[1], ...b.ids[side].deck.slice(0, 2)]);
    }
  });

  it("rolls back a redraw error through the existing fold boundary", () => {
    const b = scene("player", "you", failing), pending = subsetPrompt(b);
    const out = b.fold.reduce(b.opened.slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: pending.prompt.candidates.slice(0, 2) });
    if (out.kind !== "applied" || out.error === null) throw new Error("genuine event-source spark error missing");
    expect(out.slice.committed.sides.player.hand).toEqual(b.opened.slice.committed.sides.player.hand);
    expect(out.slice.committed.sides.player.deck).toEqual(b.opened.slice.committed.sides.player.deck);
    expect(out.published.some((event) => event.kind === "discarded" || event.kind === "discardBatch" || event.kind === "cardDrawn")).toBe(false);
  });

  it("uses existing optional decline and empty-hand semantics with normal Fatigue", () => {
    for (const side of ["player", "enemy"] as const) {
      const b = scene(side, "you", may), pending = b.fold.pending(b.opened.slice);
      if (pending === null || pending.prompt.kind !== "confirm") throw new Error("optional prompt missing");
      const declined = applied(b.fold.reduce(b.opened.slice, { kind: "answer", side, promptId: pending.prompt.id, value: false }));
      expect(redrawEvents(declined)).toEqual([]); expect(declined.slice.committed.sides[side].hand).toEqual(b.opened.slice.committed.sides[side].hand);
      const empty = scene(side, "you", own, 0); expect(redrawEvents(empty.opened)).toEqual([]);
      const exhausted = scene(side, "you", own, 3, 0), done = answer(exhausted, subsetPrompt(exhausted).prompt.candidates);
      expect(done.published.filter((event) => event.kind === "fatigue")).toEqual([1, 2, 4].map((points) => ({ kind: "fatigue", side, points })));
      expect(done.slice.committed.sides[opponent(side)].score).toBe(7);
    }
  });
});
