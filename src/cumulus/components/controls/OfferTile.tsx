import { useEffect, useRef, useState, type ReactElement } from "react";
import type { LocalizedString } from "@trox/runtime";
import {
  cardIdenticonUri,
  cardImageUrl,
  hasAssignedImage,
} from "../../../data/card-database";
import { identiconsForced } from "../../../runtime/identicon-mode";
import type { DomTestId } from "../../types/dom";
import type { CardData } from "../../../types/cards";
import type { AuguryPresentationText } from "../../../types/augury-data";
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
import type { DreamsignId, OfferTileId } from "../../../types/identifiers";
import type { SiteType } from "../../../types/journey";

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

/** UUID-backed dreamsign art shown symbolically inside an offer. */
export interface OfferTileDreamsign {
  /** Canonical dreamsign UUID. */
  id: DreamsignId;
  /** Resolved display name retained with the surfaced object model. */
  name: LocalizedString;
  /** Dreamsign artwork as a named Cumulus art reference. */
  art: ArtRef;
}

/** A site symbol shown by the add-site offer. */
export interface OfferTileSite {
  /** Stable site type or fixture id. */
  id: SiteType;
  /** Resolved display name retained with the surfaced object model. */
  name: LocalizedString;
  /** The site's named design-system glyph. */
  glyph: Glyph;
}

/** A fixed four-card fixture, retained for debug compositions. */
export type OfferTileFourCards = readonly [
  Readonly<CardData>,
  Readonly<CardData>,
  Readonly<CardData>,
  Readonly<CardData>,
];

/** The two to four surfaced card choices carried by a card-draft offer. */
export type OfferTileCardChoices =
  | readonly [Readonly<CardData>, Readonly<CardData>]
  | readonly [Readonly<CardData>, Readonly<CardData>, Readonly<CardData>]
  | OfferTileFourCards;

/** The fixed cards granted together by a bundle offer. */
export type OfferTileBundleCards =
  | readonly [Readonly<CardData>, Readonly<CardData>]
  | readonly [Readonly<CardData>, Readonly<CardData>, Readonly<CardData>];

/** The one or two starter cards preselected for transfiguration. */
export type OfferTileStarterCards =
  | readonly [Readonly<CardData>]
  | readonly [Readonly<CardData>, Readonly<CardData>];

/** The one to three surfaced deck-card choices in a duplicate offer. */
export type OfferTileDuplicateCards =
  | readonly [Readonly<CardData>]
  | readonly [Readonly<CardData>, Readonly<CardData>]
  | readonly [Readonly<CardData>, Readonly<CardData>, Readonly<CardData>];

interface OfferTileBase {
  /**
   * Stable identity for this visible offer. Production callers should combine
   * the encounter signature and offer id so simultaneous offers never collide.
   */
  id: OfferTileId;
}

export type OfferTileCategory =
  | {
      /** Stable category whose complete player-facing phrase is localized. */
      kind: "character" | "event" | "cheap" | "mid-cost" | "expensive" | "fast";
    }
  | {
      /** Category whose canonical subtype or package name is data-defined. */
      kind: "subtype" | "package";
      /** Canonical display name inserted into the category-specific phrase. */
      name: LocalizedString;
    };

/**
 * Strict symbolic compositions for every Augury offer category. The
 * component owns the composition; callers provide only UUID-backed subjects.
 */
export type OfferTileModel =
  | (OfferTileBase & { kind: "card-gift"; card: Readonly<CardData> })
  | (OfferTileBase & {
      kind: "card-draft" | "transfigured-draft";
      cards: OfferTileCardChoices;
    })
  | (OfferTileBase & {
      kind: "category-draft";
      cards: OfferTileCardChoices;
      /** Semantic category used to select a complete localized phrase. */
      category: OfferTileCategory;
    })
  | (OfferTileBase & {
      kind: "copies-draft";
      cards: OfferTileCardChoices;
      /** Exact number of copies granted for the selected card. */
      copyCount: number;
    })
  | (OfferTileBase & { kind: "card-bundle"; cards: OfferTileBundleCards })
  | (OfferTileBase & {
      kind: "transfigure-card";
      card: Readonly<CardData>;
    })
  | (OfferTileBase & {
      kind: "transfigure-starters";
      cards: OfferTileStarterCards;
    })
  | (OfferTileBase & { kind: "purge-card"; card: Readonly<CardData> })
  | (OfferTileBase & {
      kind: "duplicate-card";
      cards: OfferTileDuplicateCards;
    })
  | (OfferTileBase & {
      kind: "dreamsign-gift";
      dreamsign: OfferTileDreamsign;
    })
  | (OfferTileBase & { kind: "add-site"; site: OfferTileSite });

export interface OfferTileProps {
  /** The offer's strict symbolic view model. */
  model: OfferTileModel;
  /** Archetype-authored copy for the surfaced reward. */
  presentation: OfferTilePresentation;
  /** Activates the offer, reporting the stable `model.id`. */
  onPress: (offerId: OfferTileId) => void;
  /** Complete tile composition size. Defaults to the 300px standard tile. */
  size?: OfferTileSize;
  /** Optional test selector; defaults to `offer-tile`. */
  testId?: DomTestId;
}

