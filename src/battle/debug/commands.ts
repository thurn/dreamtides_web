import { selectKindleTargetBattleCardId } from "../state/selectors";
import { formatPhaseLabel } from "../ui/format";
import type {
  BattleAiChoiceTrace,
  BattleCardMarkers,
  BattleCardNoteExpiry,
  BattleCardStatus,
  BattleCommandActor,
  BattleCommandSourceSurface,
  BattleCommandTarget,
  BattleDeckCardDefinition,
  BattleFieldSlotAddress,
  BattleHistoryEntryKind,
  BattleHistoryEntryMetadata,
  BattleMutableState,
  BattlePhase,
  BattleResult,
  BattleSide,
} from "../types";

export type BattleCommandId =
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
    kind: "INCREASE_MAX_ENERGY_AND_FILL";
    side: BattleSide;
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
    // Merges a partial `BattleCardStatus` onto the instance's status. Basic
    // automation emits this during the Dawn phase to clear `isExhausted` on the
    // incoming side's characters (rules §Dawn). Task 4.1 extends its handler
    // with the ☪ auto-retreat behaviour and surfaces the toggle UI.
    kind: "SET_CARD_STATUS";
    battleCardId: string;
    status: Partial<BattleCardStatus>;
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
    kind: "CREATE_CARD_FROM_DEFINITION";
    definition: BattleDeckCardDefinition;
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
    kind: "SET_PHASE";
    phase: BattlePhase;
  }
  | {
    kind: "SET_BATTLE_FLOW";
    phase: BattlePhase;
    activeSide: BattleSide;
    turnNumber: number;
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
  /**
   * The AI's choice trace(s) for an approved AI command, carried onto the
   * resulting `BattleReducerTransition.aiChoices` so the battle log can render
   * the rationale behind the move. Absent for human/debug commands, where the
   * transition's `aiChoices` defaults to `[]`.
   */
  aiChoices?: BattleAiChoiceTrace[];
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
    case "SKIP_TO_REWARDS":
      return {};
    case "DEBUG_EDIT":
      return { edit: command.edit };
    case "FORCE_RESULT":
      return { result: command.result };
  }
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
  zone: "deck" | "hand" | "void" | "banished" | "backRank" | "frontRank" | "stack",
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
    case "INCREASE_MAX_ENERGY_AND_FILL":
      return "numeric-state";
    case "SET_CARD_SPARK":
    case "SET_CARD_SPARK_DELTA":
    case "KINDLE":
    case "ADD_CARD_NOTE":
    case "DISMISS_CARD_NOTE":
    case "CLEAR_CARD_NOTES":
    case "SET_CARD_MARKERS":
    case "SET_CARD_STATUS":
      return "card-instance";
    case "MOVE_CARD_TO_ZONE":
    case "DRAW_CARD":
    case "DISCARD_CARD":
    case "CREATE_CARD_COPY":
    case "CREATE_FIGMENT":
    case "CREATE_CARD_FROM_DEFINITION":
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
    case "SET_PHASE":
    case "SET_BATTLE_FLOW":
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
 * - `PLAY_FROM_DECK_TOP`: multi-step (deck-to-battlefield placement).
 * - `KINDLE`: spec §H-16 example (spark + card instance + log).
 * - `CREATE_CARD_COPY` / `CREATE_FIGMENT` / `CREATE_CARD_FROM_DEFINITION`: mint instance + bump ordinal +
 *   insert into target zone, atomically.
 * - `MOVE_CARD_TO_ZONE`: zone transition; the battlefield-to-battlefield
 *   path also edits three fields (source slot, target slot, controller),
 *   and cross-zone moves are enough to warrant the flag for log clarity.
 * - `INCREASE_MAX_ENERGY_AND_FILL`: edits both current and maximum energy.
 * - All simple numeric edits, flag toggles, and visibility changes stay
 *   non-composite.
 */
function isCompositeDebugEdit(edit: BattleDebugEdit): boolean {
  switch (edit.kind) {
    case "PLAY_FROM_DECK_TOP":
    case "KINDLE":
    case "CREATE_CARD_COPY":
    case "CREATE_FIGMENT":
    case "CREATE_CARD_FROM_DEFINITION":
    case "MOVE_CARD_TO_ZONE":
    case "INCREASE_MAX_ENERGY_AND_FILL":
    case "SET_BATTLE_FLOW":
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
    case "INCREASE_MAX_ENERGY_AND_FILL":
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
    case "SET_CARD_STATUS":
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
    case "CREATE_CARD_FROM_DEFINITION":
      return [
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
    case "SET_PHASE":
    case "SET_BATTLE_FLOW":
      return [];
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
    case "INCREASE_MAX_ENERGY_AND_FILL":
      return `Increase ${formatSideLabel(edit.side)} Max Energy and Fill Energy`;
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
    case "SET_CARD_STATUS":
      return createStatusEditLabel(state, edit.battleCardId, edit.status);
    case "CREATE_CARD_COPY":
      return `Create Copy of ${readCardName(state, edit.sourceBattleCardId)}`;
    case "CREATE_FIGMENT":
      return `Create Figment (${edit.chosenSubtype}/${String(edit.chosenSpark)})`;
    case "CREATE_CARD_FROM_DEFINITION":
      return `Create ${edit.definition.name}`;
    case "REORDER_DECK":
      return `Reorder ${formatSideLabel(edit.side)} Deck`;
    case "REVEAL_DECK_TOP":
      return `Reveal Top ${String(edit.count)} of ${formatSideLabel(edit.side)} Deck`;
    case "HIDE_DECK_TOP":
      return `Hide Top ${String(edit.count)} of ${formatSideLabel(edit.side)} Deck`;
    case "PLAY_FROM_DECK_TOP":
      return `Play Top of ${formatSideLabel(edit.side)} Deck`;
    case "SET_PHASE":
      return `Set Phase to ${formatPhaseLabel(edit.phase)}`;
    case "SET_BATTLE_FLOW":
      return `Set Battle Flow to ${formatPhaseLabel(edit.phase)}`;
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

/**
 * Renders a status edit (a partial `BattleCardStatus` merge) as a label. The
 * common single-field exhaust toggle reads naturally; multi-field merges fall
 * back to a generic "Set <card> Status".
 */
function createStatusEditLabel(
  state: BattleMutableState,
  battleCardId: string,
  status: Partial<BattleCardStatus>,
): string {
  const name = readCardName(state, battleCardId);
  const keys = Object.keys(status);
  if (keys.length === 1 && status.isExhausted !== undefined) {
    return status.isExhausted ? `Exhaust ${name}` : `Awaken ${name}`;
  }
  return `Set ${name} Status`;
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

function formatZoneLabel(zone: "backRank" | "frontRank" | "deck" | "hand" | "void" | "banished" | "stack"): string {
  switch (zone) {
    case "backRank":
      return "Back Rank";
    case "frontRank":
      return "Front Rank";
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
