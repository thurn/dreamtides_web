import type {
  BattleCardMarkers,
  BattleCardNoteExpiry,
  BattleCommandSourceSurface,
  BattleDeferredLogEvent,
  BattleHistoryEntryMetadata,
  BattleMutableState,
  BattleSide,
} from "./battle/types";
import { BATTLE_MARKER_SET_EVENT } from "./battle/state/markers-utils";

/** Base structure for all log events. */
export interface LogEntry {
  timestamp: string;
  event: string;
  seq: number;
  [key: string]: unknown;
}

type LogListener = () => void;

const RESERVED_KEYS: ReadonlySet<string> = new Set([
  "timestamp",
  "event",
  "seq",
]);

let sequenceCounter = 0;
const logAccumulator: LogEntry[] = [];
const logListeners = new Set<LogListener>();
const onceKeys = new Set<string>();
let logSnapshotCache: ReadonlyArray<Readonly<LogEntry>> = [];
let isLogSnapshotDirty = false;

/**
 * Log a structured event. Assigns timestamp and sequence number
 * automatically, writes single-line JSON to console.log, and stores
 * the entry in the in-memory accumulator.
 *
 * Reserved fields (`timestamp`, `event`, `seq`) in the additional
 * fields parameter are silently stripped so that logger-assigned
 * values are always authoritative.
 */
export function logEvent(
  event: string,
  fields: Record<string, unknown> = {},
): Readonly<LogEntry> {
  sequenceCounter += 1;
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (!RESERVED_KEYS.has(key)) {
      sanitized[key] = fields[key];
    }
  }
  const entry: LogEntry = {
    ...sanitized,
    timestamp: new Date().toISOString(),
    event,
    seq: sequenceCounter,
  };
  console.log(JSON.stringify(entry));
  logAccumulator.push(entry);
  isLogSnapshotDirty = true;
  notifyLogListeners();
  postLogEntryToDevServer(entry);
  return Object.freeze({ ...entry });
}

/**
 * Posts the entry to the Vite dev-server `/api/log` middleware on a
 * best-effort basis. In test environments (where `fetch` is unmocked or the
 * dev server is unreachable) this is a no-op: we silently drop the request so
 * unit tests don't emit unhandled rejections. Production runtime behavior is
 * unchanged — fire-and-forget with errors swallowed is intentional for the
 * dev-log transport per spec §L.
 */
function postLogEntryToDevServer(entry: LogEntry): void {
  if (typeof fetch !== "function") {
    return;
  }
  // `import.meta.env.MODE === "test"` is set by Vitest; skipping the fetch
  // there avoids opening sockets against nothing and makes the test-time
  // behavior deterministic (bug-092).
  try {
    const env = (import.meta as { env?: { MODE?: string } }).env;
    if (env?.MODE === "test") {
      return;
    }
  } catch {
    // If `import.meta.env` is unavailable (older runtimes), fall through to
    // the real fetch — the `.catch` handler below still guards against
    // unhandled rejections.
  }
  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {
    // Intentional: dev-server logging is best-effort. See `postLogEntryToDevServer`.
  });
}

export function logEventOnce(
  key: string,
  event: string,
  fields: Record<string, unknown> = {},
): Readonly<LogEntry> | null {
  if (onceKeys.has(key)) {
    return null;
  }

  onceKeys.add(key);
  return logEvent(event, fields);
}

/**
 * Produces the six common `battle_proto_*` log fields shared by every
 * battle-module event per spec §L (L-4): `battleId`, `turnNumber`, `phase`,
 * `activeSide`, `sourceSurface`, and `selectedCardId`. `selectedCardId`
 * should be the `battleCardId` of the card the action primarily affects, or
 * `null` when the action is not card-scoped (e.g. end-turn, force-result).
 */
export function createBattleLogBaseFields(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): {
  battleId: string;
  turnNumber: number;
  phase: BattleMutableState["phase"];
  activeSide: BattleMutableState["activeSide"];
  sourceSurface: BattleCommandSourceSurface;
  selectedCardId: string | null;
} {
  return {
    battleId: state.battleId,
    turnNumber: state.turnNumber,
    phase: state.phase,
    activeSide: state.activeSide,
    sourceSurface: context.sourceSurface,
    selectedCardId: context.selectedCardId,
  };
}

export function createBattleProtoNoteAddedLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    battleCardId: string;
    noteId: string;
    text: string;
    expiry: BattleCardNoteExpiry;
    createdAtTurnNumber: number;
    createdAtSide: BattleSide;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_note_added",
    fields: {
      ...createBattleLogBaseFields(state, context),
      battleCardId: payload.battleCardId,
      createdAtSide: payload.createdAtSide,
      createdAtTurnNumber: payload.createdAtTurnNumber,
      expiryKind: payload.expiry.kind,
      expirySide: payload.expiry.kind === "atStartOfTurn" ? payload.expiry.side : null,
      expiryTurnNumber:
        payload.expiry.kind === "atStartOfTurn" ? payload.expiry.turnNumber : null,
      noteId: payload.noteId,
      text: payload.text,
    },
  };
}

export function createBattleProtoNoteDismissedLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    battleCardId: string;
    noteId: string;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_note_dismissed",
    fields: {
      ...createBattleLogBaseFields(state, context),
      battleCardId: payload.battleCardId,
      noteId: payload.noteId,
    },
  };
}

export function createBattleProtoNoteClearedLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    battleCardId: string;
    noteCount: number;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_note_cleared",
    fields: {
      ...createBattleLogBaseFields(state, context),
      battleCardId: payload.battleCardId,
      noteCount: payload.noteCount,
    },
  };
}

export function createBattleProtoNoteExpiredLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    battleCardId: string;
    noteId: string;
    expirySide: BattleSide;
    expiryTurnNumber: number;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_note_expired",
    fields: {
      ...createBattleLogBaseFields(state, context),
      battleCardId: payload.battleCardId,
      expiryKind: "atStartOfTurn",
      expirySide: payload.expirySide,
      expiryTurnNumber: payload.expiryTurnNumber,
      noteId: payload.noteId,
    },
  };
}

export function createBattleProtoCardCreatedLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    battleCardId: string;
    provenanceKind: "generated-copy" | "generated-figment";
    sourceBattleCardId: string | null;
    name: string;
    subtype: string;
    printedSpark: number;
    ownerSide: BattleSide;
    destinationZone: string;
    figmentCount?: number;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_card_created",
    fields: {
      ...createBattleLogBaseFields(state, context),
      battleCardId: payload.battleCardId,
      destinationZone: payload.destinationZone,
      ...(payload.figmentCount === undefined ? {} : { figmentCount: payload.figmentCount }),
      name: payload.name,
      ownerSide: payload.ownerSide,
      printedSpark: payload.printedSpark,
      provenanceKind: payload.provenanceKind,
      sourceBattleCardId: payload.sourceBattleCardId,
      subtype: payload.subtype,
    },
  };
}

export function createBattleProtoDeckReorderedLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    side: BattleSide;
    orderBefore: readonly string[];
    orderAfter: readonly string[];
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_deck_reordered",
    fields: {
      ...createBattleLogBaseFields(state, context),
      side: payload.side,
      orderBefore: payload.orderBefore,
      orderAfter: payload.orderAfter,
    },
  };
}

export function createBattleProtoMarkerSetLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    battleCardId: string;
    markers: BattleCardMarkers;
    diff: {
      prevented: "set" | "cleared" | "unchanged";
      copied: "set" | "cleared" | "unchanged";
    };
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: BATTLE_MARKER_SET_EVENT,
    fields: {
      ...createBattleLogBaseFields(state, context),
      battleCardId: payload.battleCardId,
      diff: payload.diff,
      markers: payload.markers,
    },
  };
}

export function createBattleProtoExtraTurnGrantedLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    grantedSide: BattleSide;
    pendingExtraTurnsAfter: number;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_extra_turn_granted",
    fields: {
      ...createBattleLogBaseFields(state, context),
      grantedSide: payload.grantedSide,
      pendingExtraTurnsAfter: payload.pendingExtraTurnsAfter,
    },
  };
}

export function createBattleProtoExtraTurnConsumedLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    consumedSide: BattleSide;
    pendingExtraTurnsAfter: number;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_extra_turn_consumed",
    fields: {
      ...createBattleLogBaseFields(state, context),
      consumedSide: payload.consumedSide,
      pendingExtraTurnsAfter: payload.pendingExtraTurnsAfter,
    },
  };
}

export function createBattleProtoExtraJudgmentLogEvent(
  state: Pick<BattleMutableState, "battleId" | "turnNumber" | "phase" | "activeSide">,
  payload: {
    resolvedSide: BattleSide;
    dissolvedCardIds: readonly string[];
    scoreChange: number;
    forced: true;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: string | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_extra_judgment",
    fields: {
      ...createBattleLogBaseFields(state, context),
      resolvedSide: payload.resolvedSide,
      dissolvedCardIds: payload.dissolvedCardIds,
      scoreChange: payload.scoreChange,
      forced: payload.forced,
    },
  };
}

export function logBattleCommandApplied(
  metadata: BattleHistoryEntryMetadata,
  state: BattleMutableState,
): Readonly<LogEntry> {
  return logEvent("battle_proto_command_applied", {
    ...createBattleLogBaseFields(state, {
      sourceSurface: metadata.sourceSurface,
      selectedCardId: selectSelectedCardIdFromMetadata(metadata),
    }),
    commandId: metadata.commandId,
    forcedResult: state.forcedResult,
    isComposite: metadata.isComposite,
    kind: metadata.kind,
    label: metadata.label,
    result: state.result,
  });
}

function selectSelectedCardIdFromMetadata(
  metadata: BattleHistoryEntryMetadata,
): string | null {
  const cardTarget = metadata.targets.find((target) => target.kind === "card");
  return cardTarget === undefined ? null : cardTarget.ref;
}

export function logBattleHistoryEvent(
  event: "battle_proto_history_undo" | "battle_proto_history_redo",
  metadata: BattleHistoryEntryMetadata,
  state: BattleMutableState,
  historyCounts: {
    futureCount: number;
    historyCount: number;
  },
): Readonly<LogEntry> {
  return logEvent(event, {
    ...createBattleLogBaseFields(state, {
      sourceSurface: metadata.sourceSurface,
      selectedCardId: selectSelectedCardIdFromMetadata(metadata),
    }),
    commandId: metadata.commandId,
    forcedResult: state.forcedResult,
    futureCount: historyCounts.futureCount,
    historyCount: historyCounts.historyCount,
    isComposite: metadata.isComposite,
    kind: metadata.kind,
    label: metadata.label,
    result: state.result,
  });
}

/** Returns a deep-copied snapshot of all accumulated log entries. */
export function getLogEntries(): ReadonlyArray<Readonly<LogEntry>> {
  if (!isLogSnapshotDirty) {
    return logSnapshotCache;
  }

  logSnapshotCache = logAccumulator.map((e) => Object.freeze({ ...e }));
  isLogSnapshotDirty = false;
  return logSnapshotCache;
}

export function subscribeLogEntries(listener: LogListener): () => void {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}

/** Clears the in-memory log accumulator and resets the sequence counter. */
export function resetLog(): void {
  sequenceCounter = 0;
  logAccumulator.length = 0;
  onceKeys.clear();
  logSnapshotCache = [];
  isLogSnapshotDirty = false;
  notifyLogListeners();
}

/**
 * Downloads the accumulated log as a `.jsonl` file. Each entry is
 * serialized as a single JSON line. The filename includes an ISO
 * timestamp for uniqueness.
 */
export function downloadLog(): void {
  const lines = logAccumulator.map((entry) => JSON.stringify(entry));
  const content = lines.join("\n") + "\n";
  const blob = new Blob([content], { type: "application/x-jsonlines" });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `quest-log-${timestamp}.jsonl`;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function notifyLogListeners(): void {
  for (const listener of logListeners) {
    listener();
  }
}
