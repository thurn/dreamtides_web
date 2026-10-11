/**
 * What fires a trigger (rules § Ability Types → Triggered abilities): named
 * triggers, "when" patterns and played-card matching, functional zones,
 * intervening conditions, and once-per-turn.
 */
import { testCardSubtype } from "../../types/test-identities";
import { describe, expect, it } from "vitest";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { effectiveSpark } from "../rules/spark";
import { deserializeState, stateHash } from "../state/hash";
import type { AbilitySource, CardId, InstanceId, Side } from "../state/ids";
import { SIDES, battleSeed, opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { PromptPurpose } from "../prompts/types";
import { boardState } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { STACK } from "../testing/stack-cards";
import { DSL } from "../testing/dsl-cards";
import { TRIGGER_AVATAR, TRIGGER_DREAMSIGN } from "../testing/trigger-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { v, t, deck, L, START_SIGN, DRAW_SIGN, DAWN_AVATAR, engine, board, play, resolvedSources, queuedCount } from "./triggers.fixtures";

describe("named triggers", () => {
  it("fires ▸Dawn, ▸Dusk, ▸Night, and ▸Challenge in their controller's phases, ▸Challenge only for challengers", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [t.dawnEnergy.id, t.duskPoints.id, t.challengeShrink.id], front: [t.challengeShrink.id, t.nightPump.id], deck },
      enemy: { back: [t.dawnEnergy.id, v.vanilla1.id], deck },
    });
    const mine = ids.player;
    const toDay = passUntil(engine, state, at(engine, "player", "day"));
    expect(resolvedSources(toDay.events)).toEqual([mine.back[0]]);
    const toNight = passUntil(engine, toDay.state, at(engine, "player", "night"), new ScriptedSource([[ids.enemy.back[1]!]]));
    // Dusk, then Night: the challengers' ▸Challenge (F0) before ▸Night (F1); B2 is no challenger.
    expect(resolvedSources(toNight.events)).toEqual([mine.back[1], mine.front[0], mine.front[1]]);
    expect(toNight.state.sides.player.score).toBe(1);
    expect(effectiveSpark(toNight.state, engine.catalog, ids.enemy.back[1]!)).toBe(0);
    expect(effectiveSpark(toNight.state, engine.catalog, mine.front[1]!)).toBe(2);
  });

  it("fires combined ▸Materialized, ▸Dawn on both occasions, and triggerAbility queues a named trigger outside its occasion", () => {
    const { state, ids } = board({
      player: { back: [t.materializedDraw.id], hand: [t.materializedOrDawn.id, t.retrigger.id], energy: 4, deck },
      enemy: { deck },
    });
    let current = play(state, "player", ids.player.hand[0]).state;
    expect(current.sides.player.currentEnergy).toBe(3);
    const handBefore = current.sides.player.hand.length;
    current = play(current, "player", ids.player.hand[1], [[ids.player.back[0]!]]).state;
    expect(current.sides.player.hand.length).toBe(handBefore);
    const enemyDay = passUntil(engine, current, at(engine, "enemy", "day"));
    const toDawn = passUntil(engine, enemyDay.state, at(engine, "player", "day"));
    expect(queuedCount(toDawn.events, current.sides.player.backRank[1]!)).toBe(1);
  });
});

