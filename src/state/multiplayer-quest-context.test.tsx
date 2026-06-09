// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import type { Database } from "firebase/database";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "../data/quest-content";
import type { MultiplayerRoom, RoomSession } from "../multiplayer/room-types";
import type { CardData } from "../types/cards";
import type { DreamcallerContent, DreamsignTemplate } from "../types/content";
import type { CardTypeChange, Dreamsign, QuestState, SiteState } from "../types/quest";
import {
  buildMerchantContext,
  generateMerchantEncounter,
} from "../journey_v2";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../journey_v2/testing/fixtures";
import type {
  MerchantAcceptRequest,
  MerchantApplyPayload,
  MerchantDeclineRequest,
  MerchantOffer,
} from "../journey_v2";
import { makeTestPoolContext } from "../__test-helpers__/pool-context";
import { useQuest, type QuestContextValue } from "./quest-context";
import { createDefaultState } from "./quest-context";
import { MultiplayerQuestProvider } from "./multiplayer-quest-context";
import { createBattleInit } from "../battle/integration/create-battle-init";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../battle/test-support";
import type { SharedBattleState } from "../multiplayer/battle-types";

const roomServiceMocks = vi.hoisted(() => ({
  runRoomTransaction: vi.fn(),
  writeRoomUpdate: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
  resetBattleCompletionBridge: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  logEvent: vi.fn(),
  resetLog: vi.fn(),
}));

vi.mock("../multiplayer/room-service", () => ({
  runRoomTransaction: roomServiceMocks.runRoomTransaction,
  writeRoomUpdate: roomServiceMocks.writeRoomUpdate,
}));

vi.mock("../battle/integration/battle-completion-bridge", () => ({
  resetBattleCompletionBridge: bridgeMocks.resetBattleCompletionBridge,
}));

vi.mock("../logging", () => ({
  logEvent: loggingMocks.logEvent,
  resetLog: loggingMocks.resetLog,
}));

const database = { app: { name: "test-app" } } as Database;
const roots: Root[] = [];
const originalCrypto = globalThis.crypto;

const testDreamcaller: DreamcallerContent = {
  id: "caller-1",
  name: "Mira of Lanterns",
  title: "Keeper of the Threshold Flame",
  renderedText: "First dreamcaller.",
  imageNumber: "0009",
  startingEssence: 235,
  signatureCards: ["Alpha Card 1"],
};

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(element);
  });

  return { container, root };
}

function makeCard(cardNumber: number): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Event",
    subtype: "Test",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDreamsignTemplate(id: string, name: string): DreamsignTemplate {
  return {
    id,
    name,
    effectDescription: `${name} effect.`,
  };
}

function makeDreamsign(id: string, name: string): Dreamsign {
  return {
    id,
    name,
    effectDescription: `${name} effect.`,
    isBane: false,
  };
}

function makeQuestContent(): QuestContent {
  return {
    cardDatabase: new Map([[101, makeCard(101)]]),
    dreamcallers: [testDreamcaller],
    dreamsignTemplates: [
      makeDreamsignTemplate("dreamsign-1", "Dreamsign One"),
      makeDreamsignTemplate("dreamsign-2", "Dreamsign Two"),
      makeDreamsignTemplate("dreamsign-3", "Dreamsign Three"),
    ],
    poolContext: makeTestPoolContext(["dreamsign-1", "dreamsign-2"]),
  };
}

function latestRoomTransactionUpdater():
  | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
  | undefined {
  const calls = roomServiceMocks.runRoomTransaction.mock.calls;
  return calls[calls.length - 1]?.[2] as
    | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
    | undefined;
}

function roomTransactionUpdaterAt(
  index: number,
):
  | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
  | undefined {
  const calls = roomServiceMocks.runRoomTransaction.mock.calls;
  return calls[index]?.[2] as
    | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
    | undefined;
}

function makeSession(
  questState: QuestState | null,
  battleState: SharedBattleState | null = null,
): RoomSession {
  return {
    roomId: "ab12cd",
    clientId: "client-1",
    room: {
      metadata: {
        schemaVersion: 2,
        createdAt: "2026-05-08T12:00:00.000Z",
        updatedAt: "2026-05-08T12:00:00.000Z",
      },
      questState,
      battleState,
      presence: {},
      actionLog: {},
    },
  };
}

function makeFakeBattleState(): SharedBattleState {
  const init = createBattleInit({
    battleEntryKey: "reset-quest-test",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    seedOverride: 1,
  });
  const initial = createInitialBattleState(init);
  return {
    init,
    reducer: {
      mutable: initial,
      history: { past: [], future: [] },
      lastTransition: null,
      commandSerial: 0,
      lastActivityKind: null,
    },
  };
}

function makeNode(
  id: string,
  sites: SiteState[],
  status: "completed" | "available" | "unavailable" = "available",
): QuestState["atlas"]["nodes"][string] {
  return {
    id,
    biomeName: "Candle Mire",
    biomeColor: "#abcdef",
    sites,
    position: { x: 0, y: 0 },
    status,
    enhancedSiteType: null,
  };
}

function makeSite(
  id: string,
  type: SiteState["type"],
  isVisited = false,
): SiteState {
  return {
    id,
    type,
    isEnhanced: false,
    isVisited,
  };
}

const MERCHANT_UUIDS = {
  deckHighEvent: "82000000-0000-4000-8000-000000000001",
  deckHighCharacter: "82000000-0000-4000-8000-000000000002",
  deckFillerA: "82000000-0000-4000-8000-000000000003",
  deckFillerB: "82000000-0000-4000-8000-000000000004",
  deckFillerC: "82000000-0000-4000-8000-000000000005",
  deckFillerD: "82000000-0000-4000-8000-000000000006",
  drawA: "82000000-0000-4000-8000-000000000101",
  drawB: "82000000-0000-4000-8000-000000000102",
  drawC: "82000000-0000-4000-8000-000000000103",
  recursionA: "82000000-0000-4000-8000-000000000201",
  recursionB: "82000000-0000-4000-8000-000000000202",
  interactionA: "82000000-0000-4000-8000-000000000301",
  interactionB: "82000000-0000-4000-8000-000000000302",
  earlyA: "82000000-0000-4000-8000-000000000401",
  earlyB: "82000000-0000-4000-8000-000000000402",
} as const;

function makeMerchantCard(
  id: string,
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return makeMerchantTestCard({
    id,
    cardNumber,
    name: `Merchant Fixture ${String(cardNumber)}`,
    cardType: "Character",
    energyCost: 2,
    spark: 1,
    renderedText: "",
    ...overrides,
  });
}

