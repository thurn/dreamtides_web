/**
 * Mandatory cycles (rules § Infinite Loops), on synthetic fixtures: an exact
 * repeat, a late-entered repeat, a two-step repeat, the resolution cap, and
 * the choices that make a sequence not mandatory.
 */
import { describe, expect, it } from "vitest";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { nextAutomaticStep } from "../steps/driver";
import { runStep } from "../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { AnswerSource } from "../steps/types";
import { CYCLE, LOOP } from "../testing/loop-cards";
import { toggleEcho, engine, deck, board, sourceOf, activate, repeat, ended } from "./loops.fixtures";
import { createEngine, type Engine } from "../engine";
import type { EngineCardDefinition } from "../catalog";
import { all, enemyCharacter, energy, event, self, staticAbility, target, characterYouControl, winCondition } from "../dsl/builders";
import { onMaterialized, triggered, triggeringCard, whenCopyTrigger, whenYouPlay } from "../dsl/triggers";
import type { Ability, Condition } from "../dsl/types";
import type { ResolvingEffect } from "../effects/registry";
import * as p from "../effects/primitives";
import { randomLegalAnswer } from "../prompts/answers";
import type { Answer, Prompt } from "../prompts/types";
import { boardState } from "../testing/board";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { eventRedactionViolations, promptRedactionViolations, redactionViolations } from "../testing/redaction";
import type { EngineEvent } from "../events";
import { parseDreamsignId } from "../../types/identifiers";

const COPY_LOOP_CONFIG = { mandatoryLoopCheckFrom: 8, mandatoryLoopWindow: 16, resolutionCap: 256 } as const;

function copyChain(side: Side, hand: boolean, options: {
  readonly body?: (effect: ResolvingEffect) => ResolvingEffect;
  readonly starter?: (effect: ResolvingEffect) => ResolvingEffect;
  readonly extra?: readonly Ability[];
  readonly once?: boolean;
  readonly condition?: Condition;
} = {}) {
  const ref = { kind: "stackTarget", selector: { kind: "stackItem", controller: "you", cardType: "event" } } as const;
  const copy = hand ? p.chooseOne(p.createCopyInHand(ref), p.createCopyInHand(ref, { ephemeral: true })) : p.copyCard(ref);
  const renewal = p.triggerAbility(self(), "materialized");
  const source: EngineCardDefinition = {
    id: syntheticId(0xfe001), cardType: "character", costs: [energy(0)], spark: 1,
    subtype: "Warrior", speed: "standard", status: "authored",
    abilities: () => [
      triggered(whenYouPlay({ cardType: "event" }), options.starter?.(renewal) ?? renewal),
      triggered(onMaterialized(), options.body?.(p.sequence(copy, renewal)) ?? p.sequence(copy, renewal),
        { ...(options.once ? { oncePerTurn: true } : {}), ...(options.condition === undefined ? {} : { condition: options.condition }) }),
      ...(options.extra ?? []),
    ],
  };
  const copied: EngineCardDefinition = {
    id: syntheticId(0xfe002), cardType: "event", costs: [energy(0)], spark: null,
    subtype: "", speed: "standard", status: "authored",
    abilities: () => [event(p.chooseOne(p.gainSpark(target(enemyCharacter()), 1), p.gainSpark(target(enemyCharacter()), 2)))],
  };
  const local = createEngine(testCatalog([source, copied]));
  const other = side === "player" ? "enemy" : "player";
  const setup = boardState(local.catalog, { active: side, phase: "day",
    [side]: { back: [source.id, SYNTHETIC.vanilla0.id], hand: [copied.id], energy: 1, deck },
    [other]: { back: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], deck } });
  for (const instance of Object.values(setup.state.instances)) {
    setup.state.instances[instance.id] = { ...instance, variant: { ...instance.variant, transfigurations: [] } };
  }
  const card = setup.ids[side].hand[0];
  if (card === undefined) throw new Error("missing card");
  const state: BattleState = { ...setup.state, config: { ...setup.state.config, ...COPY_LOOP_CONFIG } };
  return { ...setup, state, local, side, action: { kind: "play", card, from: "hand" } as const };
}

