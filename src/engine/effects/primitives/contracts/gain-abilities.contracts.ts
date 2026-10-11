import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, energy, enemyCharacter, event, exhaustSelf, fromVoid, keyword, self, staticAbility, target } from "../../../dsl/builders";
import { onDissolved, triggered, whenDissolved, whenLeavesPlay, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecords } from "../../../log";
import type { Action } from "../../../rules/actions";
import { canActivate, instanceOrigin, originAbilities } from "../../../rules/activation";
import { hasKeyword } from "../../../rules/keywords";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { cloneState } from "../../../state/clone";
import { stateHash } from "../../../state/hash";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, FloatingEffect } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";
import { choosePlayer } from "../choose-player";
import { dissolve } from "../dissolve";
import { gainAbilities } from "../gain-abilities";
import { gainPoints } from "../gain-points";
import { returnToHand } from "../return-to-hand";
import { setBaseSpark } from "../set-base-spark";
import { sparkModifier } from "../spark-modifier";

function card(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], speed: EngineCardDefinition["speed"] = "standard"): EngineCardDefinition {
  return {
    id: syntheticId(0x11100 + index), cardType, costs: [energy(0)], spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed, status: "authored", abilities,
  };
}

const opponentsCharacter = () => gainAbilities(banishCards([fromVoid({ cardType: "character" }, { player: "opponent" })]));

/** Synthetic ability gains, independent of catalog text. */
const GA = {
  /** "☾: Banish a character from a player's void. This character gains the abilities of that character." */
  thief: card(0, "character", () => [activated([exhaustSelf()], choosePlayer((player) => gainAbilities(banishCards([fromVoid({ cardType: "character" }, { player })]))))]),
  /** "0●: Banish a character from the opponent's void. This character gains its abilities", its target chosen as it is activated. */
  collector: card(1, "character", () => [activated([energy(0)], opponentsCharacter())]),
  /** Vengeful; "1●: Gain 1 point (3 amplified). Once per turn."; "When you play an event, gain 2 points"; "Characters you control have +1✦". */
  donor: card(2, "character", (variant) => [
    keyword("vengeful"),
    activated([energy(1)], gainPoints(variant.amplified ? 3 : 1), { oncePerTurn: true }),
    triggered(whenYouPlay({ cardType: "event" }), gainPoints(2)),
    staticAbility(sparkModifier(all(characterYouControl()), 1)),
  ]),
  /** "When this character leaves play, gain 1 point"; "When a character you control is dissolved, gain 2 points"; "▸Dissolved: Gain 4 points." */
  mourner: card(3, "character", () => [
    triggered(whenLeavesPlay("self"), gainPoints(1)),
    triggered(whenDissolved(characterYouControl()), gainPoints(2)),
    triggered(onDissolved(), gainPoints(4)),
  ]),
  /** A 0● Interrupt: "Dissolve an enemy character." */
  dissolver: card(4, "event", () => [event(dissolve(target(enemyCharacter())))], "interrupt"),
  /** "Return a character you control to hand." */
  returner: card(5, "event", () => [event(returnToHand(target(characterYouControl())))]),
  /** "This character's base ✦ becomes 5." */
  setter: card(8, "character", () => [staticAbility(setBaseSpark(self(), 5))]),
  /** From the void: "When a character you control is dissolved, gain 8 points." */
  haunt: card(7, "character", () => [triggered(whenDissolved(characterYouControl()), gainPoints(8), { zone: "void" })]),
  /** Resolves a gain for the player's first back-rank character, then fails. */
  gainThenFail: {
    ...card(6, "event", () => []),
    synthetic: {
      resolve(ctx, item) {
        const source = ctx.state.sides.player.backRank[0]!;
        resolveEffect(ctx, opponentsCharacter(), {
          source, origin: instanceOrigin(instanceOf(ctx.state, source)), ability: 0, controller: item.controller,
          x: null, optionalPaid: [], choices: { modes: [], targets: [[ctx.state.sides.enemy.void[0]]] },
        });
        throw new Error("synthetic failure after gaining abilities");
      },
    },
  } satisfies EngineCardDefinition,
} as const;

const engine = createEngine(testCatalog(Object.values(GA)));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];
const decklists = (player: readonly EngineCardDefinition[], enemy: readonly EngineCardDefinition[]) => ({
  player: [...player.map((definition) => definition.id), ...deck].map((cardId) => ({ cardId })),
  enemy: [...enemy.map((definition) => definition.id), ...deck].map((cardId) => ({ cardId })),
});
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
const board = (player: BoardSetup["player"], enemy: BoardSetup["enemy"], active: Side = "player"): BoardSetup => ({
  active, phase: "day", player: { deck, energy: 5, ...player }, enemy: { deck, energy: 5, ...enemy },
});

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

