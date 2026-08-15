import {
  useRef,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import { useRevealSource } from "../../internal/reveal/context";
import type { DomTestId } from "../../types/dom";
import { revealEntityId } from "../../internal/reveal/identity";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { StandaloneGlyph } from "../controls/StandaloneGlyph";
import { EssenceValue } from "../hud/EssenceValue";
import {
  CardView,
  GameCard,
  type GameCardModel,
  type GameCardSelection,
} from "./CardView";
import { GalleryActionCard } from "./GalleryActionCard";
import { CARD_CORNER_RADIUS } from "./card-aspect";
import {
  one,
  other,
  plural,
  tx,
  txa,
  type LocalizedString,
} from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import type { DeckEntryId } from "../../../types/identifiers";

/** A small line rendered directly below a card-choice tile. */
export type CardChoiceGridCaption =
  | { kind: "essence"; amount: number }
  | { kind: "text"; message: LocalizedString };

/** The pending operation identified on a selected card-choice tile. */
export type CardChoiceOperation = "purge" | "copy" | "transfigure" | "change";

const OPERATION_PRESENTATION = {
  purge: {
    message: tx(
      "This card will be purged",
      "[accessibility] Status on a selected card marked for a pending purge operation.",
    ),
    glyph: GLYPHS.trash,
    tone: "danger",
  },
  copy: {
    message: tx(
      "This card will be copied",
      "[accessibility] Status on a selected card marked for a pending copy operation.",
    ),
    glyph: GLYPHS.copy,
    tone: "selected",
  },
  transfigure: {
    message: tx(
      "This card will be transfigured",
      "[accessibility] [transfiguration] Status on a selected card marked for a pending Transfiguration operation.",
    ),
    glyph: GLYPHS.transfigurationSite,
    tone: "selected",
  },
  change: {
    message: tx(
      "This card will be changed",
      "[accessibility] Status on a selected card marked for another pending card-change operation.",
    ),
    glyph: GLYPHS.refreshCcw,
    tone: "selected",
  },
} as const satisfies Record<
  CardChoiceOperation,
  {
    readonly message: LocalizedString;
    readonly glyph: Glyph;
    readonly tone: "danger" | "selected";
  }
>;

/** One resolved card presented by a {@link CardChoiceGrid}. */
export interface CardChoiceGridCardView<EntryId extends string = DeckEntryId> {
  /** Stable card or deck-entry id. */
  entryId: EntryId;
  /** Canonical semantic model rendered by GameCard. */
  model: GameCardModel;
  /** Optional test id on the GameCard. */
  testId?: DomTestId;
  /** Semantic reason to draw the card's selection ring. */
  selection?: GameCardSelection;
  /** Detach activation and physical gestures, then dim the tile. */
  disabled?: boolean;
  /** Optional danger outline for purge targets. */
  emphasis?: "danger";
  /** Small uncontained line rendered below the card. */
  caption?: CardChoiceGridCaption;
  /** Preserve the card's grid footprint while hiding its content. */
  reserved?: boolean;
  /** Allow the caller to drag this physical card entry while it is enabled. */
  draggable?: boolean;
  /**
   * Optional offset-copy capability. The gallery reserves the fan footprint
   * whenever this model is present, while `shown` controls whether the copy is
   * currently visible.
   */
  stackedCopy?: {
    /** Show the noninteractive offset copy beneath the primary card. */
    shown: boolean;
    /** Horizontal fan direction for the offset copy. */
    direction: "left" | "right";
  };
  /** Optional selected-card quantity shown over the lower corner. */
  quantityBadge?: {
    /** Positive number of copies represented by the badge. */
    count: number;
  };
  /** Pending operation shown as a semantic icon over the lower-right corner. */
  operation?: CardChoiceOperation;
}

/** A card-sized action appended after the cards. */
export interface CardChoiceGridActionView<
  EntryId extends string = DeckEntryId,
> {
  /** Stable action id reported through the action callback. */
  entryId: EntryId;
  /** Large glyph that carries the action's visual identity. */
  glyph: Glyph;
  /** Accessible action label. */
  label: LocalizedString;
  /** Small uncontained line rendered below the glyph. */
  caption: CardChoiceGridCaption;
  /** Detach interaction and visually recede the action. */
  disabled?: boolean;
  /** Optional stable test id on the action button. */
  testId?: DomTestId;
}

/** Named column count for a frameless card-choice grid. */
export type CardChoiceGridColumns = "one" | "two" | "three" | "four" | "five";

/** Named fit preset for a site card-choice grid. */
export type CardChoiceGridSiteFit =
  "choice" | "compact-choice" | "mixed-reward";

/** Layout contract for a {@link CardChoiceGrid}. */
export type CardChoiceGridLayout =
  | {
      kind: "site";
      viewport: "mobile" | "desktop";
      fit: CardChoiceGridSiteFit;
    }
  | {
      kind: "gallery";
      /** Card width computed by the card-panel container fitter. */
      cardWidth: string;
      /** Column gap computed from the gallery spacing preset. */
      columnGap: string;
      /** Row gap computed from the gallery spacing preset. */
      rowGap: string;
    };

export interface CardChoiceGridProps<EntryId extends string = DeckEntryId> {
  /** Resolved cards rendered in order. */
  cards: readonly CardChoiceGridCardView<EntryId>[];
  /** Named column count. */
  columns: CardChoiceGridColumns;
  /** Site preset or gallery-computed layout. */
  layout: CardChoiceGridLayout;
  /** Optional card-sized action appended after the cards. */
  endAction?: CardChoiceGridActionView<EntryId>;
  /** Fires when an enabled card tile is activated. */
  onCardPress?: (entryId: EntryId) => void;
  /** Fires when an enabled draggable card begins a native drag. */
  onCardDragStart?: (
    entryId: EntryId,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  /** Fires when an enabled draggable card's native drag ends. */
  onCardDragEnd?: (entryId: EntryId, event: DragEvent<HTMLDivElement>) => void;
  /** Fires when an enabled card requests contextual actions. */
  onCardContextMenu?: (
    entryId: EntryId,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  /** Fires with the trailing action's stable id. */
  onEndActionPress?: (entryId: EntryId) => void;
}

const COLUMN_COUNT: Record<CardChoiceGridColumns, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

function siteCardWidth(
  count: number,
  viewport: "mobile" | "desktop",
  fit: CardChoiceGridSiteFit,
): string {
  if (fit === "compact-choice") {
    return viewport === "desktop"
      ? "min(178px, 15.5cqw, 52cqh)"
      : "min(74px, 18cqw, 27cqh)";
  }
  if (fit === "mixed-reward") {
    return viewport === "desktop"
      ? "min(160px, 24cqw, 34cqh)"
      : "min(96px, 38cqw, 24cqh)";
  }
  if (viewport === "desktop") {
    const widthShare =
      count <= 1 ? 72 : count === 2 ? 42 : count === 3 ? 29 : 23.5;
    return `min(240px, ${String(widthShare)}cqw, 64cqh)`;
  }
  const rows = count <= 2 ? 1 : 2;
  const maxWidth = count <= 1 ? 180 : 128;
  const widthShare = count <= 1 ? 72 : 40;
  const heightShare = rows === 1 ? 56 : 31;
  return `min(${String(maxWidth)}px, ${String(widthShare)}cqw, ${String(heightShare)}cqh)`;
}

function CaptionNode({
  caption,
}: {
  readonly caption: CardChoiceGridCaption;
}): ReactElement {
  const resolve = useLocalizer();
  return (
    <p
      data-gallery-caption={caption.kind}
      style={{
        minHeight: 18,
        margin: 0,
        display: "grid",
        placeItems: "center",
        font: token("--t-caption"),
        color: token("--text-on-glass"),
        textAlign: "center",
      }}
    >
      {caption.kind === "essence" ? (
        <EssenceValue amount={caption.amount} tone="inherit" />
      ) : (
        resolve(caption.message)
      )}
    </p>
  );
}

function CardChoiceAction<EntryId extends string>({
  action,
  cardWidth,
  onActivate,
}: {
  readonly action: CardChoiceGridActionView<EntryId>;
  readonly cardWidth: string;
  readonly onActivate?: () => void;
}): ReactElement {
  const lastPointerType = useRef<string | null>(null);
  const binding = useRevealSource({
    identity: {
      entityType: "gallery-action",
      entityId: revealEntityId("gallery-action", action.entryId),
    },
    spec: {
      primary: {
        kind: "galleryAction",
        action: {
          glyph: action.glyph,
          label: action.label,
        },
      },
      secondaries: [],
    },
    onActivate: action.disabled === true ? undefined : onActivate,
  });
  const pointerDown = binding.sourceProps.onPointerDown;
  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      ariaLabelMessage={action.label}
      aria-disabled={action.disabled || undefined}
      disabled={action.disabled}
      pressFeedback="stationary"
      data-press-feedback="stationary"
      data-testid={action.testId}
      data-reveal-complete-game-card="false"
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
        pointerDown?.(event);
      }}
      onClick={() => {
        if (action.disabled !== true && lastPointerType.current !== "touch") {
          onActivate?.();
        }
      }}
      style={{
        ...binding.sourceProps.style,
        width: "100%",
        display: "block",
        appearance: "none",
        padding: 0,
        border: 0,
        background: "transparent",
      }}
    >
      <GalleryActionCard
        action={{
          glyph: action.glyph,
          label: action.label,
        }}
        width={cardWidth}
      />
    </Pressable>
  );
}

