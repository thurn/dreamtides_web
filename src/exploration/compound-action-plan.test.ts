import { describe, expect, it } from "vitest";
import { testJourneySeed } from "../types/test-identities";
import { parseSiteId } from "../types/identifiers";
import { parseDeckEntryId } from "../types/identifiers";
import { parseCardTypeChangePredicateId } from "../types/identifiers";
import { entry, site, prepare } from "./compound-action-plan-test-fixtures";

describe("Exploration compound action plan", () => {
  it("strictly prepares every nonempty untransfigured entry with an independent uniform positive form", () => {
    const plan = prepare(
      { kind: "all-card-transfiguration" },
      {
        deck: [
          entry(parseDeckEntryId("duplicate-z"), 1),
          entry(parseDeckEntryId("event"), 4),
          entry(parseDeckEntryId("duplicate-a"), 1),
        ],
      },
    );

    expect(plan.kind).toBe("all-card-transfiguration");
    if (plan.kind !== "all-card-transfiguration") return;
    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.allCards.map(({ entryId }) => entryId)).toEqual([
      "duplicate-a",
      "duplicate-z",
      "event",
    ]);
    expect(plan.allCards[0]?.cardId).toBe(plan.allCards[1]?.cardId);
    expect(plan.targets.map(({ entryId }) => entryId)).toEqual([
      "duplicate-a",
      "duplicate-z",
      "event",
    ]);
    expect(plan.selectorSignatures).toHaveLength(3);
    expect(plan.selectorTraces).toHaveLength(3);
  });

  it("is stable under deck reordering while seed and site scope remain signed", () => {
    const deck = [
      entry(parseDeckEntryId("z"), 1),
      entry(parseDeckEntryId("a"), 2),
      entry(parseDeckEntryId("m"), 4),
    ];
    const first = prepare({ kind: "all-card-transfiguration" }, { deck });
    const reordered = prepare(
      { kind: "all-card-transfiguration" },
      { deck: [...deck].reverse() },
    );
    const reseeded = prepare(
      { kind: "all-card-transfiguration" },
      { deck, seed: testJourneySeed("different-seed") },
    );
    const moved = prepare(
      { kind: "all-card-transfiguration" },
      { deck, siteOverride: { ...site, id: parseSiteId("different-site") } },
    );

    expect(reordered).toEqual(first);
    expect(reseeded.planSignature).not.toBe(first.planSignature);
    expect(moved.planSignature).not.toBe(first.planSignature);
  });

  it("distinguishes an empty deck from a deck that fails strict all-card eligibility", () => {
    const empty = prepare({ kind: "all-card-transfiguration" });
    const partial = prepare(
      { kind: "all-card-transfiguration" },
      {
        deck: [
          entry(parseDeckEntryId("eligible"), 1),
          entry(parseDeckEntryId("already-transfigured"), 4, {
            transfiguration: "Amplified",
          }),
        ],
      },
    );

    expect(empty.unavailableReason).toBe("empty-deck");
    expect(partial.unavailableReason).toBe("all-cards-not-transfigurable");
    if (partial.kind === "all-card-transfiguration") {
      expect(partial.targets).toEqual([]);
      expect(partial.allCards).toHaveLength(2);
    }
  });

  it("discloses a purge-misfit target by effective type and signs every fixed-form companion", () => {
    const deck = [
      entry(parseDeckEntryId("starter-event-now-character"), 10, {
        typeChange: {
          predicateId: parseCardTypeChangePredicateId(
            "wave8-effective-type-fixture",
          ),
          cardType: "Character",
          subtype: "Warrior",
          label: "Character",
        },
      }),
      entry(parseDeckEntryId("character-a"), 1),
      entry(parseDeckEntryId("character-b"), 2),
      entry(parseDeckEntryId("event-a"), 4),
      entry(parseDeckEntryId("event-b"), 6),
      entry(parseDeckEntryId("event-c"), 7),
      entry(parseDeckEntryId("event-d"), 8),
      entry(parseDeckEntryId("event-e"), 9),
    ];
    const plan = prepare(
      {
        kind: "purge-disclosed-transfigure-same-type",
        transfiguration: "Kindled",
      },
      { deck },
    );

    expect(plan.kind).toBe("purge-disclosed-transfigure-same-type");
    if (plan.kind !== "purge-disclosed-transfigure-same-type") return;
    expect(
      plan.eligiblePurgeTargets.find(
        ({ entryId }) => entryId === "starter-event-now-character",
      ),
    ).toMatchObject({ effectiveCardType: "Character" });
    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.target).not.toBeNull();
    expect(plan.eligiblePurgeTargets).toContainEqual(plan.target);
    expect(plan.companionTargets.length).toBeGreaterThan(0);
    expect(plan.companionTargets).not.toContainEqual(plan.target);
    expect(
      plan.companionTargets.every(
        ({ transfiguration }) => transfiguration === "Kindled",
      ),
    ).toBe(true);
  });

  it("reports no same-type companion without selecting an unrelated purge target", () => {
    const plan = prepare(
      {
        kind: "purge-disclosed-transfigure-same-type",
        transfiguration: "Kindled",
      },
      {
        deck: [
          entry(parseDeckEntryId("only-character"), 1),
          entry(parseDeckEntryId("event"), 4),
        ],
      },
    );

    expect(plan.unavailableReason).toBe("no-same-type-companion");
    if (plan.kind === "purge-disclosed-transfigure-same-type") {
      expect(plan.target).toBeNull();
      expect(plan.companionTargets).toEqual([]);
    }
  });
});
