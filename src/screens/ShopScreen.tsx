import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CardData } from "../types/cards";
import type { Dreamsign, SiteState } from "../types/quest";
import { CardDisplay } from "../components/CardDisplay";
import { CardOverlay } from "../components/CardOverlay";
import { EssenceValue } from "../components/EssenceValue";
import { HoverZoomCard } from "../components/HoverZoomCard";
import { HoverPopover } from "../tango/components/HoverPopover";
import {
  DREAMSIGN_HOVER_DELAY_MS,
  DreamsignHoverCard,
} from "../components/DreamsignHoverCard";
import { dreamsignIconUrl } from "../atlas/atlas-display";
import { SiteCloseButton } from "../components/SiteCloseButton";
import { buildCardSourceDebugState } from "../debug/card-source-debug";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { SiteGuide } from "../components/SiteGuide";
import {
  effectiveDiscountPercent,
  effectivePrice,
  rerollCost,
  runtimeSlotsToShopSlots,
  type ShopPriceModifiers,
  type ShopSlot,
} from "../shop/shop-generator";
import "./shop-screen.css";

/** Props for the ShopScreen component. */
interface ShopScreenProps {
  site: SiteState;
}

/**
 * How long a purchased ware plays its lift-and-fade before the buy mutation
 * commits and the slot settles into its acquired ghost.
 */
const SHOP_BUY_MS = 480;

/**
 * The Shop site as an immersive, full-bleed scene. The resident guide — Tobias
 * Tanglefur at a Card Shop, Amunet at the Dreamsign Market — lays out wares over
 * the dimmed dreamscape (supplied by the shared site scene backdrop) so the
 * player can spend essence on cards and Dreamsigns.
 *
 * Every visit exposes exactly one reroll. Triggering it refreshes all unsold
 * wares and disables the affordance for the rest of the visit; reroll state is
 * scoped per Shop site via `rerollCount` on the site runtime, so each Shop owns
 * its own fresh reroll. The Dreamsign Market shares this surface, detecting its
 * variant from `site.type`.
 *
 * The composition mirrors the Purge surface: a frosted wallet HUD, a centered
 * row of card-sized offers plus a reroll tile, a de-emphasized "Leave Shop"
 * link, a deck tray where purchases land, and the guide with a speech bubble
 * docked to the lower-left in landscape (see src/screens/shop-screen.css).
 */
