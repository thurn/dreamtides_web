import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, anyCharacter, energy, event, everyIn, keyword, reclaim, staticAbility, target } from "../../../dsl/builders";
import { onMaterialized, triggered } from "../../../dsl/triggers";
import { createEngine, IllegalAction } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { ChooseCardsPrompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { instanceOrigin } from "../../../rules/activation";
import { canPlay, playRestricted } from "../../../rules/timing";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, FloatingChange } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { discardChosen } from "../discard-chosen";
import { playFromZone } from "../play-from-zone";
import { opponentHand, takeFromAmong } from "../take-from-among";
import { dissolve } from "../dissolve";
import { materialize } from "../materialize";
import { cannotPlay, cannotPlayChosen, playLimitPerTurn } from "../play-restriction";
import { knowing } from "./cards-support";

function card(
  index: number,
  cardType: "character" | "event",
  cost: number,
  abilities: EngineCardDefinition["abilities"],
  speed: EngineCardDefinition["speed"] = "standard",
): EngineCardDefinition {
  return {
    id: syntheticId(0x10900 + index), cardType, costs: [energy(cost)], spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed, status: "authored", abilities,
  };
}

/** Synthetic play restrictions, independent of catalog text. */
const PR = {
  /** "▸Materialized: Choose a card in the opponent's hand. That card cannot be played while this character is in play." */
  pursuer: card(0, "character", 1, () => [triggered(onMaterialized(), cannotPlayChosen({ duration: "whileSourceInPlay" }))]),
  /** The same restriction on an event, whose source is never in play. */
  outOfPlay: card(1, "event", 0, () => [event(cannotPlayChosen({ duration: "whileSourceInPlay" }))]),
  /** "The opponent cannot play events this turn." */
  desperado: card(2, "event", 0, () => [event(cannotPlay("opponent", { cardType: "event" }, { duration: "untilEndOfTurn" }))]),
  /** "Players may only play one card per turn." */
  canonist: card(3, "character", 0, () => [staticAbility(playLimitPerTurn(1))]),
  /** A 0● Interrupt event with "Reclaim 0●". */
  reclaimer: card(4, "event", 0, () => [reclaim(energy(0))], "interrupt"),
  /** A 0● Interrupt: "Dissolve a character." */
  dissolver: card(5, "event", 0, () => [event(dissolve(target(anyCharacter())))], "interrupt"),
  /** "0●: Materialize every character in your hand." */
  summoner: card(6, "character", 0, () => [activated([energy(0)], materialize(everyIn("hand", { cardType: "character" })))]),
  /** Chooses an opponent hand card for a restriction this turn, then fails. */
  chooseThenFail: {
    ...card(7, "event", 0, () => []),
    synthetic: {
      resolve(ctx, item) {
        resolveEffect(ctx, cannotPlayChosen({ duration: "untilEndOfTurn" }), {
          source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
          ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
        });
        throw new Error("synthetic failure after a play restriction");
      },
    },
  } satisfies EngineCardDefinition,
  discarder: card(8, "event", 0, () => [event(discardChosen())]),
  taker: card(9, "event", 0, () => [event(takeFromAmong(opponentHand()))]),
  offering: card(10, "character", 10, () => [keyword("offering")]),
  permission: card(11, "character", 0, () => [staticAbility(playFromZone("void", {}, { player: "opponent" }))]),
} as const;

const engine = createEngine(testCatalog(Object.values(PR)));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

const plays = (state: BattleState, side: Side): InstanceId[] =>
  engine.legalActions(state, side).flatMap((action) => (action.kind === "play" ? [action.card] : []));
const play = (card: InstanceId, from: "hand" | "void" = "hand"): Action => ({ kind: "play", card, from });
const restrictions = (state: BattleState): FloatingChange[] =>
  state.floating.flatMap(({ change }) => (change.kind === "cannotPlay" || change.kind === "playLimit" ? [change] : []));

