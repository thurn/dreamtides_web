import {
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import type { CardId } from "../../../types/card-identity";
import type { FrozenCardData } from "../../../types/cards";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { Pressable } from "../../primitives/Pressable";
import type { ArtRef } from "../../primitives/art";
import { resolveArtRef } from "../../primitives/art";
import type { Glyph } from "../../primitives/glyph";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { richText } from "../card/rich-text";
import { CardView } from "../card/CardView";
import { CARD_CORNER_RADIUS } from "../card/card-aspect";
import { offerTileDescription } from "./offer-tile-descriptions";
import offerFrameUrl from "../../assets/Skill_Frame_iron.png";
import "./offer-tile.css";

/** The fixed width and height of an OfferTile, in pixels. */
export const OFFER_TILE_SIZE = 200;

/** UUID-backed complete card shown symbolically inside an offer. */
export interface OfferTileCard {
  /** Canonical card UUID. Names are display-only and never enter the tile model. */
  cardId: CardId;
  /** Complete UUID-matched display data for the card face. */
  displaySnapshot: FrozenCardData;
}

/** UUID-backed dreamsign art shown symbolically inside an offer. */
export interface OfferTileDreamsign {
  /** Canonical dreamsign UUID. */
  id: string;
  /** Dreamsign artwork as a named Cumulus art reference. */
  art: ArtRef;
}

/** A site symbol shown by the add-site offer. */
export interface OfferTileSite {
  /** Stable site type or fixture id. */
  id: string;
  /** The site's named design-system glyph. */
  glyph: Glyph;
}

/** The four surfaced card choices carried by every card-draft offer. */
export type OfferTileFourCards = readonly [
  OfferTileCard,
  OfferTileCard,
  OfferTileCard,
  OfferTileCard,
];

/** The fixed cards granted together by a bundle offer. */
export type OfferTileBundleCards =
  | readonly [OfferTileCard, OfferTileCard]
  | readonly [OfferTileCard, OfferTileCard, OfferTileCard];

/** The one or two starter cards preselected for transfiguration. */
export type OfferTileStarterCards =
  | readonly [OfferTileCard]
  | readonly [OfferTileCard, OfferTileCard];

/** The one to three surfaced deck-card choices in a duplicate offer. */
export type OfferTileDuplicateCards =
  | readonly [OfferTileCard]
  | readonly [OfferTileCard, OfferTileCard]
  | readonly [OfferTileCard, OfferTileCard, OfferTileCard];

/** The two to four surfaced choices in a dreamsign-draft offer. */
export type OfferTileDreamsignChoices =
  | readonly [OfferTileDreamsign, OfferTileDreamsign]
  | readonly [OfferTileDreamsign, OfferTileDreamsign, OfferTileDreamsign]
  | readonly [
      OfferTileDreamsign,
      OfferTileDreamsign,
      OfferTileDreamsign,
      OfferTileDreamsign,
    ];

interface OfferTileBase {
  /**
   * Stable identity for this visible offer. Production callers should combine
   * the encounter signature and offer id so simultaneous offers never collide.
   */
  id: string;
}

/**
 * Strict symbolic compositions for every Dream Augury offer category. The
 * component owns the composition; callers provide only UUID-backed subjects.
 */
export type OfferTileModel =
  | (OfferTileBase & { kind: "card-gift"; card: OfferTileCard })
  | (OfferTileBase & {
      kind: "card-draft" | "category-draft" | "transfigured-draft";
      cards: OfferTileFourCards;
    })
  | (OfferTileBase & {
      kind: "copies-draft";
      cards: OfferTileFourCards;
      /** Exact number of copies granted for the selected card. */
      copyCount: number;
    })
  | (OfferTileBase & { kind: "card-bundle"; cards: OfferTileBundleCards })
  | (OfferTileBase & {
      kind: "transfigure-card" | "keyword-modification" | "tribal-change";
      card: OfferTileCard;
    })
  | (OfferTileBase & {
      kind: "transfigure-starters";
      cards: OfferTileStarterCards;
    })
  | (OfferTileBase & { kind: "purge-card"; card: OfferTileCard })
  | (OfferTileBase & {
      kind: "trade-card";
      outgoing: OfferTileCard;
      incoming: OfferTileFourCards;
    })
  | (OfferTileBase & {
      kind: "duplicate-card";
      cards: OfferTileDuplicateCards;
    })
  | (OfferTileBase & {
      kind: "dreamsign-gift";
      dreamsign: OfferTileDreamsign;
    })
  | (OfferTileBase & {
      kind: "dreamsign-draft";
      dreamsigns: OfferTileDreamsignChoices;
    })
  | (OfferTileBase & { kind: "add-site"; site: OfferTileSite });

export interface OfferTileProps {
  /** The offer's strict symbolic view model. */
  model: OfferTileModel;
  /** Activates the offer, reporting the stable `model.id`. */
  onPress: (offerId: string) => void;
  /** Optional test selector; defaults to `offer-tile`. */
  testId?: string;
}

/**
 * A 200×200 framed symbolic Dream Augury offer button. Its rounded gold frame
 * surrounds complete cards, dreamsigns, and glyphs. Every inner
 * object is decorative and pointer-transparent. The complete tile is the only
 * hover/focus/press target and reveals one category InfoCard.
 */
export function OfferTile({
  model,
  onPress,
  testId = "offer-tile",
}: OfferTileProps): ReactElement {
  const binding = useRevealSource({
    identity: {
      entityType: "offer",
      entityId: revealEntityId("offer", model.id),
    },
    spec: {
      primary: {
        kind: "infoCard",
        card: {
          variant: "text",
          body: richText.plain(offerTileDescription(model)),
        },
      },
      secondaries: [],
    },
    onActivate: () => onPress(model.id),
  });
  const lastPointerType = useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;
  const motionDelay = offerTileMotionDelay(model.id);

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      aria-label={offerTileDescription(model)}
      data-testid={testId}
      data-offer-tile=""
      data-offer-tile-kind={model.kind}
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
        pointerDown?.(event);
      }}
      onClick={(event) => {
        if (lastPointerType.current !== "touch" || event.detail === 0) {
          onPress(model.id);
        }
      }}
      style={{
        ...binding.sourceProps.style,
        position: "relative",
        width: OFFER_TILE_SIZE,
        height: OFFER_TILE_SIZE,
        minWidth: OFFER_TILE_SIZE,
        minHeight: OFFER_TILE_SIZE,
        padding: 0,
        boxSizing: "border-box",
        overflow: "visible",
        appearance: "none",
        border: 0,
        borderRadius: token("--radius-panel"),
        background: "transparent",
        color: token("--text-on-glass"),
        textAlign: "left",
      }}
    >
      <span
        className="cumulus-offer-tile__floating-frame"
        data-offer-tile-floating-frame=""
        aria-hidden="true"
        style={{ animationDelay: motionDelay, pointerEvents: "none" }}
      >
        <span
          className="cumulus-offer-tile__depth"
          data-offer-tile-background=""
          style={glassSurfaceStyle({ radius: token("--radius-panel") })}
        />
        <span
          className="cumulus-offer-tile__visual"
          data-offer-tile-visual=""
          style={{ pointerEvents: "none" }}
        >
          <OfferVisual model={model} />
        </span>
        <img
          className="cumulus-offer-tile__frame"
          data-offer-tile-frame=""
          src={offerFrameUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{ pointerEvents: "none" }}
        />
      </span>
    </Pressable>
  );
}