export function ShopScreen({ site }: ShopScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { essence } = state;

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
  // Rerolls are paid for in essence.
  const canAffordReroll = currentRerollCost <= essence;
  const rerollAvailable = !rerollUsed && canAffordReroll;

  const visibleCardOffers = useMemo(
    () =>
      slots
        .filter(
          (slot) =>
            !slot.purchased && slot.itemType === "card" && slot.card !== null,
        )
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

  // Entrance animation, mirroring the Purge surface.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(id);
  }, []);

  // Slots mid-purchase: the ware lifts and fades before the buy commits.
  const [buying, setBuying] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureShopRuntime(site);
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

  // Log once per visit, after the shop runtime is stocked, so a production
  // visit can be reconstructed: which variant, whether enhanced, how many wares
  // were laid out, and the wallet the player walked in with. The runtime is
  // created by an effect on first render, so this waits for the stocked slots
  // rather than firing on the empty initial render.
  const loggedEntryRef = useRef(false);
  useEffect(() => {
    if (loggedEntryRef.current || runtime?.kind !== "shop") return;
    loggedEntryRef.current = true;
    logEvent("site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      wareCount: slots.length,
      essence,
    });
  }, [runtime, site.type, site.isEnhanced, slots.length, essence]);

  const handleBuy = useCallback(
    (index: number) => {
      if (buying.has(index)) return;
      setBuying((prev) => new Set(prev).add(index));
      window.setTimeout(() => {
        mutations.buyShopSlot(site.id, index);
        setBuying((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }, SHOP_BUY_MS);
    },
    [buying, mutations, site.id],
  );

  const handleReroll = useCallback(() => {
    mutations.rerollShop(site);
  }, [mutations, site]);

  const handleLeave = useCallback(() => {
    mutations.completeSite(site.id, "shop_left");
  }, [site.id, mutations]);

  if (runtime?.kind !== "shop") {
    return (
      <div className="shop-site" data-testid="shop-screen">
        <p className="sh-status">Opening shop…</p>
      </div>
    );
  }

  const wareSlotState = (index: number, canAfford: boolean): string => {
    if (buying.has(index)) return "bought";
    const base = mounted ? "show" : "enter";
    return canAfford ? base : `${base} dim`;
  };

  return (
    <div
      className={`shop-site${mounted ? " mounted" : ""}`}
      data-testid="shop-screen"
      data-shop-variant={site.type}
    >
      <SiteCloseButton
        onClose={handleLeave}
        testId="shop-leave"
        label="Leave shop"
      />

      {/* Offers grid: wares + a single-use restock tile */}
      <div className="sh-grid">
        {slots.map((slot, index) => (
          <ShopSlotCard
            key={`shop-slot-${String(index)}`}
            slot={slot}
            index={index}
            slotState={wareSlotState(
              index,
              effectivePrice(slot, priceModifiers) <= essence,
            )}
            canAfford={effectivePrice(slot, priceModifiers) <= essence}
            priceModifiers={priceModifiers}
            onBuy={handleBuy}
            onCardClick={setOverlayCard}
          />
        ))}

        {/* Restock — a single-use refresh, sized as one more ware. */}
        <RerollTile
          state={mounted ? "show" : "enter"}
          cost={currentRerollCost}
          used={rerollUsed}
          available={rerollAvailable}
          onClick={handleReroll}
        />
      </div>

      {/* Resident guide (shared SiteGuide), docked lower-left in landscape. */}
      <SiteGuide siteType={site.type} isEnhanced={site.isEnhanced} />

      <CardOverlay card={overlayCard} onClose={() => setOverlayCard(null)} />
    </div>
  );
}

/** Props for the single-use reroll tile. */
interface RerollTileProps {
  state: string;
  cost: number;
  used: boolean;
  available: boolean;
  onClick: () => void;
}

/**
 * The reroll affordance, presented as one more ware-sized tile in the grid. The
 * button text and `data-shop-reroll-*` hooks match the shop's reroll contract:
 * an essence cost when available, a free reroll on enhanced visits, and a spent
 * "Reroll Used" state once the single per-visit reroll is gone.
 */
function RerollTile({ state, cost, used, available, onClick }: RerollTileProps) {
  return (
    <div className={`sh-restock ${state}`}>
      <div className={`sh-restock-tile${used ? " spent" : ""}`}>
        <div className="sh-restock-ico">
          <i className="bxf bx-refresh" aria-hidden="true" />
        </div>
        <div className="sh-restock-name">{used ? "Restocked" : "Restock"}</div>
        <div className="sh-restock-sub">
          {used ? "The shelves are set." : "Refresh the wares, once."}
        </div>
      </div>
      <button
        type="button"
        className="sh-buy"
        data-shop-reroll-button=""
        data-shop-reroll-used={used ? "true" : "false"}
        disabled={!available}
        onClick={onClick}
      >
        {used ? (
          <span>Restocked</span>
        ) : cost === 0 ? (
          <>
            <span className="sh-buy-label">Restock</span>
            <span>Free</span>
          </>
        ) : (
          <>
            <span className="sh-buy-label">Restock</span>
            <EssenceValue
              amount={cost}
              color="inherit"
              data-shop-reroll-cost=""
            />
          </>
        )}
      </button>
    </div>
  );
}

/** Props for a single shop ware. */
interface ShopSlotCardProps {
  slot: ShopSlot;
  index: number;
  slotState: string;
  canAfford: boolean;
  priceModifiers: ShopPriceModifiers;
  onBuy: (index: number) => void;
  onCardClick: (card: CardData) => void;
}

/** Renders a single ware in the offers grid. */
function ShopSlotCard({
  slot,
  index,
  slotState,
  canAfford,
  priceModifiers,
  onBuy,
  onCardClick,
}: ShopSlotCardProps) {
  if (slot.purchased) {
    return (
      <div className="sh-slot" style={{ "--i": index } as CSSProperties}>
        <div className="sh-ghost">
          <span>Acquired</span>
        </div>
      </div>
    );
  }

  const price = effectivePrice(slot, priceModifiers);
  const discountPercent = effectiveDiscountPercent(slot, priceModifiers);
  const hasDiscount = discountPercent > 0;

  if (slot.itemType === "dreamsign" && slot.dreamsign) {
    const ds = slot.dreamsign;
    return (
      <div className={`sh-slot ${slotState}`} style={{ "--i": index } as CSSProperties}>
        <div className="sh-card">
          <ShopDreamsignArt dreamsign={ds} />
        </div>
        <BuyButton
          price={price}
          canAfford={canAfford}
          onClick={() => onBuy(index)}
        />
        {hasDiscount && <ShopSaleText discountPercent={discountPercent} />}
      </div>
    );
  }

  if (slot.card) {
    const card = slot.card;
    return (
      <div className={`sh-slot ${slotState}`} style={{ "--i": index } as CSSProperties}>
        <div className="sh-card">
          <HoverZoomCard logSurface="shop" glossaryText={card.renderedText}>
            <div
              data-testid={`shop-offer-row-${String(index)}`}
              tabIndex={0}
              aria-label={`Shop offer: ${card.name}`}
              className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              <CardDisplay
                card={card}
                suppressHoverHelp
                onClick={() => onCardClick(card)}
              />
            </div>
          </HoverZoomCard>
        </div>
        <BuyButton
          price={price}
          canAfford={canAfford}
          onClick={() => onBuy(index)}
        />
        {hasDiscount && <ShopSaleText discountPercent={discountPercent} />}
      </div>
    );
  }

  return null;
}

/** Renders the Buy button with the effective (post-discount) essence price. */
function BuyButton({
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
      type="button"
      className="sh-buy"
      disabled={!canAfford}
      onClick={onClick}
    >
      <span className="sh-buy-label">Buy</span>
      {/* The essence price is part of the button label, so the value and its
          crypto glyph read in the button's own light text rather than the
          purple used for plain essence values elsewhere. */}
      <EssenceValue
        amount={price}
        color="inherit"
        data-shop-price=""
      />
    </button>
  );
}

/** Sale caption shown under a discounted ware. */
function ShopSaleText({ discountPercent }: { discountPercent: number }) {
  return <p className="sh-sale">Sale {String(discountPercent)}% Off</p>;
}

/**
 * A Dreamsign ware shown the same way as the Dreamsign Revelation site: just the
 * floating art in a card-shaped cell, with the name and full effect text living
 * exclusively in the hover card. Hovering lifts and glows the art and opens the
 * shared {@link DreamsignHoverCard} popover.
 */
function ShopDreamsignArt({ dreamsign }: { dreamsign: Dreamsign }) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;
  return (
    <HoverPopover
      triggerAs="div"
      className="sh-sign-hover"
      delayMs={DREAMSIGN_HOVER_DELAY_MS}
      maxWidthPx={null}
      content={({ side, anchorRect }) => (
        <DreamsignHoverCard
          dreamsign={dreamsign}
          popoverSide={side}
          anchorRect={anchorRect}
        />
      )}
    >
      <div
        className={`sh-sign${dreamsign.isBane ? " is-bane" : ""}`}
        aria-label={
          dreamsign.isBane
            ? `Bane dreamsign: ${dreamsign.name}`
            : `Dreamsign: ${dreamsign.name}`
        }
      >
        {showImage ? (
          <img
            className="sh-sign-art"
            src={dreamsignIconUrl(String(dreamsign.imageName))}
            alt={dreamsign.imageAlt ?? dreamsign.name}
            onError={() => setImageBroken(true)}
          />
        ) : (
          <div className="sh-sign-fallback" aria-hidden="true">
            {dreamsign.isBane ? "☠" : "✦"}
          </div>
        )}
      </div>
    </HoverPopover>
  );
}
