// D97ShopPanel — a Dreamtides 97 shop over the overworld: the keeper who
// runs it (their pixel-art bust and name) and the player's Essence on a strip
// over the world, above one CardPickerPanel of the shop's wares, its one-use
// restock and the action that opens selling (D97ShopFrame, which the sell
// panel shares). A shop with no keeper shows the Essence alone. Pressing an
// available ware buys it; on phones the wares sit two to a row and a press
// and hold reads one without buying it. Closed by the close disc or Escape.
// PURE: it renders from a view model and reports purchases by slot index,
// the restock, Sell and Close; the adapter records each as an intent.

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { CardPickerPanel } from "../../components/card/CardPickerPanel";
import { EssenceValue } from "../../components/hud/EssenceValue";
import { GLYPHS } from "../../primitives/glyph";
import { safeAreaInsetAtLeast } from "../../primitives/safe-area";
import { token } from "../../primitives/tokens";
import { useEscapeToClose } from "../../primitives/use-escape-to-close";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type {
  CardShopOfferView,
  CardShopRestockView,
} from "../CardShopSiteScreen";
import type {
  D97CharacterId,
  DeckEntryId,
  DreamAnchorId,
} from "../../../types/identifiers";
import { D97CharacterPortrait } from "./D97CharacterPortrait";

/** The resident who keeps the shop. */
export interface D97ShopKeeperView {
  readonly characterId: D97CharacterId;
  /** The keeper's name, or null when they have none to show. */
  readonly name: string | null;
  readonly portraitAlt: string;
}

export interface D97ShopView {
  readonly anchorId: DreamAnchorId;
  /** The keeper, or null for a shop nobody keeps. */
  readonly keeper: D97ShopKeeperView | null;
  /** The player's Essence. */
  readonly essence: number;
  /** The wares in slot order. */
  readonly offers: readonly CardShopOfferView[];
  readonly restock: CardShopRestockView;
  readonly labels: {
    readonly title: string;
    readonly restockAction: string;
    readonly restocked: string;
    readonly freePrice: string;
    readonly sell: string;
    readonly leave: string;
    /** How a touch player reads a ware before buying it, shown on phones. */
    readonly readHint: string;
  };
}

export interface D97ShopPanelProps {
  readonly view: D97ShopView;
  /** Buy the ware in slot `slotIndex`. */
  readonly onBuy: (slotIndex: number) => void;
  readonly onRestock: () => void;
  /** Open the sell panel in the shop's place. */
  readonly onSell: () => void;
  readonly onClose: () => void;
}

/** The widest desktop measure of a shop's panels, as the other D97 card panels. */
const SHOP_MAX_WIDTH_PX = 1180;

/**
 * The frame of a shop's panels: the strip over the world (the keeper's bust
 * and name on the left, the player's Essence on the right) above `children`,
 * one card panel. On desktop the strip spans the panel's own width, which
 * the panel fits to its cards; on phones both span the screen.
 */
export function D97ShopFrame({
  keeper,
  essence,
  children,
}: {
  readonly keeper: D97ShopKeeperView | null;
  readonly essence: number;
  /** The shop's one card panel. */
  readonly children: ReactNode;
}): ReactElement {
  const isDesktop = useIsDesktop();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const panel = bodyRef.current?.firstElementChild;
    if (!isDesktop || !(panel instanceof HTMLElement)) {
      setPanelWidth(null);
      return undefined;
    }
    const measure = () => setPanelWidth(panel.getBoundingClientRect().width);
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(panel);
    return () => observer?.disconnect();
  }, [isDesktop]);
  const outline = token("--text-outline-media");
  return (
    <div
      data-d97-shop-frame=""
      style={{
        width: isDesktop ? `min(100%, ${String(SHOP_MAX_WIDTH_PX)}px)` : "100%",
        height: isDesktop ? undefined : "100%",
        maxHeight: isDesktop
          ? `calc(100vh - ${token("--space-2xl")} - ${token("--space-2xl")})`
          : undefined,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-s"),
      }}
    >
      <header
        data-d97-shop-strip=""
        data-d97-shop-keeper={keeper?.characterId ?? ""}
        data-d97-shop-essence={essence}
        style={{
          flex: "none",
          boxSizing: "border-box",
          width: panelWidth === null ? "100%" : `${String(panelWidth)}px`,
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          gap: token("--space-m"),
          paddingTop: isDesktop ? 0 : safeAreaInsetAtLeast("top", "--space-s"),
          paddingInline: isDesktop ? 0 : token("--gutter"),
        }}
      >
        {keeper !== null && (
          <D97CharacterPortrait
            characterId={keeper.characterId}
            alt={keeper.portraitAlt}
          />
        )}
        {keeper?.name != null && (
          <h2
            data-d97-shop-keeper-name=""
            style={{
              margin: 0,
              minWidth: 0,
              font: token("--t-title"),
              color: token("--text-primary"),
              textShadow: outline,
              overflowWrap: "anywhere",
            }}
          >
            {keeper.name}
          </h2>
        )}
        <div
          data-d97-shop-essence-readout=""
          style={{
            marginInlineStart: "auto",
            font: token("--t-title"),
            textShadow: outline,
          }}
        >
          <EssenceValue amount={essence} />
        </div>
      </header>
      <div
        ref={bodyRef}
        style={{
          flex: "1 1 auto",
          alignSelf: "stretch",
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function D97ShopPanel({
  view,
  onBuy,
  onRestock,
  onSell,
  onClose,
}: D97ShopPanelProps): ReactElement {
  const isDesktop = useIsDesktop();
  useEscapeToClose(onClose);
  const { keeper, labels, restock } = view;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={keeper?.name ?? labels.title}
      className="cumulus"
      data-d97-shop={view.anchorId}
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
      <D97ShopFrame keeper={keeper} essence={view.essence}>
        <CardPickerPanel
          title={labels.title}
          {...(isDesktop ? {} : { subtitle: labels.readHint })}
          rightAccessory={{
            kind: "iconButton",
            button: {
              glyph: GLYPHS.close,
              label: labels.leave,
              onPress: onClose,
              testId: "d97-shop-leave",
            },
          }}
          cards={view.offers.map((offer) => ({
            entryId: offer.entryId,
            model: offer.model,
            testId: `d97-shop-offer-${String(offer.slotIndex)}`,
            caption: { kind: "essence", amount: offer.price },
            disabled: offer.state === "unaffordable",
            reserved: offer.state === "purchased",
          }))}
          onCardPress={(entryId: DeckEntryId) => {
            const offer = view.offers.find(
              (candidate) => candidate.entryId === entryId,
            );
            if (offer?.state === "available") onBuy(offer.slotIndex);
          }}
          endAction={{
            entryId: restock.entryId,
            glyph: GLYPHS.refresh,
            label:
              restock.state === "used"
                ? labels.restocked
                : labels.restockAction,
            caption:
              restock.state === "used"
                ? { kind: "text", message: labels.restocked }
                : restock.price === 0
                  ? { kind: "text", message: labels.freePrice }
                  : { kind: "essence", amount: restock.price },
            disabled: restock.state !== "available",
            testId: "d97-shop-restock",
          }}
          onEndActionPress={onRestock}
          footerActions={[
            {
              label: labels.sell,
              onPress: onSell,
              testId: "d97-shop-sell-open",
            },
          ]}
          presentation="overlay"
          density="readable"
          testId="d97-shop-panel"
        />
      </D97ShopFrame>
    </div>
  );
}
