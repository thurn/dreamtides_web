// CardShopSiteScreen — Tobias Tanglefur's Cumulus card shop. Five direct-buy
// cards and one restock action share a two-row glass gallery.

import { tx } from "@trox/runtime";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { SiteLayout, type SiteLayoutGuide } from "../components/layout/SiteLayout";
import { useIsDesktop } from "../primitives/use-is-desktop";
import {
  ShopFreePurchaseStatus,
  type ShopFreePurchaseStatusView,
} from "./ShopFreePurchaseStatus";

export interface CardShopOfferView {
  /** Stable UUID-derived tile id. */
  entryId: string;
  /** Persistent runtime slot index used to purchase the ware. */
  slotIndex: number;
  /** Fully resolved card rendered by GameCard. */
  model: GameCardModel;
  /** Effective essence price after discounts. */
  price: number;
  /** Whether a tap purchases, is unaffordable, or has left an empty slot. */
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
  presentation: import("./localized-site-presentation").LocalizedSitePresentation<
    Extract<import("../../types/sites-data").SitePresentation, { kind: "shop" }>
  >;
  /** Stable site id used by the shared character-gallery layout. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Tobias's art and dialog line. */
  guide: Omit<SiteLayoutGuide, "presence">;
  /** Five card wares in persistent slot order. */
  offers: readonly CardShopOfferView[];
  /** The one-use restock action. */
  restock: CardShopRestockView;
  /** Exploration benefits currently making successful purchases free. */
  freePurchaseStatus: ShopFreePurchaseStatusView;
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
}

export function CardShopSiteScreen({
  view,
  onBuy,
  onRestock,
  onClose,
}: CardShopSiteScreenProps) {
  const layout = useIsDesktop() ? "desktop" : "mobile";
  return (
    <div data-testid="cumulus-card-shop-site-screen">
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        atmosphere="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition="balanced-gallery"
      >
        <CardShopGallery
          layout={layout}
          presentation={view.presentation}
          offers={view.offers}
          restock={view.restock}
          freePurchaseStatus={view.freePurchaseStatus}
          onBuy={onBuy}
          onRestock={onRestock}
          onClose={onClose}
        />
      </SiteLayout>
    </div>
  );
}