interface CardChoiceGridItemProps<EntryId extends string> {
  readonly card: CardChoiceGridCardView<EntryId>;
  readonly onCardPress?: (entryId: EntryId) => void;
  readonly onCardDragStart?: (
    entryId: EntryId,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  readonly onCardDragEnd?: (
    entryId: EntryId,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  readonly onCardContextMenu?: (
    entryId: EntryId,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
}

/** Private grid-item envelope around the canonical player-facing GameCard. */
function CardChoiceGridItem<EntryId extends string>({
  card,
  onCardPress,
  onCardDragStart,
  onCardDragEnd,
  onCardContextMenu,
}: CardChoiceGridItemProps<EntryId>): ReactElement {
  const resolve = useLocalizer();
  const reserved = card.reserved === true;
  const disabled = card.disabled === true || reserved;
  const draggable = !disabled && card.draggable === true;
  const stackedCopyShown = card.stackedCopy?.shown === true;
  const stackedCopyLeft = card.stackedCopy?.direction === "left";
  const operationPresentation =
    card.operation === undefined
      ? null
      : OPERATION_PRESENTATION[card.operation];
  const tileStyle: CSSProperties = {
    position: "relative",
    zIndex: stackedCopyShown ? 1 : undefined,
    display: "block",
    width: "100%",
    borderRadius: CARD_CORNER_RADIUS,
    boxShadow:
      card.emphasis === "danger" ? `0 0 0 2px ${token("--danger")}` : "none",
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    touchAction: "pan-y",
  };

  return (
    <div
      data-gallery-entry-id={card.entryId}
      data-entry-id={card.entryId}
      data-gallery-reserved={reserved || undefined}
      data-gallery-draggable={draggable || undefined}
      aria-hidden={reserved || undefined}
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => onCardDragStart?.(card.entryId, event)
          : undefined
      }
      onDragEnd={
        draggable ? (event) => onCardDragEnd?.(card.entryId, event) : undefined
      }
      onContextMenu={
        disabled || onCardContextMenu === undefined
          ? undefined
          : (event) => onCardContextMenu(card.entryId, event)
      }
      style={{
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: card.caption === undefined ? 0 : token("--space-xxs"),
        opacity: disabled ? 0.42 : 1,
        visibility: reserved ? "hidden" : undefined,
      }}
    >
      <div style={tileStyle}>
        {stackedCopyShown && (
          <div
            aria-hidden="true"
            data-gallery-stacked-copy=""
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              transform: `translate(${stackedCopyLeft ? `calc(${token("--space-xl")} * -1)` : token("--space-xl")}, ${token("--space-xl")}) rotate(${stackedCopyLeft ? "-3deg" : "3deg"})`,
              transformOrigin: "center",
            }}
          >
            <CardView
              card={card.model.displaySnapshot}
              transfiguration={card.model.transfiguration}
            />
          </div>
        )}
        <div style={{ position: "relative", zIndex: 1 }}>
          <GameCard
            model={card.model}
            selection={card.selection}
            unavailable={disabled}
            testId={card.testId}
            onPress={
              onCardPress === undefined
                ? undefined
                : () => onCardPress(card.entryId)
            }
          />
          {card.quantityBadge !== undefined && (
            <CardChoiceQuantityBadge
              count={card.quantityBadge.count}
              operationPresent={card.operation !== undefined}
            />
          )}
          {operationPresentation !== null && (
            <span
              aria-label={resolve(operationPresentation.message)}
              data-card-choice-operation={card.operation}
              style={{
                position: "absolute",
                right: token("--space-xs"),
                bottom: token("--space-xs"),
                zIndex: 21,
                width: "clamp(26px, 22%, 44px)",
                aspectRatio: "1 / 1",
                containerType: "inline-size",
                borderRadius: token("--radius-control"),
                display: "grid",
                placeItems: "center",
                color: token("--text-on-accent"),
                background: token(
                  operationPresentation.tone === "danger"
                    ? "--danger"
                    : "--selected",
                ),
                boxShadow: token("--shadow-md"),
                pointerEvents: "none",
              }}
            >
              <span style={{ display: "inline-flex", fontSize: "58cqi" }}>
                <StandaloneGlyph
                  glyph={operationPresentation.glyph}
                  color="text-on-accent"
                />
              </span>
            </span>
          )}
        </div>
      </div>
      {card.caption !== undefined && <CaptionNode caption={card.caption} />}
    </div>
  );
}

