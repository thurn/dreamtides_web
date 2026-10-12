import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, characterYouControl, energy, event, fromVoid, keyword, self, target } from "../../../dsl/builders";
import { onMaterialized, triggered, whenDissolved, whileSourceInPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { Answer } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import type { AbilitySource, InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { banishCards } from "../banish-cards";
import { disableTriggers } from "../disable-triggers";
import { dissolve } from "../dissolve";
import { gainAbilities } from "../gain-abilities";
import { gainPoints } from "../gain-points";
import { engine, v, deck } from "./characters-support";

describe("character primitives", () => {
  it("dissolve uses the target chosen at play time", () => {
    const { state, ids, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck }, enemy: { back: [v.vanilla2.id, v.vanilla3.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.enemy.back[1]!]],
    });
    expect(state.instances[ids.enemy.back[1]!]?.zone).toBe("void");
    expect(state.instances[ids.enemy.back[0]!]?.zone).toBe("play");
    expect(answers[0]).toMatchObject({ value: [ids.enemy.back[1]] });
  });

  it("makes a targeted play illegal without a legal target", () => {
    const { state } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.banishEnemyWithSparkAtMostTwo.id], energy: 1, deck },
      enemy: { back: [v.vanilla3.id], deck },
    });
    expect(engine.legalActions(state, "player").some((action) => action.kind === "play")).toBe(false);
  });
});

function card(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0xd15340 + index), cardType, costs: [energy(0)], spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities,
  };
}

const collect = () => activated([energy(0)], gainAbilities(banishCards([fromVoid({ cardType: "character" }, { player: "opponent" })])));

/** Synthetic cards for what blocks a "when … is dissolved" ability, read as its character leaves play. */
const D = {
  /** "When a character you control is dissolved, gain 1⍟." */
  keeper: card(0, "character", () => [triggered(whenDissolved(), gainPoints(1))]),
  /** "Once per turn, when a character you control is dissolved, gain 1⍟." */
  onceKeeper: card(1, "character", () => [triggered(whenDissolved(), gainPoints(1), { oncePerTurn: true })]),
  /** "0●: Banish a character from the opponent's void. This character gains its abilities." */
  collector: card(2, "character", () => [collect()]),
  /** "Reclaim. 0●: Banish a character from the opponent's void. This character gains its abilities." */
  reclaimCollector: card(3, "character", () => [keyword("reclaim"), collect()]),
  /** "▸Materialized: This character's triggered abilities don't trigger while it is in play. When a character you control is dissolved, gain 1⍟." */
  hermit: card(4, "character", () => [triggered(onMaterialized(), disableTriggers(self(), whileSourceInPlay())), triggered(whenDissolved(), gainPoints(1))]),
  /** "Until end of turn, a character you control's triggered abilities don't trigger while you control no characters." */
  hush: card(5, "event", () => [event(disableTriggers(target(characterYouControl()), "untilEndOfTurn", { cond: "controls", selector: characterYouControl(), atLeast: 0, atMost: 0 }))]),
  /** "Dissolve a character you control." */
  purge: card(6, "event", () => [event(dissolve(target(characterYouControl())))]),
} as const;

const L = createEngine(testCatalog(Object.values(D)));

function setup(player: SideSetup, enemy: SideSetup = {}) {
  return boardState(L.catalog, { active: "player", phase: "day", player: { deck, energy: 5, ...player }, enemy: { deck, energy: 5, ...enemy } });
}

/** Applies `action` for the player, then passes until the stack and trigger queue are empty. */
function act(state: BattleState, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const first = L.apply(state, "player", action, source);
  const rest = passUntil(L, first.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  source.assertExhausted();
  expect(invariantViolations(rest.state, L.catalog)).toEqual([]);
  return { state: rest.state, events: [...first.events, ...rest.events] as EngineEvent[] };
}
const play = (id: InstanceId | null | undefined): Action => ({ kind: "play", card: id!, from: "hand" });
const activate = (id: InstanceId | null | undefined, ability = 0): Action => ({ kind: "activate", source: id!, ability });
function queued(events: readonly EngineEvent[]): { source: AbilitySource | null; subject: InstanceId | null }[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [{ source: entry.source, subject: entry.subject }] : []));
}
const dissolved = (events: readonly EngineEvent[], id: InstanceId | null | undefined) => events.some((entry) => entry.kind === "dissolved" && entry.instance === id);