function CardShopGallery({
  layout,
  presentation,
  offers,
  restock,
  freePurchaseStatus,
  onBuy,
  onRestock,
  onClose,
}: {
  readonly layout: "mobile" | "desktop";
  readonly presentation: CardShopSiteView["presentation"];
  readonly offers: readonly CardShopOfferView[];
  readonly restock: CardShopRestockView;
  readonly freePurchaseStatus: ShopFreePurchaseStatusView;
  readonly onBuy: (slotIndex: number) => void;
  readonly onRestock: () => void;
  readonly onClose: () => void;
}) {
  const desktop = layout === "desktop";
  const [locallyPurchasedEntryIds, setLocallyPurchasedEntryIds] = useState(
    () => new Set<string>(),
  );
  const [purchaseTravels, setPurchaseTravels] = useState<PurchaseTravel[]>([]);

  useEffect(() => {
    setLocallyPurchasedEntryIds((current) => {
      const persisted = new Set(
        offers
          .filter((offer) => offer.state === "purchased")
          .map((offer) => offer.entryId),
      );
      return current.size === persisted.size &&
        [...current].every((entryId) => persisted.has(entryId))
        ? current
        : persisted;
    });
  }, [offers]);

  const buyOffer = (offer: CardShopOfferView): void => {
    if (
      offer.state !== "available" ||
      locallyPurchasedEntryIds.has(offer.entryId)
    ) {
      return;
    }
    const source = Array.from(
      document.querySelectorAll<HTMLElement>("[data-gallery-entry-id]"),
    ).find((element) => element.dataset.galleryEntryId === offer.entryId);
    const deckTarget = document.querySelector<HTMLElement>(
      "[data-journey-deck-target]",
    );
    if (source !== undefined && deckTarget !== null) {
      const sourceRect = snapshotRect(source.getBoundingClientRect());
      const deckRect = snapshotRect(deckTarget.getBoundingClientRect());
      // The traveling card lands as a small, undistorted card centered on the
      // deck sprite rather than stretching to the sprite's square hit target.
      const targetWidth = Math.max(
        1,
        Math.min(sourceRect.width * 0.22, deckRect.width * 0.55),
      );
      const targetHeight = targetWidth / CARD_ASPECT_RATIO_VALUE;
      setPurchaseTravels((current) => [
        ...current,
        {
          key: `${offer.entryId}-${String(Date.now())}`,
          model: offer.model,
          sourceRect,
          targetRect: {
            left: deckRect.left + (deckRect.width - targetWidth) / 2,
            top: deckRect.top + (deckRect.height - targetHeight) / 2,
            width: targetWidth,
            height: targetHeight,
          },
        },
      ]);
    }
    setLocallyPurchasedEntryIds((current) => {
      const next = new Set(current);
      next.add(offer.entryId);
      return next;
    });
    onBuy(offer.slotIndex);
  };

  return (
    <section
      data-card-shop-gallery-region=""
      data-card-shop-layout={layout}
      data-shop-free-source={
        freePurchaseStatus.freeNextShopSource === null ? undefined : "next-shop"
      }
      data-shop-free-purchases-remaining={
        freePurchaseStatus.freePurchasesRemaining > 0
          ? freePurchaseStatus.freePurchasesRemaining
          : undefined
      }
      style={{
        position: "relative",
        zIndex: 10,
        minHeight: 0,
        height: "100%",
        maxHeight: "100%",
        width: desktop ? "100%" : `calc(100vw - (${token("--space-s")} * 2))`,
        boxSizing: "border-box",
        pointerEvents: "auto",
        alignSelf: desktop ? "stretch" : "start",
        justifySelf: desktop ? undefined : "center",
        display: "grid",
        alignContent: desktop ? "center" : "start",
        alignItems: desktop ? "center" : undefined,
        gap: token("--space-s"),
      }}
    >
      <ShopFreePurchaseStatus status={freePurchaseStatus} />
      <CardPickerPanel
        title={presentation.title}
        rightAccessory={{
          kind: "iconButton",
          button: {
            glyph: GLYPHS.close,
            label: tx(
              "Leave card shop",
              "[ui] Card shop leave action.",
            ),
            onPress: onClose,
            testId: "cumulus-card-shop-leave",
          },
        }}
        cards={offers.map((offer) => ({
          entryId: offer.entryId,
          model: offer.model,
          testId: `cumulus-card-shop-offer-${offer.entryId}`,
          caption: { kind: "essence", amount: offer.price },
          disabled: offer.state === "unaffordable",
          reserved:
            offer.state === "purchased" ||
            locallyPurchasedEntryIds.has(offer.entryId),
        }))}
        testId="cumulus-card-shop-gallery"
        onCardPress={(entryId) => {
          const offer = offers.find(
            (candidate) => candidate.entryId === entryId,
          );
          if (offer !== undefined) buyOffer(offer);
        }}
        endAction={{
          entryId: restock.entryId,
          glyph: GLYPHS.refresh,
          label:
            restock.state === "used"
              ? presentation.restocked
              : desktop
                ? presentation.restockOffersAction
                : presentation.restockAction,
          caption:
            restock.state === "used"
              ? {
                  kind: "text",
                  message: presentation.restocked,
                }
              : restock.price === 0
                ? {
                    kind: "text",
                    message: presentation.freePrice,
                  }
                : { kind: "essence", amount: restock.price },
          disabled: restock.state !== "available",
          testId: "cumulus-card-shop-restock",
        }}
        onEndActionPress={onRestock}
      />
      {purchaseTravels.map((travel) => (
        <motion.div
          key={travel.key}
          data-testid="cumulus-card-shop-purchase-travel"
          initial={{
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
          }}
          animate={{
            x: travel.targetRect.left - travel.sourceRect.left,
            y: travel.targetRect.top - travel.sourceRect.top,
            scale:
              travel.sourceRect.width > 0
                ? travel.targetRect.width / travel.sourceRect.width
                : 1,
            opacity: 0.2,
          }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => {
            setPurchaseTravels((current) =>
              current.filter((candidate) => candidate.key !== travel.key),
            );
          }}
          style={{
            position: "fixed",
            left: travel.sourceRect.left,
            top: travel.sourceRect.top,
            width: travel.sourceRect.width,
            height: travel.sourceRect.height,
            zIndex: 60,
            pointerEvents: "none",
            transformOrigin: "top left",
            willChange: "transform, opacity",
          }}
        >
          <GameCard model={travel.model} />
        </motion.div>
      ))}
    </section>
  );
}

interface RectSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface PurchaseTravel {
  readonly key: string;
  readonly model: GameCardModel;
  readonly sourceRect: RectSnapshot;
  readonly targetRect: RectSnapshot;
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
