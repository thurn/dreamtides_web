import type { CardData } from "../types/cards";
import { GameCard } from "../cumulus/components/card/CardView";
import type { Tides4DeckJson } from "../draft/pool/tides4-io";
import type { EditorAvatar } from "./tides-types";
import type { CardId } from "../types/card-identity";
import type { AvatarId } from "../types/identifiers";

interface TideSourcePreviewProps {
  tide: Tides4DeckJson;
  avatarById: ReadonlyMap<AvatarId, EditorAvatar>;
  cardById: ReadonlyMap<CardId, CardData>;
  /** Pixel size of the rendered thumbnail (square for a portrait, width for a card). */
  size: number;
}

/**
 * The small source token shown for a tide: its Avatar's portrait (signature
 * tides) or the themed card it is grown from (facet / neutral tides). Hovering a
 * portrait and card are named semantic sources whose complete reading copy is
 * supplied by the root reveal coordinator. Cards and Avatars are resolved
 * by stable UUID, never by name.
 */
export function TideSourcePreview({
  tide,
  cardById,
  size,
}: TideSourcePreviewProps) {
  const first = tide.cards[0];
  if (first !== undefined) {
    const card = cardById.get(first.id);
    if (card === undefined) return null;
    return (
      <div style={{ width: size, flex: `0 0 ${size}px` }}>
        <GameCard model={{ cardId: card.id, displaySnapshot: card }} />
      </div>
    );
  }

  return null;
}
