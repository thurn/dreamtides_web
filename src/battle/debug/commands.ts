import {
  selectKindleTargetBattleCardId,
  selectShouldEndTurnFromDay,
} from "../state/selectors";
import type {
  BattleCardMarkers,
  BattleCardNoteExpiry,
  BattleCommandActor,
  BattleCommandSourceSurface,
  BattleCommandTarget,
  BattleFieldSlotAddress,
  BattleHistoryEntryKind,
  BattleHistoryEntryMetadata,
  BattleMutableState,
  BattleResult,
  BattleSide,
} from "../types";

export type BattleCommandId =
  | "END_TURN"
  | "PASS_PHASE"
  | "PLAY_CARD"
  | "PLAY_CARD_TO_STACK"
  | "MOVE_STACK_CARD"
  | "MOVE_CARD"
  | "DEBUG_EDIT"
  | "FORCE_RESULT"
  | "SKIP_TO_REWARDS";

export type BattleDebugZoneDestination =
  | BattleFieldSlotAddress
  | {
    side: BattleSide;
    zone: "hand" | "void" | "banished" | "stack";
  }
  | {
    side: BattleSide;
    zone: "deck";
    position: "top" | "bottom";
  };

export type BattleDebugEdit =
  | {
    kind: "SET_SCORE";
    side: BattleSide;
    value: number;
  }
  | {
    kind: "SET_CURRENT_ENERGY";
    side: BattleSide;
    value: number;
  }
  | {
    kind: "SET_MAX_ENERGY";
    side: BattleSide;
    value: number;
  }
  | {
    kind: "ADJUST_SCORE";
    side: BattleSide;
    amount: number;
  }
  | {
    kind: "ADJUST_CURRENT_ENERGY";
    side: BattleSide;
    amount: number;
  }
  | {
    kind: "ADJUST_MAX_ENERGY";
    side: BattleSide;
    amount: number;
  }
  | {
    kind: "SET_CARD_SPARK";
    battleCardId: string;
    value: number;
  }
  | {
    kind: "SET_CARD_SPARK_DELTA";
    battleCardId: string;
    value: number;
  }
  | {
    kind: "MOVE_CARD_TO_ZONE";
    battleCardId: string;
    destination: BattleDebugZoneDestination;
  }
  | {
    kind: "SWAP_BATTLEFIELD_SLOTS";
    source: BattleFieldSlotAddress;
    target: BattleFieldSlotAddress;
  }
  | {
    kind: "DRAW_CARD";
    side: BattleSide;
  }
  | {
    kind: "DISCARD_CARD";
    battleCardId: string;
  }
  | {
    kind: "KINDLE";
    side: BattleSide;
    amount: number;
    preferredBattleCardId?: string | null;
  }
  | {
    kind: "SET_CARD_VISIBILITY";
    battleCardId: string;
    isRevealedToPlayer: boolean;
  }
  | {
    kind: "SET_SIDE_HAND_VISIBILITY";
    side: BattleSide;
    isRevealedToPlayer: boolean;
  }
  | {
    kind: "ADD_CARD_NOTE";
    battleCardId: string;
    noteId: string;
    text: string;
    createdAtMs: number;
    expiry: BattleCardNoteExpiry;
  }
  | {
    kind: "DISMISS_CARD_NOTE";
    battleCardId: string;
    noteId: string;
  }
  | {
    kind: "CLEAR_CARD_NOTES";
    battleCardId: string;
  }
  | {
    kind: "SET_CARD_MARKERS";
    battleCardId: string;
    markers: BattleCardMarkers;
  }
  | {
    kind: "CREATE_CARD_COPY";
    sourceBattleCardId: string;
    destination: BattleDebugZoneDestination;
    createdAtMs: number;
  }
  | {
    kind: "CREATE_FIGMENT";
    side: BattleSide;
    chosenSubtype: string;
    chosenSpark: number;
    name: string;
    destination: BattleDebugZoneDestination;
    createdAtMs: number;
  }
  | {
    kind: "REORDER_DECK";
    side: BattleSide;
    order: readonly string[];
  }
  | {
    kind: "REVEAL_DECK_TOP";
    side: BattleSide;
    count: number;
  }
  | {
    // bug-103: inverse of `REVEAL_DECK_TOP`; hides the top N cards of the
    // deck so the per-card sticky reveal bit set by Foresee / S-1 can be
    // cleared without relying on undo.
    kind: "HIDE_DECK_TOP";
    side: BattleSide;
    count: number;
  }
  | {
    kind: "PLAY_FROM_DECK_TOP";
    side: BattleSide;
    target?: BattleFieldSlotAddress;
  }
  | {
    kind: "FORCE_JUDGMENT";
    side: BattleSide;
  }
  | {
    kind: "GRANT_EXTRA_TURN";
    side: BattleSide;
  };

