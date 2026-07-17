import type {
  MouseEvent as ReactMouseEvent,
  ReactElement,
} from "react";
import { CardZoneBrowserOverlay } from "../../cumulus/screens/CardZoneBrowserOverlay";
import type {
  BattleCommandSourceSurface,
  BattleMutableState,
  BattleSide,
} from "../types";
import { battleGameCardModel } from "../ui/battle-game-card-model";

export type CumulusBrowseableZone = "deck" | "void" | "banished";

export interface CumulusBattleZoneBrowserProps {
  readonly browser: {
    readonly side: BattleSide;
    readonly zone: CumulusBrowseableZone;
  };
  readonly state: BattleMutableState;
  readonly onClose: () => void;
  readonly onCardContextMenu?: (
    battleCardId: string,
    event: ReactMouseEvent<HTMLDivElement>,
    sourceSurface: BattleCommandSourceSurface,
  ) => void;
  readonly onCardDoubleTap?: (
    battleCardId: string,
    sourceSurface: BattleCommandSourceSurface,
  ) => void;
  readonly onCardDragEnd?: () => void;
  readonly onCardDragStart?: (
    battleCardId: string,
    sourceSurface: BattleCommandSourceSurface,
  ) => void;
  readonly onCardDropToBrowser?: (
    sourceSurface: BattleCommandSourceSurface,
  ) => void;
  readonly pendingDragSourceSurface?: BattleCommandSourceSurface | null;
}

function sourceSurfaceForZone(
  zone: CumulusBrowseableZone,
): BattleCommandSourceSurface {
  if (zone === "deck") return "zone-browser-deck";
  if (zone === "void") return "zone-browser-void";
  return "zone-browser-banished";
}

/** Battle-state adapter for the pure Cumulus card-zone browser overlay. */
export function CumulusBattleZoneBrowser({
  browser,
  state,
  onClose,
  onCardContextMenu,
  onCardDoubleTap,
  onCardDragEnd,
  onCardDragStart,
  onCardDropToBrowser,
  pendingDragSourceSurface = null,
}: CumulusBattleZoneBrowserProps): ReactElement {
  const cardIds = state.sides[browser.side][browser.zone];
  const sourceSurface = sourceSurfaceForZone(browser.zone);
  const cards = cardIds.flatMap((battleCardId) => {
    const instance = state.cardInstances[battleCardId];
    return instance === undefined
      ? []
      : [{
          entryId: battleCardId,
          model: battleGameCardModel(instance),
          draggable: true,
        }];
  });
  const isDropTarget =
    pendingDragSourceSurface !== null && onCardDropToBrowser !== undefined;

  return (
    <div
      data-battle-zone-browser={`${browser.side}:${browser.zone}`}
      data-battle-zone-drop-target={
        isDropTarget ? `${browser.side}:${browser.zone}` : undefined
      }
      onDragOver={(event) => {
        if (isDropTarget) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!isDropTarget || pendingDragSourceSurface === null) return;
        event.preventDefault();
        event.stopPropagation();
        onCardDropToBrowser(pendingDragSourceSurface);
      }}
    >
      <CardZoneBrowserOverlay
        ownerLabel={browser.side === "player" ? "Your" : "Enemy"}
        zone={browser.zone}
        cards={cards}
        onClose={onClose}
        onCardDragStart={(battleCardId) => {
          onCardDragStart?.(battleCardId, sourceSurface);
        }}
        onCardDragEnd={() => onCardDragEnd?.()}
        onCardContextMenu={(battleCardId, event) => {
          event.preventDefault();
          onCardContextMenu?.(battleCardId, event, sourceSurface);
        }}
        onCardDoubleTap={(battleCardId) => {
          onCardDoubleTap?.(battleCardId, sourceSurface);
        }}
      />
    </div>
  );
}
