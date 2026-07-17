import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import { motion } from "framer-motion";
import {
  CardGalleryPanel,
  type CardGalleryCardView,
  type CardGalleryToolbar,
} from "../components/card/CardGalleryPanel";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";

export type CardZoneBrowserZone = "deck" | "void" | "banished";
export type CardZoneBrowserSort = "current" | "cost" | "spark" | "name";
export type CardZoneBrowserFilter = "all" | "character" | "event";

export interface CardZoneBrowserOverlayProps {
  /** Human-facing owner prefix, such as `Your` or `Enemy`. */
  readonly ownerLabel: string;
  /** Card zone whose contents are being inspected. */
  readonly zone: CardZoneBrowserZone;
  /** Resolved physical card entries in the zone's current order. */
  readonly cards: readonly CardGalleryCardView[];
  /** Dismisses the browser. */
  readonly onClose: () => void;
  /** Starts a native drag for one physical card entry. */
  readonly onCardDragStart?: (
    entryId: string,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  /** Ends a native drag for one physical card entry. */
  readonly onCardDragEnd?: (
    entryId: string,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  /** Requests one card entry's contextual actions. */
  readonly onCardContextMenu?: (
    entryId: string,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  /** Requests one card entry's mobile double-tap action. */
  readonly onCardDoubleTap?: (entryId: string) => void;
}

const SORT_OPTIONS = [
  { value: "current", label: "Current Order" },
  { value: "cost", label: "Energy Cost" },
  { value: "spark", label: "Spark" },
  { value: "name", label: "Name" },
];

const FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "character", label: "Characters" },
  { value: "event", label: "Events" },
];

const DESKTOP_BROWSER_MAX_WIDTH_PX = 1180;

function zoneLabel(zone: CardZoneBrowserZone): string {
  if (zone === "deck") return "Deck";
  if (zone === "void") return "Void";
  return "Banished";
}

function filteredCards(
  cards: readonly CardGalleryCardView[],
  query: string,
  sort: CardZoneBrowserSort,
  filter: CardZoneBrowserFilter,
): CardGalleryCardView[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = cards.filter((card) => {
    const snapshot = card.model.displaySnapshot;
    if (
      normalizedQuery !== "" &&
      !snapshot.name.toLocaleLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    if (filter === "character" && snapshot.cardType !== "Character") {
      return false;
    }
    if (filter === "event" && snapshot.cardType !== "Event") {
      return false;
    }
    return true;
  });

  if (sort === "current") return visible;
  return [...visible].sort((left, right) => {
    const leftCard = left.model.displaySnapshot;
    const rightCard = right.model.displaySnapshot;
    if (sort === "cost") {
      return (leftCard.energyCost ?? 0) - (rightCard.energyCost ?? 0);
    }
    if (sort === "spark") {
      return (rightCard.spark ?? 0) - (leftCard.spark ?? 0);
    }
    return leftCard.name.localeCompare(rightCard.name);
  });
}

/**
 * Full-screen Cumulus browser shared by battle decks, voids, and banished
 * piles. Search, sort, and filter are local presentation state; battle actions
 * remain callback intents owned by the live controller.
 */
export function CardZoneBrowserOverlay({
  ownerLabel,
  zone,
  cards,
  onClose,
  onCardDragStart,
  onCardDragEnd,
  onCardContextMenu,
  onCardDoubleTap,
}: CardZoneBrowserOverlayProps): ReactElement {
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CardZoneBrowserSort>("current");
  const [filter, setFilter] = useState<CardZoneBrowserFilter>("all");
  const [battlefieldEndInset, setBattlefieldEndInset] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const visibleCards = useMemo(
    () => filteredCards(cards, query, sort, filter),
    [cards, filter, query, sort],
  );

  useEffect(() => {
    searchInputRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!isDesktop) return undefined;
    const battlefield = document.querySelector<HTMLElement>(
      "main[data-battle-mobile]",
    );
    if (battlefield === null) return undefined;
    const measure = (): void => {
      setBattlefieldEndInset(
        Math.max(
          0,
          window.innerWidth - battlefield.getBoundingClientRect().right,
        ),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measure);
    observer?.observe(battlefield);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isDesktop]);

  const subtitle = visibleCards.length === cards.length
    ? `${String(cards.length)} ${cards.length === 1 ? "Card" : "Cards"}`
    : `${String(visibleCards.length)} of ${String(cards.length)} Cards`;
  const galleryCards = visibleCards.map((card, index) => ({
    ...card,
    ...(zone === "deck"
      ? { caption: { kind: "text" as const, text: `#${String(index + 1)}` } }
      : {}),
  }));
  const toolbar: CardGalleryToolbar = zone === "void"
    ? {
        sort: {
          ariaLabel: "Sort zone cards",
          options: SORT_OPTIONS,
          value: sort,
          onChange: (value) => setSort(value as CardZoneBrowserSort),
        },
      }
    : {
        search: {
          label: "Search Cards",
          value: query,
          onChange: setQuery,
          placeholder: "Search by name…",
          testId: "card-zone-browser-search",
          inputRef: searchInputRef,
        },
        sort: {
          ariaLabel: "Sort zone cards",
          options: SORT_OPTIONS,
          value: sort,
          onChange: (value) => setSort(value as CardZoneBrowserSort),
        },
        filter: {
          ariaLabel: "Filter zone cards by type",
          options: FILTER_OPTIONS,
          value: filter,
          onChange: (value) => setFilter(value as CardZoneBrowserFilter),
        },
      };
  const fillsDesktopFrame = isDesktop && zone !== "void";

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${ownerLabel} ${zoneLabel(zone)}`}
      className="cumulus"
      data-card-zone-browser={`${ownerLabel.toLocaleLowerCase()}:${zone}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: isDesktop ? token("--space-8") : 0,
        paddingBottom: isDesktop ? token("--space-8") : 0,
        paddingLeft: isDesktop ? token("--space-8") : 0,
        paddingRight: isDesktop
          ? `calc(${token("--space-8")} + ${String(battlefieldEndInset)}px)`
          : 0,
      }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: isDesktop
            ? `min(100%, ${String(DESKTOP_BROWSER_MAX_WIDTH_PX)}px)`
            : "100%",
          height: fillsDesktopFrame
            ? `calc(100vh - ${token("--space-8")} - ${token("--space-8")})`
            : isDesktop
              ? undefined
              : "100%",
          maxHeight: isDesktop
            ? `calc(100vh - ${token("--space-8")} - ${token("--space-8")})`
            : undefined,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <CardGalleryPanel
          title={`${ownerLabel} ${zoneLabel(zone)}`}
          subtitle={subtitle}
          rightAccessory={{
            kind: "iconButton",
            glyph: GLYPHS.close,
            label: `Close ${zoneLabel(zone).toLocaleLowerCase()} browser`,
            onPress: onClose,
          }}
          toolbar={toolbar}
          cards={galleryCards}
          emptyLabel={cards.length === 0 ? "No Cards." : "No Matching Cards."}
          columns={isDesktop ? (zone === "deck" ? "five" : "three") : "four"}
          cardSize={isDesktop ? "standard" : "compact"}
          frame={isDesktop ? "floating" : "fullBleed"}
          spacing={isDesktop ? "spacious" : "medium"}
          widthMode={fillsDesktopFrame ? "fill" : "content"}
          heightMode={fillsDesktopFrame ? "fill" : "content"}
          cutoutAwareAccessory
          onCardDragStart={onCardDragStart}
          onCardDragEnd={onCardDragEnd}
          onCardContextMenu={onCardContextMenu}
          onCardDoubleTap={isDesktop ? undefined : onCardDoubleTap}
        />
      </div>
    </motion.div>
  );
}
