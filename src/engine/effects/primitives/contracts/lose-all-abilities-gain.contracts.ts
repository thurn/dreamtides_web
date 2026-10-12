import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { hasKeyword } from "../../../rules/keywords";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { cloneState } from "../../../state/clone";
import { stateHash } from "../../../state/hash";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, FloatingChange } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, placeFigment } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { at, passUntil } from "../../../testing/trigger-harness";
import { invariantViolations } from "../../../testing/invariants";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { view } from "../../../view/view";
import {
  abilityKinds, activate, activations, board, decklists, engine, gains, LA, losses, play, run, savedJourney, sliceOf, v, WISP,
} from "./lose-all-abilities-support";

const base = { amplified: false };

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

/** The player's hijacker after its ▸Materialized ability took the abilities of the enemy's donor, beside an enemy vanilla character. */
function hijacked() {
  const { state, ids } = boardState(engine.catalog, board(
    { hand: [LA.hijacker.id, v.event0.id], back: [v.vanilla1.id] },
    { back: [LA.donor.id, v.vanilla2.id], hand: [LA.dissolver.id] },
  ));
  const [donor] = ids.enemy.back as InstanceId[];
  const result = run(state, [["player", play(ids.player.hand[0])]], new ScriptedSource([[donor]]));
  return { ...result, start: state, ids, donor, hijacker: ids.player.hand[0] };
}

