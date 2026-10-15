import type { OpeningHandGuarantee } from "../../state/types";
import type { CardId, InstanceId, Side } from "../../state/ids";
import type { EventDefinition } from "../types";

/** `side` drew a card: it went from the top of that side's deck into its hand. */
export interface CardDrawnEvent {
  readonly kind: "cardDrawn";
  readonly side: Side;
  /** `null` as the other side sees the event (`eventSeenBy`). */
  readonly instance: InstanceId | null;
  /** Physical guarantee sources and the actual printing, private to the hand holder. */
  readonly openingHandGuaranteed?: { readonly cardId: CardId; readonly sources: readonly OpeningHandGuarantee[] };
}

/**
 * Both sides see that a card was drawn, as the hand's count is public; only
 * the drawing side sees which. The other side never learns the card from
 * the draw, even when it can identify it later in the batch (a card drawn
 * and then discarded or revealed).
 */
export const cardDrawn: EventDefinition<CardDrawnEvent> = {
  kind: "cardDrawn",
  privateTo: () => null,
  redact(event, viewer) {
    if (viewer === event.side || (event.instance === null && event.openingHandGuaranteed === undefined)) return event;
    const { openingHandGuaranteed: _privateSources, ...publicDraw } = event;
    return { ...publicDraw, instance: null };
  },
};
