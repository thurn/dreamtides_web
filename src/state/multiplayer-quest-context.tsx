import { useCallback, useMemo, useRef, type ReactNode } from "react";
import type { Database } from "firebase/database";
import {
  createPlayableBattleCache,
  PlayableBattleCacheProvider,
  type PlayableBattleCache,
} from "../components/playable-battle-cache";
import { resetBattleCompletionBridge } from "../battle/integration/battle-completion-bridge";
import type { QuestContent } from "../data/quest-content";
import { resetLog } from "../logging";
import {
  runRoomTransaction,
  writeRoomUpdate,
} from "../multiplayer/room-service";
import {
  buildQuestFieldUpdate,
  metadataUpdatedAtPath,
  questStatePath,
  type FirebaseUpdateMap,
} from "../multiplayer/room-paths";
import type { MultiplayerRoom, RoomSession } from "../multiplayer/room-types";
import type { DreamcallerContent } from "../types/content";
import type {
  CardSourceDebugState,
  DreamAtlas,
  Dreamsign,
  QuestFailureSummary,
  QuestState,
  Screen,
  TransfigurationType,
} from "../types/quest";
import type { DraftState } from "../types/draft";
import {
  applyCardSourceDebug,
  applyDraftState,
  applyDreamcallerSelection,
  applyRemainingDreamsignPool,
  createDefaultState,
  QuestContextProvider,
  type QuestMutations,
  type QuestContextValue,
} from "./quest-context";
import {
  changeQuestEssence,
  completeQuestSite,
  setQuestScreen,
  startQuestFromDreamcaller,
  updateQuestAtlas,
} from "./quest-state-actions";

const MAX_DREAMSIGNS = 12;

export interface MultiplayerQuestProviderProps {
  children: ReactNode;
  database: Database;
  session: RoomSession;
  questContent: QuestContent;
}

function writeUpdate(
  database: Database,
  updateMap: FirebaseUpdateMap,
): void {
  void writeRoomUpdate(database, updateMap).catch((error: unknown) => {
    console.error("Failed to write multiplayer quest update", error);
  });
}

