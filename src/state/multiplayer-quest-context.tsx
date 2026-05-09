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
  DeckEntry,
  DreamAtlas,
  Dreamsign,
  DreamsignOfferSiteRuntime,
  EssenceSiteRuntime,
  QuestFailureSummary,
  QuestState,
  RewardSiteRuntime,
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
  commitPreparedDraftCardPickInQuestState,
  completeQuestSite,
  prepareDraftCardPickInQuestState,
  setQuestScreen,
  startQuestFromDreamcaller,
  updateQuestAtlas,
} from "./quest-state-actions";
import { generateRewardSiteData } from "../rewards/reward-generator";
import { drawDreamsignOptions } from "../dreamsign/dreamsign-pool";

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

function randomIntInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nextDeckEntryId(deck: readonly DeckEntry[]): string {
  const highest = deck.reduce((max, entry) => {
    const match = /^deck-(\d+)$/.exec(entry.entryId);
    return match === null ? max : Math.max(max, Number(match[1]));
  }, 0);
  return `deck-${String(highest + 1)}`;
}

function dreamsignMatches(left: Dreamsign, right: Dreamsign): boolean {
  if (left.id !== undefined && right.id !== undefined) {
    return left.id === right.id;
  }
  return left.name === right.name;
}

function arraysEqual<T>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
}