/** Stable negative phase so neighboring tiles drift independently on every render. */
function offerTileMotionDelay(offerId: string): string {
  let hash = 0;
  for (const character of offerId) {
    hash = (hash * 31 + character.charCodeAt(0)) % 5800;
  }
  return `${String(-hash / 1000)}s`;
}

type CardTreatment = "plain" | "purged" | "duplicate";
type FullCardSize = "draft" | "compact" | "medium" | "standard";

const FULL_CARD_WIDTH: Readonly<Record<FullCardSize, number>> = {
  compact: 64,
  draft: 54,
  medium: 76,
  standard: 88,
};

function DreamsignArtPiece({
  dreamsign,
  size = "large",
}: {
  readonly dreamsign: OfferTileDreamsign;
  readonly size?: "small" | "large";
}): ReactElement {
  const [imageBroken, setImageBroken] = useState(false);
  const edge = size === "small" ? 66 : 128;
  return (
    <span
      data-offer-tile-dreamsign-id={dreamsign.id}
      style={{
        display: "grid",
        placeItems: "center",
        width: edge,
        height: edge,
        pointerEvents: "none",
        filter: `drop-shadow(0 8px 10px color-mix(in srgb, ${token("--surface-chrome-strong")} 72%, transparent))`,
      }}
    >
      {imageBroken ? (
        <i
          className={GLYPHS.star}
          style={{ fontSize: edge * 0.58, pointerEvents: "none" }}
        />
      ) : (
        <img
          src={resolveArtRef(dreamsign.art)}
          alt=""
          draggable={false}
          onError={() => setImageBroken(true)}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      )}
    </span>
  );
}

