import { afterEach, describe, expect, it, vi } from "vitest";
import {
  explorationActionUsesOfferedDeckTarget,
  isTransfigurationExplorationEffect,
  loadExplorationContent,
} from "./exploration";
import {
  testCardId,
  testExplorationActionId,
} from "../types/test-identities";

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

function mockContent(content: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(content),
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

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

  it("loads all five contracts and classifies their transfigurations", async () => {
    for (const action of actions) {
      mockContent(fixture(action));
      expect(
        (await loadExplorationContent()).encounters[0].actions[0],
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
  ])("rejects malformed Wave 8 fields %#", async (action) => {
    mockContent(fixture(action));
    await expect(loadExplorationContent()).rejects.toThrow();
  });
});

describe("Exploration starter-card content", () => {
  it("loads the exact fieldless and predicate-bearing variants", async () => {
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

    const loaded = await loadExplorationContent();

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

  it.each([
    [
      {
        effectKind: "purge-starter-card",
        canonicalMechanicId: "purge-deck-entry",
      },
    ],
    [
      {
        effectKind: "replace-all-starter-cards",
        canonicalMechanicId: "purge-deck-entry",
        predicate: "event",
      },
    ],
    [
      {
        effectKind: "purge-starter-card",
        canonicalMechanicId: "purge-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "character",
      },
    ],
    [
      {
        effectKind: "purge-random-starter-card",
        canonicalMechanicId: "purge-deck-entry",
        selectionPolicyId: "uniform",
        count: 1,
      },
    ],
    [
      {
        effectKind: "purge-random-starter-and-gain-card",
        canonicalMechanicId: "replace-deck-entry",
        predicate: "any",
      },
    ],
    [
      {
        effectKind: "replace-all-starter-cards",
        canonicalMechanicId: "replace-deck-entry",
        predicate: "mythic",
      },
    ],
    [
      {
        effectKind: "replace-all-starter-cards",
        canonicalMechanicId: "replace-deck-entry",
        predicate: "event",
        selectionPolicyId: "card-bundle",
      },
    ],
    [
      {
        effectKind: "replace-all-starter-cards",
        canonicalMechanicId: "replace-deck-entry",
        predicate: "event",
        followupTitle: "Synthetic followup",
        followupSubtitle: "Synthetic subtitle",
      },
    ],
  ])("rejects malformed starter-card fields %#", async (action) => {
    mockContent(fixture(action));

    await expect(loadExplorationContent()).rejects.toThrow();
  });

  it("loads automatic random and all-starter transfigurations", async () => {
    const actions = [
      {
        effectKind: "transfigure-random-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        count: 2,
      },
      {
        effectKind: "transfigure-all-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
      },
    ];
    const content = fixture(actions[0]);
    content.encounters[0].action = actions.map((action, index) => ({
      id: testExplorationActionId(
        `synthetic-transfigure-action-${String(index)}`,
      ),
      label: "Synthetic action",
      effectText: "Synthetic effect",
      ...action,
    }));
    mockContent(content);

    const loaded = await loadExplorationContent();
    const loadedActions = loaded.encounters[0].actions;

    expect(
      loadedActions.map((action) => ({
        kind: action.effectKind,
        mechanic: action.canonicalMechanicId,
        policy: action.selectionPolicyId,
        count: action.count,
      })),
    ).toEqual(
      actions.map((action) => ({
        kind: action.effectKind,
        mechanic: action.canonicalMechanicId,
        policy: action.selectionPolicyId,
        count: "count" in action ? action.count : undefined,
      })),
    );
    expect(
      loadedActions.every((action) =>
        isTransfigurationExplorationEffect(action.effectKind),
      ),
    ).toBe(true);
  });

  it.each([
    [
      {
        effectKind: "transfigure-random-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
      },
    ],
    [
      {
        effectKind: "transfigure-random-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        count: 0,
      },
    ],
    [
      {
        effectKind: "transfigure-random-starter-cards",
        canonicalMechanicId: "purge-deck-entry",
        selectionPolicyId: "uniform",
        count: 2,
      },
    ],
    [
      {
        effectKind: "transfigure-random-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        count: 2,
        predicate: "character",
      },
    ],
    [
      {
        effectKind: "transfigure-random-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        count: 2,
        transfiguration: "Inspired",
      },
    ],
    [
      {
        effectKind: "transfigure-all-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        count: 2,
      },
    ],
    [
      {
        effectKind: "transfigure-all-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "card-fit",
      },
    ],
    [
      {
        effectKind: "transfigure-all-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        followupTitle: "Synthetic followup",
        followupSubtitle: "Synthetic subtitle",
      },
    ],
    [
      {
        effectKind: "transfigure-all-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        effectText: "Transfigure {starter_card}",
      },
    ],
    [
      {
        effectKind: "transfigure-all-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        effectText: "Transfigure $DECK_CARD",
      },
    ],
  ])("rejects malformed starter transfiguration fields %#", async (action) => {
    mockContent(fixture(action));

    await expect(loadExplorationContent()).rejects.toThrow();
  });
});

describe("Exploration Wave 7 deck-mutation content", () => {
  it("loads random fixed replacement, disclosed type change, and Legendary gain contracts", async () => {
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

    const loaded = await loadExplorationContent();

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

  it.each([
    {
      effectKind: "replace-random-with-card",
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "event",
      cardId: testCardId("00000000-0000-4000-8000-000000000048"),
      effectText: "Replace a random Event",
    },
    {
      effectKind: "replace-random-with-card",
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "event",
      cardId: testCardId("00000000-0000-4000-8000-000000000048"),
      effectText: "Replace a random Event with {fixed_card}",
      count: 1,
    },
    {
      effectKind: "change-card-type-selected",
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "uniform",
      cardType: "Event",
      deckTarget: "offered",
      effectText: "Change {deck_card} to become {card_type}",
    },
    {
      effectKind: "change-card-type-selected",
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "deck-entry-centrality",
      cardType: "Event",
      deckTarget: "offered",
      effectText: "Change this card to become {card_type}",
    },
  ])("rejects malformed Wave 7 fields %#", async (action) => {
    mockContent(fixture(action));

    await expect(loadExplorationContent()).rejects.toThrow();
  });
});

describe("Exploration fixed-site content", () => {
  it.each([
    "Duplication",
    "Purge",
    "Shop",
    "DreamsignBazaar",
    "Transfiguration",
  ])("loads the closed fixed destination %s", async (siteType) => {
    mockContent(
      fixture({
        effectKind: "add-fixed-site",
        canonicalMechanicId: "add-site",
        selectionPolicyId: "fixed",
        siteType,
      }),
    );

    const loaded = await loadExplorationContent();
    expect(loaded.encounters[0]?.actions[0]).toMatchObject({
      effectKind: "add-fixed-site",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType,
    });
  });

  it.each([
    { siteType: undefined },
    { siteType: "UnknownSite" },
    { siteType: "Shop", canonicalMechanicId: "gain-card" },
    { siteType: "Shop", selectionPolicyId: "site-uniform" },
    {
      siteType: "Shop",
      followupTitle: "Choose",
      followupSubtitle: "A site",
    },
    { siteType: "Shop", count: 1 },
    { siteType: "Shop", effectText: "Add {site_type}" },
  ])("rejects a malformed fixed-site action %#", async (overrides) => {
    mockContent(
      fixture({
        effectKind: "add-fixed-site",
        canonicalMechanicId: "add-site",
        selectionPolicyId: "fixed",
        ...overrides,
      }),
    );

    await expect(loadExplorationContent()).rejects.toThrow();
  });

  it("rejects siteType on template-84 add-site", async () => {
    mockContent(
      fixture({
        effectKind: "add-site",
        canonicalMechanicId: "add-site",
        selectionPolicyId: "site-uniform",
        siteType: "Shop",
      }),
    );

    await expect(loadExplorationContent()).rejects.toThrow();
  });
});

describe("Exploration site-type chooser content", () => {
  it("loads the exact chooser contract", async () => {
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

    const loaded = await loadExplorationContent();
    expect(loaded.encounters[0]?.actions[0]).toMatchObject({
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    });
  });

  it.each([
    { offerCount: undefined },
    { offerCount: 2 },
    { offerCount: 4 },
    { canonicalMechanicId: "gain-card" },
    { selectionPolicyId: "fixed" },
    { followupSubtitle: "" },
    { siteType: "Shop" },
    { count: 1 },
    { effectText: "Choose {site_type}" },
  ])("rejects malformed chooser content %#", async (overrides) => {
    const action = {
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
      followupTitle: "Choose a destination",
      followupSubtitle: "Choose one of the offered destinations",
    };
    Object.assign(action, overrides);
    mockContent(fixture(action));

    await expect(loadExplorationContent()).rejects.toThrow();
  });
});

describe("Exploration shop purchase modifier content", () => {
  it("loads the exact fieldless and counted contracts", async () => {
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

    const loaded = await loadExplorationContent();
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

  it.each([
    {
      effectKind: "free-next-shop",
      canonicalMechanicId: "gain-card",
    },
    {
      effectKind: "free-next-shop",
      canonicalMechanicId: "shop-purchase-modifier",
      selectionPolicyId: "fixed",
    },
    {
      effectKind: "free-next-shop",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 1,
    },
    {
      effectKind: "free-next-shop",
      canonicalMechanicId: "shop-purchase-modifier",
      predicate: "event",
    },
    {
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
    },
    {
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 0,
    },
    {
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 1.5,
    },
    {
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 3,
      siteType: "Shop",
    },
    {
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 3,
      followupTitle: "Choose",
      followupSubtitle: "Choose",
    },
    {
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 3,
      effectText: "Gain {count} free purchases",
    },
  ])("rejects malformed shop purchase modifier content %#", async (action) => {
    mockContent(fixture(action));
    await expect(loadExplorationContent()).rejects.toThrow();
  });
});

describe("Exploration multi-card transfiguration content", () => {
  it("loads chosen, random, and fixed-random variants", async () => {
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

    const loaded = await loadExplorationContent();
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

  it("keeps count-one chosen transfiguration backward compatible", async () => {
    mockContent(
      fixture({
        effectKind: "transfigure-selected",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "transfiguration-value",
        count: 1,
      }),
    );

    await expect(loadExplorationContent()).resolves.toMatchObject({
      encounters: [
        { actions: [{ effectKind: "transfigure-selected", count: 1 }] },
      ],
    });
  });

  it.each([
    [
      {
        effectKind: "transfigure-selected",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "transfiguration-value",
        count: 0,
      },
    ],
    [
      {
        effectKind: "transfigure-selected",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "transfiguration-value",
        count: 2,
      },
    ],
    [
      {
        effectKind: "transfigure-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        count: 2,
      },
    ],
    [
      {
        effectKind: "transfigure-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "card-fit",
        predicate: "event",
        count: 2,
      },
    ],
    [
      {
        effectKind: "transfigure-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
        transfiguration: "Kindled",
      },
    ],
    [
      {
        effectKind: "transfigure-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
        followupTitle: "Choose",
        followupSubtitle: "Choose",
      },
    ],
    [
      {
        effectKind: "transfigure-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
        effectText: "Transfigure {deck_card}",
      },
    ],
    [
      {
        effectKind: "transfigure-fixed-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
      },
    ],
    [
      {
        effectKind: "transfigure-fixed-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
        transfiguration: "Unknown",
      },
    ],
    [
      {
        effectKind: "transfigure-fixed-random-cards",
        canonicalMechanicId: "purge-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
        transfiguration: "Kindled",
      },
    ],
  ])(
    "rejects malformed multi-card transfiguration fields %#",
    async (action) => {
      mockContent(fixture(action));
      await expect(loadExplorationContent()).rejects.toThrow();
    },
  );
});

describe("Exploration counted deck mutation content", () => {
  it("loads legacy and counted replacement and fixed-transfiguration actions", async () => {
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

    const loaded = await loadExplorationContent();
    expect(loaded.encounters[0].actions.map((action) => action.count)).toEqual([
      undefined,
      undefined,
      2,
      2,
    ]);
  });

  it("loads automatic random copy and card-type actions without targets", async () => {
    const actions = [
      {
        effectKind: "copy-random-cards",
        canonicalMechanicId: "duplicate-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
      },
      {
        effectKind: "change-random-card-type",
        canonicalMechanicId: "change-entry-card-type",
        selectionPolicyId: "uniform",
        count: 2,
        cardType: "Event",
        effectText: "Change two random cards into {card_type} cards",
      },
    ];
    const content = fixture(actions[0]);
    content.encounters[0].action = actions.map((action, index) => ({
      id: testExplorationActionId(`automatic-action-${String(index)}`),
      label: "Synthetic action",
      effectText: "Synthetic effect",
      ...action,
    }));
    mockContent(content);

    const loaded = await loadExplorationContent();
    expect(loaded.encounters[0].actions).toEqual([
      expect.objectContaining({
        effectKind: "copy-random-cards",
        predicate: "event",
        count: 2,
      }),
      expect.objectContaining({
        effectKind: "change-random-card-type",
        cardType: "Event",
        count: 2,
      }),
    ]);
  });

  it.each([
    [
      {
        effectKind: "replace-selected",
        canonicalMechanicId: "replace-deck-entry",
        selectionPolicyId: "card-fit-quality",
        predicate: "event",
        count: 0,
      },
    ],
    [
      {
        effectKind: "transfigure-fixed-selected",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "transfiguration-value",
        predicate: "event",
        count: 2,
        transfiguration: "Kindled",
        deckTarget: "offered",
        followupTitle: "Choose",
        followupSubtitle: "Choose",
      },
    ],
    [
      {
        effectKind: "transfigure-fixed-selected",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "transfiguration-value",
        count: 2,
        transfiguration: "Kindled",
        deckTarget: "chosen",
        followupTitle: "Choose",
        followupSubtitle: "Choose",
      },
    ],
    [
      {
        effectKind: "copy-random-cards",
        canonicalMechanicId: "duplicate-deck-entry",
        selectionPolicyId: "uniform",
        count: 2,
      },
    ],
    [
      {
        effectKind: "copy-random-cards",
        canonicalMechanicId: "duplicate-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
        followupTitle: "Choose",
        followupSubtitle: "Choose",
      },
    ],
    [
      {
        effectKind: "copy-random-cards",
        canonicalMechanicId: "duplicate-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "event",
        count: 2,
        effectText: "Copy {deck_card}",
      },
    ],
    [
      {
        effectKind: "change-random-card-type",
        canonicalMechanicId: "change-entry-card-type",
        selectionPolicyId: "uniform",
        count: 2,
        cardType: "Dreamwell",
      },
    ],
    [
      {
        effectKind: "change-random-card-type",
        canonicalMechanicId: "change-entry-card-type",
        selectionPolicyId: "uniform",
        count: 2,
        cardType: "Event",
        predicate: "event",
      },
    ],
    [
      {
        effectKind: "change-random-card-type",
        canonicalMechanicId: "change-entry-card-type",
        selectionPolicyId: "uniform",
        count: 2,
        cardType: "Event",
        effectText: "Change {deck_card}",
      },
    ],
  ])("rejects malformed counted mutation fields %#", async (action) => {
    mockContent(fixture(action));
    await expect(loadExplorationContent()).rejects.toThrow();
  });
});