/** Runs `actions` in order, each by the side holding the decision, checking every step's event redaction. */
function run(start: BattleState, actions: readonly (readonly [Side, Action])[], answers: ScriptedSource = new ScriptedSource([])) {
  let state = start;
  const events: EngineEvent[] = [];
  for (const [side, action] of actions) {
    const result = engine.apply(state, side, action, answers);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    events.push(...result.events);
    state = result.state;
  }
  return { state, events };
}

/** Passes until the stack is empty. */
const resolveStack = (state: BattleState) => passUntil(engine, state, (next) => next.stack.length === 0).state;
const playResolved = (state: BattleState, side: Side, id: InstanceId, answers: ScriptedSource) => {
  const cast = run(state, [[side, play(id)]], answers).state;
  const done = passUntil(engine, cast, (next) => next.stack.length === 0, answers).state;
  answers.assertExhausted();
  return done;
};

const board = (player: BoardSetup["player"], enemy: BoardSetup["enemy"], active: Side = "player"): BoardSetup => ({
  active, phase: "day", player: { deck, energy: 5, ...player }, enemy: { deck, energy: 5, ...enemy },
});

/** The player's restricting character, about to choose among the enemy's hand. */
function suspendPursuer(enemyHand: BoardSetup["enemy"] = { hand: [v.vanilla1.id, v.event1.id, v.vanilla1.id] }) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const { state, ids } = boardState(engine.catalog, board({ hand: [PR.pursuer.id] }, enemyHand));
  const slice = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
  const pending = fold.pending(slice);
  if (pending === null) throw new Error("expected the restriction's choice");
  return { fold, slice, pending, ids, prompt: pending.prompt as ChooseCardsPrompt };
}

/** A saved journey battle around `slice`, as a save file holds it. */
function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return {
    mode: { kind: "journey" },
    init: {
      battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
      enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
      avatarSummary: null, cardDefinitions: [],
    },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown },
  };
}

