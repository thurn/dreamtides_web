import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
} from "react";
import { motion } from "framer-motion";
import { CardBrowserPanel } from "../components/card/CardBrowserPanel";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../components/card/CardChoiceGrid";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "../primitives/use-is-desktop";
import type { DeckEntryId } from "../../types/identifiers";
import { formatNumber } from "../../runtime/format-number";

export type CardZoneBrowserZone = "deck" | "void" | "banished";
export type CardZoneBrowserSort = "current" | "cost" | "spark" | "name";
export type CardZoneBrowserFilter = "all" | "character" | "event";
export type CardZoneBrowserOwner = "viewer" | "opponent";
type CardBrowserToolbar = NonNullable<
  ComponentProps<typeof CardBrowserPanel>["toolbar"]
>;

export interface CardZoneBrowserOwnerSwitch {
  /** Owner whose cards are currently shown. */
  readonly value: CardZoneBrowserOwner;
  /** Number of banished cards controlled from the viewer's perspective. */
  readonly viewerCount: number;
  /** Number of banished cards controlled by the opposing perspective. */
  readonly opponentCount: number;
  /** Requests cards for the selected owner. */
  readonly onChange: (owner: CardZoneBrowserOwner) => void;
}

export interface CardZoneBrowserOverlayProps<
  EntryId extends string = DeckEntryId,
