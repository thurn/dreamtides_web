// D97ShopSellPanel — selling owned copies to a Dreamtides 97 shop: one
// CardBrowserPanel over the collection, switching between the reserve and the
// active deck, each copy captioned with what the shop pays for it. Pressing a
// copy sells it. At the collection floor every copy is disabled.
// PURE: it renders from a view model and reports each sale by owned-copy id;
// the adapter records it as an intent. Which half is shown is local view
// state.

import { useEffect, useState, type ReactElement } from "react";
import { CardBrowserPanel } from "../../components/card/CardBrowserPanel";
import type { CardGalleryCardView } from "../../components/card/card-gallery-surface";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { D97OwnedCopyId } from "../../../types/identifiers";

/** One owned copy with its sale quote as its caption. */
export type D97ShopSellCardView = CardGalleryCardView<D97OwnedCopyId>;

export interface D97ShopSellView {
  /** Reserve copies in acquisition order. */
  readonly reserve: readonly D97ShopSellCardView[];
  /** Active-deck copies in acquisition order. */
  readonly deck: readonly D97ShopSellCardView[];
  /** The fewest copies the collection may hold. */
  readonly collectionFloor: number;
  /** Whether the collection is at its floor, so nothing may be sold. */
  readonly atFloor: boolean;
}

export interface D97ShopSellPanelProps {
  readonly view: D97ShopSellView;
  readonly onSell: (copyId: D97OwnedCopyId) => void;
  readonly onClose: () => void;
}

type D97SellZone = "reserve" | "deck";

/** The panel's widest desktop measure. */
const SELL_MAX_WIDTH_PX = 1180;

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
  const shown = view.atFloor ? cards.map((card) => ({ ...card, disabled: true })) : cards;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sell Cards"
      className="cumulus"
      data-d97-shop-sell=""
      data-d97-shop-sell-zone={zone}
      data-d97-shop-sell-at-floor={view.atFloor ? "true" : "false"}
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
      <div
        style={{
          width: isDesktop ? `min(100%, ${String(SELL_MAX_WIDTH_PX)}px)` : "100%",
          height: isDesktop ? undefined : "100%",
          maxHeight: isDesktop ? `calc(100vh - ${token("--space-2xl")} - ${token("--space-2xl")})` : undefined,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <CardBrowserPanel<D97OwnedCopyId>
          title="Sell Cards"
          subtitle={
            view.atFloor
              ? `You cannot sell below ${String(view.collectionFloor)} cards.`
              : "Tap a card to sell it for the price shown."
          }
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
            },
          }}
          cards={shown}
          emptyLabel={zone === "reserve" ? "Your reserve is empty." : "Your deck is empty."}
          presentation="overlay"
          onCardPress={onSell}
          testId="d97-shop-sell-panel"
        />
      </div>
    </div>
  );
}