function FullCardPiece({
  card,
  size = "standard",
  treatment = "plain",
}: {
  readonly card: OfferTileCard;
  readonly size?: FullCardSize;
  readonly treatment?: CardTreatment;
}): ReactElement {
  const treatmentStyle: CSSProperties =
    treatment === "purged"
      ? {
          boxShadow: `0 0 0 3px ${token("--danger")}, ${token("--shadow-card")}`,
        }
      : treatment === "duplicate"
          ? {
              boxShadow: `0 0 0 2px ${token("--energy")}, ${token("--shadow-card")}`,
            }
          : { boxShadow: token("--shadow-card") };
  return (
    <span
      data-offer-tile-full-card={card.cardId}
      style={{
        position: "relative",
        display: "block",
        zIndex: 1,
        width: FULL_CARD_WIDTH[size],
        borderRadius: CARD_CORNER_RADIUS,
        pointerEvents: "none",
        ...treatmentStyle,
      }}
    >
      <CardView card={card.displaySnapshot} statTooltips={false} />
    </span>
  );
}

function FullCardStack({
  cards,
  layout = "operation",
  treatment = "plain",
}: {
  readonly cards: readonly OfferTileCard[];
  readonly layout?: "bundle" | "operation";
  readonly treatment?: CardTreatment;
}): ReactElement {
  const bundleLayout = layout === "bundle";
  const size = bundleLayout ? "medium" : cards.length >= 3 ? "compact" : "medium";
  const cardWidth = FULL_CARD_WIDTH[size];
  const stageWidth = bundleLayout ? 150 : 132;
  const stageHeight = bundleLayout ? 140 : 126;
  const spread = bundleLayout ? (cards.length >= 3 ? 30 : 26) : cards.length >= 3 ? 26 : 22;
  return (
    <span
      data-offer-tile-full-card-stack=""
      style={{
        position: "relative",
        display: "block",
        width: stageWidth,
        height: stageHeight,
        translate: bundleLayout ? `0 ${token("--space-5")}` : undefined,
        pointerEvents: "none",
      }}
    >
      {cards.map((card, index) => {
        const offset = index - (cards.length - 1) / 2;
        return (
          <span
            key={card.cardId}
            style={{
              position: "absolute",
              left: (stageWidth - cardWidth) / 2 + offset * spread,
              top: (bundleLayout ? 4 : 8) + Math.abs(offset) * 4,
              rotate: `${String(offset * 5)}deg`,
              pointerEvents: "none",
            }}
          >
            <FullCardPiece card={card} size={size} treatment={treatment} />
          </span>
        );
      })}
    </span>
  );
}

