import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventContext, GameEvent } from "../../eventlog/types";
import { eventRng } from "../../eventlog/rng";
import { createEngine, type BattleInit as EngineBattleInit, type Engine } from "../../engine";
import type { EngineCardDefinition } from "../../engine/catalog";
import { energy, event as eventAbility } from "../../engine/dsl/builders";
import * as primitives from "../../engine/effects/primitives";
import type { ChooseNumberPrompt } from "../../engine/prompts/types";
import { DSL, DSL_CARDS } from "../../engine/testing/dsl-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { stateHash } from "../../engine/state/hash";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { testEventActor } from "../../types/test-identities";
import type { FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { AVATAR_ID, BATTLE_SITE_ID, FIXTURE_ENGINE, clearReplayFixtureProviders, fixtureBattleInitProvider, registerReplayFixtureProviders } from "../replay/fixture-providers";
import { registerBattleInitProvider } from "./journey-battle";
import { foldAdapterFor, foldEngineIntent, pendingEnginePrompt, takeEngineLogRecords } from "./engine-battle";
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


/** The messages of the `engine.error` records the last folded event logged. */
function errorMessages(): string[] {
  return takeEngineLogRecords(seq).flatMap((record) =>
    record.event === "engine.error" ? [record.message] : [],
  );
}


beforeEach(() => {
  faulting = false;
  registerReplayFixtureProviders();
});


afterEach(() => {
  clearReplayFixtureProviders();
});


describe("engine errors", () => {
  it("drops a step that faults mid-step and keeps the committed state", () => {
    registerBattle(TEST_ENGINE, { player: deckOf(faultsAfterChoice), enemy: deckOf(SYNTHETIC.vanilla1) });
    const prompted = applied(play(begun()));
    const before = engineOf(prompted).slice;
    takeEngineLogRecords(seq);
    faulting = true;
    const after = applied(answer(prompted, 1, { id: promptId(prompted, TEST_ENGINE) }));
    const fold = engineOf(after);
    expect(fold.slice.inFlight).toBeNull();
    expect(stateHash(fold.slice.committed)).toBe(stateHash(before.committed));
    expect(errorMessages()).toEqual([expect.stringContaining("synthetic step fault")]);
    expect(pendingEnginePrompt(after.battle, TEST_ENGINE)).toBeNull();
  });

  it("contains an engine throw outside the step boundary", () => {
    registerBattle(TEST_ENGINE, { player: deckOf(DSL.chooseDrawOrPoints), enemy: deckOf(faultyResponse) });
    const prompted = applied(play(begun()));
    const before = engineOf(prompted).slice;
    faulting = true;
    // Completing the play hands the enemy priority, whose responses fault.
    const id = promptId(prompted, TEST_ENGINE);
    const after = applied(answer(prompted, 0, { id }));
    const replayed = foldEngineIntent(foldAdapterFor(TEST_ENGINE), before, "BATTLE_ANSWER", { side: "player", promptId: id, value: 0 });
    expect(replayed.kind).toBe("threw");
    if (replayed.kind === "threw") expect(replayed.slice).toEqual(engineOf(after).slice);
    const fold = engineOf(after);
    expect(fold.slice.inFlight).toBeNull();
    expect(stateHash(fold.slice.committed)).toBe(stateHash(before.committed));
    expect(errorMessages()).toEqual([expect.stringContaining("synthetic legality fault")]);
  });

  it("bounces an intent that faults with nothing in flight", () => {
    const state = begun();
    registerBattleInitProvider({
      ...fixtureBattleInitProvider(),
      engine: {
        ...FIXTURE_ENGINE,
        decision: () => {
          throw new Error("synthetic decision fault");
        },
      },
    });
    const result = reduce(state, "BATTLE_ACTION", { side: "player", action: { kind: "pass" } });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toBe(state);
  });
});
