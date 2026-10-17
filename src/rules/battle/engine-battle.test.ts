import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventContext, GameEvent } from "../../eventlog/types";
import { eventRng } from "../../eventlog/rng";
import { createEngine, type BattleInit as EngineBattleInit, type BattleResult as EngineBattleResult, type Engine } from "../../engine";
import type { EngineCardDefinition } from "../../engine/catalog";
import { energy, event as eventAbility } from "../../engine/dsl/builders";
import * as primitives from "../../engine/effects/primitives";
import type { ChooseNumberPrompt } from "../../engine/prompts/types";
import { DSL, DSL_CARDS } from "../../engine/testing/dsl-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { nextBattleEffects } from "../../battle/integration/engine-battle-init";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { testEventActor, testJourneyMutationSource } from "../../types/test-identities";
import type { FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { AVATAR_ID, BATTLE_SITE_ID, FIXTURE_ENGINE, FIXTURE_POINTS_MODE, NODE_ID, NEXT_NODE_ID, clearReplayFixtureProviders, fixtureBattleInitProvider, registerReplayFixtureProviders } from "../replay/fixture-providers";
import { registerBattleInitProvider } from "./journey-battle";
import { pendingEnginePrompt, takeEngineLogRecords } from "./engine-battle";
import type { PromptId } from "../../types/identifiers";
import { journeyBattleOf } from "./fold";



const GENESIS = {
  seed: "fixture-battle",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
} as const;


// Synthetic engine cards for the failure paths. A module flag makes a hook
// fault on demand, after the legality search has accepted the play.
let faulting = false;


/** A 0● event that gives the opponent 1 point: the player loses at 1 point. */
const opponentScores: EngineCardDefinition = {
  id: syntheticId(0x4101),
  cardType: "event",
  costs: [energy(0)],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [eventAbility(primitives.gainPoints(1, "opponent"))],
};


/** A 0● event whose play-time number prompt faults on its answer while `faulting`. */
const faultsAfterChoice: EngineCardDefinition = {
  ...opponentScores,
  id: syntheticId(0x4102),
  abilities: () => [],
  synthetic: {
    play: (ctx, self) => {
      ctx.choose<ChooseNumberPrompt>({
        kind: "chooseNumber",
        side: "player",
        purpose: { source: self, cardId: null, ability: 0, role: "chooseX" },
        min: 0,
        max: 1,
      });
      if (faulting) throw new Error("synthetic step fault");
      return {};
    },
  },
};


/** A 0● interrupt whose legality search faults while `faulting`. */
const faultyResponse: EngineCardDefinition = {
  ...opponentScores,
  id: syntheticId(0x4103),
  speed: "interrupt",
  abilities: () => [],
  synthetic: {
    play: () => {
      if (faulting) throw new Error("synthetic legality fault");
      return {};
    },
  },
};


const TEST_ENGINE: Engine = createEngine(
  testCatalog([...DSL_CARDS, opponentScores, faultsAfterChoice, faultyResponse]),
);


/** Registers the fixture providers with battles on `engine` from these decks. */
function registerBattle(
  engine: Engine,
  decks: EngineBattleInit["decks"],
  init: Partial<EngineBattleInit> = {},
): void {
  const base = fixtureBattleInitProvider();
  registerBattleInitProvider({
    engine,
    beginBattle: (input) => {
      const start = base.beginBattle(input);
      return start === null
        ? null
        : { ...start, engineInit: { ...start.engineInit, decks, ...init } };
    },
  });
}


const deckOf = (card: EngineCardDefinition, count = 10) =>
  Array.from({ length: count }, () => ({ cardId: card.id }));


let seq = 0;


function ctx(intervening: EventContext["intervening"] = []): EventContext {
  return {
    contentConfig: TEST_CONTENT_CONFIG,
    seq,
    rng: eventRng(GENESIS.seed as never, seq),
    intervening,
    timestamp: "1970-01-01T00:00:00.000Z",
  };
}


function reduce(
  state: FoldState,
  type: string,
  payload: Record<string, unknown>,
  options: { actor?: string; intervening?: EventContext["intervening"] } = {},
): ReduceResult {
  seq += 1;
  const event: GameEvent = {
    type: type as GameEvent["type"],
    payload,
    actor: testEventActor(options.actor ?? "p1"),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: seq - 1,
  };
  return reduceGameEvent(state, event, ctx(options.intervening));
}


function applied(result: ReduceResult): FoldState {
  if (result.outcome !== "applied") {
    throw new Error(`bounced: ${String(result.bounceReason)}`);
  }
  return result.state;
}


/** A journey standing on the fixture Battle site. */
function atBattleSite(): FoldState {
  seq = 0;
  let state = GAME_ENGINE_CONFIG.genesisState(GENESIS as never);
  state = applied(reduce(state, "START_JOURNEY", { avatarId: AVATAR_ID }));
  return applied(reduce(state, "ENTER_SITE", { siteId: BATTLE_SITE_ID }));
}


function begun(): FoldState {
  return applied(reduce(atBattleSite(), "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }));
}


function engineOf(state: FoldState) {
  const fold = journeyBattleOf(state.battle)?.engine;
  if (fold === undefined) throw new Error("no engine battle");
  return fold;
}


function firstCard(state: FoldState) {
  const card = engineOf(state).slice.committed.sides.player.hand[0];
  if (card === undefined) throw new Error("empty hand");
  return card;
}


function play(state: FoldState, side = "player"): ReduceResult {
  return reduce(state, "BATTLE_ACTION", {
    side,
    action: { kind: "play", card: firstCard(state), from: "hand" },
  });
}


function promptId(state: FoldState, engine: Engine = FIXTURE_ENGINE) {
  const pending = pendingEnginePrompt(state.battle, engine);
  if (pending === null) throw new Error("no pending prompt");
  return pending.prompt.id;
}


function answer(
  state: FoldState,
  value: unknown,
  options: { side?: string; actor?: string; intervening?: EventContext["intervening"]; id?: PromptId } = {},
): ReduceResult {
  return reduce(
    state,
    "BATTLE_ANSWER",
    { side: options.side ?? "player", promptId: options.id ?? promptId(state), value },
    options,
  );
}


/** A journey battle whose points card has been played and won. */
function won(): FoldState {
  const prompted = applied(play(begun()));
  return applied(answer(prompted, FIXTURE_POINTS_MODE));
}


beforeEach(() => {
  faulting = false;
  registerReplayFixtureProviders();
});


afterEach(() => {
  clearReplayFixtureProviders();
});


describe("BEGIN_BATTLE on the engine", () => {
  it("starts the engine battle at the player's first decision, identically on every fold", () => {
    const site = atBattleSite();
    const first = applied(reduce(site, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }));
    seq -= 1;
    const second = applied(reduce(site, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }));
    const fold = engineOf(first);
    expect(JSON.stringify(first.battle)).toBe(JSON.stringify(second.battle));
    expect(fold.slice.inFlight).toBeNull();
    expect(fold.slice.committed.result).toBeNull();
    expect(FIXTURE_ENGINE.decision(fold.slice.committed)).toEqual({ kind: "main", side: "player" });
  });

  it("logs the battle's start once, with its init's UUIDs", () => {
    const state = begun();
    const records = takeEngineLogRecords(seq);
    expect(records[0]).toMatchObject({ event: "engine.battleStarted", init: engineOf(state).init });
    expect(takeEngineLogRecords(seq)).toEqual([]);
  });

  it("bounces when the engine cannot start the battle", () => {
    registerBattle(FIXTURE_ENGINE, { player: deckOf(DSL.chooseDrawOrPoints), enemy: deckOf(SYNTHETIC.vanilla1) }, {
      dreamwell: [syntheticId(0x4fff) as never],
    });
    const result = reduce(atBattleSite(), "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle).toBeNull();
  });

  it("bounces a second BEGIN_BATTLE", () => {
    const state = begun();
    expect(reduce(state, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }).outcome).toBe("bounced");
  });
});


describe("journey -> battle -> reward -> Atlas", () => {
  it("hands an engine victory to the journey and consumes the next-battle effects", () => {
    const victorious = won();
    expect(engineOf(victorious).slice.committed.result).toEqual({
      kind: "victory",
      winner: "player",
      reason: "score",
    });
    const before: FoldState = {
      ...victorious,
      journey: {
        ...victorious.journey,
        battleModifiers: [
          {
            kind: "starting_energy_bonus",
            count: 2,
            battlesRemaining: 1,
            source: testJourneyMutationSource("exploration:test"),
          },
        ],
      },
    };
    expect(nextBattleEffects(before.journey.battleModifiers)).not.toBeNull();
    const after = applied(reduce(before, "END_BATTLE", {}));
    const journey = after.journey;
    expect(after.battle).toBeNull();
    expect(journey.completionLevel).toBe(1);
    expect(journey.essence).toBe(before.journey.essence + (journeyBattleOf(before.battle)?.init.essenceReward ?? 0));
    expect(journey.atlas.nodes[NODE_ID].state).toBe("completed");
    expect(journey.atlas.nodes[NEXT_NODE_ID].state).toBe("available");
    expect(journey.currentDreamscape).toBeNull();
    expect(journey.screen.type).toBe("atlas");
    expect(journey.battleModifiers).toEqual([]);
    expect(nextBattleEffects(journey.battleModifiers)).toBeNull();
    expect(reduce(after, "END_BATTLE", {}).outcome).toBe("bounced");
  });

  it("freezes the failure summary of an engine defeat", () => {
    registerBattle(TEST_ENGINE, { player: deckOf(opponentScores), enemy: deckOf(SYNTHETIC.vanilla1) });
    const lost = applied(play(begun()));
    const committed = engineOf(lost).slice.committed;
    expect(committed.result).toEqual({ kind: "victory", winner: "enemy", reason: "score" });
    const after = applied(reduce(lost, "END_BATTLE", {}));
    expect(after.battle).toBeNull();
    expect(after.journey.screen.type).toBe("journeyFailed");
    expect(after.journey.failureSummary).toMatchObject({
      battleId: lost.battle?.init.battleId,
      result: "defeat",
      reason: "score_target_reached",
      siteId: BATTLE_SITE_ID,
      nodeIdOrNone: NODE_ID,
      turnNumber: committed.turn.turnNumber,
      playerScore: 0,
      enemyScore: 1,
    });
  });

  it("reports how the enemy won or both sides drew, by score or by a win condition", () => {
    const summaryOf = (result: EngineBattleResult) => {
      const state = begun();
      const fold = engineOf(state);
      const committed = { ...fold.slice.committed, result };
      const ended: FoldState = {
        ...state,
        battle: state.battle === null ? null : { ...state.battle, engine: { ...fold, slice: { ...fold.slice, committed } } },
      };
      return applied(reduce(ended, "END_BATTLE", {})).journey.failureSummary;
    };

    expect(summaryOf({ kind: "victory", winner: "enemy", reason: "winCondition" })).toMatchObject({
      result: "defeat",
      reason: "win_condition_met",
    });
    expect(summaryOf({ kind: "draw", reason: "winCondition" })).toMatchObject({
      result: "draw",
      reason: "win_condition_met",
    });
    expect(summaryOf({ kind: "victory", winner: "enemy", reason: "score" })).toMatchObject({
      result: "defeat",
      reason: "score_target_reached",
    });
    expect(summaryOf({ kind: "draw", reason: "score" })).toMatchObject({
      result: "draw",
      reason: "score_target_reached",
    });
  });

  it("reports a draw by an unbreakable loop as the loop, and a turn-limit draw as the turn limit", () => {
    const reasonOf = (reason: "mandatoryLoop" | "resolutionCap" | "turnLimit") => {
      const state = begun();
      const fold = engineOf(state);
      const committed = { ...fold.slice.committed, result: { kind: "draw" as const, reason } };
      const ended: FoldState = {
        ...state,
        battle: state.battle === null ? null : { ...state.battle, engine: { ...fold, slice: { ...fold.slice, committed } } },
      };
      return applied(reduce(ended, "END_BATTLE", {})).journey.failureSummary;
    };

    expect(reasonOf("mandatoryLoop")).toMatchObject({ result: "draw", reason: "unbreakable_loop" });
    expect(reasonOf("resolutionCap")).toMatchObject({ result: "draw", reason: "unbreakable_loop" });
    expect(reasonOf("turnLimit")).toMatchObject({ result: "draw", reason: "turn_limit_reached" });
  });

  it("bounces END_BATTLE while the engine battle is in progress or waiting at a prompt", () => {
    const state = begun();
    expect(reduce(state, "END_BATTLE", {}).outcome).toBe("bounced");
    const prompted = applied(play(state));
    expect(reduce(prompted, "END_BATTLE", {})).toMatchObject({
      outcome: "bounced",
      bounceReason: "prompt_pending",
    });
  });
});