/** Runs `actions` in order, checking every step's event redaction, then passes until the stack is empty. */
function run(start: BattleState, actions: readonly (readonly [Side, Action])[], answers: ScriptedSource = new ScriptedSource([])) {
  let state = start;
  const events: EngineEvent[] = [];
  for (const [side, action] of actions) {
    const result = engine.apply(state, side, action, answers);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    events.push(...result.events);
    state = result.state;
  }
  const resolved = passUntil(engine, state, (next) => next.stack.length === 0, answers);
  answers.assertExhausted();
  return { state: resolved.state, events: [...events, ...resolved.events] };
}

const activate = (source: InstanceId, ability = 0): Action => ({ kind: "activate", source, ability });
const play = (card: InstanceId): Action => ({ kind: "play", card, from: "hand" });
const gains = (state: BattleState): FloatingEffect[] => state.floating.filter(({ change }) => change.kind === "abilities");
const activations = (state: BattleState, side: Side, source: InstanceId): number[] =>
  engine.legalActions(state, side).flatMap((action) => (action.kind === "activate" && action.source === source ? [action.ability] : []));

/** The player's collector after it gained the donor's abilities from the enemy void. */
function collected(amplified = false) {
  const { state, ids } = boardState(engine.catalog, board(
    { back: [GA.collector.id, v.vanilla1.id], hand: [v.event0.id, GA.returner.id] },
    { void: [GA.donor.id, GA.donor.id, v.event1.id], hand: [GA.dissolver.id] },
  ));
  const [collector] = ids.player.back as InstanceId[];
  const [donor] = ids.enemy.void;
  if (amplified) state.instances[donor] = { ...state.instances[donor], variant: { amplified: true } };
  const answers = new ScriptedSource([[donor]]);
  const result = run(state, [["player", activate(collector)]], answers);
  return { ...result, ids, collector, donor };
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

describe("gainAbilities", () => {
  it("chooses a player and a character in their void, banishes it, and gains every ability of its card after its own", () => {
    const { state, ids } = boardState(engine.catalog, board(
      { back: [GA.thief.id, v.vanilla1.id], void: [v.vanilla2.id], hand: [v.event0.id] },
      { void: [GA.donor.id, v.event1.id] },
    ));
    const [thief, ally] = ids.player.back as InstanceId[];
    const [donor] = ids.enemy.void;
    const { state: after, events } = run(state, [["player", activate(thief)]], new ScriptedSource([1]));
    expect(after.instances[donor]?.zone).toBe("banished");
    expect(after.sides.player.void).toEqual(ids.player.void);
    expect(gains(after)).toEqual([expect.objectContaining({
      controller: "player", source: thief, expiry: { at: "sourceLeavesPlay", source: thief },
      change: { kind: "abilities", instance: thief, cardId: GA.donor.id, variant: { amplified: false } },
    })]);
    expect(events.filter((e) => e.kind === "effectStarted")).toHaveLength(1);
    expect(eventLogRecords(events, state.version).flatMap((record) => (record.event === "engine.abilitiesGained" ? [record.detail.change] : []))).toEqual([gains(after)[0]?.change]);
    expect(after.instances[thief]?.status.gainedAbilities).toEqual([{ cardId: GA.donor.id, variant: { amplified: false } }]);
    const origin = instanceOrigin(instanceOf(after, thief));
    expect(origin).toEqual({ kind: "card", cardId: GA.thief.id, variant: { amplified: false }, gained: [{ cardId: GA.donor.id, variant: { amplified: false } }] });
    expect(originAbilities(engine.catalog, origin).map((ability) => ability.kind)).toEqual(["activated", "keyword", "activated", "triggered", "static"]);
    // Its keyword, its static ability, its activated ability (paid with energy while the thief is exhausted), and its trigger.
    expect(hasKeyword(after, engine.catalog, thief, "vengeful")).toBe(true);
    expect(hasKeyword(after, engine.catalog, ally, "vengeful")).toBe(false);
    expect([effectiveSpark(after, engine.catalog, thief), effectiveSpark(after, engine.catalog, ally)]).toEqual([2, 2]);
    expect(activations(after, "player", thief)).toEqual([2]);
    const scored = run(after, [["player", activate(thief, 2)], ["player", play(ids.player.hand[0])]]).state;
    expect(scored.sides.player.score).toBe(3);
    for (const viewer of SIDES) {
      const seen = view(after, viewer, engine.catalog);
      expect(seen.instances[thief]?.status.gainedAbilities).toEqual(after.instances[thief]?.status.gainedAbilities);
      expect(seen.floating.map(({ change }) => change)).toEqual([gains(after)[0]?.change]);
    }
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
    expect(determinizationDivergences(engine, after, decklists([GA.thief, v.vanilla1, v.vanilla2, v.event0], [GA.donor, v.event1]), battleSeed("gain"), 0)).toEqual([]);
  });

  it("gains the abilities of an amplified card for its amplified text", () => {
    const { state, collector } = collected(true);
    expect(gains(state)[0]?.change).toMatchObject({ cardId: GA.donor.id, variant: { amplified: true } });
    expect(run(state, [["player", activate(collector, 2)]]).state.sides.player.score).toBe(3);
  });

  it("banishes nothing and gains nothing from a void with no character", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [GA.thief.id] }, { void: [v.event1.id, GA.donor.id] }));
    const thief = ids.player.back[0]!;
    const after = run(state, [["player", activate(thief)]], new ScriptedSource([0])).state;
    expect(after.instances[thief]?.status.exhausted).toBe(true);
    expect(after.sides.enemy.void).toEqual(ids.enemy.void);
    expect(gains(after)).toEqual([]);
    expect(after.instances[thief]?.status.gainedAbilities).toBeUndefined();
  });

  it("still banishes, and gains nothing, when the character leaves play before the ability resolves", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [GA.collector.id] }, { void: [GA.donor.id], hand: [GA.dissolver.id] }));
    const collector = ids.player.back[0]!;
    const after = run(state, [["player", activate(collector)], ["enemy", play(ids.enemy.hand[0])]]).state;
    expect(after.instances[collector]?.zone).toBe("void");
    expect(after.instances[ids.enemy.void[0]]?.zone).toBe("banished");
    expect(gains(after)).toEqual([]);
    expect(after.instances[collector]?.status.gainedAbilities).toBeUndefined();
  });

  it("orders gained keywords with other keyword changes by when each began", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [GA.collector.id] }, { void: [GA.donor.id] }));
    const collector = ids.player.back[0]!;
    const loss = (id: `e${number}`, timestamp: number): FloatingEffect => ({
      id, controller: "enemy", source: collector, timestamp, expiry: { at: "never" }, change: { kind: "keyword", instance: collector, keyword: "vengeful", gains: false },
    });
    state.floating.push(loss("e1", 0));
    state.nextEffect = 2;
    const after = run(state, [["player", activate(collector)]]).state;
    expect(hasKeyword(after, engine.catalog, collector, "vengeful")).toBe(true);
    after.floating.push(loss(`e${after.nextEffect}`, after.clock));
    expect(hasKeyword(after, engine.catalog, collector, "vengeful")).toBe(false);
  });

  it("orders a gained static ability by when it was gained, after an earlier change to the same characteristic", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [GA.collector.id] }, { void: [GA.setter.id] }));
    const collector = ids.player.back[0]!;
    const baseSpark = (id: `e${number}`, timestamp: number, value: number): FloatingEffect => ({
      id, controller: "enemy", source: collector, timestamp, expiry: { at: "never" }, change: { kind: "baseSpark", instance: collector, value },
    });
    expect(state.instances[collector].enteredZoneAt).toBeLessThanOrEqual(state.clock);
    state.floating.push(baseSpark("e1", state.clock, 2));
    state.nextEffect = 2;
    expect(effectiveSpark(state, engine.catalog, collector)).toBe(2);
    const after = run(state, [["player", activate(collector)]]).state;
    expect(effectiveSpark(after, engine.catalog, collector)).toBe(5);
    after.floating.push(baseSpark(`e${after.nextEffect}`, after.clock, 3));
    expect(effectiveSpark(after, engine.catalog, collector)).toBe(3);
  });
});

