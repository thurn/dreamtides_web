import { describe, expect, it } from "vitest";
import { eventLogRecords } from "../../../log";
import { canActivate, instanceOrigin } from "../../../rules/activation";
import { hasKeyword } from "../../../rules/keywords";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { battleSeed, SIDES, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { at, passUntil } from "../../../testing/trigger-harness";
import { view } from "../../../view/view";
import { abilityKinds, activate, activations, board, decklists, engine, LA, losses, payments, play, run, v } from "./lose-all-abilities-support";

const DONOR_KINDS = ["0:keyword", "1:activated", "2:triggered", "3:static"];

/** The player's fracture resolved on the enemy's donor, beside an enemy vanilla character; the enemy holds an event. */
function fractured(amplified = false) {
  const { state, ids } = boardState(engine.catalog, board(
    { hand: [{ cardId: LA.fracture.id, amplified }], back: [v.vanilla1.id] },
    { back: [LA.donor.id, v.vanilla2.id], hand: [v.event1.id] },
  ));
  const [donor, ally] = ids.enemy.back as InstanceId[];
  const result = run(state, [["player", play(ids.player.hand[0])]], new ScriptedSource([[donor]]));
  return { ...result, start: state, ids, donor, ally };
}

describe("loseAllAbilities until the opponent pays", () => {
  it("removes the character's keyword, static, activated and triggered abilities until its controller pays", () => {
    const { state, events, start, ids, donor, ally } = fractured();
    const sparks = [effectiveSpark(start, engine.catalog, donor), effectiveSpark(start, engine.catalog, ally)];
    const [loss] = losses(state);
    const [payable] = state.payable;
    expect(loss).toMatchObject({ controller: "player", expiry: { at: "paid", effect: payable?.id }, change: { kind: "loseAbilities", instance: donor } });
    expect(payable).toMatchObject({ payer: "enemy", cost: 3, affects: [donor] });
    expect(state.instances[donor]?.status.lostAbilities).toBe(0);
    expect(instanceOrigin(instanceOf(state, donor))).toEqual({ kind: "card", cardId: LA.donor.id, variant: { amplified: false }, lost: 0 });
    expect(abilityKinds(state, donor)).toEqual([]);
    expect(hasKeyword(state, engine.catalog, donor, "vengeful")).toBe(false);
    expect([effectiveSpark(state, engine.catalog, donor), effectiveSpark(state, engine.catalog, ally)]).toEqual(sparks.map((spark) => spark - 1));
    expect(eventLogRecords(events, start.version).flatMap((record) => (record.event === "engine.abilitiesLost" ? [record.detail.change] : []))).toEqual([loss?.change]);
    for (const viewer of SIDES) {
      const seen = view(state, viewer, engine.catalog);
      expect(seen.instances[donor]?.status.lostAbilities).toBe(0);
      expect(seen.floating.map(({ change }) => change)).toEqual([loss?.change]);
    }
    expect(invariantViolations(state, engine.catalog)).toEqual([]);
    expect(determinizationDivergences(engine, state, decklists([LA.fracture, v.vanilla1], [LA.donor, v.vanilla2, v.event1]), battleSeed("lose"), 0)).toEqual([]);

    // Only the affected character's controller may pay, at Fast timing in its own turn.
    expect(payments(state, "player")).toEqual([]);
    const enemyDay = passUntil(engine, state, at(engine, "enemy", "day")).state;
    expect(activations(enemyDay, "enemy", donor)).toEqual([]);
    expect(canActivate(enemyDay, engine.catalog, "enemy", donor, 1)).toBe(false);
    const silent = run(enemyDay, [["enemy", play(ids.enemy.hand[0])]]).state;
    expect(silent.sides.enemy.score).toBe(enemyDay.sides.enemy.score);
    expect(payments(silent, "enemy")).toEqual([payable?.id]);

    const energy = silent.sides.enemy.currentEnergy;
    const paid = run(silent, [["enemy", { kind: "payToEnd", effect: payable.id }]]);
    expect(paid.state.sides.enemy.currentEnergy).toBe(energy - 3);
    expect(paid.events.filter((event) => event.kind === "payableEffectEnded")).toEqual([{ kind: "payableEffectEnded", effect: payable?.id, payer: "enemy", paid: true }]);
    expect(paid.events.some((event) => event.kind === "effectEnded" && event.effect === loss?.id)).toBe(true);
    const restored = paid.state;
    expect([restored.payable, losses(restored)]).toEqual([[], []]);
    expect(restored.instances[donor]?.status.lostAbilities).toBeUndefined();
    expect(abilityKinds(restored, donor)).toEqual(DONOR_KINDS);
    expect(hasKeyword(restored, engine.catalog, donor, "vengeful")).toBe(true);
    expect([effectiveSpark(restored, engine.catalog, donor), effectiveSpark(restored, engine.catalog, ally)]).toEqual(sparks);
    expect(activations(restored, "enemy", donor)).toEqual([1]);
    expect(run(restored, [["enemy", activate(donor, 1)]]).state.sides.enemy.score).toBe(restored.sides.enemy.score + 1);
    expect(invariantViolations(restored, engine.catalog)).toEqual([]);
  });

  it("costs the amplified price to end the amplified card's effect", () => {
    const { state } = fractured(true);
    expect(state.payable).toEqual([expect.objectContaining({ payer: "enemy", cost: 4 })]);
  });

  it("never offers the payment as a response, while a card is on the stack", () => {
    const { state, ids } = boardState(engine.catalog, board(
      { back: [LA.donor.id], hand: [LA.dissolver.id] },
      { hand: [LA.fracture.id, LA.dissolver.id] },
      "enemy",
    ));
    const donor = ids.player.back[0]!;
    // The only legal target is chosen without a prompt.
    const lost = run(state, [["enemy", play(ids.enemy.hand[0])]]).state;
    expect(lost.payable).toEqual([expect.objectContaining({ payer: "player", cost: 3, affects: [donor] })]);
    expect(payments(lost, "enemy")).toEqual([]);
    const responding = engine.apply(lost, "enemy", play(lost.sides.enemy.hand[0]), new ScriptedSource([])).state;
    expect(responding.stack).toHaveLength(1);
    expect(payments(responding, "player")).toEqual([]);
    const playerDay = passUntil(engine, lost, at(engine, "player", "day")).state;
    expect(payments(playerDay, "player")).toEqual([lost.payable[0]?.id]);
  });
});

describe("loseAllAbilities: layer order", () => {
  it("removes abilities and keywords gained before the loss, and keeps those gained after it", () => {
    const { state, ids } = boardState(engine.catalog, board(
      { back: [LA.mourner.id], hand: [LA.lendPlayer.id, LA.veil.id, LA.silence.id, LA.lendPlayer.id, LA.veil.id] },
      { void: [LA.donor.id, LA.mourner.id] },
    ));
    const bearer = ids.player.back[0]!;
    const [lendFirst, veilFirst, silence, lendSecond, veilSecond] = ids.player.hand;
    const before = run(state, [["player", play(lendFirst)], ["player", play(veilFirst)]]).state;
    expect(abilityKinds(before, bearer)).toEqual(["0:triggered", "1:triggered", ...DONOR_KINDS.map((kind) => kind.replace(/^\d/u, (index) => String(Number(index) + 2)))]);
    expect([hasKeyword(before, engine.catalog, bearer, "vengeful"), hasKeyword(before, engine.catalog, bearer, "veil")]).toEqual([true, true]);
    const lost = run(before, [["player", play(silence)]]).state;
    expect(lost.instances[bearer]?.status.lostAbilities).toBe(1);
    expect(abilityKinds(lost, bearer)).toEqual([]);
    expect([hasKeyword(lost, engine.catalog, bearer, "vengeful"), hasKeyword(lost, engine.catalog, bearer, "veil")]).toEqual([false, false]);
    expect(effectiveSpark(lost, engine.catalog, bearer)).toBe(1);
    const regained = run(lost, [["player", play(lendSecond)], ["player", play(veilSecond)]]).state;
    expect(regained.instances[bearer]?.status).toMatchObject({ gainedAbilities: [{ cardId: LA.donor.id }, { cardId: LA.mourner.id }], lostAbilities: 1 });
    // The second gain keeps the indexes after the lost ones: the mourner's abilities follow the donor's four.
    expect(abilityKinds(regained, bearer)).toEqual(["6:triggered", "7:triggered"]);
    expect([hasKeyword(regained, engine.catalog, bearer, "vengeful"), hasKeyword(regained, engine.catalog, bearer, "veil")]).toEqual([false, true]);
    expect(invariantViolations(regained, engine.catalog)).toEqual([]);
  });

  it("removes a keyword a static ability gave before the loss, and keeps one from a source that entered after it", () => {
    const { state, ids } = boardState(engine.catalog, board(
      { back: [LA.anthem.id, v.vanilla1.id], hand: [LA.silence.id, LA.anthem.id] },
      {},
    ));
    const [anthem, bearer] = ids.player.back as InstanceId[];
    expect(hasKeyword(state, engine.catalog, bearer, "veil")).toBe(true);
    const lost = run(state, [["player", play(ids.player.hand[0])]], new ScriptedSource([[bearer]])).state;
    expect(hasKeyword(lost, engine.catalog, bearer, "veil")).toBe(false);
    expect(hasKeyword(lost, engine.catalog, anthem, "veil")).toBe(true);
    const later = run(lost, [["player", play(lost.sides.player.hand[0])]]).state;
    expect(hasKeyword(later, engine.catalog, bearer, "veil")).toBe(true);
  });

  it("stops the character's own static abilities, which the statics memo does not serve it", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [LA.donor.id, LA.donor.id, v.vanilla1.id], hand: [LA.silence.id] }, {}));
    const [first, second, ally] = ids.player.back as InstanceId[];
    expect([first, second, ally].map((id) => effectiveSpark(state, engine.catalog, id))).toEqual([3, 3, 3]);
    const lost = run(state, [["player", play(ids.player.hand[0])]], new ScriptedSource([[first]])).state;
    expect([first, second, ally].map((id) => effectiveSpark(lost, engine.catalog, id))).toEqual([2, 2, 2]);
    expect(abilityKinds(lost, second)).toEqual(DONOR_KINDS);
  });
});

