// Exploration provider contracts for actions with a player selection, one
// case per plan family: the plan is a function of the journey seed, a
// resolution folds through the reducer once and replays identically, and a
// forged plan, forged intent, or stale journey bounces without mutating the
// journey. Plan selection rules live in the src/exploration/*-plan tests.

import { afterEach, describe, expect, it } from "vitest";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { testCardId } from "../../types/test-identities";
import { parseDeckEntryId } from "../../types/identifiers";
import { makeSite, stateWithSites, SITE_ID } from "../../rules/journey/sites-fixtures";
import { ctx, event } from "../../rules/journey/lifecycle-fixtures";
import { reduceGameEvent } from "../../rules/reducer";
import { registerDeckContentProvider } from "../../rules/journey/deck";
import { registerSiteContentProvider } from "../../rules/journey/sites";
import { clearGameProviders } from "./register-game-providers";
import { buildExplorationRuntime } from "./exploration-provider";
import { createSiteContentProvider } from "./site-provider";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { parseSiteId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import type {
  ExplorationActionOfferRuntime as Offer,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { explorationOfferPlan } from "../../exploration/offer-usability";
import {
  action,
  type Case,
  expectProviderCase,
  forgedPlan,
  journeyPatch,
  NODE_ID,
  offerPatch,
  payload,
  req,
  site,
  SOURCE_CARD_ID,
} from "./exploration-provider.fixtures";

const multiCardSelection = (offer: Offer) => {
  const [a, b] = req(
    explorationOfferPlan(offer, "multi-card-transfiguration"),
  ).eligibleCards;
  const form = req(
    a?.transfigurations.find((f) => b?.transfigurations.includes(f)),
  );
  return {
    entryIds: [req(a).entryId, req(b).entryId],
    transfigurations: [form, form],
  };
};
const dreamsignSelection = (offer: Offer) => ({
  offeredDreamsignId: explorationOfferPlan(offer, "dreamsign")
    ?.preparedDreamsignIds[0],
});
const siteChoice = (offer: Offer) =>
  req(explorationOfferPlan(offer, "site-type-choice")?.choices[1]);
const formOf = (journey: JourneyState, entryId: DeckEntryId) =>
  journey.deck.find((entry) => entry.entryId === entryId)?.transfiguration;

const CASES: Case[] = [
  {
    name: "multi-card transfiguration",
    primary: action("multi-card", {
      effectKind: "transfigure-selected",
      predicate: "character",
      count: 2,
    }),
    select: multiCardSelection,
    effect: (_, after, offer) => {
      const { entryIds, transfigurations } = multiCardSelection(offer);
      expect(entryIds.map((id) => formOf(after, id))).toEqual(transfigurations);
    },
    forgeries: {
      "an unoffered target": (_, offer) => {
        const { entryIds, transfigurations } = multiCardSelection(offer);
        const forged = { entryIds: [entryIds[0], "forged"], transfigurations };
        return { payload: { selection: forged } };
      },
    },
  },
  {
    name: "an offered card",
    primary: action("offered-card", {
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    }),
    select: (offer) => ({ cardIds: offer.offeredCardIds }),
    effect: (before, after) => {
      expect(after.deck).toHaveLength(before.deck.length + 1);
    },
    forgeries: {
      "an unoffered card": payload({
        selection: { cardIds: [SOURCE_CARD_ID] },
      }),
    },
  },
  {
    name: "Nightmares with a Dreamsign",
    primary: action("nightmare-dreamsign", {
      effectKind: "gain-nightmare-and-offered-dreamsign",
      offerCount: 3,
      nightmareCount: 2,
    }),
    select: dreamsignSelection,
    effect: (before, after, offer) => {
      const gained = after.deck.slice(before.deck.length);
      expect(gained.map((entry) => entry.cardNumber)).toEqual([2, 2]);
      expect(after.dreamsigns.map(({ id }) => id)).toEqual([
        dreamsignSelection(offer).offeredDreamsignId,
      ]);
    },
    forgeries: {
      "a stale Dreamsign pool": journeyPatch((journey) => ({
        remainingDreamsignPool: journey.remainingDreamsignPool.slice(1),
      })),
    },
  },
  {
    name: "a chosen site",
    primary: action("choose-site", {
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    }),
    select: (offer) => ({ siteType: siteChoice(offer).siteType }),
    effect: (_, after, offer) => {
      expect(after.atlas.nodes[NODE_ID]?.sites).toEqual([
        site,
        siteChoice(offer).insertedSite,
      ]);
    },
    forgeries: {
      "a forged plan": offerPatch((offer) => ({
        preparation: {
          kind: "site-type-choice",
          plan: {
            ...req(explorationOfferPlan(offer, "site-type-choice")),
            planSignature: forgedPlan,
          },
        },
      })),
      "stale atlas topology": journeyPatch((journey) => {
        const late: SiteState = { ...site, id: parseSiteId("late") };
        const node = makeTestAtlasNode(NODE_ID, [site, late]);
        return { atlas: { ...journey.atlas, nodes: { [NODE_ID]: node } } };
      }),
    },
  },
];

describe("Exploration provider", () => {
  afterEach(clearGameProviders);
  it("records the fresh physical entry for a single replacement and refuses replay", () => {
    const old = makeAuguryTestCard({ id: testCardId("single-old"), cardNumber: 1, cardType: "Character", subtype: "Warrior", energyCost: 1 });
    const replacement = makeAuguryTestCard({ id: testCardId("single-replacement"), cardNumber: 2, cardType: "Character", subtype: "Warrior", energyCost: 3 });
    const primary = action("single-physical-replacement", { effectKind: "replace-selected", predicate: "character", count: 1,
      canonicalMechanicId: "replace-deck-entry", selectionPolicyId: "card-fit-quality" });
    const base = makeAuguryTestContent({ cards: [old, replacement] });
    const content = { ...base, exploration: { ...base.exploration, encounters: [{ cardId: old.id, prose: "Fixture", actions: [primary] }] } };
    let before = stateWithSites([makeSite("Exploration")], { essence: 100, deck: [
      { entryId: parseDeckEntryId("selected"), cardNumber: 1, transfiguration: null, isBane: false },
      { entryId: parseDeckEntryId("retained"), cardNumber: 1, transfiguration: null, isBane: false },
    ] });
    const runtime = req(buildExplorationRuntime(before.journey, makeSite("Exploration"), content, () => 0, old.id) ?? undefined);
    before.journey.siteRuntime[SITE_ID] = runtime;
    const selected = parseDeckEntryId(req(Object.keys(runtime.actionOffers[0].replacementCardIdByEntryId)[0]));
    const preparedId = req(runtime.actionOffers[0]?.replacementCardIdByEntryId[selected]);
    registerSiteContentProvider(createSiteContentProvider(content));
    registerDeckContentProvider({ resolveCardNumber: (id) => [...content.cardDatabase.values()].find((card) => card.id === id)?.cardNumber ?? null, resolveDreamsign: () => null });
    const added = reduceGameEvent(before, event("ADD_CARD", { cardId: preparedId }), ctx());
    expect(added.outcome).toBe("applied"); before = added.state;

    const intent = event("RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId: primary.id,
      selectionRulesVersion: SELECTION_RULES_VERSION, selection: { entryIds: [selected] } });
    const result = reduceGameEvent(before, intent, ctx());
    expect(result.outcome).toBe("applied");
    const fresh = result.state.journey.deck.filter((entry) => !before.journey.deck.some((old) => old.entryId === entry.entryId));
    expect(fresh).toHaveLength(1);
    expect(before.journey.deck.filter((entry) => entry.cardNumber === fresh[0].cardNumber && entry.entryId !== selected)).not.toHaveLength(0);
    expect(result.state.journey.deck.some((entry) => entry.entryId === selected)).toBe(false);
    expect(result.state.journey.deck.some((entry) => entry.entryId !== selected && before.journey.deck.some((old) => old.entryId === entry.entryId))).toBe(true);
    const resolved = result.state.journey.siteRuntime[SITE_ID];
    if (resolved.kind !== "exploration") throw new Error("Missing Exploration runtime");
    expect(resolved.resolution?.gainedCardIds).toEqual([preparedId]);
    expect(resolved.resolution?.gainedEntryIds).toEqual(fresh.map((entry) => entry.entryId));
    expect(content.cardDatabase.get(fresh[0].cardNumber)?.id).toBe(preparedId);
    expect(reduceGameEvent(result.state, intent, ctx()).outcome).toBe("bounced");
    expect(reduceGameEvent(before, intent, ctx()).state).toEqual(result.state);
  });
  it.each(CASES)(
    "prepares $name from the seed, folds it once, and bounces forgeries",
    expectProviderCase,
  );
});
