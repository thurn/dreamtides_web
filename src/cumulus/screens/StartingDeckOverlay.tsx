// StartingDeckOverlay — the Cumulus presentational overlay for the starting-deck
// reveal.
//
// The first time a run has a DreamAvatar and has not yet seen its deck, the app
// shows the player the cards they begin the journey with. This is that popup: a
// CardBrowserPanel with the same left-aligned title/subtitle, trailing primary
// action, and internal card-grid scroll used by card-selection sites.
//
// The body is a scrolling grid of the starting cards in acquisition order. Each
// GameCard grows in place on hover (desktop), while mobile uses the same
// press-to-read large preview as the Deck Viewer. The gallery sizes itself to
// the screen: desktop uses a roomy floating five-column glass panel, while
// mobile uses a full-bleed four-column alpha scrim with the gallery body's
// scroll affordance handled by CardBrowserPanel. The content is
// intentionally minimal — the title, one line of intro copy, the cards, and
// the Begin Journey action. Dismissal is the action or Escape.
//
// PURE: renders from a view-model (`starting-deck-view-model.ts` builds it from
// live journey state in the adapter) and reports dismissal through `onClose`.

import type { ReactElement } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { DeckGalleryOverlay } from "./DeckGalleryOverlay";
import { tx } from "@trox/runtime";
import type { DeckEntryId } from "../../types/identifiers";
import type { DomTestId } from "../types/dom";

/**
 * One starting-deck card, resolved to the card the player actually holds
 * (type/keyword changes and debug stat overrides applied) and paired with the
 * hooks the grid needs. Keyed by `entryId` — never the card name, which is not
 * unique.
 */
export interface StartingDeckCardView {
  /** Stable deck-entry id; the grid key and the basis of `testId`. */
  entryId: DeckEntryId;
  /** Canonical UUID-backed card model. */
  model: GameCardModel;
  /** `data-testid` for the card's grid tile. */
  testId: DomTestId;
}

/** The full starting-deck view: every resolvable entry in acquisition order. */
export interface StartingDeckView {
  cards: StartingDeckCardView[];
}

/** Props for {@link StartingDeckOverlay}. */
export interface StartingDeckOverlayProps {
  /** Whether the overlay is shown. Renders nothing (with an exit fade) closed. */
  isOpen: boolean;
  /** The resolved starting-deck cards to lay out. */
  view: StartingDeckView;
  /** Dismisses the overlay; fires on Begin Journey and on Escape. */
  onClose: () => void;
}

/**
 * The starting-deck reveal overlay: a modal CardBrowserPanel with a scrolling
 * grid of the starting cards. Closed by Begin Journey or Escape.
 */
export function StartingDeckOverlay({
  isOpen,
  view,
  onClose,
}: StartingDeckOverlayProps): ReactElement {
  return (
    <DeckGalleryOverlay
      isOpen={isOpen}
      title={tx(
        "Starting Deck",
        "[ui] Copy for the modal that introduces the player's initial deck.",
      )}
      subtitle={tx(
        "These are the cards you begin the journey with.",
        "[ui] Starting deck subtitle.",
      )}
      cards={view.cards}
      emptyLabel={tx(
        "No cards in starting deck.",
        "[ui] Starting deck empty state.",
      )}
      actionLabel={tx("Begin Journey", "[ui] Starting deck begin action.")}
      onClose={onClose}
    />
  );
}
