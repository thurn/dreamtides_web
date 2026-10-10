// The AI host of a journey's engine battle, on the real local log, action
// facade, and fold, with synthetic engine cards: a journey battle plays to
// completion with the enemy answered only by the AI, and every failure path
// (a failed worker, a stale answer, a reload mid-turn, a bounced intent)
// leaves the battle moving without enemy input or duplicate intents.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BattleInit as EngineBattleInit } from "../../engine";
import { aiDecision, runPolicy, type PolicyRequest } from "../../engine/policy/decide";
import { createInlinePolicyHost, PolicyHostError, type PolicyHost } from "../../engine/policy/host";
import type { PolicyBudget, PolicyId, PolicyResult } from "../../engine/policy/types";
import type { Side } from "../../engine/state/ids";
import { DSL } from "../../engine/testing/dsl-cards";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { createLocalLog, type CommittedEvent, type LocalLog } from "../../eventlog/local-log";
import { aiEventActor } from "../../eventlog/types";
import { registerBattleInitProvider } from "../../rules/battle/battle-events";
import { pendingEnginePrompt } from "../../rules/battle/engine-battle";
import type { FoldState } from "../../rules/fold-state";
import {
  AVATAR_ID,
  BATTLE_SITE_ID,
  FIXTURE_ENGINE,
  clearReplayFixtureProviders,
  fixtureBattleInitProvider,
  registerReplayFixtureProviders,
} from "../../rules/replay/fixture-providers";
import { GAME_ENGINE_CONFIG } from "../../rules/replay/replay";
import { makeActions } from "../../session/actions";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { parseClientId } from "../../types/identifiers";
import { testEventActor } from "../../types/test-identities";
import { actionsSubmitter, EngineAiDriver, type EngineAiIntent } from "./engine-ai-driver";

const GENESIS = {
  seed: "fixture-battle",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
} as const;

const PLAYER = testEventActor("p1");
const AI_ACTOR = aiEventActor(parseClientId("p1"));

const BUDGETS: Readonly<Record<"turnPlanning" | "response", PolicyBudget>> = {
  turnPlanning: { iterations: 32 },
  response: { iterations: 16 },
};

/** Characters, an optional draw, and a modal points card on both sides; the battle is won at 4 points. */
function registerBattle(): void {
  const base = fixtureBattleInitProvider();
  const deck = (ids: readonly EngineBattleInit["decks"]["player"][number]["cardId"][]) =>
    Array.from({ length: 24 }, (_, index) => ({ cardId: ids[index % ids.length] ?? SYNTHETIC.vanilla1.id }));
  registerBattleInitProvider({
    engine: FIXTURE_ENGINE,
    beginBattle: (input) => {
      const start = base.beginBattle(input);
      return start === null
        ? null
        : {
            ...start,
            engineInit: {
              ...start.engineInit,
              scoreToWin: 4,
              decks: {
                player: deck([SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, DSL.chooseDrawOrPoints.id]),
                enemy: deck([SYNTHETIC.vanilla2.id, DSL.mayDrawTwo.id, SYNTHETIC.vanilla3.id, DSL.chooseDrawOrPoints.id]),
              },
            },
          };
    },
  });
}

function openLog(events: readonly CommittedEvent[] = []): LocalLog<FoldState> {
  let clock = 0;
  return createLocalLog({
    config: GAME_ENGINE_CONFIG,
    genesis: GENESIS as never,
    localActor: PLAYER,
    events,
    now: () => new Date((clock += 1)).toISOString(),
    devMode: true,
  });
}

/** A journey whose battle has begun. */
function battleLog(): LocalLog<FoldState> {
  const log = openLog();
  const actions = makeActions((draft) => Promise.resolve(log.append(draft)));
  void actions.startJourney({ avatarId: AVATAR_ID });
  void actions.enterSite(BATTLE_SITE_ID);
  void actions.beginBattle(BATTLE_SITE_ID);
  if (log.state().battle?.engine === undefined) throw new Error("the engine battle did not start");
  return log;
}

interface Logged {
  readonly event: string;
  readonly fields: Record<string, unknown>;
}

