import { describe, expect, it } from "vitest";
import type { QuestContent } from "../../data/quest-content";
import type { CardData } from "../../types/cards";
import type { MerchantCorpusCard } from "../../data/merchant-corpus";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { QuestState, SiteState } from "../../types/quest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignProfile,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { MerchantAcceptRequest, MerchantCommitRequest, MerchantOffer } from "../types";
import { generateMerchantEncounter } from "./generateMerchantEncounter";
import {
  applyMerchantPayloadToState,
  resolveMerchantCommit,
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "./resolveMerchantOffer";

function poolCards(count: number): {
  cards: CardData[];
  corpus: Record<string, Partial<MerchantCorpusCard> & { quality: number }>;
} {
  const cards: CardData[] = [];
  const corpus: Record<string, Partial<MerchantCorpusCard> & { quality: number }> = {};
  for (let i = 0; i < count; i += 1) {
    const cardNumber = 1000 + i;
    const id = `aaaa0000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`;
    cards.push(
      makeMerchantTestCard({ id, cardNumber, name: `Pool ${String(cardNumber)}` }),
    );
    corpus[id] = { quality: (i % 20) / 20 + 0.01 * i };
  }
  return { cards, corpus };
}

function dreamsignFixture(count: number) {
  const templates = [];
  const profiles: Record<string, DreamsignProfile> = {};
  for (let i = 0; i < count; i += 1) {
    const id = `dsign-${String(i)}`;
    templates.push(makeMerchantTestDreamsignTemplate({ id, name: `Sign ${String(i)}` }));
    profiles[id] = makeMerchantTestDreamsignProfile({ id });
  }
  return { templates, profiles };
}

function makeFixture(overrides: { seed?: string } = {}): {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({
    id: "site-merchant-resolve",
    type: "DreamJourney",
  });
  const { cards, corpus } = poolCards(30);
  const { templates, profiles } = dreamsignFixture(10);
  const questContent = makeMerchantTestContent({
    cards,
    dreamsignTemplates: templates,
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(Object.entries(profiles)),
  });
  const state = makeMerchantTestQuestState({
    seed: overrides.seed ?? "merchant-resolve-seed",
    currentDreamscape: "dreamscape-a",
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    deck: [1000, 1001, 1002, 1003, 1004, 1005].map((cardNumber, index) =>
      makeMerchantTestDeckEntry({
        entryId: `deck-${String(index + 1)}`,
        cardNumber,
      }),
    ),
    atlas: {
      nodes: {
        "dreamscape-a": {
          id: "dreamscape-a",
          biomeName: "Fixture",
          biomeColor: "#123456",
          sites: [site],
          position: { x: 0, y: 0 },
          status: "available",
          enhancedSiteType: null,
        },
      },
      edges: [],
      startingNodeId: "dreamscape-a",
    },
  });
  return { state, questContent, site };
}

function encounterFor(fixture: {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
}) {
  return generateMerchantEncounter(
    buildMerchantContext({
      questState: fixture.state,
      questContent: fixture.questContent,
      site: fixture.site,
    }),
  );
}

function requestFor(offer: MerchantOffer): MerchantAcceptRequest {
  return {
    encounterSignature: offer.encounterSignature,
    offerId: offer.offerId,
    archetypeId: offer.archetypeId,
  };
}

describe("resolveMerchantOffer", () => {
  it("rejects a stale signature and leaves state untouched", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    const offer = encounter.offers[0];
    const result = resolveMerchantOffer({
      state: fixture.state,
      questContent: fixture.questContent,
      site: fixture.site,
      request: { ...requestFor(offer), encounterSignature: "stale" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("stale_encounter");
    }
    expect(result.state).toBe(fixture.state);
  });

  it("rejects an archetype mismatch without mutation", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    const offer = encounter.offers[0];
    const wrongArchetype =
      offer.archetypeId === "strong_card" ? "dreamsign" : "strong_card";
    const result = resolveMerchantOffer({
      state: fixture.state,
      questContent: fixture.questContent,
      site: fixture.site,
      request: { ...requestFor(offer), archetypeId: wrongArchetype },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("archetype_mismatch");
    }
    expect(result.state).toBe(fixture.state);
  });

  it("applies the payload and completes the site on a valid accept", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    // Accept a direct-payload (non-chooser) offer; choosers are exercised by
    // the per-archetype builder tests. The accepted payload must apply and the
    // site must complete; the observable effect depends on the payload kind.
    const directOffer = encounter.offers.find(
      (offer) => offer.applyPayload !== undefined,
    );
    expect(directOffer).toBeDefined();
    if (directOffer === undefined) return;
    const beforeDeckSize = fixture.state.deck.length;
    const beforeDreamsigns = fixture.state.dreamsigns.length;
    const beforeDeckJson = JSON.stringify(fixture.state.deck);
    const result = resolveMerchantOffer({
      state: fixture.state,
      questContent: fixture.questContent,
      site: fixture.site,
      request: requestFor(directOffer),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.screen).toEqual({ type: "dreamscape" });
    expect(result.state.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
    const kind = directOffer.applyPayload?.kind;
    if (kind === "add_dreamsign") {
      expect(result.state.dreamsigns.length).toBe(beforeDreamsigns + 1);
    } else if (kind === "add_catalog_card") {
      expect(result.state.deck.length).toBeGreaterThan(beforeDeckSize);
    } else {
      // In-place deck modifications (transfigure/keyword/type) keep the deck
      // size but mutate an entry; assert the deck content changed.
      expect(JSON.stringify(result.state.deck)).not.toBe(beforeDeckJson);
    }
  });

  it("declines without mutating deck or dreamsigns and completes the site", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    const result = resolveMerchantDecline({
      state: fixture.state,
      questContent: fixture.questContent,
      site: fixture.site,
      request: {
        encounterSignature: encounter.encounterSignature,
        offerId: encounter.offers[0].offerId,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.deck).toEqual(fixture.state.deck);
    expect(result.state.dreamsigns).toEqual(fixture.state.dreamsigns);
    expect(result.state.screen).toEqual({ type: "dreamscape" });
    expect(result.state.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Commit-then-reveal tests
// ---------------------------------------------------------------------------

/**
 * Build a fixture with enough pool cards (50) + corpus quality signal so that
 * `premium_draft` (hiddenUntilCommit: true) is always eligible. Then sweep
 * seeds until we find one that produces at least one hiddenUntilCommit offer.
 */
function makeHiddenOfferFixture(): {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
  hiddenOffer: MerchantOffer;
  faceUpOffer: MerchantOffer;
} {
  const site = makeMerchantTestSite({
    id: "site-merchant-commit",
    type: "DreamJourney",
  });
  // 50 pool cards: large enough for premium_draft (premiumBandFraction=0.10,
  // bandMinimum=5 → bandSize=max(5,5)=5 >= 4).
  const { cards, corpus } = poolCards(50);
  const { templates, profiles } = dreamsignFixture(10);
  const questContent = makeMerchantTestContent({
    cards,
    dreamsignTemplates: templates,
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(Object.entries(profiles)),
  });

  for (let i = 0; i < 200; i += 1) {
    const seed = `commit-seed-${String(i)}`;
    const state = makeMerchantTestQuestState({
      seed,
      currentDreamscape: "dreamscape-a",
      screen: { type: "site", siteId: site.id },
      activeSiteId: site.id,
      deck: [1000, 1001, 1002, 1003, 1004, 1005].map((cardNumber, index) =>
        makeMerchantTestDeckEntry({
          entryId: `deck-${String(index + 1)}`,
          cardNumber,
        }),
      ),
      atlas: {
        nodes: {
          "dreamscape-a": {
            id: "dreamscape-a",
            biomeName: "Fixture",
            biomeColor: "#123456",
            sites: [site],
            position: { x: 0, y: 0 },
            status: "available",
            enhancedSiteType: null,
          },
        },
        edges: [],
        startingNodeId: "dreamscape-a",
      },
    });
    const context = buildMerchantContext({ questState: state, questContent, site });
    const encounter = generateMerchantEncounter(context);
    const hidden = encounter.offers.find((offer) => offer.hiddenUntilCommit);
    const faceUp = encounter.offers.find((offer) => !offer.hiddenUntilCommit);
    if (hidden !== undefined && faceUp !== undefined) {
      return { state, questContent, site, hiddenOffer: hidden, faceUpOffer: faceUp };
    }
  }

  throw new Error(
    "makeHiddenOfferFixture: no seed produced a hiddenUntilCommit offer in 200 attempts",
  );
}

describe("resolveMerchantCommit", () => {
  it("rejects a stale signature and leaves state identity unchanged", () => {
    const { state, questContent, site, hiddenOffer } = makeHiddenOfferFixture();
    const request: MerchantCommitRequest = {
      encounterSignature: "stale-sig",
      offerId: hiddenOffer.offerId,
      archetypeId: hiddenOffer.archetypeId,
    };
    const result = resolveMerchantCommit({
      state,
      questContent,
      site,
      request,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("stale_encounter");
    }
    // State must be the exact same reference — no partial mutation.
    expect(result.state).toBe(state);
  });

  it("rejects committing an offer that is not hiddenUntilCommit and leaves state identity unchanged", () => {
    const { state, questContent, site, faceUpOffer } = makeHiddenOfferFixture();
    const context = buildMerchantContext({ questState: state, questContent, site });
    const encounter = generateMerchantEncounter(context);
    const request: MerchantCommitRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: faceUpOffer.offerId,
      archetypeId: faceUpOffer.archetypeId,
    };
    const result = resolveMerchantCommit({
      state,
      questContent,
      site,
      request,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_hidden_offer");
    }
    expect(result.state).toBe(state);
  });

  it("records merchantCommittedOfferId in siteRuntime and does NOT complete the site", () => {
    const { state, questContent, site, hiddenOffer } = makeHiddenOfferFixture();
    const context = buildMerchantContext({ questState: state, questContent, site });
    const encounter = generateMerchantEncounter(context);
    const request: MerchantCommitRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: hiddenOffer.offerId,
      archetypeId: hiddenOffer.archetypeId,
    };
    const result = resolveMerchantCommit({
      state,
      questContent,
      site,
      request,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The commit flag is written into siteRuntime.
    const runtime = result.state.siteRuntime[site.id];
    expect(runtime?.kind).toBe("dreamJourney");
    if (runtime?.kind === "dreamJourney") {
      expect(runtime.merchantCommittedOfferId).toBe(hiddenOffer.offerId);
    }
    // The site must NOT be complete yet.
    expect(result.state.screen).not.toEqual({ type: "dreamscape" });
    const siteInAtlas = result.state.atlas.nodes["dreamscape-a"]?.sites[0];
    expect(siteInAtlas?.isVisited).toBe(false);
  });

  it("reload determinism: regenerating after commit yields the same candidate set", () => {
    const { state, questContent, site, hiddenOffer } = makeHiddenOfferFixture();
    const context = buildMerchantContext({ questState: state, questContent, site });
    const encounter1 = generateMerchantEncounter(context);
    const request: MerchantCommitRequest = {
      encounterSignature: encounter1.encounterSignature,
      offerId: hiddenOffer.offerId,
      archetypeId: hiddenOffer.archetypeId,
    };
    const commitResult = resolveMerchantCommit({
      state,
      questContent,
      site,
      request,
    });
    expect(commitResult.ok).toBe(true);
    if (!commitResult.ok) return;

    // Regenerate the encounter from committed state — same candidates.
    const context2 = buildMerchantContext({
      questState: commitResult.state,
      questContent,
      site,
    });
    const encounter2 = generateMerchantEncounter(context2);
    // The targetKey must match (same candidate set).
    const offer1 = encounter1.offers.find((o) => o.offerId === hiddenOffer.offerId);
    const offer2 = encounter2.offers.find((o) => o.offerId === hiddenOffer.offerId);
    expect(offer1).toBeDefined();
    expect(offer2).toBeDefined();
    if (offer1 === undefined || offer2 === undefined) return;
    expect(offer2.targetKey).toBe(offer1.targetKey);
  });
});

describe("resolveMerchantOffer commit-then-reveal rules", () => {
  it("rejects accepting a hiddenUntilCommit offer without a prior commit and leaves state identity unchanged", () => {
    const { state, questContent, site, hiddenOffer } = makeHiddenOfferFixture();
    const context = buildMerchantContext({ questState: state, questContent, site });
    const encounter = generateMerchantEncounter(context);
    // Build a valid choice if the offer requires one.
    const firstCandidate = hiddenOffer.choiceRequest?.candidates[0];
    const request: MerchantAcceptRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: hiddenOffer.offerId,
      archetypeId: hiddenOffer.archetypeId,
      ...(firstCandidate === undefined ? {} : { choice: { choiceId: firstCandidate.choiceId } }),
    };
    const result = resolveMerchantOffer({
      state,
      questContent,
      site,
      request,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("commit_required");
    }
    expect(result.state).toBe(state);
  });

  it("rejects accepting the non-committed offer after a commit and leaves state identity unchanged", () => {
    const { state, questContent, site, hiddenOffer, faceUpOffer } =
      makeHiddenOfferFixture();
    const context = buildMerchantContext({ questState: state, questContent, site });
    const encounter = generateMerchantEncounter(context);

    // First commit to the hidden offer.
    const commitResult = resolveMerchantCommit({
      state,
      questContent,
      site,
      request: {
        encounterSignature: encounter.encounterSignature,
        offerId: hiddenOffer.offerId,
        archetypeId: hiddenOffer.archetypeId,
      },
    });
    expect(commitResult.ok).toBe(true);
    if (!commitResult.ok) return;
    const committedState = commitResult.state;

    // Now try to accept the OTHER (non-committed) offer.
    const faceUpCandidate = faceUpOffer.choiceRequest?.candidates[0];
    const request: MerchantAcceptRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: faceUpOffer.offerId,
      archetypeId: faceUpOffer.archetypeId,
      ...(faceUpCandidate === undefined ? {} : { choice: { choiceId: faceUpCandidate.choiceId } }),
    };
    const result = resolveMerchantOffer({
      state: committedState,
      questContent,
      site,
      request,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("offer_forfeited");
    }
    expect(result.state).toBe(committedState);
  });

  it("accepts the committed offer after a commit and completes the site", () => {
    const { state, questContent, site, hiddenOffer } = makeHiddenOfferFixture();
    const context = buildMerchantContext({ questState: state, questContent, site });
    const encounter = generateMerchantEncounter(context);

    // Commit.
    const commitResult = resolveMerchantCommit({
      state,
      questContent,
      site,
      request: {
        encounterSignature: encounter.encounterSignature,
        offerId: hiddenOffer.offerId,
        archetypeId: hiddenOffer.archetypeId,
      },
    });
    expect(commitResult.ok).toBe(true);
    if (!commitResult.ok) return;
    const committedState = commitResult.state;

    // Now accept the committed offer with a valid choice.
    const firstCandidate = hiddenOffer.choiceRequest?.candidates[0];
    expect(firstCandidate).toBeDefined();
    if (firstCandidate === undefined) return;
    const request: MerchantAcceptRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: hiddenOffer.offerId,
      archetypeId: hiddenOffer.archetypeId,
      choice: { choiceId: firstCandidate.choiceId },
    };
    const result = resolveMerchantOffer({
      state: committedState,
      questContent,
      site,
      request,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.screen).toEqual({ type: "dreamscape" });
    expect(result.state.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
    // The committed flag is cleared after site completion (site runtime is discarded).
    const runtime = result.state.siteRuntime[site.id];
    if (runtime?.kind === "dreamJourney") {
      expect(runtime.merchantCommittedOfferId).toBeUndefined();
    }
  });

  it("rejects decline after commit and leaves committed state identity unchanged", () => {
    const { state, questContent, site, hiddenOffer, faceUpOffer } =
      makeHiddenOfferFixture();
    const context = buildMerchantContext({ questState: state, questContent, site });
    const encounter = generateMerchantEncounter(context);

    // Commit.
    const commitResult = resolveMerchantCommit({
      state,
      questContent,
      site,
      request: {
        encounterSignature: encounter.encounterSignature,
        offerId: hiddenOffer.offerId,
        archetypeId: hiddenOffer.archetypeId,
      },
    });
    expect(commitResult.ok).toBe(true);
    if (!commitResult.ok) return;
    const committedState = commitResult.state;

    // Attempt to decline after commit.
    const result = resolveMerchantDecline({
      state: committedState,
      questContent,
      site,
      request: {
        encounterSignature: encounter.encounterSignature,
        offerId: faceUpOffer.offerId,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("decline_after_commit");
    }
    expect(result.state).toBe(committedState);
  });
});

describe("applyMerchantPayloadToState", () => {
  it("appends a catalog card to the deck", () => {
    const fixture = makeFixture();
    const card = fixture.questContent.cardDatabase.get(1000);
    expect(card).toBeDefined();
    if (card === undefined) return;
    const next = applyMerchantPayloadToState({
      state: fixture.state,
      questContent: fixture.questContent,
      payload: {
        kind: "add_catalog_card",
        cardUuid: card.id,
        cardNumber: card.cardNumber,
      },
    });
    expect(next).not.toBeNull();
    expect(next?.deck.length).toBe(fixture.state.deck.length + 1);
  });

  it("adds a site to the current dreamscape", () => {
    const fixture = makeFixture();
    const next = applyMerchantPayloadToState({
      state: fixture.state,
      questContent: fixture.questContent,
      payload: { kind: "add_site", siteType: "Shop" },
    });
    expect(next).not.toBeNull();
    // The current dreamscape gains one new Site of the requested type.
    const beforeCount =
      fixture.state.atlas.nodes["dreamscape-a"]?.sites.length ?? 0;
    const afterCount = next?.atlas.nodes["dreamscape-a"]?.sites.length ?? 0;
    expect(afterCount).toBe(beforeCount + 1);
    const sites = next?.atlas.nodes["dreamscape-a"]?.sites ?? [];
    const addedSite = sites[sites.length - 1];
    expect(addedSite?.type).toBe("Shop");
    expect(addedSite?.isVisited).toBe(false);
  });
});