describe("loseAllAbilities: this character gains those abilities", () => {
  it("gives the source exactly the abilities the enemy lost, which outlast the enemy's loss", () => {
    const { state, start, ids, donor, hijacker } = hijacked();
    const [loss] = losses(state);
    expect(loss).toMatchObject({ controller: "player", source: hijacker, expiry: { at: "never" }, change: { kind: "loseAbilities", instance: donor } });
    expect(gains(state)).toEqual([expect.objectContaining({
      controller: "player", source: hijacker, expiry: { at: "sourceLeavesPlay", source: hijacker },
      change: { kind: "abilities", instance: hijacker, cardId: LA.donor.id, variant: base },
    })]);
    expect(abilityKinds(state, donor)).toEqual([]);
    expect(abilityKinds(state, hijacker)).toEqual(["0:triggered", "1:keyword", "2:activated", "3:triggered", "4:static"]);
    expect([hasKeyword(state, engine.catalog, hijacker, "vengeful"), hasKeyword(state, engine.catalog, donor, "vengeful")]).toEqual([true, false]);
    const ally = ids.player.back[0]!;
    expect(effectiveSpark(state, engine.catalog, ally)).toBe(effectiveSpark(start, engine.catalog, ally) + 1);
    expect(activations(state, "player", hijacker)).toEqual([2]);
    for (const viewer of SIDES) expect(view(state, viewer, engine.catalog).instances[hijacker]?.status.gainedAbilities).toEqual([{ cardId: LA.donor.id, variant: base }]);
    expect(invariantViolations(state, engine.catalog)).toEqual([]);
    expect(determinizationDivergences(engine, state, decklists([LA.hijacker, v.event0, v.vanilla1], [LA.donor, v.vanilla2, LA.dissolver]), battleSeed("hijack"), 0)).toEqual([]);

    // The donor leaves play: its loss ends, and the hijacker keeps what it gained.
    const { state: after, events } = run(state, [["player", play(ids.player.hand[1])], ["enemy", play(ids.enemy.hand[0])]], new ScriptedSource([[donor]]));
    expect(after.instances[donor]?.zone).toBe("void");
    expect(events.some((event) => event.kind === "effectEnded" && event.effect === loss?.id)).toBe(true);
    expect(abilityKinds(after, hijacker)).toEqual(["0:triggered", "1:keyword", "2:activated", "3:triggered", "4:static"]);
    expect(after.sides.player.score).toBe(state.sides.player.score + 2);
    expect(run(after, [["player", activate(hijacker, 2)]]).state.sides.player.score).toBe(after.sides.player.score + 1);
  });

  it("gains the enemy's own abilities and those it gained since it last lost them, not the lost ones", () => {
    const { state, ids } = boardState(engine.catalog, board(
      { hand: [LA.hijacker.id], void: [LA.mourner.id, LA.donor.id] },
      { back: [v.vanilla2.id], hand: [LA.lendEnemy.id, LA.silence.id, LA.lendEnemy.id] },
      "enemy",
    ));
    const target = ids.enemy.back[0]!;
    const [lendFirst, silence, lendSecond] = ids.enemy.hand;
    const prepared = run(state, [["enemy", play(lendFirst)], ["enemy", play(silence)], ["enemy", play(lendSecond)]]).state;
    expect(prepared.instances[target]?.status).toMatchObject({ gainedAbilities: [{ cardId: LA.mourner.id }, { cardId: LA.donor.id }], lostAbilities: 1 });
    const { state: after } = run(passUntil(engine, prepared, at(engine, "player", "day")).state, [["player", play(ids.player.hand[0])]]);
    const hijacker = ids.player.hand[0];
    // Its own abilities ended with the earlier loss, so only the donor's, gained since, pass to the hijacker.
    expect(after.instances[hijacker]?.status.gainedAbilities).toEqual([{ cardId: LA.donor.id, variant: base }]);
    expect(after.instances[target]?.status).toMatchObject({ lostAbilities: 2 });
    expect(abilityKinds(after, target)).toEqual([]);
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
  });

  it("takes a figment's abilities, which the figment loses until it ceases to exist", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [LA.hijacker.id, v.event0.id] }, { hand: [LA.dissolver.id] }));
    const wisp = placeFigment(state, "enemy", { rank: "back", index: 0 }, { kind: "figment", figment: WISP.id, spark: 1 });
    expect([effectiveSpark(state, engine.catalog, wisp), hasKeyword(state, engine.catalog, wisp, "vengeful")]).toEqual([3, true]);
    const hijacker = ids.player.hand[0];
    const lost = run(state, [["player", play(hijacker)]]).state;
    expect(instanceOrigin(instanceOf(lost, wisp))).toEqual({ kind: "figment", id: WISP.id, lost: true });
    expect([effectiveSpark(lost, engine.catalog, wisp), hasKeyword(lost, engine.catalog, wisp, "vengeful")]).toEqual([1, false]);
    expect(gains(lost).map(({ change }) => change)).toEqual([{ kind: "abilities", instance: hijacker, figment: WISP.id }]);
    expect(lost.instances[hijacker]?.status.gainedAbilities).toEqual([{ figment: WISP.id }]);
    expect(abilityKinds(lost, hijacker)).toEqual(["0:triggered", "1:keyword", "2:static", "3:triggered"]);
    expect([effectiveSpark(lost, engine.catalog, hijacker), hasKeyword(lost, engine.catalog, hijacker, "vengeful")]).toEqual([3, true]);
    expect(invariantViolations(lost, engine.catalog)).toEqual([]);
    const { state: after, events } = run(lost, [["player", play(ids.player.hand[1])], ["enemy", play(ids.enemy.hand[0])]], new ScriptedSource([[wisp]]));
    expect(after.instances[wisp]).toBeUndefined();
    expect(events.some((event) => event.kind === "effectEnded" && event.effect === losses(lost)[0]?.id)).toBe(true);
    expect(losses(after)).toEqual([]);
    expect(after.sides.player.score).toBe(lost.sides.player.score + 5);
    expect(hasKeyword(after, engine.catalog, hijacker, "vengeful")).toBe(true);
  });

  it("ends a figment's payable loss, unpaid, as the figment ceases to exist", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [LA.fracture.id, LA.dissolver.id] }, {}));
    const wisp = placeFigment(state, "enemy", { rank: "back", index: 0 }, { kind: "figment", figment: WISP.id, spark: 1 });
    const lost = run(state, [["player", play(ids.player.hand[0])]]).state;
    expect(lost.payable).toEqual([expect.objectContaining({ payer: "enemy", affects: [wisp] })]);
    const { state: after, events } = run(lost, [["player", play(ids.player.hand[1])]]);
    expect(events.filter((event) => event.kind === "payableEffectEnded")).toEqual([expect.objectContaining({ paid: false })]);
    expect([after.payable, after.floating]).toEqual([[], []]);
  });

  it("still makes the enemy lose its abilities, and gains nothing, when the source is not in play", () => {
    const { state, ids } = boardState(engine.catalog, board({ void: [LA.hijacker.id], hand: [LA.stealFromVoid.id] }, { back: [LA.donor.id] }));
    const after = run(state, [["player", play(ids.player.hand[0])]]).state;
    expect(losses(after)).toEqual([expect.objectContaining({ change: { kind: "loseAbilities", instance: ids.enemy.back[0] } })]);
    expect(gains(after)).toEqual([]);
    expect(after.instances[ids.player.void[0]]?.status.gainedAbilities).toBeUndefined();
  });

  it("keeps a static keyword gained after the loss at the same clock", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [LA.hijacker.id], hand: [LA.lossThenSteal.id] }, { back: [LA.veiler.id] }));
    const hijacker = ids.player.back[0]!;
    const veiler = ids.enemy.back[0]!;
    expect(hasKeyword(state, engine.catalog, veiler, "veil")).toBe(true);
    const after = run(state, [["player", play(ids.player.hand[0])]]).state;
    const [own, taken] = losses(after);
    expect([own?.change, taken?.change]).toEqual([{ kind: "loseAbilities", instance: hijacker }, { kind: "loseAbilities", instance: veiler }]);
    expect(gains(after)[0]?.timestamp).toBe(own?.timestamp);
    expect(after.instances[hijacker]?.status).toMatchObject({ gainedAbilities: [{ cardId: LA.veiler.id, variant: base }], lostAbilities: 0 });
    expect(abilityKinds(after, hijacker)).toEqual(["1:static"]);
    expect([hasKeyword(after, engine.catalog, hijacker, "veil"), hasKeyword(after, engine.catalog, veiler, "veil")]).toEqual([true, false]);
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
  });

  it("keeps a static keyword gained after the loss at the same clock on a figment copy", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [LA.lossThenSteal.id] }, { back: [LA.veiler.id] }));
    const copy = placeFigment(state, "player", { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: LA.hijacker.id, spark: null });
    const after = run(state, [["player", play(ids.player.hand[0])]]).state;
    expect(after.instances[copy]?.status).toMatchObject({ gainedAbilities: [{ cardId: LA.veiler.id, variant: base }], lostAbilities: 0 });
    expect(gains(after)[0]?.timestamp).toBe(losses(after)[0]?.timestamp);
    expect(hasKeyword(after, engine.catalog, copy, "veil")).toBe(true);
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
  });

  it("works for either controller: the enemy's hijacker takes the player's abilities", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [LA.donor.id] }, { hand: [LA.hijacker.id] }, "enemy"));
    const donor = ids.player.back[0]!;
    const hijacker = ids.enemy.hand[0];
    const after = run(state, [["enemy", play(hijacker)]]).state;
    expect(losses(after)).toEqual([expect.objectContaining({ controller: "enemy", change: { kind: "loseAbilities", instance: donor } })]);
    expect(after.instances[hijacker]?.status.gainedAbilities).toEqual([{ cardId: LA.donor.id, variant: base }]);
    expect([hasKeyword(after, engine.catalog, hijacker, "vengeful"), hasKeyword(after, engine.catalog, donor, "vengeful")]).toEqual([true, false]);
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
  });
});

