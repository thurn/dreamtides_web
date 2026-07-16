import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  cardIdenticonUri,
  cardImageUrl,
  hasAssignedImage,
} from "../../../data/card-database";
import {
  OFFER_TILE_BACKGROUND_IMAGE_NUMBERS,
  type OfferTileBackgroundKind,
} from "../../../data/offer-tile-art";
import { identiconsForced } from "../../../runtime/identicon-mode";
import type { CardId } from "../../../types/card-identity";
import type { FrozenCardData } from "../../../types/cards";
import type { TransfigurationType } from "../../../types/quest";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import type { ArtRef } from "../../primitives/art";
import { resolveArtRef } from "../../primitives/art";
import type { Glyph } from "../../primitives/glyph";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  DEFAULT_ART_CROP,
  resolveCardArtImageStyle,
} from "../card/card-art-crop";
import {
  offerTileDescription,
  offerTileRichDescription,
} from "./offer-tile-descriptions";
import offerFrameUrl from "../../assets/dreamsign_card_frame_2.png";
import offerBlackFillUrl from "../../assets/offer_tile_black_fill.png";
import "./offer-tile.css";

/** Named OfferTile edge lengths, in pixels. */
export const OFFER_TILE_STANDARD_SIZE = 300;
export const OFFER_TILE_COMPACT_SIZE = 240;
/** Backward-compatible standard OfferTile edge length. */
export const OFFER_TILE_SIZE = OFFER_TILE_STANDARD_SIZE;
export type OfferTileSize = "standard" | "compact";
export const OFFER_TILE_DIMENSIONS: Readonly<Record<OfferTileSize, number>> = {
  standard: OFFER_TILE_STANDARD_SIZE,
  compact: OFFER_TILE_COMPACT_SIZE,
};

/** UUID-backed card whose original art is shown inside an offer. */
export interface OfferTileCard {
  /** Canonical card UUID. Names are display-only and never enter the tile model. */
  cardId: CardId;
  /** UUID-matched display data carrying the art asset and authored focal crop. */
  displaySnapshot: FrozenCardData;
}

/** UUID-backed dreamsign art shown symbolically inside an offer. */
export interface OfferTileDreamsign {
  /** Canonical dreamsign UUID. */
  id: string;
  /** Resolved display name retained with the surfaced object model. */
  name: string;
  /** Dreamsign artwork as a named Cumulus art reference. */
  art: ArtRef;
}

