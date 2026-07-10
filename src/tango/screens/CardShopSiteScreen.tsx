// CardShopSiteScreen — Tobias Tanglefur's Tango card shop. Five direct-buy
// cards and one restock action share a two-row glass gallery.

import type { CardData } from "../../types/cards";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
  type GuideGalleryHudView,
} from "./GuideGallerySiteLayout";

export interface CardShopOfferView {
  /** Stable UUID-derived tile id. */
  entryId: string;
  /** Persistent runtime slot index used to purchase the ware. */
  slotIndex: number;
  /** Fully resolved card rendered by GameCard. */
  card: CardData;
  /** Effective essence price after discounts. */
  price: number;
  /** Whether a tap purchases, is unaffordable, or was already acquired. */
  state: "available" | "unaffordable" | "purchased";
}

export interface CardShopRestockView {
  /** Stable action id. */
  entryId: string;
  /** Effective essence price for this visit. */
  price: number;
  /** Whether the one-use refresh can currently be triggered. */
  state: "available" | "unaffordable" | "used";
}

export interface CardShopSiteView {
  /** Stable site id used by the shared character-gallery layout. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Tobias's art and dialog line. */
  guide: GuideGalleryGuideView;
  /** Five card wares in persistent slot order. */
  offers: readonly CardShopOfferView[];
  /** The one-use restock action. */
  restock: CardShopRestockView;
  /** Persistent bottom-HUD data. */
  hud: GuideGalleryHudView;
}

export interface CardShopSiteScreenProps {
  /** Pure view-model rendered by the screen. */
  view: CardShopSiteView;
  /** Purchase a card immediately by persistent slot index. */
  onBuy: (slotIndex: number) => void;
  /** Refresh the available shop choices. */
  onRestock: () => void;
  /** Leave the shop. */
  onClose: () => void;
  /** Open the deck viewer from the QuestStatusBar deck sprite. */
  onViewDeck?: () => void;
}

export function CardShopSiteScreen({
  view,
  onBuy,
  onRestock,
  onClose,
  onViewDeck,
}: CardShopSiteScreenProps) {
  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      hud={view.hud}
      onViewDeck={onViewDeck}
      screenTestId="tango-card-shop-site-screen"
      guideArtTestId="tango-card-shop-guide-art"
      speechAnchorTestId="tango-card-shop-speech-anchor"
      speechBubbleTestId="tango-card-shop-speech-bubble"
      renderGallery={(layout) => (
        <CardShopGallery
          layout={layout}
          offers={view.offers}
          restock={view.restock}
          onBuy={onBuy}
          onRestock={onRestock}
          onClose={onClose}
        />
      )}
    />
  );
}

function CardShopGallery({
  layout,
  offers,
  restock,
  onBuy,
  onRestock,
  onClose,
}: {
  readonly layout: "mobile" | "desktop";
  readonly offers: readonly CardShopOfferView[];
  readonly restock: CardShopRestockView;
  readonly onBuy: (slotIndex: number) => void;
  readonly onRestock: () => void;
  readonly onClose: () => void;
}) {
  const desktop = layout === "desktop";
  return (
    <section
      data-card-shop-gallery-region=""
      data-card-shop-layout={layout}
      style={{
        position: "relative",
        zIndex: 10,
        minHeight: 0,
        height: "100%",
        maxHeight: "100%",
        width: desktop ? "100%" : `calc(100vw - (${token("--space-4")} * 2))`,
        boxSizing: "border-box",
        pointerEvents: "auto",
        alignSelf: desktop ? "stretch" : "start",
        justifySelf: desktop ? undefined : "center",
        display: desktop ? "grid" : undefined,
        alignItems: desktop ? "center" : undefined,
      }}
    >
      <CardGalleryPanel
        title="Card Shop"
        subtitle="Tap a card to purchase it"
        rightAccessory={{
          kind: "iconButton",
          glyph: GLYPHS.close,
          label: "Leave card shop",
          onPress: onClose,
          testId: "tango-card-shop-leave",
        }}
        cards={offers.map((offer) => ({
          entryId: offer.entryId,
          card: offer.card,
          testId: `tango-card-shop-offer-${offer.entryId}`,
          caption:
            offer.state === "purchased"
              ? { kind: "text", text: "Acquired" }
              : { kind: "essence", amount: offer.price },
          muted: offer.state !== "available",
        }))}
        columns="three"
        cardSize={desktop ? "standard" : "compact"}
        frame="floating"
        widthMode={desktop ? "content" : "fill"}
        spacing={desktop ? "regular" : "compact"}
        columnSpacing={desktop ? "wide" : "regular"}
        mobilePressPreview={!desktop}
        testId="tango-card-shop-gallery"
        onCardPress={(entryId) => {
          const offer = offers.find((candidate) => candidate.entryId === entryId);
          if (offer?.state === "available") onBuy(offer.slotIndex);
        }}
        endAction={{
          entryId: restock.entryId,
          glyph: GLYPHS.refresh,
          label: restock.state === "used" ? "Restocked" : "Restock shop",
          caption:
            restock.state === "used"
              ? { kind: "text", text: "Restocked" }
              : restock.price === 0
                ? { kind: "text", text: "Free" }
                : { kind: "essence", amount: restock.price },
          disabled: restock.state !== "available",
          testId: "tango-card-shop-restock",
        }}
        onEndActionPress={onRestock}
      />
    </section>
  );
}
