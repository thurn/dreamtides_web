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
import type { BattleId } from "./types/identifiers";
import type { CardId, CardName, CardSubtype } from "./types/card-identity";
import type { BattleCardId, NoteId } from "./types/identifiers";

/** Base structure for all log events. */
export interface LogEntry {
  timestamp: string;
  event: string;
  seq: number;
  [key: string]: unknown;
}

declare const battleDestinationLogLabelBrand: unique symbol;
export type BattleDestinationLogLabel = string & {
  readonly [battleDestinationLogLabelBrand]: "BattleDestinationLogLabel";
};

export function parseBattleDestinationLogLabel(
  value: unknown,
): BattleDestinationLogLabel {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Battle destination log label must be a non-empty string.");
  }
  return value as BattleDestinationLogLabel;
}

type LogListener = () => void;

/**
 * Receives every {@link logEvent} entry as it is emitted, for transports beyond
 * the in-memory accumulator. Best-effort: a throwing sink is swallowed so
 * logging never wedges the caller.
 */
export type LogSink = (entry: Readonly<LogEntry>) => void;

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

// Ambient fields merged into every event so a whole session can be filtered out
// of the shared `logs/journey-log.jsonl`. Opening a local game sets `{ gameId }`,
// which is what lets `grep '"gameId":"h3ppju"'` isolate one game's events from
// every other run interleaved in the same file. Defaults to empty, so outside a
// game (tests, isolated units) entries are untouched. Explicit `fields` on a
// call win over context; reserved keys can be set by neither.
let logContext: Record<string, unknown> = {};

let logSink: LogSink | null = null;

/**
 * Install (or with `null`, remove) the {@link LogSink} that receives every
 * subsequent {@link logEvent} entry. Replaces any previously installed sink.
 */
export function setLogSink(sink: LogSink | null): void {
  logSink = sink;
}

/**
 * Replace the ambient log context merged into every subsequent {@link logEvent}.
 * Reserved keys (`timestamp`, `event`, `seq`) are stripped. Pass `{}` (or call
 * {@link clearLogContext}) to detach the context when leaving a game.
 */
export function setLogContext(fields: Record<string, unknown>): void {
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (!RESERVED_KEYS.has(key)) {
      next[key] = fields[key];
    }
  }
  logContext = next;
}

/** Clear the ambient log context. Equivalent to `setLogContext({})`. */
export function clearLogContext(): void {
  logContext = {};
}

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
    ...logContext,
    ...sanitized,
    timestamp: new Date().toISOString(),
    event,
    seq: sequenceCounter,
  };
  console.log(JSON.stringify(entry));
  logAccumulator.push(entry);
  isLogSnapshotDirty = true;
  notifyLogListeners();
  postLogRecordToDevServer(entry);
  const frozen = Object.freeze({ ...entry });
  if (logSink !== null) {
    try {
      logSink(frozen);
    } catch {
      // Best-effort transport: a throwing sink must never break logging.
    }
  }
  return frozen;
}

/**
 * Posts one record to the Vite dev-server `/api/log` middleware, which appends
 * it to `logs/journey-log.jsonl`. Best effort: a no-op without `fetch` or under
 * Vitest (`import.meta.env.MODE === "test"`), and a failed request is
 * swallowed so logging never wedges the caller.
 */
function postLogRecordToDevServer(record: Readonly<Record<string, unknown>>): void {
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
    body: JSON.stringify(record),
  }).catch(() => {
    // Intentional: dev-server logging is best-effort.
  });
}

/** A fully shaped journey-log line that carries its own fields, `seq` included. */
export type JourneyLogRecord = Readonly<Record<string, unknown>>;

/** Delivers a fully shaped record to the journey-log.jsonl transports. */
export type JourneyLogMirror = (record: JourneyLogRecord) => void;

export interface JourneyLogMirrorDeps {
  /** Console transport. Defaults to a single-line `console.log`. */
  log?: (line: string) => void;
  /** Dev-server transport. Defaults to a best-effort `/api/log` POST. */
  post?: (record: JourneyLogRecord) => void;
}

/**
 * Build the journey-log.jsonl mirror for records that carry their own `seq`
 * (the event log's seq), which {@link logEvent} would replace with its
 * per-session line counter. The record reaches the console and the dev-server
 * `/api/log` sink verbatim. Transports are injectable for tests.
 */