describe("dissolve look-back blocks", () => {
  it("does not trigger a gained once-per-turn ability already used this turn again on its own card's dissolve", () => {
    const { state, ids } = setup({ back: [D.collector.id, v.vanilla1.id], hand: [D.purge.id, D.purge.id] }, { void: [D.onceKeeper.id] });
    const [collector, vanilla] = ids.player.back;
    const [first, second] = ids.player.hand;
    // Each prompt with one legal answer is answered by the engine itself.
    const collected = act(state, activate(collector)).state;
    const used = act(collected, play(first), [[vanilla!]]);
    expect(queued(used.events)).toEqual([{ source: collector, subject: vanilla }]);
    const own = act(used.state, play(second));
    expect(dissolved(own.events, collector)).toBe(true);
    expect(queued(own.events)).toEqual([]);
    expect(own.state.sides.player.score).toBe(1);
  });

  it("triggers an unused gained once-per-turn ability on its own card's dissolve without limiting one it gains after returning that turn", () => {
    const { state, ids } = setup({ back: [D.reclaimCollector.id, v.vanilla1.id], hand: [D.purge.id, D.purge.id] }, { void: [D.onceKeeper.id, D.onceKeeper.id] });
    const [collector, vanilla] = ids.player.back;
    const [first, second] = ids.player.hand;
    const [keeper, again] = ids.enemy.void;
    const collected = act(state, activate(collector, 1), [[keeper]]).state;
    const own = act(collected, play(first), [[collector!]]);
    expect(queued(own.events)).toEqual([{ source: collector, subject: collector }]);
    expect(own.state.sides.player.score).toBe(1);
    const returned = act(own.state, { kind: "play", card: collector!, from: "void" }).state;
    const regained = act(returned, activate(collector, 1)).state;
    expect(regained.instances[collector!]?.status.gainedAbilities).toHaveLength(1);
    expect(regained.instances[again]?.zone).toBe("banished");
    const later = act(regained, play(second), [[vanilla!]]);
    expect(queued(later.events)).toEqual([{ source: collector, subject: vanilla }]);
    expect(later.state.sides.player.score).toBe(2);
  });

  it("reads trigger suppression as of just before the character left play", () => {
    // Disabled only while it is in play: suppressed for another's dissolve and for its own.
    const hermit = setup({ back: [v.vanilla1.id], hand: [D.hermit.id, D.purge.id, D.purge.id] });
    const [hermitCard, first, second] = hermit.ids.player.hand;
    const materialized = act(hermit.state, play(hermitCard)).state;
    const other = act(materialized, play(first), [[hermit.ids.player.back[0]!]]);
    expect(queued(other.events)).toEqual([]);
    const own = act(other.state, play(second));
    expect(dissolved(own.events, hermitCard)).toBe(true);
    expect(queued(own.events)).toEqual([]);
    expect(own.state.sides.player.score).toBe(0);

    // Disabled only once its side controls no characters, which its own dissolve makes true: it still triggers.
    const hushed = setup({ back: [D.keeper.id], hand: [D.hush.id, D.purge.id] });
    const keeper = hushed.ids.player.back[0]!;
    const [hush, purge] = hushed.ids.player.hand;
    const quiet = act(hushed.state, play(hush));
    expect(quiet.state.floating.map((effect) => effect.change.kind)).toEqual(["disableTriggers"]);
    const gone = act(quiet.state, play(purge));
    expect(queued(gone.events)).toEqual([{ source: keeper, subject: keeper }]);
    expect(gone.state.sides.player.score).toBe(1);
  });
});