/** A deterministic strategy, with a watchdog which fails rather than ending a game. */
type CopyDecision = (prompt: Prompt, state: BattleState) => Answer | undefined;
function copyAnswers(limit: number, answer?: CopyDecision): AnswerSource {
  let ordinal = 0;
  return { answer(prompt, state) {
    if (ordinal > limit) throw new Error("copy continuation did not terminate within the witness budget");
    const value = answer?.(prompt, state) ?? randomLegalAnswer(prompt, () => ordinal % 2 === 0 ? 0 : 0.999999);
    ordinal += 1;
    return value;
  } };
}

function foldCopies(local: Engine, state: BattleState, side: Side, action: ReturnType<typeof copyChain>["action"], reload: boolean | "reordered") {
  let fold = createFoldAdapter(local, { checkEventPrefix: true });
  let slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const answers = copyAnswers(state.config.mandatoryLoopCheckFrom * 4 + 20);
  const events: EngineEvent[] = [];
  const fingerprints: Prompt[] = [];
  const apply = (intent: Parameters<typeof fold.reduce>[1]) => {
    const outcome = fold.reduce(slice, intent);
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("fold failed");
    slice = outcome.slice;
    events.push(...outcome.published);
  };
  apply({ kind: "battleAction", side, action });
  for (;;) {
    const pending = fold.pending(slice);
    if (pending === null) break;
    expect(promptRedactionViolations(pending.prompt, pending.display, local.catalog)).toEqual([]);
    fingerprints.push(pending.prompt);
    if (reload) {
      const restored = JSON.parse(JSON.stringify(slice), (_key, value: unknown) =>
        reload === "reordered" && value !== null && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse()) : value) as BattleSlice;
      expect(stateHash(restored.committed)).toBe(stateHash(slice.committed));
      slice = { ...restored, committed: deserializeState(serializeState(restored.committed)) };
      fold = createFoldAdapter(local, { checkEventPrefix: true });
      expect(fold.pending(slice)?.prompt).toEqual(pending.prompt);
    }
    apply({ kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value: answers.answer(pending.prompt, pending.display) });
  }
  return { slice, events, fingerprints };
}

/** Plays the only card in the player's hand from `state`, answering prompts from `answers`. */
function playOnly(state: BattleState, hand: readonly InstanceId[], answers: AnswerSource = NO_PROMPTS) {
  const card = hand[0];
  if (card === undefined) throw new Error("no card");
  return engine.apply(state, "player", { kind: "play", card, from: "hand" }, answers);
}

