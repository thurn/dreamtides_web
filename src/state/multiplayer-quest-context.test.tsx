// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import type { Database } from "firebase/database";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "../data/quest-content";
import type { MultiplayerRoom, RoomSession } from "../multiplayer/room-types";
import type { CardData } from "../types/cards";
import type { DreamcallerContent, DreamsignTemplate } from "../types/content";
import type { Dreamsign, QuestState, SiteState } from "../types/quest";
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
  mandatoryTides: ["materialize_value"],
  optionalTides: ["spirit_growth"],
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
    tides: ["materialize_value"],
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
    packageTides: ["materialize_value"],
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
    cardsByPackageTide: new Map(),
    dreamcallers: [testDreamcaller],
    dreamsignTemplates: [
      makeDreamsignTemplate("dreamsign-1", "Dreamsign One"),
      makeDreamsignTemplate("dreamsign-2", "Dreamsign Two"),
      makeDreamsignTemplate("dreamsign-3", "Dreamsign Three"),
    ],
    resolvedPackagesByDreamcallerId: new Map([
      [
        testDreamcaller.id,
        {
          dreamcaller: testDreamcaller,
          mandatoryTides: [...testDreamcaller.mandatoryTides],
          optionalSubset: [...testDreamcaller.optionalTides],
          selectedTides: [
            ...testDreamcaller.mandatoryTides,
            ...testDreamcaller.optionalTides,
          ],
          draftPoolCopiesByCard: {},
          dreamsignPoolIds: ["dreamsign-1"],
          mandatoryOnlyPoolSize: 0,
          draftPoolSize: 0,
          doubledCardCount: 0,
          legalSubsetCount: 1,
          preferredSubsetCount: 1,
        },
      ],
    ]),
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
    enableAi: false,
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

  it("writes a focused essence update", () => {
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

    expect(roomServiceMocks.writeRoomUpdate).toHaveBeenCalledTimes(1);
    expect(roomServiceMocks.writeRoomUpdate).toHaveBeenCalledWith(
      database,
      "ab12cd",
      expect.objectContaining({
        "rooms/ab12cd/questState/essence": 325,
      }),
    );
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
    const { container } = mount(
      <MultiplayerQuestProvider
        database={database}
        session={makeSession({ ...createDefaultState(), essence: 300 })}
        questContent={makeQuestContent()}
      >
        <Probe />
      </MultiplayerQuestProvider>,
    );

    act(() => {
      container.querySelector("button")?.click();
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
    expect(nextRoom?.metadata.updatedAt).not.toBe(
      "2026-05-08T12:00:00.000Z",
    );
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
    expect(randomUUIDMock).toHaveBeenCalledOnce();
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
      101,
      102,
      103,
      104,
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
        cardNumber: 101,
      },
    });
    expect(updater?.(nextRoom ?? null)).toBe(nextRoom);
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

  it("buys a shared shop Dreamsign slot", () => {
    const captured: QuestContextValue[] = [];
    const dreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const questState: QuestState = {
      ...createDefaultState(),
      essence: 250,
      siteRuntime: {
        "site-1": {
          kind: "shop",
          slots: [
            {
              itemType: "dreamsign",
              dreamsign,
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
    const nextRoom = latestRoomTransactionUpdater()?.(session.room);

    expect(nextRoom?.questState?.essence).toBe(100);
    expect(nextRoom?.questState?.dreamsigns).toEqual([dreamsign]);
    expect(nextRoom?.questState?.siteRuntime["site-1"]).toEqual({
      kind: "shop",
      slots: [
        {
          itemType: "dreamsign",
          dreamsign,
          basePrice: 150,
          discountPercent: 0,
          purchased: true,
        },
      ],
      rerollCount: 0,
      remainingDreamsignPoolIds: [],
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

    // Reroll costs 50 essence exactly once and advances rerollCount so the
    // affordance disables for the rest of the visit.
    expect(nextRoom?.questState?.essence).toBe(150);
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
    // The unsold slot is replaced with fresh inventory.
    const replacedSlot = runtime?.kind === "shop" ? runtime.slots[1] : null;
    expect(replacedSlot?.itemType).toBe("card");
    expect(nextRoom?.actionLog?.["action-1"]).toEqual({
      timestamp: nextRoom?.metadata.updatedAt,
      actorId: "client-1",
      action: "rerollShop",
      source: "shop_reroll",
      summary: {
        siteId: "site-1",
        rerollCost: 50,
        rerollCount: 1,
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

  it("rejecting a dreamsign offer grants 25 essence and completes the site", () => {
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

    expect(nextRoom?.questState?.essence).toBe(225);
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
        essenceReward: 25,
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
            rewardType: "card",
            cardNumber: 101,
            cardName: "Card 101",
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

  it("rejects tempting offer completion when the prepared dreamsign removal is stale", () => {
    const captured: QuestContextValue[] = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const heldDreamsign = makeDreamsign("held-0", "Held 0");
    const questState: QuestState = {
      ...createDefaultState(),
      dreamsigns: [heldDreamsign, makeDreamsign("held-1", "Held 1")],
      siteRuntime: {
        "site-1": {
          kind: "temptingOffer",
          optionIds: ["offer-3"],
          completed: false,
        },
      },
    };
    const session = makeSession(questState);
    const staleRoom: MultiplayerRoom = {
      ...session.room,
      questState: {
        ...questState,
        dreamsigns: [
          makeDreamsign("held-replacement", "Held Replacement"),
          makeDreamsign("held-1", "Held 1"),
        ],
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

    captured[captured.length - 1]?.mutations.completeTemptingOfferOption(
      "site-1",
      "offer-3",
    );

    expect(latestRoomTransactionUpdater()?.(staleRoom)).toBe(staleRoom);
    randomSpy.mockRestore();
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
});