export interface BattleCommandEnvelope {
  actor?: BattleCommandActor;
  sourceSurface?: BattleCommandSourceSurface;
  /**
   * Wall-clock timestamp in ms; the default is filled in by
   * `createBattleCommandMetadata` at dispatch time. Commands are free to
   * override (e.g. tests that pin the field to a deterministic value).
   */
  timestamp?: number;
}

/**
 * Returns a shallow copy of `command` with its `sourceSurface` defaulted to
 * `defaultSourceSurface` when not already set. Shared by every debug surface
 * that proxies commands up to the screen-level dispatcher (Inspector,
 * ZoneBrowser, etc.) so surface-source defaulting stays consistent across
 * component boundaries — bug-077.
 */
export function withDefaultSourceSurface(
  command: BattleCommand,
  defaultSourceSurface: BattleCommandSourceSurface,
): BattleCommand {
  return {
    ...command,
    sourceSurface: command.sourceSurface ?? defaultSourceSurface,
  };
}

export type BattleCommand =
  | ({
    id: "END_TURN";
  } & BattleCommandEnvelope)
  | ({
    id: "PASS_PHASE";
  } & BattleCommandEnvelope)
  | ({
    id: "PLAY_CARD";
    battleCardId: string;
    target?: BattleFieldSlotAddress;
  } & BattleCommandEnvelope)
  | ({
    id: "PLAY_CARD_TO_STACK";
    battleCardId: string;
  } & BattleCommandEnvelope)
  | ({
    id: "MOVE_STACK_CARD";
    battleCardId: string;
    target: BattleFieldSlotAddress | { side: BattleSide; zone: "void" | "banished" };
  } & BattleCommandEnvelope)
  | ({
    id: "MOVE_CARD";
    battleCardId: string;
    target: BattleFieldSlotAddress;
  } & BattleCommandEnvelope)
  | ({
    id: "DEBUG_EDIT";
    edit: BattleDebugEdit;
  } & BattleCommandEnvelope)
  | ({
    id: "FORCE_RESULT";
    result: BattleResult;
  } & BattleCommandEnvelope)
  | ({
    id: "SKIP_TO_REWARDS";
  } & BattleCommandEnvelope);

