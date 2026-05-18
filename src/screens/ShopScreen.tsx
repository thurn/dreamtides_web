import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { CardData } from "../types/cards";
import type { SiteState } from "../types/quest";
import { CardDisplay } from "../components/CardDisplay";
import { CardOverlay } from "../components/CardOverlay";
import { DreamsignArtTile } from "../components/DreamsignArtTile";
import {
  CARD_HOVER_PREVIEW_DELAY_MS,
  CARD_HOVER_PREVIEW_WIDTH_PX,
  HoverPopover,
} from "../components/HoverPopover";
import { RulesText } from "../components/RulesText";
import { SIZE_PRESETS } from "../components/card-size";
import { buildCardSourceDebugState } from "../debug/card-source-debug";
import { useQuest } from "../state/quest-context";
import {
  effectiveDiscountPercent,
  effectivePrice,
  rerollCost,
  runtimeSlotsToShopSlots,
  type ShopPriceModifiers,
  type ShopSlot,
} from "../shop/shop-generator";

/** Props for the ShopScreen component. */
interface ShopScreenProps {
  site: SiteState;
}

/**
 * Renders the Shop site screen with a 2x3 item grid, purchasing, and a
 * single-use reroll affordance.
 *
 * Every visit to a Shop site exposes exactly one reroll. The reroll
 * affordance lives outside the inventory grid so it is always visible.
 * Triggering it refreshes all unsold slots and disables the affordance
 * for the rest of the visit. Reroll state is scoped per Shop site via
 * `rerollCount` on the site runtime, so each Shop in the atlas owns its
 * own fresh reroll.
 */
export function ShopScreen({ site }: ShopScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { essence, omens } = state;
  const isSpecialty = site.type === "SpecialtyShop";
  const runtime = state.siteRuntime[site.id];
  const priceModifiers = useMemo<ShopPriceModifiers>(
    () => ({
      essenceDiscountPercent: state.shopModifiers.essenceDiscountPercent,
    }),
    [state.shopModifiers.essenceDiscountPercent],
  );
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
    () => rerollCost(0, site.isEnhanced),
    [site.isEnhanced],
  );
  const rerollUsed = rerollCount > 0;
  // Rerolls are paid for in omens.
  const canAffordReroll = currentRerollCost <= omens;
  const rerollAvailable = !rerollUsed && canAffordReroll;

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
      mutations.ensureShopRuntime(site, isSpecialty);
    }
  }, [isSpecialty, mutations, runtime, site]);

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

  const handleReroll = useCallback(() => {
    mutations.rerollShop(site);
  }, [mutations, site]);

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
          {isSpecialty ? "Specialty Shop" : "Shop"}
        </h2>
        {isSpecialty && runtime.restrictedTide !== null && (
          <p className="mt-1 text-sm opacity-50">
            {`Featuring the ${runtime.restrictedTide} tide`}
          </p>
        )}
        {site.isEnhanced && (
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold"
            style={{
              background: "rgba(168, 85, 247, 0.15)",
              color: "#c084fc",
              border: "1px solid rgba(168, 85, 247, 0.3)",
            }}
          >
            Enhanced -- Free Reroll
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
            canAfford={
              slot.itemType === "dreamsign"
                ? effectivePrice(slot, priceModifiers) <= omens
                : effectivePrice(slot, priceModifiers) <= essence
            }
            priceModifiers={priceModifiers}
            onBuy={handleBuy}
            onCardClick={setOverlayCard}
          />
        ))}
      </div>

      {/* Reroll affordance: always rendered, single-use per visit */}
      <RerollButton
        cost={currentRerollCost}
        used={rerollUsed}
        available={rerollAvailable}
        onClick={handleReroll}
      />

      {/* Leave button */}
      <button
        className="mt-4 rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
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

/** Props for the standalone reroll button. */
interface RerollButtonProps {
  cost: number;
  used: boolean;
  available: boolean;
  onClick: () => void;
}

/**
 * Renders the single-use reroll affordance below the shop grid. The
 * button is always visible: it shows the cost when available, "Reroll
 * Used" when the player has already rerolled this visit, and a faded
 * cost when the player cannot afford it.
 */
function RerollButton({ cost, used, available, onClick }: RerollButtonProps) {
  return (
    <button
      className="mt-8 flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-base font-bold transition-opacity"
      style={{
        background: available ? "#7c3aed" : "#4b5563",
        color: available ? "#ffffff" : "#9ca3af",
        opacity: available ? 1 : 0.6,
        cursor: available ? "pointer" : "not-allowed",
        border: "1px solid rgba(168, 85, 247, 0.4)",
        boxShadow: available ? "0 0 12px rgba(168, 85, 247, 0.25)" : "none",
      }}
      disabled={!available}
      onClick={onClick}
      data-shop-reroll-button=""
      data-shop-reroll-used={used ? "true" : "false"}
    >
      {used ? (
        <span>Reroll Used</span>
      ) : cost === 0 ? (
        <span>Reroll Shop (FREE)</span>
      ) : (
        <>
          <span>{`Reroll Shop · ${String(cost)} `}</span>
          <span style={{ color: "#fbbf24" }} data-shop-omens-label="">
            Omens
          </span>
        </>
      )}
    </button>
  );
}

