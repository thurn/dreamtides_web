// D97ShopSellPanel — selling owned copies to a Dreamtides 97 shop: the
// shop's frame (its keeper and the player's Essence) above one
// CardBrowserPanel over the collection, switching between the reserve and the
// active deck, each copy captioned with what the shop pays for it. Pressing a
// copy sells it. At the collection floor every copy is disabled, and while
// the active deck is at its minimum size every deck copy is.
// PURE: it renders from a view model and reports each sale by owned-copy id;
// the adapter records it as an intent. Which half is shown is local view
// state.

import { useEffect, useState, type ReactElement } from "react";
import { CardBrowserPanel } from "../../components/card/CardBrowserPanel";
import type { CardGalleryCardView } from "../../components/card/card-gallery-surface";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { D97OwnedCopyId } from "../../../types/identifiers";
import { D97ShopFrame, type D97ShopKeeperView } from "./D97ShopPanel";

/** One owned copy with its sale quote as its caption. */
export type D97ShopSellCardView = CardGalleryCardView<D97OwnedCopyId>;

export interface D97ShopSellView {
  /** The shop's keeper, or null for a shop nobody keeps. */
  readonly keeper: D97ShopKeeperView | null;
  /** The player's Essence. */
  readonly essence: number;
  /** Reserve copies in acquisition order. */
  readonly reserve: readonly D97ShopSellCardView[];
  /** Active-deck copies in acquisition order. */
  readonly deck: readonly D97ShopSellCardView[];
  /** The fewest copies the collection may hold. */
  readonly collectionFloor: number;
  /** Whether the collection is at its floor, so nothing may be sold. */
  readonly atFloor: boolean;
  /** The fewest copies the active deck may hold. */
  readonly minimumDeckSize: number;
  /** Whether the active deck is at its minimum, so no deck copy may be sold. */
  readonly deckAtMinimum: boolean;
}

export interface D97ShopSellPanelProps {
  readonly view: D97ShopSellView;
  readonly onSell: (copyId: D97OwnedCopyId) => void;
  readonly onClose: () => void;
}

type D97SellZone = "reserve" | "deck";

/** How a touch player reads a card before selling it. */
const READ_HINT = "Press and hold a card to read it.";

function isZone(value: string): value is D97SellZone {
  return value === "reserve" || value === "deck";
}

/** The sell overlay. Closed by Done or Escape. */
export function D97ShopSellPanel({ view, onSell, onClose }: D97ShopSellPanelProps): ReactElement {
  const isDesktop = useIsDesktop();
  const [zone, setZone] = useState<D97SellZone>("reserve");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const cards = zone === "reserve" ? view.reserve : view.deck;
  const deckLocked = zone === "deck" && view.deckAtMinimum;
  const shown = view.atFloor || deckLocked ? cards.map((card) => ({ ...card, disabled: true })) : cards;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sell Cards"
      className="cumulus"
      data-d97-shop-sell=""
      data-d97-shop-sell-zone={zone}
      data-d97-shop-sell-at-floor={view.atFloor ? "true" : "false"}
      data-d97-shop-sell-deck-at-minimum={view.deckAtMinimum ? "true" : "false"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: token("--layer-app-overlay"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isDesktop ? token("--space-2xl") : 0,
      }}
    >
      <D97ShopFrame keeper={view.keeper} essence={view.essence}>
        <CardBrowserPanel<D97OwnedCopyId>
          title="Sell Cards"
          subtitle={`${
            view.atFloor
              ? `You cannot sell below ${String(view.collectionFloor)} cards.`
              : deckLocked
                ? `Your deck cannot go below ${String(view.minimumDeckSize)} cards.`
                : "Tap a card to sell it for the price shown."
          }${isDesktop ? "" : ` ${READ_HINT}`}`}
          rightAccessory={{
            kind: "glassButton",
            button: { label: "Done", variant: "accent", onPress: onClose, testId: "d97-shop-sell-done" },
          }}
          toolbar={{
            segmented: {
              options: [
                { value: "reserve", label: `Reserve (${String(view.reserve.length)})` },
                { value: "deck", label: `Deck (${String(view.deck.length)})` },
              ],
              value: zone,
              onChange: (value) => {
                if (isZone(value)) setZone(value);
              },
              itemCounts: [view.reserve.length, view.deck.length],
              size: isDesktop ? "md" : "lg",
            },
          }}
          cards={shown}
          emptyLabel={zone === "reserve" ? "Your reserve is empty." : "Your deck is empty."}
          presentation="overlay"
          density="readable"
          onCardPress={onSell}
          testId="d97-shop-sell-panel"
        />
      </D97ShopFrame>
    </div>
  );
}