> {
  /** Viewer-relative owner used only to select presentation copy. */
  readonly owner: CardZoneBrowserOwner;
  /** Card zone whose contents are being inspected. */
  readonly zone: CardZoneBrowserZone;
  /** Resolved physical card entries in the zone's current order. */
  readonly cards: readonly CardGalleryCardView<EntryId>[];
  /** Optional viewer-relative owner switch for a shared zone browser. */
  readonly ownerSwitch?: CardZoneBrowserOwnerSwitch;
  /** Dismisses the browser. */
  readonly onClose: () => void;
  /** Starts a native drag for one physical card entry. */
  readonly onCardDragStart?: (
    entryId: EntryId,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  /** Ends a native drag for one physical card entry. */
  readonly onCardDragEnd?: (
    entryId: EntryId,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  /** Requests one card entry's contextual actions. */
  readonly onCardContextMenu?: (
    entryId: EntryId,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  /** Requests one card entry's mobile double-tap action. */
  readonly onCardDoubleTap?: (entryId: EntryId) => void;
}

const SORT_OPTIONS = [
  { value: "current" },
  { value: "cost" },
  { value: "spark" },
  { value: "name" },
];

const FILTER_OPTIONS = [
  { value: "all" },
  { value: "character" },
  { value: "event" },
];

const DESKTOP_BROWSER_MAX_WIDTH_PX = 1180;

function filteredCards<EntryId extends string>(
  cards: readonly CardGalleryCardView<EntryId>[],
  query: string,
  sort: CardZoneBrowserSort,
  filter: CardZoneBrowserFilter,
): CardGalleryCardView<EntryId>[] {
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
export function CardZoneBrowserOverlay<EntryId extends string = DeckEntryId>({
  owner,
  zone,
  cards,
  ownerSwitch,
  onClose,
  onCardDragStart,
  onCardDragEnd,
  onCardContextMenu,
  onCardDoubleTap,
}: CardZoneBrowserOverlayProps<EntryId>): ReactElement {
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
  const sortOptions = SORT_OPTIONS.map((option) => ({
    value: option.value,
    label:
      option.value === "current"
        ? "Acquired"
        : option.value === "cost"
          ? "Cost"
          : option.value === "spark"
            ? "Spark"
            : "Name",
  }));
  const filterOptions = FILTER_OPTIONS.map((option) => ({
    value: option.value,
    label:
      option.value === "all"
        ? "All"
        : option.value === "character"
          ? "Characters"
          : "Events",
  }));

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
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(battlefield);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isDesktop]);

  const subtitle =
    visibleCards.length === cards.length
      ? cards.length === 1
        ? `${formatNumber(cards.length)} Card`
        : `${formatNumber(cards.length)} Cards`
      : cards.length === 1
        ? `${formatNumber(visibleCards.length)} of ${formatNumber(cards.length)} Card`
        : `${formatNumber(visibleCards.length)} of ${formatNumber(cards.length)} Cards`;
  const galleryCards = visibleCards.map((card, index) => ({
    ...card,
    // A mobile hold is reserved for the GameCard reading reveal. Leaving the
    // native draggable attribute on this touch surface lets the browser
    // promote a sustained press into a drag, which dismisses that reveal.
    draggable: isDesktop && card.draggable === true,
    ...(zone === "deck"
      ? {
          caption: {
            kind: "text" as const,
            message: `#${formatNumber(index + 1)}`,
          },
        }
      : {}),
  }));
  const segmented =
    ownerSwitch === undefined
      ? undefined
      : {
          options: [
            {
              value: "viewer",
              label:
                ownerSwitch.viewerCount === 1
                  ? `Your Card · ${formatNumber(ownerSwitch.viewerCount)}`
                  : `Your Cards · ${formatNumber(ownerSwitch.viewerCount)}`,
            },
            {
              value: "opponent",
              label:
                ownerSwitch.opponentCount === 1
                  ? `Opponent Card · ${formatNumber(ownerSwitch.opponentCount)}`
                  : `Opponent Cards · ${formatNumber(ownerSwitch.opponentCount)}`,
            },
          ],
          value: ownerSwitch.value,
          onChange: (value: string) =>
            ownerSwitch.onChange(value as CardZoneBrowserOwner),
        };
  const toolbar: CardBrowserToolbar =
    zone === "void"
      ? {
          segmented,
          sort: {
            ariaLabel: "Sort zone cards",
            options: sortOptions,
            value: sort,
            onChange: (value) => setSort(value as CardZoneBrowserSort),
          },
        }
      : {
          segmented,
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
            options: sortOptions,
            value: sort,
            onChange: (value) => setSort(value as CardZoneBrowserSort),
          },
          filter: {
            ariaLabel: "Filter zone cards by type",
            options: filterOptions,
            value: filter,
            onChange: (value) => setFilter(value as CardZoneBrowserFilter),
          },
        };
  const title =
    ownerSwitch === undefined
      ? owner === "viewer"
        ? zone === "deck"
          ? "Your Deck"
          : zone === "void"
            ? "Your Void"
            : "Your Banished Cards"
        : zone === "deck"
          ? "Opponent’s Deck"
          : zone === "void"
            ? "Opponent’s Void"
            : "Opponent’s Banished Cards"
      : "Banished Cards";

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="cumulus"
      data-card-zone-browser={`${owner}:${zone}`}
      data-card-zone-browser-owner={ownerSwitch?.value}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: token("--layer-app-overlay"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: isDesktop ? token("--space-2xl") : 0,
        paddingBottom: isDesktop ? token("--space-2xl") : 0,
        paddingLeft: isDesktop ? token("--space-2xl") : 0,
        paddingRight: isDesktop
          ? `calc(${token("--space-2xl")} + ${String(battlefieldEndInset)}px)`
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
          height: isDesktop
            ? `calc(100vh - ${token("--space-2xl")} - ${token("--space-2xl")})`
            : "100%",
          maxHeight: isDesktop
            ? `calc(100vh - ${token("--space-2xl")} - ${token("--space-2xl")})`
            : undefined,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <CardBrowserPanel<EntryId>
          title={title}
          subtitle={subtitle}
          rightAccessory={{
            kind: "iconButton",
            button: {
              glyph: GLYPHS.close,
              label:
                zone === "deck"
                  ? "Close deck browser"
                  : zone === "void"
                    ? "Close void browser"
                    : "Close banished-cards browser",
              onPress: onClose,
            },
          }}
          toolbar={toolbar}
          cards={galleryCards}
          emptyLabel={cards.length === 0 ? "No Cards." : "No Matching Cards."}
          presentation="overlay"
          onCardDragStart={onCardDragStart}
          onCardDragEnd={onCardDragEnd}
          onCardContextMenu={onCardContextMenu}
          onCardDoubleTap={isDesktop ? undefined : onCardDoubleTap}
        />
      </div>
    </motion.div>
  );
}
