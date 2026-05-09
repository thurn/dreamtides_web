// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode } from "react";
import type { Database } from "firebase/database";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "../data/quest-content";
import type { MultiplayerRoom, RoomSession } from "../multiplayer/room-types";
import type { CardData } from "../types/cards";
import type { DreamcallerContent, DreamsignTemplate } from "../types/content";
import type { Dreamsign, QuestState } from "../types/quest";
import { useQuest, type QuestContextValue } from "./quest-context";
import { createDefaultState } from "./quest-context";
import { MultiplayerQuestProvider } from "./multiplayer-quest-context";

const roomServiceMocks = vi.hoisted(() => ({
  runRoomTransaction: vi.fn(),
  writeRoomUpdate: vi.fn(),
}));

const playableBattleCacheMocks = vi.hoisted(() => ({
  reset: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
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

vi.mock("../components/playable-battle-cache", () => ({
  createPlayableBattleCache: vi.fn(() => playableBattleCacheMocks),
  PlayableBattleCacheProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
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
  awakening: 4,
  renderedText: "First dreamcaller.",
  imageNumber: "0009",
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

function makeSession(questState: QuestState | null): RoomSession {
  return {
    roomId: "ab12cd",
    clientId: "client-1",
    room: {
      metadata: {
        schemaVersion: 1,
        createdAt: "2026-05-08T12:00:00.000Z",
        updatedAt: "2026-05-08T12:00:00.000Z",
      },
      questState,
      presence: {},
      actionLog: {},
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
      expect.objectContaining({
        "rooms/ab12cd/questState/essence": 325,
      }),
    );
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
      captured[captured.length - 1]?.mutations.addCard(1, "test");
    }).toThrow(
      "addCard is not available in multiplayer until its composed Firebase action is implemented",
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
    expect(playableBattleCacheMocks.reset).toHaveBeenCalledTimes(1);
    expect(roomServiceMocks.writeRoomUpdate).toHaveBeenCalledWith(
      database,
      expect.objectContaining({
        "rooms/ab12cd/questState": createDefaultState(),
      }),
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

    expect(nextRoom?.questState?.dreamcaller?.id).toBe(testDreamcaller.id);
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
        nexusId: "node-1",
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
        nexusId: "node-1",
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

    const updater = roomServiceMocks.runRoomTransaction.mock.calls[0]?.[2] as
      | ((room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined)
      | undefined;
    const nextRoom = updater?.(session.room);

    expect(nextRoom).toBe(session.room);
    expect(randomUUIDMock).not.toHaveBeenCalled();
  });
});