function CardChoiceQuantityBadge({
  count,
  operationPresent,
}: {
  readonly count: number;
  readonly operationPresent: boolean;
}): ReactElement {
  const resolve = useLocalizer();
  return (
    <span
      aria-label={resolve(
        txa(
          plural(count, [one("{count} copy"), other("{count} copies")]),
          { count },
          "[accessibility] [augury] Label on a selected Augury card showing how many copies the offer grants. count is a positive integer; the numeral is visible in the badge and is repeated here because this message is exposed only to assistive technology.",
        ),
      )}
      data-card-choice-quantity-badge=""
      style={{
        position: "absolute",
        right: operationPresent ? undefined : token("--space-xs"),
        left: operationPresent ? token("--space-xs") : undefined,
        bottom: token("--space-xs"),
        zIndex: 20,
        width: 36,
        height: 36,
        borderRadius: token("--radius-control"),
        display: "grid",
        placeItems: "center",
        color: token("--text-on-accent"),
        background: token("--accent-bright"),
        boxShadow: token("--shadow-md"),
        font: token("--t-button-sm"),
        pointerEvents: "none",
      }}
    >
      {count}×
    </span>
  );
}

/** Frameless card-choice grid shared by sites and framed gallery surfaces. */
export function CardChoiceGrid<EntryId extends string = DeckEntryId>({
  cards,
  columns,
  layout,
  endAction,
  onCardPress,
  onCardDragStart,
  onCardDragEnd,
  onCardContextMenu,
  onEndActionPress,
}: CardChoiceGridProps<EntryId>): ReactElement {
  const columnCount = COLUMN_COUNT[columns];
  const cardWidth =
    layout.kind === "gallery"
      ? layout.cardWidth
      : siteCardWidth(cards.length, layout.viewport, layout.fit);
  const columnGap =
    layout.kind === "gallery" ? layout.columnGap : token("--space-s");
  const rowGap = layout.kind === "gallery" ? layout.rowGap : token("--space-s");

  return (
    <div
      data-card-choice-grid=""
      data-card-choice-grid-columns={columnCount}
      data-card-choice-grid-layout={layout.kind}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${String(columnCount)}, ${cardWidth})`,
        columnGap,
        rowGap,
        justifyContent: "center",
        alignItems: "center",
        minWidth: 0,
      }}
    >
      {cards.map((card) => (
        <CardChoiceGridItem
          key={card.entryId}
          card={card}
          onCardPress={onCardPress}
          onCardDragStart={onCardDragStart}
          onCardDragEnd={onCardDragEnd}
          onCardContextMenu={onCardContextMenu}
        />
      ))}
      {endAction !== undefined && (
        <div
          key={endAction.entryId}
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: token("--space-xxs"),
            opacity: endAction.disabled === true ? 0.42 : 1,
          }}
        >
          <CardChoiceAction
            action={endAction}
            cardWidth={cardWidth}
            onActivate={() => onEndActionPress?.(endAction.entryId)}
          />
          <CaptionNode caption={endAction.caption} />
        </div>
      )}
    </div>
  );
}
