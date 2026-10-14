/** Finite copy-operation modifiers through public synthetic steps, folds and views. */
import { describe, expect, it } from "vitest";
import type { EngineAvatarDefinition, EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { activated, additionalCost, additionalEventCopy, anyCharacter, costPaid, energy, energyX, event, everyIn, fromVoid, optionalCost, self, stackItem, target, targetWhen, x } from "../../../dsl/builders";
import { NO_DECK_MODS, type Ability } from "../../../dsl/types";
import { atStartOfFirstTurn, triggered, triggeringCard, whenCopyTrigger, whenYouPlay } from "../../../dsl/triggers";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecords, type EngineLogRecord } from "../../../log";
import type { Answer } from "../../../prompts/types";
import { createCopyInHand } from "../../../rules/copies";
import { stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { fuzzEngineCatalog, fuzzGameLog, playFuzzGame, withFuzzCardWeights, type FuzzPool } from "../../../testing/fuzz";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations, promptRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseAvatarId, parseDreamsignId } from "../../../../types/identifiers";
import type { Effect } from "../../registry";
import * as p from "../index";

const id = (n: number) => syntheticId(0x654000 + n);
const sign = (n: number, abilities: readonly Ability[]): EngineDreamsignDefinition => ({
  id: parseDreamsignId(`5e5e5e5e-0000-4000-8000-${(0x654100 + n).toString(16).padStart(12, "0")}`), status: "authored", abilities: () => abilities,
});
const modifier = sign(1, [additionalEventCopy()]);
const card = (n: number, abilities: readonly Ability[], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition =>
  ({ ...v.event0, id: id(n), status: "authored", abilities: () => abilities, ...extra });
const spell = (n: number, effect: Effect, extra: Partial<EngineCardDefinition> = {}) => card(n, [event(effect)], extra);
const points = spell(1, p.gainPoints(1), { costs: [energy(2)] });
const echo = (n = 2, times = 1, suffix?: Effect) => card(n, [
  triggered(whenYouPlay(), suffix === undefined ? p.copyCardTimes(triggeringCard(), times) : p.sequence(p.copyCard(triggeringCard()), suffix)),
], { cardType: "character", spark: 1 });
const hand = spell(3, p.modifyCardCost(p.createCopyInHand(self(), { ephemeral: true }), { set: 0 }), { costs: [energy(2)] });
const modal = card(4, [additionalCost(optionalCost(energy(1))), event(p.chooseOne(
  p.gainSpark(targetWhen(costPaid(0), anyCharacter({ costAtMost: x() }), anyCharacter({ costAtMost: 0 })), 1), p.gainPoints(x()),
))], { costs: [energyX()] });
const donor = card(5, [additionalEventCopy()], { cardType: "character", spark: 1 });
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
function world(side: Side, signs: readonly EngineDreamsignDefinition[] = [modifier], mine: SideSetup = {}, theirs: SideSetup = {}, extra: readonly EngineCardDefinition[] = []) {
  const engine = createEngine(testCatalog([points, hand, modal, donor, echo(), ...extra], { dreamsigns: signs }));
  const board = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { deck, energy: 20, dreamsigns: signs.map(s => s.id), ...mine }, [opponent(side)]: { deck, energy: 20, ...theirs } });
  return { engine, ...board, side, other: opponent(side) };
}
function step(engine: Engine, state: BattleState, action: Step, answers: readonly Answer[] = [], automatic = false) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, action, source, engine.catalog, { automatic });
  if (result.kind !== "done") throw new Error("Expected complete synthetic step");
  if (source instanceof ScriptedSource) source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
  return result;
}
const play = (cardId: InstanceId) => ({ kind: "play", card: cardId, from: "hand" } as const);
const copies = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "cardCopied");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function settle(engine: Engine, start: BattleState) {
  let state = start;
  for (let count = 0; state.stack.length > 0 || state.triggerQueue.length > 0; count++) {
    if (count >= 40) throw new Error("Finite copy operation did not settle");
    state = step(engine, state, { kind: state.triggerQueue.length > 0 ? "resolveTrigger" : "resolveTop" }, [], true).state;
  }
  return { state };
}

function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful synthetic intent");
  return outcome;
}

