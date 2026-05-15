import { useCallback, useMemo, useRef, type ReactNode } from "react";
import type { Database } from "firebase/database";
import { resetBattleCompletionBridge } from "../battle/integration/battle-completion-bridge";
import type { QuestContent } from "../data/quest-content";
import { resetLog } from "../logging";
import {
  runRoomTransaction,
  writeRoomUpdate,
} from "../multiplayer/room-service";
import { buildActionLogEntry } from "../multiplayer/action-log";
import {
  buildQuestFieldUpdate,
  metadataUpdatedAtPath,
  questStatePath,
  type FirebaseUpdateMap,
} from "../multiplayer/room-paths";
import { battleStatePath } from "../multiplayer/battle-paths";
import type { MultiplayerRoom, RoomSession } from "../multiplayer/room-types";
import type { DreamcallerContent } from "../types/content";
import type {
  CardSourceDebugState,
  CardChoiceTransfigurationOffer,
  DeckEntry,
  DreamAtlas,
  Dreamsign,
  DreamsignOfferSiteRuntime,
  EssenceSiteRuntime,
  CardChoiceSiteRuntime,
  DreamJourneySiteRuntime,
  QuestFailureSummary,
  QuestState,
  RewardSiteRuntime,
  RuntimeShopSlot,
  Screen,
  ShopSiteRuntime,
  SiteState,
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
  clampEssence,
  commitPreparedDraftCardPickInQuestState,
  completeQuestSite,
  prepareDraftCardPickInQuestState,
  setQuestScreen,
  startQuestFromDreamcaller,
  updateQuestAtlas,
} from "./quest-state-actions";
import { createStartInBattleState } from "../runtime/start-in-battle-state";
import { generateRewardSiteData } from "../rewards/reward-generator";
import { drawDreamsignOptions } from "../dreamsign/dreamsign-pool";
import {
  generateShopInventory,
  rerollCost,
  shopSlotsToRuntime,
} from "../shop/shop-generator";
import {
  assignTransfiguration,
  transfigurationEffectDetails,
} from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";


export interface MultiplayerQuestProviderProps {
  children: ReactNode;
  database: Database;
  session: RoomSession;
  questContent: QuestContent;
}