export function createJourneyLogMirror(
  deps: JourneyLogMirrorDeps = {},
): JourneyLogMirror {
  const log = deps.log ?? ((line: string) => console.log(line));
  const post = deps.post ?? postLogRecordToDevServer;
  return (record) => {
    log(JSON.stringify(record));
    post(record);
  };
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
  state: Pick<
    BattleMutableState,
    "battleId" | "turnNumber" | "phase" | "activeSide"
  >,
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: BattleCardId | null;
  },
): {
  battleId: BattleId;
  turnNumber: number;
  phase: BattleMutableState["phase"];
  activeSide: BattleMutableState["activeSide"];
  sourceSurface: BattleCommandSourceSurface;
  selectedCardId: BattleCardId | null;
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
  state: Pick<
    BattleMutableState,
    "battleId" | "turnNumber" | "phase" | "activeSide"
  >,
  payload: {
    battleCardId: BattleCardId;
    noteId: NoteId;
    text: string;
    expiry: BattleCardNoteExpiry;
    createdAtTurnNumber: number;
    createdAtSide: BattleSide;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: BattleCardId | null;
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
      expirySide:
        payload.expiry.kind === "atStartOfTurn" ? payload.expiry.side : null,
      expiryTurnNumber:
        payload.expiry.kind === "atStartOfTurn"
          ? payload.expiry.turnNumber
          : null,
      noteId: payload.noteId,
      text: payload.text,
    },
  };
}

export function createBattleProtoNoteDismissedLogEvent(
  state: Pick<
    BattleMutableState,
    "battleId" | "turnNumber" | "phase" | "activeSide"
  >,
  payload: {
    battleCardId: BattleCardId;
    noteId: NoteId;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: BattleCardId | null;
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
  state: Pick<
    BattleMutableState,
    "battleId" | "turnNumber" | "phase" | "activeSide"
  >,
  payload: {
    battleCardId: BattleCardId;
    noteCount: number;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: BattleCardId | null;
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

export function createBattleProtoCardCreatedLogEvent(
  state: Pick<
    BattleMutableState,
    "battleId" | "turnNumber" | "phase" | "activeSide"
  >,
  payload: {
    battleCardId: BattleCardId;
    provenanceKind: "generated-copy" | "generated-figment" | "generated-pool";
    sourceBattleCardId: BattleCardId | null;
    name: CardName;
    subtype: CardSubtype;
    printedSpark: number;
    ownerSide: BattleSide;
    destinationZone: BattleDestinationLogLabel;
    figmentCount?: number;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: BattleCardId | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_card_created",
    fields: {
      ...createBattleLogBaseFields(state, context),
      battleCardId: payload.battleCardId,
      destinationZone: payload.destinationZone,
      ...(payload.figmentCount === undefined
        ? {}
        : { figmentCount: payload.figmentCount }),
      name: payload.name,
      ownerSide: payload.ownerSide,
      printedSpark: payload.printedSpark,
      provenanceKind: payload.provenanceKind,
      sourceBattleCardId: payload.sourceBattleCardId,
      subtype: payload.subtype,
    },
  };
}

export function createBattleProtoFigmentsMergedLogEvent(
  state: Pick<
    BattleMutableState,
    "battleId" | "turnNumber" | "phase" | "activeSide"
  >,
  payload: {
    sourceBattleCardId: BattleCardId;
    destinationBattleCardId: BattleCardId;
    figmentId: CardId;
    addedSpark: number;
    destinationSparkBefore: number;
    destinationSparkAfter: number;
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: BattleCardId | null;
  },
): BattleDeferredLogEvent {
  return {
    event: "battle_proto_figments_merged",
    fields: {
      ...createBattleLogBaseFields(state, context),
      sourceBattleCardId: payload.sourceBattleCardId,
      destinationBattleCardId: payload.destinationBattleCardId,
      figmentId: payload.figmentId,
      addedSpark: payload.addedSpark,
      destinationSparkBefore: payload.destinationSparkBefore,
      destinationSparkAfter: payload.destinationSparkAfter,
    },
  };
}

export function createBattleProtoDeckReorderedLogEvent(
  state: Pick<
    BattleMutableState,
    "battleId" | "turnNumber" | "phase" | "activeSide"
  >,
  payload: {
    side: BattleSide;
    orderBefore: readonly BattleCardId[];
    orderAfter: readonly BattleCardId[];
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: BattleCardId | null;
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
  state: Pick<
    BattleMutableState,
    "battleId" | "turnNumber" | "phase" | "activeSide"
  >,
  payload: {
    battleCardId: BattleCardId;
    markers: BattleCardMarkers;
    diff: {
      prevented: "set" | "cleared" | "unchanged";
      copied: "set" | "cleared" | "unchanged";
    };
  },
  context: {
    sourceSurface: BattleCommandSourceSurface;
    selectedCardId: BattleCardId | null;
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
): BattleCardId | null {
  const cardTarget = metadata.targets.find((target) => target.kind === "card");
  return cardTarget?.ref ?? null;
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
  logContext = {};
  logSink = null;
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
  const filename = `journey-log-${timestamp}.jsonl`;

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
