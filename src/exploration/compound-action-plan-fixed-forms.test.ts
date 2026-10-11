import { describe, expect, it } from "vitest";
import {
  explorationCompoundActionPreparationsEqual,
  type ExplorationCompoundActionPreparation,
} from "./compound-action-plan";
import { parseDeckEntryId } from "../types/identifiers";
import { testCardId, testExplorationActionId } from "../types/test-identities";
import {
  card,
  cardsFixture,
  contentFixture,
  entry,
  prepare,
} from "./compound-action-plan-test-fixtures";

describe("Exploration compound action plan", () => {
  it("prepares sorted predicate targets including cards that are already fast without RNG", () => {
    const plan = prepare(
      {
        kind: "predicate-fast-nightmares",
        predicate: "event",
        nightmareCount: 2,
      },
      {
        deck: [
          entry(parseDeckEntryId("z-slow"), 4),
          entry(parseDeckEntryId("a-fast"), 5),
          entry(parseDeckEntryId("character"), 1),
        ],
      },
    );

    expect(plan).toMatchObject({
      kind: "predicate-fast-nightmares",
      nightmareCount: 2,
      selectorSignatures: [],
      selectorTraces: [],
    });
    if (plan.kind === "predicate-fast-nightmares") {
      expect(plan.targets.map(({ entryId }) => entryId)).toEqual([
        "a-fast",
        "z-slow",
      ]);
    }
  });

  it("prepares exactly four distinct catalog fixed-form offers for a later zero-to-four choice", () => {
    const plan = prepare({
      kind: "take-transfigured-nightmares",
      predicate: "event",
      offerCount: 4,
      transfiguration: "Amplified",
      nightmareCount: 2,
    });

    expect(plan.kind).toBe("take-transfigured-nightmares");
    if (plan.kind !== "take-transfigured-nightmares") return;
    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.offeredCards).toHaveLength(4);
    expect(new Set(plan.offeredCards.map(({ cardId }) => cardId)).size).toBe(4);
    expect(
      plan.offeredCards.every(
        ({ transfiguration }) => transfiguration === "Amplified",
      ),
    ).toBe(true);
    expect(plan.selectorTraces[0]?.constraints).toMatchObject({
      cardScope: "catalog",
      fixedTransfiguration: "Amplified",
      allowPerfected: true,
    });
  });

  it("prepares four distinct concrete fixed-form deck entries for purge-transfigure-copy", () => {
    const plan = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      {
        deck: [
          entry(parseDeckEntryId("copy-1"), 1),
          entry(parseDeckEntryId("copy-2"), 1),
          entry(parseDeckEntryId("character-3"), 2),
          entry(parseDeckEntryId("character-4"), 3),
          entry(parseDeckEntryId("character-5"), 2),
        ],
      },
    );

    expect(plan.kind).toBe("purge-transfigure-copy");
    if (plan.kind !== "purge-transfigure-copy") return;
    expect(plan.eligibleCards).toHaveLength(5);
    expect(plan.targets).toHaveLength(4);
    expect(new Set(plan.targets.map(({ entryId }) => entryId)).size).toBe(4);
    expect(
      plan.targets.some(({ entryId }) => entryId.startsWith("copy-")),
    ).toBe(true);
  });

  it("returns exact unavailable reasons for empty predicate and undersized fixed-form pools", () => {
    const noMatches = prepare(
      {
        kind: "predicate-fast-nightmares",
        predicate: "event",
        nightmareCount: 1,
      },
      { deck: [entry(parseDeckEntryId("character"), 1)] },
    );
    const catalog = contentFixture([
      card({ index: 1, cardType: "Event" }),
      card({ index: 2, cardType: "Event" }),
      card({ index: 3, cardType: "Event" }),
    ]);
    const tooFewCatalog = prepare(
      {
        kind: "take-transfigured-nightmares",
        predicate: "event",
        offerCount: 4,
        transfiguration: "Amplified",
        nightmareCount: 1,
      },
      { content: catalog },
    );
    const tooFewDeck = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      {
        deck: [
          entry(parseDeckEntryId("one"), 1),
          entry(parseDeckEntryId("two"), 2),
          entry(parseDeckEntryId("three"), 3),
        ],
      },
    );

    expect(noMatches.unavailableReason).toBe("no-predicate-matches");
    expect(tooFewCatalog.unavailableReason).toBe(
      "insufficient-fixed-form-catalog-cards",
    );
    expect(tooFewDeck.unavailableReason).toBe(
      "insufficient-fixed-form-deck-entries",
    );
  });

  it("rejects malformed authored counts and retained-signature body tampering", () => {
    const invalid = prepare({
      kind: "take-transfigured-nightmares",
      predicate: "event",
      offerCount: 3,
      transfiguration: "Amplified",
      nightmareCount: 1,
    });
    const plan = prepare(
      {
        kind: "predicate-fast-nightmares",
        predicate: "character",
        nightmareCount: 2,
      },
      { deck: [entry(parseDeckEntryId("character"), 1)] },
    );
    if (plan.kind !== "predicate-fast-nightmares") return;
    const tampered: ExplorationCompoundActionPreparation = {
      ...plan,
      targets: [
        {
          entryId: parseDeckEntryId("forged-entry"),
          cardId: plan.targets[0]?.cardId ?? testCardId("missing-card"),
        },
      ],
    };

    expect(invalid.unavailableReason).toBe("invalid-authored-configuration");
    expect(explorationCompoundActionPreparationsEqual(plan, { ...plan })).toBe(
      true,
    );
    expect(explorationCompoundActionPreparationsEqual(tampered, plan)).toBe(
      false,
    );
  });

  it("binds action, encounter, authored fields, content revision, and selector traces", () => {
    const deck = [
      entry(parseDeckEntryId("a"), 1),
      entry(parseDeckEntryId("b"), 2),
      entry(parseDeckEntryId("c"), 3),
      entry(parseDeckEntryId("d"), 2),
    ];
    const base = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck },
    );
    const changedAction = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck, actionId: testExplorationActionId("different-action") },
    );
    const changedEncounter = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck, encounterCardId: testCardId("different-encounter") },
    );
    const changedForm = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Empowered",
      },
      { deck },
    );
    const revisedCards = cardsFixture().map((fixtureCard, index) =>
      index === 0
        ? {
            ...fixtureCard,
            renderedText: `${fixtureCard.renderedText} Revised.`,
          }
        : fixtureCard,
    );
    const revised = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck, content: contentFixture(revisedCards) },
    );

    expect(changedAction.planSignature).not.toBe(base.planSignature);
    expect(changedEncounter.planSignature).not.toBe(base.planSignature);
    expect(changedForm.planSignature).not.toBe(base.planSignature);
    expect(revised.selectionContentRevision).not.toBe(
      base.selectionContentRevision,
    );
    expect(revised.planSignature).not.toBe(base.planSignature);
  });
});