/** Authored Augury copy and optional art consumed by the tile itself. */
export interface OfferTilePresentation {
  readonly subtitle: AuguryPresentationText;
  readonly backgroundArt?: Readonly<{ imageNumber: number }>;
}

/**
 * A 300×300 framed symbolic Augury offer button. Its circular gold frame
 * surrounds full-bleed card art, dreamsigns, and glyphs. Every inner
 * object is decorative and pointer-transparent. The complete tile is the only
 * hover/focus/press target and reveals one category InfoCard. Augury is
 * the single one-off exception to normal Cumulus desktop InfoCard placement:
 * this card centers above its respective offer instead of sitting beside it.
 * That placement is specific to comparing the two Augury visions and is
 * not a reusable pattern for any other reveal source.
 */
export function OfferTile({
  model,
  presentation,
  onPress,
  size = "standard",
  testId = "offer-tile",
}: OfferTileProps): ReactElement {
  const description = offerTileDescription(model, presentation);
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
          body: offerTileRichDescription(model, presentation),
        },
      },
      secondaries: [],
    },
    // One-off Augury exception: ordinary Cumulus InfoCards use the
    // coordinator's normal beside-source desktop placement.
    placementException: "augury-offer-above-source",
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
      ariaLabelMessage={description}
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
            <OfferVisual model={model} presentation={presentation} />
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
function offerTileMotionDelay(offerId: OfferTileId): string {
  let hash = 0;
  for (const character of offerId) {
    hash = (hash * 31 + character.charCodeAt(0)) % 5800;
  }
  return `${String(-hash / 1000)}s`;
}

const OFFER_ART_STAGE_SIZE = 208;
const OFFER_ART_OVERLAY_SIZE = 84;

function offerStagePercentage(percentage: number): number {
  return Math.round(OFFER_ART_STAGE_SIZE * percentage) / 100;
}

interface DreamsignPosition {
  readonly left: number;
  readonly top: number;
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
  backgroundArt,
}: {
  readonly kind: "dreamsign-gift" | "add-site";
  readonly backgroundArt: NonNullable<OfferTilePresentation["backgroundArt"]>;
}): ReactElement {
  const imageNumber = backgroundArt.imageNumber;
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
  backgroundArt,
}: {
  readonly dreamsign: OfferTileDreamsign;
  readonly backgroundArt: NonNullable<OfferTilePresentation["backgroundArt"]>;
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
      <OfferFullArtBackground
        kind="dreamsign-gift"
        backgroundArt={backgroundArt}
      />
      <DreamsignArtPiece
        dreamsign={dreamsign}
        edge={offerStagePercentage(54)}
      />
    </span>
  );
}

function AddSiteComposition({
  site,
  backgroundArt,
}: {
  readonly site: OfferTileSite;
  readonly backgroundArt: NonNullable<OfferTilePresentation["backgroundArt"]>;
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
      <OfferFullArtBackground kind="add-site" backgroundArt={backgroundArt} />
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
  readonly card: Readonly<CardData>;
  readonly treatment?: "plain" | "purged";
  readonly overlay?: boolean;
  readonly frameAspect?: number;
}): ReactElement {
  const [imageBroken, setImageBroken] = useState(false);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const useCardImage =
    !identiconsForced() && hasAssignedImage(card.imageNumber) && !imageBroken;
  const imageSource = useCardImage
    ? cardImageUrl(card.imageNumber)
    : cardIdenticonUri(card.id);
  const artCrop = card.art ?? DEFAULT_ART_CROP;

  useEffect(() => {
    setImageBroken(false);
    setImageAspect(null);
  }, [card.id, card.imageNumber]);

  return (
    <span
      data-offer-tile-card-art={card.id}
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
  readonly cards: readonly Readonly<CardData>[];
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
        gap: cards.length > 1 ? token("--space-xxs") : 0,
        pointerEvents: "none",
      }}
    >
      {cards.map((card) => (
        <span
          key={card.id}
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
            ? token("--text-on-glass-muted")
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
  readonly cards: readonly Readonly<CardData>[];
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

function OfferVisual({
  model,
  presentation,
}: {
  readonly model: OfferTileModel;
  readonly presentation: OfferTilePresentation;
}): ReactElement {
  const requireBackgroundArt = (): NonNullable<
    OfferTilePresentation["backgroundArt"]
  > => {
    if (presentation.backgroundArt === undefined) {
      throw new Error(
        `Augury ${model.kind} presentation is missing background art`,
      );
    }
    return presentation.backgroundArt;
  };
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
    case "purge-card":
      return (
        <CardArtOperation
          cards={[model.card]}
          glyph={GLYPHS.closeFilled}
          tone="danger"
        />
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
      return (
        <DreamsignGiftComposition
          dreamsign={model.dreamsign}
          backgroundArt={requireBackgroundArt()}
        />
      );
    case "add-site":
      return (
        <AddSiteComposition
          site={model.site}
          backgroundArt={requireBackgroundArt()}
        />
      );
  }
}
