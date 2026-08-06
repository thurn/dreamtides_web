// Integration coverage for the real content providers behind reducer
// seams (Task 25b). Unlike the per-case rules unit tests (which register minimal
// deterministic FAKES) and the synthetic replay fixtures, this suite registers
// the ACTUAL generators via `registerGameProviders(content)` and folds a full
// content-coupled event chain through the canonical game engine config, so the
// previously-bouncing provider-backed events APPLY:
import { economyFixture } from "../../testing/economy-fixture";
//
//   START_JOURNEY -> SELECT_DREAM_AVATAR -> OPEN_SITE (every content-coupled site
//   type) -> REROLL_SHOP -> BEGIN_BATTLE
//
// Two invariants:
//   (a) each provider-backed event APPLIES (never bounces) once the real
//       providers are registered; and
//   (b) folding the same log twice yields a byte-identical final hash — the
//       determinism rail. A generator that leaked `Math.random` (e.g. the atlas
//       generator, or a site generator not threaded off `ctx.rng`) would make
//       the two folds diverge and fail (b), which is exactly the desync this
//       task exists to prevent.
//
// Data-resilient per AGENTS.md: the JourneyContent is built from the shared
// __test-helpers__ (live compiled dreamscape / atlas-data bundles) plus a
// hand-authored card/dreamsign corpus. Site ids and the dreamAvatar id are
// RESOLVED from the folded state / content, never hardcoded, and the assertions
// are over OUTCOMES and HASHES, never TOML content — so a data edit cannot
// break the suite.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Genesis } from "../../eventlog/types";
import { eventRng } from "../../eventlog/rng";
import type { SeqEvent } from "../../rules/replay/replay";
import { replayLog } from "../../rules/replay/replay";
import { genesisFoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { DreamAvatarContent, DreamsignTemplate } from "../../types/content";
import type { FoldState } from "../../rules/fold-state";
import type { JourneyState, SiteState, SiteType } from "../../types/journey";
import { asCardId, asCardName } from "../../types/card-identity";
import { STARTER_CARD_NUMBERS } from "../../data/starter-cards";
import {
  loadTestAffiliations,
  loadTestAtlasData,
  loadTestDreamGuides,
  loadTestDreamscapes,
} from "../../__test-helpers__/atlas-fixtures";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../../__test-helpers__/pool-context";
import { LayerName } from "../../types/layer-name";
import { buildMerchantContext } from "../../journey_v2/context/buildMerchantContext";
import { generateMerchantEncounter } from "../../journey_v2/encounter/generateMerchantEncounter";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignProfile,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../../journey_v2/testing/fixtures";
import type { MerchantCorpusCard } from "../../data/merchant-corpus";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import {
  clearGameProviders,
  registerGameProviders,
} from "./register-game-providers";
import { createSiteContentProvider } from "./site-provider";

const DREAM_AVATAR_ID = "dream-avatar-real-provider";
const TIMESTAMP = "1970-01-01T00:00:00.000Z";
const GENESIS: Genesis = {
  seed: "real-provider-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null },
};

/** Eight dreamsign templates so the reward / dreamsign / market generators have a live pool. */
function makeDreamsignTemplates(): DreamsignTemplate[] {
  return Array.from({ length: 8 }, (_value, index) => ({
    id: `dreamsign-${String(index)}`,
    name: `Dreamsign ${String(index)}`,
    effectDescription: "A test dreamsign.",
    imageName: "sign",
    imageAlt: "sign",
  }));
}

function makeCard(cardNumber: number, isStarter: boolean): CardData {
  return {
    name: asCardName(`Card ${String(cardNumber)}`),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDreamAvatar(id: string): DreamAvatarContent {
  return {
    id,
    name: `DreamAvatar ${id}`,
    title: "Provider Witness",
    renderedText: "Test ability.",
    imageNumber: "0006",
    startingEssence: 200,
    signatureCards: [],
  };
}

/**
 * A {@link JourneyContent} built from the shared test helpers plus a hand-authored
 * card / dreamsign corpus, exercising the REAL journey-start, atlas, shop, and
 * battle-init generators without any network fetch.
 */
function makeJourneyContent(): JourneyContent {
  const dreamsignTemplates = makeDreamsignTemplates();
  const dreamsignIds = dreamsignTemplates.map((template) => template.id);
  const starterCards = STARTER_CARD_NUMBERS.map((cardNumber) =>
    makeCard(cardNumber, true),
  );
  const corpusCards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    [...starterCards, ...corpusCards].map((card) => [card.cardNumber, card]),
  );
  return {
    cardDatabase,
    dreamAvatars: [makeDreamAvatar(DREAM_AVATAR_ID)],
    dreamwellCards: [],
    dreamsignTemplates,
    dreamscapes: loadTestDreamscapes(),
    affiliations: loadTestAffiliations(),
    guides: loadTestDreamGuides(),
    atlasData: loadTestAtlasData(),
    economyData: economyFixture(),
    poolContext: makeTestPoolContext(dreamsignIds),
  };
}

const CONTENT_SITE_TYPES: SiteType[] = [
  "Reward",
  "DreamsignRevelation",
  "Shop",
  "DreamsignMarket",
  "Transfiguration",
  "Duplication",
  "Gamble",
];

/** A single-actor committed event: basedOnSeq = seq - 1 (empty intervening window). */
function ev(
  seq: number,
  type: string,
  payload: Record<string, unknown>,
): SeqEvent {
  return {
    seq,
    event: {
      type,
      payload,
      actor: "p1",
      clientTimestamp: TIMESTAMP,
      basedOnSeq: seq - 1,
    },
  };
}

/** The current dreamscape node id after START_JOURNEY, or throws. */
function currentNodeId(state: FoldState): string {
  const id = state.journey.currentDreamscape;
  if (id === null) {
    throw new Error("expected a current dreamscape after START_JOURNEY");
  }
  return id;
}

describe("registerGameProviders (real content providers)", () => {
  beforeAll(() => {
    registerGameProviders(makeJourneyContent());
  });
  afterAll(() => {
    clearGameProviders();
  });

  it("folds START_JOURNEY -> SELECT_DREAM_AVATAR -> OPEN_SITE(each type) -> REROLL_SHOP -> BEGIN_BATTLE, all applied, deterministically", () => {
    // Phase 1: start the run and add one site of every content-coupled type
    // (plus a Battle site) to the starting node, so OPEN_SITE / BEGIN_BATTLE
    // have live targets regardless of what the atlas generator rolled.
    const prefix: SeqEvent[] = [
      ev(1, "START_JOURNEY", { dreamAvatarId: DREAM_AVATAR_ID }),
      ev(2, "SELECT_DREAM_AVATAR", { dreamAvatarId: DREAM_AVATAR_ID }),
    ];
    const started = replayLog({ genesis: GENESIS, events: prefix });
    expect(started.outcomes.find((o) => o.seq === 1)?.outcome).toBe("applied");
    expect(started.outcomes.find((o) => o.seq === 2)?.outcome).toBe("applied");
    const nodeId = currentNodeId(started.finalState);

    let seq = 2;
    const addSiteEvents: SeqEvent[] = [];
    for (const siteType of [...CONTENT_SITE_TYPES, "Battle" as SiteType]) {
      seq += 1;
      addSiteEvents.push(ev(seq, "ADD_SITE_TO_DREAMSCAPE", { nodeId, siteType }));
    }

    // Fold the site-additions so we can resolve the minted site ids by type.
    const withSites = replayLog({
      genesis: GENESIS,
      events: [...prefix, ...addSiteEvents],
    });
    for (const added of addSiteEvents) {
      expect(
        withSites.outcomes.find((o) => o.seq === added.seq)?.outcome,
      ).toBe("applied");
    }
    const node = withSites.finalState.journey.atlas.nodes[nodeId];
    const siteIdByType = new Map<SiteType, string>();
    for (const site of node.sites) {
      if (!siteIdByType.has(site.type)) siteIdByType.set(site.type, site.id);
    }
    for (const siteType of CONTENT_SITE_TYPES) {
      expect(siteIdByType.get(siteType)).toBeDefined();
    }

    // Phase 2: enter and complete every non-Battle site, exercising OPEN_SITE
    // for every content-backed type and rerolling both shop variants. The
    // Battle-last rule then permits the terminal battle sequence.
    const tail: SeqEvent[] = [];
    const openedTypes = new Set<SiteType>();
    for (const site of node.sites.filter((candidate) => candidate.type !== "Battle")) {
      seq += 1;
      tail.push(ev(seq, "ENTER_SITE", { siteId: site.id }));
      if (CONTENT_SITE_TYPES.includes(site.type) && !openedTypes.has(site.type)) {
        openedTypes.add(site.type);
        seq += 1;
        tail.push(ev(seq, "OPEN_SITE", { siteId: site.id }));
        if (site.type === "Shop" || site.type === "DreamsignMarket") {
          seq += 1;
          tail.push(ev(seq, "REROLL_SHOP", { siteId: site.id }));
        }
      }
      seq += 1;
      tail.push(ev(seq, "COMPLETE_SITE", { siteId: site.id }));
    }
    const battleSiteId = node.sites.find(
      (site) => site.type === "Battle",
    )?.id;
    expect(battleSiteId).toBeDefined();
    seq += 1;
    tail.push(ev(seq, "ENTER_SITE", { siteId: battleSiteId }));
    seq += 1;
    tail.push(ev(seq, "BEGIN_BATTLE", { siteId: battleSiteId }));
    seq += 1;
    tail.push(
      ev(seq, "BATTLE_COMMAND", {
        command: { id: "SKIP_TO_REWARDS" },
      }),
    );
    seq += 1;
    tail.push(ev(seq, "END_BATTLE", {}));

    const events = [...prefix, ...addSiteEvents, ...tail];
    const first = replayLog({ genesis: GENESIS, events });

    // (a) Every provider-backed event APPLIES (nothing bounces).
    for (const outcome of first.outcomes) {
      expect(
        outcome.outcome,
        `seq ${String(outcome.seq)} bounced${
          outcome.error ? ` (${outcome.error.message})` : ""
        }`,
      ).toBe("applied");
    }
    // The terminal event commits the full journey handoff.
    expect(first.finalState.battle).toBeNull();
    expect(first.finalState.journey.completionLevel).toBe(1);
    expect(first.finalState.journey.screen.type).toBe("atlas");
    const completedNode = first.finalState.journey.atlas.nodes[nodeId];
    expect(completedNode.state).toBe("completed");
    const frontier = completedNode.forwardIds
      .map((id) => first.finalState.journey.atlas.nodes[id])
      .filter((candidate) => candidate?.state === "available");
    expect(frontier.length).toBeGreaterThan(0);
    expect(
      frontier.every((candidate) => candidate.dreamscapeId !== null),
    ).toBe(true);
    const marketSiteId = siteIdByType.get("DreamsignMarket");
    expect(marketSiteId).toBeDefined();
    if (marketSiteId !== undefined) {
      const marketRuntime = first.finalState.journey.siteRuntime[marketSiteId];
      expect(marketRuntime?.kind).toBe("shop");
      if (marketRuntime?.kind === "shop") {
        expect(marketRuntime.slots).toHaveLength(3);
        expect(
          marketRuntime.slots.every((slot) => slot.itemType === "dreamsign"),
        ).toBe(true);
      }
    }
    const gambleSiteId = siteIdByType.get("Gamble");
    expect(gambleSiteId).toBeDefined();
    if (gambleSiteId !== undefined) {
      const gambleRuntime = first.finalState.journey.siteRuntime[gambleSiteId];
      expect(gambleRuntime).toMatchObject({ kind: "gamble" });
      if (gambleRuntime?.kind === "gamble") {
        if (gambleRuntime.gameId === "gravok-three-gate-wager") {
          expect(gambleRuntime.wagerCost).toBe(50);
          expect(gambleRuntime.shuffleCommitment).toMatch(/^[0-9a-f]{16}$/);
          expect(gambleRuntime.dreamsignCandidateIds).toContain(
            gambleRuntime.rewardDreamsign?.id,
          );
          expect(gambleRuntime.rewardDreamsign?.id).toBeDefined();
        } else if (gambleRuntime.gameId === "tidemark-ladder-climb") {
          expect(gambleRuntime.shuffleCommitments).toHaveLength(4);
          expect(gambleRuntime.committedCards).toHaveLength(4);
          expect(gambleRuntime.strongPoolSize).toBeGreaterThan(0);
          expect(gambleRuntime.rewardDreamsign?.id).toBeDefined();
        } else {
          expect(gambleRuntime.shuffleCommitments).toHaveLength(3);
          expect(gambleRuntime.committedCards).toHaveLength(3);
          expect(gambleRuntime.results).toEqual([]);
        }
      }
    }

    // (b) Determinism: folding the identical log again is byte-identical.
    const second = replayLog({ genesis: GENESIS, events });
    expect(second.finalHash).toBe(first.finalHash);
  });

  it("includes the authored Dreamsign in the tutorial's opening Revelation offer", () => {
    const content = makeJourneyContent();
    const started = replayLog({
      genesis: GENESIS,
      events: [
        ev(1, "START_JOURNEY", { dreamAvatarId: DREAM_AVATAR_ID }),
        ev(2, "SELECT_DREAM_AVATAR", { dreamAvatarId: DREAM_AVATAR_ID }),
      ],
    }).finalState.journey;
    const openingNode = started.atlas.nodes[started.atlas.startingNodeId];
    const revelation = openingNode.sites.find(
      (site) => site.type === "DreamsignRevelation",
    );
    expect(revelation).toBeDefined();
    if (revelation === undefined || started.resolvedPackage === null) return;

    const requiredId =
      content.dreamsignTemplates[content.dreamsignTemplates.length - 1]?.id;
    expect(requiredId).toBeDefined();
    if (requiredId === undefined) return;
    const tutorialJourney: JourneyState = {
      ...started,
      isTutorialJourney: true,
      remainingDreamsignPool: content.dreamsignTemplates.map(
        (template) => template.id,
      ),
      resolvedPackage: {
        ...started.resolvedPackage,
        dreamsignPoolIds: content.dreamsignTemplates.map(
          (template) => template.id,
        ),
        openingDreamsignOfferIds: [requiredId],
      },
    };

    const result = createSiteContentProvider(content).openSite({
      journey: tutorialJourney,
      site: revelation,
      rng: () => 0,
    });

    expect(result?.runtime.kind).toBe("dreamsignOffer");
    if (result?.runtime.kind !== "dreamsignOffer") return;
    expect(
      result.runtime.offeredDreamsigns.map((dreamsign) => dreamsign.id),
    ).toContain(requiredId);
  });

  it("consumes the one-use modifier while minting exact transfigured Shop slots", () => {
    const content = makeJourneyContent();
    const started = replayLog({
      genesis: GENESIS,
      events: [
        ev(1, "START_JOURNEY", { dreamAvatarId: DREAM_AVATAR_ID }),
        ev(2, "SELECT_DREAM_AVATAR", { dreamAvatarId: DREAM_AVATAR_ID }),
      ],
    }).finalState.journey;
    const shop: SiteState = {
      id: "transfigured-shop",
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
      data: {},
    };
    const modifier = {
      kind: "transfigure-next-draft-or-shop" as const,
      sourceSiteId: "exploration-site",
      sourceActionId: "exploration-action",
    };

    const result = createSiteContentProvider(content).openSite({
      journey: { ...started, siteOfferModifiers: [modifier] },
      site: shop,
      rng: () => 0,
    });

    expect(result?.siteOfferModifiers).toEqual([]);
    expect(result?.runtime).toMatchObject({
      kind: "shop",
      transfiguredOfferSource: {
        siteId: modifier.sourceSiteId,
        actionId: modifier.sourceActionId,
      },
    });
    if (result?.runtime.kind !== "shop") return;
    const cards = result.runtime.slots.filter(
      (slot) => slot.itemType === "card",
    );
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((slot) => slot.transfiguration !== undefined)).toBe(true);
  });

  it("rebuilds debug progress as one consistent Atlas transition", () => {
    const events = [
      ev(1, "START_JOURNEY", { dreamAvatarId: DREAM_AVATAR_ID }),
      ev(2, "REGENERATE_ATLAS", { completionLevel: 3 }),
    ];
    const result = replayLog({ genesis: GENESIS, events });

    expect(result.outcomes.map((outcome) => outcome.outcome)).toEqual([
      "applied",
      "applied",
    ]);
    expect(result.finalState.journey.completionLevel).toBe(3);
    expect(result.finalState.journey.screen.type).toBe("atlas");
    expect(
      Object.values(result.finalState.journey.atlas.nodes).filter(
        (node) => node.state === "completed",
      ),
    ).toHaveLength(3);
    expect(
      Object.values(result.finalState.journey.atlas.nodes)
        .filter((node) => node.state === "available")
        .every((node) => node.dreamscapeId !== null),
    ).toBe(true);
  });

  it("plays all seven real-content layers through authoritative reducer events", () => {
    let state = genesisFoldState(GENESIS);
    let seq = 1;
    const apply = (
      type: string,
      payload: Record<string, unknown>,
    ): void => {
      const event = {
        type,
        payload,
        actor: "p1",
        clientTimestamp: TIMESTAMP,
        basedOnSeq: seq - 1,
      };
      const result = reduceGameEvent(state, event, {
        seq,
        timestamp: TIMESTAMP,
        rng: eventRng(GENESIS.seed, seq),
        intervening: [],
      });
      expect(
        result.outcome,
        `seq ${String(seq)} ${type} ${
          result.outcome === "bounced" ? result.bounceReason : ""
        }`,
      ).toBe("applied");
      state = result.state;
      seq += 1;
    };

    apply("START_JOURNEY", { dreamAvatarId: DREAM_AVATAR_ID });
    const layerCount = state.journey.atlas.layers.length;
    for (let layer = 0; layer < layerCount; layer += 1) {
      const nodeId = state.journey.currentDreamscape;
      expect(nodeId).not.toBeNull();
      if (nodeId === null) return;
      const node = state.journey.atlas.nodes[nodeId];
      for (const site of node.sites.filter(
        (candidate) => candidate.type !== "Battle",
      )) {
        apply("ENTER_SITE", { siteId: site.id });
        apply("COMPLETE_SITE", { siteId: site.id });
      }
      const battle = node.sites.find((site) => site.type === "Battle");
      expect(battle).toBeDefined();
      if (battle === undefined) return;
      apply("ENTER_SITE", { siteId: battle.id });
      apply("BEGIN_BATTLE", { siteId: battle.id });
      apply("BATTLE_COMMAND", {
        command: { id: "SKIP_TO_REWARDS" },
      });
      apply("END_BATTLE", {});

      expect(state.journey.atlas.nodes[nodeId].state).toBe("completed");
      expect(state.journey.completionLevel).toBe(layer + 1);
      if (layer < layerCount - 1) {
        const nextId = node.forwardIds.find(
          (candidate) =>
            state.journey.atlas.nodes[candidate]?.state === "available",
        );
        expect(nextId).toBeDefined();
        if (nextId === undefined) return;
        expect(state.journey.atlas.nodes[nextId].dreamscapeId).not.toBeNull();
        apply("TRAVEL_TO_DREAMSCAPE", { nodeId: nextId });
      }
    }

    expect(state.battle).toBeNull();
    expect(state.journey.completionLevel).toBe(layerCount);
    expect(state.journey.screen.type).toBe("journeyComplete");
    for (const layer of state.journey.atlas.layers) {
      expect(
        layer.filter(
          (nodeId) => state.journey.atlas.nodes[nodeId].state === "completed",
        ),
      ).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Merchant resolution (ACCEPT_MERCHANT_OFFER / DECLINE_MERCHANT)
// ---------------------------------------------------------------------------

const MERCHANT_SEED = "merchant-real-provider-seed";
// The merchant fixture journey is seeded with MERCHANT_SEED, and the LOAD_STATE
// validator requires the loaded snapshot's seed to equal the room seed, so these
// merchant replays run against a genesis pinned to the same seed.
const MERCHANT_GENESIS: Genesis = { ...GENESIS, seed: MERCHANT_SEED };
const MERCHANT_SITE_ID = "site-merchant-resolve";
const MERCHANT_NODE_ID = "dreamscape-a";

/** An Augury merchant fixture: content with a corpus + a journey state whose current dreamscape holds the merchant site. */
function makeMerchantFixture(): {
  journey: JourneyState;
  content: JourneyContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({ id: MERCHANT_SITE_ID, type: "Augury" });

  const cards: CardData[] = [];
  const corpus: Record<string, Partial<MerchantCorpusCard> & { quality: number }> = {};
  for (let i = 0; i < 30; i += 1) {
    const cardNumber = 1000 + i;
    const id = `aaaa0000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`;
    cards.push(
      makeMerchantTestCard({
        id: asCardId(id),
        cardNumber,
        name: asCardName(`Pool ${String(cardNumber)}`),
      }),
    );
    corpus[id] = { quality: (i % 20) / 20 + 0.01 * i };
  }

  const templates = [];
  const profiles: Record<string, DreamsignProfile> = {};
  for (let i = 0; i < 10; i += 1) {
    const id = `dsign-${String(i)}`;
    templates.push(makeMerchantTestDreamsignTemplate({ id, name: `Sign ${String(i)}` }));
    profiles[id] = makeMerchantTestDreamsignProfile({ id });
  }

  const content = makeMerchantTestContent({
    cards,
    dreamsignTemplates: templates,
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(Object.entries(profiles)),
  });

  const journey = makeMerchantTestJourneyState({
    seed: MERCHANT_SEED,
    currentDreamscape: MERCHANT_NODE_ID,
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    deck: [1000, 1001, 1002, 1003, 1004, 1005].map((cardNumber, index) =>
      makeMerchantTestDeckEntry({ entryId: `deck-${String(index + 1)}`, cardNumber }),
    ),
    atlas: {
      nodes: {
        [MERCHANT_NODE_ID]: {
          id: MERCHANT_NODE_ID,
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: "test_dreamscape",
          biomeName: "Fixture",
          sites: [site],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: MERCHANT_NODE_ID,
      bossNodeId: MERCHANT_NODE_ID,
      currentNodeId: MERCHANT_NODE_ID,
      layers: [],
      knownDreamsignCarrierIds: [],
    },
  });
  return { journey, content, site };
}

describe("createSiteContentProvider — Gamble", () => {
  it("chooses either game randomly unless a game is forced", () => {
    const fixture = makeMerchantFixture();
    const site = makeMerchantTestSite({ id: "gamble-site", type: "Gamble" });
    const farpointSite = makeMerchantTestSite({
      id: "farpoint-gamble-site",
      type: "Gamble",
      isEnhanced: true,
    });
    const journey = {
      ...fixture.journey,
      remainingDreamsignPool: fixture.content.dreamsignTemplates.map(
        (template) => template.id,
      ),
    };
    const provider = createSiteContentProvider(fixture.content);

    const randomThreeGate = provider.openSite({
      journey,
      site,
      rng: () => 0,
    });
    const randomLadderRolls = [0.5, 0];
    const randomLadder = provider.openSite({
      journey,
      site,
      rng: () => randomLadderRolls.shift() ?? 0,
    });
    const randomStarway = provider.openSite({
      journey,
      site,
      rng: () => 0.999,
    });
    const forcedThreeGate = provider.openSite({
      journey,
      site,
      rng: () => 0.999,
      gambleGameId: "gravok-three-gate-wager",
    });
    const forcedLadder = provider.openSite({
      journey,
      site,
      rng: () => 0,
      gambleGameId: "tidemark-ladder-climb",
    });
    const forcedStarway = provider.openSite({
      journey,
      site,
      rng: () => 0,
      gambleGameId: "starway-stairs",
    });
    const farpointThreeGate = provider.openSite({
      journey,
      site: farpointSite,
      rng: () => 0,
      gambleGameId: "gravok-three-gate-wager",
    });
    const farpointStarway = provider.openSite({
      journey,
      site: farpointSite,
      rng: () => 0,
      gambleGameId: "starway-stairs",
    });

    expect(randomThreeGate?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "gravok-three-gate-wager",
    });
    expect(randomLadder?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "tidemark-ladder-climb",
    });
    expect(randomStarway?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "starway-stairs",
      wagerAmount: 30,
    });
    expect(forcedThreeGate?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "gravok-three-gate-wager",
      wagerCost: 50,
    });
    expect(forcedLadder?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "tidemark-ladder-climb",
    });
    expect(forcedStarway?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "starway-stairs",
      wagerAmount: 30,
    });
    expect(farpointThreeGate?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "gravok-three-gate-wager",
      wagerCost: 45,
    });
    expect(farpointStarway?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "starway-stairs",
      wagerAmount: 20,
    });
  });

  it("selects the Ladder Climb reward uniformly from the strongest 50", () => {
    const fixture = makeMerchantFixture();
    const templates = Array.from({ length: 55 }, (_value, index) => {
      const id = `dsign-${String(index).padStart(3, "0")}`;
      return makeMerchantTestDreamsignTemplate({ id, name: `Sign ${String(index)}` });
    });
    const profiles = new Map(
      templates.map((template) => [
        template.id,
        makeMerchantTestDreamsignProfile({ id: template.id }),
      ]),
    );
    const content = makeMerchantTestContent({
      cards: [...fixture.content.cardDatabase.values()],
      dreamsignTemplates: templates,
      dreamsignProfiles: profiles,
    });
    const journey = {
      ...fixture.journey,
      remainingDreamsignPool: templates.map((template) => template.id),
    };

    const result = createSiteContentProvider(content).openSite({
      journey,
      site: makeMerchantTestSite({ id: "gamble-site", type: "Gamble" }),
      rng: () => 0.999,
      gambleGameId: "tidemark-ladder-climb",
    });

    expect(result?.runtime.kind).toBe("gamble");
    if (
      result?.runtime.kind !== "gamble" ||
      result.runtime.gameId !== "tidemark-ladder-climb"
    ) {
      return;
    }
    expect(result.runtime.dreamsignCandidateScores).toHaveLength(55);
    expect(result.runtime.strongPoolSize).toBe(50);
    expect(result.runtime.rewardDreamsign?.id).toBe("dsign-049");
  });

  it("falls back to Three Gates when Ladder Climb cannot prepare a Dreamsign", () => {
    const fixture = makeMerchantFixture();
    const result = createSiteContentProvider(fixture.content).openSite({
      journey: {
        ...fixture.journey,
        remainingDreamsignPool: [],
      },
      site: makeMerchantTestSite({ id: "gamble-site", type: "Gamble" }),
      rng: () => 0,
      gambleGameId: "tidemark-ladder-climb",
    });

    expect(result?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "gravok-three-gate-wager",
      rewardDreamsign: null,
    });
  });
});

