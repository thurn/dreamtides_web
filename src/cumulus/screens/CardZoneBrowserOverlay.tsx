import { meaning,
  tx,
  plural,
  one,
  other,
  txa,
} from "@trox/runtime";
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
import { useLocalizer } from "../../runtime/localization/use-localizer";
import { useIsDesktop } from "./use-is-desktop";

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

export interface CardZoneBrowserOverlayProps {
  /** Viewer-relative owner used only to select localized presentation. */
  readonly owner: CardZoneBrowserOwner;
  /** Card zone whose contents are being inspected. */
  readonly zone: CardZoneBrowserZone;
  /** Resolved physical card entries in the zone's current order. */
  readonly cards: readonly CardGalleryCardView[];
  /** Optional viewer-relative owner switch for a shared zone browser. */
  readonly ownerSwitch?: CardZoneBrowserOwnerSwitch;
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
  owner,
  zone,
  cards,
  ownerSwitch,
  onClose,
  onCardDragStart,
  onCardDragEnd,
  onCardContextMenu,
  onCardDoubleTap,
}: CardZoneBrowserOverlayProps): ReactElement {
  const resolve = useLocalizer();
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
        ? tx(
            "Acquired",
            "Player-facing message for the deck sort acquired interface state.",
          )
        : option.value === "cost"
          ? tx(
              "Cost",
              "Visible card-browser sort-field option for printed Energy cost.",
            )
          : option.value === "spark"
            ? tx(
                "Spark",
                "Visible card-browser sort-field option for printed Spark.",
              )
            : tx(
                "Name",
                "Visible card-browser sort-field option for canonical authored card names.",
              ),
  }));
  const filterOptions = FILTER_OPTIONS.map((option) => ({
    value: option.value,
    label:
      option.value === "all"
        ? tx("All", "Visible card-browser type filter option that keeps every card type.")
        : option.value === "character"
          ? tx(
              "Characters",
              "Visible card-browser type filter option that keeps Character cards.",
            )
          : tx(
              "Events",
              "Visible card-browser type filter option that keeps Event cards.",
            ),
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
      ? txa(
          meaning(
            "battle-zone-count-subtitle",
            plural(cards.length, [one("{count} Card"), other("{count} Cards")]),
          ),
          { count: cards.length },
          "Subtitle reporting the non-negative number of physical cards visible in the current card browser. count can be zero.",
        )
      : txa(
          meaning(
            "battle-zone-filtered-count-subtitle",
            plural(cards.length, [
              one("{visible_count} of {total_count} Card"),
              other("{visible_count} of {total_count} Cards"),
            ]),
          ),
          { total_count: cards.length, visible_count: visibleCards.length },
          "Subtitle when filters show only part of a battle zone. visible_count and total_count are non-negative card-entry counts; either can be zero.",
        );
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
            message: txa(
              "#{position}",
              { position: index + 1 },
              "Compact one-based position beneath a card in the current battle deck order.",
            ),
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
              label: txa(
                  plural(ownerSwitch.viewerCount, [
                    one("Your Card · {count}"),
                    other("Your Cards · {count}"),
                  ]),
                  { count: ownerSwitch.viewerCount },
                  "Label for the local-player option in a battle zone owner switch. count is the non-negative number of that player's banished cards and can be zero.",
                ),
            },
            {
              value: "opponent",
              label: txa(
                  plural(ownerSwitch.opponentCount, [
                    one("Opponent Card · {count}"),
                    other("Opponent Cards · {count}"),
                  ]),
                  { count: ownerSwitch.opponentCount },
                  "Label for the opposing-player option in a battle zone owner switch. count is the non-negative number of that player's banished cards and can be zero.",
                ),
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
            ariaLabel: tx(
                "Sort zone cards",
                "Player-facing message for the battle zone browser sort accessible name interface state.",
              ),
            options: sortOptions,
            value: sort,
            onChange: (value) => setSort(value as CardZoneBrowserSort),
          },
        }
      : {
          segmented,
          search: {
            label: tx(
                "Search Cards",
                "Player-facing message for the battle zone browser search label interface state.",
              ),
            value: query,
            onChange: setQuery,
            placeholder: tx(
                "Search by name…",
                "Player-facing message for the battle zone browser search placeholder interface state.",
              ),
            testId: "card-zone-browser-search",
            inputRef: searchInputRef,
          },
          sort: {
            ariaLabel: tx(
                "Sort zone cards",
                "Player-facing message for the battle zone browser sort accessible name interface state.",
              ),
            options: sortOptions,
            value: sort,
            onChange: (value) => setSort(value as CardZoneBrowserSort),
          },
          filter: {
            ariaLabel: tx(
                "Filter zone cards by type",
                "Player-facing message for the battle zone browser filter accessible name interface state.",
              ),
            options: filterOptions,
            value: filter,
            onChange: (value) => setFilter(value as CardZoneBrowserFilter),
          },
        };
  const title =
    ownerSwitch === undefined
      ? owner === "viewer"
        ? zone === "deck"
          ? tx(meaning("battle-deck-browser-title", "Your Deck"), "Title for the local player's battle draw-pile browser.")
          : zone === "void"
            ? tx(meaning("battle-void-browser-title", "Your Void"), "Title for the local player's battle Void browser.")
            : tx("Your Banished Cards", "Title for the local player's banished-card browser.")
        : zone === "deck"
          ? tx("Opponent’s Deck", "Title for the opposing player's battle draw-pile browser.")
          : zone === "void"
            ? tx("Opponent’s Void", "Title for the opposing player's battle Void browser.")
            : tx("Opponent’s Banished Cards", "Title for the opposing player's banished-card browser.")
      : tx(
          "Banished Cards",
          "Shared title for the browser that can switch between both players' banished cards during a battle.",
        );

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={resolve(title)}
      className="cumulus"
      data-card-zone-browser={`${owner}:${zone}`}
      data-card-zone-browser-owner={ownerSwitch?.value}
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
        <CardBrowserPanel
          title={title}
          subtitle={subtitle}
          rightAccessory={{
            kind: "iconButton",
            button: {
              glyph: GLYPHS.close,
              label:
                zone === "deck"
                  ? tx(meaning("battle-deck-browser-close", "Close deck browser"), "Accessible name for dismissing a battle deck browser.")
                  : zone === "void"
                    ? tx("Close void browser", "Accessible name for dismissing a battle Void browser.")
                    : tx("Close banished-cards browser", "Accessible name for dismissing a banished-card browser."),
              onPress: onClose,
            },
          }}
          toolbar={toolbar}
          cards={galleryCards}
          emptyLabel={
            cards.length === 0
              ? tx(
                  "No Cards.",
                  "Empty state when the selected battle zone itself contains zero cards.",
                )
              : tx(
                  "No Matching Cards.",
                  "Empty state when a non-empty battle zone has no cards matching the active search or type filter.",
                )
          }
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
