import { useRef, useState, type CSSProperties, type ReactElement } from "react";
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
import "./offer-tile.css";

/** The fixed square edge of an OfferTile, in pixels. */
export const OFFER_TILE_SIZE = 150;

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

/** The two or three fixed cards granted together by a bundle offer. */
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
  | (OfferTileBase & { kind: "card-gift" | "power-card"; card: OfferTileCard })
  | (OfferTileBase & {
      kind:
        | "card-draft"
        | "copies-draft"
        | "category-draft"
        | "transfigured-draft";
      cards: OfferTileFourCards;
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
 * A 150×150 symbolic Dream Augury offer button. Its inner card art,
 * dreamsigns, and glyphs are decorative and pointer-transparent; the complete
 * tile is the only hover/focus/press target and reveals one category InfoCard.
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
          body: richText.plain(model.description),
        },
      },
      secondaries: [],
    },
    onActivate: () => onPress(model.id),
  });
  const lastPointerType = useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;

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
        ...glassSurfaceStyle({ radius: token("--radius-panel") }),
        ...binding.sourceProps.style,
        position: "relative",
        width: OFFER_TILE_SIZE,
        height: OFFER_TILE_SIZE,
        minWidth: OFFER_TILE_SIZE,
        minHeight: OFFER_TILE_SIZE,
        padding: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        appearance: "none",
        color: token("--text-on-glass"),
      }}
    >
      <span className="cumulus-offer-tile__depth" aria-hidden="true" />
      <span
        className="cumulus-offer-tile__visual"
        data-offer-tile-visual=""
        aria-hidden="true"
        style={{ pointerEvents: "none" }}
      >
        <OfferVisual model={model} />
      </span>
    </Pressable>
  );
}

type CardTreatment = "plain" | "purged" | "incoming" | "duplicate";

function CardArtPiece({
  card,
  treatment = "plain",
  size = "medium",
}: {
  readonly card: OfferTileCard;
  readonly treatment?: CardTreatment;
  readonly size?: "tiny" | "small" | "medium" | "large";
}): ReactElement {
  const [imageBroken, setImageBroken] = useState(false);
  const hasImage = !imageBroken && hasAssignedImage(card.imageNumber);
  const dimensions =
    size === "tiny"
      ? { width: 36, height: 44 }
      : size === "small"
      ? { width: 48, height: 54 }
      : size === "large"
        ? { width: 84, height: 100 }
        : { width: 60, height: 76 };
  const treatmentStyle: CSSProperties =
    treatment === "purged"
      ? {
          boxShadow: `0 0 0 3px ${token("--danger")}, ${token("--shadow-card")}`,
          filter: "grayscale(0.72) brightness(0.68)",
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
        width: dimensions.width,
        height: dimensions.height,
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
  const edge = size === "small" ? 62 : 98;
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
  position = "corner",
}: {
  readonly glyph: Glyph;
  readonly tone?: "neutral" | "accent" | "danger" | "spark" | "duplicate";
  readonly position?: "corner" | "center";
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
      style={{
        position: "absolute",
        right: position === "corner" ? 7 : "50%",
        bottom: position === "corner" ? 7 : "50%",
        translate: position === "center" ? "50% 50%" : undefined,
        display: "grid",
        placeItems: "center",
        width: 38,
        height: 38,
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
        style={{ fontSize: 20, lineHeight: 1, pointerEvents: "none" }}
      />
    </span>
  );
}

function DraftGrid({ cards }: { readonly cards: readonly OfferTileCard[] }) {
  return (
    <span
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 48px)",
        gap: 6,
        pointerEvents: "none",
      }}
    >
      {cards.map((card) => (
        <CardArtPiece key={card.cardId} card={card} size="small" />
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
        width: 118,
        height: 100,
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
              left: 29 + offset * 18,
              top: 12 + Math.abs(offset) * 4,
              rotate: `${String(offset * 7)}deg`,
              pointerEvents: "none",
            }}
          >
            <CardArtPiece card={card} treatment={treatment} />
          </span>
        );
      })}
    </span>
  );
}