/** A site symbol shown by the add-site offer. */
export interface OfferTileSite {
  /** Stable site type or fixture id. */
  id: string;
  /** Resolved display name retained with the surfaced object model. */
  name: string;
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
  readonly [OfferTileCard] | readonly [OfferTileCard, OfferTileCard];

/** The one to three surfaced deck-card choices in a duplicate offer. */
export type OfferTileDuplicateCards =
  | readonly [OfferTileCard]
  | readonly [OfferTileCard, OfferTileCard]
  | readonly [OfferTileCard, OfferTileCard, OfferTileCard];

/** Character subtypes that a Dream Augury offer can apply to a card. */
export type OfferTileCharacterSubtype =
  "Warrior" | "Spirit Animal" | "Survivor" | "Outsider";

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
      kind: "card-draft" | "transfigured-draft";
      cards: OfferTileFourCards;
    })
  | (OfferTileBase & {
      kind: "category-draft";
      cards: OfferTileFourCards;
      /** Player-facing category noun, such as `warrior` or `Event`. */
      categoryName: string;
    })
  | (OfferTileBase & {
      kind: "copies-draft";
      cards: OfferTileFourCards;
      /** Exact number of copies granted for the selected card. */
      copyCount: number;
    })
  | (OfferTileBase & { kind: "card-bundle"; cards: OfferTileBundleCards })
  | (OfferTileBase & {
      kind: "transfigure-card";
      card: OfferTileCard;
      /** Exact transfiguration applied to the preselected card. */
      transfiguration: TransfigurationType;
    })
  | (OfferTileBase & {
      kind: "keyword-modification";
      card: OfferTileCard;
      /** Exact amount removed from the card's Reclaim cost. */
      reclaimReduction: number;
    })
  | (OfferTileBase & {
      kind: "tribal-change";
      card: OfferTileCard;
      /** Character subtype applied to the card by this offer. */
      newCharacterSubtype: OfferTileCharacterSubtype;
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
  /** Complete tile composition size. Defaults to the 300px standard tile. */
  size?: OfferTileSize;
  /** Optional test selector; defaults to `offer-tile`. */
  testId?: string;
}

/**
 * A 300×300 framed symbolic Dream Augury offer button. Its circular gold frame
 * surrounds full-bleed card art, dreamsigns, and glyphs. Every inner
 * object is decorative and pointer-transparent. The complete tile is the only
 * hover/focus/press target and reveals one category InfoCard.
 */
export function OfferTile({
  model,
  onPress,
  size = "standard",
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
          body: offerTileRichDescription(model),
        },
      },
      secondaries: [],
    },
    onActivate: () => onPress(model.id),
  });
  const lastPointerType = useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;
  const motionDelay = offerTileMotionDelay(model.id);
  const edge = OFFER_TILE_DIMENSIONS[size];
  const scale = edge / OFFER_TILE_STANDARD_SIZE;

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      aria-label={offerTileDescription(model)}
      data-testid={testId}
      data-offer-tile=""
      data-offer-tile-kind={model.kind}
      data-offer-tile-size={size}
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
        width: edge,
        height: edge,
        minWidth: edge,
        minHeight: edge,
        padding: 0,
        boxSizing: "border-box",
        overflow: "visible",
        appearance: "none",
        border: 0,
        borderRadius: token("--radius-pill"),
        background: "transparent",
        color: token("--text-on-glass"),
        textAlign: "left",
      }}
    >
      <span
        className="cumulus-offer-tile__floating-frame"
        data-offer-tile-floating-frame=""
        aria-hidden="true"
        style={{
          width: OFFER_TILE_STANDARD_SIZE,
          height: OFFER_TILE_STANDARD_SIZE,
          right: "auto",
          bottom: "auto",
          scale,
          transformOrigin: "top left",
          animationDelay: motionDelay,
          pointerEvents: "none",
        }}
      >
        <img
          className="cumulus-offer-tile__depth"
          data-offer-tile-background=""
          src={offerBlackFillUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <span
          className="cumulus-offer-tile__visual"
          data-offer-tile-visual=""
          style={{
            WebkitMaskImage: `url("${offerBlackFillUrl}")`,
            maskImage: `url("${offerBlackFillUrl}")`,
            pointerEvents: "none",
          }}
        >
          <span className="cumulus-offer-tile__visual-content">
            <OfferVisual model={model} />
          </span>
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

const OFFER_ART_STAGE_SIZE = 208;
const OFFER_ART_OVERLAY_SIZE = 84;

type DreamsignDraftCount = OfferTileDreamsignChoices["length"];

const DREAMSIGN_DRAFT_LAYOUTS: Readonly<
  Record<
    DreamsignDraftCount,
    { readonly spread: number; readonly scale: number }
  >
> = {
  2: { spread: 20, scale: 35 },
  3: { spread: 25, scale: 35 },
  4: { spread: 18, scale: 30 },
};

function offerStagePercentage(percentage: number): number {
  return Math.round(OFFER_ART_STAGE_SIZE * percentage) / 100;
}

interface DreamsignPosition {
  readonly left: number;
  readonly top: number;
}

function dreamsignDraftPositions(
  count: DreamsignDraftCount,
  spread: number,
  scale: number,
): readonly DreamsignPosition[] {
  const halfScale = scale / 2;
  const center = 50 - halfScale;
  const low = 50 - spread - halfScale;
  const high = 50 + spread - halfScale;

  if (count === 2) {
    return [
      { left: low, top: center },
      { left: high, top: center },
    ];
  }
  if (count === 3) {
    const triangleSpread = Math.max(spread, scale * 0.72);
    const horizontalOffset = triangleSpread * (Math.sqrt(3) / 2);
    return [
      { left: center, top: 50 - triangleSpread - halfScale },
      {
        left: 50 - horizontalOffset - halfScale,
        top: 50 + triangleSpread / 2 - halfScale,
      },
      {
        left: 50 + horizontalOffset - halfScale,
        top: 50 + triangleSpread / 2 - halfScale,
      },
    ];
  }
  return [
    { left: low, top: low },
    { left: high, top: low },
    { left: low, top: high },
    { left: high, top: high },
  ];
}

function DreamsignArtPiece({
  dreamsign,
  edge,
  position,
}: {
  readonly dreamsign: OfferTileDreamsign;
  readonly edge: number;
  readonly position?: DreamsignPosition;
}): ReactElement {
  const [imageBroken, setImageBroken] = useState(false);
  return (
    <span
      data-offer-tile-dreamsign-id={dreamsign.id}
      style={{
        position: position === undefined ? "relative" : "absolute",
        left: position === undefined ? undefined : `${String(position.left)}%`,
        top: position === undefined ? undefined : `${String(position.top)}%`,
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

function OfferFullArtBackground({
  kind,
}: {
  readonly kind: OfferTileBackgroundKind;
}): ReactElement {
  const imageNumber = OFFER_TILE_BACKGROUND_IMAGE_NUMBERS[kind];
  return (
    <span
      data-offer-tile-full-art-background={kind}
      data-offer-tile-full-art-background-image={imageNumber}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <img
        src={cardImageUrl(imageNumber)}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          position: "absolute",
          left: "-10%",
          top: "-10%",
          display: "block",
          width: "120%",
          maxWidth: "none",
          height: "120%",
          objectFit: "cover",
          objectPosition: "50% 42%",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </span>
  );
}

function DreamsignGiftComposition({
  dreamsign,
}: {
  readonly dreamsign: OfferTileDreamsign;
}): ReactElement {
  return (
    <span
      data-offer-tile-dreamsign-layout="single"
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: OFFER_ART_STAGE_SIZE,
        height: OFFER_ART_STAGE_SIZE,
        pointerEvents: "none",
      }}
    >
      <OfferFullArtBackground kind="dreamsign-gift" />
      <DreamsignArtPiece
        dreamsign={dreamsign}
        edge={offerStagePercentage(54)}
      />
    </span>
  );
}

function DreamsignDraftComposition({
  dreamsigns,
}: {
  readonly dreamsigns: OfferTileDreamsignChoices;
}): ReactElement {
  const count = dreamsigns.length;
  const layout = DREAMSIGN_DRAFT_LAYOUTS[count];
  const positions = dreamsignDraftPositions(count, layout.spread, layout.scale);
  const edge = offerStagePercentage(layout.scale);
  return (
    <span
      data-offer-tile-dreamsign-layout={`draft-${String(count)}`}
      data-offer-tile-dreamsign-spread={layout.spread}
      data-offer-tile-dreamsign-scale={layout.scale}
      style={{
        position: "relative",
        display: "block",
        width: OFFER_ART_STAGE_SIZE,
        height: OFFER_ART_STAGE_SIZE,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <OfferFullArtBackground kind="dreamsign-draft" />
      {dreamsigns.map((dreamsign, index) => (
        <DreamsignArtPiece
          key={dreamsign.id}
          dreamsign={dreamsign}
          edge={edge}
          position={positions[index]}
        />
      ))}
    </span>
  );
}

function AddSiteComposition({
  site,
}: {
  readonly site: OfferTileSite;
}): ReactElement {
  return (
    <span
      data-offer-tile-site-layout="single"
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: OFFER_ART_STAGE_SIZE,
        height: OFFER_ART_STAGE_SIZE,
        pointerEvents: "none",
      }}
    >
      <OfferFullArtBackground kind="add-site" />
      <span
        data-offer-tile-site-id={site.id}
        style={{
          position: "relative",
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
          className={site.glyph}
          data-offer-tile-site-glyph=""
          style={{ fontSize: 60, lineHeight: 1, pointerEvents: "none" }}
        />
      </span>
    </span>
  );
}

function CardArtPiece({
  card,
  treatment = "plain",
  overlay = false,
  frameAspect = 1,
}: {
  readonly card: OfferTileCard;
  readonly treatment?: "plain" | "purged";
  readonly overlay?: boolean;
  readonly frameAspect?: number;
}): ReactElement {
  const [imageBroken, setImageBroken] = useState(false);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const cardData = card.displaySnapshot;
  const useCardImage =
    !identiconsForced() &&
    hasAssignedImage(cardData.imageNumber) &&
    !imageBroken;
  const imageSource = useCardImage
    ? cardImageUrl(cardData.imageNumber)
    : cardIdenticonUri(card.cardId);
  const artCrop = cardData.art ?? DEFAULT_ART_CROP;

  useEffect(() => {
    setImageBroken(false);
    setImageAspect(null);
  }, [card.cardId, cardData.imageNumber]);

  return (
    <span
      data-offer-tile-card-art={card.cardId}
      data-offer-tile-card-art-treatment={treatment}
      style={{
        position: "relative",
        display: "block",
        overflow: "hidden",
        width: overlay ? OFFER_ART_OVERLAY_SIZE : "100%",
        height: overlay ? OFFER_ART_OVERLAY_SIZE : "100%",
        borderRadius: overlay ? token("--radius-panel") : 0,
        background: token("--surface-chrome-strong"),
        boxShadow:
          treatment === "purged"
            ? `0 0 0 3px ${token("--danger")}, ${token("--shadow-md")}`
            : overlay
              ? token("--shadow-md")
              : undefined,
        pointerEvents: "none",
      }}
    >
      <img
        src={imageSource}
        alt=""
        draggable={false}
        onLoad={
          useCardImage
            ? (event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) {
                  setImageAspect(naturalWidth / naturalHeight);
                }
              }
            : undefined
        }
        onError={useCardImage ? () => setImageBroken(true) : undefined}
        style={{
          ...(useCardImage
            ? resolveCardArtImageStyle(artCrop, imageAspect, 1, frameAspect, 1)
            : {
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "50% 50%",
              }),
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </span>
  );
}

function CardArtMosaic({
  cards,
}: {
  readonly cards: readonly OfferTileCard[];
}): ReactElement {
  const layout =
    cards.length === 1
      ? "single"
      : cards.length === 2
        ? "split-2"
        : cards.length === 3
          ? "split-3"
          : "grid-4";
  const columns = cards.length === 4 ? 2 : cards.length;
  const rows = cards.length === 4 ? 2 : 1;

  return (
    <span
      data-offer-tile-card-art-layout={layout}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${String(rows)}, minmax(0, 1fr))`,
        width: OFFER_ART_STAGE_SIZE,
        height: OFFER_ART_STAGE_SIZE,
        gap: cards.length > 1 ? token("--space-1") : 0,
        pointerEvents: "none",
      }}
    >
      {cards.map((card) => (
        <span
          key={card.cardId}
          data-offer-tile-card-art-panel=""
          style={{
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <CardArtPiece card={card} frameAspect={rows / columns} />
        </span>
      ))}
    </span>
  );
}

function OperationMark({
  glyph,
  tone = "neutral",
}: {
  readonly glyph: Glyph;
  readonly tone?: "neutral" | "accent" | "danger" | "spark" | "duplicate";
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
      data-offer-tile-operation-layout="overlay"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 16,
        translate: "-50% 0",
        zIndex: 2,
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        width: 58,
        height: 58,
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
          fontSize: 32,
          lineHeight: 1,
          pointerEvents: "none",
        }}
      />
    </span>
  );
}

function CardArtOperation({
  cards,
  glyph,
  tone,
}: {
  readonly cards: readonly OfferTileCard[];
  readonly glyph: Glyph;
  readonly tone?: "neutral" | "accent" | "danger" | "spark" | "duplicate";
}): ReactElement {
  return (
    <span
      data-offer-tile-composition="overlay"
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: OFFER_ART_STAGE_SIZE,
        height: OFFER_ART_STAGE_SIZE,
        pointerEvents: "none",
      }}
    >
      <CardArtMosaic cards={cards} />
      <OperationMark glyph={glyph} tone={tone} />
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
        width: OFFER_ART_STAGE_SIZE,
        height: OFFER_ART_STAGE_SIZE,
        pointerEvents: "none",
      }}
    >
      <CardArtMosaic cards={incoming} />
      <span
        data-offer-tile-fifth-card=""
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          zIndex: 2,
          translate: "-50% -50%",
          pointerEvents: "none",
        }}
      >
        <CardArtPiece card={outgoing} treatment="purged" overlay />
      </span>
    </span>
  );
}

function OfferVisual({
  model,
}: {
  readonly model: OfferTileModel;
}): ReactElement {
  switch (model.kind) {
    case "card-gift":
      return <CardArtMosaic cards={[model.card]} />;
    case "card-draft":
      return <CardArtMosaic cards={model.cards} />;
    case "copies-draft":
      return (
        <CardArtOperation
          cards={model.cards}
          glyph={GLYPHS.copy}
          tone="duplicate"
        />
      );
    case "category-draft":
      return <CardArtOperation cards={model.cards} glyph={GLYPHS.filter} />;
    case "transfigured-draft":
      return (
        <CardArtOperation
          cards={model.cards}
          glyph={GLYPHS.transfigurationSite}
          tone="accent"
        />
      );
    case "card-bundle":
      return <CardArtMosaic cards={model.cards} />;
    case "transfigure-card":
      return (
        <CardArtOperation
          cards={[model.card]}
          glyph={GLYPHS.transfigurationSite}
          tone="accent"
        />
      );
    case "transfigure-starters":
      return (
        <CardArtOperation
          cards={model.cards}
          glyph={GLYPHS.transfigurationSite}
          tone="accent"
        />
      );
    case "keyword-modification":
      return (
        <CardArtOperation
          cards={[model.card]}
          glyph={GLYPHS.pencilSquare}
          tone="accent"
        />
      );
    case "tribal-change":
      return (
        <CardArtOperation
          cards={[model.card]}
          glyph={GLYPHS.refreshCcw}
          tone="accent"
        />
      );
    case "purge-card":
      return (
        <CardArtOperation
          cards={[model.card]}
          glyph={GLYPHS.closeFilled}
          tone="danger"
        />
      );
    case "trade-card":
      return (
        <TradeComposition outgoing={model.outgoing} incoming={model.incoming} />
      );
    case "duplicate-card":
      return (
        <CardArtOperation
          cards={model.cards}
          glyph={GLYPHS.copy}
          tone="duplicate"
        />
      );
    case "dreamsign-gift":
      return <DreamsignGiftComposition dreamsign={model.dreamsign} />;
    case "dreamsign-draft":
      return <DreamsignDraftComposition dreamsigns={model.dreamsigns} />;
    case "add-site":
      return <AddSiteComposition site={model.site} />;
  }
}