describe("playRestriction: a chosen card in the opponent's hand", () => {
  it("privately offers every opponent hand card, then no player can play the chosen card while the source is in play", () => {
    const { fold, slice, prompt, pending, ids } = suspendPursuer();
    const hand = ids.enemy.hand;
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", candidates: hand, min: 1, max: 1, cancellable: false });
    expect(prompt.purpose.role).toBe("restrictChosen");
    expect(view(pending.display, "player", engine.catalog).instances[hand[2]]).toBeDefined();
    expect(view(pending.display, "player", engine.catalog).instances[ids.enemy.deck[0]]).toBeUndefined();
    expect((promptView(prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual(hand);
    const outcome = fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [hand[2]] });
    const after = applied(outcome).committed;
    const pursuer = after.sides.player.backRank.find((id) => id !== null)!;
    expect(after.floating).toEqual([expect.objectContaining({
      controller: "player", source: pursuer, expiry: { at: "sourceLeavesPlay", source: pursuer },
      change: { kind: "cannotPlay", player: null, instance: hand[2], filter: {} },
    })]);
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    expect(eventRedactionViolations(outcome.published, slice.committed, after)).toEqual([]);
    for (const viewer of SIDES) {
      expect(outcome.published.some((e) => e.kind === "effectStarted"), viewer).toBe(true);
      expect(outcome.published.filter((e) => e.kind === "revealed").map((e) => eventSeenBy(e, viewer, after))).toEqual([
        { kind: "revealed", side: "enemy", instances: [hand[2]] },
      ]);
      expect(view(after, viewer, engine.catalog).floating.map(({ change }) => change)).toEqual([after.floating[0].change]);
    }
    expect(invariantViolations(after, engine.catalog)).toEqual([]);

    // The enemy's turn: the chosen copy is not offered nor accepted; its twin with the same UUID is.
    const enemyDay = passUntil(engine, after, at(engine, "enemy", "day")).state;
    expect(plays(enemyDay, "enemy")).toContain(hand[0]);
    expect(plays(enemyDay, "enemy")).not.toContain(hand[2]);
    expect(canPlay(enemyDay, engine.catalog, "enemy", hand[2], "hand")).toBe(false);
    expect(() => engine.apply(enemyDay, "enemy", play(hand[2]), new ScriptedSource([]))).toThrow(IllegalAction);
    expect(fold.reduce(sliceOf(enemyDay), { kind: "battleAction", side: "enemy", action: play(hand[2]) })).toEqual({ kind: "bounced", reason: "illegalAction" });
    expect(determinizationDivergences(engine, enemyDay, { player: [{ cardId: PR.pursuer.id }, ...deck.map((cardId) => ({ cardId }))], enemy: [v.vanilla1.id, v.event1.id, v.vanilla1.id, ...deck].map((cardId) => ({ cardId })) }, battleSeed("restriction"), 0)).toEqual([]);
  });

  it.each(["void", "otherHand"] as const)("follows the chosen physical card through real movement to %s, then ends on source departure", (destination) => {
    const utility = destination === "void" ? PR.discarder : PR.taker;
    const { state, ids } = boardState(engine.catalog, board(
      { hand: [PR.pursuer.id, utility.id, PR.dissolver.id] },
      { hand: [PR.reclaimer.id, PR.reclaimer.id] },
    ));
    const [pursuer, mover, dissolver] = ids.player.hand;
    const [chosen, twin] = ids.enemy.hand;
    const restricted = playResolved(state, "player", pursuer, new ScriptedSource([[chosen]]));
    expect(restrictions(restricted)).toEqual([{ kind: "cannotPlay", player: null, instance: chosen, filter: {} }]);
    const moved = playResolved(restricted, "player", mover, new ScriptedSource([[chosen]]));
    expect(moved.instances[chosen]).toMatchObject({ zone: destination === "void" ? "void" : "hand", controller: destination === "void" ? "enemy" : "player" });
    expect(moved.instances[chosen].printing).toEqual(moved.instances[twin].printing);
    expect(restrictions(moved)).toEqual(restrictions(restricted));
    const holder = destination === "void" ? "enemy" : "player";
    const ready = holder === "enemy" ? passUntil(engine, moved, at(engine, "enemy", "day")).state : moved;
    const from = destination === "void" ? "void" : "hand";
    expect(plays(ready, holder)).not.toContain(chosen);
    expect(canPlay(ready, engine.catalog, holder, chosen, from)).toBe(false);
    expect(() => runStep(ready, { kind: "play", card: chosen, from }, new ScriptedSource([]), engine.catalog)).toThrow();
    expect(playRestricted(ready, engine.catalog, "enemy", twin)).toBe(false);
    const playerDay = holder === "enemy" ? passUntil(engine, ready, at(engine, "player", "day")).state : ready;
    const freed = playResolved(playerDay, "player", dissolver, new ScriptedSource([]));
    expect(freed.instances[pursuer].zone).toBe("void");
    expect(restrictions(freed)).toEqual([]);
    const freeWindow = holder === "enemy" ? passUntil(engine, freed, at(engine, "enemy", "day")).state : freed;
    expect(plays(freeWindow, holder)).toContain(chosen);
    expect(invariantViolations(freeWindow, engine.catalog)).toEqual([]);
  });

  it("still chooses but restricts nothing when the source is not in play, and does nothing for an empty hand", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [PR.outOfPlay.id, PR.outOfPlay.id] }, { hand: [v.vanilla1.id, v.event1.id] }));
    const answers = new ScriptedSource([[ids.enemy.hand[1]]]);
    const first = run(state, [["player", play(ids.player.hand[0])]], answers);
    const tail = passUntil(engine, first.state, (next) => next.stack.length === 0);
    const chose = tail.state;
    const revealed = [...first.events, ...tail.events].filter((e) => e.kind === "revealed");
    for (const viewer of SIDES) expect(revealed.map((e) => eventSeenBy(e, viewer, chose))).toEqual([
      { kind: "revealed", side: "enemy", instances: [ids.enemy.hand[1]] },
    ]);
    answers.assertExhausted();
    expect(chose.floating).toEqual([]);
    expect(chose.knownTo.player).toEqual(expect.arrayContaining(ids.enemy.hand));

    const { state: empty, ids: emptyIds } = boardState(engine.catalog, board({ hand: [PR.pursuer.id] }, {}));
    const none = resolveStack(run(empty, [["player", play(emptyIds.player.hand[0])]]).state);
    expect(none.floating).toEqual([]);
    expect(none.sides.player.backRank).toContain(emptyIds.player.hand[0]);
  });
});