describe("loseAllAbilities: announcing a loss whose source is gone", () => {
  it("shows both players the loss of a public card's abilities, its ceased source redacted", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [LA.ceasedHijack.id] }, { back: [LA.donor.id] }));
    const copy = placeFigment(state, "player", { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: LA.hijacker.id, spark: null });
    const donor = ids.enemy.back[0]!;
    const { state: after, events } = run(state, [["player", play(ids.player.hand[0])]]);
    expect(after.instances[copy]).toBeUndefined();
    const started = events.filter((event) => event.kind === "effectStarted");
    expect(started.map((event) => event.change)).toEqual([{ kind: "loseAbilities", instance: donor }]);
    for (const side of SIDES) {
      expect(eventSeenBy(started[0], side, after)).toEqual({ ...started[0], source: null });
      expect(view(after, side, engine.catalog).floating).toEqual([expect.objectContaining({ source: null, change: { kind: "loseAbilities", instance: donor } })]);
    }
    expect(gains(after)).toEqual([]);
  });

  it("keeps a source-redacted change hidden when its card is not public, and names a source only to a side that sees it", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [v.vanilla1.id], back: [LA.donor.id] }, { hand: [LA.hijacker.id] }));
    const [handCard] = ids.player.hand;
    const donor = ids.player.back[0]!;
    const hidden = ids.enemy.hand[0];
    const started = (source: InstanceId, change: FloatingChange): EngineEvent =>
      ({ kind: "effectStarted", effect: "e9", controller: "enemy", source, expiry: { at: "never" }, change });
    // A cost change to a card in the player's hand, from a source that has ceased to exist: neither side sees it begin.
    const costed = started("i999", { kind: "cardCost", instance: handCard, mode: "reduce", amount: 1 });
    expect(SIDES.map((side) => eventSeenBy(costed, side, state))).toEqual([null, null]);
    // A loss on a public card from a card in the enemy's hand: the enemy sees its source, the player sees it redacted.
    const lost = started(hidden, { kind: "loseAbilities", instance: donor });
    expect(eventSeenBy(lost, "enemy", state)).toEqual(lost);
    expect(eventSeenBy(lost, "player", state)).toEqual({ ...lost, source: null });
  });
});

