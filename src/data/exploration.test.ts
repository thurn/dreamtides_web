import { describe, expect, it } from "vitest";
import { explorationActionUsesOfferedDeckTarget, isTransfigurationExplorationEffect, parseExplorationContent } from "./exploration";
import { testCardId, testExplorationActionId } from "../types/test-identities";
import type { ExplorationActionContent } from "./exploration";
import { derivedExplorationEffectArgumentNames, derivedExplorationEffectText, serializeExplorationPresentationMechanic } from "./exploration-presentation";

describe("exploration", () => {
  const HASH = "0".repeat(64);

  function fixture(action: Record<string, unknown>) {
    return {
      schemaVersion: 2,
      contentHash: HASH,
      foldHash: HASH,
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: testCardId("00000000-0000-4000-8000-000000000001"),
          prose: "Synthetic prose",
          action: [
            {
              id: testExplorationActionId("synthetic-action"),
              label: "Synthetic action",
              effectText: "Synthetic effect",
              ...action,
            },
          ],
        },
      ],
    };
  }

  let mockedContent: unknown;

  function mockContent(content: unknown): void {
    mockedContent = content;
  }

  function loadMockedContent() {
    return parseExplorationContent(mockedContent);
  }

  describe("Exploration Wave 8 compound content", () => {
    const actions: Record<string, unknown>[] = [
      {
        effectKind: "transfigure-all-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
      },
      {
        effectKind: "purge-disclosed-and-transfigure-same-type",
        canonicalMechanicId: "purge-deck-entry",
        selectionPolicyId: "purge-misfit",
        effectText: "Purge {deck_card} and transfigure matching cards",
        transfiguration: "Inspired",
      },
      {
        effectKind: "make-predicate-fast-and-gain-nightmares",
        canonicalMechanicId: "make-deck-fast",
        predicate: "event",
        nightmareCount: 2,
      },
      {
        effectKind: "take-transfigured-cards-and-gain-nightmares",
        canonicalMechanicId: "transfigured-card-chooser",
        selectionPolicyId: "card-fit",
        predicate: "character",
        offerCount: 4,
        transfiguration: "Empowered",
        nightmareCount: 1,
        followupTitle: "Choose rewards",
        followupSubtitle: "Take any number of cards",
      },
      {
        effectKind: "purge-one-transfigure-and-copy-others",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        offerCount: 4,
        transfiguration: "Kindled",
        followupTitle: "Choose one card",
        followupSubtitle: "Purge one of the four cards",
      },
    ];

    it("loads all five contracts and classifies their transfigurations", () => {
      for (const action of actions) {
        mockContent(fixture(action));
        expect(
          loadMockedContent().encounters[0].actions[0],
        ).toMatchObject(action);
      }
      expect(
        actions.map(({ effectKind }) =>
          isTransfigurationExplorationEffect(effectKind as never),
        ),
      ).toEqual([true, true, false, true, true]);
      expect(explorationActionUsesOfferedDeckTarget(actions[1] as never)).toBe(
        true,
      );
      expect(explorationActionUsesOfferedDeckTarget(actions[0] as never)).toBe(
        false,
      );
    });

    it.each([
      { ...actions[0], selectionPolicyId: "fixed" },
      { ...actions[0], count: 1 },
      { ...actions[0], followupTitle: "Choose", followupSubtitle: "Cards" },
      { ...actions[1], transfiguration: undefined },
      { ...actions[1], effectText: "Purge a disclosed card" },
      { ...actions[1], effectText: "Purge {deck_card} then copy {deck_card}" },
      { ...actions[2], nightmareCount: 0 },
      { ...actions[2], selectionPolicyId: "uniform" },
      { ...actions[3], canonicalMechanicId: "gain-card" },
      { ...actions[3], offerCount: 3 },
      { ...actions[3], followupSubtitle: "" },
      { ...actions[4], predicate: "event" },
    ])("rejects malformed Wave 8 fields %#", (action) => {
      mockContent(fixture(action));
      expect(loadMockedContent).toThrow();
    });
  });

  describe("Exploration starter-card content", () => {
    it("loads the exact fieldless and predicate-bearing variants", () => {
      const actions = [
        {
          effectKind: "purge-starter-card",
          canonicalMechanicId: "purge-deck-entry",
          selectionPolicyId: "uniform",
        },
        {
          effectKind: "purge-random-starter-card",
          canonicalMechanicId: "purge-deck-entry",
          selectionPolicyId: "uniform",
        },
        {
          effectKind: "purge-random-starter-and-gain-card",
          canonicalMechanicId: "replace-deck-entry",
          predicate: "character",
        },
        {
          effectKind: "replace-all-starter-cards",
          canonicalMechanicId: "replace-deck-entry",
          predicate: "event",
        },
      ];
      const content = fixture(actions[0]);
      content.encounters[0].action = actions.map((action, index) => ({
        id: testExplorationActionId(`synthetic-action-${String(index)}`),
        label: "Synthetic action",
        effectText: "Synthetic effect",
        ...action,
      }));
      mockContent(content);

      const loaded = loadMockedContent();

      expect(
        loaded.encounters[0].actions.map((action) => ({
          kind: action.effectKind,
          predicate: action.predicate,
        })),
      ).toEqual(
        actions.map((action) => ({
          kind: action.effectKind,
          predicate: action.predicate,
        })),
      );
    });
  });

  describe("Exploration Wave 7 deck-mutation content", () => {
    it("loads random fixed replacement, disclosed type change, and Legendary gain contracts", () => {
      const content = fixture({
        effectKind: "replace-random-with-card",
        canonicalMechanicId: "replace-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        cardId: testCardId("00000000-0000-4000-8000-000000000048"),
        effectText: "Replace a random Event with {fixed_card}",
      });
      (content.encounters[0].action as Array<Record<string, unknown>>).push(
        {
          id: testExplorationActionId("synthetic-action-53"),
          label: "Change the revealed card",
          effectText: "Change {deck_card} to become {card_type}",
          effectKind: "change-card-type-selected",
          canonicalMechanicId: "change-entry-card-type",
          selectionPolicyId: "deck-entry-centrality",
          cardType: "Character",
          deckTarget: "offered",
        },
        {
          id: testExplorationActionId("synthetic-action-72"),
          label: "Gain a legend",
          effectText: "Gain a random Legendary card",
          effectKind: "gain-random-cards",
          canonicalMechanicId: "gain-card",
          selectionPolicyId: "card-bundle",
          predicate: "legendary",
          count: 1,
        },
      );
      mockContent(content);

      const loaded = loadMockedContent();

      expect(loaded.encounters[0].actions).toMatchObject([
        {
          effectKind: "replace-random-with-card",
          predicate: "event",
          cardId: testCardId("00000000-0000-4000-8000-000000000048"),
        },
        {
          effectKind: "change-card-type-selected",
          cardType: "Character",
          deckTarget: "offered",
        },
        {
          effectKind: "gain-random-cards",
          predicate: "legendary",
          count: 1,
        },
      ]);
    });
  });

  describe("Exploration fixed-site content", () => {
    it.each([
      "Duplication",
      "Purge",
      "Shop",
      "DreamsignBazaar",
      "Transfiguration",
    ])("loads the closed fixed destination %s", (siteType) => {
      mockContent(
        fixture({
          effectKind: "add-fixed-site",
          canonicalMechanicId: "add-site",
          selectionPolicyId: "fixed",
          siteType,
        }),
      );

      const loaded = loadMockedContent();
      expect(loaded.encounters[0]?.actions[0]).toMatchObject({
        effectKind: "add-fixed-site",
        canonicalMechanicId: "add-site",
        selectionPolicyId: "fixed",
        siteType,
      });
    });
  });

  describe("Exploration site-type chooser content", () => {
    it("loads the exact chooser contract", () => {
      mockContent(
        fixture({
          effectKind: "choose-site-type",
          canonicalMechanicId: "add-site",
          selectionPolicyId: "site-uniform",
          offerCount: 3,
          followupTitle: "Choose a destination",
          followupSubtitle: "Choose one of the offered destinations",
        }),
      );

      const loaded = loadMockedContent();
      expect(loaded.encounters[0]?.actions[0]).toMatchObject({
        effectKind: "choose-site-type",
        canonicalMechanicId: "add-site",
        selectionPolicyId: "site-uniform",
        offerCount: 3,
      });
    });
  });

  describe("Exploration shop purchase modifier content", () => {
    it("loads the exact fieldless and counted contracts", () => {
      const content = fixture({
        effectKind: "free-next-shop",
        canonicalMechanicId: "shop-purchase-modifier",
      });
      const actionList = content.encounters[0].action as Array<
        Record<string, unknown>
      >;
      actionList.push({
        id: testExplorationActionId("synthetic-counted-shop-modifier"),
        label: "Synthetic action",
        effectText: "Synthetic effect",
        effectKind: "lose-half-essence-and-free-purchases",
        canonicalMechanicId: "shop-purchase-modifier",
        count: 3,
      });
      mockContent(content);

      const loaded = loadMockedContent();
      expect(loaded.encounters[0].actions).toEqual([
        expect.objectContaining({
          effectKind: "free-next-shop",
          canonicalMechanicId: "shop-purchase-modifier",
        }),
        expect.objectContaining({
          effectKind: "lose-half-essence-and-free-purchases",
          canonicalMechanicId: "shop-purchase-modifier",
          count: 3,
        }),
      ]);
      expect(
        loaded.encounters[0].actions.every(
          (action) => action.selectionPolicyId === undefined,
        ),
      ).toBe(true);
      expect(loaded.encounters[0].actions[0]).not.toHaveProperty("count");
    });
  });

  describe("Exploration multi-card transfiguration content", () => {
    it("loads chosen, random, and fixed-random variants", () => {
      const actions = [
        {
          effectKind: "transfigure-selected",
          canonicalMechanicId: "transfigure-deck-entry",
          selectionPolicyId: "transfiguration-value",
          predicate: "event",
          count: 2,
          followupTitle: "Choose cards",
          followupSubtitle: "Choose two Events and a form for each",
        },
        {
          effectKind: "transfigure-random-cards",
          canonicalMechanicId: "transfigure-deck-entry",
          selectionPolicyId: "uniform",
          predicate: "event",
          count: 2,
        },
        {
          effectKind: "transfigure-fixed-random-cards",
          canonicalMechanicId: "transfigure-deck-entry",
          selectionPolicyId: "uniform",
          predicate: "event",
          count: 2,
          transfiguration: "Kindled",
        },
      ];
      const content = fixture(actions[0]);
      content.encounters[0].action = actions.map((action, index) => ({
        id: testExplorationActionId(
          `synthetic-multi-transfigure-${String(index)}`,
        ),
        label: "Synthetic action",
        effectText: "Synthetic effect",
        ...action,
      }));
      mockContent(content);

      const loaded = loadMockedContent();
      expect(
        loaded.encounters[0].actions.map((action) => ({
          kind: action.effectKind,
          policy: action.selectionPolicyId,
          count: action.count,
          transfiguration: action.transfiguration,
        })),
      ).toEqual(
        actions.map((action) => ({
          kind: action.effectKind,
          policy: action.selectionPolicyId,
          count: action.count,
          transfiguration:
            "transfiguration" in action ? action.transfiguration : undefined,
        })),
      );
      expect(
        loaded.encounters[0].actions.every((action) =>
          isTransfigurationExplorationEffect(action.effectKind),
        ),
      ).toBe(true);
    });
  });

  describe("Exploration counted deck mutation content", () => {
    it("loads legacy and counted replacement and fixed-transfiguration actions", () => {
      const actions = [
        {
          effectKind: "replace-selected",
          canonicalMechanicId: "replace-deck-entry",
          selectionPolicyId: "card-fit-quality",
          predicate: "event",
        },
        {
          effectKind: "transfigure-fixed-selected",
          canonicalMechanicId: "transfigure-deck-entry",
          selectionPolicyId: "transfiguration-value",
          transfiguration: "Kindled",
          deckTarget: "chosen",
        },
        {
          effectKind: "replace-selected",
          canonicalMechanicId: "replace-deck-entry",
          selectionPolicyId: "card-fit-quality",
          predicate: "event",
          count: 2,
          followupTitle: "Choose cards",
          followupSubtitle: "Choose up to two Events",
        },
        {
          effectKind: "transfigure-fixed-selected",
          canonicalMechanicId: "transfigure-deck-entry",
          selectionPolicyId: "transfiguration-value",
          predicate: "event",
          count: 2,
          transfiguration: "Kindled",
          deckTarget: "chosen",
          followupTitle: "Choose cards",
          followupSubtitle: "Choose two Events",
        },
      ];
      const content = fixture(actions[0]);
      content.encounters[0].action = actions.map((action, index) => ({
        id: testExplorationActionId(`counted-action-${String(index)}`),
        label: "Synthetic action",
        effectText: "Synthetic effect",
        ...action,
      }));
      mockContent(content);

      const loaded = loadMockedContent();
      expect(loaded.encounters[0].actions.map((action) => action.count)).toEqual([
        undefined,
        undefined,
        2,
        2,
      ]);
    });
  });
});