function OfferVisual({ model }: { readonly model: OfferTileModel }): ReactElement {
  switch (model.kind) {
    case "card-gift":
      return (
        <>
          <CardArtPiece card={model.card} size="large" />
          <OperationMark glyph={GLYPHS.gift} tone="spark" />
        </>
      );
    case "power-card":
      return (
        <>
          <CardArtPiece card={model.card} size="large" />
          <OperationMark glyph={GLYPHS.star} tone="spark" />
        </>
      );
    case "card-draft":
      return <DraftGrid cards={model.cards} />;
    case "copies-draft":
      return (
        <>
          <DraftGrid cards={model.cards} />
          <OperationMark glyph={GLYPHS.copy} tone="duplicate" />
        </>
      );
    case "category-draft":
      return (
        <>
          <DraftGrid cards={model.cards} />
          <OperationMark glyph={GLYPHS.filter} />
        </>
      );
    case "transfigured-draft":
      return (
        <>
          <DraftGrid cards={model.cards} />
          <OperationMark glyph={GLYPHS.transfigurationSite} tone="accent" />
        </>
      );
    case "card-bundle":
      return (
        <>
          <CardFan cards={model.cards} />
          <OperationMark glyph={GLYPHS.plus} tone="spark" />
        </>
      );
    case "transfigure-card":
      return (
        <>
          <span style={{ display: "flex", gap: 10, pointerEvents: "none" }}>
            <CardArtPiece card={model.card} />
            <CardArtPiece card={model.card} treatment="incoming" />
          </span>
          <OperationMark glyph={GLYPHS.transfigurationSite} tone="accent" position="center" />
        </>
      );
    case "transfigure-starters":
      return (
        <>
          <CardFan cards={model.cards} />
          <OperationMark glyph={GLYPHS.transfigurationSite} tone="accent" />
        </>
      );
    case "keyword-modification":
      return (
        <>
          <CardArtPiece card={model.card} size="large" />
          <OperationMark glyph={GLYPHS.spark} tone="accent" />
        </>
      );
    case "tribal-change":
      return (
        <>
          <CardArtPiece card={model.card} size="large" />
          <OperationMark glyph={GLYPHS.affiliationRow} tone="accent" />
        </>
      );
    case "purge-card":
      return (
        <>
          <CardArtPiece card={model.card} size="large" treatment="purged" />
          <OperationMark glyph={GLYPHS.closeFilled} tone="danger" />
        </>
      );
    case "trade-card":
      return (
        <>
          <span
            style={{
              display: "grid",
              gridTemplateColumns: "48px 76px",
              alignItems: "center",
              gap: 10,
              pointerEvents: "none",
            }}
          >
            <CardArtPiece card={model.outgoing} treatment="purged" size="small" />
            <span
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 36px)",
                gap: 4,
                pointerEvents: "none",
              }}
            >
              {model.incoming.map((card) => (
                <CardArtPiece
                  key={card.cardId}
                  card={card}
                  treatment="incoming"
                  size="tiny"
                />
              ))}
            </span>
          </span>
          <OperationMark glyph={GLYPHS.caretRight} position="center" />
        </>
      );
    case "duplicate-card":
      return (
        <>
          <CardFan cards={model.cards} treatment="duplicate" />
          <OperationMark glyph={GLYPHS.copy} tone="duplicate" />
        </>
      );
    case "dreamsign-gift":
      return <DreamsignArtPiece dreamsign={model.dreamsign} />;
    case "dreamsign-draft":
      return (
        <span
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 62px)",
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
            width: 104,
            height: 104,
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
            style={{ fontSize: 68, lineHeight: 1, pointerEvents: "none" }}
          />
        </span>
      );
  }
}