export function createBattleCommandMetadata(
  command: BattleCommand,
  state: BattleMutableState,
): BattleHistoryEntryMetadata {
  const envelope = {
    actor: command.actor ?? inferCommandActor(command),
    sourceSurface: command.sourceSurface ?? "action-bar",
    timestamp: command.timestamp ?? Date.now(),
  };

  // Spec §H-4: populate `payload` with the command's user-facing arguments so
  // the envelope is self-describing for inspector tooling and log consumers.
  // Undo still reads from full-state snapshots (bug-020 / §H-6).
  const metadata = (() => {
    switch (command.id) {
      case "END_TURN":
        return createEndTurnHistoryMetadata(envelope);
      case "PASS_PHASE":
        return createPassPhaseHistoryMetadata(state, envelope);
      case "PLAY_CARD":
        return createPlayCardHistoryMetadata(state, command.battleCardId, envelope);
      case "PLAY_CARD_TO_STACK":
        return createPlayCardToStackHistoryMetadata(state, command.battleCardId, envelope);
      case "MOVE_STACK_CARD":
        return createMoveStackCardHistoryMetadata(state, command.battleCardId, envelope);
      case "MOVE_CARD":
        return createMoveCardHistoryMetadata(
          state,
          command.battleCardId,
          command.target,
          envelope,
        );
      case "DEBUG_EDIT":
        return createDebugEditHistoryMetadata(command.edit, state, envelope);
      case "FORCE_RESULT":
        return createForceResultHistoryMetadata(command.result, envelope);
      case "SKIP_TO_REWARDS":
        return createSkipToRewardsHistoryMetadata(envelope);
    }
  })();

  return { ...metadata, payload: buildCommandPayload(command) };
}

function buildCommandPayload(
  command: BattleCommand,
): Record<string, unknown> {
  switch (command.id) {
    case "END_TURN":
    case "PASS_PHASE":
    case "SKIP_TO_REWARDS":
      return {};
    case "PLAY_CARD":
      return {
        battleCardId: command.battleCardId,
        target: command.target ?? null,
      };
    case "PLAY_CARD_TO_STACK":
      return { battleCardId: command.battleCardId };
    case "MOVE_STACK_CARD":
      return {
        battleCardId: command.battleCardId,
        target: command.target,
      };
    case "MOVE_CARD":
      return {
        battleCardId: command.battleCardId,
        target: command.target,
      };
    case "DEBUG_EDIT":
      return { edit: command.edit };
    case "FORCE_RESULT":
      return { result: command.result };
  }
}

export function createEndTurnHistoryMetadata(
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  return createMetadata({
    commandId: "END_TURN",
    label: "End Turn",
    kind: "battle-flow",
    isComposite: true,
    targets: [],
    envelope,
    defaultActor: "player",
  });
}

export function createPassPhaseHistoryMetadata(
  state: BattleMutableState,
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  const isEndTurnComposite = state.phase === "night" || selectShouldEndTurnFromDay(state);
  return createMetadata({
    commandId: "PASS_PHASE",
    label: isEndTurnComposite ? "End Turn" : "End Phase",
    kind: "battle-flow",
    isComposite: isEndTurnComposite,
    targets: [],
    envelope,
    defaultActor: "player",
  });
}

export function createPlayCardHistoryMetadata(
  state: BattleMutableState,
  battleCardId: string,
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  // Actor default is "player" to align with `inferCommandActor` used by
  // `createBattleCommandMetadata`. Both paths now agree that PLAY/MOVE
  // originate from the player surface by default; actors wanting to record
  // an enemy/debug dispatch must set `envelope.actor` explicitly (bug-078).
  return createMetadata({
    commandId: "PLAY_CARD",
    label: `Play ${readCardName(state, battleCardId)}`,
    kind: "zone-move",
    isComposite: false,
    targets: [makeCardTarget(battleCardId)],
    envelope,
    defaultActor: "player",
  });
}

export function createPlayCardToStackHistoryMetadata(
  state: BattleMutableState,
  battleCardId: string,
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  return createMetadata({
    commandId: "PLAY_CARD_TO_STACK",
    label: `Stack ${readCardName(state, battleCardId)}`,
    kind: "zone-move",
    isComposite: false,
    targets: [makeCardTarget(battleCardId)],
    envelope,
    defaultActor: "player",
  });
}

export function createMoveStackCardHistoryMetadata(
  state: BattleMutableState,
  battleCardId: string,
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  return createMetadata({
    commandId: "MOVE_STACK_CARD",
    label: `Resolve ${readCardName(state, battleCardId)}`,
    kind: "zone-move",
    isComposite: false,
    targets: [makeCardTarget(battleCardId)],
    envelope,
    defaultActor: "player",
  });
}