describe("loseAllAbilities: leaving play", () => {
  /** Plays the first card in the player's hand, whose only legal target is the mourner. */
  function lostMourner(state: BattleState) {
    return run(state, [["player", play(state.sides.player.hand[0])]]);
  }

  it("ends as the character leaves play, with no leaves-play or dissolve trigger of its own, and ends the payment unpaid", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [LA.fracture.id, LA.dissolver.id] }, { back: [LA.mourner.id] }));
    const mourner = ids.enemy.back[0]!;
    const lost = lostMourner(state).state;
    const [loss] = losses(lost);
    const effect = lost.payable[0]?.id;
    const { state: after, events } = run(lost, [["player", play(lost.sides.player.hand[0])]]);
    expect(after.instances[mourner]?.zone).toBe("void");
    expect(events.some((event) => event.kind === "effectEnded" && event.effect === loss?.id)).toBe(true);
    expect(events.filter((event) => event.kind === "payableEffectEnded")).toEqual([{ kind: "payableEffectEnded", effect, payer: "enemy", paid: false }]);
    expect(events.some((event) => event.kind === "triggerQueued")).toBe(false);
    expect(after.sides.enemy.score).toBe(lost.sides.enemy.score);
    expect([after.payable, losses(after)]).toEqual([[], []]);
    expect(after.instances[mourner]?.status.lostAbilities).toBeUndefined();
    expect(abilityKinds(after, mourner)).toEqual(["0:triggered", "1:triggered"]);
    expect(payments(passUntil(engine, after, at(engine, "enemy", "day")).state, "enemy")).toEqual([]);
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
  });

  it("ends a permanent loss as the character returns to hand, so it has its abilities when played again", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [LA.mourner.id], hand: [LA.silence.id, LA.returner.id] }, {}));
    const mourner = ids.player.back[0]!;
    const lost = lostMourner(state).state;
    expect(losses(lost)[0]?.expiry).toEqual({ at: "never" });
    const { state: returned, events } = run(lost, [["player", play(lost.sides.player.hand[0])]]);
    expect(returned.instances[mourner]?.zone).toBe("hand");
    expect(events.some((event) => event.kind === "triggerQueued")).toBe(false);
    expect(losses(returned)).toEqual([]);
    const replayed = run(returned, [["player", play(mourner)]]).state;
    expect(abilityKinds(replayed, mourner)).toEqual(["0:triggered", "1:triggered"]);
  });
});