describe("gainAbilities: leaving play", () => {
  it("ends as the character leaves play, after its gained leaves-play and dissolve abilities see it as it left", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [GA.collector.id] }, { void: [GA.mourner.id], hand: [GA.dissolver.id] }));
    const collector = ids.player.back[0]!;
    const gained = run(state, [["player", activate(collector)]]).state;
    expect(gains(gained)).toHaveLength(1);
    const enemyDay = passUntil(engine, gained, at(engine, "enemy", "day")).state;
    const { state: after, events } = run(enemyDay, [["enemy", play(enemyDay.sides.enemy.hand[0])]]);
    expect(after.instances[collector]?.zone).toBe("void");
    expect(events.some((e) => e.kind === "effectEnded" && e.effect === gains(enemyDay)[0]?.id)).toBe(true);
    // Its gained leaves-play, "when a character you control is dissolved" and ▸Dissolved abilities all see it as it left play.
    expect(events.filter((e) => e.kind === "triggerQueued").map((e) => e.ability)).toEqual([1, 2, 3]);
    expect(after.sides.player.score - enemyDay.sides.player.score).toBe(1 + 2 + 4);
    expect(gains(after)).toEqual([]);
    expect(after.instances[collector]?.status.gainedAbilities).toBeUndefined();
    expect(instanceOrigin(instanceOf(after, collector))).toEqual({ kind: "card", cardId: GA.collector.id, variant: { amplified: false } });
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
  });

  it("does not let a gained ability that works only from the void see its own character dissolved", () => {
    const { state, ids } = boardState(engine.catalog, board({ back: [GA.collector.id] }, { void: [GA.haunt.id], hand: [GA.dissolver.id] }));
    const collector = ids.player.back[0]!;
    const gained = run(state, [["player", activate(collector)]]).state;
    expect(gains(gained)).toHaveLength(1);
    const enemyDay = passUntil(engine, gained, at(engine, "enemy", "day")).state;
    const { state: after, events } = run(enemyDay, [["enemy", play(enemyDay.sides.enemy.hand[0])]]);
    expect(after.instances[collector]?.zone).toBe("void");
    expect(events.some((e) => e.kind === "triggerQueued")).toBe(false);
    expect(after.sides.player.score).toBe(enemyDay.sides.player.score);
  });

  it("resolves a gained activated ability already on the stack after the character leaves play", () => {
    const { state, collector, ids } = collected();
    const after = run(state, [["player", activate(collector, 2)], ["enemy", play(ids.enemy.hand[0])]], new ScriptedSource([[collector]])).state;
    expect(after.instances[collector]?.zone).toBe("void");
    expect(after.sides.player.score).toBe(1);
  });

  it("starts a gained Once per turn ability unused when the character gains it again after leaving play", () => {
    const { state, collector, ids } = collected();
    const used = run(state, [["player", activate(collector, 2)]]).state;
    expect(used.oncePerTurn).toContain(`${collector}#2`);
    expect(canActivate(used, engine.catalog, "player", collector, 2)).toBe(false);
    const returned = run(used, [["player", play(ids.player.hand[1])]], new ScriptedSource([[collector]])).state;
    expect(returned.instances[collector]?.zone).toBe("hand");
    expect(returned.oncePerTurn).not.toContain(`${collector}#2`);
    const replayed = run(returned, [["player", play(collector)]]).state;
    expect(activations(replayed, "player", collector)).toEqual([0]);
    // The other donor is the only character left in the enemy void, so it is the target.
    const regained = run(replayed, [["player", activate(collector)]]).state;
    expect(regained.instances[ids.enemy.void[1]]?.zone).toBe("banished");
    expect(regained.instances[collector]?.status.gainedAbilities).toHaveLength(1);
    expect(canActivate(regained, engine.catalog, "player", collector, 2)).toBe(true);
  });
});