function completeSiteAndReturnToDreamscape(
  state: QuestState,
  siteId: string,
): QuestState {
  return setQuestScreen(completeQuestSite(state, siteId), {
    type: "dreamscape",
  });
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

  const pickDraftCard = useCallback((siteId: string, cardNumber: number) => {
    const current = currentRef.current;
    let prepared: ReturnType<typeof prepareDraftCardPickInQuestState>;
    try {
      prepared = prepareDraftCardPickInQuestState({
        prev: current.state,
        siteId,
        cardNumber,
        cardDatabase: current.questContent.cardDatabase,
      });
    } catch {
      return;
    }

    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }

        const next = commitPreparedDraftCardPickInQuestState({
          prev: room.questState,
          prepared,
        });
        if (next === null) {
          return room;
        }

        return {
          ...room,
          questState: {
            ...room.questState,
            deck: next.deck,
            draftState: next.draftState,
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
              action: "pickDraftCard",
              source: "draft_pick",
              summary: { siteId, cardNumber },
            },
          },
        };
      },
    });
  }, []);

  const ensureRewardSiteRuntime = useCallback((siteId: string) => {
    const current = currentRef.current;
    const expectedRemainingDreamsignPool = [
      ...current.state.remainingDreamsignPool,
    ];
    const expectedSelectedTides = [
      ...(current.state.resolvedPackage?.selectedTides ?? []),
    ];
    const generated =
      current.state.siteRuntime[siteId] === undefined
        ? generateRewardSiteData({
          cardDatabase: current.questContent.cardDatabase,
          dreamsignTemplates: current.questContent.dreamsignTemplates,
          remainingDreamsignPoolIds: expectedRemainingDreamsignPool,
          selectedPackageTides: expectedSelectedTides,
        })
        : null;
    const runtime: RewardSiteRuntime | null =
      generated === null
        ? null
        : {
          kind: "reward",
          reward: generated.reward,
          remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
          accepted: false,
        };
    const remainingDreamsignPool =
      generated === null
        ? expectedRemainingDreamsignPool
        : generated.spentDreamsignPoolIds.length > 0
          ? generated.remainingDreamsignPoolIds
          : expectedRemainingDreamsignPool;
    const now = new Date().toISOString();
    const actionId =
      runtime === null ? null : crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.siteRuntime[siteId] !== undefined) {
          return room;
        }
        if (
          runtime === null ||
          actionId === null ||
          !arraysEqual(
            room.questState.remainingDreamsignPool,
            expectedRemainingDreamsignPool,
          ) ||
          !arraysEqual(
            room.questState.resolvedPackage?.selectedTides ?? [],
            expectedSelectedTides,
          )
        ) {
          return room;
        }

        return {
          ...room,
          questState: {
            ...room.questState,
            remainingDreamsignPool,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [siteId]: runtime,
            },
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
              action: "ensureRewardSiteRuntime",
              source: "site_reveal",
              summary: {
                siteId,
                rewardType: runtime.reward.rewardType,
              },
            },
          },
        };
      },
    });
  }, []);

  const acceptRewardSite = useCallback((siteId: string) => {
    const current = currentRef.current;
    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();
    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        const runtime = room.questState.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "reward" ||
          runtime.accepted
        ) {
          return room;
        }

        let next: QuestState = room.questState;
        const reward = runtime.reward;
        if (reward.rewardType === "card") {
          next = {
            ...next,
            deck: [
              ...next.deck,
              {
                entryId: nextDeckEntryId(next.deck),
                cardNumber: reward.cardNumber,
                transfiguration: null,
                isBane: false,
              },
            ],
          };
        } else if (reward.rewardType === "dreamsign") {
          if (next.dreamsigns.length < MAX_DREAMSIGNS) {
            next = {
              ...next,
              dreamsigns: [
                ...next.dreamsigns,
                {
                  id: reward.dreamsignId,
                  name: reward.dreamsignName,
                  effectDescription: reward.dreamsignEffect,
                  isBane: false,
                },
              ],
            };
          }
        } else {
          next = {
            ...next,
            essence: next.essence + reward.essenceAmount,
          };
        }

        next = completeSiteAndReturnToDreamscape(
          {
            ...next,
            siteRuntime: {
              ...next.siteRuntime,
              [siteId]: {
                ...runtime,
                accepted: true,
              },
            },
          },
          siteId,
        );

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
              action: "acceptRewardSite",
              source: "site_reveal",
              summary: {
                siteId,
                rewardType: reward.rewardType,
              },
            },
          },
        };
      },
    });
  }, []);

  const ensureDreamsignOfferRuntime = useCallback(
    (siteId: string, optionCount: number) => {
      const current = currentRef.current;
      const expectedRemainingDreamsignPool = [
        ...current.state.remainingDreamsignPool,
      ];
      const revealed =
        current.state.siteRuntime[siteId] === undefined
          ? drawDreamsignOptions(
            expectedRemainingDreamsignPool,
            current.questContent.dreamsignTemplates,
            optionCount,
          )
          : null;
      const runtime: DreamsignOfferSiteRuntime | null =
        revealed === null
          ? null
          : {
            kind: "dreamsignOffer",
            offeredDreamsigns: revealed.offeredDreamsigns,
            remainingDreamsignPool: revealed.remainingDreamsignPool,
            accepted: false,
          };
      const now = new Date().toISOString();
      const actionId =
        runtime === null ? null : crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.siteRuntime[siteId] !== undefined) {
            return room;
          }
          if (
            runtime === null ||
            actionId === null ||
            !arraysEqual(
              room.questState.remainingDreamsignPool,
              expectedRemainingDreamsignPool,
            )
          ) {
            return room;
          }

          return {
            ...room,
            questState: {
              ...room.questState,
              remainingDreamsignPool: runtime.remainingDreamsignPool,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: runtime,
              },
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
                action: "ensureDreamsignOfferRuntime",
                source: "site_reveal",
                summary: {
                  siteId,
                  optionCount,
                  offeredCount: runtime.offeredDreamsigns.length,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const acceptDreamsignOffer = useCallback(
    (siteId: string, dreamsign: Dreamsign, purgeIndex?: number) => {
      const current = currentRef.current;
      const now = new Date().toISOString();
      const actionId = crypto.randomUUID();
      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          const runtime = room.questState.siteRuntime[siteId];
          if (
            runtime === undefined ||
            runtime.kind !== "dreamsignOffer" ||
            runtime.accepted ||
            !runtime.offeredDreamsigns.some((offered) =>
              dreamsignMatches(offered, dreamsign),
            )
          ) {
            return room;
          }
          const purgedDreamsign =
            purgeIndex === undefined
              ? null
              : room.questState.dreamsigns[purgeIndex];
          if (
            (purgeIndex !== undefined && purgedDreamsign == null) ||
            (room.questState.dreamsigns.length >= MAX_DREAMSIGNS &&
              purgeIndex === undefined)
          ) {
            return room;
          }
          const dreamsigns =
            purgeIndex === undefined
              ? [...room.questState.dreamsigns, dreamsign]
              : room.questState.dreamsigns.map((existing, index) =>
                index === purgeIndex ? dreamsign : existing,
              );

          const next = completeSiteAndReturnToDreamscape(
            {
              ...room.questState,
              dreamsigns,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: {
                  ...runtime,
                  accepted: true,
                },
              },
            },
            siteId,
          );
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
                action: "acceptDreamsignOffer",
                source: "site_reveal",
                summary: {
                  siteId,
                  dreamsignId: dreamsign.id ?? null,
                  dreamsignName: dreamsign.name,
                  purgedDreamsignName: purgedDreamsign?.name ?? null,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const ensureEssenceSiteRuntime = useCallback(
    (siteId: string, isEnhanced: boolean) => {
      const current = currentRef.current;
      const runtime: EssenceSiteRuntime | null =
        current.state.siteRuntime[siteId] === undefined
          ? {
            kind: "essence",
            amount: isEnhanced
              ? randomIntInRange(400, 600)
              : randomIntInRange(200, 300),
            accepted: false,
          }
          : null;
      const now = new Date().toISOString();
      const actionId =
        runtime === null ? null : crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.siteRuntime[siteId] !== undefined) {
            return room;
          }
          if (runtime === null || actionId === null) {
            return room;
          }

          return {
            ...room,
            questState: {
              ...room.questState,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: runtime,
              },
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
                action: "ensureEssenceSiteRuntime",
                source: "site_reveal",
                summary: {
                  siteId,
                  amount: runtime.amount,
                  isEnhanced,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const acceptEssenceSite = useCallback((siteId: string) => {
    const current = currentRef.current;
    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();
    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        const runtime = room.questState.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "essence" ||
          runtime.accepted
        ) {
          return room;
        }

        const next = completeSiteAndReturnToDreamscape(
          {
            ...room.questState,
            essence: room.questState.essence + runtime.amount,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [siteId]: {
                ...runtime,
                accepted: true,
              },
            },
          },
          siteId,
        );
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
              action: "acceptEssenceSite",
              source: "site_reveal",
              summary: {
                siteId,
                amount: runtime.amount,
              },
            },
          },
        };
      },
    });
  }, []);

  const mutations = useMemo<QuestMutations>(
    () => ({
      changeEssence,
      startQuest,
      completeSite,
      ensureRewardSiteRuntime,
      acceptRewardSite,
      ensureDreamsignOfferRuntime,
      acceptDreamsignOffer,
      ensureEssenceSiteRuntime,
      acceptEssenceSite,
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
      ensureRewardSiteRuntime,
      acceptRewardSite,
      ensureDreamsignOfferRuntime,
      acceptDreamsignOffer,
      ensureEssenceSiteRuntime,
      acceptEssenceSite,
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
