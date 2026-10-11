// Exploration provider contracts for selection-free actions, one case per
// plan family: the plan is a function of the journey seed, a resolution folds
// through the reducer once and replays identically, and a forged plan, forged
// intent, or stale journey bounces without mutating the journey. Plan
// selection rules live in the src/exploration/*-plan tests.

import { describe, expect, it } from "vitest";
import { parseSelectionRulesVersion } from "../../reward-selection";
import { parseDeckEntryId } from "../../types/identifiers";
import type {
  ExplorationActionOfferRuntime as Offer,
  JourneyState,
} from "../../types/journey";
import { explorationOfferPlan } from "../../exploration/offer-usability";
import {
  action,
  type Case,
  expectProviderCase,
  forgedPlan,
  journeyPatch,
  offerPatch,
  payload,
  req,
  runtimeOf,
  site,
} from "./exploration-provider.fixtures";

const essenceOf = (offer: Offer) =>
  offer.preparation?.kind === "essence" ? offer.preparation : undefined;

const CASES: Case[] = [
  {
    name: "random Essence",
    primary: action("random-essence", {
      effectKind: "gain-random-essence",
      minimumEssence: 50,
      maximumEssence: 150,
    }),
    effect: (before, after, offer) => {
      expect(after.essence - before.essence).toBe(req(essenceOf(offer)).amount);
    },
    forgeries: {
      "a forged amount": offerPatch((offer) => {
        const essence = req(essenceOf(offer));
        return { preparation: { ...essence, amount: essence.amount + 1 } };
      }),
      "an unsupported protocol": payload({
        selectionRulesVersion: parseSelectionRulesVersion("unsupported"),
      }),
      "a missing protocol": payload({ selectionRulesVersion: undefined }),
      "an intent for a selection-free action": payload({
        selection: { cardIds: [] },
      }),
      "an unversioned runtime": (journey) => {
        const { selectionRulesVersion: _, ...runtime } = runtimeOf(journey);
        const siteRuntime = { [site.id]: runtime };
        return { journey: { ...journey, siteRuntime } as JourneyState };
      },
    },
  },
  {
    name: "a free-purchase counter",
    primary: action("free-purchases", {
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 2,
    }),
    effect: (_, after) => {
      expect(after.essence).toBe(50);
      expect(after.shopModifiers.freePurchaseModifiers).toMatchObject([
        { sourceSiteId: site.id, initialCount: 2, remainingCount: 2 },
      ]);
    },
    forgeries: {
      "a field injected into the unsigned offer": offerPatch(() => ({
        preparation: {
          kind: "essence",
          amount: 1,
          plan: {
            minimumEssence: 1,
            maximumEssence: 1,
            purpose: "essence-amount",
            saltParts: [],
            drawsConsumed: 1,
          },
        },
      })),
    },
  },
  {
    name: "bulk transfiguration",
    primary: action("transfigure-all", {
      effectKind: "transfigure-all-for-essence",
      canonicalMechanicId: "transfigure-deck-for-essence",
      essence: 100,
      predicate: "event",
      transfiguration: "Inspired",
    }),
    essence: 150,
    effect: (_, after, offer) => {
      const targets = req(offer.eligibleDeckEntryIds);
      expect(after.essence).toBe(50);
      expect(after.deck.map((e) => targets.includes(e.entryId))).toEqual(
        after.deck.map((e) => e.transfiguration === "Inspired"),
      );
    },
    forgeries: {
      "a forged target": offerPatch((offer) => ({
        eligibleDeckEntryIds: [
          ...req(offer.eligibleDeckEntryIds),
          parseDeckEntryId("entry-1"),
        ],
      })),
      "Essence below the cost": journeyPatch(() => ({ essence: 99 })),
    },
  },
  {
    name: "starter replacement",
    primary: action("starter-replace", {
      effectKind: "purge-random-starter-and-gain-card",
      predicate: "warrior",
    }),
    effect: (before, after, offer) => {
      const purged = req(
        explorationOfferPlan(offer, "starter-card"),
      ).purgedEntryIds;
      expect(after.deck).toHaveLength(before.deck.length);
      expect(after.deck.map(({ entryId }) => entryId)).not.toContain(purged[0]);
    },
    forgeries: {
      "a forged plan": offerPatch((offer) => ({
        preparation: {
          kind: "starter-card",
          plan: {
            ...req(explorationOfferPlan(offer, "starter-card")),
            planSignature: forgedPlan,
          },
        },
      })),
      "a stale target": journeyPatch((journey, offer) => ({
        deck: journey.deck.map((entry) =>
          entry.entryId ===
          explorationOfferPlan(offer, "starter-card")?.purgedEntryIds[0]
            ? { ...entry, cardNumber: 120 }
            : entry,
        ),
      })),
    },
  },
];

describe("Exploration provider", () => {
  it.each(CASES)(
    "prepares $name from the seed, folds it once, and bounces forgeries",
    expectProviderCase,
  );
});