for (const side of SIDES) describe(`${side} event-copy modifiers`, () => {
  it("settles one finite modified attempt without another copying instruction", () => {
    for (const inHand of [false, true]) {
      const f = world(side, [modifier], { back: inHand ? [] : [echo().id], hand: [inHand ? hand.id : points.id] });
      const played = step(f.engine, f.state, play(f.ids[side].hand[0]));
      const made = step(f.engine, played.state, { kind: inHand ? "resolveTop" : "resolveTrigger" });
      const settled = settle(f.engine, made.state).state;
      expect(settled.result).toBeNull();
      if (inHand) expect(settled.sides[side].hand).toHaveLength(2);
      else expect(settled.sides[side].score).toBe(3);
    }
  });

  it.each(["character", "event"] as const)("uses the copied variant's effective %s type for hand bonuses and copy observers", cardType => {
    const character = card(31, [], { cardType: "character", spark: 3, costs: [energy(2)] });
    const copier = spell(32, p.createCopyInHand(everyIn("hand"), { ephemeral: true }));
    const observer = sign(2, [triggered(whenCopyTrigger("you", { cardType: "event" }), p.gainPoints(1))]);
    const subject = cardType === "event" ? character : points;
    const deckMods = { ...NO_DECK_MODS, costReduction: 1, sparkBonus: 2, fast: true,
      typeChange: { cardType, subtype: cardType === "character" ? "Mage" as const : "" as const } };
    const f = world(side, [modifier, observer], { hand: [copier.id, { cardId: subject.id, amplified: true, deckMods }] }, {}, [character, copier]);
    const made = step(f.engine, step(f.engine, f.state, play(f.ids[side].hand[0])).state, { kind: "resolveTop" });
    const events = copies(made.events);
    const expected = cardType === "event" ? 2 : 1;
    expect(events).toHaveLength(expected);
    expect(events.filter(e => e.bonusFrom !== undefined)).toHaveLength(expected - 1);
    expect(made.state.triggerQueue).toHaveLength(cardType === "event" ? expected : 0);
    for (const e of events) {
      const copied = made.state.instances[e.copy];
      expect(copied).toMatchObject({ zone: "hand", owner: side, controller: side, printing: { kind: "card", cardId: subject.id }, status: { created: true, ephemeral: true } });
      expect(copied.variant).toEqual(made.state.instances[f.ids[side].hand[1]].variant);
      expect(f.engine.view(made.state, side).instances[e.copy].characteristics).toMatchObject({ cardType, cost: 1, spark: cardType === "event" ? null : 0 });
    }
    expect(settle(f.engine, made.state).state.sides[side].score).toBe(cardType === "event" ? expected : 0);
  });

  it.each([0, 1, 3])("applies once to each of %i independent requested copies and observes every physical outcome", times => {
    const source = echo(10 + times, times);
    const observer = sign(2, [triggered(whenCopyTrigger("you", { cardType: "event" }), p.gainPoints(1))]);
    const f = world(side, [modifier, observer], { back: [source.id], hand: [{ cardId: points.id, amplified: true }] }, {}, [source]);
    const played = step(f.engine, f.state, play(f.ids[side].hand[0]));
    const made = step(f.engine, played.state, { kind: "resolveTrigger" });
    const events = copies(made.events);
    expect(events).toHaveLength(times * 2);
    expect(new Set(events.map(e => e.copy)).size).toBe(times * 2);
    expect(events.filter(e => e.bonusFrom !== undefined)).toHaveLength(times);
    expect(made.state.triggerQueue).toHaveLength(times * 2);
    for (const e of events) {
      expect(made.state.instances[e.copy]).toMatchObject({ owner: side, controller: side, variant: { amplified: true }, printing: { kind: "card", cardId: points.id } });
      if (e.bonusFrom !== undefined) expect(e.bonusFrom).toEqual({ primary: events.find(primary => primary.bonusFrom === undefined && primary.copy === e.bonusFrom?.primary)?.copy,
        source: { kind: "dreamsign", side, index: 0 }, origin: { kind: "dreamsign", id: modifier.id }, ability: 0 });
    }
    const settled = settle(f.engine, made.state);
    expect(settled.state.result).toBeNull();
    expect(settled.state.sides[side].score).toBe(times * 4 + 1);
  });

  it("adds distinct physical modifier occurrences and repeats independently, while unmodified copying stays singular", () => {
    for (const occurrences of [0, 1, 2]) {
      const f = world(side, occurrences === 0 ? [] : [modifier], { dreamsigns: Array.from({ length: occurrences }, () => modifier.id), back: [echo().id], hand: [points.id, points.id] });
      let state = f.state;
      for (const physical of f.ids[side].hand) {
        const made = step(f.engine, step(f.engine, state, play(physical)).state, { kind: "resolveTrigger" });
        expect(copies(made.events)).toHaveLength(1 + occurrences);
        expect(copies(made.events).flatMap(e => e.bonusFrom ? [e.bonusFrom.source] : [])).toEqual(
          Array.from({ length: occurrences }, (_, index) => ({ kind: "dreamsign", side, index })));
        state = settle(f.engine, made.state).state;
      }
      expect(state.result).toBeNull();
    }
  });

  it("copies multiple hand originals, keeps variant/destination/Ephemeral, and applies addressed cost only to requested outputs", () => {
    const multi = spell(20, p.modifyCardCost(p.createCopyInHand(everyIn("hand", { cardType: "event" }), { ephemeral: true }), { set: 0 }));
    for (const enabled of [false, true]) {
      const f = world(side, enabled ? [modifier] : [], { hand: [multi.id, points.id, { cardId: points.id, amplified: true }] }, {}, [multi]);
      const result = step(f.engine, step(f.engine, f.state, play(f.ids[side].hand[0])).state, { kind: "resolveTop" });
      const events = copies(result.events);
      expect(events).toHaveLength(enabled ? 4 : 2);
      for (const e of events) {
        const copy = result.state.instances[e.copy];
        expect(copy).toMatchObject({ owner: side, controller: side, zone: "hand", status: { created: true, ephemeral: true } });
        expect(copy.variant).toEqual(result.state.instances[e.original!].variant);
        expect(f.engine.view(result.state, side).instances[e.copy].characteristics.cost).toBe(e.bonusFrom === undefined ? 0 : 2);
        expect(eventSeenBy(e, f.other, result.state)).toBeNull();
      }
      expect(result.state.result).toBeNull();
      expect(eventLogRecords(result.events, f.state.version).filter(r => r.event === "engine.copyBonus")).toHaveLength(enabled ? 2 : 0);
    }
  });

  it("retains independent mode/target choices, X and optional-paid costs for the primary and bonus", () => {
    const f = world(side, [modifier], { hand: [modal.id], back: [echo().id, v.vanilla0.id] }, { back: [v.vanilla1.id] });
    const played = step(f.engine, f.state, play(f.ids[side].hand[0]), [2, true, 0, [f.ids[side].back[1]!]]);
    const made = step(f.engine, played.state, { kind: "resolveTrigger" }, [0, [f.ids[f.other].back[0]!], 1]);
    expect(copies(made.events)).toHaveLength(2);
    expect(made.state.stack.every(item => item.kind === "card" && item.x === 2 && item.optionalPaid[0] === true)).toBe(true);
    const settled = settle(f.engine, made.state);
    expect(settled.state.sides[side].score).toBe(2);
    expect(f.engine.view(settled.state, side).instances[f.ids[side].back[1]!].characteristics.spark).toBe(1);
    expect(f.engine.view(settled.state, side).instances[f.ids[f.other].back[0]!].characteristics.spark).toBe(2);
  });

  it("repeats hand operations with hidden originals and preserves directly addressed changes", () => {
    const hidden = spell(25, p.createCopyInHand(everyIn("hand", { cardType: "event" }, { player: "opponent" })));
    const f = world(side, [modifier], { hand: [hidden.id, hidden.id] }, { hand: [points.id] }, [hidden]);
    let state = f.state;
    for (const physical of f.ids[side].hand) {
      const result = step(f.engine, step(f.engine, state, play(physical)).state, { kind: "resolveTop" });
      expect(copies(result.events)).toHaveLength(2);
      for (const e of copies(result.events)) {
        expect(eventSeenBy(e, side, result.state)).toMatchObject({ original: null, copy: e.copy });
        expect(eventSeenBy(e, f.other, result.state)).toBeNull();
      }
      state = result.state;
    }
    const addressed = card(26, [triggered(whenYouPlay(), p.sequence(p.createCopyInHand(triggeringCard()), p.changeCardCost(triggeringCard(), { set: 0 })))], { cardType: "character", spark: 1 });
    const g = world(side, [modifier], { back: [addressed.id], hand: [points.id] }, {}, [addressed]);
    const changed = step(g.engine, step(g.engine, g.state, play(g.ids[side].hand[0])).state, { kind: "resolveTrigger" });
    for (const e of copies(changed.events)) expect(g.engine.view(changed.state, side).instances[e.copy].characteristics.cost).toBe(2);
    expect(g.engine.view(changed.state, side).instances[g.ids[side].hand[0]].characteristics.cost).toBe(0);
  });

  it("uses avatar modifiers and creates no bonus for an original prevented by an earlier FIFO trigger", () => {
    const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000654001"), status: "authored", abilities: () => [additionalEventCopy()] } as const;
    const local = createEngine(testCatalog([points, echo()], { avatars: [avatar] }));
    const board = boardState(local.catalog, { active: side, phase: "day", [side]: { avatar: avatar.id, hand: [points.id], back: [echo().id], energy: 10, deck }, [opponent(side)]: { deck } });
    const made = step(local, step(local, board.state, play(board.ids[side].hand[0])).state, { kind: "resolveTrigger" });
    expect(copies(made.events)).toHaveLength(2);
    expect(copies(made.events)[1].bonusFrom?.source).toEqual({ kind: "avatar", side });
    const preventing = sign(4, [triggered(whenYouPlay(), p.prevent(stackItem({ controller: "you" })))]);
    const f = world(side, [modifier, preventing], { hand: [points.id], back: [echo().id] });
    const played = step(f.engine, f.state, play(f.ids[side].hand[0]));
    const prevented = step(f.engine, played.state, { kind: "resolveTrigger" });
    expect(prevented.state.stack).toEqual([]);
    expect(copies(step(f.engine, prevented.state, { kind: "resolveTrigger" }).events)).toEqual([]);
  });

  it("keeps a passive copy modifier while real selective suppression disables its ordinary trigger", () => {
    const holder = card(71, [additionalEventCopy(), triggered(whenYouPlay(), p.gainPoints(7))], { cardType: "character", spark: 1 });
    const suppressor = card(72, [activated([energy(0)], p.disableTriggers(target(anyCharacter()), "permanent"))], { cardType: "character", spark: 1 });
    const f = world(side, [], { back: [echo().id, holder.id, suppressor.id], hand: [points.id, points.id] }, {}, [holder, suppressor]);
    const holderId = f.ids[side].back[1]!;
    const first = step(f.engine, f.state, play(f.ids[side].hand[0]));
    expect(first.events.filter(e => e.kind === "triggerQueued" && e.source === holderId)).toHaveLength(1);
    const baseline = settle(f.engine, first.state).state;
    expect(baseline.sides[side].score).toBe(10);
    const activation = step(f.engine, baseline, { kind: "activate", source: f.ids[side].back[2]!, ability: 0 }, [[holderId]]);
    const disabled = step(f.engine, activation.state, { kind: "resolveTop" });
    expect(disabled.state.floating.some(e => e.change.kind === "disableTriggers" && e.change.instance === holderId)).toBe(true);
    const played = step(f.engine, disabled.state, play(f.ids[side].hand[1]));
    expect(played.events.filter(e => e.kind === "triggerQueued" && e.source === holderId)).toEqual([]);
    const made = step(f.engine, played.state, { kind: "resolveTrigger" });
    expect(copies(made.events)).toHaveLength(2);
    expect(copies(made.events)[1].bonusFrom?.source).toBe(holderId);
    expect(settle(f.engine, made.state).state.sides[side].score - baseline.sides[side].score).toBe(3);
  });

  it("reads live gained/lost/copied in-play abilities and captures provenance before later source departure", () => {
    const collector = card(21, [triggered(whenYouPlay(), p.sequence(
      p.gainAbilities(p.banishCards([fromVoid({ cardType: "character" })])), p.copyCard(triggeringCard()), p.returnToHand(self()),
    ))], { cardType: "character", spark: 1 });
    const f = world(side, [], { back: [collector.id], void: [donor.id], hand: [points.id] }, {}, [collector]);
    const made = step(f.engine, step(f.engine, f.state, play(f.ids[side].hand[0])).state, { kind: "resolveTrigger" });
    expect(copies(made.events)).toHaveLength(2);
    expect(made.state.instances[f.ids[side].back[0]!].zone).toBe("hand");
    const log = eventLogRecords(made.events, made.state.version).find(r => r.event === "engine.copyBonus");
    expect(log?.event === "engine.copyBonus" ? log.detail.bonusFrom : null).toMatchObject({
      source: f.ids[side].back[0], ability: 1, origin: { kind: "card", cardId: collector.id, gained: [{ cardId: donor.id }] },
    });
    const loss = card(22, [activated([energy(0)], p.loseAllAbilities(target(anyCharacter())))], { cardType: "character", spark: 1 });
    const g = world(side, [], { back: [echo().id, donor.id, loss.id], hand: [points.id] }, {}, [loss]);
    const disabled = step(g.engine, step(g.engine, g.state, { kind: "activate", source: g.ids[side].back[2]!, ability: 0 }, [[g.ids[side].back[1]!]]).state, { kind: "resolveTop" });
    // Clear the unrelated play observer before the next operation.
    const ready = settle(g.engine, disabled.state).state;
    const single = step(g.engine, step(g.engine, ready, play(g.ids[side].hand[0])).state, { kind: "resolveTrigger" });
    expect(copies(single.events)).toHaveLength(1);
    const fig = world(side, [], { back: [echo().id], figments: [{ slot: { rank: "back", index: 1 }, printing: { kind: "figmentCopy", cardId: donor.id, spark: null } }], hand: [points.id] });
    expect(copies(step(fig.engine, step(fig.engine, fig.state, play(fig.ids[side].hand[0])).state, { kind: "resolveTrigger" }).events)).toHaveLength(2);
    const outside = world(side, [], { back: [echo().id], hand: [points.id, donor.id], void: [donor.id], deck: [donor.id, ...deck] });
    expect(copies(step(outside.engine, step(outside.engine, outside.state, play(outside.ids[side].hand[0])).state, { kind: "resolveTrigger" }).events)).toHaveLength(1);
  });

  it("uses the current source controller and leaves character copies and absent subjects unmodified", () => {
    const take = card(24, [activated([energy(0)], p.gainControl(target(anyCharacter())))], { cardType: "character", spark: 1 });
    const f = world(side, [], { back: [echo().id, take.id], hand: [points.id] }, { back: [donor.id] }, [take]);
    const played = step(f.engine, f.state, { kind: "activate", source: f.ids[side].back[1]!, ability: 0 }, [[f.ids[f.other].back[0]!]]);
    const controlled = step(f.engine, played.state, { kind: "resolveTop" });
    const ready = controlled.state;
    const made = step(f.engine, step(f.engine, ready, play(f.ids[side].hand[0])).state, { kind: "resolveTrigger" });
    expect(copies(made.events)).toHaveLength(2);
    expect(copies(made.events)[1].bonusFrom?.source).toBe(f.ids[f.other].back[0]);
    const chars = world(side, [modifier], { back: [echo().id], hand: [v.vanilla0.id] });
    expect(copies(step(chars.engine, step(chars.engine, chars.state, play(chars.ids[side].hand[0])).state, { kind: "resolveTrigger" }).events)).toHaveLength(1);
  });

  it("retains real external mandatory copy loops and optional stopping choices", () => {
    for (const inHand of [false, true]) for (const optional of [false, true]) {
      const renewal = p.copyCard(triggeringCard());
      const observer = sign(3, [triggered(whenCopyTrigger("you", { cardType: "event" }), optional ? p.optional(renewal) : renewal)]);
      const f = world(side, [modifier, observer], { back: inHand ? [] : [echo().id], hand: [inHand ? hand.id : points.id] });
      const initial = { ...f.state, config: { ...f.state.config, resolutionCap: 12, mandatoryLoopCheckFrom: 1 } };
      let state = step(f.engine, step(f.engine, initial, play(f.ids[side].hand[0])).state, { kind: inHand ? "resolveTop" : "resolveTrigger" }).state;
      let occasions = 2;
      for (let count = 0; state.result === null && state.triggerQueue.length > 0 && count < 20; count++) {
        const next = step(f.engine, state, { kind: "resolveTrigger" }, optional ? [false] : [], true);
        occasions += copies(next.events).length; state = next.state;
      }
      if (optional) { expect(state.result).toBeNull(); expect(occasions).toBe(2); expect(state.triggerQueue).toEqual([]); }
      else { expect(occasions).toBeGreaterThan(2); expect(state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" }); }
    }
  });
});

describe("copy modifier fuzz target coverage", () => {
  it.each(["event", "character"] as const)("counts actual passive modifier bonuses, not unmodified %s copies", cardType => {
    const subject = card(60, [], { cardType, spark: cardType === "event" ? null : 1 });
    const avatar: EngineAvatarDefinition = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000654200"), status: "authored",
      abilities: () => [triggered(atStartOfFirstTurn(), p.sequence(
        p.createCopyInHand(everyIn("hand", { cardType })), p.createCopyInHand(everyIn("deck", { cardType })), p.winTheGame()))] };
    // A reserved matching subject stays in hand or deck, independent of the opening split.
    const pool: FuzzPool = withFuzzCardWeights({ cards: [subject], dreamwell: [], figments: [],
      emblems: { avatars: [avatar], dreamsigns: [modifier] } }, [avatar.id, modifier.id, subject.id].join(","));
    const engine = createEngine(fuzzEngineCatalog(pool));
    const game = playFuzzGame(engine, battleSeed("copy-modifier-coverage"), pool);
    expect(game.failure).toBeNull();
    expect(game.result?.kind).toBe("victory");
    const setupAnswers = new ScriptedSource(game.startAnswers.filter(answer => answer.auto !== true).map(answer => answer.value));
    const actual = engine.createBattle(game.init, setupAnswers);
    setupAnswers.assertExhausted();
    expect(copies(actual.events).length).toBeGreaterThan(0);
    const bonuses = fuzzGameLog(engine, game).filter(r => r.event === "engine.copyBonus");
    const coverage = game.targetCoverage.find(entry => entry.target.kind === "dreamsign" && entry.target.uuid === modifier.id);
    expect(coverage?.included).toBeGreaterThan(0);
    expect(coverage?.exercised).toBe(bonuses.length);
    if (cardType === "event") {
      expect(bonuses.length).toBeGreaterThan(0);
      for (const bonus of bonuses) expect(bonus.detail.bonusFrom).toMatchObject({ source: { kind: "dreamsign" }, origin: { kind: "dreamsign", id: modifier.id } });
    } else expect(coverage?.exercised).toBe(0);
  });
});

describe("copy modifier prompt and error boundaries", () => {
  function pending() {
    const f = world("player", [modifier], { back: [echo().id, v.vanilla0.id], hand: [modal.id] }, { back: [v.vanilla1.id] });
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    let current = applied(fold.reduce(slice(f.state), { kind: "battleAction", side: "player", action: play(f.ids.player.hand[0]) })).slice;
    for (const value of [2, true, 0, [f.ids.player.back[1]!], 0, [f.ids.enemy.back[0]!]] satisfies Answer[]) {
      const prompt = fold.pending(current)!.prompt;
      current = applied(fold.reduce(current, { kind: "answer", side: prompt.side, promptId: prompt.id, value })).slice;
    }
    return { ...f, current, fold };
  }
  it("saves/reloads a genuine bonus prompt, rejects concurrent/malformed/stale answers, then commits once with stable logs", () => {
    const f = pending();
    const waiting = f.fold.pending(f.current)!;
    expect(waiting.prompt.kind).toBe("chooseMode");
    expect(copies(runStep(f.current.committed, f.current.inFlight!.step, INTERACTIVE, f.engine.catalog,
      { prefix: f.current.inFlight!.answers, automatic: true }).events)).toHaveLength(1);
    expect(promptRedactionViolations(waiting.prompt, waiting.display, f.engine.catalog)).toEqual([]);
    expect(f.current.committed.stack).toHaveLength(1);
    const hash = stateHash(f.current.committed);
    const restored = JSON.parse(JSON.stringify(f.current), (_key, value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse()) : value) as BattleSlice;
    const logs: EngineLogRecord[] = [];
    const reload = createFoldAdapter(f.engine, { checkEventPrefix: true, log: record => logs.push(record) });
    expect(reload.pending(restored)?.prompt).toEqual(waiting.prompt);
    for (const intent of [
      { kind: "battleAction", side: "player", action: { kind: "pass" } },
      { kind: "answer", side: "enemy", promptId: waiting.prompt.id, value: 1 },
      { kind: "answer", side: "player", promptId: waiting.prompt.id, value: [f.ids.player.hand[0]] },
    ] satisfies Parameters<typeof reload.reduce>[1][]) expect(reload.reduce(restored, intent).kind).toBe("bounced");
    expect(stateHash(restored.committed)).toBe(hash);
    const intent = { kind: "answer", side: "player", promptId: waiting.prompt.id, value: 1 } as const;
    const baseline = applied(f.fold.reduce(f.current, intent));
    const resumed = applied(reload.reduce(restored, intent));
    expect(stateHash(resumed.slice.committed)).toBe(stateHash(baseline.slice.committed));
    expect(resumed.published).toEqual(baseline.published);
    expect(copies(resumed.published)).toHaveLength(1);
    expect(logs.filter(r => r.event === "engine.copyBonus")).toHaveLength(1);
    expect(reload.reduce(resumed.slice, intent).kind).toBe("bounced");
    expect(resumed.slice.committed.stack).toEqual([]);
    expect(resumed.slice.committed.sides.player.score).toBe(2);
  });

  it("contains partial copy work after an intentional effect error", () => {
    const failure: EngineCardDefinition = { ...points, id: id(30), synthetic: { resolve(ctx, item) {
      createCopyInHand(ctx, item.instance, item.controller, true);
      throw new Error("synthetic error after physical copies");
    } } };
    const f = world("player", [modifier], { hand: [failure.id] }, {}, [failure]);
    const played = step(f.engine, f.state, play(f.ids.player.hand[0]));
    const hash = stateHash(played.state);
    expect(() => runStep(played.state, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog)).toThrow(/after physical copies/);
    expect(stateHash(played.state)).toBe(hash);
    const fold = createFoldAdapter(f.engine);
    const queued: BattleSlice = { ...slice(played.state), inFlight: { step: { kind: "resolveTop" }, answers: [], automatic: true } };
    const outcome = fold.reduce(queued, { kind: "battleAction", side: "player", action: { kind: "pass" } });
    if (outcome.kind !== "applied") throw new Error("Expected contained error");
    expect(outcome.error).not.toBeNull();
    expect(outcome.slice.inFlight).toBeNull();
    expect(stateHash(outcome.slice.committed)).toBe(hash);
    expect(copies(outcome.published)).toEqual([]);
  });

  it("qualifies a legacy saved Gem trigger as an atomic error under the current non-effect ability", () => {
    const oldSign = sign(1, [triggered(whenCopyTrigger("you", { cardType: "event" }), p.copyCard(triggeringCard()))]);
    const f = world("player", [oldSign], { back: [echo().id, v.vanilla0.id], hand: [modal.id] }, { back: [v.vanilla1.id] });
    const played = step(f.engine, f.state, play(f.ids.player.hand[0]), [2, true, 1]);
    const made = step(f.engine, played.state, { kind: "resolveTrigger" }, [0, [f.ids.player.back[1]!]]);
    const old = runStep(made.state, { kind: "resolveTrigger" }, INTERACTIVE, f.engine.catalog, { automatic: true });
    expect(old.kind).toBe("suspended");
    const current = world("player").engine;
    const saved: BattleSlice = { ...slice(made.state), inFlight: { step: { kind: "resolveTrigger" }, answers: [], automatic: true } };
    const fold = createFoldAdapter(current);
    expect(fold.pending(saved)).toBeNull();
    const failed = fold.reduce(saved, { kind: "battleAction", side: "player", action: { kind: "pass" } });
    if (failed.kind !== "applied") throw new Error("Expected legacy boundary error");
    expect(failed.error).not.toBeNull();
    expect(failed.slice.inFlight).toBeNull();
    expect(stateHash(failed.slice.committed)).toBe(stateHash(saved.committed));
    expect(copies(failed.published)).toEqual([]);
    expect(failed.slice.committed.triggerQueue).toEqual(saved.committed.triggerQueue);
    expect(failed.slice.committed.triggerQueue.length).toBeGreaterThan(0);
    expect(fold.reduce(failed.slice, { kind: "battleAction", side: "player", action: { kind: "pass" } }).kind).toBe("bounced");
    const repeated = fold.reduce({ ...failed.slice, inFlight: saved.inFlight }, { kind: "battleAction", side: "player", action: { kind: "pass" } });
    if (repeated.kind !== "applied") throw new Error("Expected repeated legacy boundary error");
    expect(repeated.error).not.toBeNull();
    expect(repeated.slice.committed.triggerQueue).toEqual(saved.committed.triggerQueue);
    expect(stateHash(repeated.slice.committed)).toBe(stateHash(saved.committed));
    expect(copies(repeated.published)).toEqual([]);
  });
});
