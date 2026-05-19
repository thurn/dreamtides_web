import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleCommand } from "../debug/commands";
import type {
  BattleCommandSourceSurface,
  BattleMutableState,
  BattleSide,
  BrowseableZone,
} from "../types";
import { BattleCardView, battleCardVisualFromInstance } from "./BattleCardView";
import {
  createMoveCardToBattlefieldCommand,
  createMoveCardToDeckCommand,
  createMoveCardToZoneCommand,
} from "./battle-ui-commands";

type BattleZoneBrowserSortMode = "current" | "cost" | "spark" | "name";
type BattleZoneBrowserTypeFilter = "all" | "character" | "event";

export function BattleZoneBrowser({
  browser,
  isOpponentHandRevealed = false,
  state,
  selectedBattleCardId,
  onClose,
  onCommand,
  onOpenForesee,
  onOpenReorderMultiple,
  onSelectBattleCard,
  onCardContextMenu,
}: {
  browser: {
    side: BattleSide;
    zone: BrowseableZone;
  };
  isOpponentHandRevealed?: boolean;
  state: BattleMutableState;
  selectedBattleCardId: string | null;
  onClose: () => void;
  onCommand: (command: BattleCommand) => void;
  onOpenForesee?: (side: BattleSide, count: number) => void;
  onOpenReorderMultiple?: (side: BattleSide) => void;
  onSelectBattleCard: (battleCardId: string) => void;
  onCardContextMenu?: (
    battleCardId: string,
    event: ReactMouseEvent<HTMLDivElement>,
    sourceSurface: BattleCommandSourceSurface,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<BattleZoneBrowserSortMode>("current");
  const [typeFilter, setTypeFilter] = useState<BattleZoneBrowserTypeFilter>("all");
  const [localSelectedCardId, setLocalSelectedCardId] = useState<string | null>(selectedBattleCardId);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const cardIds = state.sides[browser.side][browser.zone];
  const sourceSurface = sourceSurfaceForZoneBrowser(browser.zone);
  const isEnemyHandLocallyHidden = browser.zone === "hand" &&
    browser.side === "enemy" &&
    !isOpponentHandRevealed;
  const visibleCardIds = useMemo(
    () => applyBrowserFilters(cardIds, state, query, sortMode, typeFilter),
    [cardIds, query, sortMode, state, typeFilter],
  );
  const selectedCardId = !isEnemyHandLocallyHidden && localSelectedCardId !== null && cardIds.includes(localSelectedCardId)
    ? localSelectedCardId
    : !isEnemyHandLocallyHidden && selectedBattleCardId !== null && cardIds.includes(selectedBattleCardId)
      ? selectedBattleCardId
      : null;
  const selectedCard = selectedCardId === null ? null : state.cardInstances[selectedCardId] ?? null;
  const moveToBattlefieldCommand = useMemo(
    () => {
      if (selectedCard === null) {
        return null;
      }
      return createMoveCardToBattlefieldCommand(
        state,
        selectedCard.battleCardId,
        browser.side,
        sourceSurface,
      );
    },
    [browser.side, selectedCard, sourceSurface, state],
  );
  const topDeckCount = Math.min(3, cardIds.length);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function handleCardListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }
    const list = listRef.current;
    if (list === null) {
      return;
    }
    const buttons = [
      ...list.querySelectorAll<HTMLButtonElement>("button[data-zone-browser-card-id]"),
    ];
    if (buttons.length === 0) {
      return;
    }
    const activeIndex = document.activeElement instanceof HTMLButtonElement
      ? buttons.indexOf(document.activeElement)
      : -1;
    let nextIndex = activeIndex;
    if (event.key === "ArrowDown") {
      nextIndex = activeIndex < 0 ? 0 : Math.min(buttons.length - 1, activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = activeIndex < 0 ? buttons.length - 1 : Math.max(0, activeIndex - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buttons.length - 1;
    }
    event.preventDefault();
    buttons[nextIndex]?.focus();
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal"
        data-battle-zone-browser={`${browser.side}:${browser.zone}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="m-head">
          <div>
            <h2>{browser.side === "player" ? "Your" : "Enemy"} {formatZoneName(browser.zone)}</h2>
            <div className="subhead">
              {String(visibleCardIds.length)} CARDS{browser.zone === "deck" ? " · Top-to-bottom" : ""}
            </div>
          </div>
          <div className="controls">
            <input
              data-zone-browser-search=""
              ref={searchInputRef}
              type="search"
              placeholder="Search by name…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              data-zone-browser-sort=""
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as BattleZoneBrowserSortMode)}
            >
              <option value="current">Current order</option>
              <option value="cost">Cost</option>
              <option value="spark">Spark</option>
              <option value="name">Name</option>
            </select>
            <select
              data-zone-browser-filter=""
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as BattleZoneBrowserTypeFilter)}
            >
              <option value="all">All types</option>
              <option value="character">Characters</option>
              <option value="event">Events</option>
            </select>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="m-body">
          <div ref={listRef} className="browse-grid" onKeyDown={handleCardListKeyDown}>
            {visibleCardIds.map((battleCardId, index) => {
              const instance = state.cardInstances[battleCardId];
              if (instance === undefined) {
                return null;
              }
              const isHidden = isEnemyHandLocallyHidden;
              return (
                <button
                  key={battleCardId}
                  type="button"
                  data-zone-browser-card-id={battleCardId}
                  data-selected={String(selectedCardId === battleCardId)}
                  className={`browse-cell ${selectedCardId === battleCardId ? "selected" : ""}`}
                  onClick={() => {
                    if (isHidden) {
                      setLocalSelectedCardId(null);
                      return;
                    }
                    setLocalSelectedCardId(battleCardId);
                    onSelectBattleCard(battleCardId);
                  }}
                >
                  <BattleCardView
                    battleCardId={battleCardId}
                    data={battleCardVisualFromInstance(instance)}
                    hidden={isHidden}
                    selected={selectedCardId === battleCardId}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (isHidden) {
                        return;
                      }
                      onCardContextMenu?.(battleCardId, event, sourceSurface);
                    }}
                  />
                  <div className="idx">
                    {browser.zone === "deck" ? `#${String(index + 1)}` : ""}
                  </div>
                </button>
              );
            })}
            {visibleCardIds.length === 0 ? <div className="battle-empty">No cards.</div> : null}
          </div>
        </div>
        <div className="m-foot">
          <div className="selected-label">
            {selectedCard === null ? "Click a card to select." : `Selected: ${selectedCard.definition.name}`}
          </div>
          {browser.zone === "deck" ? (
            <>
              <button
                type="button"
                data-zone-browser-action="reveal-top"
                className="chip"
                disabled={topDeckCount === 0}
                onClick={() => onCommand({
                  id: "DEBUG_EDIT",
                  edit: {
                    kind: "REVEAL_DECK_TOP",
                    count: topDeckCount,
                    side: browser.side,
                  },
                  sourceSurface,
                })}
              >
                Reveal Top
              </button>
              <button
                type="button"
                data-zone-browser-action="play-top"
                className="chip"
                disabled={cardIds.length === 0}
                onClick={() => onCommand({
                  id: "DEBUG_EDIT",
                  edit: {
                    kind: "PLAY_FROM_DECK_TOP",
                    side: browser.side,
                  },
                  sourceSurface,
                })}
              >
                Play From Top
              </button>
              <button
                type="button"
                data-zone-browser-action="hide-top"
                className="chip"
                disabled={topDeckCount === 0}
                onClick={() => onCommand({
                  id: "DEBUG_EDIT",
                  edit: {
                    kind: "HIDE_DECK_TOP",
                    count: topDeckCount,
                    side: browser.side,
                  },
                  sourceSurface,
                })}
              >
                Hide Top
              </button>
              <button
                type="button"
                data-zone-browser-action="foresee"
                className="chip"
                disabled={cardIds.length === 0}
                onClick={() => onOpenForesee?.(browser.side, 1)}
              >
                Foresee…
              </button>
              <button
                type="button"
                data-zone-browser-action="reorder-full"
                className="chip"
                disabled={cardIds.length === 0}
                onClick={() => onOpenReorderMultiple?.(browser.side)}
              >
                Reorder Full Deck
              </button>
            </>
          ) : null}
          {selectedCard !== null ? (
            <>
              <button
                type="button"
                data-zone-browser-action="move-hand"
                className="chip"
                onClick={() => onCommand(createMoveCardToZoneCommand(selectedCard.battleCardId, browser.side, "hand", sourceSurface))}
              >
                → Hand
              </button>
              <button
                type="button"
                data-zone-browser-action="move-battlefield"
                className="chip"
                onClick={() => {
                  if (moveToBattlefieldCommand !== null) {
                    onCommand(moveToBattlefieldCommand);
                  }
                }}
                disabled={moveToBattlefieldCommand === null}
              >
                → Battlefield
              </button>
              <button
                type="button"
                data-zone-browser-action="move-void"
                className="chip"
                onClick={() => onCommand(createMoveCardToZoneCommand(selectedCard.battleCardId, browser.side, "void", sourceSurface))}
              >
                → Void
              </button>
              <button
                type="button"
                data-zone-browser-action="move-banished"
                className="chip"
                onClick={() => onCommand(createMoveCardToZoneCommand(selectedCard.battleCardId, browser.side, "banished", sourceSurface))}
              >
                → Banished
              </button>
              <button
                type="button"
                data-zone-browser-action="move-deck-top"
                className="chip"
                onClick={() => onCommand(createMoveCardToDeckCommand(selectedCard.battleCardId, browser.side, "top", sourceSurface))}
              >
                → Deck top
              </button>
              <button
                type="button"
                data-zone-browser-action="move-deck-bottom"
                className="chip"
                onClick={() => onCommand(createMoveCardToDeckCommand(selectedCard.battleCardId, browser.side, "bottom", sourceSurface))}
              >
                → Deck bot.
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function applyBrowserFilters(
  cardIds: readonly string[],
  state: BattleMutableState,
  query: string,
  sortMode: BattleZoneBrowserSortMode,
  typeFilter: BattleZoneBrowserTypeFilter,
): string[] {
  let visible = cardIds.filter((battleCardId) => {
    const card = state.cardInstances[battleCardId];
    if (card === undefined) {
      return false;
    }
    if (query !== "" && !card.definition.name.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }
    if (typeFilter === "character" && card.definition.battleCardKind !== "character") {
      return false;
    }
    if (typeFilter === "event" && card.definition.battleCardKind !== "event") {
      return false;
    }
    return true;
  });

  if (sortMode === "cost") {
    visible = [...visible].sort((left, right) => (
      (state.cardInstances[left]?.definition.energyCost ?? 0) -
      (state.cardInstances[right]?.definition.energyCost ?? 0)
    ));
  } else if (sortMode === "spark") {
    visible = [...visible].sort((left, right) => (
      (state.cardInstances[right]?.definition.printedSpark ?? 0) -
      (state.cardInstances[left]?.definition.printedSpark ?? 0)
    ));
  } else if (sortMode === "name") {
    visible = [...visible].sort((left, right) => (
      (state.cardInstances[left]?.definition.name ?? "").localeCompare(
        state.cardInstances[right]?.definition.name ?? "",
      )
    ));
  }

  return visible;
}

function formatZoneName(zone: BrowseableZone): string {
  switch (zone) {
    case "deck":
      return "Deck";
    case "hand":
      return "Hand";
    case "void":
      return "Void";
    case "banished":
      return "Banished";
  }
}

function sourceSurfaceForZoneBrowser(zone: BrowseableZone): BattleCommandSourceSurface {
  switch (zone) {
    case "deck":
      return "zone-browser-deck";
    case "hand":
      return "zone-browser-hand";
    case "void":
      return "zone-browser-void";
    case "banished":
      return "zone-browser-banished";
  }
}