describe("registerGameProviders — merchant resolution", () => {
  const fixture = makeMerchantFixture();
  const encounter = generateMerchantEncounter(
    buildMerchantContext({
      journeyState: fixture.journey,
      journeyContent: fixture.content,
      site: fixture.site,
    }),
  );

  beforeAll(() => {
    registerGameProviders(fixture.content);
  });
  afterAll(() => {
    clearGameProviders();
  });

  // LOAD_STATE injects the merchant fixture journey state into the fold; the
  // merchant event then resolves against the same state the encounter was
  // generated from, so the signature matches and the event APPLIES.
  const loadState = (): SeqEvent =>
    ev(1, "LOAD_STATE", { snapshot: fixture.journey });

  it("folds LOAD_STATE -> ACCEPT_MERCHANT_OFFER: applies + deterministic", () => {
    // A direct-payload (non-chooser) offer, exactly as the merchant unit test
    // accepts one.
    const offer = encounter.offers.find((o) => o.applyPayload !== undefined);
    expect(offer).toBeDefined();
    if (offer === undefined) return;

    const events: SeqEvent[] = [
      loadState(),
      ev(2, "ACCEPT_MERCHANT_OFFER", {
        siteId: MERCHANT_SITE_ID,
        encounterSignature: offer.encounterSignature,
        offerId: offer.offerId,
        archetypeId: offer.archetypeId,
      }),
    ];
    const first = replayLog({ genesis: MERCHANT_GENESIS, events });
    expect(
      first.outcomes.find((o) => o.seq === 2)?.outcome,
      first.outcomes.find((o) => o.seq === 2)?.error?.message,
    ).toBe("applied");
    // The merchant site completed and returned to the dreamscape.
    expect(first.finalState.journey.screen).toEqual({ type: "dreamscape" });

    const second = replayLog({ genesis: MERCHANT_GENESIS, events });
    expect(second.finalHash).toBe(first.finalHash);
  });

  it("mints a new deck entry through the shared mintEntryId(deck, seq, index) scheme (P3-8)", () => {
    // An offer whose payload actually mints a fresh deck entry (a card
    // grant), so this exercises the id the resolution path stamps — not
    // just that the resolution applies.
    const mintJourney: JourneyState = {
      ...fixture.journey,
      siteRuntime: {
        ...fixture.journey.siteRuntime,
        [MERCHANT_SITE_ID]: {
          kind: "augury",
          completed: false,
          forcedArchetypeId: "fit_card_draft",
        },
      },
    };
    const mintEncounter = generateMerchantEncounter(
      buildMerchantContext({
        journeyState: mintJourney,
        journeyContent: fixture.content,
        site: fixture.site,
      }),
    );
    const offer = mintEncounter.offers.find((o) =>
      o.choiceRequest?.candidates.some(
        (candidate) => candidate.applyPayload.kind === "add_catalog_card",
      ),
    );
    expect(offer).toBeDefined();
    if (offer === undefined || offer.choiceRequest === undefined) return;
    const candidate = offer.choiceRequest.candidates.find(
      (c) => c.applyPayload.kind === "add_catalog_card",
    );
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;

    const events: SeqEvent[] = [
      ev(1, "LOAD_STATE", { snapshot: mintJourney }),
      ev(2, "ACCEPT_MERCHANT_OFFER", {
        siteId: MERCHANT_SITE_ID,
        encounterSignature: offer.encounterSignature,
        offerId: offer.offerId,
        archetypeId: offer.archetypeId,
        choice: { choiceId: candidate.choiceId },
      }),
    ];
    const result = replayLog({ genesis: MERCHANT_GENESIS, events });
    expect(
      result.outcomes.find((o) => o.seq === 2)?.outcome,
      result.outcomes.find((o) => o.seq === 2)?.error?.message,
    ).toBe("applied");

    const beforeIds = new Set(mintJourney.deck.map((entry) => entry.entryId));
    const newEntries = result.finalState.journey.deck.filter(
      (entry) => !beforeIds.has(entry.entryId),
    );
    expect(newEntries).toHaveLength(1);
    // Minted through mintEntryId(deck, ctx.seq, 0) at the ACCEPT_MERCHANT_OFFER
    // event's own seq (2) — the SAME scheme every other minting case uses, not
    // a second, independently-evolving `deck-<counter>` scheme.
    expect(newEntries[0].entryId).toBe("deck-2-0");
  });

  it("folds LOAD_STATE -> DECLINE_MERCHANT: applies + deterministic", () => {
    const offer = encounter.offers[0];
    expect(offer).toBeDefined();
    const events: SeqEvent[] = [
      loadState(),
      ev(2, "DECLINE_MERCHANT", {
        siteId: MERCHANT_SITE_ID,
        encounterSignature: encounter.encounterSignature,
        offerId: offer.offerId,
      }),
    ];
    const first = replayLog({ genesis: MERCHANT_GENESIS, events });
    expect(
      first.outcomes.find((o) => o.seq === 2)?.outcome,
      first.outcomes.find((o) => o.seq === 2)?.error?.message,
    ).toBe("applied");
    expect(first.finalState.journey.screen).toEqual({ type: "dreamscape" });

    const second = replayLog({ genesis: MERCHANT_GENESIS, events });
    expect(second.finalHash).toBe(first.finalHash);
  });
});