export function createMoveCardHistoryMetadata(
  state: BattleMutableState,
  battleCardId: string,
  target: BattleFieldSlotAddress,
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  // See `createPlayCardHistoryMetadata`: default actor is "player" (bug-078).
  // The previous `inferOwnerActor` default caused MOVE_CARD dispatched
  // against an enemy-controlled card to log `actor: "enemy"` even though
  // every user-facing MOVE_CARD originates from the player surface.
  return createMetadata({
    commandId: "MOVE_CARD",
    label: `Move ${readCardName(state, battleCardId)}`,
    kind: "battlefield-position",
    isComposite: false,
    targets: [makeCardTarget(battleCardId), makeSlotTarget(target)],
    envelope,
    defaultActor: "player",
  });
}

export function createDebugEditHistoryMetadata(
  edit: BattleDebugEdit,
  state: BattleMutableState,
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  return createMetadata({
    commandId: formatDebugEditCommandId(edit),
    label: createDebugEditLabel(edit, state),
    kind: resolveDebugEditKind(edit),
    isComposite: isCompositeDebugEdit(edit),
    targets: collectDebugEditTargets(edit, state),
    envelope,
    defaultActor: "debug",
  });
}

export function createForceResultHistoryMetadata(
  result: BattleResult,
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  return createMetadata({
    commandId: "FORCE_RESULT",
    label: `Force ${formatResultLabel(result)}`,
    kind: "result",
    isComposite: true,
    targets: [],
    envelope,
    defaultActor: "debug",
  });
}

export function createSkipToRewardsHistoryMetadata(
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  return createMetadata({
    commandId: "SKIP_TO_REWARDS",
    label: "Skip To Rewards",
    kind: "result",
    isComposite: true,
    targets: [],
    envelope,
    defaultActor: "debug",
  });
}

export function createRunAiTurnHistoryMetadata(
  envelope: BattleCommandMetadataEnvelope = {},
): BattleHistoryEntryMetadata {
  return createMetadata({
    commandId: "RUN_AI_TURN",
    label: "Enemy Turn",
    kind: "battle-flow",
    isComposite: true,
    targets: [],
    envelope,
    defaultActor: "enemy",
    defaultSourceSurface: "auto-ai",
  });
}

export function createRecomputeResultHistoryMetadata({
  commandId,
  kind,
  label,
}: {
  commandId: string;
  kind: BattleHistoryEntryKind;
  label: string;
}): BattleHistoryEntryMetadata {
  // bug-046: every other reducer action carries full metadata; this factory
  // no longer back-fills defaults so callers state their intent explicitly.
  return createMetadata({
    commandId,
    label,
    kind,
    isComposite: false,
    targets: [],
    envelope: {},
    defaultActor: "system",
    defaultSourceSurface: "auto-system",
  });
}

/**
 * Spec H-20 / §H auto-clear: metadata for the engine-internal history entry
 * that records auto-clearing a `forcedResult` after the recomputation runs.
 * Moved here (bug-080) so every metadata factory lives in `commands.ts`.
 */
export function createClearForcedResultMetadata(): BattleHistoryEntryMetadata {
  return createMetadata({
    commandId: "CLEAR_FORCED_RESULT",
    label: "Clear Forced Result",
    kind: "result",
    isComposite: false,
    targets: [],
    envelope: {},
    defaultActor: "system",
    defaultSourceSurface: "auto-system",
  });
}

export interface BattleCommandMetadataEnvelope {
  actor?: BattleCommandActor;
  sourceSurface?: BattleCommandSourceSurface;
  timestamp?: number;
}

