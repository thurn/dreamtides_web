/**
 * `fromVoid(filter, { costAtMost: x() })` (rules § Targeting, § Costs,
 * Requirements, and X; RD-hv-umm2.495-1): Archive of the Forgotten's "Choose
 * up to two ≤X● cost events in your void to gain reclaim 0●". X is picked
 * before the targets, which are offered only among void cards whose copiable
 * cost is at most X, and each chosen card is checked against the bound again
 * as the effect resolves. A constant `costAtMost` bounds the targets the
 * same way.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { anyCharacter, costExactly, energy, energyX, event, fromVoid, stackItem, target, x } from "../../../dsl/builders";
import { BASE_VARIANT, NO_DECK_MODS } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { hasKeyword } from "../../../rules/keywords";
import { routeCosts } from "../../../rules/timing";
import { deserializeState, stateHash } from "../../../state/hash";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { banishCards } from "../banish-cards";
import { copyCard } from "../copy-card";
import { grantReclaim } from "../grant-reclaim";
import { returnToHand } from "../return-to-hand";
import { decklists } from "./with-materialized-support";

function eventCard(index: number, costs: EngineCardDefinition["costs"], abilities: EngineCardDefinition["abilities"] = () => [], speed: EngineCardDefinition["speed"] = "standard"): EngineCardDefinition {
  return { id: syntheticId(0x7e90 + index), cardType: "event", costs, spark: null, subtype: "", speed, status: "authored", abilities };
}

const G = {
  /** "2● X●: Choose up to two ≤X● cost events in your void to gain reclaim 0●." */
  archive: eventCard(0, [energy(2), energyX(0)], () => [
    event(grantReclaim(fromVoid({ cardType: "event" }, { count: 2, upTo: true, costAtMost: x() }), { costs: [energy(0)] })),
  ]),
  event2: eventCard(1, [energy(2)]),
  event3: eventCard(2, [energy(3)]),
  /** Interrupt: "Banish a card from the opponent's void." */
  banisher: eventCard(3, [energy(0)], () => [event(banishCards([fromVoid({}, { player: "opponent" })]))], "interrupt"),
  /** Interrupt: "Copy an event on the stack." */
  copier: eventCard(4, [energy(0)], () => [event(copyCard({ kind: "stackTarget", selector: stackItem({ cardType: "event" }) }))], "interrupt"),
  /** "X●: Return a character with cost X● to hand." */
  recall: eventCard(5, [energyX(0)], () => [event(returnToHand(target(anyCharacter(costExactly(x())))))]),
  /** "1●: Choose up to two ≤1● cost events in your void to gain reclaim 0●." */
  ledger: eventCard(6, [energy(1)], () => [
    event(grantReclaim(fromVoid({ cardType: "event" }, { count: 2, upTo: true, costAtMost: 1 }), { costs: [energy(0)] })),
  ]),
} as const;

const E = createEngine(testCatalog(Object.values(G)));
const deck = Array.from({ length: 6 }, () => v.vanilla3.id);
/** The player's void: events costing 0, 1, 2, and 3, a 1● character, and another 0● event. */
const VOID = [v.event0.id, v.event1.id, G.event2.id, G.event3.id, v.vanilla1.id, v.event0.id];

function setup(player: SideSetup = {}, enemy: SideSetup = {}) {
  return boardState(E.catalog, {
    active: "player",
    phase: "day",
    player: { hand: [G.archive.id], void: VOID, energy: 10, deck, ...player },
    enemy: { deck, ...enemy },
  });
}
function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = E.apply(state, side, action, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
const play = (card: InstanceId | undefined, from: "hand" | "void" = "hand"): Action => {
  if (card === undefined) throw new Error("no card");
  return { kind: "play", card, from };
};
const reclaimable = (state: BattleState, id: InstanceId) => hasKeyword(state, E.catalog, id, "reclaim");

/** The fold slice paused at the archive's target prompt after X was answered, and that prompt. */
function atTargets(state: BattleState, archive: InstanceId | undefined, chosenX: number) {
  const fold = createFoldAdapter(E, { checkEventPrefix: true });
  const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action: play(archive) });
  if (opened.kind !== "applied") throw new Error("bounced");
  const chooseX = fold.pending(opened.slice);
  if (chooseX === null) throw new Error("no X prompt");
  expect(chooseX.prompt).toMatchObject({ kind: "chooseNumber", purpose: { role: "chooseX" } });
  const picked = fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: chooseX.prompt.id, value: chosenX });
  if (picked.kind !== "applied" || picked.error !== null) throw new Error("X answer failed");
  const targets = fold.pending(picked.slice);
  if (targets === null || targets.prompt.kind !== "chooseTargets") throw new Error("no target prompt");
  return { fold, slice: picked.slice, prompt: targets.prompt, published: [...opened.published, ...picked.published] };
}