describe("playRestriction: every route of playing", () => {
  it.each(["hand", "offering", "reclaim", "permission"] as const)("blocks %s at legality and the direct play step, with a playable unrestricted control", (route) => {
    const definition = route === "offering" ? PR.offering : route === "reclaim" ? PR.reclaimer : v.vanilla1;
    const { state, ids } = boardState(engine.catalog, board(
      { hand: [PR.pursuer.id, PR.discarder.id], back: route === "permission" ? [PR.permission.id] : [] },
      { hand: [definition.id, definition.id, v.event0.id] },
    ));
    const [chosen, twin] = ids.enemy.hand;
    const restricted = playResolved(state, "player", ids.player.hand[0], new ScriptedSource([[chosen]]));
    const inVoid = route === "permission" || route === "reclaim";
    const moved = inVoid ? playResolved(restricted, "player", ids.player.hand[1], new ScriptedSource([[chosen]])) : restricted;
    const ready = passUntil(engine, moved, at(engine, "enemy", "day")).state;
    const from = inVoid ? "void" : "hand";
    expect(plays(ready, "enemy")).not.toContain(chosen);
    expect(() => engine.apply(ready, "enemy", play(chosen, from), new ScriptedSource([]))).toThrow(IllegalAction);
    expect(() => runStep(ready, { kind: "play", card: chosen, from }, new ScriptedSource([]), engine.catalog)).toThrow();
    const unrestricted = { ...ready, floating: ready.floating.filter(({ change }) => change.kind !== "cannotPlay") };
    expect(plays(unrestricted, "enemy")).toContain(chosen);
    const positive = engine.apply(unrestricted, "enemy", play(chosen, from), new ScriptedSource(route === "offering" ? [[twin]] : []));
    expect(positive.state.turnLog.played.enemy).toHaveLength(1);
    if (route === "offering") {
      expect(positive.state.instances[chosen].status.offering).toBe(true);
      expect(positive.state.instances[twin].zone).toBe("banished");
    }
    if (route === "reclaim") expect(positive.state.instances[chosen].status.playedViaReclaim).toBe(true);
    expect(invariantViolations(positive.state, engine.catalog)).toEqual([]);
  });
});

describe("playRestriction: cards matching a filter for a player", () => {
  it("stops the opponent's events by every route until end of turn, but not its characters or the controller's events", () => {
    const { state, ids } = boardState(engine.catalog, board(
      { hand: [PR.desperado.id, v.event0.id, v.event0.id] },
      { hand: [v.interruptEvent.id, v.interruptCharacter.id], void: [PR.reclaimer.id] },
    ));
    const [desperado, event0] = ids.player.hand;
    const before = run(state, [["player", play(desperado)]]).state;
    expect(plays(before, "enemy")).toEqual([...ids.enemy.hand, ...ids.enemy.void]);
    const restricted = resolveStack(before);
    expect(restrictions(restricted)).toEqual([{ kind: "cannotPlay", player: "enemy", instance: null, filter: { cardType: "event" } }]);
    expect(restricted.floating[0]?.expiry).toEqual({ at: "endOfTurn" });
    expect(plays(restricted, "player")).toContain(event0);
    const responding = run(restricted, [["player", play(event0)]]).state;
    expect(plays(responding, "enemy")).toEqual([ids.enemy.hand[1]]);
    for (const viewer of SIDES) expect(view(responding, viewer, engine.catalog).floating).toHaveLength(1);
    const enemyDay = passUntil(engine, responding, at(engine, "enemy", "day")).state;
    expect(restrictions(enemyDay)).toEqual([]);
    expect(plays(enemyDay, "enemy")).toEqual(expect.arrayContaining([ids.enemy.hand[0], ids.enemy.void[0]]));
  });
});