describe("mandatory loops", () => {
  it("ends the battle in a draw when automatic steps repeat a state exactly", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.echo.id], energy: 1, deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const result = engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBeLessThan(result.state.config.resolutionCap);
    expect(engine.decision(result.state)).toBeNull();
  });

  it("detects a cycle that repeats a state only every second step", () => {
    const { state, ids } = board({ player: { hand: [toggleEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...state.config, resolutionCap: 200, mandatoryLoopCheckFrom: 1 };
    const result = playOnly({ ...state, config }, ids.player.hand);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBeLessThan(config.resolutionCap);
  });

  it("ends a cycle that never repeats a state in a draw at the resolution cap", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.growingEcho.id], energy: 1, deck }, enemy: { deck } });
    const capped: BattleState = { ...state, config: { ...state.config, resolutionCap: 40, mandatoryLoopCheckFrom: 1 } };
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const result = engine.apply(capped, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    expect(result.state.result).toEqual({ kind: "draw", reason: "resolutionCap" });
    expect(result.state.automaticSteps).toBe(41);
  });

  it("does not end an optional loop in a draw when its iterations stop changing the battle", () => {
    const { state, ids } = board({ player: { back: [LOOP.drain.id], deck }, enemy: { energy: 2, deck } });
    const once = activate(state, sourceOf(ids.player));
    expect(once.state.sides.enemy.currentEnergy).toBe(1);
    const checked: BattleState = { ...once.state, config: { ...once.state.config, loopIterationCap: 40, mandatoryLoopCheckFrom: 1 } };
    const result = repeat(checked, "untilVictory");
    expect(result.state.sides.enemy.currentEnergy).toBe(0);
    expect(result.state.result).toBeNull();
    expect(ended(result.events)).toEqual({ iterations: 40, reason: "iterationCap" });
  });

  it("detects a repeat that begins late in a run, before the resolution cap", () => {
    // From 0● after the play, the run gains 1● per step until 8● at step 9,
    // then repeats one state; a power-of-two step count falls just before it.
    const { state, ids } = board({ player: { hand: [CYCLE.lateEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...state.config, resolutionCap: 16, mandatoryLoopCheckFrom: 1, mandatoryLoopWindow: 4 };
    const result = playOnly({ ...state, config }, ids.player.hand);
    expect(result.state.sides.player.currentEnergy).toBe(8);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBeLessThanOrEqual(config.resolutionCap);
  });

  it("does not end a loop in a draw while its player keeps choosing to continue it", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.optionalEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...state.config, mandatoryLoopCheckFrom: 1 };
    const answers = new ScriptedSource([...Array.from({ length: 20 }, () => true), false]);
    const result = playOnly({ ...state, config }, ids.player.hand, answers);
    answers.assertExhausted();
    expect(result.answers.filter((answer) => answer.auto !== true)).toHaveLength(21);
    expect(result.state.result).toBeNull();
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
  });

  it("does not count automatic steps in which a player made a choice toward the resolution cap", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.optionalGrowingEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...state.config, resolutionCap: 5, mandatoryLoopCheckFrom: 1 };
    const answers = new ScriptedSource([...Array.from({ length: 10 }, () => true), false]);
    const result = playOnly({ ...state, config }, ids.player.hand, answers);
    answers.assertExhausted();
    expect(result.state.sides.player.currentEnergy).toBe(10);
    expect(result.state.result).toBeNull();
    expect(result.state.automaticSteps).toBeLessThanOrEqual(config.resolutionCap);
  });

  it("counts a choice answered through the fold after a suspension, and keeps a late repeat's detection across reloads", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.optionalEcho.id], energy: 1, deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    let slice: BattleSlice = { committed: { ...state, config: { ...state.config, mandatoryLoopCheckFrom: 1 } }, inFlight: null, publishedEvents: 0, attempt: 0 };
    const reduce = (intent: Parameters<typeof fold.reduce>[1]) => {
      const outcome = fold.reduce(slice, intent);
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("intent failed");
      slice = outcome.slice;
    };
    reduce({ kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    for (let answer = 0; answer <= 20; answer++) {
      const pending = fold.pending(slice);
      if (pending === null) throw new Error("no prompt");
      reduce({ kind: "answer", side: "player", promptId: pending.prompt.id, value: answer < 20 });
    }
    expect(fold.pending(slice)).toBeNull();
    expect(slice.committed.result).toBeNull();
    expect(engine.decision(slice.committed)).toEqual({ kind: "main", side: "player" });

    // Reloading between every automatic step reaches the same draw at the same step.
    const late = board({ player: { hand: [CYCLE.lateEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...late.state.config, resolutionCap: 16, mandatoryLoopCheckFrom: 1, mandatoryLoopWindow: 4 };
    const whole = playOnly({ ...late.state, config }, late.ids.player.hand);
    const lateCard = late.ids.player.hand[0];
    if (lateCard === undefined) throw new Error("no card");
    const played = runStep({ ...late.state, config }, { kind: "play", card: lateCard, from: "hand" }, NO_PROMPTS, engine.catalog);
    if (played.kind !== "done") throw new Error("suspended");
    let current = played.state;
    for (;;) {
      const step = nextAutomaticStep(current, engine.catalog, engine.memo);
      if (step === null) break;
      const result = runStep(deserializeState(serializeState(current)), step, NO_PROMPTS, engine.catalog, { automatic: true });
      if (result.kind !== "done") throw new Error("suspended");
      current = result.state;
    }
    expect(current.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(stateHash(current)).toBe(stateHash(whole.state));
  });

  it("keeps a cycle mandatory when its only prompt is a forced choice", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.targetedEcho.id], energy: 1, deck }, enemy: { deck } });
    const result = playOnly(state, ids.player.hand);
    expect(result.answers.length).toBeGreaterThan(0);
    expect(result.answers.every((answer) => answer.auto === true)).toBe(true);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
  });
});

