// Exploration provider contracts for actions with a player selection, one
// case per plan family: the plan is a function of the journey seed, a
// resolution folds through the reducer once and replays identically, and a
// forged plan, forged intent, or stale journey bounces without mutating the
// journey. Plan selection rules live in the src/exploration/*-plan tests.

import { describe, expect, it } from "vitest";
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
  it.each(CASES)(
    "prepares $name from the seed, folds it once, and bounces forgeries",
    expectProviderCase,
  );
});
