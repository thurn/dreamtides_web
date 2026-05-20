import { useEffect, useMemo, useState } from "react";
import type {
  BattleCommand,
  BattleDebugZoneDestination,
} from "../debug/commands";
import {
  selectBattleCardLocation,
} from "../state/selectors";
import type {
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

export function BattleContextMenu({
  battleCardId,
  onOpenNoteEditor,
  sourceSurface,
  state,
  x,
  y,
  onClose,
  onCommand,
}: {
  battleCardId: string;
  onOpenNoteEditor: (battleCardId: string) => void;
  sourceSurface: BattleCommandSourceSurface;
  state: BattleMutableState;
  x: number;
  y: number;
  onClose: () => void;
  onCommand: (command: BattleCommand) => void;
}) {
  const card = state.cardInstances[battleCardId];
  const location = selectBattleCardLocation(state, battleCardId);

  useEffect(() => {
    function handleMouseDown(): void {
      onClose();
    }
    function handleScroll(): void {
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      onClose();
    }

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const items = useMemo(() => {
    if (card === undefined || location === null) {
      return [] as ContextMenuItem[];
    }

    const result: ContextMenuItem[] = [];

    if (location.zone === "hand") {
      const playDestination = card.definition.battleCardKind === "character" ? "reserve" : "void";
      const playCommand = card.definition.battleCardKind === "character"
        ? createMoveCardToBattlefieldCommand(state, battleCardId, location.side, sourceSurface)
        : createMoveCardToZoneCommand(battleCardId, location.side, "void", sourceSurface);
      if (playCommand !== null) {
        result.push({
          label: `Play to ${playDestination}`,
          action: () => onCommand(playCommand),
        });
      }
      if (card.definition.battleCardKind === "character") {
        const deployedTarget = createMoveCardToRowCommand(
          state,
          battleCardId,
          location.side,
          "deployed",
          sourceSurface,
        );
        if (deployedTarget !== null) {
          result.push({
            label: "Play, deploy",
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
      result.push({
        label: "Kindle",
        submenu: [
          kindleItem(1),
          kindleItem(2),
          kindleItem(3),
          { divider: true },
          kindleItem(-1),
          kindleItem(-2),
          { divider: true },
          {
            label: "Reset delta",
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
      result.push({ divider: true });
    }

    appendIfPresent(result, "→ Hand", createMoveCardToZoneCommand(
      battleCardId,
      location.side,
      "hand",
      sourceSurface,
    ), location.zone !== "hand", onCommand);
    appendIfPresent(result, "→ Reserve", createMoveCardToRowCommand(
      state,
      battleCardId,
      location.side,
      "reserve",
      sourceSurface,
    ), location.zone !== "reserve", onCommand);
    appendIfPresent(result, "→ Deployed", createMoveCardToRowCommand(
      state,
      battleCardId,
      location.side,
      "deployed",
      sourceSurface,
    ), location.zone !== "deployed", onCommand);
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

    function kindleItem(amount: number): ContextMenuItem {
      return {
        label: amount > 0 ? `Kindle +${String(amount)}` : `Spark ${String(amount)}`,
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
  }, [battleCardId, card, location, onCommand, onOpenNoteEditor, sourceSurface, state]);

  if (card === undefined || location === null) {
    return null;
  }

  const menuHeight = Math.min(items.length * 28 + 64, 600);
  const left = Math.min(x, window.innerWidth - 248);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);
  const locationLabel = location.zone === "reserve" || location.zone === "deployed"
    ? `${location.side === "player" ? "YOU" : "ENEMY"} · ${location.zone.toUpperCase()} ${location.slotId}`
    : `${location.side === "player" ? "YOU" : "ENEMY"} · ${location.zone.toUpperCase()}`;

  return (
    <div
      data-battle-context-menu=""
      className="ctx-menu"
      style={{ left, top }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="ctx-header">
        <span className="ctx-name">{card.definition.name}</span>
        <span className="ctx-loc">{locationLabel}</span>
      </div>
      <div className="ctx-items">
        {items.map((item, index) => {
          if ("divider" in item) {
            return <div key={`divider-${String(index)}`} className="ctx-divider" />;
          }
          if ("submenu" in item) {
            return <ContextSubmenu key={item.label} item={item} onClose={onClose} />;
          }
          return (
            <div
              key={item.label}
              className="ctx-item"
              onClick={() => {
                item.action();
                onClose();
              }}
            >
              {item.label}
            </div>
          );
        })}
      </div>
    </div>
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
    const reserveTarget = createMoveCardToRowCommand(state, battleCardId, side, "reserve", sourceSurface);
    if (reserveTarget !== null) {
      appendCreateCopy("→ Reserve", reserveTarget.edit.destination);
    }
    const deployedTarget = createMoveCardToRowCommand(state, battleCardId, side, "deployed", sourceSurface);
    if (deployedTarget !== null) {
      appendCreateCopy("→ Deployed", deployedTarget.edit.destination);
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

function ContextSubmenu({
  item,
  onClose,
}: {
  item: Extract<ContextMenuItem, { submenu: Array<ContextMenuItem> }>;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="ctx-item has-submenu"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <span>{item.label}</span>
      <span className="ctx-caret">›</span>
      {isOpen ? (
        <div className="ctx-submenu">
          {item.submenu.map((submenuItem, index) => {
            if ("divider" in submenuItem) {
              return <div key={`submenu-divider-${String(index)}`} className="ctx-divider" />;
            }
            if ("submenu" in submenuItem) {
              return null;
            }
            return (
              <div
                key={submenuItem.label}
                className="ctx-item"
                onClick={(event) => {
                  event.stopPropagation();
                  submenuItem.action();
                  onClose();
                }}
              >
                {submenuItem.label}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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