/** A driver for `side` on `log`, submitting through the action facade. */
function driverFor(
  log: LocalLog<FoldState>,
  side: Side,
  options: { policy?: PolicyId; host?: PolicyHost; submit?: (intent: EngineAiIntent) => void; logged?: Logged[] } = {},
): EngineAiDriver {
  const actions = makeActions((draft) => Promise.resolve(log.append(draft)));
  return new EngineAiDriver({
    side,
    policy: options.policy ?? (side === "enemy" ? "greedy" : "random"),
    engine: FIXTURE_ENGINE,
    host: options.host ?? createInlinePolicyHost(FIXTURE_ENGINE),
    submit: options.submit ?? actionsSubmitter(actions, side === "enemy" ? AI_ACTOR : undefined),
    log: (event, fields) => options.logged?.push({ event, fields }),
    now: () => 0,
    budgets: BUDGETS,
  });
}

/** Feeds every fold of `log` to `drivers` until `done` holds or nothing moves. */
async function run(log: LocalLog<FoldState>, drivers: readonly EngineAiDriver[], done: (state: FoldState) => boolean): Promise<void> {
  const unsubscribe = log.subscribe(() => {
    for (const driver of drivers) driver.update(log.state());
  });
  try {
    for (const driver of drivers) driver.update(log.state());
    for (let stalled = 0; stalled < 3 && !done(log.state()); ) {
      const head = log.head();
      await new Promise((resolve) => setImmediate(resolve));
      stalled = log.head() === head ? stalled + 1 : 0;
    }
  } finally {
    unsubscribe();
  }
}

const ended = (state: FoldState): boolean => state.battle?.engine?.slice.committed.result != null;

/** The enemy's pending decision request in `state`, if it owes one. */
function enemyRequest(state: FoldState): PolicyRequest | null {
  const fold = state.battle?.engine;
  if (fold === undefined || state.battle === null) return null;
  return (
    aiDecision({
      engine: FIXTURE_ENGINE,
      init: fold.init,
      slice: fold.slice,
      pending: pendingEnginePrompt(state.battle, FIXTURE_ENGINE),
      side: "enemy",
      policy: "greedy",
      budgets: BUDGETS,
    })?.request ?? null
  );
}

/**
 * A battle played by the Random player, with the enemy taking only its
 * forced decisions, until the enemy owes a decision that is not forced.
 */
async function atEnemyDecision(): Promise<LocalLog<FoldState>> {
  const log = battleLog();
  const player = driverFor(log, "player");
  const enemy = driverFor(log, "enemy", { host: deferredHost() });
  await run(log, [player, enemy], () => false);
  player.dispose();
  enemy.dispose();
  if (enemyRequest(log.state()) === null) throw new Error("the enemy owes no decision");
  return log;
}

function deferredHost(): PolicyHost & { resolveAll(result: (request: PolicyRequest) => PolicyResult): void; asked: PolicyRequest[] } {
  const waiting: { request: PolicyRequest; resolve: (result: PolicyResult) => void }[] = [];
  const asked: PolicyRequest[] = [];
  return {
    asked,
    decide: (request) =>
      new Promise((resolve) => {
        asked.push(request);
        waiting.push({ request, resolve });
      }),
    dispose: () => undefined,
    resolveAll: (result) => {
      for (const { request, resolve } of waiting.splice(0)) resolve(result(request));
    },
  };
}

beforeEach(() => {
  registerReplayFixtureProviders();
  registerBattle();
});

afterEach(() => {
  clearReplayFixtureProviders();
});

describe("a journey battle against the AI host", () => {
  it("plays to completion with every enemy decision and prompt answered by the AI, then hands off", async () => {
    const log = battleLog();
    const logged: Logged[] = [];
    await run(log, [driverFor(log, "player"), driverFor(log, "enemy", { logged })], ended);
    const state = log.state();
    expect(ended(state)).toBe(true);
    const enemyIntents = log
      .events()
      .filter(({ event }) => event.type.startsWith("BATTLE_") && (event.payload as { side?: unknown }).side === "enemy");
    expect(enemyIntents.length).toBeGreaterThan(0);
    expect(enemyIntents.every(({ event }) => event.actor === AI_ACTOR && event.intentKey !== undefined)).toBe(true);
    expect(enemyIntents.some(({ event }) => event.type === "BATTLE_ANSWER")).toBe(true);
    const decisions = logged.filter((entry) => entry.event === "ai.decision");
    expect(decisions.length).toBeGreaterThanOrEqual(enemyIntents.length);
    expect(decisions.every((entry) => entry.fields.policy === "greedy" && entry.fields.side === "enemy")).toBe(true);
    expect(JSON.stringify(logged)).not.toMatch(/"name"/u);

    const actions = makeActions((draft) => Promise.resolve(log.append(draft)));
    void actions.endBattle();
    expect(log.state().battle).toBeNull();
    expect(log.state().journey.screen.type).not.toBe("site");
  });

  it("resumes deterministically after a reload mid-AI-turn, without repeating an intent", async () => {
    const whole = battleLog();
    await run(whole, [driverFor(whole, "player"), driverFor(whole, "enemy")], ended);
    const events = whole.events();
    const enemySeqs = events.filter(({ event }) => event.actor === AI_ACTOR).map(({ seq }) => seq);
    const cut = enemySeqs[2];
    if (cut === undefined) throw new Error("too few enemy intents");

    const reloaded = openLog(events.slice(0, cut));
    await run(reloaded, [driverFor(reloaded, "player"), driverFor(reloaded, "enemy")], ended);
    const strip = ({ seq, event }: CommittedEvent) => ({ seq, type: event.type, payload: event.payload, actor: event.actor, intentKey: event.intentKey });
    expect(reloaded.events().map(strip)).toEqual(events.map(strip));
  });
});