function createMetadata({
  commandId,
  label,
  kind,
  isComposite,
  targets,
  envelope,
  defaultActor,
  defaultSourceSurface,
}: {
  commandId: string;
  label: string;
  kind: BattleHistoryEntryKind;
  isComposite: boolean;
  targets: readonly BattleCommandTarget[];
  envelope: BattleCommandMetadataEnvelope;
  defaultActor: BattleCommandActor;
  defaultSourceSurface?: BattleCommandSourceSurface;
}): BattleHistoryEntryMetadata {
  return {
    commandId,
    label,
    kind,
    isComposite,
    actor: envelope.actor ?? defaultActor,
    sourceSurface: envelope.sourceSurface ?? defaultSourceSurface ?? "action-bar",
    targets: targets.map((target) => ({ ...target })),
    timestamp: envelope.timestamp ?? Date.now(),
    undoPayload: null,
  };
}

function inferCommandActor(command: BattleCommand): BattleCommandActor {
  switch (command.id) {
    case "END_TURN":
    case "PASS_PHASE":
    case "PLAY_CARD":
    case "PLAY_CARD_TO_STACK":
    case "MOVE_STACK_CARD":
    case "MOVE_CARD":
      return "player";
    case "DEBUG_EDIT":
    case "FORCE_RESULT":
    case "SKIP_TO_REWARDS":
      return "debug";
  }
}

function makeCardTarget(battleCardId: string): BattleCommandTarget {
  return {
    kind: "card",
    ref: battleCardId,
  };
}

function makeSlotTarget(target: BattleFieldSlotAddress): BattleCommandTarget {
  return {
    kind: "slot",
    ref: `${target.side}:${target.zone}:${target.slotId}`,
  };
}

function makeSideTarget(side: BattleSide): BattleCommandTarget {
  return {
    kind: "side",
    ref: side,
  };
}

function makeZoneTarget(
  side: BattleSide,
  zone: "deck" | "hand" | "void" | "banished" | "reserve" | "deployed" | "stack",
): BattleCommandTarget {
  return {
    kind: "zone",
    ref: `${side}:${zone}`,
  };
}

function resolveDebugEditKind(edit: BattleDebugEdit): BattleHistoryEntryKind {
  switch (edit.kind) {
    case "SET_SCORE":
    case "ADJUST_SCORE":
    case "SET_CURRENT_ENERGY":
    case "ADJUST_CURRENT_ENERGY":
    case "SET_MAX_ENERGY":
    case "ADJUST_MAX_ENERGY":
      return "numeric-state";
    case "SET_CARD_SPARK":
    case "SET_CARD_SPARK_DELTA":
    case "KINDLE":
    case "ADD_CARD_NOTE":
    case "DISMISS_CARD_NOTE":
    case "CLEAR_CARD_NOTES":
    case "SET_CARD_MARKERS":
      return "card-instance";
    case "MOVE_CARD_TO_ZONE":
    case "DRAW_CARD":
    case "DISCARD_CARD":
    case "CREATE_CARD_COPY":
    case "CREATE_FIGMENT":
    case "REORDER_DECK":
    case "PLAY_FROM_DECK_TOP":
      return "zone-move";
    case "SWAP_BATTLEFIELD_SLOTS":
      return "battlefield-position";
    case "SET_CARD_VISIBILITY":
    case "SET_SIDE_HAND_VISIBILITY":
    case "REVEAL_DECK_TOP":
    case "HIDE_DECK_TOP":
      return "visibility";
    case "FORCE_JUDGMENT":
    case "GRANT_EXTRA_TURN":
      return "battle-flow";
  }
}

/**
 * `isComposite` marks history entries whose single user gesture touches
 * multiple state fields, zone transitions, or log events (spec §H-8/§H-11/
 * §H-16). Used by the UI/log drawer to tag entries that span multiple
 * sub-steps; undo itself is always snapshot-based regardless of this flag.
 *
 * The canonical set (bug-075) is:
 * - `FORCE_JUDGMENT` / `PLAY_FROM_DECK_TOP`: multi-step (judgment + score +
 *   dissolutions / deck-to-hand + play).
 * - `KINDLE`: spec §H-16 example (spark + card instance + log).
 * - `CREATE_CARD_COPY` / `CREATE_FIGMENT`: mint instance + bump ordinal +
 *   insert into target zone, atomically.
 * - `MOVE_CARD_TO_ZONE`: zone transition; the battlefield-to-battlefield
 *   path also edits three fields (source slot, target slot, controller),
 *   and cross-zone moves are enough to warrant the flag for log clarity.
 * - All simple numeric edits, flag toggles, and visibility changes stay
 *   non-composite.
 */
