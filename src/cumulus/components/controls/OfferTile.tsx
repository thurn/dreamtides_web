import {
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { cardIdenticonUri, cardImageUrl, hasAssignedImage } from "../../../data/card-database";
import type { CardId } from "../../../types/card-identity";
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
import offerFrameUrl from "../../assets/Skill_Frame_iron.png";
import "./offer-tile.css";

/** The fixed width and height of an OfferTile, in pixels. */
export const OFFER_TILE_SIZE = 200;

/** UUID-backed card art shown symbolically inside an offer. */
export interface OfferTileCard {
  /** Canonical card UUID. Names are display-only and never enter the tile model. */
  cardId: CardId;
  /** Asset-pipeline image key for the card's assigned art. */
  imageNumber: number;
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
  /** Category name used by the tile's accessible button label. */
  label: string;
  /** Succinct action sentence rendered as the hover InfoCard's only copy. */
  description: string;
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
 * surrounds height-preserving square card art, dreamsigns, and glyphs. Every
 * inner object is decorative and pointer-transparent. The complete tile is the
 * only hover/focus/press target and reveals one category InfoCard.
 */
export function OfferTile({
  model,
  onPress,
  testId = "offer-tile",
}: OfferTileProps): ReactElement {
  const description =
    model.kind === "copies-draft"
      ? `Choose a card from ${String(model.cards.length)} and add ${String(model.copyCount)} copies of it to your deck.`
      : model.description;
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
          body: richText.plain(description),
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
      aria-label={model.label}
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

type CardTreatment = "plain" | "purged" | "incoming" | "duplicate";
type CardArtSize = "compact" | "medium" | "large" | "draft";

/**
 * Square chip edges preserve each portrait chip's former height. Growing only
 * the width keeps the source art at the same vertical scale while revealing
 * more of its horizontal extent, matching the battlefield art treatment.
 */
const CARD_ART_EDGE: Readonly<Record<CardArtSize, number>> = {
  compact: 50,
  draft: 68,
  large: 108,
  medium: 82,
};

function CardArtPiece({
  card,
  treatment = "plain",
  size,
}: {
  readonly card: OfferTileCard;
  readonly treatment?: CardTreatment;
  readonly size: CardArtSize;
}): ReactElement {
  const [imageBroken, setImageBroken] = useState(false);
  const hasImage = !imageBroken && hasAssignedImage(card.imageNumber);
  const edge = CARD_ART_EDGE[size];
  const treatmentStyle: CSSProperties =
    treatment === "purged"
      ? {
          boxShadow: `0 0 0 3px ${token("--danger")}, ${token("--shadow-card")}`,
        }
      : treatment === "incoming"
        ? {
            boxShadow: `0 0 0 2px ${token("--spark")}, ${token("--shadow-card")}`,
          }
        : treatment === "duplicate"
          ? {
              boxShadow: `0 0 0 2px ${token("--energy")}, ${token("--shadow-card")}`,
            }
          : { boxShadow: token("--shadow-card") };
  return (
    <span
      data-offer-tile-card-id={card.cardId}
      style={{
        position: "relative",
        display: "block",
        width: edge,
        height: edge,
        overflow: "hidden",
        borderRadius: token("--radius-inset"),
        background: token("--surface-card"),
        border: `1px solid ${token("--border-soft")}`,
        pointerEvents: "none",
        ...treatmentStyle,
      }}
    >
      <img
        src={hasImage ? cardImageUrl(card.imageNumber) : cardIdenticonUri(card.cardId)}
        alt=""
        draggable={false}
        onError={() => setImageBroken(true)}
        style={{
          display: "block",
          width: "100%",
          // Card art sources reserve a narrow watermark strip at the bottom.
          // Oversizing the image inside the clipped art chip keeps that strip
          // out of this deliberately art-only representation.
          height: "108%",
          objectFit: "cover",
          objectPosition: "center top",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </span>
  );
}

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

function OperationMark({
  glyph,
  tone = "neutral",
  layout,
}: {
  readonly glyph: Glyph;
  readonly tone?: "neutral" | "accent" | "danger" | "spark" | "duplicate";
  readonly layout: "diagonal" | "overlay";
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
        right: layout === "diagonal" ? 0 : undefined,
        bottom: layout === "diagonal" ? 0 : undefined,
        translate: layout === "overlay" ? "-50% -50%" : undefined,
        zIndex: 2,
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        width: layout === "overlay" ? 48 : 82,
        height: layout === "overlay" ? 48 : 82,
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
          fontSize: layout === "overlay" ? 26 : 42,
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

function DraftGrid({ cards }: { readonly cards: readonly OfferTileCard[] }) {
  return (
    <span
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(2, ${String(CARD_ART_EDGE.draft)}px)`,
        gap: token("--space-2"),
        pointerEvents: "none",
      }}
    >
      {cards.map((card) => (
        <CardArtPiece key={card.cardId} card={card} size="draft" />
      ))}
    </span>
  );
}

function CardFan({
  cards,
  treatment = "plain",
}: {
  readonly cards: readonly OfferTileCard[];
  readonly treatment?: CardTreatment;
}) {
  const visible = cards;
  return (
    <span
      style={{
        position: "relative",
        display: "block",
        width: 122,
        height: 104,
        pointerEvents: "none",
      }}
    >
      {visible.map((card, index) => {
        const center = (visible.length - 1) / 2;
        const offset = index - center;
        return (
          <span
            key={card.cardId}
            style={{
              position: "absolute",
              left: 20 + offset * 14,
              top: 10 + Math.abs(offset) * 4,
              rotate: `${String(offset * 7)}deg`,
              pointerEvents: "none",
            }}
          >
            <CardArtPiece card={card} treatment={treatment} size="medium" />
          </span>
        );
      })}
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
        gridTemplateColumns: `repeat(2, ${String(CARD_ART_EDGE.compact)}px)`,
        gap: token("--space-2"),
        pointerEvents: "none",
      }}
    >
      {incoming.map((card) => (
        <CardArtPiece
          key={card.cardId}
          card={card}
          treatment="incoming"
          size="compact"
        />
      ))}
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          zIndex: 1,
          translate: "-50% -50%",
          pointerEvents: "none",
        }}
      >
        <CardArtPiece card={outgoing} treatment="purged" size="compact" />
      </span>
    </span>
  );
}

function OfferVisual({ model }: { readonly model: OfferTileModel }): ReactElement {
  switch (model.kind) {
    case "card-gift":
      return <CardArtPiece card={model.card} size="large" />;
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
      return <CardFan cards={model.cards} />;
    case "transfigure-card":
      return (
        <OperationComposition
          glyph={GLYPHS.transfigurationSite}
          tone="accent"
          layout="diagonal"
        >
          <CardArtPiece card={model.card} size="large" treatment="incoming" />
        </OperationComposition>
      );
    case "transfigure-starters":
      return (
        <OperationComposition
          glyph={GLYPHS.transfigurationSite}
          tone="accent"
          layout="diagonal"
        >
          <CardFan cards={model.cards} />
        </OperationComposition>
      );
    case "keyword-modification":
      return (
        <OperationComposition glyph={GLYPHS.spark} tone="accent" layout="diagonal">
          <CardArtPiece card={model.card} size="large" />
        </OperationComposition>
      );
    case "tribal-change":
      return (
        <OperationComposition
          glyph={GLYPHS.affiliationRow}
          tone="accent"
          layout="diagonal"
        >
          <CardArtPiece card={model.card} size="large" />
        </OperationComposition>
      );
    case "purge-card":
      return (
        <OperationComposition
          glyph={GLYPHS.closeFilled}
          tone="danger"
          layout="diagonal"
        >
          <CardArtPiece card={model.card} size="large" treatment="purged" />
        </OperationComposition>
      );
    case "trade-card":
      return (
        <TradeComposition outgoing={model.outgoing} incoming={model.incoming} />
      );
    case "duplicate-card":
      return (
        <OperationComposition glyph={GLYPHS.copy} tone="duplicate" layout="diagonal">
          <CardFan cards={model.cards} treatment="duplicate" />
        </OperationComposition>
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
