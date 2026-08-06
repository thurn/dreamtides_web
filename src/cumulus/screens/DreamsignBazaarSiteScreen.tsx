// DreamsignBazaarSiteScreen — Amunet's Cumulus Dreamsign market. It uses the
// Dream Market's guide/gallery stage with Dreamsign entities in the glass shelf.

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import { DreamsignGalleryPanel } from "../components/card/DreamsignGalleryPanel";
import { Dreamsign } from "../components/hud/Dreamsign";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { GLOSSARY_IDS } from "../../data/glossary";
import { Pressable } from "../primitives/Pressable";
import { token } from "../primitives/tokens";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";

// Four 126px items, three 16px gaps, and the panel's 64px horizontal padding
// occupy 616px; this cap keeps a deliberate 32px breathing edge per side.
const DESKTOP_GALLERY_MAX_WIDTH = 680;

export interface DreamsignBazaarOfferView {
  /** Stable UUID-derived gallery entry id. */
  entryId: string;
  /** Persistent runtime slot index used to purchase the ware. */
  slotIndex: number;
  /** Dreamsign rendered by the shared semantic entity component. */
  dreamsign: DreamsignData;
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
  pendingDreamsign: DreamsignData;
  /** Current Dreamsigns, one of which must be replaced. */
  currentDreamsigns: readonly DreamsignData[];
  /** Maximum number of Dreamsigns the run may hold. */
  maxDreamsigns: number;
}

export interface DreamsignBazaarSiteView {
  /** Stable site id. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Amunet's art and dialog line. */
  guide: GuideGalleryGuideView;
  /** Three Dreamsign wares in persistent slot order. */
  offers: readonly DreamsignBazaarOfferView[];
  /** The one-use restock action. */
  restock: DreamsignBazaarRestockView;
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
  onPurge: (index: number) => void;
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
  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      screenTestId="cumulus-dreamsign-bazaar-site-screen"
      guideArtTestId="cumulus-dreamsign-bazaar-guide-art"
      speechAnchorTestId="cumulus-dreamsign-bazaar-speech-anchor"
      speechBubbleTestId="cumulus-dreamsign-bazaar-speech-bubble"
      renderGallery={(layout) => (
        <DreamsignBazaarGallery
          layout={layout}
          offers={view.offers}
          restock={view.restock}
          onBuy={onBuy}
          onRestock={onRestock}
          onClose={onClose}
        />
      )}
    >
      {view.purge !== null ? (
        <DreamsignReplacementDialog
          purge={view.purge}
          onPurge={onPurge}
          onCancel={onCancelPurge}
        />
      ) : null}
    </GuideGallerySiteLayout>
  );
}

function DreamsignBazaarGallery({
  layout,
  offers,
  restock,
  onBuy,
  onRestock,
  onClose,
}: {
  readonly layout: "mobile" | "desktop";
  readonly offers: readonly DreamsignBazaarOfferView[];
  readonly restock: DreamsignBazaarRestockView;
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
        display: desktop ? "grid" : undefined,
        alignItems: desktop ? "center" : undefined,
      }}
    >
      <DreamsignGalleryPanel
        title="Dreamsign Bazaar"
        entries={offers.map((offer) => ({
          entryId: offer.entryId,
          dreamsign: offer.dreamsign,
          price: offer.price,
          state:
            locallyPurchasedEntryIds.has(offer.entryId) ? "purchased" : offer.state,
        }))}
        endAction={{
          entryId: restock.entryId,
          glyph: GLYPHS.refresh,
          label:
            restock.state === "used"
              ? "Restocked"
              : desktop
                ? "Restock Offers"
                : "Restock",
          glossaryId: GLOSSARY_IDS.dreamsignRestock,
          price: restock.state === "used" || restock.price === 0 ? null : restock.price,
          text: restock.state === "used" ? "Restocked" : restock.price === 0 ? "Free" : null,
          disabled: restock.state !== "available",
        }}
        size={desktop ? "standard" : "compact"}
        closeLabel="Leave Dreamsign Bazaar"
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
          <Dreamsign dreamsign={travel.dreamsign} sizePx={travel.sourceRect.width} variant="hud" />
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
  readonly dreamsign: DreamsignData;
  readonly sourceRect: RectSnapshot;
  readonly targetRect: RectSnapshot;
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function DreamsignReplacementDialog({
  purge,
  onPurge,
  onCancel,
}: {
  readonly purge: DreamsignBazaarPurgeView;
  readonly onPurge: (index: number) => void;
  readonly onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dreamsign-bazaar-purge-title"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        padding: token("--space-l"),
        background: token("--scrim"),
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          width: "min(100%, 440px)",
          maxHeight: `calc(100dvh - ${token("--space-6xl")})`,
          overflow: "auto",
          boxSizing: "border-box",
          padding: token("--space-l"),
          background: token("--surface-chrome-strong"),
          border: `1px solid ${token("--border-soft")}`,
          borderRadius: token("--radius-panel"),
          boxShadow: token("--shadow-lg"),
        }}
      >
        <h2
          id="dreamsign-bazaar-purge-title"
          style={{ margin: 0, font: token("--t-title-sm"), color: token("--text-primary") }}
        >
          Choose a Dreamsign to Replace
        </h2>
        <p style={{ font: token("--t-body"), color: token("--text-secondary") }}>
          Your collection is full at {String(purge.maxDreamsigns)} Dreamsigns.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: token("--space-s"),
          }}
        >
          {purge.currentDreamsigns.map((dreamsign, index) => (
            <Dreamsign
              key={dreamsign.id}
              dreamsign={dreamsign}
              sizePx={72}
              onPress={() => onPurge(index)}
              testid={`cumulus-dreamsign-bazaar-purge-${String(index)}`}
            />
          ))}
        </div>
        <div style={{ marginTop: token("--space-l"), textAlign: "center" }}>
          <Pressable
            as="button"
            onClick={onCancel}
            style={{
              border: 0,
              background: "transparent",
              padding: token("--space-xs"),
              font: token("--t-button-sm"),
              color: token("--text-secondary"),
            }}
          >
            Cancel
          </Pressable>
        </div>
      </div>
    </div>
  );
}
