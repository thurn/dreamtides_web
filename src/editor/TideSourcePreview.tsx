import type { CardData } from "../types/cards";
import { GameCard } from "../cumulus/components/card/CardView";
import { DreamcallerPortrait } from "../cumulus/components/hud/DreamcallerPortrait";
import type { Tides4DeckJson } from "../draft/pool/tides4-io";
import type { EditorDreamcaller } from "./tides-types";

interface TideSourcePreviewProps {
  tide: Tides4DeckJson;
  dreamcallerById: ReadonlyMap<string, EditorDreamcaller>;
  cardById: ReadonlyMap<string, CardData>;
  /** Pixel size of the rendered thumbnail (square for a portrait, width for a card). */
  size: number;
}

/**
 * The small source token shown for a tide: its Dreamcaller's portrait (signature
 * tides) or the themed card it is grown from (facet / neutral tides). Hovering a
 * portrait and card are named semantic sources whose complete reading copy is
 * supplied by the root reveal coordinator. Cards and Dreamcallers are resolved
 * by stable UUID, never by name.
 */
export function TideSourcePreview({
  tide,
  dreamcallerById,
  cardById,
  size,
}: TideSourcePreviewProps) {
  if (tide.role === "signature" && tide.dreamcallerId !== undefined) {
    const dreamcaller = dreamcallerById.get(tide.dreamcallerId.toLowerCase());
    if (dreamcaller === undefined) return null;
    return (
      <div style={{ width: size, height: size, flex: `0 0 ${size}px` }}>
        <DreamcallerPortrait dreamcaller={dreamcaller} variant="thumb" size={size} profile={{ id: dreamcaller.id, ability: dreamcaller.renderedText }} />
      </div>
    );
  }

  if (tide.leanCardId !== undefined) {
    const card = cardById.get(tide.leanCardId.toLowerCase());
    if (card === undefined) return null;
    return (
      <div style={{ width: size, flex: `0 0 ${size}px` }}>
        <GameCard model={{ cardId: card.id, displaySnapshot: card }} />
      </div>
    );
  }

  return null;
}
