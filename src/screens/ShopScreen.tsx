import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { CardData } from "../types/cards";
import type { SiteState } from "../types/quest";
import { CardDisplay } from "../components/CardDisplay";
import { CardOverlay } from "../components/CardOverlay";
import { RulesText } from "../components/RulesText";
import { SIZE_PRESETS } from "../components/card-size";
import { buildCardSourceDebugState } from "../debug/card-source-debug";
import { useQuest } from "../state/quest-context";
import {
  effectivePrice,
  rerollCost,
  runtimeSlotsToShopSlots,
  type ShopSlot,
} from "../shop/shop-generator";

/** Props for the ShopScreen component. */
interface ShopScreenProps {
  site: SiteState;
}

/** Renders the Shop site screen with a 2x3 item grid, purchasing, and rerolling. */
export function ShopScreen({ site }: ShopScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { essence } = state;
  const runtime = state.siteRuntime[site.id];
  const slots = useMemo<ShopSlot[]>(
    () =>
      runtime?.kind === "shop"
        ? runtimeSlotsToShopSlots(runtime.slots, cardDatabase)
        : [],
    [cardDatabase, runtime],
  );
  const rerollCount = runtime?.kind === "shop" ? runtime.rerollCount : 0;
  const [overlayCard, setOverlayCard] = useState<CardData | null>(null);

  const currentRerollCost = useMemo(
    () => rerollCost(rerollCount, site.isEnhanced),
    [rerollCount, site.isEnhanced],
  );
  const visibleCardOffers = useMemo(
    () =>
      slots
        .filter((slot) => !slot.purchased && slot.itemType === "card" && slot.card !== null)
        .map((slot) => slot.card)
        .filter((card): card is CardData => card !== null),
    [slots],
  );
  const cardSourceDebugState = useMemo(
    () =>
      buildCardSourceDebugState(
        "Shop Offers",
        "Shop",
        visibleCardOffers,
        state.resolvedPackage,
      ),
    [visibleCardOffers, state.resolvedPackage],
  );

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureShopRuntime(site, false);
    }
  }, [mutations, runtime, site]);

  useEffect(() => {
    mutations.setCardSourceDebug(cardSourceDebugState, "shop_cards_shown");
  }, [cardSourceDebugState, mutations]);

  useEffect(
    () => () => {
      mutations.setCardSourceDebug(null, "shop_cards_hidden");
    },
    [mutations],
  );

  const handleBuy = useCallback(
    (index: number) => {
      mutations.buyShopSlot(site.id, index);
    },
    [mutations, site.id],
  );

  const handleReroll = useCallback(
    (index: number) => {
      mutations.rerollShop(site, index);
    },
    [mutations, site],
  );

  const handleLeave = useCallback(() => {
    mutations.completeSite(site.id, "shop_left");
  }, [site.id, mutations]);

  if (runtime?.kind !== "shop") {
    return (
      <motion.div
        className="flex min-h-full flex-col items-center justify-center px-4 py-6 md:px-8 md:py-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-sm opacity-70">Opening shop...</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <h2
          className="text-2xl font-bold tracking-wide md:text-3xl"
          style={{ color: "#a855f7" }}
        >
          Shop
        </h2>
        {site.isEnhanced && (
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold"
            style={{
              background: "rgba(168, 85, 247, 0.15)",
              color: "#c084fc",
              border: "1px solid rgba(168, 85, 247, 0.3)",
            }}
          >
            Enhanced -- Free Rerolls
          </span>
        )}
      </div>

      {/* Item grid: 3 columns desktop, 2 tablet */}
      <div
        className="w-full max-w-6xl"
        style={{
          display: "grid",
          gap: SIZE_PRESETS.medium.gap,
          gridTemplateColumns: SIZE_PRESETS.medium.columns,
        }}
      >
        {slots.map((slot, index) => (
          <ShopSlotCard
            key={`shop-slot-${String(index)}`}
            slot={slot}
            index={index}
            canAfford={effectivePrice(slot) <= essence}
            rerollCost={
              slot.itemType === "reroll" ? currentRerollCost : undefined
            }
            onBuy={handleBuy}
            onReroll={handleReroll}
            onCardClick={setOverlayCard}
          />
        ))}
      </div>

      {/* Leave button */}
      <button
        className="mt-8 rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
        style={{
          background: "rgba(107, 114, 128, 0.2)",
          border: "1px solid rgba(107, 114, 128, 0.4)",
          color: "#9ca3af",
        }}
        onClick={handleLeave}
      >
        Leave Shop
      </button>

      <CardOverlay card={overlayCard} onClose={() => setOverlayCard(null)} />
    </motion.div>
  );
}

/** Props for a single shop slot card. */
interface ShopSlotCardProps {
  slot: ShopSlot;
  index: number;
  canAfford: boolean;
  rerollCost?: number;
  onBuy: (index: number) => void;
  onReroll: (index: number) => void;
  onCardClick: (card: CardData) => void;
}