function writeRoomTransaction({
  database,
  roomId,
  updater,
}: {
  database: Database;
  roomId: string;
  updater: (room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined;
}): void {
  void runRoomTransaction(database, roomId, updater).catch((error: unknown) => {
    console.error("Failed to write multiplayer quest update", error);
  });
}

function writeQuestField<K extends keyof QuestState>({
  database,
  roomId,
  field,
  value,
}: {
  database: Database;
  roomId: string;
  field: K;
  value: QuestState[K];
}): void {
  writeUpdate(
    database,
    buildQuestFieldUpdate(roomId, field, value, new Date().toISOString()),
  );
}

function writeWholeQuestState({
  database,
  roomId,
  state,
}: {
  database: Database;
  roomId: string;
  state: QuestState;
}): void {
  const updatedAt = new Date().toISOString();
  writeUpdate(database, {
    [questStatePath(roomId)]: state,
    [metadataUpdatedAtPath(roomId)]: updatedAt,
  });
}

function writeScreenUpdate({
  database,
  roomId,
  state,
}: {
  database: Database;
  roomId: string;
  state: QuestState;
}): void {
  const updatedAt = new Date().toISOString();
  writeUpdate(database, {
    ...buildQuestFieldUpdate(roomId, "screen", state.screen, updatedAt),
    ...buildQuestFieldUpdate(
      roomId,
      "activeSiteId",
      state.activeSiteId,
      updatedAt,
    ),
  });
}

function unavailableMutation(name: string): never {
  throw new Error(
    `${name} is not available in multiplayer until its composed Firebase action is implemented`,
  );
}

export function MultiplayerQuestProvider({
  children,
  database,
  session,
  questContent,
}: MultiplayerQuestProviderProps) {
  const state = session.room.questState ?? createDefaultState();
  const playableBattleCache = useMemo(() => createPlayableBattleCache(), []);
  const currentRef = useRef<{
    database: Database;
    session: RoomSession;
    questContent: QuestContent;
    state: QuestState;
    playableBattleCache: PlayableBattleCache;
  }>({
    database,
    session,
    questContent,
    state,
    playableBattleCache,
  });
  currentRef.current = {
    database,
    session,
    questContent,
    state,
    playableBattleCache,
  };

  const changeEssence = useCallback(
    (delta: number, _source: string) => {
      const current = currentRef.current;
      const next = changeQuestEssence(current.state, delta);
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "essence",
        value: next.essence,
      });
    },
    [],
  );

  const startQuest = useCallback(
    (dreamcaller: DreamcallerContent) => {
      const current = currentRef.current;
      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (
            room === null ||
            (room.questState !== null && room.questState.dreamcaller !== null)
          ) {
            return room ?? undefined;
          }

          const questState = room.questState ?? createDefaultState();
          const next = startQuestFromDreamcaller({
            prev: questState,
            dreamcaller,
            questContent: current.questContent,
          });
          const now = new Date().toISOString();
          const actionId = crypto.randomUUID();

          return {
            ...room,
            questState: next,
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "startQuest",
                source: "quest_start",
                summary: {
                  dreamcallerId: dreamcaller.id,
                  dreamcallerName: dreamcaller.name,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const setScreen = useCallback(
    (screen: Screen) => {
      const current = currentRef.current;
      writeScreenUpdate({
        database: current.database,
        roomId: current.session.roomId,
        state: setQuestScreen(current.state, screen),
      });
    },
    [],
  );

  const setCardSourceDebug = useCallback(
    (cardSourceDebug: CardSourceDebugState | null, _source: string) => {
      const current = currentRef.current;
      const next = applyCardSourceDebug(current.state, cardSourceDebug);
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "cardSourceDebug",
        value: next.cardSourceDebug,
      });
    },
    [],
  );

  const addDreamsign = useCallback(
    (dreamsign: Dreamsign, _sourceSiteType: string) => {
      const current = currentRef.current;
      if (current.state.dreamsigns.length >= MAX_DREAMSIGNS) {
        return;
      }
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "dreamsigns",
        value: [...current.state.dreamsigns, dreamsign],
      });
    },
    [],
  );

  const removeDreamsign = useCallback(
    (index: number, _reason: string) => {
      const current = currentRef.current;
      if (current.state.dreamsigns[index] === undefined) {
        return;
      }
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "dreamsigns",
        value: current.state.dreamsigns.filter(
          (_, dreamsignIndex) => dreamsignIndex !== index,
        ),
      });
    },
    [],
  );

  const setRemainingDreamsignPool = useCallback(
    (remainingDreamsignPool: string[], _source: string) => {
      const current = currentRef.current;
      const next = applyRemainingDreamsignPool(
        current.state,
        remainingDreamsignPool,
      );
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "remainingDreamsignPool",
        value: next.remainingDreamsignPool,
      });
    },
    [],
  );

  const setCurrentDreamscape = useCallback(
    (nodeId: string | null) => {
      const current = currentRef.current;
      const next = {
        ...current.state,
        currentDreamscape: nodeId,
        visitedSites: nodeId !== null ? [] : current.state.visitedSites,
      };
      const updatedAt = new Date().toISOString();
      writeUpdate(current.database, {
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "currentDreamscape",
          next.currentDreamscape,
          updatedAt,
        ),
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "visitedSites",
          next.visitedSites,
          updatedAt,
        ),
      });
    },
    [],
  );

  const updateAtlas = useCallback(
    (atlas: DreamAtlas) => {
      const current = currentRef.current;
      const next = updateQuestAtlas(current.state, atlas);
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "atlas",
        value: next.atlas,
      });
    },
    [],
  );

  const setDraftState = useCallback(
    (draftState: DraftState, _source: string) => {
      const current = currentRef.current;
      const next = applyDraftState(current.state, draftState);
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "draftState",
        value: next.draftState,
      });
    },
    [],
  );

  const setFailureSummary = useCallback(
    (failureSummary: QuestFailureSummary | null, _source: string) => {
      const current = currentRef.current;
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "failureSummary",
        value: failureSummary === null ? null : { ...failureSummary },
      });
    },
    [],
  );

  const resetQuest = useCallback(() => {
    const current = currentRef.current;
    resetLog();
    resetBattleCompletionBridge();
    current.playableBattleCache.reset();
    writeWholeQuestState({
      database: current.database,
      roomId: current.session.roomId,
      state: createDefaultState(),
    });
  }, []);

  const setDreamcallerSelection = useCallback(
    (resolvedPackage: Parameters<QuestMutations["setDreamcallerSelection"]>[0]) => {
      const current = currentRef.current;
      const next = applyDreamcallerSelection(current.state, resolvedPackage);
      const updatedAt = new Date().toISOString();
      writeUpdate(current.database, {
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "dreamcaller",
          next.dreamcaller,
          updatedAt,
        ),
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "resolvedPackage",
          next.resolvedPackage,
          updatedAt,
        ),
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "remainingDreamsignPool",
          next.remainingDreamsignPool,
          updatedAt,
        ),
      });
    },
    [],
  );

  const completeSite = useCallback(
    (siteId: string, source: string) => {
      const current = currentRef.current;
      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
          }

          const next = setQuestScreen(
            completeQuestSite(room.questState, siteId),
            { type: "dreamscape" },
          );
          const now = new Date().toISOString();
          const actionId = crypto.randomUUID();

          return {
            ...room,
            questState: {
              ...room.questState,
              visitedSites: next.visitedSites,
              atlas: next.atlas,
              screen: next.screen,
              activeSiteId: next.activeSiteId,
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "completeSite",
                source,
                summary: { siteId },
              },
            },
          };
        },
      });
    },
    [],
  );

  const pickDraftCard = useCallback((_siteId: string, _cardNumber: number) => {
    unavailableMutation("pickDraftCard");
  }, []);

  const mutations = useMemo<QuestMutations>(
    () => ({
      changeEssence,
      startQuest,
      completeSite,
      pickDraftCard,
      addCard: (_cardNumber: number, _source: string) => {
        unavailableMutation("addCard");
      },
      addBaneCard: (_cardNumber: number, _source: string) => {
        unavailableMutation("addBaneCard");
      },
      removeCard: (_entryId: string, _source: string) => {
        unavailableMutation("removeCard");
      },
      transfigureCard: (
        _entryId: string,
        _type: TransfigurationType,
        _effectDescription: string,
        _effectDetails: Record<string, unknown>,
      ) => {
        unavailableMutation("transfigureCard");
      },
      setDreamcallerSelection,
      setCardSourceDebug,
      addDreamsign,
      removeDreamsign,
      setRemainingDreamsignPool,
      incrementCompletionLevel: (
        _essenceReward: number,
        _rewardCardNumber: number | null,
        _rewardCardName: string | null,
        _isMiniboss: boolean,
      ) => {
        unavailableMutation("incrementCompletionLevel");
      },
      setScreen,
      markSiteVisited: (_siteId: string) => {
        unavailableMutation("markSiteVisited");
      },
      setCurrentDreamscape,
      updateAtlas,
      setDraftState,
      setFailureSummary,
      resetQuest,
    }),
    [
      addDreamsign,
      changeEssence,
      completeSite,
      pickDraftCard,
      removeDreamsign,
      resetQuest,
      setCardSourceDebug,
      setCurrentDreamscape,
      setDraftState,
      setDreamcallerSelection,
      setFailureSummary,
      setRemainingDreamsignPool,
      setScreen,
      startQuest,
      updateAtlas,
    ],
  );

  const value = useMemo<QuestContextValue>(
    () => ({
      state,
      mutations,
      cardDatabase: questContent.cardDatabase,
      questContent,
    }),
    [mutations, questContent, state],
  );

  return (
    <QuestContextProvider value={value}>
      <PlayableBattleCacheProvider cache={playableBattleCache}>
        {children}
      </PlayableBattleCacheProvider>
    </QuestContextProvider>
  );
}