function isCompositeDebugEdit(edit: BattleDebugEdit): boolean {
  switch (edit.kind) {
    case "FORCE_JUDGMENT":
    case "PLAY_FROM_DECK_TOP":
    case "KINDLE":
    case "CREATE_CARD_COPY":
    case "CREATE_FIGMENT":
    case "MOVE_CARD_TO_ZONE":
      return true;
    default:
      return false;
  }
}

function collectDebugEditTargets(
  edit: BattleDebugEdit,
  state: BattleMutableState,
): readonly BattleCommandTarget[] {
  switch (edit.kind) {
    case "SET_SCORE":
    case "ADJUST_SCORE":
    case "SET_CURRENT_ENERGY":
    case "ADJUST_CURRENT_ENERGY":
    case "SET_MAX_ENERGY":
    case "ADJUST_MAX_ENERGY":
    case "DRAW_CARD":
      return [makeSideTarget(edit.side)];
    case "SET_SIDE_HAND_VISIBILITY":
      return [makeZoneTarget(edit.side, "hand")];
    case "KINDLE": {
      // Spec §E-11 / §H-16 (bug-073): when the fallback path picks the
      // leftmost deployed/reserve character we still want the resolved
      // target id in history metadata so inspector/log drawer can render
      // "Kindle X on <card>" without re-deriving the fallback rule.
      const resolvedTargetId = selectKindleTargetBattleCardId(
        state,
        edit.side,
        edit.preferredBattleCardId ?? null,
      );
      return resolvedTargetId === null
        ? [makeSideTarget(edit.side)]
        : [makeSideTarget(edit.side), makeCardTarget(resolvedTargetId)];
    }
    case "SET_CARD_SPARK":
    case "SET_CARD_SPARK_DELTA":
    case "DISCARD_CARD":
    case "SET_CARD_VISIBILITY":
    case "ADD_CARD_NOTE":
    case "DISMISS_CARD_NOTE":
    case "CLEAR_CARD_NOTES":
    case "SET_CARD_MARKERS":
      return [makeCardTarget(edit.battleCardId)];
    case "MOVE_CARD_TO_ZONE":
      return [
        makeCardTarget(edit.battleCardId),
        "slotId" in edit.destination
          ? makeSlotTarget(edit.destination)
          : makeZoneTarget(edit.destination.side, edit.destination.zone),
      ];
    case "SWAP_BATTLEFIELD_SLOTS":
      return [makeSlotTarget(edit.source), makeSlotTarget(edit.target)];
    case "CREATE_CARD_COPY":
      return [
        makeCardTarget(edit.sourceBattleCardId),
        "slotId" in edit.destination
          ? makeSlotTarget(edit.destination)
          : makeZoneTarget(edit.destination.side, edit.destination.zone),
      ];
    case "CREATE_FIGMENT":
      return [
        makeSideTarget(edit.side),
        "slotId" in edit.destination
          ? makeSlotTarget(edit.destination)
          : makeZoneTarget(edit.destination.side, edit.destination.zone),
      ];
    case "REORDER_DECK":
      return [makeSideTarget(edit.side), makeZoneTarget(edit.side, "deck")];
    case "REVEAL_DECK_TOP":
    case "HIDE_DECK_TOP":
      return [makeZoneTarget(edit.side, "deck")];
    case "PLAY_FROM_DECK_TOP":
      return edit.target === undefined
        ? [makeSideTarget(edit.side), makeZoneTarget(edit.side, "deck")]
        : [
          makeSideTarget(edit.side),
          makeZoneTarget(edit.side, "deck"),
          makeSlotTarget(edit.target),
        ];
    case "FORCE_JUDGMENT":
    case "GRANT_EXTRA_TURN":
      return [makeSideTarget(edit.side)];
  }
}