/** Props for a single shop slot card. */
interface ShopSlotCardProps {
  slot: ShopSlot;
  index: number;
  canAfford: boolean;
  priceModifiers: ShopPriceModifiers;
  onBuy: (index: number) => void;
  onCardClick: (card: CardData) => void;
}

/** Renders a single slot in the shop grid. */
function ShopSlotCard({
  slot,
  index,
  canAfford,
  priceModifiers,
  onBuy,
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

  const price = effectivePrice(slot, priceModifiers);
  const discountPercent = effectiveDiscountPercent(slot, priceModifiers);
  const hasDiscount = discountPercent > 0;

  if (slot.itemType === "dreamsign" && slot.dreamsign) {
    const ds = slot.dreamsign;
    const baneStyling = ds.isBane
      ? {
          border: "1px solid rgba(239, 68, 68, 0.40)",
          boxShadow: "0 0 8px rgba(239, 68, 68, 0.15)",
        }
      : {
          border: "1px solid rgba(168, 85, 247, 0.3)",
          boxShadow: "0 0 8px rgba(168, 85, 247, 0.12)",
        };
    return (
      <div className="flex flex-col gap-2">
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg p-3"
          style={{
            aspectRatio: "2 / 3",
            background:
              "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
            ...baneStyling,
          }}
        >
          <DreamsignArtTile dreamsign={ds} sizePx={96} />
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={
              ds.isBane
                ? {
                    background: "rgba(239, 68, 68, 0.16)",
                    color: "#fecaca",
                    border: "1px solid rgba(239, 68, 68, 0.40)",
                  }
                : {
                    background: "rgba(168, 85, 247, 0.16)",
                    color: "#c4b5fd",
                    border: "1px solid rgba(168, 85, 247, 0.35)",
                  }
            }
          >
            {ds.isBane ? "Bane Dreamsign" : "Dreamsign"}
          </span>
          <h3
            className="text-center text-sm font-bold"
            style={{ color: ds.isBane ? "#fca5a5" : "#f8fafc" }}
          >
            {ds.name}
          </h3>
          <div
            className="text-center text-[10px] leading-tight opacity-70"
            style={{ color: "#e2e8f0" }}
          >
            <RulesText text={ds.effectDescription} />
          </div>
        </div>
        <PriceButton
          price={price}
          currency="omens"
          canAfford={canAfford}
          onClick={() => onBuy(index)}
        />
        {hasDiscount && <ShopSaleText discountPercent={discountPercent} />}
      </div>
    );
  }

  // Card slot
  if (slot.card) {
    const card = slot.card;
    return (
      <div className="flex flex-col gap-2">
        <HoverPopover
          triggerAs="div"
          placement="top"
          delayMs={CARD_HOVER_PREVIEW_DELAY_MS}
          maxWidthPx={null}
          content={
            <div
              data-testid={`shop-offer-hover-card-${String(index)}`}
              style={{ width: CARD_HOVER_PREVIEW_WIDTH_PX }}
            >
              <CardDisplay card={card} />
            </div>
          }
        >
          <div
            data-testid={`shop-offer-row-${String(index)}`}
            tabIndex={0}
            aria-label={`Shop offer: ${card.name}`}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <CardDisplay card={card} onClick={() => onCardClick(card)} />
          </div>
        </HoverPopover>
        <PriceButton
          price={price}
          currency="essence"
          canAfford={canAfford}
          onClick={() => onBuy(index)}
        />
        {hasDiscount && <ShopSaleText discountPercent={discountPercent} />}
      </div>
    );
  }

  return null;
}

/** Renders the Buy button with the effective (post-discount) price. */
function PriceButton({
  price,
  currency,
  canAfford,
  onClick,
}: {
  price: number;
  currency: "essence" | "omens";
  canAfford: boolean;
  onClick: () => void;
}) {
  const currencyColor =
    currency === "omens" ? "#fbbf24" : "var(--color-essence)";
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
        style={{ color: currencyColor }}
        className="tabular-nums"
        data-shop-price=""
      >
        {String(price)}
      </span>
      <span
        className="text-xs"
        style={{ color: currencyColor }}
        data-shop-currency-label=""
      >
        {currency === "omens" ? "Omens" : "Essence"}
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
