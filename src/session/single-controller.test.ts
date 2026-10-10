// Single-controller contracts: the local player takes control of a game whose
// fold names another controller, claims an unowned tutorial battle only on a
// direct tutorial-battle entry, and keeps control when the log reopens from
// its committed events, so the tutorial driver never stays paused. Runs the
// real reducer over the synthetic fixture providers.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planTutorialBattleController } from "../battle/tutorial-battle-controller";
import {
  createLocalLog,
  type CommittedEvent,
  type EventDraft,
  type LocalLog,
} from "../eventlog/local-log";
import type { GameEvent, Genesis } from "../eventlog/types";
import { decodeEvent, decodeGenesis, isFoldableGenesis } from "../eventlog/wire";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import { emptyDawnFired, journeyBattleOf } from "../rules/battle/fold";
import type { FoldState } from "../rules/fold-state";
import {
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../rules/replay/fixture-providers";
import battleFixture from "../rules/replay/fixtures/battle.json";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import { parseClientId, parseTutorialRunId } from "../types/identifiers";
import { testEventActor } from "../types/test-identities";
import { keepLocalPlayerInControl } from "./single-controller";

const JOURNEY_GENESIS: Genesis = (() => {
  const genesis = decodeGenesis(JSON.stringify(battleFixture.genesis));
  if (genesis === null || !isFoldableGenesis(genesis)) {
    throw new Error("Battle fixture genesis is invalid.");
  }
  return genesis;
})();
/** A standalone-tutorial game: its fold starts in single-controller mode. */
const TUTORIAL_GENESIS: Genesis = {
  ...JOURNEY_GENESIS,
  frontDoorEntry: "tutorial",
};

const SCRIPT: readonly EventDraft[] = battleFixture.events.map(({ event }) => {
  const decoded: GameEvent = decodeEvent(JSON.stringify(event));
  return { type: decoded.type, payload: decoded.payload };
});
const BEGIN_BATTLE_INDEX = SCRIPT.findIndex(
  (draft) => draft.type === "BEGIN_BATTLE",
);

const LOCAL_PLAYER = parseClientId("local-player");
const EARLIER_PLAYER = parseClientId("earlier-player");
const DIRECT_ENTRY = { claimUnownedBattle: true };
const FRONT_DOOR_ENTRY = { claimUnownedBattle: false };
const now = () => "2026-01-01T00:00:00.000Z";

interface TestGame {
  localPlayerId: typeof LOCAL_PLAYER;
  log: LocalLog<FoldState>;
}

function openGame(
  genesis: Genesis,
  base?: FoldState,
  events: readonly CommittedEvent[] = [],
): TestGame {
  return {
    localPlayerId: LOCAL_PLAYER,
    log: createLocalLog({
      config: GAME_ENGINE_CONFIG,
      genesis,
      localActor: LOCAL_PLAYER,
      ...(base === undefined ? {} : { base: { seq: 0, state: base, intentKeys: [] } }),
      events,
      now,
      devMode: true,
    }),
  };
}

/** A journey played into its first battle. */
function journeyInBattle(): TestGame {
  const game = openGame(JOURNEY_GENESIS);
  for (const draft of SCRIPT.slice(0, BEGIN_BATTLE_INDEX + 1)) {
    game.log.append(draft);
  }
  return game;
}

/** A standalone-tutorial fold holding a live tutorial battle nobody controls. */
function unownedTutorialBattle(): FoldState {
  const played = journeyInBattle().log.state();
  const begun = journeyBattleOf(played.battle);
  if (begun === null) throw new Error("The fixture battle did not begin.");
  const state: FoldState = {
    ...GAME_ENGINE_CONFIG.genesisState(TUTORIAL_GENESIS),
    journey: played.journey,
    battle: {
      init: begun.init,
      board: createInitialBattleState(begun.init),
      effectQueue: [],
      pendingPrompt: null,
      dawnFired: emptyDawnFired(),
      mode: {
        kind: "tutorial",
        tutorialRunId: parseTutorialRunId("tutorial-run"),
        restartNumber: 0,
        resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
      },
    },
  };
  expect(state.playtestControl).toEqual({
    mode: "single-controller",
    controllerClientId: null,
  });
  return state;
}

const controllerOf = (game: TestGame) =>
  game.log.state().playtestControl?.controllerClientId ?? null;

const driverStatus = (game: TestGame) =>
  planTutorialBattleController({
    state: game.log.state(),
    clientId: LOCAL_PLAYER,
    connectedClientIds: [LOCAL_PLAYER],
  }).status;

beforeAll(registerReplayFixtureProviders);
afterAll(clearReplayFixtureProviders);

describe("keepLocalPlayerInControl", () => {
  it("takes control from a foreign controller with one intent", () => {
    const game = openGame(TUTORIAL_GENESIS);
    game.log.append({
      type: "TAKE_PLAYTEST_CONTROL",
      payload: { previousControllerClientId: null },
      actor: testEventActor(EARLIER_PLAYER),
    });
    expect(controllerOf(game)).toBe(EARLIER_PLAYER);
    const head = game.log.head();

    const detach = keepLocalPlayerInControl(game, FRONT_DOOR_ENTRY);

    expect(controllerOf(game)).toBe(LOCAL_PLAYER);
    expect(game.log.head()).toBe(head + 1);
    const events = game.log.events();
    expect(events[events.length - 1]?.event).toMatchObject({
      type: "TAKE_PLAYTEST_CONTROL",
      payload: { previousControllerClientId: EARLIER_PLAYER },
      actor: LOCAL_PLAYER,
    });

    // A later handoff elsewhere is taken back too.
    game.log.append({
      type: "TAKE_PLAYTEST_CONTROL",
      payload: { previousControllerClientId: LOCAL_PLAYER },
      actor: testEventActor(EARLIER_PLAYER),
    });
    expect(controllerOf(game)).toBe(LOCAL_PLAYER);
    detach();
  });

  it("claims an unowned tutorial battle only on a direct tutorial-battle entry", () => {
    const frontDoor = openGame(TUTORIAL_GENESIS, unownedTutorialBattle());
    expect(driverStatus(frontDoor)).toBe("paused-driver-absent");
    keepLocalPlayerInControl(frontDoor, FRONT_DOOR_ENTRY)();
    expect(controllerOf(frontDoor)).toBeNull();
    expect(frontDoor.log.head()).toBe(0);

    const direct = openGame(TUTORIAL_GENESIS, unownedTutorialBattle());
    const detach = keepLocalPlayerInControl(direct, DIRECT_ENTRY);
    expect(controllerOf(direct)).toBe(LOCAL_PLAYER);
    expect(driverStatus(direct)).not.toBe("paused-driver-absent");
    detach();
  });

  it("keeps control when the log reopens from its committed events", () => {
    const base = unownedTutorialBattle();
    const game = openGame(TUTORIAL_GENESIS, base);
    keepLocalPlayerInControl(game, DIRECT_ENTRY)();
    expect(controllerOf(game)).toBe(LOCAL_PLAYER);

    const reopened = openGame(TUTORIAL_GENESIS, base, game.log.events());
    expect(controllerOf(reopened)).toBe(LOCAL_PLAYER);
    expect(driverStatus(reopened)).not.toBe("paused-driver-absent");
    const head = reopened.log.head();
    const detach = keepLocalPlayerInControl(reopened, DIRECT_ENTRY);
    expect(reopened.log.head()).toBe(head);
    detach();
  });

  it("leaves collaborative games alone", () => {
    const game = journeyInBattle();
    const head = game.log.head();
    keepLocalPlayerInControl(game, DIRECT_ENTRY)();
    expect(game.log.head()).toBe(head);
    expect(game.log.state().playtestControl?.mode).toBe("collaborative");
  });
});