function OperationMark({
  glyph,
  tone = "neutral",
  layout,
}: {
  readonly glyph: Glyph;
  readonly tone?: "neutral" | "accent" | "danger" | "spark" | "duplicate";
  readonly layout: "card-overlay" | "diagonal" | "overlay";
}): ReactElement {
  const color =
    tone === "accent"
      ? token("--accent-bright")
      : tone === "danger"
        ? token("--danger")
        : tone === "spark"
          ? token("--spark")
          : tone === "duplicate"
            ? token("--energy-bright")
            : token("--text-on-glass");
  return (
    <span
      data-offer-tile-operation=""
      data-offer-tile-operation-layout={layout}
      style={{
        position: "absolute",
        left: layout === "overlay" ? "50%" : undefined,
        top: layout === "overlay" ? "50%" : undefined,
        right:
          layout === "diagonal" ? 0 : layout === "card-overlay" ? 8 : undefined,
        bottom:
          layout === "diagonal" ? 0 : layout === "card-overlay" ? 4 : undefined,
        translate: layout === "overlay" ? "-50% -50%" : undefined,
        zIndex: 2,
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        width: layout === "overlay" ? 48 : layout === "diagonal" ? 82 : 54,
        height: layout === "overlay" ? 48 : layout === "diagonal" ? 82 : 54,
        borderRadius: token("--radius-pill"),
        color,
        background: token("--surface-chrome-strong"),
        border: `1px solid color-mix(in srgb, ${color} 62%, ${token("--text-on-glass")} 38%)`,
        boxShadow: token("--shadow-md"),
        pointerEvents: "none",
      }}
    >
      <i
        className={glyph}
        style={{
          fontSize: layout === "overlay" ? 26 : layout === "diagonal" ? 42 : 30,
          lineHeight: 1,
          pointerEvents: "none",
        }}
      />
    </span>
  );
}

function OperationComposition({
  children,
  glyph,
  tone,
  layout,
}: {
  readonly children: ReactNode;
  readonly glyph: Glyph;
  readonly tone?: "neutral" | "accent" | "danger" | "spark" | "duplicate";
  readonly layout: "diagonal" | "overlay";
}): ReactElement {
  return (
    <span
      data-offer-tile-composition={layout}
      style={
        layout === "overlay"
          ? {
              position: "relative",
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }
          : {
              position: "relative",
              display: "block",
              width: 150,
              height: 150,
              pointerEvents: "none",
            }
      }
    >
      {layout === "diagonal" ? (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          {children}
        </span>
      ) : (
        children
      )}
      <OperationMark glyph={glyph} tone={tone} layout={layout} />
    </span>
  );
}

function FullCardOperation({
  card,
  glyph,
  tone,
  treatment,
}: {
  readonly card: OfferTileCard;
  readonly glyph: Glyph;
  readonly tone?: "neutral" | "accent" | "danger" | "spark" | "duplicate";
  readonly treatment?: "plain" | "purged";
}): ReactElement {
  return (
    <span
      data-offer-tile-composition="card-overlay"
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: 150,
        height: 150,
        pointerEvents: "none",
      }}
    >
      <FullCardPiece card={card} treatment={treatment} />
      <OperationMark glyph={glyph} tone={tone} layout="card-overlay" />
    </span>
  );
}

function FullCardStackOperation({
  cards,
  glyph,
  tone,
  treatment,
}: {
  readonly cards: readonly OfferTileCard[];
  readonly glyph: Glyph;
  readonly tone?: "neutral" | "accent" | "danger" | "spark" | "duplicate";
  readonly treatment?: CardTreatment;
}): ReactElement {
  return (
    <span
      data-offer-tile-composition="card-overlay"
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: 150,
        height: 150,
        pointerEvents: "none",
      }}
    >
      <FullCardStack cards={cards} treatment={treatment} />
      <OperationMark glyph={glyph} tone={tone} layout="card-overlay" />
    </span>
  );
}