function createDebugEditLabel(
  edit: BattleDebugEdit,
  state: BattleMutableState,
): string {
  switch (edit.kind) {
    case "SET_SCORE":
      return `Set ${formatSideLabel(edit.side)} Score to ${String(edit.value)}`;
    case "SET_CURRENT_ENERGY":
      return `Set ${formatSideLabel(edit.side)} Energy to ${String(edit.value)}`;
    case "SET_MAX_ENERGY":
      return `Set ${formatSideLabel(edit.side)} Max Energy to ${String(edit.value)}`;
    case "ADJUST_SCORE":
      return `${formatSignedAction(edit.amount, "Adjust")} ${formatSideLabel(edit.side)} Score`;
    case "ADJUST_CURRENT_ENERGY":
      return `${formatSignedAction(edit.amount, "Adjust")} ${formatSideLabel(edit.side)} Energy`;
    case "ADJUST_MAX_ENERGY":
      return `${formatSignedAction(edit.amount, "Adjust")} ${formatSideLabel(edit.side)} Max Energy`;
    case "SET_CARD_SPARK":
      return `Set ${readCardName(state, edit.battleCardId)} Spark to ${String(edit.value)}`;
    case "SET_CARD_SPARK_DELTA":
      return `Set ${readCardName(state, edit.battleCardId)} Spark Delta to ${String(edit.value)}`;
    case "MOVE_CARD_TO_ZONE":
      return `Move ${readCardName(state, edit.battleCardId)} to ${formatZoneDestinationLabel(edit.destination)}`;
    case "SWAP_BATTLEFIELD_SLOTS":
      return `Swap ${formatSlotLabel(edit.source)} with ${formatSlotLabel(edit.target)}`;
    case "DRAW_CARD":
      return `Draw 1 for ${formatSideLabel(edit.side)}`;
    case "DISCARD_CARD":
      return `Discard ${readCardName(state, edit.battleCardId)}`;
    case "KINDLE": {
      const targetId = selectKindleTargetBattleCardId(
        state,
        edit.side,
        edit.preferredBattleCardId ?? null,
      );
      if (targetId === null) {
        return `Kindle ${String(edit.amount)} for ${formatSideLabel(edit.side)}`;
      }
      return `Kindle ${String(edit.amount)} on ${readCardName(state, targetId)}`;
    }
    case "SET_CARD_VISIBILITY":
      return `${edit.isRevealedToPlayer ? "Reveal" : "Hide"} Opponent Hand Card`;
    case "SET_SIDE_HAND_VISIBILITY":
      return `${edit.isRevealedToPlayer ? "Reveal" : "Hide"} All ${formatSideLabel(edit.side)} Hand Cards`;
    case "ADD_CARD_NOTE":
      return `Add Note to ${readCardName(state, edit.battleCardId)}`;
    case "DISMISS_CARD_NOTE":
      return `Dismiss Note on ${readCardName(state, edit.battleCardId)}`;
    case "CLEAR_CARD_NOTES":
      return `Clear Notes on ${readCardName(state, edit.battleCardId)}`;
    case "SET_CARD_MARKERS":
      return createMarkerDiffLabel(state, edit.battleCardId, edit.markers);
    case "CREATE_CARD_COPY":
      return `Create Copy of ${readCardName(state, edit.sourceBattleCardId)}`;
    case "CREATE_FIGMENT":
      return `Create Figment (${edit.chosenSubtype}/${String(edit.chosenSpark)})`;
    case "REORDER_DECK":
      return `Reorder ${formatSideLabel(edit.side)} Deck`;
    case "REVEAL_DECK_TOP":
      return `Reveal Top ${String(edit.count)} of ${formatSideLabel(edit.side)} Deck`;
    case "HIDE_DECK_TOP":
      return `Hide Top ${String(edit.count)} of ${formatSideLabel(edit.side)} Deck`;
    case "PLAY_FROM_DECK_TOP":
      return `Play Top of ${formatSideLabel(edit.side)} Deck`;
    case "FORCE_JUDGMENT":
      return `Force Judgment (${formatSideLabel(edit.side)})`;
    case "GRANT_EXTRA_TURN":
      return `Grant Extra Turn to ${formatSideLabel(edit.side)}`;
  }
}