describe("fromVoid with an X cost bound", () => {
  it("offers up to two void events whose copiable cost is at most the picked X, and none above it or of another type", () => {
    const { state, ids } = setup();
    const [zero, one, two, three, character, zeroAgain] = ids.player.void;
    for (const [chosenX, offered] of [
      [0, [zero, zeroAgain]],
      [1, [zero, one, zeroAgain]],
      [3, [zero, one, two, three, zeroAgain]],
    ] as const) {
      const { prompt } = atTargets(state, ids.player.hand[0], chosenX);
      expect(prompt.candidates).toEqual(offered);
      expect(prompt.candidates).not.toContain(character);
      expect([prompt.min, prompt.max]).toEqual([0, 2]);
    }
  });

  it("reads copiable cost: a deck-entry reduction counts toward the bound, and X in a cost counts as 0", () => {
    const { state, ids } = setup({ void: [G.event3.id, G.event3.id] });
    const [reduced] = ids.player.void;
    state.instances[reduced] = { ...state.instances[reduced], variant: { ...BASE_VARIANT, deckMods: { ...NO_DECK_MODS, costReduction: 2 } } };
    expect(atTargets(state, ids.player.hand[0], 1).prompt.candidates).toEqual([reduced]);
    // A 2● X● event in the void has copiable cost 2●.
    const archives = setup({ void: [G.archive.id] });
    expect(atTargets(archives.state, archives.ids.player.hand[0], 1).prompt.candidates).toEqual([]);
    expect(atTargets(archives.state, archives.ids.player.hand[0], 2).prompt.candidates).toEqual(archives.ids.player.void);
  });

  it("grants Reclaim 0● to the chosen events, which are then played from the void for 0● and banished", () => {
    const { state, ids } = setup();
    const [zero, , two, three] = ids.player.void;
    const result = act(state, "player", play(ids.player.hand[0]), [2, [two, zero]]);
    expect(result.state.sides.player.currentEnergy).toBe(6);
    expect([zero, two, three].map((id) => reclaimable(result.state, id))).toEqual([true, true, false]);
    expect(routeCosts(result.state, E.catalog, two, "reclaim")).toEqual([energy(0)]);
    const drained = { ...result.state, sides: { ...result.state.sides, player: { ...result.state.sides.player, currentEnergy: 0 } } };
    const reclaimed = act(drained, "player", play(two, "void"));
    expect(reclaimed.state.instances[two]?.zone).toBe("banished");
    expect(reclaimed.state.sides.player.currentEnergy).toBe(0);
  });

  it("bounces an answer naming an event above X or a character, and accepts the same events at a higher X", () => {
    const { state, ids } = setup();
    const [zero, , two, , character] = ids.player.void;
    const { fold, slice, prompt } = atTargets(state, ids.player.hand[0], 1);
    for (const value of [[two], [character], [zero, two]]) {
      expect(fold.reduce(slice, { kind: "answer", side: "player", promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    const higher = atTargets(state, ids.player.hand[0], 2);
    const accepted = higher.fold.reduce(higher.slice, { kind: "answer", side: "player", promptId: higher.prompt.id, value: [zero, two] });
    if (accepted.kind !== "applied" || accepted.error !== null) throw new Error("answer failed");
    expect(reclaimable(accepted.slice.committed, two)).toBe(true);
  });

  it("re-checks the bound as the effect resolves: a target whose copiable cost rose above X gains nothing", () => {
    const { state, ids } = setup({ void: [G.event3.id, v.event1.id] }, { hand: [G.banisher.id], energy: 1 });
    const [lowered, kept] = ids.player.void;
    state.instances[lowered] = { ...state.instances[lowered], variant: { ...BASE_VARIANT, deckMods: { ...NO_DECK_MODS, costReduction: 2 } } };
    // The enemy holds an interrupt, so the archive waits on the stack.
    const cast = act(state, "player", play(ids.player.hand[0]), [1, [lowered, kept]]);
    expect(cast.state.stack).toHaveLength(1);
    cast.state.instances[lowered] = { ...cast.state.instances[lowered], variant: BASE_VARIANT };
    const resolved = act(cast.state, "enemy", { kind: "pass" });
    expect([reclaimable(resolved.state, lowered), reclaimable(resolved.state, kept)]).toEqual([false, true]);

    // With every target out of bounds, the effect does nothing and reports it.
    const alone = setup({ void: [G.event3.id] }, { hand: [G.banisher.id], energy: 1 });
    const [only] = alone.ids.player.void;
    alone.state.instances[only] = { ...alone.state.instances[only], variant: { ...BASE_VARIANT, deckMods: { ...NO_DECK_MODS, costReduction: 3 } } };
    const waiting = act(alone.state, "player", play(alone.ids.player.hand[0]), [0, [only]]);
    waiting.state.instances[only] = { ...waiting.state.instances[only], variant: BASE_VARIANT };
    const nothing = act(waiting.state, "enemy", { kind: "pass" });
    expect(nothing.events).toContainEqual(expect.objectContaining({ kind: "noLegalTarget", source: alone.ids.player.hand[0] }));
    expect(reclaimable(nothing.state, only)).toBe(false);
  });

  it("offers and re-checks a constant cost bound: at most 1● as targets are chosen and again as the effect resolves", () => {
    const { state, ids } = setup({ hand: [G.ledger.id] });
    const [zero, one, , , , zeroAgain] = ids.player.void;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) });
    if (opened.kind !== "applied") throw new Error("bounced");
    const targets = fold.pending(opened.slice);
    if (targets === null || targets.prompt.kind !== "chooseTargets") throw new Error("no target prompt");
    expect(targets.prompt.candidates).toEqual([zero, one, zeroAgain]);
    expect([targets.prompt.min, targets.prompt.max]).toEqual([0, 2]);

    // A 2● event reduced to 1● is offered; restored before the ledger resolves, it gains nothing.
    const waiting = setup({ hand: [G.ledger.id], void: [G.event2.id, v.event1.id] }, { hand: [G.banisher.id], energy: 1 });
    const [lowered, kept] = waiting.ids.player.void;
    waiting.state.instances[lowered] = { ...waiting.state.instances[lowered], variant: { ...BASE_VARIANT, deckMods: { ...NO_DECK_MODS, costReduction: 1 } } };
    const cast = act(waiting.state, "player", play(waiting.ids.player.hand[0]), [[lowered, kept]]);
    expect(cast.state.stack).toHaveLength(1);
    cast.state.instances[lowered] = { ...cast.state.instances[lowered], variant: BASE_VARIANT };
    const resolved = act(cast.state, "enemy", { kind: "pass" });
    expect([reclaimable(resolved.state, lowered), reclaimable(resolved.state, kept)]).toEqual([false, true]);
  });

  it("grants only the remaining target when an opponent's response banishes the other", () => {
    const { state, ids } = setup({}, { hand: [G.banisher.id], energy: 1 });
    const [zero, one] = ids.player.void;
    const cast = act(state, "player", play(ids.player.hand[0]), [1, [zero, one]]);
    const responded = act(cast.state, "enemy", play(ids.enemy.hand[0]), [[one]]);
    expect(responded.state.instances[one]?.zone).toBe("banished");
    expect(reclaimable(responded.state, zero)).toBe(true);
    expect(reclaimable(responded.state, one)).toBe(false);
  });

  it("offers a copy the events up to the copy's X, in its controller's void", () => {
    const { state, ids } = setup({}, { hand: [G.copier.id], void: [v.event0.id, G.event2.id, G.event3.id, v.event1.id], energy: 0 });
    const [zero, two, three, one] = ids.enemy.void;
    const cast = act(state, "player", play(ids.player.hand[0]), [2, []]);
    expect(cast.state.stack).toHaveLength(1);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: cast.state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "enemy", action: play(ids.enemy.hand[0]) });
    if (opened.kind !== "applied") throw new Error("bounced");
    const copied = fold.pending(opened.slice);
    if (copied === null || copied.prompt.kind !== "chooseTargets") throw new Error("no copy target prompt");
    expect(copied.prompt.side).toBe("enemy");
    expect(copied.prompt.candidates).toEqual([zero, two, one]);
    const answered = fold.reduce(opened.slice, { kind: "answer", side: "enemy", promptId: copied.prompt.id, value: [two, one] });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("copy answer failed");
    const after = answered.slice.committed;
    expect([two, one, zero, three].map((id) => reclaimable(after, id))).toEqual([true, true, false, false]);
  });

  it("offers a copy the characters matching the copy's X for an X-bounded character target", () => {
    const { state, ids } = setup(
      { hand: [G.recall.id], back: [v.vanilla0.id, v.vanilla2.id, v.vanilla2.id] },
      { hand: [G.copier.id], back: [v.vanilla0.id, v.vanilla2.id], energy: 0 },
    );
    const [returned, mine, theirs] = [ids.player.back[1], ids.player.back[2], ids.enemy.back[1]].map((id) => {
      if (id === null || id === undefined) throw new Error("no character");
      return id;
    });
    const cast = act(state, "player", play(ids.player.hand[0]), [2, [returned]]);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: cast.state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "enemy", action: play(ids.enemy.hand[0]) });
    if (opened.kind !== "applied") throw new Error("bounced");
    const copied = fold.pending(opened.slice);
    if (copied === null || copied.prompt.kind !== "chooseTargets") throw new Error("no copy target prompt");
    expect([...copied.prompt.candidates].sort()).toEqual([returned, mine, theirs].sort());
    const answered = fold.reduce(opened.slice, { kind: "answer", side: "enemy", promptId: copied.prompt.id, value: [mine] });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("copy answer failed");
    expect([answered.slice.committed.instances[mine]?.zone, answered.slice.committed.instances[returned]?.zone]).toEqual(["hand", "hand"]);
  });

  it("shows both sides the chosen void events, with nothing redacted and views every determinization agrees with", () => {
    const { state, ids } = setup({}, { hand: [G.banisher.id], energy: 1 });
    const [zero, , two] = ids.player.void;
    const cast = act(state, "player", play(ids.player.hand[0]), [2, [zero, two]]);
    for (const viewer of SIDES) {
      expect(E.view(cast.state, viewer).stack[0]?.choices).toEqual([{ modes: [], targets: [[zero, two]] }]);
    }
    expect(determinizationDivergences(E, cast.state, decklists(cast.state), battleSeed("void-target-x-bound"), 0)).toEqual([]);
    const resolved = act(cast.state, "enemy", { kind: "pass" });
    for (const viewer of SIDES) {
      const seen = resolved.events.flatMap((entry) => {
        const shown = eventSeenBy(entry, viewer, resolved.state);
        return shown === null ? [] : [shown];
      });
      expect(seen.filter((entry) => entry.kind === "effectStarted").map((entry) => entry.kind === "effectStarted" && entry.change.kind === "keyword" ? entry.change.instance : null)).toEqual([zero, two]);
      expect(E.view(resolved.state, viewer).instances[two]?.characteristics.keywords).toContain("reclaim");
    }
    expect(eventRedactionViolations(resolved.events, cast.state, resolved.state)).toEqual([]);
  });

  it("keeps the X-bounded target prompt across a reload, bounces stale and other-side answers, and resolves identically", () => {
    const { state, ids } = setup();
    const [zero, , two] = ids.player.void;
    const inline = E.apply(state, "player", play(ids.player.hand[0]), new ScriptedSource([2, [zero, two]]));
    const { prompt, slice, published } = atTargets(state, ids.player.hand[0], 2);
    const reloaded: BattleSlice = { ...(JSON.parse(JSON.stringify(slice)) as BattleSlice), committed: deserializeState(JSON.stringify(slice.committed)) };
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const pending = fresh.pending(reloaded);
    if (pending === null || pending.prompt.kind !== "chooseTargets") throw new Error("no target prompt after reload");
    expect(pending.prompt.candidates).toEqual(prompt.candidates);
    expect(fresh.reduce(reloaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [zero] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const answered = fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [zero, two] });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(fresh.reduce(answered.slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [zero] })).toMatchObject({ kind: "bounced" });
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline.state));
    expect([...published, ...answered.published]).toEqual(inline.events);
  });
});