describe("loseAllAbilities recovery", () => {
  it("reconstructs the target prompt on reload, rejects stale, foreign and illegal answers, and commits once", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = boardState(engine.catalog, board({ hand: [LA.hijacker.id] }, { back: [LA.donor.id, v.vanilla2.id] }));
    const [donor, other] = ids.enemy.back as InstanceId[];
    const hijacker = ids.player.hand[0];
    let slice = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(hijacker) }));
    while (fold.pending(slice) === null && slice.committed.stack.length > 0) {
      slice = applied(fold.reduce(slice, { kind: "battleAction", side: slice.committed.priority ?? "player", action: { kind: "pass" } }));
    }
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const mode = fresh.pending(saved);
    expect(mode).toEqual(fold.pending(slice));
    if (mode === null) throw new Error("expected the target prompt");
    const committed = stateHash(saved.committed);
    const answer = (side: Side, value: unknown, from: BattleSlice) => fresh.reduce(from, { kind: "answer", side, promptId: mode.prompt.id, value: value as never });
    expect(answer("player", [donor], { ...saved, attempt: saved.attempt + 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer("enemy", [donor], saved)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [[hijacker], [donor, other], []]) expect(answer("player", value, saved)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(stateHash(saved.committed)).toBe(committed);
    let done = applied(answer("player", [donor], saved));
    while (done.committed.stack.length > 0) {
      done = applied(fresh.reduce(done, { kind: "battleAction", side: done.committed.priority ?? "player", action: { kind: "pass" } }));
    }
    expect(losses(done.committed).map(({ change }) => change)).toEqual([{ kind: "loseAbilities", instance: donor }]);
    expect(gains(done.committed).map(({ change }) => change)).toEqual([{ kind: "abilities", instance: hijacker, cardId: LA.donor.id, variant: base }]);
    expect(answer("player", [donor], done)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("saves, loads, clones and hashes losses, and rejects mirrors that disagree with them or malformed losses", () => {
    const { state, donor, hijacker } = hijacked();
    const load = (changed: BattleState) => parseJourneyBattleFoldState(savedJourney(sliceOf(changed)));
    expect(load(state)).not.toBeNull();
    expect(cloneState(state)).toEqual(state);
    expect(stateHash(JSON.parse(JSON.stringify(state)) as BattleState)).toBe(stateHash(state));
    expect(stateHash(cloneState(state))).toBe(stateHash(state));
    const unlost = { ...state, floating: state.floating.filter(({ change }) => change.kind !== "loseAbilities") };
    expect(stateHash(unlost)).not.toBe(stateHash(state));
    const withStatus = (id: InstanceId, status: Record<string, unknown>) => ({
      ...state, instances: { ...state.instances, [id]: { ...state.instances[id], status: { ...state.instances[id].status, ...status } } },
    });
    const loss = losses(state)[0];
    const withLoss = (changed: Record<string, unknown>) => ({ ...state, floating: state.floating.map((effect) => (effect.id === loss.id ? { ...effect, ...changed } : effect)) });
    const queued = (origin: Record<string, unknown>) => ({ ...state, triggerQueue: [{ source: hijacker, controller: "player", origin, ability: 0, node: null, subject: null }] }) as unknown as BattleState;
    expect(load(queued({ kind: "card", cardId: LA.hijacker.id, variant: base, gained: [{ figment: WISP.id }], lost: 1 }))).not.toBeNull();
    expect(load(queued({ kind: "figment", id: WISP.id, lost: true }))).not.toBeNull();
    for (const malformed of [
      withStatus(donor, { lostAbilities: undefined }), withStatus(donor, { lostAbilities: 1 }), withStatus(donor, { lostAbilities: -1 }),
      withStatus(hijacker, { lostAbilities: 0 }),
      withLoss({ change: { kind: "loseAbilities" } }), withLoss({ change: { kind: "loseAbilities", instance: "i999" } }),
      withLoss({ change: { kind: "loseAbilities", instance: hijacker } }),
      queued({ kind: "card", cardId: LA.hijacker.id, variant: base, lost: 1 }), queued({ kind: "card", cardId: LA.hijacker.id, variant: base, lost: -1 }),
      queued({ kind: "figment", id: WISP.id, lost: 0 }), queued({ kind: "card", cardId: LA.hijacker.id, variant: base, gained: [{ figment: WISP.id, cardId: LA.donor.id }] }),
    ]) {
      expect(load(malformed)).toBeNull();
    }
  });
});
