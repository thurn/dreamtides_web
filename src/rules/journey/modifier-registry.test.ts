import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, Genesis, ReducerLogRecord } from "../../eventlog/types";
import { resetLog, type JourneyLogRecord } from "../../logging";
import { attachGameLog } from "../../session/game-log";
import type { LocalGame } from "../../session/local-game";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import type { DreamsignId } from "../../types/identifiers";
import { parseClientId, parseGameId, parseIntentKey, parseSiteId } from "../../types/identifiers";
import {
  testDreamsignId,
  testEventActor,
  testJourneySeed,
} from "../../types/test-identities";
import { testCardId } from "../../types/test-identities";
import {
  ADMINISTRATIVE_EVENT_TYPES,
  type AdministrativeEventType,
  type GameEventType,
} from "../events";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import {
  AVATAR_ID,
  BATTLE_SITE_ID,
  DRAFT_SITE_ID,
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../replay/fixture-providers";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { registerDeckContentProvider } from "./deck";
import { registerDraftContentProvider } from "./draft";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import {
  createJourneyModifierRegistry,
  type JourneyModifierDefinition,
  type JourneyModifierRegistry,
} from "./modifier-registry";
import {
  testDraftContentProvider,
  testJourneyLifecycleContentProvider,
} from "./test-content-providers";

const FIRST = testDreamsignId("modifier-first");
const SECOND = testDreamsignId("modifier-second");
const UNKNOWN = testDreamsignId("modifier-unknown");
const SITE = parseSiteId("modifier-site");
const GENESIS: Genesis = {
  seed: testJourneySeed("modifier-registry"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};
const ACTOR = testEventActor("modifier-player");
const TIMESTAMP = "1970-01-01T00:00:00.000Z";

function initial(ids: readonly DreamsignId[] = [FIRST, SECOND]): FoldState {
  const state = GAME_ENGINE_CONFIG.genesisState(GENESIS);
  return {
    ...state,
    journey: {
      ...state.journey,
      essence: 20,
      dreamsigns: ids.map((id) => ({ id, name: "same fixture name", effectDescription: "" })),
    },
  };
}

function modifier(dreamsignId: DreamsignId, amount: number): JourneyModifierDefinition {
  return {
    dreamsignId,
    afterJourneyEvent({ journey, eventType }) {
      if (eventType !== "ADJUST_ESSENCE") return null;
      const essence = journey.essence + amount;
      return {
        journey: { ...journey, essence },
        before: { essence: journey.essence },
        after: { essence },
      };
    },
  };
}

function config(registry: JourneyModifierRegistry, state = initial()): EngineConfig<FoldState> {
  return {
    ...GAME_ENGINE_CONFIG,
    genesisState: () => state,
    reducer: (before, event, ctx) => reduceGameEvent(before, event, ctx, registry),
  };
}

function local(registry: JourneyModifierRegistry, state = initial(), devMode = true) {
  return createLocalLog({
    config: config(registry, state),
    genesis: GENESIS,
    localActor: ACTOR,
    now: () => TIMESTAMP,
    devMode,
  });
}

afterEach(() => {
  clearReplayFixtureProviders();
  resetLog();
  vi.restoreAllMocks();
});

type Intent = { readonly type: GameEventType; readonly payload: Record<string, unknown> };

/**
 * Synthetic content seams over the replay fixture providers: every Dreamsign
 * UUID resolves, any card resolves to one number, and drafts deal packs of 2.
 */
function registerSyntheticProviders(): void {
  registerReplayFixtureProviders();
  registerDeckContentProvider({
    resolveCardNumber: () => 100,
    resolveDreamsign: (id) => ({ id, name: "same fixture name", effectDescription: "" }),
  });
  registerDraftContentProvider(testDraftContentProvider({
    resolveCardNumber: () => 100,
    draftConfigFor: () => ({ packSize: 2, sitePickCount: 5, rarityCaps: [] }),
  }));
}

/** How one administrative intent reaches a state where it applies. */
interface AdministrativeCase {
  /** A fixture-provider seed whose run atlas the case needs. */
  readonly seed?: string;
  /** Gameplay intents appended after the run starts and a Dreamsign is gained. */
  readonly prefix?: readonly Intent[];
  /** Content seams the intent needs beyond the synthetic providers. */
  readonly setup?: () => void;
  readonly payload: (state: FoldState) => Record<string, unknown>;
}

const AUGURY_SITE = parseSiteId("modifier-augury");
const ADD_ENTRY: readonly Intent[] = [{ type: "ADD_CARD", payload: { cardId: testCardId("modifier-card") } }];
const firstEntryId = (state: FoldState) => state.journey.deck[0]?.entryId;

/** Keyed by the administrative type: classifying a new one requires a case here. */
const ADMINISTRATIVE_CASES: Readonly<Record<AdministrativeEventType, AdministrativeCase>> = {
  SET_ESSENCE: { payload: () => ({ value: 99 }) },
  SET_MAX_DREAMSIGNS: { payload: () => ({ value: 5 }) },
  RESET_JOURNEY: { payload: () => ({}) },
  LOAD_STATE: { payload: (state) => ({ snapshot: { ...state.journey, essence: 77 } }) },
  REGENERATE_ATLAS: {
    setup: () => registerJourneyLifecycleContentProvider(testJourneyLifecycleContentProvider({
      regenerateAtlas: ({ journey }) => ({ ...journey }),
    })),
    payload: () => ({}),
  },
  SET_DECK_ENTRY_STAT_OVERRIDE: { prefix: ADD_ENTRY, payload: (state) => ({ entryId: firstEntryId(state), override: { spark: 3 } }) },
  SET_DECK_ENTRY_KEYWORDS: { prefix: ADD_ENTRY, payload: (state) => ({ entryId: firstEntryId(state), keywords: null }) },
  SET_DECK_ENTRY_TYPE: { prefix: ADD_ENTRY, payload: (state) => ({ entryId: firstEntryId(state), typeChange: null }) },
  SET_DREAMSIGN_POOL: { payload: () => ({ ids: [] }) },
  SET_DRAFT_STATE: { payload: (state) => ({ draftState: state.journey.draftState }) },
  REROLL_DRAFT_OFFER: {
    prefix: [
      { type: "ENTER_SITE", payload: { siteId: DRAFT_SITE_ID } },
      { type: "ENTER_DRAFT_SITE", payload: { siteId: DRAFT_SITE_ID } },
    ],
    payload: () => ({ siteId: DRAFT_SITE_ID }),
  },
  REROLL_AUGURY: { payload: () => ({ siteId: AUGURY_SITE }) },
  FORCE_AUGURY_ARCHETYPE: { payload: () => ({ siteId: AUGURY_SITE, archetypeId: null }) },
  SET_CARD_SOURCE_DEBUG: { payload: () => ({ state: null }) },
  BATTLE_DEBUG: {
    // This fixture seed's run atlas holds only the Battle site.
    seed: "fixture-battle",
    prefix: [
      { type: "ENTER_SITE", payload: { siteId: BATTLE_SITE_ID } },
      { type: "BEGIN_BATTLE", payload: { siteId: BATTLE_SITE_ID } },
    ],
    payload: () => ({ op: { kind: "setScore", side: "player", score: 0 } }),
  },
};

describe("journey modifier registry", () => {
  it("looks up copied definitions by UUID and rejects duplicate registrations", () => {
    const definition = modifier(FIRST, 3);
    const definitions = [definition];
    const registry = createJourneyModifierRegistry(definitions);
    definitions.length = 0;
    expect(registry.lookup(FIRST)?.dreamsignId).toBe(FIRST);
    expect(registry.lookup(UNKNOWN)).toBeUndefined();
    expect(Object.isFrozen(registry.lookup(FIRST))).toBe(true);
    expect(() => createJourneyModifierRegistry([definition, definition])).toThrow();
  });

  it("preserves empty-registry state, hash, and outcome without diagnostic records", () => {
    const registry = createJourneyModifierRegistry([]);
    const event = {
      type: "ADJUST_ESSENCE" as const,
      payload: { delta: 5 },
      actor: ACTOR,
      clientTimestamp: TIMESTAMP,
      basedOnSeq: 0,
    };
    const context = { seq: 1, contentConfig: TEST_CONTENT_CONFIG, rng: () => 0, intervening: [], timestamp: TIMESTAMP };
    const before = initial();
    const expected = reduceGameEvent(before, event, context);
    const actual = reduceGameEvent(before, event, context, registry);
    expect(actual).toEqual(expected);
    expect(GAME_ENGINE_CONFIG.hash(actual.state)).toBe(GAME_ENGINE_CONFIG.hash(expected.state));
    expect(actual.logRecords).toBeUndefined();
  });

  it("applies held copies in journey order and logs each intermediate numeric value", () => {
    const registry = createJourneyModifierRegistry([modifier(SECOND, 7), modifier(FIRST, 3)]);
    const before = initial([FIRST, UNKNOWN, SECOND, FIRST]);
    const log = local(registry, before);
    const records: LocalLogRecord<FoldState>[] = [];
    log.subscribe((record) => records.push(record));
    log.append({ type: "ADJUST_ESSENCE", payload: { delta: 5, siteId: SITE } });
    expect(log.state().journey.essence).toBe(38);
    expect(before.journey.essence).toBe(20);
    expect(records[0].logRecords).toEqual([
      { event: "journey_modifier_applied", fields: { dreamsignId: FIRST, hook: "after_journey_event", eventType: "ADJUST_ESSENCE", siteId: SITE, heldIndex: 0, before: { essence: 25 }, after: { essence: 28 } } },
      { event: "journey_modifier_applied", fields: { dreamsignId: SECOND, hook: "after_journey_event", eventType: "ADJUST_ESSENCE", siteId: SITE, heldIndex: 2, before: { essence: 28 }, after: { essence: 35 } } },
      { event: "journey_modifier_applied", fields: { dreamsignId: FIRST, hook: "after_journey_event", eventType: "ADJUST_ESSENCE", siteId: SITE, heldIndex: 3, before: { essence: 35 }, after: { essence: 38 } } },
    ]);
    expect(log.checkpoint()).not.toHaveProperty("logRecords");
    expect(log.events()[0].event).not.toHaveProperty("logRecords");
    log.append({ type: "SET_ESSENCE", payload: { value: 10 } });
    expect(records[1].logRecords).toBeUndefined();
  });

  it("bounces invalid and conflicting intents without applying modifiers or diagnostics", () => {
    const callback = vi.fn(modifier(FIRST, 3).afterJourneyEvent);
    const registry = createJourneyModifierRegistry([{ dreamsignId: FIRST, afterJourneyEvent: callback }]);
    const log = local(registry);
    const records: LocalLogRecord<FoldState>[] = [];
    log.subscribe((record) => records.push(record));
    log.append({ type: "ADJUST_ESSENCE", payload: { delta: null } });
    expect(callback).not.toHaveBeenCalled();
    expect(records[0].outcome).toBe("bounced");
    expect(records[0].logRecords).toBeUndefined();
    const outcome = reduceGameEvent(initial(), {
      type: "ADJUST_ESSENCE", payload: { delta: 5 }, actor: ACTOR, clientTimestamp: TIMESTAMP, basedOnSeq: 0,
    }, {
      seq: 2, contentConfig: TEST_CONTENT_CONFIG, rng: () => 0, timestamp: TIMESTAMP,
      intervening: [{ seq: 1, actor: testEventActor("other-actor"), type: "ADJUST_ESSENCE" }],
    }, registry);
    expect(outcome.outcome).toBe("bounced");
    expect(callback).not.toHaveBeenCalled();
  });

  it("contains a mid-hook error atomically and discards earlier application diagnostics", () => {
    const throwing: JourneyModifierDefinition = {
      dreamsignId: SECOND,
      afterJourneyEvent() { throw new Error("synthetic modifier failure"); },
    };
    const registry = createJourneyModifierRegistry([modifier(FIRST, 3), throwing]);
    const before = initial();
    const log = local(registry, before, false);
    const records: LocalLogRecord<FoldState>[] = [];
    log.subscribe((record) => records.push(record));
    log.append({ type: "ADJUST_ESSENCE", payload: { delta: 5 } });
    expect(log.state()).toBe(before);
    expect(records[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
    expect(records[0].logRecords).toBeUndefined();
    const devLog = local(registry, before);
    expect(() => devLog.append({ type: "ADJUST_ESSENCE", payload: { delta: 5 } })).toThrow();
    expect(devLog.head()).toBe(0);
    expect(devLog.events()).toEqual([]);
  });

  it("replays state and records deterministically and resumes a checkpoint without repeating a keyed intent", () => {
    const registry = createJourneyModifierRegistry([modifier(FIRST, 3)]);
    const log = local(registry);
    const intentKey = parseIntentKey("modifier-once");
    const intent = { type: "ADJUST_ESSENCE" as const, payload: { delta: 5 }, intentKey };
    log.append(intent);
    const replayed = foldEvents(config(registry), GENESIS, { seq: 0, state: initial() }, [...log.events()]);
    expect(replayed.state).toEqual(log.state());
    expect(replayed.outcomes[0].logRecords).toHaveLength(1);
    const resumed = createLocalLog({ config: config(registry), genesis: GENESIS, localActor: ACTOR, base: log.checkpoint(), history: log.events(), now: () => TIMESTAMP });
    const records: LocalLogRecord<FoldState>[] = [];
    resumed.subscribe((record) => records.push(record));
    expect(resumed.append(intent)).toBe(1);
    expect(records).toEqual([]);
    resumed.append({ type: "ADJUST_ESSENCE", payload: { delta: 1 } });
    expect(resumed.state().journey.essence).toBe(32);
    expect(records[0].logRecords).toHaveLength(1);
  });

  it("publishes applied records through the game host with authoritative game, seq, timestamp, and site", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const before = initial([FIRST]);
    const definition = modifier(FIRST, 3);
    const log = local(createJourneyModifierRegistry([{
      ...definition,
      afterJourneyEvent(input) {
        if (input.journey.essence > 30) throw new Error("synthetic host failure");
        return definition.afterJourneyEvent(input);
      },
    }]), before, false);
    const records: JourneyLogRecord[] = [];
    const game: LocalGame<FoldState> = {
      gameId: parseGameId("modifier-game"), localPlayerId: parseClientId("modifier-player"),
      genesis: GENESIS, log,
      opened: { checkpointSeq: 0, checkpointRejected: false, replayedEvents: 0, replayFoldErrors: 0 },
      flush: () => Promise.resolve(), close: () => Promise.resolve(),
    };
    const detach = attachGameLog(game, { mirror: (record) => records.push(record) });
    log.append({ type: "ADJUST_ESSENCE", payload: { delta: 5, siteId: SITE } });
    log.append({ type: "ADJUST_ESSENCE", payload: { delta: null } });
    log.append({ type: "ADJUST_ESSENCE", payload: { delta: 5 } });
    detach();
    expect(records.filter((record) => record.event === "journey_modifier_applied")).toEqual([
      { event: "journey_modifier_applied", gameId: game.gameId, seq: 1, timestamp: TIMESTAMP,
        dreamsignId: FIRST, hook: "after_journey_event", eventType: "ADJUST_ESSENCE", siteId: SITE,
        heldIndex: 0, before: { essence: 25 }, after: { essence: 28 } },
    ]);
    expect(log.state().journey.essence).toBe(28);
    expect(records.filter((record) => record.event === "event_bounced")).toHaveLength(2);
  });

  it("rejects nonnumeric diagnostics and suppresses diagnostics on any bounced reducer result", () => {
    const invalid = modifier(FIRST, Number.NaN);
    const log = local(createJourneyModifierRegistry([invalid]), initial([FIRST]), false);
    const records: LocalLogRecord<FoldState>[] = [];
    log.subscribe((record) => records.push(record));
    log.append({ type: "ADJUST_ESSENCE", payload: { delta: 5 } });
    expect(log.state().journey.essence).toBe(20);
    expect(records[0].logRecords).toBeUndefined();
    const diagnostics: ReducerLogRecord[] = [{ event: "synthetic_diagnostic", fields: {} }];
    const bounced = createLocalLog({ config: { ...GAME_ENGINE_CONFIG, reducer: (state) => ({ state, outcome: "bounced", logRecords: diagnostics }) }, genesis: GENESIS, localActor: ACTOR });
    bounced.subscribe((record) => expect(record.logRecords).toBeUndefined());
    bounced.append({ type: "ADJUST_ESSENCE", payload: { delta: 5 } });
  });

  it("keeps whole-state loading and resetting exact without running journey hooks", () => {
    const callback = vi.fn<JourneyModifierDefinition["afterJourneyEvent"]>(() => { throw new Error("must not run"); });
    const log = local(createJourneyModifierRegistry([{ dreamsignId: FIRST, afterJourneyEvent: callback }]));
    const snapshot = initial([FIRST]).journey;
    snapshot.essence = 77;
    log.append({ type: "LOAD_STATE", payload: { snapshot } });
    expect(log.state().journey.essence).toBe(77);
    log.append({ type: "RESET_JOURNEY", payload: {} });
    expect(log.state().journey.dreamsigns).toEqual([]);
    expect(callback).not.toHaveBeenCalled();
  });

  it("runs no journey hook for any administrative intent", () => {
    expect(new Set(Object.keys(ADMINISTRATIVE_CASES))).toEqual(ADMINISTRATIVE_EVENT_TYPES);
    for (const type of ADMINISTRATIVE_EVENT_TYPES) {
      registerSyntheticProviders();
      const hook = vi.fn<JourneyModifierDefinition["afterJourneyEvent"]>(() => null);
      const { seed, prefix = [], setup, payload } = ADMINISTRATIVE_CASES[type];
      const log = local(
        createJourneyModifierRegistry([{ dreamsignId: FIRST, afterJourneyEvent: hook }]),
        GAME_ENGINE_CONFIG.genesisState(seed === undefined ? GENESIS : { ...GENESIS, seed: testJourneySeed(seed) }),
      );
      const records: LocalLogRecord<FoldState>[] = [];
      log.subscribe((record) => records.push(record));
      for (const intent of [
        { type: "START_JOURNEY", payload: { avatarId: AVATAR_ID } },
        { type: "ADD_DREAMSIGN", payload: { dreamsignId: FIRST } },
        ...prefix,
      ] satisfies readonly Intent[]) {
        log.append(intent);
      }
      expect(records.map((record) => record.outcome), type).not.toContain("bounced");
      expect(hook, type).toHaveBeenCalled();
      hook.mockClear();
      setup?.();
      const before = log.state();
      log.append({ type, payload: payload(before) });
      expect(records[records.length - 1]?.outcome, type).toBe("applied");
      expect(log.state(), type).not.toBe(before);
      expect(hook, type).not.toHaveBeenCalled();
      clearReplayFixtureProviders();
    }
  });

  it("applies a Dreamsign an event gains to that event and skips one it removes or replaces", () => {
    registerSyntheticProviders();
    const registry = createJourneyModifierRegistry([FIRST, SECOND].map((dreamsignId) => ({
      dreamsignId,
      afterJourneyEvent: ({ journey }) => ({
        journey: { ...journey, essence: journey.essence + 1 },
        before: { essence: journey.essence },
        after: { essence: journey.essence + 1 },
      }),
    })));
    const log = local(registry, initial([FIRST]));
    const records: LocalLogRecord<FoldState>[] = [];
    log.subscribe((record) => records.push(record));
    const applied = () => records[records.length - 1]?.logRecords?.map(({ fields }) => [fields.dreamsignId, fields.eventType, fields.heldIndex]);
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: SECOND } });
    expect(applied()).toEqual([[FIRST, "ADD_DREAMSIGN", 0], [SECOND, "ADD_DREAMSIGN", 1]]);
    log.append({ type: "REMOVE_DREAMSIGN", payload: { dreamsignId: FIRST } });
    expect(applied()).toEqual([[SECOND, "REMOVE_DREAMSIGN", 0]]);
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: FIRST, purgeIndex: 0 } });
    expect(applied()).toEqual([[FIRST, "ADD_DREAMSIGN", 0]]);
    expect(log.state().journey.essence).toBe(24);
  });
});
