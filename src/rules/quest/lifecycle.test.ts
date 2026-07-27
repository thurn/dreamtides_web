import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import { hashState } from "../../eventlog/hash";
import type {
  DreamAvatarContent,
  ResolvedDreamAvatarPackage,
} from "../../types/content";
import type { DreamscapeModifier, QuestState } from "../../types/quest";
import { LayerName } from "../../types/layer-name";
import { FRONT_RANK_SLOTS } from "../../battle/types";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import {
  registerQuestLifecycleContentProvider,
  type QuestLifecycleContentProvider,
} from "./lifecycle";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "lifecycle-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null },
};

function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    seq: 10,
    rng: () => 0,
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(
  type: string,
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor,
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

function apply(
  state: FoldState,
  type: string,
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
): FoldState {
  return reduceGameEvent(state, event(type, payload), context).state;
}

function genesis(): FoldState {
  return genesisFoldState(GENESIS);
}

/**
 * A tiny deterministic 32-bit xorshift PRNG so the property sweeps are
 * reproducible without depending on `Math.random`.
 */
function makePrng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * A deterministic content provider whose package depends ONLY on
 * `(dreamAvatarId, seed)` — never on wall-clock or live randomness — so any
 * nondeterminism the reducer introduced would surface as a hash mismatch.
 */
function deterministicProvider(): QuestLifecycleContentProvider {
  function packageFor(
    dreamAvatarId: string,
    seed: string,
  ): ResolvedDreamAvatarPackage {
    const dreamAvatar: DreamAvatarContent = {
      id: dreamAvatarId,
      name: `caller-${dreamAvatarId}`,
      title: "title",
      renderedText: "text",
      imageNumber: "1",
      startingEssence: 150,
    };
    // Derive a stable dreamsign pool from (id, seed) so the package varies with
    // its inputs but is byte-identical across re-applications.
    const rng = makePrng(hashNumber(`${dreamAvatarId}:${seed}`));
    const dreamsignPoolIds = Array.from({ length: 8 }, () =>
      `ds-${String(Math.floor(rng() * 1_000_000))}`,
    );
    return {
      dreamAvatar,
      draftPoolCopiesByCard: { "1": 2, "2": 1 },
      dreamsignPoolIds,
      mandatoryOnlyPoolSize: 3,
      draftPoolSize: 3,
      doubledCardCount: 1,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
      starterDecklistCardNumbers: [10, 11, 12],
    };
  }
  return {
    resolveDreamAvatarPackage: (dreamAvatarId, seed) =>
      packageFor(dreamAvatarId, seed),
    startQuest: ({ quest, dreamAvatarId, seed }) => {
      const pkg = packageFor(dreamAvatarId, seed);
      return {
        ...quest,
        seed: quest.seed,
        essence: pkg.dreamAvatar.startingEssence,
        dreamAvatar: {
          id: pkg.dreamAvatar.id,
          name: pkg.dreamAvatar.name,
          title: pkg.dreamAvatar.title,
          renderedText: pkg.dreamAvatar.renderedText,
          imageNumber: pkg.dreamAvatar.imageNumber,
          startingEssence: pkg.dreamAvatar.startingEssence,
        },
        resolvedPackage: pkg,
        remainingDreamsignPool: [...pkg.dreamsignPoolIds],
        currentDreamscape: "node-start",
        screen: { type: "dreamscape" },
      };
    },
  };
}

function hashNumber(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

afterEach(() => {
  registerQuestLifecycleContentProvider(null);
});

// ---------------------------------------------------------------------------
// Essence / cap clamp
// ---------------------------------------------------------------------------

describe("essence and cap clamp", () => {
  it("ADJUST_ESSENCE clamps to [0, essenceCap]", () => {
    const start = genesis();
    const up = apply(start, "ADJUST_ESSENCE", { delta: 10_000 });
    expect(up.quest.essence).toBe(start.quest.essenceCap);
    const down = apply(up, "ADJUST_ESSENCE", { delta: -10_000 });
    expect(down.quest.essence).toBe(0);
  });

  it("SET_ESSENCE clamps to [0, essenceCap]", () => {
    const start = genesis();
    expect(apply(start, "SET_ESSENCE", { value: 10_000 }).quest.essence).toBe(
      start.quest.essenceCap,
    );
    expect(apply(start, "SET_ESSENCE", { value: -5 }).quest.essence).toBe(0);
  });

  it("ADJUST_ESSENCE_CAP re-clamps essence when the cap drops below it", () => {
    let state = apply(genesis(), "SET_ESSENCE", { value: 400 });
    state = apply(state, "ADJUST_ESSENCE_CAP", { delta: -300 });
    expect(state.quest.essenceCap).toBe(200);
    expect(state.quest.essence).toBe(200);
  });

  it("SET_ESSENCE_CAP re-clamps essence to the new cap", () => {
    let state = apply(genesis(), "SET_ESSENCE", { value: 450 });
    state = apply(state, "SET_ESSENCE_CAP", { value: 300 });
    expect(state.quest.essenceCap).toBe(300);
    expect(state.quest.essence).toBe(300);
  });

  it("keeps essence within [0, essenceCap] across a random sweep", () => {
    const rng = makePrng(12345);
    let state = genesis();
    for (let iteration = 0; iteration < 800; iteration += 1) {
      const roll = rng();
      if (roll < 0.4) {
        const delta = Math.floor((rng() - 0.5) * 4000);
        state = apply(state, "ADJUST_ESSENCE", { delta });
      } else if (roll < 0.7) {
        const value = Math.floor((rng() - 0.5) * 4000);
        state = apply(state, "SET_ESSENCE", { value });
      } else if (roll < 0.9) {
        const delta = Math.floor((rng() - 0.5) * 2000);
        state = apply(state, "ADJUST_ESSENCE_CAP", { delta });
      } else {
        const value = Math.floor(rng() * 3000);
        state = apply(state, "SET_ESSENCE_CAP", { value });
      }
      expect(state.quest.essence).toBeGreaterThanOrEqual(0);
      expect(state.quest.essence).toBeLessThanOrEqual(state.quest.essenceCap);
      expect(state.quest.essenceCap).toBeGreaterThanOrEqual(0);
    }
  });

  it("bounces a malformed essence payload", () => {
    const start = genesis();
    const out = reduceGameEvent(
      start,
      event("ADJUST_ESSENCE", { delta: "nope" }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(start);
  });
});

// ---------------------------------------------------------------------------
// Limits & completion
// ---------------------------------------------------------------------------

describe("limits and completion", () => {
  it("SET_MAX_DREAMSIGNS sets the value", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: 7 }).quest.maxDreamsigns,
    ).toBe(7);
  });

  it("SET_MAX_DREAMSIGNS clamps a negative value to 0", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: -5 }).quest.maxDreamsigns,
    ).toBe(0);
  });

  it("SET_MAX_DREAMSIGNS truncates a fractional value to an integer", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: 4.7 }).quest.maxDreamsigns,
    ).toBe(4);
  });

  it("SET_MAX_DREAMSIGNS bounces a non-finite value (NaN/Infinity)", () => {
    expect(
      reduceGameEvent(genesis(), event("SET_MAX_DREAMSIGNS", { value: Number.NaN }), ctx())
        .outcome,
    ).toBe("bounced");
    expect(
      reduceGameEvent(
        genesis(),
        event("SET_MAX_DREAMSIGNS", { value: Number.POSITIVE_INFINITY }),
        ctx(),
      ).outcome,
    ).toBe("bounced");
  });

  it("SET_COMPLETION_LEVEL sets the value", () => {
    expect(
      apply(genesis(), "SET_COMPLETION_LEVEL", { value: 3 }).quest
        .completionLevel,
    ).toBe(3);
  });

  it("SET_COMPLETION_LEVEL clamps a negative value to 0", () => {
    expect(
      apply(genesis(), "SET_COMPLETION_LEVEL", { value: -2 }).quest
        .completionLevel,
    ).toBe(0);
  });

  it("SET_COMPLETION_LEVEL truncates a fractional value to an integer", () => {
    expect(
      apply(genesis(), "SET_COMPLETION_LEVEL", { value: 2.9 }).quest
        .completionLevel,
    ).toBe(2);
  });

  it("SET_COMPLETION_LEVEL bounces a non-finite value (NaN/Infinity)", () => {
    expect(
      reduceGameEvent(genesis(), event("SET_COMPLETION_LEVEL", { value: Number.NaN }), ctx())
        .outcome,
    ).toBe("bounced");
    expect(
      reduceGameEvent(
        genesis(),
        event("SET_COMPLETION_LEVEL", { value: Number.POSITIVE_INFINITY }),
        ctx(),
      ).outcome,
    ).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe("navigation", () => {
  it("SET_SCREEN sets the screen and derives activeSiteId for site screens", () => {
    const siteScreen = apply(genesis(), "SET_SCREEN", {
      screen: { type: "site", siteId: "site-1" },
    });
    expect(siteScreen.quest.screen).toEqual({ type: "site", siteId: "site-1" });
    expect(siteScreen.quest.activeSiteId).toBe("site-1");

    const atlasScreen = apply(siteScreen, "SET_SCREEN", {
      screen: { type: "atlas" },
    });
    expect(atlasScreen.quest.screen).toEqual({ type: "atlas" });
    expect(atlasScreen.quest.activeSiteId).toBeNull();
  });

  it("MARK_SITE_VISITED records the visit once and flips the atlas site flag", () => {
    let state = genesis();
    state = {
      ...state,
      quest: withAtlasSite(state.quest, "node-1", "site-9"),
    };
    const visited = apply(state, "MARK_SITE_VISITED", { siteId: "site-9" });
    expect(visited.quest.visitedSites).toEqual(["site-9"]);
    expect(
      visited.quest.atlas.nodes["node-1"]?.sites.find((s) => s.id === "site-9")
        ?.isVisited,
    ).toBe(true);

    // Re-visiting is idempotent.
    const again = apply(visited, "MARK_SITE_VISITED", { siteId: "site-9" });
    expect(again.quest.visitedSites).toEqual(["site-9"]);
  });

  it("DISMISS_STARTING_DECK_POPUP flips the flag", () => {
    const state = apply(genesis(), "DISMISS_STARTING_DECK_POPUP", {});
    expect(state.quest.hasSeenStartingDeckPopup).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TRAVEL_TO_DREAMSCAPE — modifier decrement
// ---------------------------------------------------------------------------

describe("TRAVEL_TO_DREAMSCAPE", () => {
  function modifier(remaining: number, source: string): DreamscapeModifier {
    return {
      kind: "remove_shop_sites",
      dreamscapesRemaining: remaining,
      source,
    };
  }

  it("decrements dreamscapeModifiers and drops zeroed entries when advancing", () => {
    const base = genesis();
    const state: FoldState = {
      ...base,
      quest: {
        ...base.quest,
        currentDreamscape: "node-a",
        visitedSites: ["stale-site"],
        dreamscapeModifiers: [modifier(1, "one"), modifier(2, "two")],
      },
    };
    const next = apply(state, "TRAVEL_TO_DREAMSCAPE", { nodeId: "node-b" });
    expect(next.quest.currentDreamscape).toBe("node-b");
    expect(next.quest.visitedSites).toEqual([]);
    expect(next.quest.dreamscapeModifiers).toEqual([modifier(1, "two")]);
    expect(next.quest.screen).toEqual({ type: "dreamscape" });
    expect(next.quest.activeSiteId).toBeNull();
  });

  it("does not decrement modifiers when the node is unchanged", () => {
    const base = genesis();
    const state: FoldState = {
      ...base,
      quest: {
        ...base.quest,
        currentDreamscape: "node-a",
        dreamscapeModifiers: [modifier(2, "two")],
      },
    };
    const next = apply(state, "TRAVEL_TO_DREAMSCAPE", { nodeId: "node-a" });
    expect(next.quest.dreamscapeModifiers).toEqual([modifier(2, "two")]);
  });
});

// ---------------------------------------------------------------------------
// REROLL_DREAM_AVATAR_OFFER — shared quest-start debug state
// ---------------------------------------------------------------------------

describe("REROLL_DREAM_AVATAR_OFFER", () => {
  it("increments the persisted reroll count while choosing a DreamAvatar", () => {
    const start = genesis();
    const once = apply(start, "REROLL_DREAM_AVATAR_OFFER", {});
    const twice = apply(once, "REROLL_DREAM_AVATAR_OFFER", {});

    expect(once.quest.screen).toEqual({ type: "questStart", rerollCount: 1 });
    expect(twice.quest.screen).toEqual({ type: "questStart", rerollCount: 2 });
  });

  it("bounces after the quest has started", () => {
    registerQuestLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_QUEST", { dreamAvatarId: "dc-1" });
    const out = reduceGameEvent(
      started,
      event("REROLL_DREAM_AVATAR_OFFER", {}),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(started);
  });
});

// ---------------------------------------------------------------------------
// SELECT_DREAM_AVATAR — determinism
// ---------------------------------------------------------------------------

describe("SELECT_DREAM_AVATAR", () => {
  it("bounces when no content provider is registered", () => {
    const start = genesis();
    const out = reduceGameEvent(
      start,
      event("SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-1" }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(start);
  });

  it("derives a byte-identical resolvedPackage for the same seed regardless of ctx", () => {
    registerQuestLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const a = apply(start, "SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-42" }, ctx({
      seq: 3,
      timestamp: "2020-01-01T00:00:00.000Z",
      rng: () => 0.1,
    }));
    const b = apply(start, "SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-42" }, ctx({
      seq: 3,
      timestamp: "2099-12-31T23:59:59.000Z",
      rng: () => 0.9,
    }));
    expect(hashState(a.quest.resolvedPackage)).toBe(
      hashState(b.quest.resolvedPackage),
    );
    expect(a.quest.dreamAvatar?.id).toBe("dc-42");
    expect(a.quest.remainingDreamsignPool).toEqual(
      a.quest.resolvedPackage?.dreamsignPoolIds,
    );
  });

  it("produces a different package for a different dreamAvatar", () => {
    registerQuestLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const a = apply(start, "SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-1" });
    const b = apply(start, "SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-2" });
    expect(hashState(a.quest.resolvedPackage)).not.toBe(
      hashState(b.quest.resolvedPackage),
    );
  });
});

// ---------------------------------------------------------------------------
// START_QUEST / RESET_QUEST / LOAD_STATE
// ---------------------------------------------------------------------------

describe("START_QUEST", () => {
  it("bounces when no content provider is registered", () => {
    const start = genesis();
    const out = reduceGameEvent(
      start,
      event("START_QUEST", { dreamAvatarId: "dc-1" }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("assembles a run and preserves the room seed", () => {
    registerQuestLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const started = apply(
      start,
      "START_QUEST",
      { dreamAvatarId: "dc-7" },
      ctx({ seq: 17 }),
    );
    expect(started.quest.seed).toBe(GENESIS.seed);
    expect(started.quest.runId).toBe("quest:17");
    expect(started.quest.dreamAvatar?.id).toBe("dc-7");
    expect(started.quest.screen).toEqual({ type: "dreamscape" });
  });

  it("bounces START_QUEST once a dreamAvatar is already selected", () => {
    registerQuestLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_QUEST", { dreamAvatarId: "dc-7" });
    const out = reduceGameEvent(
      started,
      event("START_QUEST", { dreamAvatarId: "dc-9" }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });
});

describe("RESET_QUEST", () => {
  it("resets quest state to the genesis fold and clears battle", () => {
    registerQuestLifecycleContentProvider(deterministicProvider());
    let state = apply(genesis(), "START_QUEST", { dreamAvatarId: "dc-7" });
    state = apply(state, "SET_COMPLETION_LEVEL", { value: 5 });
    state = apply(state, "ADJUST_ESSENCE", { delta: 50 });
    // A battle in progress with no open prompt (an open prompt would be gated
    // by CAS rule 4 before routing — see the seam note in the task report).
    state = {
      ...state,
      battle: { board: {}, effectQueue: [], pendingPrompt: null } as unknown as NonNullable<
        typeof state.battle
      >,
    };

    const reset = apply(state, "RESET_QUEST", {});
    expect(reset.battle).toBeNull();
    expect(reset.quest.runId).toBeNull();
    expect(hashState(reset.quest)).toBe(
      hashState(genesisFoldState(GENESIS).quest),
    );
  });
});

describe("LOAD_STATE", () => {
  /** A structurally-valid battle slice with nothing parked (no scriptRefs). */
  const emptyBattle = {
    init: {},
    board: {},
    effectQueue: [],
    pendingPrompt: null,
    dawnFired: {},
  };

  it("replaces quest state with a valid snapshot and sets a well-formed battle", () => {
    const start = genesis();
    const snapshot: QuestState = {
      ...start.quest,
      completionLevel: 9,
      essence: 123,
    };
    const loaded = apply(
      start,
      "LOAD_STATE",
      { snapshot },
      ctx({ seq: 31 }),
    );
    expect(loaded.quest.runId).toBe("quest:31");
    expect(loaded.quest.completionLevel).toBe(9);
    expect(loaded.quest.essence).toBe(123);
    expect(loaded.battle).toBeNull();

    const withBattle = apply(start, "LOAD_STATE", {
      snapshot,
      battle: emptyBattle,
    });
    expect(withBattle.battle).toEqual({
      ...emptyBattle,
      mode: { kind: "quest" },
      challengeCursor: null,
    });
  });

  it("loads a legacy snapshot without a run id and mints one from the event", () => {
    const start = genesis();
    const { runId: _runId, ...snapshot } = start.quest;

    const loaded = apply(
      start,
      "LOAD_STATE",
      { snapshot },
      ctx({ seq: 44 }),
    );

    expect(loaded.quest.runId).toBe("quest:44");
  });

  it("bounces a non-object snapshot", () => {
    const start = genesis();
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", { snapshot: null }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a snapshot whose seed differs from the room seed", () => {
    const start = genesis();
    const snapshot: QuestState = { ...start.quest, seed: "some-other-seed" };
    const out = reduceGameEvent(start, event("LOAD_STATE", { snapshot }), ctx());
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a snapshot missing a required primitive field", () => {
    const start = genesis();
    const snapshot = { ...start.quest } as Record<string, unknown>;
    delete snapshot.essence;
    const out = reduceGameEvent(start, event("LOAD_STATE", { snapshot }), ctx());
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a snapshot that nulls a currently non-null run field", () => {
    registerQuestLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_QUEST", { dreamAvatarId: "dc-7" });
    expect(started.quest.dreamAvatar).not.toBeNull();
    const snapshot: QuestState = { ...started.quest, dreamAvatar: null };
    const out = reduceGameEvent(started, event("LOAD_STATE", { snapshot }), ctx());
    expect(out.outcome).toBe("bounced");
  });

  it("bounces when a battle run's scriptRef cannot resolve in the live tables", () => {
    const start = genesis();
    const snapshot: QuestState = { ...start.quest };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: {
          ...emptyBattle,
          effectQueue: [
            { scriptRef: { table: "battle", id: "not-a-real-uuid" }, cursor: [0], side: "player" },
          ],
        },
      }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a malformed battle slice (missing structural fields)", () => {
    const start = genesis();
    const snapshot: QuestState = { ...start.quest };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", { snapshot, battle: { pendingPrompt: { promptId: 2 } } }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("validates shared automation and AI-defense markers in loaded battles", () => {
    const start = genesis();
    const snapshot: QuestState = { ...start.quest };
    const validBattle = {
      ...emptyBattle,
      basicAutomationEnabled: true,
      aiDefenseTurn: { activeSide: "player", turnNumber: 3 },
    };
    expect(apply(start, "LOAD_STATE", { snapshot, battle: validBattle }).battle).toEqual({
      ...validBattle,
      mode: { kind: "quest" },
      challengeCursor: null,
    });

    const malformed = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: { ...emptyBattle, aiDefenseTurn: { activeSide: "enemy" } },
      }),
      ctx(),
    );
    expect(malformed.outcome).toBe("bounced");
  });

  it("normalizes a missing Challenge cursor and validates a persisted cursor", () => {
    const start = genesis();
    const snapshot: QuestState = { ...start.quest };
    const cursor = {
      activeSide: "player",
      nextLane: FRONT_RANK_SLOTS,
      handoff: { activeSide: "enemy", phase: "dreamwell", turnNumber: 3 },
    };
    expect(apply(start, "LOAD_STATE", {
      snapshot,
      battle: { ...emptyBattle, challengeCursor: cursor },
    }).battle?.challengeCursor).toEqual(cursor);

    const malformed = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: {
          ...emptyBattle,
          challengeCursor: { ...cursor, nextLane: FRONT_RANK_SLOTS + 1 },
        },
      }),
      ctx(),
    );
    expect(malformed.outcome).toBe("bounced");
  });

  it("bounces a battle slice whose pendingPrompt promptId is not numeric", () => {
    const start = genesis();
    const snapshot: QuestState = { ...start.quest };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: { ...emptyBattle, pendingPrompt: { promptId: "stuck" } },
      }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a battle slice whose pendingPrompt options are malformed", () => {
    const start = genesis();
    const snapshot: QuestState = { ...start.quest };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: {
          ...emptyBattle,
          pendingPrompt: {
            promptId: 2,
            run: { scriptRef: { table: "battle", id: "not-a-real-uuid" }, cursor: [0], side: "player" },
            kind: "choice",
            options: { kind: "choice", label: "bad", options: [{ wrong: "shape" }] },
          },
        },
      }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function withAtlasSite(
  quest: QuestState,
  nodeId: string,
  siteId: string,
): QuestState {
  return {
    ...quest,
    atlas: {
      ...quest.atlas,
      nodes: {
        ...quest.atlas.nodes,
        [nodeId]: {
          id: nodeId,
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: null,
          biomeName: "",
          biomeColor: "",
          sites: [
            {
              id: siteId,
              type: "Shop",
              isEnhanced: false,
              isVisited: false,
            },
          ],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
    },
  };
}