/** Renders a single slot in the shop grid. */
function ShopSlotCard({
  slot,
  index,
  canAfford,
  rerollCost: rerollCostValue,
  onBuy,
  onReroll,
  onCardClick,
}: ShopSlotCardProps) {
  if (slot.purchased) {
    return (
      <div
        className="rounded-lg opacity-20"
        style={{
          aspectRatio: "2 / 3",
          background:
            "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
          border: "1px dashed rgba(107, 114, 128, 0.15)",
        }}
      />
    );
  }

  const price = effectivePrice(slot);
  const hasDiscount = slot.discountPercent > 0;

  if (slot.itemType === "reroll") {
    const displayCost = rerollCostValue ?? slot.basePrice;
    const canAffordReroll = displayCost <= 0 || canAfford;
    return (
      <div className="flex flex-col gap-2">
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg p-4"
          style={{
            aspectRatio: "2 / 3",
            background:
              "linear-gradient(145deg, #1a1025 0%, #1a1030 60%, #0d0814 100%)",
            border: "1px solid rgba(168, 85, 247, 0.4)",
            boxShadow: "0 0 12px rgba(168, 85, 247, 0.15)",
          }}
        >
          <div className="text-4xl">{"\u267B\uFE0F"}</div>
          <h3
            className="text-center text-lg font-bold"
            style={{ color: "#a855f7" }}
          >
            Reroll Shop
          </h3>
          <p className="text-center text-xs opacity-50">
            Refresh all unsold items with new stock
          </p>
        </div>
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-opacity"
          style={{
            background: canAffordReroll ? "#7c3aed" : "#4b5563",
            color: canAffordReroll ? "#ffffff" : "#9ca3af",
            opacity: canAffordReroll ? 1 : 0.6,
            cursor: canAffordReroll ? "pointer" : "not-allowed",
          }}
          disabled={!canAffordReroll}
          onClick={() => onReroll(index)}
        >
          {displayCost === 0 ? (
            <span>Reroll (FREE)</span>
          ) : (
            <>
              <span>{`Reroll · ${String(displayCost)} `}</span>
              <span
                style={{ color: "var(--color-essence)" }}
                data-shop-essence-label=""
              >
                Essence
              </span>
            </>
          )}
        </button>
      </div>
    );
  }

  if (slot.itemType === "dreamsign" && slot.dreamsign) {
    const ds = slot.dreamsign;
    return (
      <div className="flex flex-col gap-2">
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg p-3"
          style={{
            aspectRatio: "2 / 3",
            background:
              "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
            border: "1px solid rgba(168, 85, 247, 0.3)",
            boxShadow: "0 0 8px rgba(168, 85, 247, 0.12)",
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "2px solid rgba(168, 85, 247, 0.35)",
              color: "#cbd5f5",
            }}
            aria-label={`${ds.name} sigil`}
          >
            {"\u2726"}
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: "rgba(168, 85, 247, 0.16)",
              color: "#c4b5fd",
              border: "1px solid rgba(168, 85, 247, 0.35)",
            }}
          >
            Dreamsign
          </span>
          <h3
            className="text-center text-sm font-bold"
            style={{ color: "#f8fafc" }}
          >
            {ds.name}
          </h3>
          <p
            className="text-center text-[10px] leading-tight opacity-70"
            style={{ color: "#e2e8f0" }}
          >
            <RulesText text={ds.effectDescription} />
          </p>
        </div>
        <PriceButton
          price={price}
          canAfford={canAfford}
          onClick={() => onBuy(index)}
        />
        {hasDiscount && <ShopSaleText discountPercent={slot.discountPercent} />}
      </div>
    );
  }

  // Card slot
  if (slot.card) {
    return (
      <div className="flex flex-col gap-2">
        <CardDisplay
          card={slot.card}
          onClick={() => onCardClick(slot.card!)}
        />
        <PriceButton
          price={price}
          canAfford={canAfford}
          onClick={() => onBuy(index)}
        />
        {hasDiscount && <ShopSaleText discountPercent={slot.discountPercent} />}
      </div>
    );
  }

  return null;
}

/** Renders the Buy button with the effective (post-discount) price. */
function PriceButton({
  price,
  canAfford,
  onClick,
}: {
  price: number;
  canAfford: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-opacity"
      style={{
        background: canAfford ? "#7c3aed" : "#4b5563",
        color: canAfford ? "#ffffff" : "#9ca3af",
        opacity: canAfford ? 1 : 0.6,
        cursor: canAfford ? "pointer" : "not-allowed",
      }}
      disabled={!canAfford}
      onClick={onClick}
    >
      <span>Buy</span>
      <span
        style={{ color: "var(--color-essence)" }}
        className="tabular-nums"
        data-shop-essence-price=""
      >
        {String(price)}
      </span>
      <span
        className="text-xs"
        style={{ color: "var(--color-essence)" }}
        data-shop-essence-label=""
      >
        Essence
      </span>
    </button>
  );
}

function ShopSaleText({ discountPercent }: { discountPercent: number }) {
  return (
    <p
      className="text-center text-[10px] font-black uppercase tracking-[0.18em]"
      style={{ color: "#fca5a5" }}
    >
      Sale {String(discountPercent)}% Off
    </p>
  );
}
