import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import { testJourneyMutationSource } from "../../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import { hashState } from "../../eventlog/hash";
import type {
  AvatarContent,
  ResolvedAvatarPackage,
} from "../../types/content";
import type { DreamscapeModifier, JourneyState } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import {
  registerJourneyLifecycleContentProvider,
  type JourneyLifecycleContentProvider,
} from "./lifecycle";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import type { AvatarId } from "../../types/identifiers";
import type { AtlasNodeId } from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import { testAvatarId, testDreamscapeId, testDreamsignId } from "../../types/test-identities";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: testJourneySeed("lifecycle-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: {
    poolVariant: "tides4",
  },
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
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor: testEventActor(actor),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

function apply(
  state: FoldState,
  type: GameEvent["type"],
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
 * `(avatarId, seed)` — never on wall-clock or live randomness — so any
 * nondeterminism the reducer introduced would surface as a hash mismatch.
 */
function deterministicProvider(
  isTutorialJourney = false,
): JourneyLifecycleContentProvider {
  function packageFor(
    avatarId: AvatarId,
    seed: string,
  ): ResolvedAvatarPackage {
    const avatar: AvatarContent = {
      id: avatarId,
      name: `caller-${avatarId}`,
      title: "title",
      renderedText: "text",
      imageNumber: "1",
      startingEssence: 150,
    };
    // Derive a stable dreamsign pool from (id, seed) so the package varies with
    // its inputs but is byte-identical across re-applications.
    const rng = makePrng(hashNumber(`${avatarId}:${seed}`));
    const dreamsignPoolIds = Array.from(
      { length: 8 },
      () => `ds-${String(Math.floor(rng() * 1_000_000))}`,
    );
    return {
      avatar,
      draftPoolCopiesByCard: { "1": 2, "2": 1 },
      dreamsignPoolIds: dreamsignPoolIds.map(testDreamsignId),
      mandatoryOnlyPoolSize: 3,
      draftPoolSize: 3,
      doubledCardCount: 1,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
    };
  }
  return {
    resolveAvatarPackage: (avatarId, seed) =>
      packageFor(avatarId, seed),
    startJourney: ({ journey, avatarId, seed }) => {
      const pkg = packageFor(avatarId, seed);
      return {
        ...journey,
        seed: journey.seed,
        ...(isTutorialJourney ? { isTutorialJourney: true } : {}),
        essence: pkg.avatar.startingEssence,
        avatar: {
          id: pkg.avatar.id,
          name: pkg.avatar.name,
          title: pkg.avatar.title,
          renderedText: pkg.avatar.renderedText,
          imageNumber: pkg.avatar.imageNumber,
          startingEssence: pkg.avatar.startingEssence,
        },
        resolvedPackage: pkg,
        remainingDreamsignPool: [...pkg.dreamsignPoolIds],
        atlas: {
          layers: [[parseAtlasNodeId("node-start")]],
          nodes: {
            [parseAtlasNodeId("node-start")]: {
              id: parseAtlasNodeId("node-start"),
              layer: LayerName.One,
              indexInLayer: 0,
              dreamscapeId: testDreamscapeId("dreamscape-start"),
              sites: [],
              position: { x: 0, y: 0 },
              state: "available",
              enhancedSiteType: null,
              forwardIds: [],
              backwardIds: [],
              knownDreamsignId: null,
            },
          },
          startingNodeId: parseAtlasNodeId("node-start"),
          bossNodeId: parseAtlasNodeId("node-start"),
          bossIncarnationId: null,
          currentNodeId: parseAtlasNodeId("node-start"),
          knownDreamsignCarrierIds: [],
        },
        currentDreamscape: parseAtlasNodeId("node-start"),
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
  registerJourneyLifecycleContentProvider(null);
});

// ---------------------------------------------------------------------------
// Essence floor
// ---------------------------------------------------------------------------

describe("essence floor", () => {
  it("ADJUST_ESSENCE allows arbitrary gains and floors losses at zero", () => {
    const start = genesis();
    const up = apply(start, "ADJUST_ESSENCE", { delta: 10_000 });
    expect(up.journey.essence).toBe(start.journey.essence + 10_000);
    const down = apply(up, "ADJUST_ESSENCE", { delta: -10_000 });
    expect(down.journey.essence).toBe(start.journey.essence);
  });

  it("SET_ESSENCE allows arbitrary non-negative values and floors at zero", () => {
    const start = genesis();
    expect(apply(start, "SET_ESSENCE", { value: 10_000 }).journey.essence).toBe(
      10_000,
    );
    expect(apply(start, "SET_ESSENCE", { value: -5 }).journey.essence).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Limits & completion
// ---------------------------------------------------------------------------

describe("limits and completion", () => {
  it("SET_MAX_DREAMSIGNS sets the value", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: 7 }).journey
        .maxDreamsigns,
    ).toBe(7);
  });

  it("SET_MAX_DREAMSIGNS clamps a negative value to 0", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: -5 }).journey
        .maxDreamsigns,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe("navigation", () => {
  it("ENTER_SITE validates and enters a site in the current dreamscape", () => {
    const base = genesis();
    const state = {
      ...base,
      journey: {
        ...withAtlasSite(
          base.journey,
          parseAtlasNodeId("node-1"),
          parseSiteId("site-1"),
        ),
        currentDreamscape: parseAtlasNodeId("node-1"),
        screen: { type: "dreamscape" as const },
      },
    };
    const siteScreen = apply(state, "ENTER_SITE", {
      siteId: parseSiteId("site-1"),
    });
    expect(siteScreen.journey.screen).toEqual({
      type: "site",
      siteId: parseSiteId("site-1"),
    });
    expect(siteScreen.journey.activeSiteId).toBe("site-1");

    expect(
      reduceGameEvent(
        state,
        event("ENTER_SITE", { siteId: parseSiteId("unknown") }),
        ctx(),
      ).outcome,
    ).toBe("bounced");
  });

  it("DISMISS_STARTING_DECK_POPUP flips the flag", () => {
    const state = apply(genesis(), "DISMISS_STARTING_DECK_POPUP", {});
    expect(state.journey.hasSeenStartingDeckPopup).toBe(true);
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
      source: testJourneyMutationSource(source),
    };
  }

  it("decrements dreamscapeModifiers and drops zeroed entries when advancing", () => {
    const base = genesis();
    const state: FoldState = {
      ...base,
      journey: {
        ...base.journey,
        atlas: {
          ...base.journey.atlas,
          currentNodeId: parseAtlasNodeId("node-a"),
          nodes: {
            [parseAtlasNodeId("node-a")]: {
              ...withAtlasSite(
                base.journey,
                parseAtlasNodeId("node-a"),
                parseSiteId("site-a"),
              ).atlas.nodes[parseAtlasNodeId("node-a")],
              forwardIds: [parseAtlasNodeId("node-b")],
            },
            [parseAtlasNodeId("node-b")]: {
              ...withAtlasSite(
                base.journey,
                parseAtlasNodeId("node-b"),
                parseSiteId("site-b"),
              ).atlas.nodes[parseAtlasNodeId("node-b")],
              layer: LayerName.Two,
              backwardIds: [parseAtlasNodeId("node-a")],
            },
          },
        },
        currentDreamscape: parseAtlasNodeId("node-a"),
        screen: { type: "atlas" },
        visitedSites: [parseSiteId("stale-site")],
        dreamscapeModifiers: [modifier(1, "one"), modifier(2, "two")],
      },
    };
    const next = apply(state, "TRAVEL_TO_DREAMSCAPE", {
      nodeId: parseAtlasNodeId("node-b"),
    });
    expect(next.journey.currentDreamscape).toBe("node-b");
    expect(next.journey.visitedSites).toEqual([]);
    expect(next.journey.dreamscapeModifiers).toEqual([modifier(1, "two")]);
    expect(next.journey.screen).toEqual({ type: "dreamscape" });
    expect(next.journey.activeSiteId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// REROLL_AVATAR_OFFER — shared journey-start debug state
// ---------------------------------------------------------------------------

describe("REROLL_AVATAR_OFFER", () => {
  it("increments the persisted reroll count while choosing an Avatar", () => {
    const start = genesis();
    const once = apply(start, "REROLL_AVATAR_OFFER", {});
    const twice = apply(once, "REROLL_AVATAR_OFFER", {});

    expect(once.journey.screen).toEqual({
      type: "journeyStart",
      rerollCount: 1,
    });
    expect(twice.journey.screen).toEqual({
      type: "journeyStart",
      rerollCount: 2,
    });
  });

  it("bounces after the journey has started", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_JOURNEY", {
      avatarId: testAvatarId("dc-1"),
    });
    const out = reduceGameEvent(
      started,
      event("REROLL_AVATAR_OFFER", {}),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(started);
  });

  it("bounces while the tutorial pins the shared offer to one Avatar", () => {
    const start = genesis();
    const tutorial = {
      ...start,
      journey: {
        ...start.journey,
        screen: {
          type: "journeyStart" as const,
          tutorialAvatarId: testAvatarId("tutorial-avatar-id"),
        },
      },
    };

    const out = reduceGameEvent(
      tutorial,
      event("REROLL_AVATAR_OFFER", {}),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(tutorial);
  });
});

// ---------------------------------------------------------------------------
// SELECT_AVATAR — determinism
// ---------------------------------------------------------------------------

describe("SELECT_AVATAR", () => {

  it("derives a byte-identical resolvedPackage for the same seed regardless of ctx", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const a = apply(
      start,
      "SELECT_AVATAR",
      { avatarId: testAvatarId("dc-42") },
      ctx({
        seq: 3,
        timestamp: "2020-01-01T00:00:00.000Z",
        rng: () => 0.1,
      }),
    );
    const b = apply(
      start,
      "SELECT_AVATAR",
      { avatarId: testAvatarId("dc-42") },
      ctx({
        seq: 3,
        timestamp: "2099-12-31T23:59:59.000Z",
        rng: () => 0.9,
      }),
    );
    expect(hashState(a.journey.resolvedPackage)).toBe(
      hashState(b.journey.resolvedPackage),
    );
    expect(a.journey.avatar?.id).toBe(testAvatarId("dc-42"));
    expect(a.journey.remainingDreamsignPool).toEqual(
      a.journey.resolvedPackage?.dreamsignPoolIds,
    );
  });
});

// ---------------------------------------------------------------------------
// START_JOURNEY / RESET_JOURNEY / LOAD_STATE
// ---------------------------------------------------------------------------

describe("START_JOURNEY", () => {

  it("assembles a run and preserves the game seed", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const started = apply(
      start,
      "START_JOURNEY",
      { avatarId: testAvatarId("dc-7") },
      ctx({ seq: 17 }),
    );
    expect(started.journey.seed).toBe(GENESIS.seed);
    expect(started.journey.runId).toBe("journey:17");
    expect(started.journey.avatar?.id).toBe(testAvatarId("dc-7"));
    expect(started.journey.screen).toEqual({ type: "dreamscape" });
  });

  it("bounces START_JOURNEY once an avatar is already selected", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_JOURNEY", {
      avatarId: testAvatarId("dc-7"),
    });
    const out = reduceGameEvent(
      started,
      event("START_JOURNEY", { avatarId: testAvatarId("dc-9") }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });
});

describe("RESET_JOURNEY", () => {
  it("resets journey state to the genesis fold and clears battle", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    let state = apply(genesis(), "START_JOURNEY", {
      avatarId: testAvatarId("dc-7"),
    });
    state = {
      ...state,
      journey: {
        ...state.journey,
        completionLevel: 5,
        essence: state.journey.essence + 50,
      },
    };
    // A battle in progress with no open prompt (an open prompt would be gated
    // by CAS rule 4 before routing — see the seam note in the task report).
    state = {
      ...state,
      battle: {
        board: {},
        effectQueue: [],
        pendingPrompt: null,
      } as unknown as NonNullable<typeof state.battle>,
    };

    const reset = apply(state, "RESET_JOURNEY", {});
    expect(reset.battle).toBeNull();
    expect(reset.journey.runId).toBeNull();
    expect(hashState(reset.journey)).toBe(
      hashState(genesisFoldState(GENESIS).journey),
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

  it("replaces journey state with a valid snapshot and sets a well-formed battle", () => {
    const start = genesis();
    const snapshot: JourneyState = {
      ...start.journey,
      completionLevel: 9,
      essence: 123,
    };
    const loaded = apply(start, "LOAD_STATE", { snapshot }, ctx({ seq: 31 }));
    expect(loaded.journey.runId).toBe("journey:31");
    expect(loaded.journey.completionLevel).toBe(9);
    expect(loaded.journey.essence).toBe(123);
    expect(loaded.battle).toBeNull();

    const withBattle = apply(start, "LOAD_STATE", {
      snapshot,
      battle: emptyBattle,
    });
    expect(withBattle.battle).toEqual({
      ...emptyBattle,
      mode: { kind: "journey" },
      challengeCursor: null,
    });
  });

  it("loads a legacy snapshot without a run id and mints one from the event", () => {
    const start = genesis();
    const { runId: _runId, ...snapshot } = start.journey;

    const loaded = apply(start, "LOAD_STATE", { snapshot }, ctx({ seq: 44 }));

    expect(loaded.journey.runId).toBe("journey:44");
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

  it("bounces a snapshot whose seed differs from the game seed", () => {
    const start = genesis();
    const snapshot: JourneyState = {
      ...start.journey,
      seed: testJourneySeed("some-other-seed"),
    };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", { snapshot }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function withAtlasSite(
  journey: JourneyState,
  nodeId: AtlasNodeId,
  siteId: SiteId,
): JourneyState {
  return {
    ...journey,
    atlas: {
      ...journey.atlas,
      nodes: {
        ...journey.atlas.nodes,
        [nodeId]: {
          id: nodeId,
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: null,
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