describe("when patterns", () => {
  it("counts the nth card played this turn, and resets the count each turn", () => {
    const { state, ids } = board({ player: { back: [t.secondCardPoints.id], hand: [v.event0.id, v.event0.id, v.event0.id], deck }, enemy: { deck } });
    let current = state;
    const scores: number[] = [];
    for (const card of ids.player.hand) {
      current = play(current, "player", card).state;
      scores.push(current.sides.player.score);
    }
    expect(scores).toEqual([0, 1, 1]);
    expect(current.turnLog.played.player.map((entry) => entry.instance)).toEqual(ids.player.hand);
    const next = passUntil(engine, current, at(engine, "enemy", "day")).state;
    expect(next.turnLog.played.player).toEqual([]);
  });

  it("matches a played card by the types it had as it was played, including all character types", () => {
    const { state, ids } = board({ player: { back: [L.mageWatcher.id], hand: [L.warrior.id, L.warrior.id, L.warrior.id], deck }, enemy: { deck } });
    const [first, plain, last] = ids.player.hand;
    if (first === undefined || plain === undefined || last === undefined) throw new Error("no card");
    // As a resolved "gains all character types" effect leaves it: a floating type change that follows the card into hand.
    const withAllTypes = (current: BattleState, instance: InstanceId): BattleState => ({
      ...current,
      nextEffect: current.nextEffect + 1,
      floating: [
        ...current.floating,
        { id: `e${current.nextEffect}`, controller: "player", source: { kind: "avatar", side: "player" }, timestamp: 0, expiry: { at: "endOfTurn" }, change: { kind: "allTypes", instance } },
      ],
    });
    let current = play(withAllTypes(state, first), "player", first).state;
    expect(current.sides.player.currentEnergy).toBe(1);
    expect(current.sides.player.score).toBe(0);
    // The first card's type change ends; it still counts as a Mage played this turn.
    current = { ...current, floating: current.floating.filter((effect) => effect.change.kind !== "allTypes") };
    current = play(current, "player", plain).state;
    expect(current.sides.player.currentEnergy).toBe(1);
    expect(current.sides.player.score).toBe(0);
    current = play(withAllTypes(current, last), "player", last).state;
    expect(current.sides.player.currentEnergy).toBe(2);
    expect(current.sides.player.score).toBe(1);
  });

  it("triggers a once-per-turn ability once each turn", () => {
    const { state, ids } = board({ player: { back: [t.warriorEnergyOnce.id], hand: [v.vanilla0.id, v.vanilla0.id], deck }, enemy: { deck } });
    const first = play(state, "player", ids.player.hand[0]);
    const second = play(first.state, "player", ids.player.hand[1]);
    expect(second.state.sides.player.currentEnergy).toBe(1);
    expect(queuedCount([...first.events, ...second.events], ids.player.back[0]!)).toBe(1);
    const next = passUntil(engine, second.state, at(engine, "enemy", "day")).state;
    expect(next.oncePerTurn).toEqual([]);
  });

  it("matches draws by count, discards, abandons, and leaving play", () => {
    const drawn = board({ player: { back: [t.secondDrawEnergy.id], hand: [DSL.drawTwo.id], energy: 1, deck }, enemy: { deck } });
    expect(play(drawn.state, "player", drawn.ids.player.hand[0]).state.sides.player.currentEnergy).toBe(1);
    const discarded = board({ player: { avatar: TRIGGER_AVATAR.discardEnergy.id, hand: [DSL.discardTwo.id, v.vanilla1.id, v.vanilla1.id], deck }, enemy: { deck } });
    expect(play(discarded.state, "player", discarded.ids.player.hand[0]).state.sides.player.currentEnergy).toBe(2);
    const { state, ids } = board({ player: { back: [STACK.abandonToDraw.id, t.abandonDraw.id, t.leavesPlayEnergy.id, v.vanilla1.id], deck }, enemy: { deck } });
    const source = new ScriptedSource([[ids.player.back[3]!]]);
    const result = engine.apply(state, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, source);
    // Leaving play is announced before the abandon itself.
    expect(resolvedSources(result.events)).toEqual([ids.player.back[2], ids.player.back[1]]);
    expect(result.state.sides.player.currentEnergy).toBe(1);
    expect(result.state.sides.player.hand).toHaveLength(3);
  });

  it("attributes a chosen discard to the hand holder and fires only that side's discard trigger", () => {
    for (const chooser of SIDES) {
      const holder = opponent(chooser);
      const { state, ids } = boardState(engine.catalog, {
        active: chooser, phase: "day",
        [chooser]: { hand: [L.chosenDiscard.id], back: [L.discardWatcher.id], deck },
        [holder]: { hand: [v.vanilla1.id, v.vanilla2.id], back: [L.discardWatcher.id], deck },
      });
      const chosen = ids[holder].hand[1];
      // Holding a card determines the discarding side even when its owner differs.
      state.instances[chosen] = { ...state.instances[chosen], owner: chooser };
      const result = play(state, chooser, ids[chooser].hand[0], [[chosen]]);
      expect(result.events.filter((entry) => entry.kind === "discarded")).toEqual([{ kind: "discarded", side: holder, instance: chosen }]);
      expect(result.events.filter((entry) => entry.kind === "triggerQueued")).toEqual([
        expect.objectContaining({ source: ids[holder].back[0], subject: chosen }),
      ]);
      expect(resolvedSources(result.events)).toEqual([ids[holder].back[0]]);
      expect(result.state.sides[holder].currentEnergy).toBe(1);
      expect(result.state.sides[chooser].currentEnergy).toBe(0);
      expect(result.state.sides[holder].hand).toEqual([ids[holder].hand[0]]);
      expect(result.state.sides[chooser].void).toContain(chosen);
      expect(result.state.sides[holder].void).not.toContain(chosen);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it("fires when a card leaves your void", () => {
    const { state, ids } = board({
      player: { dreamsigns: [TRIGGER_DREAMSIGN.voidLeaves.id], hand: [STACK.banishVoidToDraw.id], void: [v.vanilla1.id, v.vanilla1.id], deck },
      enemy: { deck },
    });
    expect(play(state, "player", ids.player.hand[0]).state.sides.player.currentEnergy).toBe(2);
  });

  it("fires on challenger designation for 'challenge with N', and on scoring for both sides", () => {
    const setup = (front: readonly CardId[]) =>
      board({ player: { back: [t.challengeWithTwo.id], front, deck }, enemy: { back: [t.opponentScoresEnergy.id], deck } });
    const two = setup([t.scoresDraw.id, v.vanilla1.id]);
    const dusk = passUntil(engine, two.state, (state) => state.turn.phase === "dusk");
    expect(resolvedSources(dusk.events)).toEqual([two.ids.player.back[0]]);
    expect(dusk.state.sides.player.currentEnergy).toBe(1);
    const scored = passUntil(engine, dusk.state, at(engine, "enemy", "day"));
    const challenge = scored.steps.filter((step) => step.step.kind === "challengeLane").flatMap((step) => step.events);
    expect(resolvedSources(challenge)).toEqual([]);
    // Each scoring challenger fires "when this scores" (its controller) and "when the opponent scores".
    const scoring = scored.events.filter((entry) => entry.kind === "triggerResolved");
    expect(scoring.map((entry) => entry.kind === "triggerResolved" && entry.source)).toEqual([
      two.ids.player.front[0],
      two.ids.enemy.back[0],
      two.ids.enemy.back[0],
    ]);
    const one = setup([t.scoresDraw.id]);
    expect(resolvedSources(passUntil(engine, one.state, (state) => state.turn.phase === "dusk").events)).toEqual([]);
  });

  it("fires at the start of each turn, and at the start of each side's own first turn", () => {
    const init = {
      seed: battleSeed("first-turn"),
      scoreToWin: 25,
      startingSide: "player" as const,
      decks: { player: deck.map((cardId) => ({ cardId })), enemy: deck.map((cardId) => ({ cardId })) },
      dreamwell: [],
      dreamsigns: { player: [TRIGGER_DREAMSIGN.firstTurnDraw.id, TRIGGER_DREAMSIGN.turnEnergy.id], enemy: [TRIGGER_DREAMSIGN.firstTurnDraw.id] },
    };
    const start = engine.createBattle(init, NO_PROMPTS);
    const sign = (side: Side, index: number): AbilitySource => ({ kind: "dreamsign", side, index });
    expect(resolvedSources(start.events)).toEqual([sign("player", 0), sign("player", 1)]);
    const enemyTurn = passUntil(engine, start.state, at(engine, "enemy", "day"));
    expect(resolvedSources(enemyTurn.events)).toEqual([sign("enemy", 0)]);
    const secondTurn = passUntil(engine, enemyTurn.state, at(engine, "player", "day"));
    expect(resolvedSources(secondTurn.events)).toEqual([sign("player", 1)]);
  });

  it("does not fire on the opening-hand draws, before the first turn begins", () => {
    const init = {
      seed: battleSeed("opening-draws"),
      scoreToWin: 25,
      startingSide: "enemy" as const,
      decks: { player: deck.map((cardId) => ({ cardId })), enemy: deck.map((cardId) => ({ cardId })) },
      dreamwell: [],
      dreamsigns: { player: [DRAW_SIGN.id], enemy: [] },
    };
    const start = engine.createBattle(init, NO_PROMPTS);
    expect(start.events.filter((entry) => entry.kind === "cardDrawn" && entry.side === "player").length).toBeGreaterThan(0);
    expect(queuedCount(start.events, { kind: "dreamsign", side: "player", index: 0 })).toBe(0);
    // The player's first draw, in its own first turn, is the first to trigger.
    const playerTurn = passUntil(engine, start.state, at(engine, "player", "day"));
    expect(queuedCount(playerTurn.events, { kind: "dreamsign", side: "player", index: 0 })).toBe(1);
  });

  it("resolves a start-of-turn trigger as the turn begins, before its Dreamwell phase", () => {
    const { state } = board({ active: "enemy", player: { dreamsigns: [TRIGGER_DREAMSIGN.turnEnergy.id], deck }, enemy: { deck } });
    const { events, steps } = passUntil(engine, state, at(engine, "player", "day"));
    const begins = events.findIndex((entry) => entry.kind === "turnStarted" && entry.side === "player");
    const resolved = events.findIndex((entry) => entry.kind === "triggerResolved");
    const dreamwell = events.findIndex((entry) => entry.kind === "phaseChanged" && entry.phase === "dreamwell" && entry.active === "player");
    expect(begins).toBeGreaterThanOrEqual(0);
    expect(resolved).toBeGreaterThan(begins);
    expect(dreamwell).toBeGreaterThan(resolved);
    // Nothing of the Dreamwell phase (its energy refill or draw) happens before the trigger resolves.
    const beforeResolving = events.slice(begins, resolved).map((entry) => entry.kind);
    expect(beforeResolving.filter((kind) => kind === "energyChanged" || kind === "dreamwellDrawn" || kind === "phaseChanged")).toEqual([]);
    // The Dreamwell phase is its own automatic step once the queue is empty.
    const kinds = steps.map((step) => step.step.kind);
    const trigger = kinds.indexOf("resolveTrigger");
    expect(kinds[trigger + 1]).toBe("advancePhase");
    expect(steps[trigger]?.state.triggerQueue).toEqual([]);
    for (const step of steps) expect(invariantViolations(step.state, engine.catalog)).toEqual([]);
  });

  it("suspends a start-of-turn prompt through the fold while the turn is beginning, then enters the Dreamwell phase", () => {
    const { state } = board({ active: "enemy", phase: "night", player: { dreamsigns: [START_SIGN.id], deck }, enemy: { deck } });
    const inline = engine.apply(state, "enemy", { kind: "pass" }, new ScriptedSource([true])).state;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = fold.reduce(start, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (opened.kind !== "applied") throw new Error("bounced");
    // Reloading while the trigger waits reaches the same prompt, with the turn still beginning.
    const reloaded: BattleSlice = { ...opened.slice, committed: deserializeState(JSON.stringify(opened.slice.committed)) };
    expect(reloaded.committed.turn).toMatchObject({ active: "player", phase: "dreamwell", beginning: true });
    expect(reloaded.inFlight?.step).toEqual({ kind: "resolveTrigger" });
    const pending = fold.pending(reloaded);
    if (pending === null) throw new Error("no prompt");
    expect(pending.prompt).toMatchObject({
      side: "player",
      purpose: { source: { kind: "dreamsign", side: "player", index: 0, id: START_SIGN.id }, cardId: null, ability: 0, role: "youMay" },
    });
    const outcome = fold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true });
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("answer failed");
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.slice.committed.turn).toMatchObject({ active: "player", phase: "day", beginning: false });
    expect(outcome.slice.committed.sides.player.score).toBe(1);
    expect(stateHash(outcome.slice.committed)).toBe(stateHash(inline));
  });

  it("never enters the Dreamwell phase when a start-of-turn trigger ends the battle", () => {
    const { state } = board({ active: "enemy", phase: "night", scoreToWin: 25, player: { score: 24, dreamsigns: [START_SIGN.id], deck }, enemy: { deck } });
    const result = engine.apply(state, "enemy", { kind: "pass" }, new ScriptedSource([true]));
    expect(result.state.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(result.events.some((entry) => entry.kind === "phaseChanged" && entry.phase === "dreamwell")).toBe(false);
    expect(engine.decision(result.state)).toBeNull();
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("refers to the triggering card as 'it'", () => {
    const { state, ids } = board({ player: { back: [t.materializePumpsIt.id], hand: [v.vanilla1.id], energy: 1, deck }, enemy: { deck } });
    const current = play(state, "player", ids.player.hand[0]).state;
    expect(effectiveSpark(current, engine.catalog, ids.player.hand[0])).toBe(2);
    expect(effectiveSpark(current, engine.catalog, ids.player.back[0]!)).toBe(1);
  });
});

describe("functional zones and intervening conditions", () => {
  it("fires a void ability only while the card is in the void", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [t.voidDawnPoints.id], hand: [t.voidDawnPoints.id], void: [t.voidDawnPoints.id], deck: [v.vanilla1.id, t.voidDawnPoints.id] },
      enemy: { deck },
    });
    const day = passUntil(engine, state, at(engine, "player", "day"));
    expect(resolvedSources(day.events)).toEqual([ids.player.void[0]]);
    expect(day.state.sides.player.score).toBe(1);
  });

  it("names the avatar whose trigger asks for its target", () => {
    const { state, ids } = board({ active: "enemy", player: { avatar: DAWN_AVATAR.id, back: [v.vanilla1.id, v.vanilla1.id], deck }, enemy: { deck } });
    const purposes: PromptPurpose[] = [];
    const scripted = new ScriptedSource([[ids.player.back[1]!]]);
    passUntil(engine, state, at(engine, "player", "day"), {
      answer(prompt) {
        purposes.push(prompt.purpose);
        return scripted.answer(prompt);
      },
    });
    expect(purposes).toEqual([{ source: { kind: "avatar", side: "player", id: DAWN_AVATAR.id }, cardId: null, ability: 0, role: "target" }]);
  });

  it("checks an intervening 'if' when the ability triggers and again as it resolves", () => {
    const setup = (back: readonly CardId[]) => board({ active: "enemy", player: { avatar: DAWN_AVATAR.id, back, deck }, enemy: { deck } });
    const two = setup([L.ifTwoWarriors.id, v.vanilla1.id]);
    // The avatar's ▸Dawn resolves first and dissolves the second warrior.
    const day = passUntil(engine, two.state, at(engine, "player", "day"), new ScriptedSource([[two.ids.player.back[1]!]]));
    const resolutions = day.events.filter((entry) => entry.kind === "triggerResolved");
    expect(resolutions.map((entry) => entry.kind === "triggerResolved" && [entry.source, entry.applied])).toEqual([
      [{ kind: "avatar", side: "player" }, true],
      [two.ids.player.back[0], false],
    ]);
    expect(day.state.sides.player.score).toBe(0);
    // With one warrior at Dawn, it never triggers.
    const one = setup([L.ifTwoWarriors.id]);
    const alone = passUntil(engine, one.state, at(engine, "player", "day"), new ScriptedSource([[one.ids.player.back[0]!]]));
    expect(queuedCount(alone.events, one.ids.player.back[0]!)).toBe(0);
  });
});

describe("historical played-card compatibility", () => {
  it("plays from a reloaded legacy record whose created instance has ceased, with unknown cost distinct from zero", () => {
    for (const [card, cost] of [[v.vanilla0.id, 0], [v.vanilla2.id, 2]] as const) {
      const { state, ids } = board({ player: { back: [L.boundedPlayWatcher.id], hand: [card], energy: 4, deck }, enemy: { deck } });
      state.turnLog.played.player.push({ instance: "i999", cardType: "character", subtype: testCardSubtype("Warrior"), allTypes: false });
      const saved = deserializeState(JSON.stringify(state));
      const after = play(saved, "player", ids.player.hand[0]).state;
      expect(after.sides.player.score).toBe(0);
      expect(after.sides.player.currentEnergy).toBe(5 - cost);
      expect(after.turnLog.played.player).toHaveLength(2);
    }
  });
});
