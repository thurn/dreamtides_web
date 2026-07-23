import { useMemo } from "react";
import {
  ContextActionMenu,
  type CommandMenuItem,
} from "../../cumulus/components/overlay/CommandMenus";
import { GLYPHS } from "../../cumulus/primitives/glyph";
import type {
  BattleCommand,
  BattleDebugZoneDestination,
} from "../debug/commands";
import {
  selectBattleCardLocation,
} from "../state/selectors";
import { isFigmentInstance } from "../state/figments";
import type {
  BattleCardStatus,
  BattleCommandSourceSurface,
  BattleFieldSlotAddress,
  BattleMutableState,
} from "../types";
import {
  createMoveCardToBattlefieldCommand,
  createMoveCardToDeckCommand,
  createMoveCardToRowCommand,
  createMoveCardToZoneCommand,
} from "./battle-ui-commands";
import { formatSideLabel, formatZoneLabel } from "../ui/format";

export function BattleContextMenu({
  battleCardId,
  onOpenNoteEditor,
  presentation: _presentation = "context-menu",
  sourceSurface,
  state,
  x,
  y,
  onClose,
  onCommand,
}: {
  battleCardId: string;
  onOpenNoteEditor: (battleCardId: string) => void;
  presentation?: "context-menu" | "sheet";
  sourceSurface: BattleCommandSourceSurface;
  state: BattleMutableState;
  x: number;
  y: number;
  onClose: () => void;
  onCommand: (command: BattleCommand) => void;
}) {
  const card = state.cardInstances[battleCardId];
  const location = selectBattleCardLocation(state, battleCardId);
  const items = useMemo(() => {
    if (card === undefined || location === null) {
      return [] as ContextMenuItem[];
    }

    const result: ContextMenuItem[] = [];

    if (location.zone === "hand") {
      const playDestination = card.definition.battleCardKind === "character" ? "backRank" : "void";
      const playCommand = card.definition.battleCardKind === "character"
        ? createMoveCardToBattlefieldCommand(state, battleCardId, location.side, sourceSurface)
        : createMoveCardToZoneCommand(battleCardId, location.side, "void", sourceSurface);
      if (playCommand !== null) {
        result.push({
          label: `Play to ${formatZoneLabel(playDestination)}`,
          action: () => onCommand(playCommand),
        });
      }
      if (card.definition.battleCardKind === "character") {
        const deployedTarget = createMoveCardToRowCommand(
          state,
          battleCardId,
          location.side,
          "frontRank",
          sourceSurface,
        );
        if (deployedTarget !== null) {
          result.push({
            label: `Play to ${formatZoneLabel("frontRank")}`,
            action: () => onCommand(deployedTarget),
          });
        }
      }
      result.push({ divider: true });
    }

    if (
      location.zone === "void" &&
      location.side === "player" &&
      card.definition.reclaimCost !== null
    ) {
      const reclaimCommand = card.definition.battleCardKind === "character"
        ? createMoveCardToBattlefieldCommand(state, battleCardId, location.side, sourceSurface)
        : createMoveCardToZoneCommand(battleCardId, location.side, "banished", sourceSurface);
      if (reclaimCommand !== null) {
        result.push({
          label: "Reclaim",
          action: () => onCommand(reclaimCommand),
        });
        result.push({ divider: true });
      }
    }

    if (card.definition.battleCardKind === "character") {
      // A direct exhaust toggle for in-play characters: marks the body exhausted
      // (☪) so an exhaust icon shows over it until Ending clears it. The same
      // toggle is also available under the Status submenu.
      if (location.zone === "frontRank" || location.zone === "backRank") {
        result.push({
          label: card.status.isExhausted ? "Awaken" : "Exhaust ☪",
          action: () => setStatus({ isExhausted: !card.status.isExhausted }),
        });
      }
      result.push({
        label: "Add Spark",
        submenu: [
          sparkItem(1),
          sparkItem(2),
          sparkItem(3),
          { divider: true },
          sparkItem(-1),
          sparkItem(-2),
          { divider: true },
          {
            label: "Reset to 0",
            action: () => onCommand({
              id: "DEBUG_EDIT",
              edit: {
                kind: "SET_CARD_SPARK_DELTA",
                battleCardId,
                value: 0,
              },
              sourceSurface,
            }),
          },
        ],
      });
      // A figment stack can also grow in size — adding members rather than
      // bonus spark — via a quick "+N" stepper.
      if (isFigmentInstance(card)) {
        result.push({
          label: "Add Figments",
          submenu: [
            addFigmentsItem(1),
            addFigmentsItem(2),
            addFigmentsItem(3),
          ],
        });
      }
      result.push({ divider: true });
    }

    appendIfPresent(result, "→ Hand", createMoveCardToZoneCommand(
      battleCardId,
      location.side,
      "hand",
      sourceSurface,
    ), location.zone !== "hand", onCommand);
    appendIfPresent(result, "→ Back Rank", createMoveCardToRowCommand(
      state,
      battleCardId,
      location.side,
      "backRank",
      sourceSurface,
    ), location.zone !== "backRank", onCommand);
    appendIfPresent(result, "→ Front Rank", createMoveCardToRowCommand(
      state,
      battleCardId,
      location.side,
      "frontRank",
      sourceSurface,
    ), location.zone !== "frontRank", onCommand);
    appendIfPresent(result, "→ Void", createMoveCardToZoneCommand(
      battleCardId,
      location.side,
      "void",
      sourceSurface,
    ), location.zone !== "void", onCommand);
    appendIfPresent(result, "→ Banished", createMoveCardToZoneCommand(
      battleCardId,
      location.side,
      "banished",
      sourceSurface,
    ), location.zone !== "banished", onCommand);
    appendIfPresent(result, "→ Deck top", createMoveCardToDeckCommand(
      battleCardId,
      location.side,
      "top",
      sourceSurface,
    ), location.zone !== "deck", onCommand);
    appendIfPresent(result, "→ Deck bottom", createMoveCardToDeckCommand(
      battleCardId,
      location.side,
      "bottom",
      sourceSurface,
    ), location.zone !== "deck", onCommand);

    result.push({ divider: true });

    result.push({
      label: "Create Copy",
      submenu: createCopySubmenu(location.side),
    });
    result.push({
      label: "Markers",
      submenu: [
        {
          label: card.markers.isPrevented ? "Clear Prevented" : "Mark Prevented",
          action: () => onCommand({
            id: "DEBUG_EDIT",
            edit: {
              kind: "SET_CARD_MARKERS",
              battleCardId,
              markers: {
                ...card.markers,
                isPrevented: !card.markers.isPrevented,
              },
            },
            sourceSurface,
          }),
        },
        {
          label: card.markers.isCopied ? "Clear Copied" : "Mark Copied",
          action: () => onCommand({
            id: "DEBUG_EDIT",
            edit: {
              kind: "SET_CARD_MARKERS",
              battleCardId,
              markers: {
                ...card.markers,
                isCopied: !card.markers.isCopied,
              },
            },
            sourceSurface,
          }),
        },
      ],
    });
    if (card.definition.battleCardKind === "character") {
      result.push({
        label: "Status",
        submenu: createStatusSubmenu(),
      });
      result.push({
        label: `Counters ⧗ (${String(card.status.counters)})`,
        submenu: createCountersSubmenu(),
      });
      // Abandon and Rematerialize are in-play character gestures (rules
      // §Abandon, §Rematerialize): Abandon voluntarily sends a character (or a
      // figment stack's topmost member) to the void; Rematerialize re-runs the
      // ▸Materialized resolution and is player-resolved (log-only).
      if (location.zone === "backRank" || location.zone === "frontRank") {
        result.push({ divider: true });
        result.push({
          label: "Abandon",
          action: () => onCommand({
            id: "DEBUG_EDIT",
            edit: { kind: "ABANDON", battleCardId },
            sourceSurface,
          }),
        });
        result.push({
          label: "Rematerialize",
          action: () => onCommand({
            id: "DEBUG_EDIT",
            edit: { kind: "REMATERIALIZE", battleCardId },
            sourceSurface,
          }),
        });
      }
    }
    result.push({
      label: "Add Note…",
      action: () => onOpenNoteEditor(battleCardId),
    });
    if (card.notes.length > 0) {
      result.push({
        label: "Notes",
        submenu: [
          ...card.notes.map((note) => ({
            label: `Dismiss: ${truncateNoteLabel(note.text)}`,
            action: () => onCommand({
              id: "DEBUG_EDIT",
              edit: {
                kind: "DISMISS_CARD_NOTE",
                battleCardId,
                noteId: note.noteId,
              },
              sourceSurface,
            }),
          })),
          { divider: true },
          {
            label: "Clear All",
            action: () => onCommand({
              id: "DEBUG_EDIT",
              edit: {
                kind: "CLEAR_CARD_NOTES",
                battleCardId,
              },
              sourceSurface,
            }),
          },
        ],
      });
    }

    return result;

    function sparkItem(amount: number): ContextMenuItem {
      return {
        label: amount > 0 ? `+${String(amount)}` : String(amount),
        action: () => onCommand({
          id: "DEBUG_EDIT",
          edit: {
            kind: "KINDLE",
            amount,
            preferredBattleCardId: battleCardId,
            side: card.controller,
          },
          sourceSurface,
        }),
      };
    }

    function addFigmentsItem(count: number): ContextMenuItem {
      return {
        label: `+${String(count)}`,
        action: () => onCommand({
          id: "DEBUG_EDIT",
          edit: {
            kind: "ADD_FIGMENTS",
            battleCardId,
            count,
          },
          sourceSurface,
        }),
      };
    }

    function setStatus(status: Partial<BattleCardStatus>): void {
      onCommand({
        id: "DEBUG_EDIT",
        edit: { kind: "SET_CARD_STATUS", battleCardId, status },
        sourceSurface,
      });
    }

    /**
     * Card-scoped status toggles emitting `SET_CARD_STATUS` (rules §Exhaust and
     * Awaken, §Keywords). Exhausting a front-rank body triggers the engine's ☪
     * auto-retreat to an open back-rank position (and is rejected when the back
     * rank is full); the menu just dispatches the edit and the engine applies
     * that positional rule. Awaken clears the exhausted status in place.
     */
    function createStatusSubmenu(): ContextMenuItem[] {
      const status = card.status;
      const items: ContextMenuItem[] = [];

      items.push({
        label: status.isExhausted ? "Awaken" : "Exhaust ☪",
        action: () => setStatus({ isExhausted: !status.isExhausted }),
      });
      items.push({ divider: true });

      items.push({
        label: status.reclaimed ? "Clear Reclaimed" : "Mark Reclaimed",
        action: () => setStatus({ reclaimed: !status.reclaimed }),
      });
      items.push({
        label: status.offering ? "Clear Offering" : "Mark Offering",
        action: () => setStatus({ offering: !status.offering }),
      });
      items.push({
        label: status.ephemeral ? "Clear Ephemeral" : "Mark Ephemeral",
        action: () => setStatus({ ephemeral: !status.ephemeral }),
      });
      items.push({ divider: true });

      items.push({
        label: status.veil ? "Clear Veil" : "Mark Veil",
        action: () => setStatus({ veil: !status.veil }),
      });
      items.push({ divider: true });

      items.push(grantedKeywordItem("Unstoppable", "grantedUnstoppable", status.grantedUnstoppable));
      items.push(grantedKeywordItem("Vengeful", "grantedVengeful", status.grantedVengeful));
      items.push(grantedKeywordItem("Preeminence", "grantedPreeminence", status.grantedPreeminence));
      items.push(grantedKeywordItem("Awakened", "grantedAwakened", status.grantedAwakened));

      return items;
    }

    function grantedKeywordItem(
      label: string,
      field: "grantedUnstoppable" | "grantedVengeful" | "grantedPreeminence" | "grantedAwakened",
      isGranted: boolean,
    ): ContextMenuItem {
      return {
        label: isGranted ? `Clear ${label}` : `Grant ${label}`,
        action: () => setStatus({ [field]: !isGranted }),
      };
    }

    function setCounters(value: number): void {
      onCommand({
        id: "DEBUG_EDIT",
        edit: { kind: "SET_COUNTERS", battleCardId, value: Math.max(0, value) },
        sourceSurface,
      });
    }

    /**
     * Card-scoped ⧗ counter stepper emitting `SET_COUNTERS` (rules §Counters).
     * The engine clamps the stored value to ≥ 0 and resets counters when the
     * card leaves play. The stepper offers ±1 increments plus a clear-to-0
     * shortcut; the current value is shown in the parent submenu label.
     */
    function createCountersSubmenu(): ContextMenuItem[] {
      const current = card.status.counters;
      const items: ContextMenuItem[] = [];
      items.push({
        label: "+1 ⧗",
        action: () => setCounters(current + 1),
      });
      const decrementDisabled = current <= 0;
      items.push({
        label: "-1 ⧗",
        action: () => {
          if (decrementDisabled) {
            return;
          }
          setCounters(current - 1);
        },
      });
      items.push({ divider: true });
      items.push({
        label: "Clear ⧗",
        action: () => setCounters(0),
      });
      return items;
    }
  }, [battleCardId, card, location, onCommand, onOpenNoteEditor, sourceSurface, state]);

  if (card === undefined || location === null) {
    return null;
  }

  const locationLabel = location.zone === "backRank" || location.zone === "frontRank"
    ? `${formatSideLabel(location.side)} · ${formatZoneLabel(location.zone)} ${location.slotId}`
    : `${formatSideLabel(location.side)} · ${formatZoneLabel(location.zone)}`;
  return (
    <ContextActionMenu
      title={card.definition.name}
      subtitle={locationLabel}
      actions={toCommandMenuItems(items, battleCardId)}
      anchor={{ kind: "point", x, y }}
      onDismiss={onClose}
      testId="battle-context-menu"
    />
  );

  function createCopySubmenu(side: BattleFieldSlotAddress["side"]): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    const appendCreateCopy = (
      label: string,
      destination: BattleDebugZoneDestination,
    ) => {
      items.push({
        label,
        action: () => onCommand({
          id: "DEBUG_EDIT",
          edit: {
            kind: "CREATE_CARD_COPY",
            sourceBattleCardId: battleCardId,
            destination,
            createdAtMs: Date.now(),
          },
          sourceSurface,
        }),
      });
    };

    appendCreateCopy("→ Hand", { side, zone: "hand" });
    const reserveTarget = createMoveCardToRowCommand(state, battleCardId, side, "backRank", sourceSurface);
    if (reserveTarget !== null) {
      appendCreateCopy("→ Back Rank", reserveTarget.edit.destination);
    }
    const deployedTarget = createMoveCardToRowCommand(state, battleCardId, side, "frontRank", sourceSurface);
    if (deployedTarget !== null) {
      appendCreateCopy("→ Front Rank", deployedTarget.edit.destination);
    }
    appendCreateCopy("→ Void", { side, zone: "void" });
    appendCreateCopy("→ Banished", { side, zone: "banished" });
    appendCreateCopy("→ Deck top", { side, zone: "deck", position: "top" });
    appendCreateCopy("→ Deck bottom", { side, zone: "deck", position: "bottom" });
    return items;
  }
}

