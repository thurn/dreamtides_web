// tutorial-only until Phase 6

import type {
  BattleAiChoiceTrace,
  BattleCardMarkers,
  BattleCardNoteExpiry,
  BattleCardStatus,
  BattleCommandActor,
  BattleCommandSourceSurface,
  BattleDeckCardDefinition,
  BattleFieldSlotAddress,
  BattlePhase,
  BattleResult,
  BattleSide,
} from "../types";
import type {
  CardName,
  CardSubtype,
} from "../../types/card-identity";
import type {
  BattleCardId,
  NoteId,
} from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";

export type BattleDebugZoneDestination =
  | BattleFieldSlotAddress
  | {
      side: BattleSide;
      zone: "hand" | "void" | "banished";
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
      battleCardId: BattleCardId;
      value: number;
    }
  | {
      kind: "SET_CARD_SPARK_DELTA";
      battleCardId: BattleCardId;
      value: number;
    }
  | {
      kind: "SET_CARD_STATIC_SPARK_BONUS";
      battleCardId: BattleCardId;
      value: number;
    }
  | {
      kind: "MOVE_CARD_TO_ZONE";
      battleCardId: BattleCardId;
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
      // Reveals `side`'s next Dreamwell card: advances the shared
      // `dreamwellDeckIndex`, points the side's `dreamwellCardIndex` at the drawn
      // card, and stamps `dreamwellDrawnTurn` with the active turn (rules §The
      // Dreamwell and Energy). The energy the card adds to maximum ● is folded in
      // by basic automation, not by this edit.
      //
      // The mandatory per-turn reveal is idempotent per `(side, turnNumber)`: it
      // no-ops when the side has already drawn for `turnNumber`. The per-turn
      // reveal effect runs on every connected client (and can re-fire on a
      // remount), so without this guard the shared deck index advances once per
      // dispatch instead of once per turn. `additional: true` is the explicit
      // "draw an additional Dreamwell card" path (Lily Lake): it bypasses the
      // guard and always consumes the next card from the shared deck.
      kind: "DRAW_DREAMWELL_CARD";
      side: BattleSide;
      turnNumber: number;
      additional?: boolean;
    }
  | {
      // Moves the top `count` cards of `side`'s deck to its void (rules §Erode).
      // An erode against an empty deck causes Fatigue, awarding the opponent the
      // doubling ⍟ sequence (rules §Fatigue). Basic automation introduces this
      // edit; the Phase 4 side-scoped rail surfaces the UI on top of it.
      kind: "ERODE";
      side: BattleSide;
      count: number;
    }
  | {
      // Abandon: voluntarily move one of your own characters from play to the
      // void (rules §Abandon). A Figment uses its leave-play replacement: its
      // topmost member is destroyed, with any reserve members staying in play.
      // Abandon only applies to a character currently in play; off-battlefield
      // targets are a no-op.
      kind: "ABANDON";
      battleCardId: BattleCardId;
    }
  | {
      // Rematerialize: re-run an in-play character's ▸Materialized resolution
      // manually (rules §Rematerialize). The keyword's actual effects are player
      // resolved, so this edit makes no structural change; it is a log-only
      // gesture whose command envelope records the intent in the battle log.
      kind: "REMATERIALIZE";
      battleCardId: BattleCardId;
    }
  | {
      kind: "DISCARD_CARD";
      battleCardId: BattleCardId;
    }
  | {
      kind: "KINDLE";
      side: BattleSide;
      amount: number;
      preferredBattleCardId?: BattleCardId | null;
    }
  | {
      kind: "SET_CARD_VISIBILITY";
      battleCardId: BattleCardId;
      viewer?: BattleSide;
      isRevealed?: boolean;
      /** Legacy event field; omitted `viewer` means the canonical player. */
      isRevealedToPlayer?: boolean;
    }
  | {
      /**
       * Publicly reveals one card that is currently in either side's hand and
       * presents that physical instance at reading size for every client.
       */
      kind: "REVEAL_HAND_CARD";
      battleCardId: BattleCardId;
    }
  | {
      kind: "SET_SIDE_HAND_VISIBILITY";
      side: BattleSide;
      viewer?: BattleSide;
      isRevealed?: boolean;
      /** Legacy event field; omitted `viewer` means the canonical player. */
      isRevealedToPlayer?: boolean;
    }
  | {
      kind: "ADD_CARD_NOTE";
      battleCardId: BattleCardId;
      noteId: NoteId;
      text: string;
      createdAtMs: number;
      expiry: BattleCardNoteExpiry;
    }
  | {
      kind: "DISMISS_CARD_NOTE";
      battleCardId: BattleCardId;
      noteId: NoteId;
    }
  | {
      kind: "CLEAR_CARD_NOTES";
      battleCardId: BattleCardId;
    }
  | {
      kind: "SET_CARD_MARKERS";
      battleCardId: BattleCardId;
      markers: BattleCardMarkers;
    }
  | {
      // Merges a partial `BattleCardStatus` onto the instance's status. Basic
      // automation emits this during Ending to clear `isExhausted` from in-play
      // characters. Its handler also owns the ☾ auto-retreat
      // behaviour and surfaces the toggle UI.
      kind: "SET_CARD_STATUS";
      battleCardId: BattleCardId;
      status: Partial<BattleCardStatus>;
    }
  | {
      // Sets the card's stored ⧗ counters to `value`, clamped to ≥ 0 (rules
      // §Counters). Counters are local to a card and reset to 0 when it leaves
      // play; the leave-play path zeroes them automatically.
      kind: "SET_COUNTERS";
      battleCardId: BattleCardId;
      value: number;
    }
  | {
      kind: "CREATE_CARD_COPY";
      sourceBattleCardId: BattleCardId;
      destination: BattleDebugZoneDestination;
      createdAtMs: number;
    }
  | {
      // Adds `count` members to an existing figment stack, each at the stack's
      // base spark (rules §Figments). A quick stepper for growing a stack.
      kind: "ADD_FIGMENTS";
      battleCardId: BattleCardId;
      count: number;
    }
  | {
      kind: "CREATE_FIGMENT";
      side: BattleSide;
      /** Stable authored figment identity. Optional only for legacy commands. */
      chosenFigmentId?: CardId;
      /** Number of independent figments to create. Defaults to 1 for legacy commands. */
      count?: number;
      chosenSubtype: CardSubtype;
      chosenSpark: number;
      name: CardName;
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
      kind: "FILL_BATTLEFIELD_PREVIEW";
      definitions: Record<BattleSide, readonly BattleDeckCardDefinition[]>;
      createdAtMs: number;
    }
  | {
      kind: "REORDER_DECK";
      side: BattleSide;
      order: readonly BattleCardId[];
    }
  | {
      /**
       * Resolves Foresee as one atomic edit. `viewedCardIds` is the exact deck
       * prefix the player inspected; the other two lists partition that prefix
       * into the new top-to-bottom deck order and the cards sent to the void.
       */
      kind: "FORESEE";
      side: BattleSide;
      viewer?: BattleSide;
      viewedCardIds: readonly BattleCardId[];
      orderedCardIds: readonly BattleCardId[];
      voidCardIds: readonly BattleCardId[];
    }
  | {
      kind: "REVEAL_DECK_TOP";
      side: BattleSide;
      count: number;
      viewer?: BattleSide;
    }
  | {
      // bug-103: inverse of `REVEAL_DECK_TOP`; hides the top N cards of the
      // deck so the per-card sticky reveal bit set by Foresee / S-1 can be
      // cleared without relying on undo.
      kind: "HIDE_DECK_TOP";
      side: BattleSide;
      count: number;
      viewer?: BattleSide;
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

export function visibilityEditViewer(
  edit: Extract<
    BattleDebugEdit,
    { kind: "SET_CARD_VISIBILITY" | "SET_SIDE_HAND_VISIBILITY" }
  >,
): BattleSide {
  return edit.viewer ?? "player";
}

export function visibilityEditValue(
  edit: Extract<
    BattleDebugEdit,
    { kind: "SET_CARD_VISIBILITY" | "SET_SIDE_HAND_VISIBILITY" }
  >,
): boolean {
  return edit.isRevealed ?? edit.isRevealedToPlayer ?? false;
}