function DraftGrid({
  cards,
  treatment = "plain",
}: {
  readonly cards: readonly OfferTileCard[];
  readonly treatment?: CardTreatment;
}) {
  return (
    <span
      data-offer-tile-card-grid=""
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(2, ${String(FULL_CARD_WIDTH.draft)}px)`,
        gap: token("--space-1"),
        pointerEvents: "none",
      }}
    >
      {cards.map((card) => (
        <FullCardPiece
          key={card.cardId}
          card={card}
          size="draft"
          treatment={treatment}
        />
      ))}
    </span>
  );
}

function TradeComposition({
  outgoing,
  incoming,
}: {
  readonly outgoing: OfferTileCard;
  readonly incoming: OfferTileFourCards;
}): ReactElement {
  return (
    <span
      data-offer-tile-trade=""
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      <DraftGrid cards={incoming} />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          zIndex: 2,
          translate: "-50% -50%",
          pointerEvents: "none",
        }}
      >
        <FullCardPiece card={outgoing} treatment="purged" size="draft" />
      </span>
    </span>
  );
}

function OfferVisual({ model }: { readonly model: OfferTileModel }): ReactElement {
  switch (model.kind) {
    case "card-gift":
      return <FullCardPiece card={model.card} />;
    case "card-draft":
      return <DraftGrid cards={model.cards} />;
    case "copies-draft":
      return (
        <OperationComposition glyph={GLYPHS.copy} tone="duplicate" layout="overlay">
          <DraftGrid cards={model.cards} />
        </OperationComposition>
      );
    case "category-draft":
      return (
        <OperationComposition glyph={GLYPHS.filter} layout="overlay">
          <DraftGrid cards={model.cards} />
        </OperationComposition>
      );
    case "transfigured-draft":
      return (
        <OperationComposition
          glyph={GLYPHS.transfigurationSite}
          tone="accent"
          layout="overlay"
        >
          <DraftGrid cards={model.cards} />
        </OperationComposition>
      );
    case "card-bundle":
      return <FullCardStack cards={model.cards} layout="bundle" />;
    case "transfigure-card":
      return (
        <FullCardOperation
          card={model.card}
          glyph={GLYPHS.transfigurationSite}
          tone="accent"
        />
      );
    case "transfigure-starters":
      return (
        <FullCardStackOperation
          cards={model.cards}
          glyph={GLYPHS.transfigurationSite}
          tone="accent"
        />
      );
    case "keyword-modification":
      return (
        <FullCardOperation card={model.card} glyph={GLYPHS.spark} tone="accent" />
      );
    case "tribal-change":
      return (
        <FullCardOperation
          card={model.card}
          glyph={GLYPHS.affiliationRow}
          tone="accent"
        />
      );
    case "purge-card":
      return (
        <FullCardOperation
          card={model.card}
          glyph={GLYPHS.closeFilled}
          tone="danger"
          treatment="purged"
        />
      );
    case "trade-card":
      return (
        <TradeComposition outgoing={model.outgoing} incoming={model.incoming} />
      );
    case "duplicate-card":
      return (
        <FullCardStackOperation
          cards={model.cards}
          glyph={GLYPHS.copy}
          tone="duplicate"
          treatment="duplicate"
        />
      );
    case "dreamsign-gift":
      return <DreamsignArtPiece dreamsign={model.dreamsign} />;
    case "dreamsign-draft":
      return (
        <span
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 66px)",
            placeItems: "center",
            gap: 4,
            pointerEvents: "none",
          }}
        >
          {model.dreamsigns.map((dreamsign) => (
            <span
              key={dreamsign.id}
              style={{
                pointerEvents: "none",
              }}
            >
              <DreamsignArtPiece dreamsign={dreamsign} size="small" />
            </span>
          ))}
        </span>
      );
    case "add-site":
      return (
        <span
          data-offer-tile-site-id={model.site.id}
          style={{
            display: "grid",
            placeItems: "center",
            width: 116,
            height: 116,
            borderRadius: token("--radius-pill"),
            background: token("--surface-chrome-strong"),
            border: `2px solid ${token("--border-strong")}`,
            boxShadow: token("--glow-accent-soft"),
            color: token("--text-on-glass"),
            textShadow: token("--text-outline-media"),
            pointerEvents: "none",
          }}
        >
          <i
            className={model.site.glyph}
            data-offer-tile-site-glyph=""
            style={{ fontSize: 60, lineHeight: 1, pointerEvents: "none" }}
          />
        </span>
      );
  }
}