describe("gainAbilities recovery", () => {
  it("reconstructs the choices on reload, rejects stale, foreign, invalid and concurrent answers, and commits once", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = boardState(engine.catalog, board({ back: [GA.thief.id] }, { void: [GA.donor.id, GA.mourner.id, v.event1.id] }));
    const thief = ids.player.back[0]!;
    // The enemy has no response, so both sides pass automatically and the ability resolves to its first choice.
    const choosing = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: activate(thief) }));
    const saved = JSON.parse(JSON.stringify(choosing)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const mode = fresh.pending(saved);
    expect(mode).toEqual(fold.pending(choosing));
    if (mode === null) throw new Error("expected the player choice");
    const committed = stateHash(saved.committed);
    const answer = (side: Side, value: unknown, from: BattleSlice, promptId = mode.prompt.id) =>
      fresh.reduce(from, { kind: "answer", side, promptId, value: value as never });
    expect(answer("player", 1, { ...saved, attempt: saved.attempt + 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer("enemy", 1, saved)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [2, -1, [ids.enemy.void[0]]]) expect(answer("player", value, saved)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(stateHash(saved.committed)).toBe(committed);
    const targeting = applied(answer("player", 1, saved));
    const targets = fresh.pending(JSON.parse(JSON.stringify(targeting)) as BattleSlice);
    if (targets === null) throw new Error("expected the void target");
    for (const value of [[ids.enemy.void[2]], [thief], ids.enemy.void.slice(0, 2)]) {
      expect(answer("player", value, targeting, targets.prompt.id)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    const done = applied(answer("player", [ids.enemy.void[1]], targeting, targets.prompt.id));
    expect(gains(done.committed).map(({ change }) => change)).toEqual([{ kind: "abilities", instance: thief, cardId: GA.mourner.id, variant: { amplified: false } }]);
    expect(answer("player", [ids.enemy.void[0]], done, targets.prompt.id)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("commits no gain and publishes nothing when the step fails after gaining", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = boardState(engine.catalog, board({ back: [GA.collector.id], hand: [GA.gainThenFail.id] }, { void: [GA.donor.id] }));
    const failed = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected the synthetic failure");
    expect(failed.slice.inFlight).toBeNull();
    expect(gains(failed.slice.committed)).toEqual([]);
    expect(failed.slice.committed.instances[ids.enemy.void[0]]?.zone).toBe("void");
    expect(failed.slice.committed.instances[ids.player.back[0]!]?.status.gainedAbilities).toBeUndefined();
  });

  it("saves, loads, clones and hashes gains, and rejects a mirror that disagrees with them or malformed gains", () => {
    const { state, collector } = collected();
    const load = (changed: BattleState) => parseJourneyBattleFoldState(savedJourney(sliceOf(changed)));
    expect(load(state)).not.toBeNull();
    expect(cloneState(state)).toEqual(state);
    expect(stateHash(JSON.parse(JSON.stringify(state)) as BattleState)).toBe(stateHash(state));
    expect(stateHash(cloneState(state))).toBe(stateHash(state));
    const withStatus = (gainedAbilities: unknown) => ({
      ...state, instances: { ...state.instances, [collector]: { ...state.instances[collector], status: { ...state.instances[collector].status, gainedAbilities } } },
    });
    const effect = gains(state)[0];
    const withChange = (change: Record<string, unknown>) => ({ ...state, floating: [{ ...effect, change }] }) as unknown as BattleState;
    const withEffect = (changed: Record<string, unknown>) => ({ ...state, floating: [{ ...effect, ...changed }] });
    const slot = state.sides.player.backRank.indexOf(collector);
    const inVoid: BattleState = {
      ...state,
      sides: { ...state.sides, player: { ...state.sides.player, backRank: state.sides.player.backRank.map((id, index) => index === slot ? null : id), void: [...state.sides.player.void, collector] } },
      instances: { ...state.instances, [collector]: { ...state.instances[collector], zone: "void" } },
    };
    expect(load({ ...inVoid, floating: [], instances: { ...inVoid.instances, [collector]: { ...inVoid.instances[collector], status: { ...inVoid.instances[collector].status, gainedAbilities: undefined } } } })).not.toBeNull();
    const queued = (gained: unknown) => ({ ...state, triggerQueue: [{ source: collector, controller: "player", origin: { kind: "card", cardId: GA.collector.id, variant: { amplified: false }, gained }, ability: 3, node: null, subject: null }] }) as unknown as BattleState;
    expect(load(queued([{ cardId: GA.donor.id, variant: { amplified: false } }]))).not.toBeNull();
    for (const malformed of [
      withStatus(undefined), withStatus([]), withStatus([...state.instances[collector].status.gainedAbilities!, { cardId: GA.donor.id, variant: { amplified: false } }]),
      withStatus([{ cardId: GA.mourner.id, variant: { amplified: false } }]), withStatus([{ cardId: "donor", variant: { amplified: false } }]),
      withChange({ ...effect.change, cardId: 7 }), withChange({ ...effect.change, variant: null }), withChange({ ...effect.change, instance: "i999" }),
      queued([]), queued([{ cardId: GA.donor.id }]),
      withEffect({ expiry: { at: "never" } }), withEffect({ expiry: { at: "sourceLeavesPlay", source: "i999" } }), withEffect({ source: { kind: "avatar", side: "player" } }),
      inVoid,
    ]) {
      expect(load(malformed)).toBeNull();
    }
  });
});