type ContextMenuItem =
  | { divider: true }
  | {
    label: string;
    action: () => void;
  }
  | {
    label: string;
    submenu: Array<ContextMenuItem>;
  };

function toCommandMenuItems(
  items: readonly ContextMenuItem[],
  battleCardId: string,
  path = "root",
): readonly CommandMenuItem[] {
  return items.map((item, index) => {
    const id = `${battleCardId}:${path}:${String(index)}`;
    if ("divider" in item) return { kind: "divider", id };
    if ("submenu" in item) {
      return {
        kind: "group",
        id,
        label: item.label,
        glyph: GLYPHS.list,
        actions: toCommandMenuItems(item.submenu, battleCardId, id),
      };
    }
    return {
      kind: "action",
      id,
      label: item.label,
      glyph: item.label.includes("Note") ? GLYPHS.pencilSquare : GLYPHS.edit,
      onCommand: item.action,
    };
  });
}

function appendIfPresent(
  items: ContextMenuItem[],
  label: string,
  command: BattleCommand | null,
  enabled: boolean,
  onCommand: (command: BattleCommand) => void,
): void {
  if (!enabled || command === null) {
    return;
  }

  items.push({
    label,
    action: () => onCommand(command),
  });
}

function truncateNoteLabel(text: string): string {
  return text.length <= 18 ? text : `${text.slice(0, 15)}...`;
}