function createMarkerDiffLabel(
  state: BattleMutableState,
  battleCardId: string,
  nextMarkers: BattleCardMarkers,
): string {
  const previous = state.cardInstances[battleCardId]?.markers ?? {
    isPrevented: false,
    isCopied: false,
  };
  const preventedChanged = previous.isPrevented !== nextMarkers.isPrevented;
  const copiedChanged = previous.isCopied !== nextMarkers.isCopied;
  const name = readCardName(state, battleCardId);

  if (preventedChanged && !copiedChanged) {
    return nextMarkers.isPrevented
      ? `Mark ${name} Prevented`
      : `Clear Prevented on ${name}`;
  }

  if (copiedChanged && !preventedChanged) {
    return nextMarkers.isCopied
      ? `Mark ${name} Copied`
      : `Clear Copied on ${name}`;
  }

  return `Set ${name} Markers`;
}

function formatDebugEditCommandId(edit: BattleDebugEdit): string {
  switch (edit.kind) {
    case "SET_CARD_VISIBILITY":
      return edit.isRevealedToPlayer
        ? "REVEAL_OPPONENT_HAND_CARD"
        : "HIDE_OPPONENT_HAND_CARD";
    case "SET_SIDE_HAND_VISIBILITY":
      return edit.isRevealedToPlayer
        ? `REVEAL_ALL_${edit.side.toUpperCase()}_HAND_CARDS`
        : `HIDE_ALL_${edit.side.toUpperCase()}_HAND_CARDS`;
    default:
      return edit.kind;
  }
}

function readCardName(
  state: BattleMutableState,
  battleCardId: string,
): string {
  return state.cardInstances[battleCardId]?.definition.name ?? "Card";
}

function formatResultLabel(result: BattleResult): string {
  switch (result) {
    case "victory":
      return "Victory";
    case "defeat":
      return "Defeat";
    case "draw":
      return "Draw";
  }
}

function formatSideLabel(side: BattleSide): string {
  return side === "player" ? "Player" : "Enemy";
}

function formatZoneDestinationLabel(
  destination: BattleDebugZoneDestination,
): string {
  if ("slotId" in destination) {
    return formatSlotLabel(destination);
  }

  if (destination.zone === "deck") {
    return `${formatSideLabel(destination.side)} Deck ${destination.position === "top" ? "Top" : "Bottom"}`;
  }

  return `${formatSideLabel(destination.side)} ${formatZoneLabel(destination.zone)}`;
}

function formatSlotLabel(slot: BattleFieldSlotAddress): string {
  return `${formatSideLabel(slot.side)} ${formatZoneLabel(slot.zone)} ${slot.slotId}`;
}

function formatZoneLabel(zone: "reserve" | "deployed" | "deck" | "hand" | "void" | "banished" | "stack"): string {
  switch (zone) {
    case "reserve":
      return "Reserve";
    case "deployed":
      return "Deployed";
    case "deck":
      return "Deck";
    case "hand":
      return "Hand";
    case "void":
      return "Void";
    case "banished":
      return "Banished";
    case "stack":
      return "Stack";
  }
}

function formatSignedAction(
  amount: number,
  verb: string,
): string {
  if (amount >= 0) {
    return `${verb} +${String(amount)}`;
  }

  return `${verb} ${String(amount)}`;
}
