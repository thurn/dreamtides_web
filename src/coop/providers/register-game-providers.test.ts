// Integration coverage for the REAL content providers behind the five reducer
// seams (Task 25b). Unlike the per-case rules unit tests (which register minimal
// deterministic FAKES) and the synthetic replay fixtures, this suite registers
// the ACTUAL generators via `registerGameProviders(content)` and folds a full
// content-coupled event chain through the canonical game engine config, so the
// previously-bouncing provider-backed events APPLY:
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
// __test-helpers__ (live compiled dreamscape / atlas-config bundles) plus a
// hand-authored card/dreamsign corpus. Site ids and the dreamAvatar id are
// RESOLVED from the folded state / content, never hardcoded, and the assertions
// are over OUTCOMES and HASHES, never TOML content — so a data edit cannot
// break the suite.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Genesis } from "../../eventlog/types";
import type { SeqEvent } from "../../rules/replay/replay";
import { replayLog } from "../../rules/replay/replay";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { DreamAvatarContent, DreamsignTemplate } from "../../types/content";
import type { FoldState } from "../../rules/fold-state";
import type { JourneyState, SiteState, SiteType } from "../../types/journey";
import { asCardId, asCardName } from "../../types/card-identity";
import { STARTER_CARD_NUMBERS } from "../../data/starter-cards";
import {
  loadTestAffiliations,
  loadTestAtlasConfig,
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
    atlasConfig: loadTestAtlasConfig(),
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

    // Phase 2: OPEN each content site, REROLL both shop variants, BEGIN battle.
    const tail: SeqEvent[] = [];
    for (const siteType of CONTENT_SITE_TYPES) {
      seq += 1;
      tail.push(
        ev(seq, "OPEN_SITE", { siteId: siteIdByType.get(siteType) }),
      );
    }
    seq += 1;
    tail.push(
      ev(seq, "REROLL_SHOP", {
        siteId: siteIdByType.get("Shop"),
        essenceCost: 0,
      }),
    );
    seq += 1;
    tail.push(
      ev(seq, "REROLL_SHOP", {
        siteId: siteIdByType.get("DreamsignMarket"),
        essenceCost: 0,
      }),
    );
    seq += 1;
    tail.push(ev(seq, "BEGIN_BATTLE", { siteId: siteIdByType.get("Battle") }));

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
    // The battle slice exists after BEGIN_BATTLE.
    expect(first.finalState.battle).not.toBeNull();
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

/** A DreamAugury merchant fixture: content with a corpus + a journey state whose current dreamscape holds the merchant site. */
function makeMerchantFixture(): {
  journey: JourneyState;
  content: JourneyContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({ id: MERCHANT_SITE_ID, type: "DreamAugury" });

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
          biomeColor: "#123456",
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
    // This corpus's deterministic encounter offers a "duplicate_deck_entry"
    // choice (no direct-payload offer mints a fresh entry here) — resolving
    // one of its candidates exercises the id the resolution path stamps.
    const offer = encounter.offers.find((o) =>
      o.choiceRequest?.candidates.some(
        (candidate) => candidate.applyPayload.kind === "duplicate_deck_entry",
      ),
    );
    expect(offer).toBeDefined();
    if (offer === undefined || offer.choiceRequest === undefined) return;
    const candidate = offer.choiceRequest.candidates.find(
      (c) => c.applyPayload.kind === "duplicate_deck_entry",
    );
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;

    const events: SeqEvent[] = [
      loadState(),
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

    const beforeIds = new Set(fixture.journey.deck.map((entry) => entry.entryId));
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
