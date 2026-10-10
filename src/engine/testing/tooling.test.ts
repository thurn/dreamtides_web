/**
 * The card-lab setup solver and battle, the engine debug actions (D4), the
 * prompt lab, pending-entity semantics (D36), and the Phase 5
 * scenario-module runner.
 */
import { describe, expect, it, vi } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { NO_PROMPTS } from "../steps/sources";
import { DSL, DSL_CARDS } from "./dsl-cards";
import { createCatalog } from "../catalog";
import { createFoldAdapter } from "../fold/slice";
import { labBoard } from "./lab-solver";
import { cardLabBattle } from "./card-lab";
import { applyDebugOp, debugOpFromUnknown, withHistory, type DebugOp } from "../debug/debug-actions";
import type { BattleSlice } from "../fold/slice";
import { EVENT_DEFINITIONS } from "../events";
import { PROMPT_LAB_DEFINITIONS, PROMPT_LAB_FIXTURES, promptLabBattle, promptLabFixture, promptLabPresentation } from "./prompt-lab";
import { runNamedScenario, scenarioRegistryProblems } from "../../content/specs/runner";
import { playFromHand, runScenario, type NamedScenario, type ScenarioSpec } from "./scenario";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";

/** A pending 1● event and a pending 2● 2✦ character. */
const pendingEvent: EngineCardDefinition = { ...SYNTHETIC.event1, id: syntheticId(904), status: "pending" };
const pendingCharacter: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(905), status: "pending" };
const engine = createEngine(testCatalog([...DSL_CARDS, pendingEvent, pendingCharacter]));

describe("card-lab setup solver", () => {
  it("solves a playable board for every synthetic DSL card", () => {
    for (const card of DSL_CARDS) {
      expect(() => labBoard(engine, card.id, []), card.id).not.toThrow();
    }
  });

  it("places targets on the side each selector names", () => {
    const { state } = labBoard(engine, DSL.dissolveEnemy.id, []);
    expect(state.sides.enemy.backRank.filter((id) => id !== null)).toHaveLength(1);
    expect(state.sides.player.backRank.filter((id) => id !== null)).toHaveLength(0);
  });
});

describe("card-lab battle", () => {
  it("deals the card's variant to the side playing it, and opens with the enemy's play as the enemy", () => {
    const entry = { cardId: DSL.dissolveEnemy.id, amplified: true };
    const asPlayer = cardLabBattle(engine, { entry, variant: "amplified", side: "player" }, []);
    const [card] = asPlayer.slice.committed.sides.player.hand;
    expect(card === undefined ? undefined : asPlayer.slice.committed.instances[card]?.variant.amplified).toBe(true);
    expect(asPlayer.init.decks.player).toContainEqual(entry);
    expect(engine.decision(asPlayer.slice.committed)).toEqual({ kind: "main", side: "player" });

    const asEnemy = cardLabBattle(engine, { entry: { cardId: DSL.drawTwo.id }, variant: "base", side: "enemy" }, []);
    const played = Object.values(asEnemy.slice.committed.instances).find(
      (instance) => instance.printing.kind === "card" && instance.printing.cardId === DSL.drawTwo.id,
    );
    expect(played?.zone).toBe("stack");
    expect(engine.decision(asEnemy.slice.committed)).toEqual({ kind: "respond", side: "player" });
  });
});