function writeUpdate(
  database: Database,
  roomId: string,
  updateMap: FirebaseUpdateMap,
): void {
  void writeRoomUpdate(database, roomId, updateMap).catch((error: unknown) => {
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
    roomId,
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
  writeUpdate(database, roomId, {
    [questStatePath(roomId)]: state,
    [battleStatePath(roomId)]: null,
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
  writeUpdate(database, roomId, {
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

function stableStringify(value: unknown): string {
  // Normalize to RTDB's on-disk shape: keys come back in alphabetical order
  // (so we sort), and empty arrays/objects are dropped entirely on write
  // (so a `[]` value compares equal to a missing key).
  return JSON.stringify(value, (_, v: unknown) => {
    if (Array.isArray(v) && v.length === 0) return undefined;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const record = v as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const sorted: Record<string, unknown> = {};
      for (const key of keys) {
        const inner = record[key];
        if (Array.isArray(inner) && inner.length === 0) continue;
        sorted[key] = inner;
      }
      return sorted;
    }
    return v;
  });
}

function runtimeSlotPrice(slot: {
  basePrice: number;
  discountPercent: number;
}): number {
  if (slot.discountPercent === 0) return slot.basePrice;
  return Math.round(slot.basePrice * (1 - slot.discountPercent / 100));
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

function runtimeShopSlotsEqual(
  left: readonly RuntimeShopSlot[],
  right: readonly RuntimeShopSlot[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function runtimeShopSlotEqual(
  left: RuntimeShopSlot | undefined,
  right: RuntimeShopSlot | undefined,
): boolean {
  if (
    left === undefined ||
    right === undefined ||
    left.itemType !== right.itemType ||
    left.basePrice !== right.basePrice ||
    left.discountPercent !== right.discountPercent ||
    left.purchased !== right.purchased
  ) {
    return false;
  }

  if (left.itemType === "card" && right.itemType === "card") {
    return left.cardNumber === right.cardNumber;
  }

  if (left.itemType === "dreamsign" && right.itemType === "dreamsign") {
    return dreamsignMatches(left.dreamsign, right.dreamsign);
  }

  return false;
}

function completeSiteAndReturnToDreamscape(
  state: QuestState,
  siteId: string,
): QuestState {
  return setQuestScreen(completeQuestSite(state, siteId), {
    type: "dreamscape",
  });
}

function findSite(state: QuestState, siteId: string): SiteState | null {
  for (const node of Object.values(state.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site !== undefined) {
      return site;
    }
  }
  return null;
}

function shuffled<T>(items: readonly T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function selectCardChoiceEntryIds({
  deck,
  cardDatabase,
  kind,
  isEnhanced,
}: {
  deck: readonly DeckEntry[];
  cardDatabase: Map<number, CardData>;
  kind: "transfiguration" | "duplication";
  isEnhanced: boolean;
}): string[] {
  const entryIds: string[] = [];
  const entries = isEnhanced ? [...deck] : shuffled(deck);
  const limit = isEnhanced ? Number.POSITIVE_INFINITY : 3;

  for (const entry of entries) {
    if (entryIds.length >= limit) {
      break;
    }
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) {
      continue;
    }
    if (
      kind === "transfiguration" &&
      (entry.transfiguration !== null ||
        assignTransfiguration(card, entry.transfiguration) === null)
    ) {
      continue;
    }
    entryIds.push(entry.entryId);
  }
  return entryIds;
}

function duplicationCopyCount(siteId: string, entryId: string): number {
  let hash = 0;
  for (const char of `${siteId}:${entryId}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 4) + 1;
}

function effectDetailsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildCardChoiceRuntime({
  siteId: _siteId,
  deck,
  cardDatabase,
  kind,
  isEnhanced,
}: {
  siteId: string;
  deck: readonly DeckEntry[];
  cardDatabase: Map<number, CardData>;
  kind: "transfiguration" | "duplication";
  isEnhanced: boolean;
}): CardChoiceSiteRuntime {
  const entryIds = selectCardChoiceEntryIds({
    deck,
    cardDatabase,
    kind,
    isEnhanced,
  });

  if (kind === "duplication") {
    return {
      kind: "cardChoice",
      choiceKind: "duplication",
      entryIds,
      acceptedEntryIds: [],
    };
  }

  const deckByEntryId = new Map(deck.map((entry) => [entry.entryId, entry]));
  const transfigurationOffers: CardChoiceTransfigurationOffer[] = [];
  for (const entryId of entryIds) {
    const entry = deckByEntryId.get(entryId);
    if (entry === undefined) {
      continue;
    }
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) {
      continue;
    }
    const offer = assignTransfiguration(card, entry.transfiguration);
    if (offer === null) {
      continue;
    }
    transfigurationOffers.push({
      entryId,
      type: offer.type,
      effectDescription: offer.description,
      effectDetails: transfigurationEffectDetails(offer, card),
      previewCard: offer.previewCard,
    });
  }

  return {
    kind: "cardChoice",
    choiceKind: "transfiguration",
    entryIds,
    acceptedEntryIds: [],
    transfigurationOffers,
  };
}

function deckEntriesRuntimeCompatible(
  deck: readonly DeckEntry[],
  expected: readonly DeckEntry[],
): boolean {
  return (
    deck.length === expected.length &&
    deck.every((entry, index) => {
      const other = expected[index];
      return (
        other !== undefined &&
        entry.entryId === other.entryId &&
        entry.cardNumber === other.cardNumber &&
        entry.transfiguration === other.transfiguration &&
        entry.isBane === other.isBane
      );
    })
  );
}

function siteRuntimeAssumptionMatches(
  state: QuestState,
  siteId: string,
  expectedType: SiteState["type"] | null,
  expectedIsEnhanced: boolean,
): boolean {
  const site = findSite(state, siteId);
  return (
    site?.type === expectedType &&
    site.isEnhanced === expectedIsEnhanced
  );
}

export function MultiplayerQuestProvider({
  children,
  database,
  session,
  questContent,
}: MultiplayerQuestProviderProps) {
  const state = session.room.questState ?? createDefaultState();
  const currentRef = useRef<{
    database: Database;
    session: RoomSession;
    questContent: QuestContent;
    state: QuestState;
  }>({
    database,
    session,
    questContent,
    state,
  });
  currentRef.current = {
    database,
    session,
    questContent,
    state,
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
      const now = new Date().toISOString();
      const actionId = crypto.randomUUID();
      const actionEntry = buildActionLogEntry({
        timestamp: now,
        actorId: current.session.clientId,
        action: "startQuest",
        source: "quest_start",
        summary: {
          dreamcallerId: dreamcaller.id,
          dreamcallerName: dreamcaller.name,
        },
      });
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

          return {
            ...room,
            questState: next,
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: actionEntry,
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
      // Screen useEffects re-fire on every Firebase snapshot because
      // state.resolvedPackage and visibleCardOffers reference-change. Skipping
      // structurally-equal writes here breaks the snapshot/write loop that
      // would otherwise starve concurrent transactions with maxretry. The
      // compare is against snapshot-derived state, so the signature must
      // match RTDB's on-disk shape (sorted keys, empty arrays dropped) —
      // see stableStringify.
      if (
        stableStringify(next.cardSourceDebug) ===
        stableStringify(current.state.cardSourceDebug)
      ) {
        return;
      }
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
    (dreamsign: Dreamsign, _sourceSiteType: string, purgeIndex?: number) => {
      const current = currentRef.current;
      const purgedDreamsign =
        purgeIndex === undefined
          ? null
          : current.state.dreamsigns[purgeIndex];
      if (
        (purgeIndex !== undefined && purgedDreamsign == null) ||
        (purgeIndex === undefined &&
          current.state.dreamsigns.length >= current.state.maxDreamsigns)
      ) {
        return;
      }
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "dreamsigns",
        value:
          purgeIndex === undefined
            ? [...current.state.dreamsigns, dreamsign]
            : current.state.dreamsigns.map((existing, index) =>
              index === purgeIndex ? dreamsign : existing,
            ),
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
      writeUpdate(current.database, current.session.roomId, {
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

  const bootstrapStartInBattle = useCallback(() => {
    const current = currentRef.current;
    if (current.state.dreamcaller !== null) {
      return;
    }
    const battleState = createStartInBattleState(current.questContent);
    if (battleState === null) {
      return;
    }
    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();
    const actionEntry = buildActionLogEntry({
      timestamp: now,
      actorId: current.session.clientId,
      action: "bootstrapStartInBattle",
      source: "start_in_battle",
      summary: {
        dreamcallerId: battleState.dreamcaller?.id ?? null,
        screen: battleState.screen.type,
      },
    });
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

        return {
          ...room,
          questState: battleState,
          battleState: null,
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: actionEntry,
          },
        };
      },
    });
  }, []);

  const resetQuest = useCallback(() => {
    const current = currentRef.current;
    resetLog();
    resetBattleCompletionBridge();
    writeWholeQuestState({
      database: current.database,
      roomId: current.session.roomId,
      state: createDefaultState(),
    });
  }, []);

  const dismissStartingDeckPopup = useCallback(() => {
    const current = currentRef.current;
    if (current.state.hasSeenStartingDeckPopup) {
      return;
    }
    writeQuestField({
      database: current.database,
      roomId: current.session.roomId,
      field: "hasSeenStartingDeckPopup",
      value: true,
    });
  }, []);

  const setDreamcallerSelection = useCallback(
    (resolvedPackage: Parameters<QuestMutations["setDreamcallerSelection"]>[0]) => {
      const current = currentRef.current;
      const next = applyDreamcallerSelection(current.state, resolvedPackage);
      const updatedAt = new Date().toISOString();
      writeUpdate(current.database, current.session.roomId, {
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

  const addCard = useCallback(
    (cardNumber: number, source: string) => {
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
          const entryId = nextDeckEntryId(room.questState.deck);
          const entry: DeckEntry = {
            entryId,
            cardNumber,
            transfiguration: null,
            isBane: false,
          };
          return {
            ...room,
            questState: {
              ...room.questState,
              deck: [...room.questState.deck, entry],
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "addCard",
                source,
                summary: { cardNumber },
              }),
            },
          };
        },
      });
    },
    [],
  );

  const markSiteVisited = useCallback((siteId: string) => {
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
        if (room.questState.visitedSites.includes(siteId)) {
          return room;
        }
        const updatedNodes = { ...room.questState.atlas.nodes };
        for (const [nodeId, node] of Object.entries(updatedNodes)) {
          const siteIndex = node.sites.findIndex((s) => s.id === siteId);
          if (siteIndex !== -1) {
            updatedNodes[nodeId] = {
              ...node,
              sites: node.sites.map((s, i) =>
                i === siteIndex ? { ...s, isVisited: true } : s,
              ),
            };
            break;
          }
        }
        return {
          ...room,
          questState: {
            ...room.questState,
            visitedSites: [...room.questState.visitedSites, siteId],
            atlas: { ...room.questState.atlas, nodes: updatedNodes },
          },
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "markSiteVisited",
              source: "site_completion",
              summary: { siteId },
            }),
          },
        };
      },
    });
  }, []);

  const incrementCompletionLevel = useCallback(
    (
      essenceReward: number,
      omenReward: number,
      rewardCardNumber: number | null,
      rewardCardName: string | null,
      isMiniboss: boolean,
    ) => {
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
          const newLevel = room.questState.completionLevel + 1;
          const screen: Screen =
            newLevel >= 7
              ? { type: "questComplete" }
              : room.questState.screen;
          return {
            ...room,
            questState: {
              ...room.questState,
              completionLevel: newLevel,
              omens: room.questState.omens + omenReward,
              screen,
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "incrementCompletionLevel",
                source: "battle_reward",
                summary: {
                  essenceReward,
                  omenReward,
                  rewardCardNumber,
                  rewardCardName,
                  isMiniboss,
                  newLevel,
                },
              }),
            },
          };
        },
      });
    },
    [],
  );

  const completeSite = useCallback(
    (siteId: string, source: string) => {
      const current = currentRef.current;
      if (current.state.visitedSites.includes(siteId)) {
        return;
      }

      const now = new Date().toISOString();
      const actionId = crypto.randomUUID();
      const actionEntry = buildActionLogEntry({
        timestamp: now,
        actorId: current.session.clientId,
        action: "completeSite",
        source,
        summary: { siteId },
      });
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
              [actionId]: actionEntry,
            },
          };
        },
      });
    },
    [],
  );

  const cleanseBanes = useCallback(
    (
      siteId: string,
      cardEntryIds: string[],
      dreamsignIndices: number[],
    ) => {
      const current = currentRef.current;
      if (current.state.visitedSites.includes(siteId)) {
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
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
          }
          const cardIdSelection = new Set(cardEntryIds);
          const baneCardEntryIds = room.questState.deck
            .filter(
              (entry) => entry.isBane && cardIdSelection.has(entry.entryId),
            )
            .map((entry) => entry.entryId);
          const baneDreamsignIndices = [...new Set(dreamsignIndices)]
            .filter(
              (index) => room.questState?.dreamsigns[index]?.isBane === true,
            )
            .sort((a, b) => a - b);

          // Up to 3 banes total may be removed at a Cleanse site.
          const cappedCardEntryIds = baneCardEntryIds.slice(0, 3);
          const cappedDreamsignIndices = baneDreamsignIndices.slice(
            0,
            Math.max(0, 3 - cappedCardEntryIds.length),
          );
          const cardIdSet = new Set(cappedCardEntryIds);
          const dreamsignIndexSet = new Set(cappedDreamsignIndices);

          const next = setQuestScreen(
            completeQuestSite(
              {
                ...room.questState,
                deck: room.questState.deck.filter(
                  (entry) => !cardIdSet.has(entry.entryId),
                ),
                dreamsigns: room.questState.dreamsigns.filter(
                  (_, index) => !dreamsignIndexSet.has(index),
                ),
              },
              siteId,
            ),
            { type: "dreamscape" },
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
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "cleanseBanes",
                source: "cleanse_site",
                summary: {
                  siteId,
                  banesRemovedCount:
                    cappedCardEntryIds.length + cappedDreamsignIndices.length,
                },
              }),
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
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "pickDraftCard",
              source: "draft_pick",
              summary: { siteId, cardNumber },
            }),
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
          dreamsignTemplates: current.questContent.dreamsignTemplates,
          remainingDreamsignPoolIds: expectedRemainingDreamsignPool,
          selectedPackageTides: expectedSelectedTides,
          regenerationPoolIds:
            current.state.resolvedPackage?.dreamsignPoolIds ?? [],
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
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "ensureRewardSiteRuntime",
              source: "site_reveal",
              summary: {
                siteId,
                rewardType: runtime.reward.rewardType,
              },
            }),
          },
        };
      },
    });
  }, []);

  const acceptRewardSite = useCallback((siteId: string, purgeIndex?: number) => {
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
        if (room.questState.visitedSites.includes(siteId)) {
          return room;
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
        if (reward.rewardType === "dreamsign") {
          const purgedDreamsign =
            purgeIndex === undefined ? null : next.dreamsigns[purgeIndex];
          if (
            (purgeIndex !== undefined && purgedDreamsign == null) ||
            (purgeIndex === undefined &&
              next.dreamsigns.length >= next.maxDreamsigns)
          ) {
            return room;
          }
          next = {
            ...next,
            dreamsigns:
              purgeIndex === undefined
                ? [...next.dreamsigns, reward.dreamsign]
                : next.dreamsigns.map((existing, index) =>
                  index === purgeIndex ? reward.dreamsign : existing,
                ),
          };
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
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "acceptRewardSite",
              source: "site_reveal",
              summary: {
                siteId,
                rewardType: reward.rewardType,
              },
            }),
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
            current.state.resolvedPackage?.dreamsignPoolIds ?? [],
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
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "ensureDreamsignOfferRuntime",
                source: "site_reveal",
                summary: {
                  siteId,
                  optionCount,
                  offeredCount: runtime.offeredDreamsigns.length,
                },
              }),
            },
          };
        },
      });
    },
    [],
  );

  const rejectDreamsignOffer = useCallback((siteId: string) => {
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
        if (room.questState.visitedSites.includes(siteId)) {
          return room;
        }
        const runtime = room.questState.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "dreamsignOffer" ||
          runtime.accepted
        ) {
          return room;
        }

        const next = completeSiteAndReturnToDreamscape(
          {
            ...room.questState,
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
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "rejectDreamsignOffer",
              source: "site_reveal",
              summary: {
                siteId,
              },
            }),
          },
        };
      },
    });
  }, []);

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
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
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
            (room.questState.dreamsigns.length >= room.questState.maxDreamsigns &&
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
              [actionId]: buildActionLogEntry({
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
              }),
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
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "ensureEssenceSiteRuntime",
                source: "site_reveal",
                summary: {
                  siteId,
                  amount: runtime.amount,
                  isEnhanced,
                },
              }),
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
        if (room.questState.visitedSites.includes(siteId)) {
          return room;
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
            essence: clampEssence(
              room.questState.essence + runtime.amount,
              room.questState.essenceCap,
            ),
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
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "acceptEssenceSite",
              source: "site_reveal",
              summary: {
                siteId,
                amount: runtime.amount,
              },
            }),
          },
        };
      },
    });
  }, []);

  const ensureShopRuntime = useCallback(
    (site: SiteState, specialtyOnly: boolean) => {
      const current = currentRef.current;
      const expectedRemainingDreamsignPool = [
        ...current.state.remainingDreamsignPool,
      ];
      const expectedDraftSignature = stableStringify(
        current.state.draftState,
      );
      let runtime: ShopSiteRuntime | null = null;
      let remainingDreamsignPool = expectedRemainingDreamsignPool;
      let nextDraftState: DraftState | null = current.state.draftState;

      if (current.state.siteRuntime[site.id] === undefined) {
        const generated = generateShopInventory({
          cardDatabase: current.questContent.cardDatabase,
          draftState: current.state.draftState,
          remainingDreamsignPoolIds: expectedRemainingDreamsignPool,
          dreamsignTemplates: current.questContent.dreamsignTemplates,
          dreamsignRegenerationPoolIds:
            current.state.resolvedPackage?.dreamsignPoolIds ?? [],
          specialtyTides: specialtyOnly
            ? (current.state.resolvedPackage?.mandatoryTides ?? [])
            : [],
        });
        runtime = {
          kind: "shop",
          slots: shopSlotsToRuntime(generated.slots),
          rerollCount: 0,
          remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
          restrictedTide: generated.restrictedTide,
        };
        remainingDreamsignPool = generated.remainingDreamsignPoolIds;
        nextDraftState = generated.draftState;
      }

      const now = new Date().toISOString();
      const actionId = runtime === null ? null : crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.siteRuntime[site.id] !== undefined) {
            return room;
          }
          if (
            runtime === null ||
            actionId === null ||
            !arraysEqual(
              room.questState.remainingDreamsignPool,
              expectedRemainingDreamsignPool,
            ) ||
            stableStringify(room.questState.draftState)
              !== expectedDraftSignature
          ) {
            return room;
          }

          return {
            ...room,
            questState: {
              ...room.questState,
              remainingDreamsignPool,
              draftState: nextDraftState,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [site.id]: runtime,
              },
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "ensureShopRuntime",
                source: "site_reveal",
                summary: {
                  siteId: site.id,
                  specialtyOnly,
                  slotCount: runtime.slots.length,
                },
              }),
            },
          };
        },
      });
    },
    [],
  );

  const buyShopSlot = useCallback(
    (siteId: string, slotIndex: number, purgeIndex?: number) => {
    const current = currentRef.current;
    const expectedRuntime = current.state.siteRuntime[siteId];
    if (
      expectedRuntime === undefined ||
      expectedRuntime.kind !== "shop" ||
      current.state.visitedSites.includes(siteId)
    ) {
      return;
    }
    const expectedSlot = expectedRuntime.slots[slotIndex];
    if (expectedSlot === undefined || expectedSlot.purchased) {
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
        if (room.questState.visitedSites.includes(siteId)) {
          return room;
        }
        const runtime = room.questState.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "shop" ||
          runtime.rerollCount !== expectedRuntime.rerollCount ||
          !arraysEqual(
            runtime.remainingDreamsignPoolIds,
            expectedRuntime.remainingDreamsignPoolIds,
          ) ||
          !runtimeShopSlotEqual(runtime.slots[slotIndex], expectedSlot)
        ) {
          return room;
        }
        const slot = runtime.slots[slotIndex];
        if (slot === undefined || slot.purchased) {
          return room;
        }

        const price = runtimeSlotPrice(slot);
        // Cards cost essence; Dreamsigns cost omens.
        const payInOmens = slot.itemType === "dreamsign";
        const availableCurrency = payInOmens
          ? room.questState.omens
          : room.questState.essence;
        if (price > availableCurrency) {
          return room;
        }
        const purgedDreamsign =
          slot.itemType === "dreamsign" && purgeIndex !== undefined
            ? room.questState.dreamsigns[purgeIndex]
            : null;
        if (
          slot.itemType === "dreamsign" &&
          ((purgeIndex !== undefined && purgedDreamsign == null) ||
            (purgeIndex === undefined &&
              room.questState.dreamsigns.length >= room.questState.maxDreamsigns))
        ) {
          return room;
        }

        let next: QuestState = payInOmens
          ? {
            ...room.questState,
            omens: room.questState.omens - price,
          }
          : {
            ...room.questState,
            essence: clampEssence(
              room.questState.essence - price,
              room.questState.essenceCap,
            ),
          };
        const summary: Record<string, unknown> = {
          siteId,
          slotIndex,
          itemType: slot.itemType,
          basePrice: slot.basePrice,
          discountedPrice: price,
          currency: payInOmens ? "omens" : "essence",
        };

        if (slot.itemType === "card") {
          next = {
            ...next,
            deck: [
              ...next.deck,
              {
                entryId: nextDeckEntryId(next.deck),
                cardNumber: slot.cardNumber,
                transfiguration: null,
                isBane: false,
              },
            ],
          };
          summary.cardNumber = slot.cardNumber;
        } else {
          next = {
            ...next,
            dreamsigns:
              purgeIndex === undefined
                ? [...next.dreamsigns, slot.dreamsign]
                : next.dreamsigns.map((existing, index) =>
                  index === purgeIndex ? slot.dreamsign : existing,
                ),
          };
          summary.dreamsignId = slot.dreamsign.id ?? null;
          summary.dreamsignName = slot.dreamsign.name;
          if (purgedDreamsign != null) {
            summary.purgedDreamsignName = purgedDreamsign.name;
          }
        }

        next = {
          ...next,
          siteRuntime: {
            ...next.siteRuntime,
            [siteId]: {
              ...runtime,
              slots: runtime.slots.map((candidate, index) =>
                index === slotIndex
                  ? { ...candidate, purchased: true }
                  : candidate,
              ),
            },
          },
        };

        return {
          ...room,
          questState: next,
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "buyShopSlot",
              source: "shop_purchase",
              summary,
            }),
          },
        };
      },
    });
  }, []);

  const rerollShop = useCallback((site: SiteState) => {
    const current = currentRef.current;
    const expectedRuntime = current.state.siteRuntime[site.id];
    if (
      expectedRuntime === undefined ||
      expectedRuntime.kind !== "shop" ||
      current.state.visitedSites.includes(site.id)
    ) {
      return;
    }
    if (expectedRuntime.rerollCount > 0) {
      return;
    }

    const expectedOmens = current.state.omens;
    const cost = rerollCost(0, site.isEnhanced);
    if (cost > expectedOmens) {
      return;
    }
    const expectedDraftSignature = stableStringify(current.state.draftState);
    const generated = generateShopInventory({
      cardDatabase: current.questContent.cardDatabase,
      draftState: current.state.draftState,
      remainingDreamsignPoolIds: expectedRuntime.remainingDreamsignPoolIds,
      dreamsignTemplates: current.questContent.dreamsignTemplates,
      dreamsignRegenerationPoolIds:
        current.state.resolvedPackage?.dreamsignPoolIds ?? [],
      specialtyTides:
        expectedRuntime.restrictedTide === null
          ? []
          : [expectedRuntime.restrictedTide],
    });
    const replacements = shopSlotsToRuntime(generated.slots);
    let replacementIndex = 0;
    const rerollCount = expectedRuntime.rerollCount + 1;
    const slots = expectedRuntime.slots.map((candidate) => {
      if (candidate.purchased) return candidate;
      const replacement = replacements[replacementIndex];
      replacementIndex += 1;
      return replacement ?? candidate;
    });
    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.visitedSites.includes(site.id)) {
          return room;
        }
        const runtime = room.questState.siteRuntime[site.id];
        if (
          runtime === undefined ||
          runtime.kind !== "shop" ||
          runtime.rerollCount !== expectedRuntime.rerollCount ||
          room.questState.omens !== expectedOmens ||
          !arraysEqual(
            runtime.remainingDreamsignPoolIds,
            expectedRuntime.remainingDreamsignPoolIds,
          ) ||
          !runtimeShopSlotsEqual(runtime.slots, expectedRuntime.slots) ||
          !arraysEqual(
            room.questState.remainingDreamsignPool,
            expectedRuntime.remainingDreamsignPoolIds,
          ) ||
          stableStringify(room.questState.draftState)
            !== expectedDraftSignature
        ) {
          return room;
        }

        return {
          ...room,
          questState: {
            ...room.questState,
            omens: room.questState.omens - cost,
            remainingDreamsignPool: generated.remainingDreamsignPoolIds,
            draftState: generated.draftState,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [site.id]: {
                ...runtime,
                slots,
                rerollCount,
                remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
              },
            },
          },
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "rerollShop",
              source: "shop_reroll",
              summary: {
                siteId: site.id,
                rerollCost: cost,
                rerollCount,
              },
            }),
          },
        };
      },
    });
  }, []);

  const ensureCardChoiceRuntime = useCallback(
    (siteId: string, kind: "transfiguration" | "duplication") => {
      const current = currentRef.current;
      const expectedDeck = structuredClone(current.state.deck);
      const site = findSite(current.state, siteId);
      const expectedSiteType = site?.type ?? null;
      const expectedIsEnhanced = site?.isEnhanced ?? false;
      const runtime: CardChoiceSiteRuntime | null =
        current.state.siteRuntime[siteId] === undefined
          ? buildCardChoiceRuntime({
            siteId,
              deck: current.state.deck,
              cardDatabase: current.questContent.cardDatabase,
              kind,
              isEnhanced: site?.isEnhanced ?? false,
          })
          : null;
      const now = new Date().toISOString();
      const actionId = runtime === null ? null : crypto.randomUUID();

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
            !siteRuntimeAssumptionMatches(
              room.questState,
              siteId,
              expectedSiteType,
              expectedIsEnhanced,
            ) ||
            !deckEntriesRuntimeCompatible(room.questState.deck, expectedDeck)
          ) {
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
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "ensureCardChoiceRuntime",
                source: "site_reveal",
                summary: {
                  siteId,
                  kind,
                  entryCount: runtime.entryIds.length,
                },
              }),
            },
          };
        },
      });
    },
    [],
  );

  const acceptTransfigurationChoice = useCallback(
    (
      siteId: string,
      entryId: string,
      type: TransfigurationType,
      effectDescription: string,
      effectDetails: Record<string, unknown>,
    ) => {
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
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
          }
          const runtime = room.questState.siteRuntime[siteId];
          if (
            runtime === undefined ||
            runtime.kind !== "cardChoice" ||
            runtime.choiceKind !== "transfiguration" ||
            !Array.isArray(runtime.transfigurationOffers) ||
            runtime.acceptedEntryIds.length > 0 ||
            !runtime.entryIds.includes(entryId)
          ) {
            return room;
          }
          const entry = room.questState.deck.find(
            (candidate) => candidate.entryId === entryId,
          );
          if (entry === undefined || entry.transfiguration !== null) {
            return room;
          }
          const offered = runtime.transfigurationOffers.find(
            (offer) => offer.entryId === entryId,
          );
          if (
            offered === undefined ||
            offered.type !== type ||
            offered.effectDescription !== effectDescription ||
            !effectDetailsEqual(offered.effectDetails, effectDetails)
          ) {
            return room;
          }

          const next = completeSiteAndReturnToDreamscape(
            {
              ...room.questState,
              deck: room.questState.deck.map((candidate) =>
                candidate.entryId === entryId
                  ? { ...candidate, transfiguration: offered.type }
                  : candidate,
              ),
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: {
                  ...runtime,
                  acceptedEntryIds: [entryId],
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
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "acceptTransfigurationChoice",
                source: "transfiguration",
                summary: {
                  siteId,
                  entryId,
                  transfigurationType: offered.type,
                  effectDescription: offered.effectDescription,
                  effectDetails: offered.effectDetails,
                },
              }),
            },
          };
        },
      });
    },
    [],
  );

  const acceptDuplicationChoice = useCallback(
    (siteId: string, entryId: string, copyCount: number) => {
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
          if (room.questState.visitedSites.includes(siteId) || copyCount < 1) {
            return room;
          }
          const runtime = room.questState.siteRuntime[siteId];
          if (
            runtime === undefined ||
            runtime.kind !== "cardChoice" ||
            runtime.choiceKind !== "duplication" ||
            runtime.acceptedEntryIds.length > 0 ||
            !runtime.entryIds.includes(entryId)
          ) {
            return room;
          }
          const entry = room.questState.deck.find(
            (candidate) => candidate.entryId === entryId,
          );
          if (entry === undefined) {
            return room;
          }
          const expectedCopyCount = duplicationCopyCount(siteId, entryId);
          if (copyCount !== expectedCopyCount) {
            return room;
          }

          let deck = room.questState.deck;
          for (let index = 0; index < expectedCopyCount; index += 1) {
            deck = [
              ...deck,
              {
                entryId: nextDeckEntryId(deck),
                cardNumber: entry.cardNumber,
                transfiguration: null,
                isBane: false,
              },
            ];
          }

          const next = completeSiteAndReturnToDreamscape(
            {
              ...room.questState,
              deck,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: {
                  ...runtime,
                  acceptedEntryIds: [entryId],
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
              [actionId]: buildActionLogEntry({
                timestamp: now,
                actorId: current.session.clientId,
                action: "acceptDuplicationChoice",
                source: "duplication",
                summary: {
                  siteId,
                  entryId,
                  cardNumber: entry.cardNumber,
                  copyCount: expectedCopyCount,
                },
              }),
            },
          };
        },
      });
    },
    [],
  );

  const completeDreamJourneySite = useCallback((siteId: string) => {
    const current = currentRef.current;
    const site = findSite(current.state, siteId);
    const isEnhanced = site?.isEnhanced ?? false;
    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();

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
        const existingRuntime = room.questState.siteRuntime[siteId];
        if (
          existingRuntime !== undefined &&
          (existingRuntime.kind !== "dreamJourney" || existingRuntime.completed)
        ) {
          return room;
        }
        const runtime: DreamJourneySiteRuntime =
          existingRuntime?.kind === "dreamJourney"
            ? existingRuntime
            : { kind: "dreamJourney", completed: false };

        const next = completeSiteAndReturnToDreamscape(
          {
            ...room.questState,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [siteId]: { ...runtime, completed: true },
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
            [actionId]: buildActionLogEntry({
              timestamp: now,
              actorId: current.session.clientId,
              action: "completeDreamJourneySite",
              source: "dream_journey",
              summary: {
                siteId,
                isEnhanced,
              },
            }),
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
      rejectDreamsignOffer,
      ensureEssenceSiteRuntime,
      acceptEssenceSite,
      ensureShopRuntime,
      buyShopSlot,
      rerollShop,
      ensureCardChoiceRuntime,
      acceptTransfigurationChoice,
      acceptDuplicationChoice,
      completeDreamJourneySite,
      pickDraftCard,
      addCard,
      addBaneCard: (_cardNumber: number, _source: string) => {
        unavailableMutation("addBaneCard");
      },
      removeCard: (_entryId: string, _source: string) => {
        unavailableMutation("removeCard");
      },
      cleanseBanes,
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
      incrementCompletionLevel,
      setScreen,
      markSiteVisited,
      setCurrentDreamscape,
      updateAtlas,
      setDraftState,
      setFailureSummary,
      dismissStartingDeckPopup,
      bootstrapStartInBattle,
      resetQuest,
    }),
    [
      addCard,
      addDreamsign,
      bootstrapStartInBattle,
      buyShopSlot,
      changeEssence,
      cleanseBanes,
      completeSite,
      dismissStartingDeckPopup,
      ensureRewardSiteRuntime,
      acceptRewardSite,
      ensureDreamsignOfferRuntime,
      acceptDreamsignOffer,
      rejectDreamsignOffer,
      ensureEssenceSiteRuntime,
      acceptEssenceSite,
      ensureCardChoiceRuntime,
      acceptTransfigurationChoice,
      acceptDuplicationChoice,
      completeDreamJourneySite,
      ensureShopRuntime,
      incrementCompletionLevel,
      markSiteVisited,
      pickDraftCard,
      rerollShop,
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

  return <QuestContextProvider value={value}>{children}</QuestContextProvider>;
}