function merchantFixtureCards(): CardData[] {
  return [
    makeMerchantCard(MERCHANT_UUIDS.deckHighEvent, 1, {
      cardType: "Event",
      energyCost: 5,
      spark: null,
      renderedText: "Fast.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.deckHighCharacter, 2, {
      energyCost: 5,
      spark: 4,
    }),
    makeMerchantCard(MERCHANT_UUIDS.deckFillerA, 3, { energyCost: 4 }),
    makeMerchantCard(MERCHANT_UUIDS.deckFillerB, 4, { energyCost: 4 }),
    makeMerchantCard(MERCHANT_UUIDS.deckFillerC, 5, { energyCost: 3 }),
    makeMerchantCard(MERCHANT_UUIDS.deckFillerD, 6, { energyCost: 3 }),
    makeMerchantCard(MERCHANT_UUIDS.drawA, 101, {
      renderedText: "Draw a card.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.drawB, 102, {
      renderedText: "Draw two cards.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.drawC, 103, {
      renderedText: "When this enters, draw a card.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.recursionA, 201, {
      renderedText: "Reclaim 1.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.recursionB, 202, {
      renderedText: "Return a card from your void to your hand.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.interactionA, 301, {
      renderedText: "Banish an enemy.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.interactionB, 302, {
      renderedText: "Prevent the next damage.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.earlyA, 401, { energyCost: 1 }),
    makeMerchantCard(MERCHANT_UUIDS.earlyB, 402, { energyCost: 1 }),
  ];
}

function makeMerchantProviderFixture(): {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({
    id: "site-merchant-provider",
    type: "DreamJourney",
  });
  const state = makeMerchantTestQuestState({
    seed: "merchant-provider-seed",
    essence: 240,
    essenceCap: 360,
    currentDreamscape: "dreamscape-a",
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    deck: [1, 2, 3, 4, 5, 6].map((cardNumber, index) =>
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
  const cards = merchantFixtureCards();
  const corpus: Record<string, { quality: number }> = {};
  for (const [index, card] of cards.entries()) {
    corpus[card.id] = { quality: 0.1 + (index % 10) / 10 };
  }
  const questContent = makeMerchantTestContent({
    cards,
    dreamsignTemplates: [
      makeMerchantTestDreamsignTemplate({ id: "sign-a", name: "Sign A" }),
      makeMerchantTestDreamsignTemplate({ id: "sign-b", name: "Sign B" }),
    ],
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(),
  });
  return { state, questContent, site };
}

function merchantEncounterFor(fixture: {
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

function merchantAcceptRequestFor(offer: MerchantOffer): MerchantAcceptRequest {
  return {
    encounterSignature: offer.encounterSignature,
    offerId: offer.offerId,
    archetypeId: offer.archetypeId,
  };
}

function merchantDeclineRequestFor(offer: MerchantOffer): MerchantDeclineRequest {
  return {
    encounterSignature: offer.encounterSignature,
    offerId: offer.offerId,
  };
}

function requireMerchantOffer(
  offers: readonly MerchantOffer[],
  predicate: (offer: MerchantOffer) => boolean,
): MerchantOffer {
  const offer = offers.find(predicate);
  if (offer === undefined) throw new Error("Expected merchant offer");
  return offer;
}

function merchantPayloadApplied(
  before: QuestState,
  after: QuestState,
  payload: MerchantApplyPayload,
): boolean {
  switch (payload.kind) {
    case "add_catalog_card":
      return after.deck.some((entry) => entry.cardNumber === payload.cardNumber);
    case "add_dreamsign":
      return after.dreamsigns.some((dreamsign) => dreamsign.id === payload.dreamsignId);
    case "transfigure_deck_entry":
      return after.deck.some(
        (entry) =>
          entry.entryId === payload.entryId &&
          entry.transfiguration === payload.transfiguration,
      );
    case "duplicate_deck_entry":
      return after.deck.length === before.deck.length + 1;
    case "remove_deck_entry":
      return after.deck.every((entry) => entry.entryId !== payload.entryId);
    case "change_deck_entry_keywords":
      return after.deck.some(
        (entry) =>
          entry.entryId === payload.entryId &&
          entry.keywordModification !== before.deck.find(
            (oldEntry) => oldEntry.entryId === payload.entryId,
          )?.keywordModification,
      );
    case "change_deck_entry_type":
      return after.deck.some(
        (entry) =>
          entry.entryId === payload.entryId && entry.typeChange === payload.typeChange,
      );
    case "add_site":
      return true;
    case "composite":
      return payload.children.some((child) =>
        merchantPayloadApplied(before, after, child),
      );
  }
}

function Probe() {
  const quest = useQuest();

  return (
    <button
      type="button"
      onClick={() => {
        quest.mutations.changeEssence(25, "test");
      }}
    >
      {quest.state.essence}
    </button>
  );
}

function CaptureQuest({
  onQuest,
}: {
  onQuest: (quest: QuestContextValue) => void;
}) {
  const quest = useQuest();
  onQuest(quest);

  return <span>{quest.state.essence}</span>;
}

describe("MultiplayerQuestProvider", () => {
  let actionIdCounter = 0;
  let randomUUIDMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    roomServiceMocks.writeRoomUpdate.mockResolvedValue(undefined);
    roomServiceMocks.runRoomTransaction.mockResolvedValue(undefined);
    actionIdCounter = 0;
    randomUUIDMock = vi.fn(() => {
      actionIdCounter += 1;
      return `action-${String(actionIdCounter)}`;
    });
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID: randomUUIDMock,
      },
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = "";
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
    vi.clearAllMocks();
  });

  it("provides subscribed quest state from the room session", () => {
    const questState = { ...createDefaultState(), essence: 300 };
    const { container } = mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession(questState)}
        questContent={makeQuestContent()}
      >
        <Probe />
      </MultiplayerQuestProvider>,
    );

    expect(container.textContent).toBe("300");
  });

  it("changes essence in a transaction", () => {
    const questState = { ...createDefaultState(), essence: 300 };
    const { container } = mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession(questState)}
        questContent={makeQuestContent()}
      >
        <Probe />
      </MultiplayerQuestProvider>,
    );

    act(() => {
      container.querySelector("button")?.click();
    });

    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledTimes(1);
    const nextRoom = latestRoomTransactionUpdater()?.(makeSession(questState).room);
    expect(nextRoom?.questState?.essence).toBe(325);
  });

  it("replaces a dreamsign from the transaction snapshot", () => {
    const captured: QuestContextValue[] = [];
    const replacement = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      dreamsigns: [
        makeDreamsign("provider-held-0", "Provider Held 0"),
        makeDreamsign("provider-held-1", "Provider Held 1"),
      ],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.addDreamsign(
      replacement,
      "test",
      1,
    );
    const updater = latestRoomTransactionUpdater();
    const transactionDreamsigns = [
      makeDreamsign("transaction-held-0", "Transaction Held 0"),
      makeDreamsign("transaction-held-1", "Transaction Held 1"),
      makeDreamsign("transaction-held-2", "Transaction Held 2"),
    ];
    const transactionRoom: MultiplayerRoom = {
      ...session.room,
      questState: {
        ...questState,
        dreamsigns: transactionDreamsigns,
      },
    };
    const roomWithoutPurgeIndex: MultiplayerRoom = {
      ...transactionRoom,
      questState: {
        ...questState,
        dreamsigns: [transactionDreamsigns[0]],
      },
    };

    const nextRoom = updater?.(transactionRoom);

    expect(nextRoom?.questState?.dreamsigns).toEqual([
      transactionDreamsigns[0],
      replacement,
      transactionDreamsigns[2],
    ]);
    expect(nextRoom?.metadata.updatedAt).not.toBe(
      transactionRoom.metadata.updatedAt,
    );
    expect(nextRoom?.actionLog).toBe(transactionRoom.actionLog);
    expect(updater?.(roomWithoutPurgeIndex)).toBe(roomWithoutPurgeIndex);
  });

  it("composes sequential multiplayer essence deltas against committed state", () => {
    const captured: QuestContextValue[] = [];
    const questState = {
      ...createDefaultState(),
      essence: 300,
      essenceCap: 500,
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.changeEssence(
      -50,
      "dream_journey:pay_essence",
    );
    captured[captured.length - 1]?.mutations.changeEssence(
      30,
      "dream_journey:gain_essence",
    );

    const afterCost = roomTransactionUpdaterAt(0)?.(session.room);
    const afterReward = roomTransactionUpdaterAt(1)?.(
      afterCost as MultiplayerRoom,
    );

    expect(afterCost?.questState?.essence).toBe(250);
    expect(afterReward?.questState?.essence).toBe(280);
  });

  it("writes hasSeenStartingDeckPopup=true when dismissStartingDeckPopup fires", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      hasSeenStartingDeckPopup: false,
    };
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession(questState)}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.dismissStartingDeckPopup();

    expect(roomServiceMocks.writeRoomUpdate).toHaveBeenCalledTimes(1);
    expect(roomServiceMocks.writeRoomUpdate).toHaveBeenCalledWith(
      database,
      "ab12cd",
      expect.objectContaining({
        "rooms/ab12cd/questState/hasSeenStartingDeckPopup": true,
      }),
    );
  });

  it("does not double-write when dismissStartingDeckPopup fires after the popup is already dismissed", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      hasSeenStartingDeckPopup: true,
    };
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession(questState)}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.dismissStartingDeckPopup();
    captured[captured.length - 1]?.mutations.dismissStartingDeckPopup();

    expect(roomServiceMocks.writeRoomUpdate).not.toHaveBeenCalled();
  });

  it("throws for unsupported mutations without writing to Firebase", () => {
    const captured: QuestContextValue[] = [];
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession(createDefaultState())}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    expect(() => {
      captured[captured.length - 1]?.mutations.removeCard("deck-1", "test");
    }).toThrow(
      "removeCard is not available in multiplayer until its composed Firebase action is implemented",
    );
    expect(roomServiceMocks.writeRoomUpdate).not.toHaveBeenCalled();
  });

  it("keeps mutation identity stable across subscribed state snapshots", () => {
    const questContent = makeQuestContent();
    const captured: QuestContextValue[] = [];
    const { container, root } = mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession({ ...createDefaultState(), essence: 300 })}
        questContent={questContent}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );
    const initialMutations = captured[captured.length - 1]?.mutations;

    act(() => {
      root.render(
        <MultiplayerQuestProvider
          database={database}
          session={makeSession({ ...createDefaultState(), essence: 350 })}
          questContent={questContent}
        >
          <CaptureQuest onQuest={(quest) => captured.push(quest)} />
        </MultiplayerQuestProvider>,
      );
    });

    expect(container.textContent).toBe("350");
    expect(captured[captured.length - 1]?.mutations).toBe(initialMutations);
  });

  it("handles rejected Firebase writes", async () => {
    const error = new Error("write failed");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    roomServiceMocks.writeRoomUpdate.mockRejectedValueOnce(error);
    const captured: QuestContextValue[] = [];
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession({ ...createDefaultState(), essence: 300 })}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    act(() => {
      captured[captured.length - 1]?.mutations.dismissStartingDeckPopup();
    });
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to write multiplayer quest update",
      error,
    );

    consoleErrorSpy.mockRestore();
  });

  it("resets local runtime state when resetting the quest", () => {
    const captured: QuestContextValue[] = [];
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession({ ...createDefaultState(), essence: 300 })}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.resetQuest();

    expect(loggingMocks.resetLog).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.resetBattleCompletionBridge).toHaveBeenCalledTimes(1);
    expect(roomServiceMocks.writeRoomUpdate).toHaveBeenCalledWith(
      database,
      "ab12cd",
      expect.objectContaining({
        "rooms/ab12cd/questState": createDefaultState(),
        "rooms/ab12cd/battleState": null,
      }),
    );
  });

  it("clears battleState when resetting a quest mid-battle", () => {
    const captured: QuestContextValue[] = [];
    const battleState = makeFakeBattleState();
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession(
          { ...createDefaultState(), essence: 300 },
          battleState,
        )}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.resetQuest();

    const calls = roomServiceMocks.writeRoomUpdate.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe(database);
    expect(lastCall?.[1]).toBe("ab12cd");
    const updateMap = lastCall?.[2] as Record<string, unknown>;
    expect(updateMap["rooms/ab12cd/questState"]).toEqual(createDefaultState());
    expect(updateMap["rooms/ab12cd/battleState"]).toBeNull();
    expect(updateMap["rooms/ab12cd/metadata/updatedAt"]).toEqual(
      expect.any(String),
    );
  });

  it("starts a quest through a room transaction", () => {
    const captured: QuestContextValue[] = [];
    const session = makeSession(createDefaultState());
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.startQuest(testDreamcaller);

    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledTimes(1);
    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledWith(
      database,
      "ab12cd",
      expect.any(Function),
    );

    const updater = roomServiceMocks.runRoomTransaction.mock.calls[0]?.[2] as
      | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
      | undefined;
    const nextRoom = updater?.(session.room);
    const retryRoom = updater?.(session.room);

    expect(nextRoom?.questState?.dreamcaller?.id).toBe(testDreamcaller.id);
    expect(nextRoom?.questState?.dreamcaller?.startingEssence).toBe(
      testDreamcaller.startingEssence,
    );
    expect(nextRoom?.questState?.essence).toBe(testDreamcaller.startingEssence);
    expect(nextRoom?.questState?.draftState).toEqual(expect.any(Object));
    expect(nextRoom?.questState?.atlas).toEqual(expect.any(Object));
    expect(nextRoom?.metadata.updatedAt).toEqual(expect.any(String));
    expect(nextRoom?.metadata.updatedAt).not.toBe("2026-05-08T12:00:00.000Z");
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "startQuest",
      source: "quest_start",
      summary: {
        dreamcallerId: testDreamcaller.id,
        dreamcallerName: testDreamcaller.name,
      },
    });
    expect(retryRoom?.metadata.updatedAt).toBe(nextRoom?.metadata.updatedAt);
    expect(retryRoom?.actionLog).toEqual(nextRoom?.actionLog);
    // `randomUUID` is consumed twice in `startQuest`: once for the action-log
    // entry id and once for the per-quest seed. Both are minted outside the
    // RTDB transaction updater so retries do not re-mint either value, which
    // is what `retryRoom`'s identical `actionLog` and seed verify.
    expect(randomUUIDMock).toHaveBeenCalledTimes(2);
    expect(nextRoom?.questState?.seed).toBe(retryRoom?.questState?.seed);
  });

  it("picks a draft card through a room transaction", () => {
    const captured: QuestContextValue[] = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const cardDatabase = new Map<number, CardData>(
      [101, 102, 103, 104, 201, 202, 203, 204].map((cardNumber) => [
        cardNumber,
        makeCard(cardNumber),
      ]),
    );
    const questContent = {
      ...makeQuestContent(),
      cardDatabase,
    };
    const questState: QuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "pool",
        draftPoolCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        remainingCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: "site-1",
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={questContent}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.pickDraftCard("site-1", 101);
    const randomCallsAfterPrepare = randomSpy.mock.calls.length;

    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledTimes(1);
    expect(randomCallsAfterPrepare).toBeGreaterThan(0);

    const updater = roomServiceMocks.runRoomTransaction.mock.calls[0]?.[2] as
      | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
      | undefined;
    const nextRoom = updater?.(session.room);
    const nextRoomFromRetry = updater?.(session.room);

    expect(nextRoom?.questState?.deck).toEqual([
      {
        entryId: "deck-1",
        cardNumber: 101,
        transfiguration: null,
        isBane: false,
      },
    ]);
    expect(nextRoom?.questState?.draftState?.pickNumber).toBe(2);
    expect(nextRoom?.questState?.draftState?.sitePicksCompleted).toBe(1);
    expect(nextRoom?.questState?.draftState?.currentOffer).not.toEqual([
      101, 102, 103, 104,
    ]);
    expect(nextRoomFromRetry).toEqual(nextRoom);
    expect(randomSpy).toHaveBeenCalledTimes(randomCallsAfterPrepare);
    expect(loggingMocks.logEvent).not.toHaveBeenCalled();
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
    expect(nextRoom?.metadata.updatedAt).toEqual(expect.any(String));
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "pickDraftCard",
      source: "draft_pick",
      summary: { siteId: "site-1", cardNumber: 101 },
    });
    randomSpy.mockRestore();
  });

  it("rejects a stale draft pick without appending a pick action", () => {
    const captured: QuestContextValue[] = [];
    const cardDatabase = new Map<number, CardData>(
      [101, 102, 103, 104, 201, 202, 203, 204].map((cardNumber) => [
        cardNumber,
        makeCard(cardNumber),
      ]),
    );
    const questContent = {
      ...makeQuestContent(),
      cardDatabase,
    };
    const questState: QuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "pool",
        draftPoolCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        remainingCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: "site-1",
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={questContent}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.pickDraftCard("site-1", 101);

    const updater = roomServiceMocks.runRoomTransaction.mock.calls[0]?.[2] as
      | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
      | undefined;
    const staleRoom: MultiplayerRoom = {
      ...session.room,
      questState: {
        ...questState,
        draftState: {
          ...questState.draftState!,
          currentOffer: [102, 103, 104, 201],
          pickNumber: 2,
        },
      },
      actionLog: {},
    };
    const nextRoom = updater?.(staleRoom);

    expect(nextRoom).toBe(staleRoom);
    expect(nextRoom?.actionLog).toEqual({});
    expect(loggingMocks.logEvent).not.toHaveBeenCalled();
  });

  it("prepares dreamsign reveal candidates outside the transaction updater", () => {
    const captured: QuestContextValue[] = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const questState: QuestState = {
      ...createDefaultState(),
      remainingDreamsignPool: ["dreamsign-1", "dreamsign-2"],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.ensureDreamsignOfferRuntime(
      "site-1",
      2,
    );
    const randomCallsAfterPrepare = randomSpy.mock.calls.length;
    const updater = latestRoomTransactionUpdater();
    const nextRoom = updater?.(session.room);
    const nextRoomFromRetry = updater?.(session.room);

    expect(nextRoom).toEqual(nextRoomFromRetry);
    expect(randomSpy).toHaveBeenCalledTimes(randomCallsAfterPrepare);
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
    const runtime = nextRoom?.questState?.siteRuntime["site-1"];
    expect(runtime?.kind).toBe("dreamsignOffer");
    expect(
      runtime?.kind === "dreamsignOffer"
        ? runtime.offeredDreamsigns.map((dreamsign) => dreamsign.id).sort()
        : [],
    ).toEqual(["dreamsign-1", "dreamsign-2"]);
    expect(runtime).toEqual(
      expect.objectContaining({
        kind: "dreamsignOffer",
        remainingDreamsignPool: [],
        accepted: false,
      }),
    );
    expect(nextRoom?.questState?.remainingDreamsignPool).toEqual([]);
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "ensureDreamsignOfferRuntime",
      source: "site_reveal",
      summary: {
        siteId: "site-1",
        optionCount: 2,
        offeredCount: 2,
      },
    });

    randomSpy.mockRestore();
  });

  it("prepares essence reveal candidates outside the transaction updater", () => {
    const captured: QuestContextValue[] = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const questState = createDefaultState();
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.ensureEssenceSiteRuntime(
      "site-1",
      true,
    );
    const randomCallsAfterPrepare = randomSpy.mock.calls.length;
    const updater = latestRoomTransactionUpdater();
    const nextRoom = updater?.(session.room);
    const nextRoomFromRetry = updater?.(session.room);

    expect(nextRoom).toEqual(nextRoomFromRetry);
    expect(randomSpy).toHaveBeenCalledTimes(randomCallsAfterPrepare);
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
    expect(nextRoom?.questState?.siteRuntime["site-1"]).toEqual({
      kind: "essence",
      amount: 400,
      accepted: false,
    });
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "ensureEssenceSiteRuntime",
      source: "site_reveal",
      summary: {
        siteId: "site-1",
        amount: 400,
        isEnhanced: true,
      },
    });

    randomSpy.mockRestore();
  });

  it("buys a shared shop card slot atomically and skips duplicate purchases", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 125,
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 50,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);
    const updater = latestRoomTransactionUpdater();
    const nextRoom = updater?.(session.room);

    expect(nextRoom?.questState?.essence).toBe(75);
    expect(nextRoom?.questState?.deck).toEqual([
      {
        entryId: "deck-1",
        cardNumber: 101,
        transfiguration: null,
        isBane: false,
      },
    ]);
    expect(nextRoom?.questState?.siteRuntime["site-1"]).toEqual({
      kind: "shop",
      slots: [
        {
          itemType: "card",
          cardNumber: 101,
          basePrice: 100,
          discountPercent: 50,
          purchased: true,
        },
      ],
      rerollCount: 0,
      remainingDreamsignPoolIds: [],
    });
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "buyShopSlot",
      source: "shop_purchase",
      summary: {
        siteId: "site-1",
        slotIndex: 0,
        itemType: "card",
        basePrice: 100,
        discountedPrice: 50,
        currency: "essence",
        cardNumber: 101,
      },
    });
    expect(updater?.(nextRoom ?? null)).toBe(nextRoom);
  });

  it("charges shared shop card slots with the permanent essence discount applied", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 125,
      shopModifiers: {
        freeRerolls: 0,
        upcomingOmenDiscounts: 0,
        essenceDiscountPercent: 50,
      },
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 30,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    expect(nextRoom?.questState?.essence).toBe(105);
    expect(nextRoom?.actionLog?.["action-1"]?.summary).toMatchObject({
      itemType: "card",
      basePrice: 100,
      discountedPrice: 20,
      currency: "essence",
      cardNumber: 101,
    });
  });

  it("rejects stale shared shop purchases after the slot changes", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 250,
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    const committedRoom: MultiplayerRoom = {
      ...session.room,
      questState: {
        ...questState,
        siteRuntime: {
          "site-1": {
            kind: "shop",
            slots: [
              {
                itemType: "card",
                cardNumber: 102,
                basePrice: 100,
                discountPercent: 0,
                purchased: false,
              },
            ],
            rerollCount: 1,
            remainingDreamsignPoolIds: [],
          },
        },
      },
    };
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={{
          ...makeQuestContent(),
          cardDatabase: new Map([
            [101, makeCard(101)],
            [102, makeCard(102)],
          ]),
        }}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);

    expect(latestRoomTransactionUpdater()?.(committedRoom)).toBe(committedRoom);
    expect(committedRoom.actionLog).toEqual({});
  });

  it("rejects unaffordable shared shop purchases", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 25,
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects shared shop purchases after the site is visited", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 250,
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    const visitedRoom: MultiplayerRoom = {
      ...session.room,
      questState: {
        ...questState,
        visitedSites: ["site-1"],
      },
    };
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);

    expect(latestRoomTransactionUpdater()?.(visitedRoom)).toBe(visitedRoom);
  });

  it("buys a free shared shop card slot without changing essence", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 0,
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 0,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    expect(nextRoom?.questState?.essence).toBe(0);
    expect(nextRoom?.questState?.deck).toEqual([
      {
        entryId: "deck-1",
        cardNumber: 101,
        transfiguration: null,
        isBane: false,
      },
    ]);
  });

  it("buys a shared shop Dreamsign slot with omens", () => {
    const captured: QuestContextValue[] = [];
    const dreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 250,
      omens: 5,
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "dreamsign",
              dreamsign,
              basePrice: 2,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    // Dreamsigns are paid for in omens; essence is untouched.
    expect(nextRoom?.questState?.essence).toBe(250);
    expect(nextRoom?.questState?.omens).toBe(3);
    expect(nextRoom?.questState?.dreamsigns).toEqual([dreamsign]);
    expect(nextRoom?.questState?.siteRuntime["site-1"]).toEqual({
      kind: "shop",
      slots: [
        {
          itemType: "dreamsign",
          dreamsign,
          basePrice: 2,
          discountPercent: 0,
          purchased: true,
        },
      ],
      rerollCount: 0,
      remainingDreamsignPoolIds: [],
    });
  });

  it("spends one upcoming omen discount on a shared Dreamsign shop purchase", () => {
    const captured: QuestContextValue[] = [];
    const dreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 250,
      omens: 2,
      shopModifiers: {
        freeRerolls: 0,
        upcomingOmenDiscounts: 1,
        essenceDiscountPercent: 0,
      },
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "dreamsign",
              dreamsign,
              basePrice: 2,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    expect(nextRoom?.questState?.omens).toBe(1);
    expect(nextRoom?.questState?.shopModifiers.upcomingOmenDiscounts).toBe(0);
    expect(nextRoom?.questState?.dreamsigns).toEqual([dreamsign]);
    expect(nextRoom?.actionLog?.["action-1"]?.summary).toMatchObject({
      itemType: "dreamsign",
      basePrice: 2,
      discountedPrice: 1,
      currency: "omens",
      omenDiscountApplied: true,
      upcomingOmenDiscountsRemaining: 0,
    });
  });

  it("keeps upcoming omen discounts after a free shared Dreamsign shop purchase", () => {
    const captured: QuestContextValue[] = [];
    const dreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      omens: 0,
      shopModifiers: {
        freeRerolls: 0,
        upcomingOmenDiscounts: 1,
        essenceDiscountPercent: 0,
      },
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "dreamsign",
              dreamsign,
              basePrice: 0,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    expect(nextRoom?.questState?.omens).toBe(0);
    expect(nextRoom?.questState?.shopModifiers.upcomingOmenDiscounts).toBe(1);
    expect(nextRoom?.questState?.dreamsigns).toEqual([dreamsign]);
    expect(nextRoom?.actionLog?.["action-1"]?.summary).toMatchObject({
      itemType: "dreamsign",
      basePrice: 0,
      discountedPrice: 0,
      currency: "omens",
      omenDiscountApplied: false,
      upcomingOmenDiscountsRemaining: 1,
    });
  });

  it("rejects shared shop Dreamsign purchases at capacity", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 250,
      dreamsigns: Array.from({ length: 12 }, (_, index) =>
        makeDreamsign(`held-${String(index)}`, `Held ${String(index)}`),
      ),
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "dreamsign",
              dreamsign: makeDreamsign("dreamsign-1", "Dreamsign One"),
              basePrice: 150,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.buyShopSlot("site-1", 0);

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rerolls shared shop slots while preserving purchased slots", () => {
    const captured: QuestContextValue[] = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const site: SiteState = {
      id: "site-1",
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    };
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 200,
      omens: 3,
      remainingDreamsignPool: [],
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 0,
              purchased: true,
            },
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    const questContent = {
      ...makeQuestContent(),
      cardDatabase: new Map([
        [101, makeCard(101)],
        [102, makeCard(102)],
        [103, makeCard(103)],
      ]),
    };
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={questContent}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.rerollShop(site);
    const updater = latestRoomTransactionUpdater();
    const nextRoom = updater?.(session.room);
    const runtime = nextRoom?.questState?.siteRuntime["site-1"];

    // Reroll costs 1 omen exactly once and advances rerollCount so the
    // affordance disables for the rest of the visit. Essence is untouched.
    expect(nextRoom?.questState?.essence).toBe(200);
    expect(nextRoom?.questState?.omens).toBe(2);
    expect(runtime?.kind).toBe("shop");
    expect(runtime?.kind === "shop" ? runtime.rerollCount : null).toBe(1);
    // Purchased slots are preserved verbatim.
    expect(runtime?.kind === "shop" ? runtime.slots[0] : null).toEqual({
      itemType: "card",
      cardNumber: 101,
      basePrice: 100,
      discountPercent: 0,
      purchased: true,
    });
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "rerollShop",
      source: "shop_reroll",
      summary: {
        siteId: "site-1",
        rerollCost: 1,
        rerollCount: 1,
        freeReroll: false,
      },
    });

    randomSpy.mockRestore();
  });

  it("rejects a second reroll within the same shop visit", () => {
    const captured: QuestContextValue[] = [];
    const site: SiteState = {
      id: "site-1",
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    };
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 200,
      remainingDreamsignPool: [],
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 0,
              purchased: false,
            },
          ],
          // Reroll already used this visit.
          rerollCount: 1,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.rerollShop(site);

    // A second reroll attempt within the same visit is a no-op: no
    // transaction is scheduled, so the updater queue is empty.
    expect(latestRoomTransactionUpdater()).toBeUndefined();
  });

  it("rejects shared shop rerolls after the site is visited", () => {
    const captured: QuestContextValue[] = [];
    const site: SiteState = {
      id: "site-1",
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    };
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 200,
      omens: 3,
      remainingDreamsignPool: [],
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    const visitedRoom: MultiplayerRoom = {
      ...session.room,
      questState: {
        ...questState,
        visitedSites: ["site-1"],
      },
    };
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.rerollShop(site);

    expect(latestRoomTransactionUpdater()?.(visitedRoom)).toBe(visitedRoom);
  });

  it("skips reveal candidates for existing runtime or stale committed pool", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      remainingDreamsignPool: ["dreamsign-1", "dreamsign-2"],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.ensureDreamsignOfferRuntime(
      "site-1",
      2,
    );
    const updater = latestRoomTransactionUpdater();
    const roomWithRuntime: MultiplayerRoom = {
      ...session.room,
      questState: {
        ...questState,
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [makeDreamsign("dreamsign-1", "Dreamsign One")],
            remainingDreamsignPool: ["dreamsign-2"],
            accepted: false,
          },
        },
      },
    };
    const stalePoolRoom: MultiplayerRoom = {
      ...session.room,
      questState: {
        ...questState,
        remainingDreamsignPool: ["dreamsign-2"],
      },
    };

    expect(updater?.(roomWithRuntime)).toBe(roomWithRuntime);
    expect(updater?.(stalePoolRoom)).toBe(stalePoolRoom);
  });

  it("accepts a full-capacity dreamsign offer with purge atomically", () => {
    const captured: QuestContextValue[] = [];
    const selectedDreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      dreamsigns: Array.from({ length: 12 }, (_, index) =>
        makeDreamsign(`held-${String(index)}`, `Held ${String(index)}`),
      ),
      siteRuntime: {
        "site-1": {
          kind: "dreamsignOffer",
          offeredDreamsigns: [selectedDreamsign],
          remainingDreamsignPool: [],
          accepted: false,
        },
      },
      atlas: {
        nodes: {
          "node-1": {
            id: "node-1",
            biomeName: "Candle Mire",
            biomeColor: "#abcdef",
            sites: [
              {
                id: "site-1",
                type: "DreamsignOffering",
                isEnhanced: false,
                isVisited: false,
              },
            ],
            position: { x: 0, y: 0 },
            status: "available",
            enhancedSiteType: null,
          },
        },
        edges: [],
        startingNodeId: "node-1",
      },
      screen: { type: "site", siteId: "site-1" },
      activeSiteId: "site-1",
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptDreamsignOffer(
      "site-1",
      selectedDreamsign,
      0,
    );
    const updater = latestRoomTransactionUpdater();
    const nextRoom = updater?.(session.room);

    expect(nextRoom?.questState?.dreamsigns).toHaveLength(12);
    expect(nextRoom?.questState?.dreamsigns[0]).toEqual(selectedDreamsign);
    expect(nextRoom?.questState?.dreamsigns[1]).toEqual(
      makeDreamsign("held-1", "Held 1"),
    );
    expect(nextRoom?.questState?.siteRuntime["site-1"]).toEqual({
      kind: "dreamsignOffer",
      offeredDreamsigns: [selectedDreamsign],
      remainingDreamsignPool: [],
      accepted: true,
    });
    expect(nextRoom?.questState?.visitedSites).toEqual(["site-1"]);
    expect(nextRoom?.questState?.screen).toEqual({ type: "dreamscape" });
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "acceptDreamsignOffer",
      source: "site_reveal",
      summary: {
        siteId: "site-1",
        dreamsignId: "dreamsign-1",
        dreamsignName: "Dreamsign One",
        purgedDreamsignName: "Held 0",
      },
    });
  });

  it("rejecting a dreamsign offer completes the site with no reward", () => {
    const captured: QuestContextValue[] = [];
    const offeredDreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 200,
      siteRuntime: {
        "site-1": {
          kind: "dreamsignOffer",
          offeredDreamsigns: [offeredDreamsign],
          remainingDreamsignPool: [],
          accepted: false,
        },
      },
      atlas: {
        nodes: {
          "node-1": {
            id: "node-1",
            biomeName: "Candle Mire",
            biomeColor: "#abcdef",
            sites: [
              {
                id: "site-1",
                type: "DreamsignOffering",
                isEnhanced: false,
                isVisited: false,
              },
            ],
            position: { x: 0, y: 0 },
            status: "available",
            enhancedSiteType: null,
          },
        },
        edges: [],
        startingNodeId: "node-1",
      },
      screen: { type: "site", siteId: "site-1" },
      activeSiteId: "site-1",
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.rejectDreamsignOffer("site-1");
    const updater = latestRoomTransactionUpdater();
    const nextRoom = updater?.(session.room);

    expect(nextRoom?.questState?.essence).toBe(200);
    expect(nextRoom?.questState?.visitedSites).toEqual(["site-1"]);
    expect(nextRoom?.questState?.screen).toEqual({ type: "dreamscape" });
    expect(nextRoom?.questState?.siteRuntime["site-1"]).toEqual({
      kind: "dreamsignOffer",
      offeredDreamsigns: [offeredDreamsign],
      remainingDreamsignPool: [],
      accepted: true,
    });
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "rejectDreamsignOffer",
      source: "site_reveal",
      summary: {
        siteId: "site-1",
      },
    });
  });

  it("ignores rejecting a dreamsign offer when the site is already visited", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 200,
      visitedSites: ["site-1"],
      siteRuntime: {
        "site-1": {
          kind: "dreamsignOffer",
          offeredDreamsigns: [makeDreamsign("dreamsign-1", "Dreamsign One")],
          remainingDreamsignPool: [],
          accepted: false,
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.rejectDreamsignOffer("site-1");

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects reward acceptance when the site is already visited", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      visitedSites: ["site-1"],
      siteRuntime: {
        "site-1": {
          kind: "reward",
          reward: {
            rewardType: "dreamsign",
            dreamsign: makeDreamsign("dreamsign-1", "Dreamsign One"),
          },
          remainingDreamsignPoolIds: [],
          accepted: false,
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptRewardSite("site-1");

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects dreamsign acceptance when the site is already visited", () => {
    const captured: QuestContextValue[] = [];
    const selectedDreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      visitedSites: ["site-1"],
      siteRuntime: {
        "site-1": {
          kind: "dreamsignOffer",
          offeredDreamsigns: [selectedDreamsign],
          remainingDreamsignPool: [],
          accepted: false,
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptDreamsignOffer(
      "site-1",
      selectedDreamsign,
    );

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects essence acceptance when the site is already visited", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      visitedSites: ["site-1"],
      siteRuntime: {
        "site-1": {
          kind: "essence",
          amount: 250,
          accepted: false,
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptEssenceSite("site-1");

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects dreamsign acceptance when purge index is out of range", () => {
    const captured: QuestContextValue[] = [];
    const selectedDreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      dreamsigns: [makeDreamsign("held-0", "Held 0")],
      siteRuntime: {
        "site-1": {
          kind: "dreamsignOffer",
          offeredDreamsigns: [selectedDreamsign],
          remainingDreamsignPool: [],
          accepted: false,
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptDreamsignOffer(
      "site-1",
      selectedDreamsign,
      5,
    );

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("skips duplicate dreamsign acceptance when runtime is already accepted", () => {
    const captured: QuestContextValue[] = [];
    const selectedDreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      siteRuntime: {
        "site-1": {
          kind: "dreamsignOffer",
          offeredDreamsigns: [selectedDreamsign],
          remainingDreamsignPool: [],
          accepted: true,
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptDreamsignOffer(
      "site-1",
      selectedDreamsign,
    );

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects transfiguration card-choice acceptance for a duplication runtime", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
      siteRuntime: {
        "site-1": {
          kind: "cardChoice",
          choiceKind: "duplication",
          entryIds: ["deck-1"],
          acceptedEntryIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptTransfigurationChoice(
      "site-1",
      "deck-1",
      "Viridian",
      "Viridian test effect",
      { test: true },
    );

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects transfiguration card-choice acceptance with malformed effect details", () => {
    const captured: QuestContextValue[] = [];
    const previewCard = makeCard(101);
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
      siteRuntime: {
        "site-1": {
          kind: "cardChoice",
          choiceKind: "transfiguration",
          entryIds: ["deck-1"],
          acceptedEntryIds: [],
          transfigurationOffers: [
            {
              entryId: "deck-1",
              type: "Viridian",
              effectDescription: "Energy cost: 1 -> 0",
              effectDetails: { energyCost: { from: 1, to: 0 } },
              previewCard: { ...previewCard, energyCost: 0 },
            },
          ],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptTransfigurationChoice(
      "site-1",
      "deck-1",
      "Viridian",
      "Energy cost: 1 -> 0",
      { energyCost: { from: 1, to: 99 } },
    );

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects transfiguration card-choice acceptance when serialized runtime has no offers", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
      siteRuntime: {
        "site-1": {
          kind: "cardChoice",
          choiceKind: "transfiguration",
          entryIds: ["deck-1"],
          acceptedEntryIds: [],
        },
      } as unknown as QuestState["siteRuntime"],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptTransfigurationChoice(
      "site-1",
      "deck-1",
      "Viridian",
      "Energy cost: 1 -> 0",
      { energyCost: { from: 1, to: 0 } },
    );

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects duplication card-choice acceptance with an excessive copy count", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
      siteRuntime: {
        "site-1": {
          kind: "cardChoice",
          choiceKind: "duplication",
          entryIds: ["deck-1"],
          acceptedEntryIds: [],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptDuplicationChoice(
      "site-1",
      "deck-1",
      99,
    );

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("rejects duplication card-choice acceptance for a transfiguration runtime", () => {
    const captured: QuestContextValue[] = [];
    const previewCard = makeCard(101);
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
      siteRuntime: {
        "site-1": {
          kind: "cardChoice",
          choiceKind: "transfiguration",
          entryIds: ["deck-1"],
          acceptedEntryIds: [],
          transfigurationOffers: [
            {
              entryId: "deck-1",
              type: "Viridian",
              effectDescription: "Energy cost: 1 -> 0",
              effectDetails: { energyCost: { from: 1, to: 0 } },
              previewCard: { ...previewCard, energyCost: 0 },
            },
          ],
        },
      },
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptDuplicationChoice(
      "site-1",
      "deck-1",
      1,
    );

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
  });

  it("completes a site through a room transaction", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      atlas: {
        nodes: {
          "node-1": {
            id: "node-1",
            biomeName: "Candle Mire",
            biomeColor: "#abcdef",
            sites: [
              {
                id: "site-1",
                type: "Draft",
                isEnhanced: false,
                isVisited: false,
              },
            ],
            position: { x: 0, y: 0 },
            status: "available",
            enhancedSiteType: null,
          },
        },
        edges: [],
        startingNodeId: "node-1",
      },
      screen: { type: "site", siteId: "site-1" },
      activeSiteId: "site-1",
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.completeSite("site-1", "draft");

    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledTimes(1);

    const updater = roomServiceMocks.runRoomTransaction.mock.calls[0]?.[2] as
      | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
      | undefined;
    const nextRoom = updater?.(session.room);
    const retryRoom = updater?.(session.room);

    expect(nextRoom?.questState?.visitedSites).toEqual(["site-1"]);
    expect(
      nextRoom?.questState?.atlas.nodes["node-1"]?.sites[0]?.isVisited,
    ).toBe(true);
    expect(nextRoom?.questState?.screen).toEqual({ type: "dreamscape" });
    expect(nextRoom?.questState?.activeSiteId).toBeNull();
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "completeSite",
      source: "draft",
      summary: { siteId: "site-1" },
    });
    expect(retryRoom?.metadata.updatedAt).toBe(nextRoom?.metadata.updatedAt);
    expect(retryRoom?.actionLog).toEqual(nextRoom?.actionLog);
    expect(randomUUIDMock).toHaveBeenCalledOnce();
  });

  it("skips site completion action logs when the site is already visited", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      visitedSites: ["site-1"],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.completeSite("site-1", "draft");

    expect(roomServiceMocks.runRoomTransaction).not.toHaveBeenCalled();
    expect(randomUUIDMock).not.toHaveBeenCalled();
  });

  it("accepts a Dream Merchant offer through one atomic room transaction", () => {
    const captured: QuestContextValue[] = [];
    const fixture = makeMerchantProviderFixture();
    const offer = requireMerchantOffer(
      merchantEncounterFor(fixture).offers,
      (candidate) => candidate.applyPayload !== undefined,
    );
    if (offer.applyPayload === undefined) {
      throw new Error("Expected direct merchant payload");
    }
    const session = makeSession(fixture.state);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={fixture.questContent}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptDreamMerchantOffer(
      fixture.site.id,
      merchantAcceptRequestFor(offer),
    );

    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledTimes(1);
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);
    const nextState = nextRoom?.questState;
    if (nextState === undefined || nextState === null) {
      throw new Error("Expected updated quest state");
    }

    expect(merchantPayloadApplied(
      fixture.state,
      nextState,
      offer.applyPayload,
    )).toBe(true);
    expect(nextState.visitedSites).toContain(fixture.site.id);
    expect(nextState.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
    expect(nextState.siteRuntime[fixture.site.id]).toEqual({
      kind: "dreamJourney",
      completed: true,
    });
    expect(nextState.screen).toEqual({ type: "dreamscape" });
    const action = nextRoom?.actionLog?.["action-1"];
    expect(action).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "merchant_offer_accepted",
      source: "dream_merchant",
      summary: action?.summary,
    });
    expect(action?.summary).toMatchObject({
      siteId: fixture.site.id,
      offerId: offer.offerId,
      archetypeId: offer.archetypeId,
      targetKey: offer.targetKey,
      payloadKind: offer.applyPayload.kind,
    });
  });

  it("records a Dream Merchant validation failure without changing transaction quest state", () => {
    const captured: QuestContextValue[] = [];
    const fixture = makeMerchantProviderFixture();
    const offer = merchantEncounterFor(fixture).offers[0];
    if (offer === undefined) throw new Error("Expected merchant offer");
    const session = makeSession(fixture.state);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={fixture.questContent}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.acceptDreamMerchantOffer(
      fixture.site.id,
      {
        ...merchantAcceptRequestFor(offer),
        encounterSignature: `${offer.encounterSignature}-stale`,
      },
    );

    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledTimes(1);
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    expect(nextRoom?.questState).toBe(fixture.state);
    expect(nextRoom?.metadata.updatedAt).not.toBe(session.room.metadata.updatedAt);
    const action = nextRoom?.actionLog?.["action-1"];
    expect(action).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "merchant_offer_validation_failed",
      source: "dream_merchant",
      summary: action?.summary,
    });
    expect(action?.summary).toMatchObject({
      siteId: fixture.site.id,
      offerId: offer.offerId,
      reason: "stale_encounter",
    });
  });

  it("declines the Dream Merchant through a transaction and completes the site", () => {
    const captured: QuestContextValue[] = [];
    const fixture = makeMerchantProviderFixture();
    const offer = merchantEncounterFor(fixture).offers[0];
    if (offer === undefined) throw new Error("Expected merchant offer");
    const session = makeSession(fixture.state);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={fixture.questContent}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.declineDreamMerchant(
      fixture.site.id,
      merchantDeclineRequestFor(offer),
    );

    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledTimes(1);
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    expect(nextRoom?.questState?.deck).toEqual(fixture.state.deck);
    expect(nextRoom?.questState?.dreamsigns).toEqual(fixture.state.dreamsigns);
    expect(nextRoom?.questState?.essence).toBe(fixture.state.essence);
    expect(nextRoom?.questState?.visitedSites).toContain(fixture.site.id);
    expect(nextRoom?.questState?.siteRuntime[fixture.site.id]).toEqual({
      kind: "dreamJourney",
      completed: true,
    });
    expect(nextRoom?.questState?.screen).toEqual({ type: "dreamscape" });
    const action = nextRoom?.actionLog?.["action-1"];
    expect(action).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "merchant_offer_declined",
      source: "dream_merchant",
      summary: action?.summary,
    });
    expect(action?.summary).toMatchObject({
      siteId: fixture.site.id,
      offerId: offer.offerId,
    });
  });

  it(
    "completeDreamJourneySite marks the site visited without mutating " +
      "deck or resources",
    () => {
      // Contract: the new mutation walks visit-tracking bookkeeping only.
      // Any deck or resource side effect would mean a journey effect leaked
      // into a state slot that the new JourneyScreen owns, which is the
      // central no-effects-applied invariant for this task.
      const captured: QuestContextValue[] = [];
      const initialDeck = [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ];
      const initialDreamsigns = [makeDreamsign("dreamsign-1", "Dreamsign One")];
      const questState: QuestState = {
        ...createDefaultState(),
        essence: 250,
        omens: 5,
        deck: initialDeck,
        dreamsigns: initialDreamsigns,
        siteRuntime: {
          "site-1": { kind: "dreamJourney", completed: false },
        },
        atlas: {
          nodes: {
            "node-1": {
              id: "node-1",
              biomeName: "Candle Mire",
              biomeColor: "#abcdef",
              sites: [
                {
                  id: "site-1",
                  type: "DreamJourney",
                  isEnhanced: false,
                  isVisited: false,
                },
              ],
              position: { x: 0, y: 0 },
              status: "available",
              enhancedSiteType: null,
            },
          },
          edges: [],
          startingNodeId: "node-1",
        },
        screen: { type: "site", siteId: "site-1" },
        activeSiteId: "site-1",
      };
      const session = makeSession(questState);
      mount(
        <MultiplayerQuestProvider
          database={database}
          session={session}
          questContent={makeQuestContent()}
        >
          <CaptureQuest onQuest={(quest) => captured.push(quest)} />
        </MultiplayerQuestProvider>,
      );

      captured[captured.length - 1]?.mutations.completeDreamJourneySite(
        "site-1",
      );
      const nextRoom = latestRoomTransactionUpdater()?.(session.room);

      expect(nextRoom?.questState?.visitedSites).toEqual(["site-1"]);
      expect(nextRoom?.questState?.siteRuntime["site-1"]).toEqual({
        kind: "dreamJourney",
        completed: true,
      });
      // Deck and resources MUST be untouched.
      expect(nextRoom?.questState?.deck).toEqual(initialDeck);
      expect(nextRoom?.questState?.dreamsigns).toEqual(initialDreamsigns);
      expect(nextRoom?.questState?.essence).toBe(250);
      expect(nextRoom?.questState?.omens).toBe(5);
      expect(nextRoom?.questState?.essenceCap).toBe(questState.essenceCap);
      expect(nextRoom?.questState?.maxDreamsigns).toBe(
        questState.maxDreamsigns,
      );
      expect(nextRoom?.questState?.screen).toEqual({ type: "dreamscape" });
      expect(nextRoom?.questState?.activeSiteId).toBeNull();
      expect(nextRoom?.actionLog?.["action-1"]).toEqual({
        timestamp: nextRoom?.metadata.updatedAt,
        actorId: "client-1",
        action: "completeDreamJourneySite",
        source: "dream_journey",
        summary: { siteId: "site-1", isEnhanced: false },
      });
    },
  );

  it("applies Wave 1 resource mutations through room transactions", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 450,
      essenceCap: 500,
      omens: 1,
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.setEssence(
      600,
      "journey:gain_essence",
    );
    const essenceRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(essenceRoom?.questState?.essence).toBe(500);
    expect(essenceRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: essenceRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "setEssence",
      source: "journey:gain_essence",
      summary: {
        oldValue: 450,
        newValue: 500,
        delta: 50,
      },
    });

    captured[captured.length - 1]?.mutations.changeOmens(
      -10,
      "journey:omen_cost",
    );
    const omenRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(omenRoom?.questState?.omens).toBe(0);

    captured[captured.length - 1]?.mutations.changeMaxEssence(
      -400,
      "journey:cap_loss",
    );
    const capRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(capRoom?.questState?.essenceCap).toBe(100);
    expect(capRoom?.questState?.essence).toBe(100);
  });

  it("safely no-ops Wave 1 resource updater when questState is null", () => {
    const captured: QuestContextValue[] = [];
    const session = makeSession(null);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.setEssence(100, "test");

    expect(latestRoomTransactionUpdater()?.(session.room)).toBe(session.room);
    expect(latestRoomTransactionUpdater()?.(null)).toBeUndefined();
  });

  it("adds, duplicates, and removes Wave 1 deck entries by id", () => {
    const captured: QuestContextValue[] = [];
    const questContent = {
      ...makeQuestContent(),
      cardDatabase: new Map([
        [101, makeCard(101)],
        [102, makeCard(102)],
      ]),
    };
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: "Viridian",
          isBane: false,
        },
      ],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={questContent}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    const addedEntryId = captured[captured.length - 1]?.mutations.addCardById(
      "card-102",
      "journey:gain_random_predicate_cards",
    );
    const addRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(addedEntryId).toMatch(/^deck-client-1-action-\d+$/);
    expect(addedEntryId).not.toBe("deck-2");
    expect(addRoom?.questState?.deck[1]).toEqual({
      entryId: addedEntryId,
      cardNumber: 102,
      transfiguration: null,
      isBane: false,
    });
    expect(addRoom?.actionLog?.["action-2"]).toEqual({
      timestamp: addRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "addCardById",
      source: "journey:gain_random_predicate_cards",
      summary: {
        cardId: "card-102",
        cardNumber: 102,
        cardName: "Card 102",
        entryId: addedEntryId,
      },
    });

    captured[captured.length - 1]?.mutations.duplicateDeckEntry(
      "deck-1",
      "journey:copy",
    );
    const duplicateRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(duplicateRoom?.questState?.deck[1]).toEqual({
      entryId: "deck-2",
      cardNumber: 101,
      transfiguration: "Viridian",
      isBane: false,
    });

    captured[captured.length - 1]?.mutations.removeDeckEntry(
      "deck-1",
      "journey:remove",
    );
    const removeRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(removeRoom?.questState?.deck).toEqual([]);
  });

  it("applies Wave 1 deck entry transfiguration by id", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.transfigureCard(
      "deck-1",
      "Viridian",
      "journey:transfigure_deck_entry",
      { energyCost: { from: 1, to: 0 } },
    );

    const nextRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(nextRoom?.questState?.deck).toEqual([
      {
        entryId: "deck-1",
        cardNumber: 101,
        transfiguration: "Viridian",
        isBane: false,
      },
    ]);
  });

  it("applies a deck entry type change by id", () => {
    const captured: QuestContextValue[] = [];
    const typeChange: CardTypeChange = {
      predicateId: "warriors",
      cardType: "Character",
      subtype: "Warrior",
      label: "Warrior",
    };
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.changeDeckEntryType(
      "deck-1",
      typeChange,
      "journey:change_card_to_become_type",
    );

    const nextRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(nextRoom?.questState?.deck).toEqual([
      {
        entryId: "deck-1",
        cardNumber: 101,
        transfiguration: null,
        typeChange,
        isBane: false,
      },
    ]);
    expect(Object.values(nextRoom?.actionLog ?? {})[0]).toMatchObject({
      action: "changeDeckEntryType",
      source: "journey:change_card_to_become_type",
      summary: {
        entryId: "deck-1",
        cardNumber: 101,
        predicateId: "warriors",
        cardType: "Character",
        subtype: "Warrior",
        label: "Warrior",
      },
    });
  });

  it("clears Wave 1 deck entry transfiguration by id", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: "Scarlet",
          isBane: false,
        },
      ],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.transfigureCard(
      "deck-1",
      null,
      "journey:clear_transfiguration",
      {},
    );

    const nextRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(nextRoom?.questState?.deck).toEqual([
      {
        entryId: "deck-1",
        cardNumber: 101,
        transfiguration: null,
        isBane: false,
      },
    ]);
  });

  it("warns and skips unknown Wave 1 card ids before scheduling a write", () => {
    const captured: QuestContextValue[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession(createDefaultState())}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    const entryId = captured[captured.length - 1]?.mutations.addCardById(
      "card-missing",
      "journey:test",
    );

    expect(entryId).toBeNull();
    expect(roomServiceMocks.runRoomTransaction).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("addCardById: unknown cardId 'card-missing'"),
    );
    warnSpy.mockRestore();
  });

  it("adds a transfigured card entry through one multiplayer transaction", () => {
    const captured: QuestContextValue[] = [];
    const session = makeSession(createDefaultState());
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    const entryId =
      captured[captured.length - 1]?.mutations.addCardByIdWithTransfiguration(
        "card-101",
        "Bronze",
        "journey:transfigured_add",
      );
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    expect(roomServiceMocks.runRoomTransaction).toHaveBeenCalledTimes(1);
    expect(entryId).toMatch(/^deck-client-1-action-\d+$/);
    expect(nextRoom?.questState?.deck).toEqual([
      {
        entryId,
        cardNumber: 101,
        transfiguration: "Bronze",
        isBane: false,
      },
    ]);
    expect(nextRoom?.actionLog?.["action-2"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "addCardByIdWithTransfiguration",
      source: "journey:transfigured_add",
      summary: {
        cardId: "card-101",
        cardNumber: 101,
        cardName: "Card 101",
        entryId,
        transfigurationType: "Bronze",
      },
    });
  });

  it("purges Wave 1 bane cards deterministically for transaction retries", () => {
    const captured: QuestContextValue[] = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const questState: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: true,
        },
        {
          entryId: "deck-2",
          cardNumber: 102,
          transfiguration: null,
          isBane: true,
        },
        {
          entryId: "deck-3",
          cardNumber: 103,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={{
          ...makeQuestContent(),
          cardDatabase: new Map([
            [101, makeCard(101)],
            [102, makeCard(102)],
            [103, makeCard(103)],
          ]),
        }}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.purgeRandomBaneCards(
      1,
      "journey:purge_1_banes",
    );
    const updater = latestRoomTransactionUpdater();
    const nextRoom = updater?.(session.room);
    const retryRoom = updater?.(session.room);

    expect(nextRoom).toEqual(retryRoom);
    expect(randomSpy).toHaveBeenCalledTimes(1);
    expect(nextRoom?.questState?.deck.map((entry) => entry.entryId)).toEqual([
      "deck-2",
      "deck-3",
    ]);

    captured[captured.length - 1]?.mutations.purgeAllBaneCards(
      "journey:purge_all_banes",
    );
    const purgeAllRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(
      purgeAllRoom?.questState?.deck.map((entry) => entry.entryId),
    ).toEqual(["deck-3"]);

    randomSpy.mockRestore();
  });

  it("records Wave 1 battle modifiers and decays temporary banes on battle completion", () => {
    const captured: QuestContextValue[] = [];
    const questState: QuestState = {
      ...createDefaultState(),
      omens: 1,
      deck: [
        {
          entryId: "deck-1",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={{
          ...makeQuestContent(),
          cardDatabase: new Map([
            [101, makeCard(101)],
            [501, { ...makeCard(501), name: "Nightmare" }],
          ]),
        }}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.pushBattleRewardModifier(
      "flat",
      10,
      2,
      "journey:battle_reward_reduction_flat",
    );
    const modifierRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(modifierRoom?.questState?.battleModifiers).toEqual([
      {
        kind: "reward_reduction_flat",
        amount: 10,
        battlesRemaining: 2,
        source: "journey:battle_reward_reduction_flat",
      },
    ]);

    captured[captured.length - 1]?.mutations.pushTemporaryBaneGrant(
      "Nightmare",
      1,
      1,
      "journey:temporary_bane",
    );
    const baneRoom = latestRoomTransactionUpdater()?.(session.room);
    const addedBane = baneRoom?.questState?.deck.find((entry) => entry.isBane);
    expect(addedBane).toMatchObject({
      entryId: "deck-2",
      cardNumber: 501,
      isBane: true,
    });
    expect(baneRoom?.questState?.battleModifiers[0]).toEqual({
      kind: "temporary_bane_grant",
      baneName: "Nightmare",
      count: 1,
      battlesRemaining: 1,
      addedEntryIds: ["deck-2"],
      source: "journey:temporary_bane",
    });

    const committedRoom = baneRoom as MultiplayerRoom;
    captured[captured.length - 1]?.mutations.incrementCompletionLevel(
      0,
      0,
      null,
      null,
      false,
    );
    const decayedRoom = latestRoomTransactionUpdater()?.(committedRoom);
    expect(decayedRoom?.questState?.battleModifiers).toEqual([]);
    expect(decayedRoom?.questState?.deck).toEqual(questState.deck);
  });

  it("applies Wave 1 atlas and modifier mutations", () => {
    const captured: QuestContextValue[] = [];
    const current = makeNode("dreamscape-1", [makeSite("site-1", "Battle")]);
    const next = makeNode("dreamscape-2", [makeSite("site-2", "Battle")]);
    const questState: QuestState = {
      ...createDefaultState(),
      atlas: {
        nodes: {
          [current.id]: current,
          [next.id]: next,
        },
        edges: [[current.id, next.id]],
        startingNodeId: current.id,
      },
      currentDreamscape: current.id,
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.addSiteToDreamscape(
      "next",
      "Shop",
      "journey:add_site_to_next_dreamscape",
    );
    const addSiteRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(
      addSiteRoom?.questState?.atlas.nodes[next.id]?.sites.map(
        (site) => site.type,
      ),
    ).toEqual(["Battle", "Shop"]);

    captured[captured.length - 1]?.mutations.replaceSiteType(
      "Battle",
      "Essence",
      "journey:replace_site",
    );
    const replaceRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(
      replaceRoom?.questState?.atlas.nodes[current.id]?.sites.map(
        (site) => site.type,
      ),
    ).toEqual(["Essence"]);

    captured[captured.length - 1]?.mutations.removeSiteTypeFromNextDreamscapes(
      "Shop",
      2,
      "journey:remove_shop",
    );
    const removeModifierRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(removeModifierRoom?.questState?.dreamscapeModifiers).toEqual([
      {
        kind: "remove_shop_sites",
        dreamscapesRemaining: 2,
        source: "journey:remove_shop",
      },
    ]);

    captured[captured.length - 1]?.mutations.boostSiteAppearance(
      "DreamsignOffering",
      25,
      3,
      "journey:boost_site",
    );
    const boostRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(boostRoom?.questState?.dreamscapeModifiers).toEqual([
      {
        kind: "boost_site_appearance",
        siteType: "DreamsignOffering",
        percent: 25,
        dreamscapesRemaining: 3,
        source: "journey:boost_site",
      },
    ]);
  });

  it("decays committed dreamscape modifiers when entering a new dreamscape", () => {
    const captured: QuestContextValue[] = [];
    const current = makeNode("dreamscape-1", [makeSite("site-1", "Battle")]);
    const next = makeNode("dreamscape-2", [makeSite("site-2", "Battle")]);
    const questState: QuestState = {
      ...createDefaultState(),
      atlas: {
        nodes: {
          [current.id]: current,
          [next.id]: next,
        },
        edges: [[current.id, next.id]],
        startingNodeId: current.id,
      },
      currentDreamscape: current.id,
      visitedSites: ["site-1"],
    };
    const session = makeSession(questState);
    mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.boostSiteAppearance(
      "Shop",
      20,
      2,
      "journey:boost_site",
    );
    captured[captured.length - 1]?.mutations.setCurrentDreamscape(next.id);

    const withModifier = roomTransactionUpdaterAt(0)?.(session.room);
    const afterAdvance = roomTransactionUpdaterAt(1)?.(
      withModifier as MultiplayerRoom,
    );

    expect(afterAdvance?.questState?.currentDreamscape).toBe(next.id);
    expect(afterAdvance?.questState?.visitedSites).toEqual([]);
    expect(afterAdvance?.questState?.dreamscapeModifiers).toEqual([
      {
        kind: "boost_site_appearance",
        siteType: "Shop",
        percent: 20,
        dreamscapesRemaining: 1,
        source: "journey:boost_site",
      },
    ]);
  });

  it("applies Wave 1 shop modifiers and consumes a free multiplayer reroll", () => {
    const captured: QuestContextValue[] = [];
    const site = makeSite("shop-site", "Shop");
    const questState: QuestState = {
      ...createDefaultState(),
      omens: 0,
      remainingDreamsignPool: [],
      siteRuntime: {
        [site.id]: {
          kind: "shop",
          slots: [],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
        },
      },
    };
    const session = makeSession(questState);
    const { root } = mount(
      <MultiplayerQuestProvider
        database={database}
        session={session}
        questContent={makeQuestContent()}
      >
        <CaptureQuest onQuest={(quest) => captured.push(quest)} />
      </MultiplayerQuestProvider>,
    );

    captured[captured.length - 1]?.mutations.grantFreeShopRerolls(
      2,
      "journey:free_reroll",
    );
    const freeRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(freeRoom?.questState?.shopModifiers.freeRerolls).toBe(2);

    captured[captured.length - 1]?.mutations.applyShopEssenceDiscount(
      15,
      "journey:discount",
    );
    const essenceDiscountRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(
      essenceDiscountRoom?.questState?.shopModifiers.essenceDiscountPercent,
    ).toBe(15);

    captured[captured.length - 1]?.mutations.grantShopOmenDiscounts(
      1,
      "journey:omen_discount",
    );
    const omenDiscountRoom = latestRoomTransactionUpdater()?.(session.room);
    expect(
      omenDiscountRoom?.questState?.shopModifiers.upcomingOmenDiscounts,
    ).toBe(1);

    const committedRoom = freeRoom as MultiplayerRoom;
    const committedSession: RoomSession = {
      ...session,
      room: committedRoom,
    };
    act(() => {
      root.render(
        <MultiplayerQuestProvider
          database={database}
          session={committedSession}
          questContent={makeQuestContent()}
        >
          <CaptureQuest onQuest={(quest) => captured.push(quest)} />
        </MultiplayerQuestProvider>,
      );
    });

    captured[captured.length - 1]?.mutations.rerollShop(site);
    const rerollRoom = latestRoomTransactionUpdater()?.(committedRoom);
    expect(rerollRoom?.questState?.omens).toBe(0);
    expect(rerollRoom?.questState?.shopModifiers.freeRerolls).toBe(1);
    const runtime = rerollRoom?.questState?.siteRuntime[site.id];
    expect(runtime?.kind).toBe("shop");
    expect(runtime?.kind === "shop" ? runtime.rerollCount : null).toBe(1);
  });
});