describe("failure paths", () => {
  it("answers with the main-thread Random fallback when the policy host fails, and logs why", async () => {
    const log = await atEnemyDecision();
    const request = enemyRequest(log.state());
    if (request === null) throw new Error("no enemy decision");
    const submitted: EngineAiIntent[] = [];
    const logged: Logged[] = [];
    const failing: PolicyHost = {
      decide: () => Promise.reject(new PolicyHostError("workerError", "the worker crashed")),
      dispose: () => undefined,
    };
    const driver = driverFor(log, "enemy", { host: failing, submit: (intent) => submitted.push(intent), logged });
    driver.update(log.state());
    await new Promise((resolve) => setImmediate(resolve));
    const fallback = runPolicy(FIXTURE_ENGINE, { ...request, policy: "random" });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.choice).toEqual(fallback.choice);
    expect(logged.map((entry) => entry.event)).toEqual(["ai.error", "ai.decision"]);
    expect(logged[0]?.fields).toMatchObject({ reason: "workerError", fallback: "random" });
    expect(logged[1]?.fields).toMatchObject({ source: "fallback" });
  });

  it("discards an answer that arrives after the fold has moved on", async () => {
    const log = await atEnemyDecision();
    const state = log.state();
    const host = deferredHost();
    const submitted: EngineAiIntent[] = [];
    const logged: Logged[] = [];
    const driver = driverFor(log, "enemy", { host, submit: (intent) => submitted.push(intent), logged });
    driver.update(state);
    expect(host.asked).toHaveLength(1);
    // The battle moves on (here: it ends) before the worker answers.
    const fold = state.battle?.engine;
    if (fold === undefined || state.battle === null) throw new Error("no engine battle");
    const over: FoldState = {
      ...state,
      battle: { ...state.battle, engine: { ...fold, slice: { ...fold.slice, committed: { ...fold.slice.committed, result: { kind: "draw", reason: "turnLimit" } } } } },
    };
    driver.update(over);
    host.resolveAll((request) => runPolicy(FIXTURE_ENGINE, request));
    await new Promise((resolve) => setImmediate(resolve));
    expect(submitted).toEqual([]);
    expect(logged.map((entry) => entry.event)).toEqual(["ai.decision", "ai.stale"]);
  });

  it("submits a bounced intent again only once the fold has changed", async () => {
    const log = await atEnemyDecision();
    const state = log.state();
    const submitted: EngineAiIntent[] = [];
    const driver = driverFor(log, "enemy", { submit: (intent) => submitted.push(intent) });
    driver.update(state);
    await new Promise((resolve) => setImmediate(resolve));
    expect(submitted).toHaveLength(1);
    // The intent bounced: the fold is unchanged, so nothing is resubmitted.
    driver.update(state);
    driver.update(state);
    expect(submitted).toHaveLength(1);
    // An unrelated event changed the fold: the same decision is submitted again, identically.
    driver.update({ ...state });
    expect(submitted).toHaveLength(2);
    expect(submitted[1]).toEqual(submitted[0]);
  });

  it("asks nothing while the decision is the player's, or once disposed", () => {
    const log = battleLog();
    const host = deferredHost();
    const driver = driverFor(log, "enemy", { host });
    driver.update(log.state());
    expect(host.asked).toEqual([]);
    driver.dispose();
    driver.update(log.state());
    expect(host.asked).toEqual([]);
  });
});
