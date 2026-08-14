// DreamsignBazaarSiteScreen — Amunet's Cumulus Dreamsign bazaar. It uses the
// Dream Market's guide/gallery stage with Dreamsign entities in the glass shelf.

import {motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { LocalizedDreamsign } from "../components/hud/Dreamsign";
import { DreamsignGalleryPanel } from "../components/card/DreamsignGalleryPanel";
import { Dreamsign } from "../components/hud/Dreamsign";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { GLOSSARY_IDS } from "../../data/glossary";
import { token } from "../primitives/tokens";
import {
  SiteLayout,
  type SiteLayoutGuideView,
} from "../components/layout/SiteLayout";
import { DreamsignReplacementDialog } from "../components/overlay/DreamsignReplacementDialog";
import { useIsDesktop } from "../primitives/use-is-desktop";
import {
  ShopFreePurchaseStatus,
  type ShopFreePurchaseStatusView,
} from "./ShopFreePurchaseStatus";
import { meaning, tx } from "@trox/runtime";

// Four 126px items, three 16px gaps, and the panel's 64px horizontal padding
// occupy 616px; this cap keeps a deliberate 32px breathing edge per side.
const DESKTOP_GALLERY_MAX_WIDTH = 680;

export interface DreamsignBazaarOfferView {
  /** Stable UUID-derived gallery entry id. */
  entryId: string;
  /** Persistent runtime slot index used to purchase the ware. */
  slotIndex: number;
  /** Dreamsign rendered by the shared semantic entity component. */
  dreamsign: LocalizedDreamsign;
  /** Effective essence price after discounts. */
  price: number;
  /** Whether the offer is available, unaffordable, or acquired. */
  state: "available" | "unaffordable" | "purchased";
  /** Whether buying must first choose an owned Dreamsign to replace. */
  requiresReplacement: boolean;
}

export interface DreamsignBazaarRestockView {
  /** Stable action id. */
  entryId: string;
  /** Effective essence price for this visit. */
  price: number;
  /** Whether the one-use refresh can currently be triggered. */
  state: "available" | "unaffordable" | "used";
}

export interface DreamsignBazaarPurgeView {
  /** Dreamsign the player is trying to purchase. */
  pendingDreamsign: LocalizedDreamsign;
  /** Current Dreamsigns, one of which must be replaced. */
  currentDreamsigns: readonly LocalizedDreamsign[];
  /** Maximum number of Dreamsigns the run may hold. */
  maxDreamsigns: number;
}

export interface DreamsignBazaarSiteView {
  presentation: import("./localized-site-presentation").LocalizedSitePresentation<
    Extract<
      import("../../types/sites-data").SitePresentation,
      { kind: "dreamsign-bazaar" }
    >
  >;
  /** Stable site id. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Amunet's art and dialog line. */
  guide: SiteLayoutGuideView;
  /** Three Dreamsign wares in persistent slot order. */
  offers: readonly DreamsignBazaarOfferView[];
  /** The one-use restock action. */
  restock: DreamsignBazaarRestockView;
  /** Exploration benefits currently making successful purchases free. */
  freePurchaseStatus: ShopFreePurchaseStatusView;
  /** Replacement state while purchasing at the Dreamsign cap. */
  purge: DreamsignBazaarPurgeView | null;
}

export interface DreamsignBazaarSiteScreenProps {
  /** Pure view-model rendered by the screen. */
  view: DreamsignBazaarSiteView;
  /** Purchase by persistent slot index, or open replacement selection. */
  onBuy: (slotIndex: number) => void;
  /** Refresh the available Dreamsign choices. */
  onRestock: () => void;
  /** Leave the bazaar. */
  onClose: () => void;
  /** Replace an owned Dreamsign while completing the pending purchase. */
  onPurge: (dreamsignId: string) => void;
  /** Cancel cap handling and return to the shelf. */
  onCancelPurge: () => void;
}

export function DreamsignBazaarSiteScreen({
  view,
  onBuy,
  onRestock,
  onClose,
  onPurge,
  onCancelPurge,
}: DreamsignBazaarSiteScreenProps) {
  const layout = useIsDesktop() ? "desktop" : "mobile";
  return (
    <div data-testid="cumulus-dreamsign-bazaar-site-screen" style={{ position: "fixed", inset: 0 }}>
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        moteTint="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition="balanced-gallery"
      >
        <DreamsignBazaarGallery
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
      {view.purge !== null ? (
        <DreamsignReplacementDialog
          model={{
            incoming: view.purge.pendingDreamsign,
            held: view.purge.currentDreamsigns,
            capacity: view.purge.maxDreamsigns,
            dismissLabel: tx(meaning("dreamsign-replacement-cancel", "Cancel"), "[dreamsign] Bazaar replacement cancel."),
            closeLabel: tx(
              "Cancel replacement",
              "[dreamsign] Accessible label for closing a Dreamsign replacement dialog.",
            ),
          }}
          onDreamsignPress={onPurge}
          onDismiss={onCancelPurge}
        />
      ) : null}
    </div>
  );
}

function DreamsignBazaarGallery({
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
  readonly presentation: DreamsignBazaarSiteView["presentation"];
  readonly offers: readonly DreamsignBazaarOfferView[];
  readonly restock: DreamsignBazaarRestockView;
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
    setLocallyPurchasedEntryIds(
      new Set(
        offers
          .filter((offer) => offer.state === "purchased")
          .map((offer) => offer.entryId),
      ),
    );
  }, [offers]);

  const buyOffer = (entryId: string): void => {
    const offer = offers.find((candidate) => candidate.entryId === entryId);
    if (
      offer === undefined ||
      offer.state !== "available" ||
      locallyPurchasedEntryIds.has(entryId)
    ) {
      return;
    }
    if (!offer.requiresReplacement) {
      const source = document.querySelector<HTMLElement>(
        `[data-dreamsign-gallery-entry-id="${entryId}"]`,
      );
      const hudTarget = document.querySelector<HTMLElement>(
        "[data-journey-status-bar-anchor]",
      );
      if (source !== null && hudTarget !== null) {
        const sourceRect = snapshotRect(source.getBoundingClientRect());
        const hudRect = snapshotRect(hudTarget.getBoundingClientRect());
        const targetSize = 36;
        setPurchaseTravels((current) => [
          ...current,
          {
            key: `${entryId}-${String(Date.now())}`,
            dreamsign: offer.dreamsign,
            sourceRect,
            targetRect: {
              left: hudRect.left + hudRect.width * 0.72,
              top: hudRect.top + (hudRect.height - targetSize) / 2,
              width: targetSize,
              height: targetSize,
            },
          },
        ]);
      }
      setLocallyPurchasedEntryIds((current) => new Set(current).add(entryId));
    }
    onBuy(offer.slotIndex);
  };

  return (
    <section
      data-dreamsign-bazaar-gallery-region=""
      data-dreamsign-bazaar-layout={layout}
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
        maxWidth: desktop ? DESKTOP_GALLERY_MAX_WIDTH : "100%",
        boxSizing: "border-box",
        pointerEvents: "auto",
        alignSelf: desktop ? "stretch" : "start",
        justifySelf: "center",
        display: "grid",
        alignContent: desktop ? "center" : "start",
        gap: token("--space-s"),
      }}
    >
      <ShopFreePurchaseStatus status={freePurchaseStatus} />
      <DreamsignGalleryPanel
        title={presentation.title}
        entries={offers.map((offer) => ({
          entryId: offer.entryId,
          dreamsign: offer.dreamsign,
          price: offer.price,
          state: locallyPurchasedEntryIds.has(offer.entryId)
            ? "purchased"
            : offer.state,
        }))}
        endAction={{
          entryId: restock.entryId,
          glyph: GLYPHS.refresh,
          label:
            restock.state === "used"
              ? presentation.restocked
              : desktop
                ? presentation.restockOffersAction
                : presentation.restockAction,
          glossaryId: GLOSSARY_IDS.dreamsignRestock,
          price:
            restock.state === "used" || restock.price === 0
              ? null
              : restock.price,
          text:
            restock.state === "used"
              ? presentation.restocked
              : restock.price === 0
                ? presentation.freePrice
                : null,
          disabled: restock.state !== "available",
        }}
        size={desktop ? "standard" : "compact"}
        closeLabel={tx(
          "Leave Dreamsign Bazaar",
          "[dreamsign] Bazaar leave action.",
        )}
        testId="cumulus-dreamsign-bazaar-gallery"
        onClose={onClose}
        onEntryPress={buyOffer}
        onEndActionPress={onRestock}
      />
      {purchaseTravels.map((travel) => (
        <motion.div
          key={travel.key}
          data-testid="cumulus-dreamsign-bazaar-purchase-travel"
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{
            x: travel.targetRect.left - travel.sourceRect.left,
            y: travel.targetRect.top - travel.sourceRect.top,
            scale: travel.targetRect.width / travel.sourceRect.width,
            opacity: 0.2,
          }}
          transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
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
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            transformOrigin: "top left",
            willChange: "transform, opacity",
          }}
        >
          <div
            style={{
              width: travel.sourceRect.width,
              height: travel.sourceRect.width,
            }}
          >
            <Dreamsign dreamsign={travel.dreamsign} variant="hud" />
          </div>
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
  readonly dreamsign: LocalizedDreamsign;
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