describe("exploration-presentation", () => {
  function action(
    fields: Partial<ExplorationActionContent>,
  ): ExplorationActionContent {
    return {
      id: "00000000-0000-4000-8000-000000000001" as ExplorationActionContent["id"],
      label: "Synthetic action",
      effectKind: "make-fast-all",
      ...fields,
    };
  }

  describe("code-owned Exploration presentation", () => {
    it("derives static mechanical copy without an authored override", () => {
      expect(derivedExplorationEffectText(action({}), {})).toEqual(expect.any(String));
    });

    it("declares and binds entity arguments for dynamic mechanical copy", () => {
      const dynamic = action({
        effectKind: "gain-card",
        cardId:
          "00000000-0000-4000-8000-000000000002" as ExplorationActionContent["cardId"],
      });
      expect(derivedExplorationEffectArgumentNames(dynamic)).toEqual([
        "fixed_card",
      ]);
      expect(
        derivedExplorationEffectText(dynamic, {
          fixed_card: "Synthetic card",
        }),
      ).toEqual(expect.any(String));
    });

    it("canonicalizes compatibility defaults before selecting presentation", () => {
      const implicit = action({
        effectKind: "replace-selected",
        predicate: "character",
      });
      expect(
        serializeExplorationPresentationMechanic({ ...implicit, count: 1 }),
      ).not.toBe(serializeExplorationPresentationMechanic(implicit));
      expect(
        derivedExplorationEffectText({ ...implicit, count: 1 }, {}),
      ).toEqual(expect.any(String));
    });

    it("binds authored random essence ranges into derived presentation", () => {
      const presentation = derivedExplorationEffectText(
        action({
          effectKind: "gain-random-essence",
          minimumEssence: 25,
          maximumEssence: 75,
        }),
        {},
      );
      expect(presentation).toContain("25");
      expect(presentation).toContain("75");
    });
  });
});
