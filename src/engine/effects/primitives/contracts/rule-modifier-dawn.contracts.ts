/** Actual named-Dawn admissions, batch order, private progress, and saved reaction continuity. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, characterYouControl, controls, enemyCharacter, everyIn, self, staticAbility } from "../../../dsl/builders";
import { either, onDawn, triggered, whenMaterialize } from "../../../dsl/triggers";
import { createFoldAdapter } from "../../../fold/slice";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { stateHash } from "../../../state/hash";
import { eventSeenBy } from "../../../events";
import { oncePerTurnKey } from "../../../rules/activation";
import { SIDES, opponent, parseFigmentId, type Side } from "../../../state/ids";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { revealToBoth } from "../../../view/knowledge";
import { comparableView } from "../../../testing/determinization-fidelity";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { banishCards } from "../banish-cards";
import { gainAbilities } from "../gain-abilities";
import { gainControl } from "../gain-control";
import { materializeFigments } from "../materialize-figments";
import { draw } from "../draw";
import { discard } from "../discard";
import { dissolve } from "../dissolve";
import { returnFromVoid } from "../return-from-void";
import { returnToHand } from "../return-to-hand";
import { floating, delayed } from "../floating-trigger";
import { foresee } from "../foresee";
import { gainEnergy } from "../gain-energy";
import { loseAllAbilities } from "../lose-all-abilities";
import { materialize } from "../materialize";
import { rematerialize } from "../rematerialize";
import { ruleModifier } from "../rule-modifier";
import { sequence } from "../sequence";
import { triggerAbility } from "../trigger-ability";
import { SIGN, applied, deck, drain, restored, saved, sliceOf, step, world } from "./rule-modifier-support";

const mage = { ...v.vanilla1, id: syntheticId(0x236120), subtype: "Mage" as const };
const mages = all(characterYouControl({ subtype: "Mage" }));
const dawn = (index: number, abilities?: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  ...v.vanilla1, id: syntheticId(0x236121 + index), subtype: "Warrior",
  abilities: abilities ?? (() => [triggered(onDawn(), gainEnergy(1))]),
});
const reactionCount = (state: ReturnType<typeof world>["state"]) => state.triggerQueue.filter(t => t.kind === "ruleReaction").length;

describe("ruleModifier Dawn threshold", () => {
  it.each(SIDES.flatMap(side => [2, 3, 4, 6].flatMap(count => [1, 2].map(copies => ({ side, count, copies })))))("counts $count admissions and $copies held copies for $side", ({ side, count, copies }) => {
    const source = dawn(0);
    const w = world(side, [source], { phase: "draw", [side]: { back: Array.from({ length: count }, () => source.id), dreamsigns: Array.from({ length: copies }, () => SIGN.hourglass), deck, energy: 0 } });
    const admitted = step(w.engine, w.state, { kind: "advancePhase" });
    const expected = count >= 3 ? copies : 0;
    expect(admitted.state.turnLog.dawnProgress).toEqual({ total: count, known: { player: count, enemy: count } });
    expect(admitted.state.triggerQueue.slice(0, count).every(t => t.kind === undefined)).toBe(true);
    expect(reactionCount(admitted.state)).toBe(expected);
    const result = drain(w.engine, admitted.state);
    expect(result.sides[side].hand).toHaveLength(expected);
    expect(result.sides[opponent(side)].hand).toHaveLength(0);
    expect(result.sides[side].currentEnergy).toBe(count);
  });
  it.each(SIDES)("counts repeated either and forced admissions in its own Dawn for %s", side => {
    const starter = dawn(1, () => [triggered(onDawn(), sequence(rematerialize(mages), triggerAbility(mages, "dawn")))]);
    const resonant = { ...mage, abilities: () => [triggered(either(onDawn(), whenMaterialize()), gainEnergy(1))] };
    const w = world(side, [starter, resonant], { phase: "draw", [side]: { back: [starter.id, resonant.id], dreamsigns: [SIGN.hourglass], deck } });
    const admitted = step(w.engine, w.state, { kind: "advancePhase" });
    const result = drain(w.engine, admitted.state);
    expect(result.turnLog.dawnProgress?.total).toBe(4);
    expect(result.sides[side].hand).toHaveLength(1);
  });
  it.each(SIDES)("counts forced opponent Dawn admissions without triggering its Hourglass for %s", side => {
    const enemyMages = all(enemyCharacter({ subtype: "Mage" }));
    const starter = dawn(2, () => [triggered(onDawn(), sequence(triggerAbility(enemyMages, "dawn"), triggerAbility(enemyMages, "dawn")))]);
    const other = { ...mage, abilities: () => [triggered(onDawn(), gainEnergy(1))] };
    const w = world(side, [starter, other], { phase: "draw", [side]: { back: [starter.id], dreamsigns: [SIGN.hourglass], deck }, [opponent(side)]: { back: [other.id], dreamsigns: [SIGN.hourglass], deck } });
    const result = drain(w.engine, step(w.engine, w.state, { kind: "advancePhase" }).state);
    expect(result.turnLog.dawnProgress?.total).toBe(3);
    expect(result.sides[side].hand).toHaveLength(1);
    expect(result.sides[opponent(side)].hand).toHaveLength(0);
  });
  it.each(SIDES)("batches all characters of one forced named instruction for %s", side => {
    const enemyMages = all(enemyCharacter({ subtype: "Mage" }));
    const starter = dawn(14, () => [triggered(onDawn(), triggerAbility(enemyMages, "dawn"))]);
    const recipient = { ...mage, abilities: () => [triggered(onDawn(), gainEnergy(1))] };
    const w = world(side, [starter, recipient], { phase: "draw", [side]: { back: [starter.id], dreamsigns: [SIGN.hourglass], deck },
      [opponent(side)]: { back: [recipient.id, recipient.id, recipient.id], deck } });
    const initial = step(w.engine, w.state, { kind: "advancePhase" }).state;
    let state = step(w.engine, initial, { kind: "resolveTrigger" }).state;
    expect(state.turnLog.dawnProgress?.total).toBe(4);
    expect(state.triggerQueue.slice(0, 3).map(t => t.source)).toEqual(w.ids[opponent(side)].back);
    expect(state.triggerQueue[3]?.kind).toBe("ruleReaction");
    for (let i = 0; i < 3; i++) {
      state = step(w.engine, state, { kind: "resolveTrigger" }).state;
      expect(state.sides[side].hand).toHaveLength(0);
    }
    expect(drain(w.engine, state).sides[side].hand).toHaveLength(1);
  });
  it.each(SIDES.flatMap(side => [false, true].map(returns => ({ side, returns }))))("reloads a queued reaction after its physical source departs for $side returns=$returns", ({ side, returns }) => {
    const ancient = all(characterYouControl({ subtype: "Ancient" }));
    const carrier = { ...v.vanilla1, id: syntheticId(0x236171), subtype: "Ancient" as const, spark: 5,
      abilities: () => [staticAbility(ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) }))] };
    const starter = dawn(15, () => [triggered(onDawn(), returns ? returnToHand(ancient) : dissolve(ancient))]);
    const other = dawn(16);
    const w = world(side, [starter, other, carrier], { phase: "draw", [side]: { back: [starter.id, other.id, other.id, carrier.id], dreamsigns: [], deck } });
    const initial = step(w.engine, w.state, { kind: "advancePhase" }).state;
    const departed = step(w.engine, initial, { kind: "resolveTrigger" }).state;
    const reaction = departed.triggerQueue.find(t => t.kind === "ruleReaction");
    expect(reaction?.lastKnownSourceSpark).toBe(5);
    const loaded = parseJourneyBattleFoldState(saved(sliceOf(departed)));
    expect(loaded).not.toBeNull();
    if (loaded === null) throw new Error("Departed reaction save rejected");
    const seen = w.engine.view(loaded.engine.slice.committed, side);
    const list = (owner: Side) => Object.values(w.state.instances).flatMap(i => i.owner === owner && i.printing.kind === "card" ? [{ cardId: i.printing.cardId }] : []);
    const sampled = w.engine.determinize(seen, { player: list("player"), enemy: list("enemy") }, () => 0.2);
    expect(comparableView(w.engine.view(sampled, side))).toEqual(comparableView(seen));
    for (const start of [loaded.engine.slice.committed, sampled]) expect(drain(w.engine, start).sides[side].hand).toHaveLength((returns ? 1 : 0) + 1);
  });
  it("counts delayed/floating named-Dawn bodies by their descriptor and retires a one-shot once", () => {
    const trigger = either(onDawn(), whenMaterialize());
    const starter = dawn(3, () => [triggered(onDawn(), sequence(floating(trigger, gainEnergy(1)), delayed(trigger, gainEnergy(1)), rematerialize(mages), rematerialize(mages)))]);
    const w = world("player", [starter, mage], { phase: "draw", player: { back: [starter.id, mage.id], dreamsigns: [SIGN.hourglass], deck } });
    const result = drain(w.engine, step(w.engine, w.state, { kind: "advancePhase" }).state);
    expect(result.turnLog.dawnProgress?.total).toBe(4);
    expect(result.sides.player.hand).toHaveLength(1);
    expect(result.floating.filter(e => e.change.kind === "trigger")).toHaveLength(1);
  });
  it("excludes failed conditions, used once-per-turn abilities and wrong functional zones", () => {
    const source = dawn(4, () => [triggered(onDawn(), gainEnergy(1), { oncePerTurn: true }),
      triggered(onDawn(), gainEnergy(1), { condition: controls(characterYouControl({ subtype: "Mage" })) }),
      triggered(onDawn(), gainEnergy(1), { zone: "void" })]);
    const w = world("player", [source], { phase: "draw", player: { back: [source.id], dreamsigns: [SIGN.hourglass], deck } });
    w.state.oncePerTurn.push(oncePerTurnKey(w.ids.player.back[0]!, 0));
    const admitted = step(w.engine, w.state, { kind: "advancePhase" });
    expect(admitted.state.turnLog.dawnProgress?.total ?? 0).toBe(0);
    expect(admitted.state.triggerQueue).toEqual([]);
  });
  it("does not count forced Dawn abilities outside Dawn and resets progress on the next turn", () => {
    const source = dawn(5);
    const force = { ...v.event0, id: syntheticId(0x236140), abilities: () => [{ kind: "event" as const, effect: triggerAbility(all(characterYouControl()), "dawn") }] };
    const w = world("player", [source, force], { player: { back: [source.id], hand: [force.id], dreamsigns: [SIGN.hourglass], deck } });
    const cast = step(w.engine, w.state, { kind: "play", card: w.ids.player.hand[0], from: "hand" });
    const result = drain(w.engine, step(w.engine, cast.state, { kind: "resolveTop" }).state);
    expect(result.turnLog.dawnProgress?.total ?? 0).toBe(0);
    const ending = { ...result, turn: { ...result.turn, phase: "ending" as const } };
    const next = step(w.engine, ending, { kind: "advancePhase" });
    expect(next.state.turnLog.dawnProgress?.total ?? 0).toBe(0);
    expect(w.engine.view(next.state, "player").turnLog.dawnProgress).toEqual({ knownCount: 0 });
  });
  it("keeps an already queued reaction after its physical source loses the rule", () => {
    const source = dawn(6, () => [triggered(onDawn(), loseAllAbilities(mages))]);
    const carrier = { ...mage, abilities: () => [staticAbility(ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) }))] };
    const w = world("player", [source, carrier], { phase: "draw", player: { back: [source.id, source.id, source.id, carrier.id], deck } });
    const admitted = step(w.engine, w.state, { kind: "advancePhase" });
    expect(reactionCount(admitted.state)).toBe(1);
    const loaded = restored(sliceOf(admitted.state)).committed;
    const result = drain(w.engine, loaded);
    expect(result.sides.player.hand).toHaveLength(1);
    expect(result.instances[w.ids.player.back[3]!].status.lostAbilities).toBeDefined();
  });
  it.each(["gainBefore", "gainAfter", "loseBefore", "loseAfter", "loseReacquire"] as const)("tracks a static rule source around the crossing: %s", mode => {
    const threshold = ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) });
    const donor = { ...v.vanilla1, id: syntheticId(0x236160), subtype: "Explorer" as const, abilities: () => [staticAbility(threshold)] };
    const gain = gainAbilities(banishCards([everyIn("void", { subtype: "Explorer" })]));
    const force = triggerAbility(mages, "dawn");
    const lose = loseAllAbilities(self());
    const body = mode === "gainBefore" ? sequence(gain, force) : mode === "gainAfter" ? sequence(force, gain)
      : mode === "loseBefore" ? sequence(lose, force) : mode === "loseAfter" ? sequence(force, lose) : sequence(force, lose, gain);
    const source = dawn(11, () => [triggered(onDawn(), body), ...(mode.startsWith("lose") ? [staticAbility(threshold)] : [])]);
    const recipient = { ...mage, abilities: () => [triggered(onDawn(), gainEnergy(1))] };
    const w = world("player", [source, donor, recipient], { phase: "draw", player: { back: [source.id, recipient.id], void: [donor.id], deck } });
    const result = drain(w.engine, step(w.engine, w.state, { kind: "advancePhase" }).state);
    expect(result.turnLog.dawnProgress?.total).toBe(3);
    expect(result.sides.player.hand).toHaveLength(mode === "gainBefore" || mode === "loseAfter" || mode === "loseReacquire" ? 1 : 0);
  });
  it.each(SIDES)("uses the rule source's new controller at the crossing for %s", side => {
    const carrier = { ...v.vanilla1, id: syntheticId(0x236161), subtype: "Ancient" as const,
      abilities: () => [staticAbility(ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) }))] };
    const source = dawn(12, () => [triggered(onDawn(), sequence(gainControl(all(enemyCharacter({ subtype: "Ancient" }))), triggerAbility(mages, "dawn")))]);
    const recipient = { ...mage, abilities: () => [triggered(onDawn(), gainEnergy(1))] };
    const w = world(side, [carrier, source, recipient], { phase: "draw", [side]: { back: [source.id, recipient.id], deck }, [opponent(side)]: { back: [carrier.id], deck } });
    const result = drain(w.engine, step(w.engine, w.state, { kind: "advancePhase" }).state);
    expect(result.sides[side].hand).toHaveLength(1);
    expect(result.sides[opponent(side)].hand).toHaveLength(0);
  });
  it("rolls back new admission/progress/reaction writes when the same resolving step fails", () => {
    const source = dawn(13, () => [triggered(onDawn(), sequence(gainEnergy(2), rematerialize(mages),
      materializeFigments(parseFigmentId("00000000-0000-4000-8000-000000236999"))))]);
    const recipient = { ...mage, abilities: () => [triggered(either(onDawn(), whenMaterialize()), gainEnergy(1))] };
    const w = world("player", [source, recipient], { phase: "draw", player: { back: [source.id, recipient.id], dreamsigns: [SIGN.hourglass], deck } });
    const queued = step(w.engine, w.state, { kind: "advancePhase" }).state;
    const before = stateHash(queued);
    expect(queued.turnLog.dawnProgress?.total).toBe(2);
    const prefix = { ...sliceOf(queued), inFlight: { step: { kind: "resolveTrigger" as const }, automatic: true, answers: [] } };
    const result = createFoldAdapter(w.engine).reduce(prefix, { kind: "battleAction", side: "player", action: { kind: "pass" } });
    expect(result).toMatchObject({ kind: "applied", error: { kind: "engine_error" } });
    if (result.kind !== "applied") throw new Error("Expected atomic engine failure");
    expect(stateHash(result.slice.committed)).toBe(before);
    expect(stateHash(queued)).toBe(before);
    expect(result.slice.committed.turnLog.dawnProgress?.total).toBe(2);
    expect(reactionCount(result.slice.committed)).toBe(0);
    expect(result.slice.committed.sides.player.currentEnergy).toBe(queued.sides.player.currentEnergy);
    expect(result.slice.committed.triggerQueue).toEqual(queued.triggerQueue);
  });

});

describe("ruleModifier observer-qualified Dawn progress", () => {
  function privatePromptWorld(side: Side) {
    const source = dawn(18, () => [triggered(onDawn(), sequence(foresee(1),
      materializeFigments(parseFigmentId("00000000-0000-4000-8000-000000236999"))))]);
    const other = dawn(19);
    const secret = { ...v.vanilla1, id: syntheticId(0x236154), abilities: () => [triggered(onDawn(), sequence(), { zone: "any" }),
      staticAbility(ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) }), { zone: "any" })] };
    const w = world(opponent(side), [source, other, secret], { phase: "night",
      [side]: { back: [source.id, other.id], deck: [v.vanilla1.id, secret.id, ...deck], dreamsigns: [], energy: 20 },
      [opponent(side)]: { deck, dreamsigns: [], energy: 20 } });
    const initial = stateHash(w.state), fold = createFoldAdapter(w.engine);
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side: opponent(side), action: { kind: "pass" } }));
    expect(stateHash(w.state)).toBe(initial);
    const pending = fold.pending(opened.slice);
    if (pending?.prompt.kind !== "arrange") throw new Error("Expected the actual private Foresee prompt");
    expect(pending.prompt.privateTo).toBe(side);
    const secretId = w.ids[side].deck[1];
    expect(pending.prompt.cards).toEqual([secretId]);
    expect(opened.slice.committed.turnLog.dawnProgress).toEqual({ total: 3, known: { player: 2, enemy: 2 } });
    const list = (holder: Side) => Object.values(w.state.instances).flatMap(instance =>
      instance.owner === holder && instance.printing.kind === "card" ? [{ cardId: instance.printing.cardId }] : []);
    return { ...w, fold, opened, pending, secretId, decklists: { player: list("player"), enemy: list("enemy") } };
  }
  it.each(SIDES)("records the threshold seen in a private prompt's display for %s", side => {
    const w = privatePromptWorld(side), before = stateHash(w.opened.slice.committed), viewer = opponent(side);
    const owner = w.engine.view(w.pending.display, side), other = w.engine.view(w.pending.display, viewer);
    expect(owner.triggerQueue.some(trigger => trigger.kind === "ruleReaction")).toBe(true);
    expect(other.triggerQueue.some(trigger => trigger.kind === "ruleReaction")).toBe(false);
    expect(other.turnLog.dawnProgress).toEqual({ knownCount: 2 });
    expect(w.pending.display.turnLog.dawnProgress?.total).toBe(3);
    expect(stateHash(w.opened.slice.committed)).toBe(before);
    expect(owner.turnLog.dawnProgress).toEqual({ knownCount: 3 });
    const displayHash = stateHash(w.pending.display), sampled = w.engine.determinize(owner, w.decklists, () => 0.2);
    expect(sampled.turnLog.dawnProgress?.total).toBe(3);
    expect(comparableView(w.engine.view(sampled, side))).toEqual(comparableView(owner));
    expect(stateHash(w.pending.display)).toBe(displayHash);
    expect(stateHash(w.opened.slice.committed)).toBe(before);
  });
  it.each(SIDES)("retains a privately observed committed reaction after its Foresee continuation fails for %s", side => {
    const w = privatePromptWorld(side), before = stateHash(w.opened.slice.committed), queue = structuredClone(w.opened.slice.committed.triggerQueue);
    const result = w.fold.reduce(w.opened.slice, { kind: "answer", side, promptId: w.pending.prompt.id,
      value: [{ card: w.secretId, to: "top" }] });
    expect(result).toMatchObject({ kind: "applied", error: { kind: "engine_error" } });
    if (result.kind !== "applied") throw new Error("Expected recovered Foresee failure");
    expect(result.slice.inFlight).toBeNull();
    expect(stateHash(w.opened.slice.committed)).toBe(before);
    expect(result.slice.committed.turnLog.dawnProgress?.total).toBe(3);
    expect(result.slice.committed.triggerQueue).toEqual(queue);
    const owner = w.engine.view(result.slice.committed, side), other = w.engine.view(result.slice.committed, opponent(side));
    expect(owner.instances[w.secretId]?.printing).toEqual(w.opened.slice.committed.instances[w.secretId].printing);
    expect(owner.triggerQueue.some(trigger => trigger.kind === "ruleReaction")).toBe(true);
    expect(other.triggerQueue.some(trigger => trigger.kind === "ruleReaction")).toBe(false);
    expect(other.turnLog.dawnProgress).toEqual({ knownCount: 2 });
    expect(owner.turnLog.dawnProgress).toEqual({ knownCount: 3 });
    expect(w.engine.view(restored(result.slice).committed, side)).toEqual(owner);
    const recoveredHash = stateHash(result.slice.committed), sampled = w.engine.determinize(owner, w.decklists, () => 0.2);
    expect(sampled.turnLog.dawnProgress?.total).toBe(3);
    expect(comparableView(w.engine.view(sampled, side))).toEqual(comparableView(owner));
    expect(stateHash(result.slice.committed)).toBe(recoveredHash);
    expect(stateHash(w.opened.slice.committed)).toBe(before);
  });
  function hiddenWorld(side: Side, named: boolean, publicSources = 1, hiddenReaction = false, continuation = false, exposure: "none" | "public" | "rehide" = "none") {
    const hidden = [false, true].map((hasDawn, index) => ({ ...v.vanilla1, id: syntheticId(0x236150 + index),
      abilities: () => [triggered(hasDawn ? either(onDawn(), whenMaterialize()) : whenMaterialize(), continuation ? triggerAbility(mages, "dawn") : sequence(),
        { zone: "hand" as const, condition: controls(characterYouControl({ subtype: "Mage" })) })] }));
    const starter = dawn(7, () => [triggered(onDawn(), materialize(everyIn("void", { subtype: "Mage" })))]);
    const other = dawn(8, exposure === "none" ? undefined : () => [triggered(onDawn(), sequence(discard(1),
      ...(exposure === "rehide" ? [returnFromVoid(everyIn("void", { subtype: "Ancient" }))] : [])), { oncePerTurn: true })]);
    const secretRule = { ...v.vanilla1, id: syntheticId(0x236152), subtype: "Ancient" as const, abilities: () => [staticAbility(ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) }), { zone: "hand" })] };
    const recipient = continuation ? { ...mage, abilities: () => [triggered(onDawn(), triggerAbility(all(characterYouControl({ subtype: "Warrior" })), "dawn"))] } : mage;
    const cards = [starter, other, recipient, ...hidden, secretRule];
    const w = world(side, cards, { phase: "draw", [side]: { back: [starter.id, ...Array.from({ length: publicSources - 1 }, () => other.id)],
      hand: [hidden[named ? 1 : 0].id, ...(hiddenReaction ? [secretRule.id] : [])], void: [mage.id], deck: [...deck, hidden[named ? 0 : 1].id],
      dreamsigns: hiddenReaction ? [] : [SIGN.hourglass] } });
    if (hiddenReaction) revealToBoth(w.state, [w.ids[side].hand[1]]);
    const lists = Object.values(w.state.instances).flatMap(instance => instance.owner === side && instance.printing.kind === "card" ? [{ cardId: instance.printing.cardId }] : []);
    const decklists = { player: side === "player" ? lists : deck.map(cardId => ({ cardId })), enemy: side === "enemy" ? lists : deck.map(cardId => ({ cardId })) };
    const phase = step(w.engine, w.state, { kind: "advancePhase" });
    const materialized = step(w.engine, phase.state, { kind: "resolveTrigger" });
    return { ...w, materialized, cards, decklists };
  }
  it.each(SIDES)("keeps paired hidden classifications private after identical opaque queues drain for %s", side => {
    const named = hiddenWorld(side, true), ordinary = hiddenWorld(side, false), viewer = opponent(side);
    expect(named.materialized.state.triggerQueue).toHaveLength(ordinary.materialized.state.triggerQueue.length);
    const a = drain(named.engine, named.materialized.state), b = drain(ordinary.engine, ordinary.materialized.state);
    expect(a.turnLog.dawnProgress?.total).toBe(2);
    expect(b.turnLog.dawnProgress?.total).toBe(1);
    expect(named.engine.view(a, viewer)).toEqual(ordinary.engine.view(b, viewer));
    expect(named.engine.view(a, side).turnLog.dawnProgress).toEqual({ knownCount: 2 });
    expect(named.engine.view(a, viewer).turnLog.dawnProgress).toEqual({ knownCount: 1 });
    const event = named.materialized.events.find(e => e.kind === "triggerQueued" && typeof e.source === "string");
    if (event === undefined) throw new Error("Missing private callback");
    expect(eventSeenBy(event, viewer, named.materialized.state)).toBeNull();
    const seen = named.engine.view(a, viewer);
    const sampled = named.engine.determinize(seen, named.decklists, () => 0.3);
    const otherSample = ordinary.engine.determinize(ordinary.engine.view(b, viewer), ordinary.decklists, () => 0.3);
    expect(comparableView(named.engine.view(sampled, viewer))).toEqual(comparableView(ordinary.engine.view(otherSample, viewer)));
    expect(sampled.turnLog.dawnProgress?.total).toBe(1); // Conservative omitted history, not the authoritative 2.
    expect(comparableView(named.engine.view(sampled, viewer))).toEqual(comparableView(seen));
  });
  it.each(SIDES)("retains an observable crossing after private causation, queue drain, reload and determinization for %s", side => {
    const w = hiddenWorld(side, true, 2, false, true), viewer = opponent(side);
    expect(w.engine.view(w.materialized.state, viewer).turnLog.dawnProgress).toEqual({ knownCount: 3 });
    let state = w.materialized.state;
    while (state.triggerQueue[0]?.kind !== "ruleReaction") state = step(w.engine, state, { kind: "resolveTrigger" }).state;
    state = step(w.engine, state, { kind: "resolveTrigger" }).state;
    // A known Mage callback was causally queued by the private callback and follows Hourglass.
    expect(state.triggerQueue).toHaveLength(1);
    expect(reactionCount(state)).toBe(0);
    const loaded = restored(sliceOf(state)).committed;
    const seen = w.engine.view(loaded, viewer);
    expect(seen.turnLog.dawnProgress?.knownCount).toBeGreaterThanOrEqual(3);
    const sampled = w.engine.determinize(seen, w.decklists, () => 0.2);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(seen));
    const beforeDrawn = loaded.turnLog.drawn[side];
    for (const start of [loaded, sampled]) {
      const later = step(w.engine, start, { kind: "resolveTrigger" });
      expect(later.state.turnLog.dawnProgress!.total).toBeGreaterThan(start.turnLog.dawnProgress!.total);
      expect(reactionCount(later.state)).toBe(0);
      const finished = drain(w.engine, later.state);
      expect(finished.turnLog.drawn[side]).toBe(beforeDrawn);
    }
  });

  it.each(SIDES.flatMap(side => (["public", "rehide"] as const).map(exposure => ({ side, exposure }))))("retains a privately queued threshold observed at a later boundary for $side $exposure", ({ side, exposure }) => {
    const w = hiddenWorld(side, true, 2, true, true, exposure), viewer = opponent(side), secret = w.ids[side].hand[1];
    expect(w.engine.view(w.materialized.state, viewer).turnLog.dawnProgress).toEqual({ knownCount: 2 });
    const observed: { knownCount: number | undefined; shown: boolean }[] = [];
    const beforeHash = stateHash(w.materialized.state);
    const result = runStep(w.materialized.state, { kind: "resolveTrigger" }, new ScriptedSource([[secret]]), w.engine.catalog, {
      observeEvent(event, snapshot) {
        if (event.kind !== "enteredVoid" || event.instance !== secret) return;
        const view = w.engine.view(snapshot(), viewer);
        observed.push({ knownCount: view.turnLog.dawnProgress?.knownCount, shown: view.triggerQueue.some(t => t.kind === "ruleReaction") });
      },
    });
    expect(stateHash(w.materialized.state)).toBe(beforeHash);
    if (result.kind !== "done") throw new Error("Unexpected discard suspension");
    expect(observed).toEqual([{ knownCount: 3, shown: true }]);
    expect(w.engine.view(result.state, viewer).turnLog.dawnProgress).toEqual({ knownCount: 3 });
    expect(w.engine.view(result.state, viewer).triggerQueue.some(t => t.kind === "ruleReaction")).toBe(exposure === "public");
    let state = step(w.engine, result.state, { kind: "resolveTrigger" }).state;
    state = step(w.engine, state, { kind: "resolveTrigger" }).state;
    expect(state.triggerQueue).toHaveLength(1); // Public Mage callback follows the reaction.
    const loaded = restored(sliceOf(state)).committed, seen = w.engine.view(loaded, viewer);
    const sampled = w.engine.determinize(seen, w.decklists, () => 0.2);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(seen));
    for (const start of [loaded, sampled]) {
      const later = step(w.engine, start, { kind: "resolveTrigger" }).state;
      expect(reactionCount(later)).toBe(0);
      expect(drain(w.engine, later).turnLog.drawn[side]).toBe(state.turnLog.drawn[side]);
    }
  });
  it("records an observable resolving reaction after it leaves the queue", () => {
    const source = dawn(17);
    const w = world("player", [source], { phase: "draw", player: { back: [source.id, source.id, source.id], dreamsigns: [SIGN.hourglass], deck } });
    let state = step(w.engine, w.state, { kind: "advancePhase" }).state;
    for (let i = 0; i < 3; i++) state = step(w.engine, state, { kind: "resolveTrigger" }).state;
    // A valid lower bound in a saved prefix need not have recorded the current source visibility yet.
    state.turnLog.dawnProgress!.known.enemy = 2;
    const loaded = restored(sliceOf(state)).committed, observed: number[] = [];
    const result = runStep(loaded, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog, { observeEvent(event, snapshot) {
      if (event.kind === "triggerResolved") observed.push(w.engine.view(snapshot(), "enemy").turnLog.dawnProgress?.knownCount ?? 0);
    } });
    expect(observed).toEqual([3]);
    if (result.kind !== "done") throw new Error("Unexpected reaction suspension");
    expect(w.engine.view(result.state, "enemy").turnLog.dawnProgress).toEqual({ knownCount: 3 });
  });
  it("omits a new private rule-reaction category even when the source printing is known", () => {
    const w = hiddenWorld("player", true, 2, true);
    expect(reactionCount(w.materialized.state)).toBe(1);
    const opponentView = w.engine.view(w.materialized.state, "enemy");
    expect(opponentView.instances[w.ids.player.hand[1]]?.printing).toEqual(w.materialized.state.instances[w.ids.player.hand[1]].printing);
    expect(opponentView.triggerQueue.some(t => t.kind === "ruleReaction")).toBe(false);
    expect(opponentView.turnLog.dawnProgress).toEqual({ knownCount: 2 });
    expect(w.engine.view(w.materialized.state, "player").triggerQueue.some(t => t.kind === "ruleReaction")).toBe(true);
  });
  it("does not classify an unlearned own-deck source or reveal its reaction", () => {
    const source = dawn(10);
    const secret = { ...v.vanilla1, id: syntheticId(0x236153), abilities: () => [triggered(onDawn(), sequence(), { zone: "any" }),
      staticAbility(ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) }), { zone: "any" })] };
    const w = world("player", [source, secret], { phase: "draw", player: { back: [source.id, source.id], deck: [secret.id, ...deck] } });
    const admitted = step(w.engine, w.state, { kind: "advancePhase" });
    expect(admitted.state.turnLog.dawnProgress).toEqual({ total: 3, known: { player: 2, enemy: 2 } });
    for (const viewer of SIDES) {
      expect(w.engine.view(admitted.state, viewer).triggerQueue.some(t => t.kind === "ruleReaction")).toBe(false);
      expect(w.engine.view(admitted.state, viewer).turnLog.dawnProgress).toEqual({ knownCount: 2 });
    }
  });
  it("validates optional lower progress and strict special-kind tuples on saved states", () => {
    const source = dawn(9);
    const w = world("player", [source], { phase: "draw", player: { back: [source.id, source.id, source.id], dreamsigns: [SIGN.hourglass], deck } });
    const queued = step(w.engine, w.state, { kind: "advancePhase" }).state;
    expect(restored(sliceOf(queued)).committed.triggerQueue.some(t => t.kind === "ruleReaction")).toBe(true);
    for (const malformed of [null, -1, 1.5, "3", { total: 2, known: { player: 3, enemy: 0 } }, { total: 3, known: { player: -1, enemy: 0 } }]) {
      const copy = structuredClone(queued);
      Object.assign(copy.turnLog, { dawnProgress: malformed });
      expect(parseJourneyBattleFoldState(saved(sliceOf(copy)))).toBeNull();
    }
    for (const patch of [{ node: 0 }, { subject: w.ids.player.back[0] }, { captured: [] }, { lastKnownSubjectSpark: 0 }]) {
      const copy = structuredClone(queued);
      Object.assign(copy.triggerQueue[copy.triggerQueue.length - 1], patch);
      expect(parseJourneyBattleFoldState(saved(sliceOf(copy)))).toBeNull();
    }
    const legacy = structuredClone(w.state);
    delete legacy.turnLog.dawnProgress;
    expect(restored(sliceOf(legacy)).committed.turnLog.dawnProgress).toBeUndefined();
  });
});