describe("closed mandatory copy continuations", () => {
  it.each([
    ["player", false], ["player", true], ["enemy", false], ["enemy", true],
  ] as const)("certifies phase-inert Ephemeral preservation for %s hand=%s through real copies and reload", (side, hand) => {
    // The control has the same permanent copy kernel without the static.
    for (const preserve of [false, true]) {
      const sign = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000688001");
      const subject: EngineCardDefinition = {
        ...SYNTHETIC.event0, id: syntheticId(0x688002), status: "authored",
        abilities: () => [event(p.gainPoints(1))],
      };
      const local = createEngine(testCatalog([subject], { dreamsigns: [{
        id: sign, status: "authored", abilities: () => [
          triggered(whenYouPlay({ cardType: "event" }), hand
            ? p.createCopyInHand(triggeringCard(), { ephemeral: true }) : p.copyCard(triggeringCard())),
          triggered(whenCopyTrigger("you", { cardType: "event" }), p.copyCard(triggeringCard())),
          ...(preserve ? [staticAbility(p.preserveEphemeralHand())] : []),
        ],
      }] }));
      const other = side === "player" ? "enemy" : "player";
      const setup = boardState(local.catalog, { active: side, phase: "day",
        [side]: { hand: [subject.id, SYNTHETIC.event0.id], dreamsigns: [sign], deck },
        [other]: { hand: [SYNTHETIC.event0.id], deck },
      });
      const card = setup.ids[side].hand[0];
      const held = setup.ids[side].hand[1];
      const opposing = setup.ids[other].hand[0];
      if (card === undefined || held === undefined || opposing === undefined) throw new Error("missing witness card");
      setup.state.instances[held].status.ephemeral = true;
      setup.state.instances[held].status.offering = true;
      setup.state.instances[opposing].status.ephemeral = true;
      const state: BattleState = { ...setup.state, config: { ...setup.state.config, ...COPY_LOOP_CONFIG,
        resolutionCap: COPY_LOOP_CONFIG.mandatoryLoopCheckFrom * 2 } };
      const input = serializeState(state);
      const action = { kind: "play", card, from: "hand" } as const;
      const played = runStep(state, action, NO_PROMPTS, local.catalog);
      if (played.kind !== "done") throw new Error("witness play suspended");
      let current = played.state;
      const events: EngineEvent[] = [...played.events];
      // Every step saves and reloads; the cap bounds the old classification too.
      for (let count = 0; count <= state.config.resolutionCap; count++) {
        const step = nextAutomaticStep(current, local.catalog, local.memo);
        if (step === null) break;
        const before = serializeState(current);
        const loaded = deserializeState(before);
        const result = runStep(loaded, step, NO_PROMPTS, local.catalog, { automatic: true });
        if (result.kind !== "done") throw new Error("witness copy suspended");
        expect(serializeState(loaded)).toBe(before);
        current = result.state;
        events.push(...result.events);
      }
      expect(current.result, `preserve=${preserve}`).toEqual({ kind: "draw", reason: "mandatoryLoop" });
      expect(current.automaticSteps).toBe(state.config.mandatoryLoopCheckFrom);
      expect(current.config).toEqual(state.config);
      expect(current.turn).toEqual(state.turn);
      expect(local.decision(current)).toBeNull();
      expect(current.instances[held]).toEqual(state.instances[held]);
      expect(current.instances[opposing]).toEqual(state.instances[opposing]);
      expect(events.some(e => e.kind === "phaseChanged" || e.kind === "banished" ||
        e.kind === "ceasedToExist" || e.kind === "discarded" || e.kind === "resolved")).toBe(false);
      const made = events.flatMap(e => e.kind === "cardCopied" ? [e.copy] : []);
      expect(made.length).toBeGreaterThan(1);
      expect(new Set(made).size).toBe(made.length);
      for (const id of made) {
        expect(current.instances[id]).toMatchObject({ owner: side, controller: side,
          zone: hand ? "hand" : "stack", status: { created: true, ephemeral: hand } });
        if (hand) expect(current.sides[side].hand).toContain(id);
        else expect(current.stack.some(item => item.kind === "card" && item.instance === id)).toBe(true);
      }
      const whole = local.apply(state, side, action, NO_PROMPTS);
      expect(stateHash(current)).toBe(stateHash(whole.state));
      expect(events).toEqual(whole.events);
      const folded = foldCopies(local, state, side, action, false);
      expect(folded.slice.inFlight).toBeNull();
      expect(stateHash(folded.slice.committed)).toBe(stateHash(current));
      expect(folded.events).toEqual(events);
      expect(serializeState(state)).toBe(input);
    }
  });

  it.each([
    ["player", false], ["player", true], ["enemy", false], ["enemy", true],
  ] as const)("draws real copies for %s hand=%s with independent genuine choices and deterministic reload", (side, hand) => {
      const { local, state, action } = copyChain(side, hand);
      let before = state;
      const whole = local.apply(state, side, action, copyAnswers(state.config.mandatoryLoopCheckFrom * 4 + 20), (next, _step, events) => {
        expect(eventRedactionViolations(events, before, next)).toEqual([]);
        expect(redactionViolations(next, local.catalog)).toEqual([]);
        before = next;
      });
      expect(whole.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
      expect(local.decision(whole.state)).toBeNull();
      expect(whole.answers.some(answer => answer.auto !== true)).toBe(true);
      expect(whole.state.automaticChoices).toBeGreaterThan(0);
      const created = whole.events.flatMap(e => e.kind === "cardCreated" ? [e.instance] : []);
      expect(new Set(created).size).toBe(created.length);
      expect(created.length).toBeGreaterThan(1);
      if (hand) {
        const copies = whole.state.sides[side].hand.map(id => whole.state.instances[id]);
        expect(copies.some(card => card.status.ephemeral)).toBe(true);
        expect(copies.some(card => !card.status.ephemeral)).toBe(true);
        expect(copies.map(card => card.id)).toEqual(created);
      } else {
        const copies = whole.state.stack.flatMap(item => item.kind === "card" && created.includes(item.instance) ? [item] : []);
        expect(new Set(copies.map(item => item.choices[0]?.modes[0])).size).toBeGreaterThan(1);
        expect(new Set(copies.map(item => item.choices[0]?.targets[0]?.[0])).size).toBeGreaterThan(1);
        expect(new Set(whole.events.flatMap(e => e.kind === "cardCopied" ? [e.original] : [])).size).toBeGreaterThan(1);
      }
      const queued = whole.events.filter(e => e.kind === "triggerQueued");
      const resolved = whole.events.filter(e => e.kind === "triggerResolved");
      expect(resolved.map(e => e.ability)).toEqual(queued.slice(0, resolved.length).map(e => e.ability));
      for (const reload of [false, true, "reordered"] as const) {
        const folded = foldCopies(local, state, side, action, reload);
        expect(folded.slice.inFlight).toBeNull();
        expect(stateHash(folded.slice.committed)).toBe(stateHash(whole.state));
        expect(folded.events).toEqual(whole.events);
        if (reload) expect(folded.fingerprints).toEqual(foldCopies(local, state, side, action, false).fingerprints);
      }
  });

  it("draws an unavoidable copy continuation with harmless empty modal instructions", () => {
    const { state, local, action } = copyChain("player", true, {
      body: effect => p.sequence(p.chooseOne(p.sequence(), p.sequence()), effect),
    });
    const result = local.apply(state, "player", action, copyAnswers(state.config.mandatoryLoopCheckFrom * 6 + 20));
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.answers.some(answer => answer.auto !== true)).toBe(true);
    expect(result.state.sides.player.hand.length).toBeGreaterThan(1);
  });

  it("starts a new mandatory run when a stopping choice enters a closed continuation", () => {
    const { state, local, action } = copyChain("player", true, { starter: renewal => p.chooseOne(p.sequence(), renewal) });
    const played = runStep(state, action, copyAnswers(20), local.catalog);
    if (played.kind !== "done") throw new Error("play suspended");
    const start = { ...played.state, automaticSteps: state.config.mandatoryLoopCheckFrom - 1 };
    const entered = runStep(start, { kind: "resolveTrigger" }, new ScriptedSource([1]), local.catalog, { automatic: true });
    if (entered.kind !== "done") throw new Error("entry suspended");
    expect(entered.state.result).toBeNull();
    expect(entered.state.automaticSteps).toBe(0);
    const continued = runStep(entered.state, { kind: "resolveTrigger" }, copyAnswers(20), local.catalog, { automatic: true });
    if (continued.kind !== "done") throw new Error("copy suspended");
    expect(continued.state.result).toBeNull();
    expect(continued.state.automaticSteps).toBe(1);
    expect(continued.state.sides.player.hand).toHaveLength(1);
  });

  it("preserves optional, stopping-mode, target, once-per-turn and count-bounded continuations", () => {
    const limit = COPY_LOOP_CONFIG.mandatoryLoopCheckFrom + 5;
    const handBound = { cond: "cardsIn", player: "you", zone: "hand", atMost: limit } as const;
    const cases: (NonNullable<Parameters<typeof copyChain>[2]> & { readonly choose?: CopyDecision })[] = [
      { body: (effect: ResolvingEffect) => p.optional(effect), choose: (prompt: Prompt, state: BattleState) => prompt.kind === "confirm" ? state.sides.player.hand.length <= limit : undefined },
      { body: (effect: ResolvingEffect) => p.chooseOne(effect, p.sequence()), choose: (prompt: Prompt, state: BattleState) => prompt.kind === "chooseMode" && prompt.purpose.source === state.sides.player.backRank[0] ? (state.sides.player.hand.length <= limit ? 0 : 1) : undefined },
      { body: (effect: ResolvingEffect) => p.ifThen(handBound, effect) },
      { condition: handBound },
      { once: true },
      { starter: renewal => p.sequence(p.disableTriggers(self(), "permanent", { cond: "cardsIn", player: "you", zone: "hand", atLeast: limit }), renewal) },
      { body: (_effect: ResolvingEffect) => p.sequence(p.createCopyInHand({ kind: "stackTarget", selector: { kind: "stackItem", controller: "you", cardType: "event" } }), p.triggerAbility(target(characterYouControl()), "materialized")),
        choose: (prompt: Prompt, state: BattleState) => prompt.kind === "chooseTargets" && prompt.purpose.source === state.sides.player.backRank[0] && prompt.candidates.includes(state.sides.player.backRank[0]!) ? [state.sides.player.backRank[state.sides.player.hand.length <= limit ? 0 : 1]!] : undefined },
      { body: (effect: ResolvingEffect) => p.ifThen(handBound, effect), extra: [triggered(onMaterialized(), p.gainSpark(self(), 1))] },
      { body: () => p.sequence(p.createCopyInHand({ kind: "stackTarget", selector: { kind: "stackItem", controller: "you", cardType: "event" } }), p.triggerAbility(target(characterYouControl()), "materialized")),
        extra: [staticAbility(p.grant(all(characterYouControl()), "cannotBeTargeted"), { while: { cond: "cardsIn", player: "you", zone: "hand", atLeast: limit } })],
        choose: (prompt, state) => prompt.kind === "chooseTargets" && prompt.purpose.source === state.sides.player.backRank[0] && prompt.candidates.includes(state.sides.player.backRank[0]!) ? [state.sides.player.backRank[0]!] : undefined },
    ];
    for (const options of cases) {
      const { state, local, action } = copyChain("player", true, options);
      const result = local.apply(state, "player", action, copyAnswers(limit * 8 + 30, options.choose));
      expect(result.state.result).toBeNull();
      expect(result.state.triggerQueue).toEqual([]);
      if (!options.once) expect(result.state.sides.player.hand.length).toBeGreaterThan(state.config.mandatoryLoopCheckFrom);
    }
  });

  it("completes a fixed copy count without a renewing trigger", () => {
    const { state, local, action } = copyChain("player", false, { body: () => p.copyCardTimes({ kind: "stackTarget", selector: { kind: "stackItem", controller: "you", cardType: "event" } }, 2) });
    const result = local.apply(state, "player", action, copyAnswers(20));
    expect(result.state.result).toBeNull();
    expect(result.state.triggerQueue).toEqual([]);
    expect(result.events.filter(e => e.kind === "cardCopied")).toHaveLength(2);
  });

  it.each(["player", "enemy"] as const)("allows a dormant hand-count victory beyond the mandatory threshold for %s", side => {
    const limit = COPY_LOOP_CONFIG.mandatoryLoopCheckFrom + 5;
    const { state, local, action } = copyChain(side, true, { extra: [winCondition({ cond: "cardsIn", player: "you", zone: "hand", atLeast: limit })] });
    const result = local.apply(state, side, action, copyAnswers(limit * 4 + 20));
    expect(result.state.result).toEqual({ kind: "victory", winner: side, reason: "winCondition" });
    expect(result.state.sides[side].hand).toHaveLength(limit);
  });

  it("keeps committed copies and mandatory accounting untouched on suspension or answer-source error", () => {
    const { state, local, action } = copyChain("player", false);
    const played = runStep(state, action, copyAnswers(20), local.catalog);
    if (played.kind !== "done") throw new Error("play suspended");
    const started = runStep(played.state, { kind: "resolveTrigger" }, NO_PROMPTS, local.catalog, { automatic: true });
    if (started.kind !== "done") throw new Error("starter suspended");
    const hash = stateHash(started.state);
    const suspended = runStep(started.state, { kind: "resolveTrigger" }, INTERACTIVE, local.catalog, { automatic: true });
    expect(suspended.kind).toBe("suspended");
    if (suspended.kind !== "suspended") throw new Error("missing suspension");
    expect(suspended.events.some(e => e.kind === "cardCreated")).toBe(true);
    expect(stateHash(started.state)).toBe(hash);
    expect(() => runStep(started.state, { kind: "resolveTrigger" }, { answer() { throw new Error("injected answer failure"); } }, local.catalog, { automatic: true })).toThrow("injected answer failure");
    expect(stateHash(started.state)).toBe(hash);
    const completed = runStep(started.state, { kind: "resolveTrigger" }, copyAnswers(20), local.catalog, { automatic: true });
    if (completed.kind !== "done") throw new Error("retry suspended");
    expect(completed.events.filter(e => e.kind === "cardCreated")).toHaveLength(1);
  });

  it("bounces malformed, wrong-side and competing stale answers without committing partial copies", () => {
    const { state, local, action } = copyChain("player", false);
    const fold = createFoldAdapter(local, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = fold.reduce(start, { kind: "battleAction", side: "player", action });
    if (opened.kind !== "applied") throw new Error("play bounced");
    const slice = opened.slice;
    const pending = fold.pending(slice);
    if (pending === null) throw new Error("missing prompt");
    const before = JSON.stringify(slice);
    const intent = { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 } as const;
    expect(fold.reduce(slice, { ...intent, value: -1 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(slice, { ...intent, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(JSON.stringify(slice)).toBe(before);
    const applied = fold.reduce(slice, intent);
    if (applied.kind !== "applied" || applied.error !== null) throw new Error("answer failed");
    const next = fold.pending(applied.slice);
    expect(next).not.toBeNull();
    expect(fold.reduce(applied.slice, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fold.pending(applied.slice)).toEqual(next);
  });
});