describe("playRestriction: a per-turn play limit", () => {
  it("limits each player separately, counting plays before it applied, and never stops abilities or materializing", () => {
    const { state, ids } = boardState(engine.catalog, board(
      { hand: [v.event0.id, PR.canonist.id, v.vanilla1.id], back: [PR.summoner.id] },
      { hand: [v.interruptEvent.id, v.interruptEvent.id] },
    ));
    const [event0, canonist, vanilla] = ids.player.hand;
    const twice = resolveStack(run(resolveStack(run(state, [["player", play(event0)]]).state), [["player", play(canonist)]]).state);
    expect(twice.sides.player.backRank).toContain(canonist);
    expect(twice.turnLog.played.player).toHaveLength(2);
    expect(restrictions(twice)).toEqual([]);
    expect(plays(twice, "player")).toEqual([]);
    expect(canPlay(twice, engine.catalog, "player", vanilla, "hand")).toBe(false);
    expect(() => engine.apply(twice, "player", play(vanilla), new ScriptedSource([]))).toThrow(IllegalAction);
    // An activation is not a play, and gives the enemy a window for its first card this turn, and only that one.
    const activating = run(twice, [["player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }]]).state;
    expect(plays(activating, "enemy")).toEqual(ids.enemy.hand);
    // The player, then the enemy at its limit, pass automatically, so the ability resolves.
    const materialized = run(activating, [["enemy", play(ids.enemy.hand[0])]]).state;
    expect(materialized.stack).toEqual([]);
    expect(materialized.instances[vanilla]?.zone).toBe("play");
    expect(materialized.turnLog.played).toEqual({ player: [expect.anything(), expect.anything()], enemy: [expect.anything()] });
    expect(playRestricted(materialized, engine.catalog, "enemy", ids.enemy.hand[1])).toBe(true);
    // A new turn starts a new count.
    const enemyDay = passUntil(engine, materialized, at(engine, "enemy", "day")).state;
    expect(plays(enemyDay, "enemy")).toContain(ids.enemy.hand[1]);
  });
});

describe("playRestriction recovery", () => {
  it("reconstructs the private prompt on reload, rejects stale, foreign, invalid and concurrent inputs, and commits once", () => {
    const { slice, pending, ids } = suspendPursuer();
    const committed = stateHash(slice.committed);
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: readonly InstanceId[], from = saved) => fresh.reduce(from, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("player", [ids.enemy.hand[0]], { ...saved, attempt: saved.attempt + 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer("enemy", [ids.enemy.hand[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const own = saved.committed.sides.player.backRank.find((id) => id !== null)!;
    for (const value of [[], ids.enemy.hand.slice(0, 2), [ids.enemy.deck[0]], [ids.player.deck[0]], [own], [ids.enemy.hand[0], ids.enemy.hand[0]]]) {
      expect(answer("player", value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(saved.committed)).toBe(committed);
    const completion = answer("player", [ids.enemy.hand[1]]);
    const done = applied(completion);
    if (completion.kind !== "applied") throw new Error("answer bounced");
    expect(completion.published.filter((e) => e.kind === "revealed")).toEqual([
      { kind: "revealed", side: "enemy", instances: [ids.enemy.hand[1]] },
    ]);
    expect(restrictions(done.committed)).toHaveLength(1);
    expect(answer("player", [ids.enemy.hand[0]], done)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("offers only the cards still in the hand after an opponent response before resolution", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = boardState(engine.catalog, board({ hand: [PR.pursuer.id] }, { hand: [v.interruptEvent.id, v.vanilla1.id, v.vanilla2.id] }));
    const cast = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    expect(fold.pending(cast)).toBeNull();
    // Both sides then pass automatically, having no legal response, and the character resolves.
    const resolving = applied(fold.reduce(cast, { kind: "battleAction", side: "enemy", action: play(ids.enemy.hand[0]) }));
    expect(resolving.committed.sides.enemy.void).toEqual([ids.enemy.hand[0]]);
    const pending = fold.pending(resolving);
    expect((pending?.prompt as ChooseCardsPrompt | undefined)?.candidates).toEqual(ids.enemy.hand.slice(1));
    expect(fold.reduce(resolving, { kind: "answer", side: "player", promptId: pending!.prompt.id, value: [ids.enemy.hand[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
  });

  it("commits no restriction and publishes nothing when the step fails after choosing, keeping only the private look", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = boardState(engine.catalog, board({ hand: [PR.chooseThenFail.id] }, { hand: [v.vanilla1.id, v.event1.id] }));
    const resolving = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const pending = fold.pending(resolving)!;
    const outcome = fold.reduce(resolving, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[1]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected the synthetic failure");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.slice.committed).toEqual(knowing(resolving.committed, "player", ids.enemy.hand));
    expect(restrictions(outcome.slice.committed)).toEqual([]);
  });

  it("hides a restriction naming a card from a side that cannot identify it, in views and determinizations", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [PR.pursuer.id] }, { hand: [v.vanilla1.id, v.event1.id] }, "enemy"));
    const pursuer = ids.player.back[0]!;
    state.floating.push({
      id: "e1", controller: "player", source: pursuer, timestamp: 0, expiry: { at: "sourceLeavesPlay", source: pursuer },
      change: { kind: "cannotPlay", player: null, instance: ids.enemy.hand[1], filter: {} },
    });
    state.nextEffect = 2;
    expect(view(state, "player", engine.catalog).floating).toEqual([]);
    expect(view(state, "enemy", engine.catalog).floating).toHaveLength(1);
    const decklists = { player: [PR.pursuer.id, ...deck].map((cardId) => ({ cardId })), enemy: [v.vanilla1.id, v.event1.id, ...deck].map((cardId) => ({ cardId })) };
    expect(determinizationDivergences(engine, state, decklists, battleSeed("hidden-restriction"), 0)).toEqual([]);
    expect(plays(state, "enemy")).toEqual([ids.enemy.hand[0]]);
  });

  it("keeps a restriction on the restricted side's view, with its source redacted, when the source is hidden from it", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [PR.desperado.id] }, { hand: [v.interruptEvent.id, v.interruptCharacter.id] }, "enemy"));
    state.floating.push({
      id: "e1", controller: "player", source: ids.player.hand[0], timestamp: 0, expiry: { at: "endOfTurn" },
      change: { kind: "cannotPlay", player: "enemy", instance: null, filter: { cardType: "event" } },
    });
    state.nextEffect = 2;
    expect(view(state, "enemy", engine.catalog).floating).toEqual([expect.objectContaining({ source: null, change: state.floating[0].change })]);
    expect(plays(state, "enemy")).toEqual([ids.enemy.hand[1]]);
    const decklists = { player: [PR.desperado.id, ...deck].map((cardId) => ({ cardId })), enemy: [v.interruptEvent.id, v.interruptCharacter.id, ...deck].map((cardId) => ({ cardId })) };
    expect(determinizationDivergences(engine, state, decklists, battleSeed("hidden-source"), 0)).toEqual([]);
  });

  it("saves and loads restrictions and limits, and rejects malformed ones", () => {
    const { state } = boardState(engine.catalog, board({ back: [PR.pursuer.id] }, { hand: [v.vanilla1.id] }));
    const pursuer = state.sides.player.backRank[0]!;
    const withChange = (change: Record<string, unknown>) => parseJourneyBattleFoldState(savedJourney(sliceOf({
      ...state, nextEffect: 2,
      floating: [{ id: "e1", controller: "player", source: pursuer, timestamp: 0, expiry: { at: "endOfTurn" }, change: change as FloatingChange }],
    })));
    const named = { kind: "cannotPlay", player: null, instance: state.sides.enemy.hand[0], filter: {} };
    expect(withChange(named)).not.toBeNull();
    expect(withChange({ kind: "cannotPlay", player: "enemy", instance: null, filter: { cardType: "event" } })).not.toBeNull();
    expect(withChange({ kind: "playLimit", player: "enemy", count: 1 })).not.toBeNull();
    for (const malformed of [
      { ...named, player: "both" }, { ...named, instance: 7 }, { ...named, filter: null },
      { kind: "playLimit", player: "enemy", count: -1 }, { kind: "playLimit", player: "enemy", count: 0.5 }, { kind: "playLimit", player: null, count: 1 },
    ]) {
      expect(withChange(malformed), JSON.stringify(malformed)).toBeNull();
    }
  });
});