describe("engine debug actions", () => {
  /** A lab whose card prompts for its mode when played. */
  const lab = (): BattleSlice => withHistory(cardLabBattle(engine, { entry: { cardId: DSL.chooseDrawOrPoints.id }, variant: "base", side: "player" }, []).slice);
  const apply = (slice: BattleSlice, op: DebugOp): BattleSlice => {
    const outcome = applyDebugOp(engine, slice, op);
    if (outcome.kind === "rejected") throw new Error(`${op.kind} rejected: ${outcome.reason}`);
    return outcome.slice;
  };
  const rejection = (slice: BattleSlice, op: unknown) => {
    const parsed = debugOpFromUnknown(op);
    if (parsed === null) return "malformed";
    const outcome = applyDebugOp(engine, slice, parsed);
    return outcome.kind === "rejected" ? outcome.reason : null;
  };

  it("sets energy and score, adds cards, and forces the next draw, each a new committed version", () => {
    let slice = apply(lab(), { kind: "setEnergy", side: "enemy", energy: 4 });
    slice = apply(slice, { kind: "addCard", side: "enemy", card: SYNTHETIC.vanilla2.id, zone: "play" });
    slice = apply(slice, { kind: "addCard", side: "player", card: DSL.drawTwo.id, zone: "deck" });
    slice = apply(slice, { kind: "forceDraw", side: "player", card: SYNTHETIC.vanilla1.id });
    const { sides, instances, version } = slice.committed;
    expect(sides.enemy.currentEnergy).toBe(4);
    expect(sides.enemy.backRank.filter((id) => id !== null)).toHaveLength(1);
    const top = sides.player.deck[0];
    expect(top === undefined ? undefined : instances[top]?.printing).toEqual({ kind: "card", cardId: SYNTHETIC.vanilla1.id });
    expect(version).toBe(lab().committed.version + 4);
    expect(slice.history?.entries).toHaveLength(4);
  });

  it("ends the battle when a score reaches the score to win", () => {
    const slice = apply(lab(), { kind: "setScore", side: "enemy", score: lab().committed.config.scoreToWin });
    expect(slice.committed.result).toEqual({ kind: "victory", winner: "enemy", reason: "score" });
    expect(rejection(slice, { kind: "setEnergy", side: "player", energy: 1 })).toBe("battleOver");
  });

  it("rejects malformed, impossible, and mid-step actions, changing nothing", () => {
    const slice = lab();
    expect(rejection(slice, { kind: "setEnergy", side: "player", energy: -1 })).toBe("malformed");
    expect(rejection(slice, { kind: "addCard", side: "player", card: syntheticId(999), zone: "hand" })).toBe("unknownCard");
    expect(rejection(slice, { kind: "addCard", side: "player", card: DSL.drawTwo.id, zone: "play" })).toBe("notACharacter");
    expect(rejection(slice, { kind: "forceDraw", side: "enemy", card: DSL.drawTwo.id })).toBe("notInDeck");
    expect(rejection(apply(slice, { kind: "addCard", side: "enemy", card: SYNTHETIC.vanilla2.id, zone: "play" }), { kind: "undo", keep: 9 })).toBe("noHistory");
    expect(rejection(lab(), { kind: "undo", keep: 0 })).toBe("noHistory");
    const [card] = slice.committed.sides.player.hand;
    if (card === undefined) throw new Error("no lab card");
    const playing = createFoldAdapter(engine).reduce(slice, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    if (playing.kind !== "applied" || playing.slice.inFlight === null) throw new Error("the play did not suspend at its mode");
    expect(rejection(playing.slice, { kind: "setScore", side: "player", score: 1 })).toBe("stepInFlight");
  });

  it("undoes to an earlier intent by replaying the history, and continues above every attempt used", () => {
    const adapter = createFoldAdapter(engine);
    const start = lab();
    const [card] = start.committed.sides.player.hand;
    if (card === undefined) throw new Error("no lab card");
    const played = adapter.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    const mode = played.kind === "applied" ? adapter.pending(played.slice) : null;
    if (played.kind !== "applied" || mode === null) throw new Error("the play did not suspend at its mode");
    const answered = adapter.reduce(played.slice, { kind: "answer", side: "player", promptId: mode.prompt.id, value: 0 });
    if (answered.kind !== "applied") throw new Error("the mode answer bounced");
    const energized = apply(answered.slice, { kind: "mark" });
    expect(energized.history?.entries.map((entry) => Object.keys(entry)[0])).toEqual(["intent", "intent", "debug"]);

    const undone = apply(energized, { kind: "undo", keep: 0 });
    expect(undone.committed).toEqual(start.committed);
    expect(undone.inFlight).toBeNull();
    expect(undone.attempt).toBeGreaterThan(energized.attempt);
    // The undone play applies again, with prompt ids no earlier attempt used.
    const again = adapter.reduce(undone, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    if (again.kind !== "applied") throw new Error("the replayed play bounced");
    expect(adapter.pending(again.slice)?.prompt.id).not.toBe(adapter.pending(played.slice)?.prompt.id);
    // A second undo replays through the first.
    expect(apply(again.slice, { kind: "undo", keep: 1 })).toMatchObject({ committed: start.committed, inFlight: null });
    // The same actions over the same slice fold identically, as a reload replays them.
    expect(apply(apply(start, { kind: "setEnergy", side: "player", energy: 2 }), { kind: "undo", keep: 0 })).toEqual(
      apply(apply(start, { kind: "setEnergy", side: "player", energy: 2 }), { kind: "undo", keep: 0 }),
    );
  });
});

describe("prompt lab", () => {
  const labEngine = createEngine(
    createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
  );
  const adapter = createFoldAdapter(labEngine);
  const stop = (name: string) => {
    const fixture = promptLabFixture(name);
    if (fixture === null) throw new Error(`no fixture ${name}`);
    const { slice } = promptLabBattle(labEngine, fixture);
    const pending = adapter.pending(slice);
    return {
      prompt: pending === null ? null : { kind: pending.prompt.kind, side: pending.prompt.side, privateTo: pending.prompt.privateTo },
      decision: slice.inFlight === null ? labEngine.decision(slice.committed) : null,
      legal: slice.inFlight === null ? labEngine.legalActions(slice.committed, "player").map((action) => action.kind) : [],
    };
  };

  it("builds every fixture deterministically", () => {
    for (const fixture of PROMPT_LAB_FIXTURES) {
      expect(promptLabBattle(labEngine, fixture), fixture.name).toEqual(promptLabBattle(labEngine, fixture));
    }
  });

  it("stops each scripted fixture where its scene starts", () => {
    expect(stop("ai-discard").prompt).toEqual({ kind: "chooseCards", side: "enemy", privateTo: undefined });
    expect(stop("ai-foresee").prompt).toEqual({ kind: "arrange", side: "enemy", privateTo: "enemy" });
    expect(stop("prevent").prompt).toMatchObject({ kind: "payOrDecline", side: "player" });
    expect(stop("respond").decision).toEqual({ kind: "respond", side: "player" });
    expect(stop("loop").legal).toContain("repeatLoop");
    expect(stop("reclaim").legal).toEqual(expect.arrayContaining(["play", "activate"]));
  });

  it("publishes every event kind through the presentation steps but the Dreamwell draw and a bounded search", () => {
    const published = new Set(
      PROMPT_LAB_FIXTURES.flatMap((fixture) =>
        promptLabPresentation(labEngine, fixture).flatMap((step) => step.published.map((event) => event.kind)),
      ),
    );
    const missing = Object.keys(EVENT_DEFINITIONS).filter((kind) => !published.has(kind as keyof typeof EVENT_DEFINITIONS));
    expect(missing.sort()).toEqual(["dreamwellDrawn", "feasibilityBounded"]);
  });
});

describe("pending entities play text-less", () => {
  it("resolves a pending event with no effect and reports pendingAbility when played and drawn", () => {
    const { state, events, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [pendingEvent.id], energy: 1, deck: [pendingEvent.id] }, enemy: { deck: [SYNTHETIC.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.void).toEqual([ids.player.hand[0]]);
    expect(events).toContainEqual(expect.objectContaining({ kind: "pendingAbility", reason: "played", cardId: pendingEvent.id }));
    // Pass until the player's next turn, whose Draw phase draws the pending card.
    let current = state;
    const later = [];
    while (!(current.turn.active === "player" && current.turn.phase === "day" && current.turn.turnNumber > state.turn.turnNumber)) {
      const decision = engine.decision(current);
      if (decision === null) throw new Error("no decision");
      const result = engine.apply(current, decision.side, { kind: "pass" }, NO_PROMPTS);
      later.push(...result.events);
      current = result.state;
    }
    expect(later).toContainEqual(expect.objectContaining({ kind: "pendingAbility", reason: "drawn", cardId: pendingEvent.id }));
  });

  it("plays a pending character with its printed cost and spark and no abilities", () => {
    const { state, ids, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [pendingCharacter.id], energy: 2, deck: [SYNTHETIC.vanilla1.id] }, enemy: { deck: [SYNTHETIC.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.backRank[0]).toBe(ids.player.hand[0]);
    expect(state.sides.player.currentEnergy).toBe(0);
    expect(events.filter((event) => event.kind === "pendingAbility")).toHaveLength(1);
  });
});

describe("scenario-module runner", () => {
  const vanillas = [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id];
  /** Dissolving one of two enemy characters prompts for the target. */
  const dissolve = (answers?: ScenarioSpec["answers"]): ScenarioSpec => ({
    board: { active: "player", phase: "day", player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck: vanillas }, enemy: { back: vanillas, deck: vanillas } },
    steps: (ids) => [playFromHand(ids, "player")],
    answers,
  });
  const scenario = (spec: ScenarioSpec, check: NamedScenario["check"] = () => undefined): NamedScenario => ({ name: "dissolve", spec, check });
  const second: ScenarioSpec["answers"] = (ids) => [[ids.enemy.back[1]!]];

  it("runs the spec, then the check on its result", () => {
    const check = vi.fn<NamedScenario["check"]>(({ state, ids }) => {
      expect(state.sides.enemy.backRank.filter((id) => id !== null)).toEqual([ids.enemy.back[0]]);
    });
    const result = runNamedScenario(engine, scenario(dissolve(second), check));
    expect(check).toHaveBeenCalledWith(result);
  });

  it("fails a scenario whose check fails", () => {
    const wrong = scenario(dissolve(second), ({ state }) => {
      expect(state.sides.enemy.backRank.filter((id) => id !== null)).toHaveLength(2);
    });
    expect(() => runNamedScenario(engine, wrong)).toThrow();
  });

  it("fails on a prompt with no scripted answer without running the check", () => {
    const check = vi.fn<NamedScenario["check"]>();
    expect(() => runNamedScenario(engine, scenario(dissolve(), check))).toThrow();
    expect(check).not.toHaveBeenCalled();
  });

  it("fails on scripted answers left over without running the check", () => {
    const check = vi.fn<NamedScenario["check"]>();
    const extra = dissolve((ids) => [[ids.enemy.back[1]!], [ids.enemy.back[0]!]]);
    expect(() => runNamedScenario(engine, scenario(extra, check))).toThrow();
    expect(check).not.toHaveBeenCalled();
  });

  it("reports duplicate slugs, empty modules, and duplicate scenario names", () => {
    const spec = dissolve(second);
    const problems = scenarioRegistryProblems([
      { slug: "a", scenarios: [scenario(spec)] },
      { slug: "a", scenarios: [scenario(spec), scenario(spec)] },
      { slug: "b", scenarios: [] },
    ]);
    expect(problems).toHaveLength(3);
    expect(scenarioRegistryProblems([{ slug: "a", scenarios: [scenario(spec)] }, { slug: "b", scenarios: [scenario(spec)] }])).toEqual([]);
  });
});
