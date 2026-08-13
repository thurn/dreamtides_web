// PoolViewerScreen — the shared Cumulus presentation for the run-pool browser.
//
// The app overlay and floating battle inspector use this same pure screen.  The
// outer controller owns visibility, stateful domain integration, and (for the
// battle) window dragging; this file only renders semantic view data and
// reports stable entry ids through callbacks.

import type { CSSProperties, DragEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  meaning,
  one,
  other,
  plural,
  tx,
  txa,
  type LocalizedString,
} from "@trox/runtime";
import { CardBrowserPanel } from "../components/card/CardBrowserPanel";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../components/card/CardChoiceGrid";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { Select } from "../components/controls/Select";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { useLocalizer } from "../../runtime/localization/use-localizer";

export type PoolViewerSourceId = "run" | "tides" | "catalog" | "signature";
export type PoolViewerTitleKind = "pool" | "battle";

export type PoolViewerSortDirection = "asc" | "desc";
export type PoolViewerSortId =
  "name" | "cardNumber" | "cost" | "type" | "subtype" | "spark";
export type PoolViewerTypeFilter = "all" | "character" | "event";
export type PoolViewerCostFilter =
  "all" | "0" | "1" | "2" | "3" | "4" | "5plus" | "x";

export interface PoolViewerFilterView {
  query: string;
  sort: PoolViewerSortId;
  direction: PoolViewerSortDirection;
  type: PoolViewerTypeFilter;
  subtype: string;
  cost: PoolViewerCostFilter;
}

export type PoolViewerDisclosureView =
  | {
      id: "tides";
      tideCount: number;
      dealSize: number;
      copyCap: number;
      facetDrawnCount: number;
      facetAvailableCount: number;
    }
  | { id: "algorithm"; variant: string };

export interface PoolViewerView {
  title: PoolViewerTitleKind;
  frame: "fullScreen" | "floating";
  source: PoolViewerSourceId;
  sourceOptions: readonly PoolViewerSourceId[];
  filters: PoolViewerFilterView;
  cards: readonly CardGalleryCardView[];
  totalCount: number;
  visibleCount: number;
  sortOptions: readonly PoolViewerSortId[];
  subtypeOptions: readonly { value: string; label: LocalizedString }[];
  disclosures: readonly PoolViewerDisclosureView[];
}

export interface PoolViewerScreenProps {
  view: PoolViewerView;
  onClose: () => void;
  onSourceChange: (source: PoolViewerSourceId) => void;
  onFiltersChange: (patch: Partial<PoolViewerFilterView>) => void;
  onCardPress: (entryId: string) => void;
  onCardDragStart?: (entryId: string, event: DragEvent<HTMLDivElement>) => void;
  onCardDragEnd?: (entryId: string, event: DragEvent<HTMLDivElement>) => void;
}

const rootStyle: CSSProperties = {
  minHeight: "100vh",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  color: token("--text-on-glass"),
};

const controlsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: token("--space-s"),
  padding: token("--space-s"),
};

/** Shared pure pool viewer for full-screen and floating integration shells. */
export function PoolViewerScreen({
  view,
  onClose,
  onSourceChange,
  onFiltersChange,
  onCardPress,
  onCardDragStart,
  onCardDragEnd,
}: PoolViewerScreenProps): ReactElement {
  const resolve = useLocalizer();
  const [expandedDisclosures, setExpandedDisclosures] = useState<
    Record<string, boolean>
  >({});
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sourceOptions = view.sourceOptions.map((source) => ({
    value: source,
    label: sourceOptionLabel(source),
  }));
  const galleryCards = view.cards.map((card) => ({
    ...card,
    draggable: onCardDragStart !== undefined,
  }));

  return (
    <section
      className="cumulus"
      data-pool-viewer={view.frame === "fullScreen" ? "overlay" : "floating"}
      style={{
        ...rootStyle,
        ...(view.frame === "fullScreen"
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 60,
              background: token("--scrim-gallery"),
              overflowY: "auto",
            }
          : {}),
      }}
    >
      <div style={controlsStyle} data-pool-viewer-controls="">
        <SegmentedControl
          size="sm"
          options={sourceOptions}
          value={view.source}
          onChange={(value) => onSourceChange(value as PoolViewerSourceId)}
        />
        <SegmentedControl
          size="sm"
          options={(["all", "character", "event"] as const).map(
            (card_type) => ({
              value: card_type,
              label: typeFilterLabel(card_type),
            }),
          )}
          value={view.filters.type}
          onChange={(type) =>
            onFiltersChange({ type: type as PoolViewerTypeFilter })
          }
        />
        <SegmentedControl
          size="sm"
          options={(["asc", "desc"] as const).map((direction) => ({
            value: direction,
            symbol:
              direction === "asc"
                ? /* localization-ignore: icon-only sort glyph; the adjacent ariaLabel is localized. */ "↑"
                : /* localization-ignore: icon-only sort glyph; the adjacent ariaLabel is localized. */ "↓",
            ariaLabel: sortDirectionLabel(direction),
          }))}
          value={view.filters.direction}
          onChange={(direction) =>
            onFiltersChange({ direction: direction as PoolViewerSortDirection })
          }
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.filter}
          ariaLabel={tx(
            "Filter card subtype",
            "Accessible name for the Pool Viewer selector that filters Character cards by their authored subtype.",
          )}
          options={[
            {
              value: "",
              label: tx(
                "All subtypes",
                "Visible Pool Viewer subtype option that clears the authored Character-subtype filter.",
              ),
            },
            ...view.subtypeOptions.map((option) => ({
              value: option.value,
              label: option.label,
            })),
          ]}
          value={view.filters.subtype}
          onChange={(subtype) => onFiltersChange({ subtype })}
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.energy}
          ariaLabel={tx(
            "Filter card cost",
            "Accessible name for the Pool Viewer selector that filters cards by their Energy-cost category.",
          )}
          options={(
            ["all", "0", "1", "2", "3", "4", "5plus", "x"] as const
          ).map((cost) => {
            return {
              value: cost,
              label: costFilterLabel(cost),
            };
          })}
          value={view.filters.cost}
          onChange={(cost) =>
            onFiltersChange({ cost: cost as PoolViewerCostFilter })
          }
        />
      </div>
      {view.disclosures.map((disclosure) => (
        <DisclosureSection
          key={disclosure.id}
          title={
            disclosure.id === "tides"
              ? tx(
                  "Tide provenance",
                  "Visible title of the Pool Viewer disclosure explaining which Tides constructed the run pool.",
                )
              : tx(
                  "Pool construction",
                  "Visible title of the Pool Viewer disclosure identifying the active pool-construction algorithm.",
                )
          }
          summary={
            disclosure.id === "tides"
              ? txa(
                  plural(disclosure.tideCount, [
                    one("{tide_count} Tide"),
                    other("{tide_count} Tides"),
                  ]),
                  { tide_count: disclosure.tideCount },
                  "Visible Pool Viewer disclosure summary showing the number of Tides used to construct the pool. tide_count is a visible nonnegative safe integer, can be zero in synthetic or incomplete data, and governs Tide number grammar.",
                )
              : txa(
                  "Algorithm: {algorithm_id}",
                  { algorithm_id: disclosure.variant },
                  "Visible Pool Viewer diagnostic summary naming the pool-construction algorithm. algorithm_id is a stable raw internal identifier such as tides4; translators may reorder it but the identifier itself remains unchanged.",
                )
          }
          expanded={expandedDisclosures[disclosure.id] ?? true}
          onExpandedChange={(expanded) =>
            setExpandedDisclosures((current) => ({
              ...current,
              [disclosure.id]: expanded,
            }))
          }
          testId={`pool-disclosure-${disclosure.id}`}
        >
          <p
            style={{
              margin: token("--space-s"),
              font: token("--t-body-sm"),
              color: token("--text-on-glass-muted"),
            }}
          >
            {disclosure.id === "tides"
              ? resolve(
                  txa(
                    plural(disclosure.dealSize, [
                      one(
                        "Built to {deal_size} Card with a per-card copy cap of {copy_cap}; {facet_drawn_count} of {facet_available_count} theme Tides were drawn.",
                      ),
                      other(
                        "Built to {deal_size} Cards with a per-card copy cap of {copy_cap}; {facet_drawn_count} of {facet_available_count} theme Tides were drawn.",
                      ),
                    ]),
                    {
                      deal_size: disclosure.dealSize,
                      copy_cap: disclosure.copyCap,
                      facet_drawn_count: disclosure.facetDrawnCount,
                      facet_available_count: disclosure.facetAvailableCount,
                    },
                    "Visible Pool Viewer diagnostic sentence describing a Tides-built pool. deal_size is the visible nonnegative safe-integer target pool size and governs Card number grammar. copy_cap is the visible nonnegative per-card maximum. facet_drawn_count and facet_available_count are separate visible nonnegative counts showing selected and available theme Tides; drawn can be zero and cannot exceed available.",
                  ),
                )
              : resolve(
                  tx(
                    "The active run pool is shown with its remaining copies.",
                    "Visible Pool Viewer disclosure sentence explaining that card quantities are the current remaining copies in the active run pool.",
                  ),
                )}
          </p>
        </DisclosureSection>
      ))}
      <CardBrowserPanel
        title={viewerTitle(view.title)}
        subtitle={txa(
          meaning(
            "pool-filtered-count-subtitle",
            plural(view.totalCount, [
              one("{visible_count} of {total_count} Card"),
              other("{visible_count} of {total_count} Cards"),
            ]),
          ),
          { visible_count: view.visibleCount, total_count: view.totalCount },
          "Filtered card-browser subtitle. visible_count is the non-negative number matching the active filters; total_count is the non-negative collection size before filtering and governs Card grammar.",
        )}
        rightAccessory={{
          kind: "iconButton",
          button: {
            glyph: GLYPHS.close,
            label: tx(
              "Close pool viewer",
              "Accessible command name for the button that closes the Pool Viewer overlay or floating panel.",
            ),
            onPress: onClose,
            testId: "pool-viewer-close",
          },
        }}
        toolbar={{
          search: {
            label: tx(
              "Search cards",
              "Visible label for the Pool Viewer field that searches authored card names and rules text.",
            ),
            value: view.filters.query,
            onChange: (query) => onFiltersChange({ query }),
            testId: "pool-viewer-search",
          },
          sort: {
            ariaLabel: tx(
              "Sort cards",
              "Accessible name for the Pool Viewer selector that chooses the card property used for sorting.",
            ),
            value: view.filters.sort,
            options: view.sortOptions.map((sort) => {
              return { value: sort, label: sortFieldLabel(sort) };
            }),
            onChange: (sort) =>
              onFiltersChange({ sort: sort as PoolViewerSortId }),
          },
        }}
        cards={galleryCards}
        emptyLabel={emptySourceLabel(view.source)}
        presentation={view.frame === "fullScreen" ? "fullScreen" : "embedded"}
        testId="pool-viewer-gallery"
        onCardPress={onCardPress}
        onCardDragStart={onCardDragStart}
        onCardDragEnd={onCardDragEnd}
      />
    </section>
  );
}

function sourceOptionLabel(source: PoolViewerSourceId): LocalizedString {
  switch (source) {
    case "run":
      return tx(
        "Run Pool",
        "Visible Pool Viewer source-tab label for the current remaining draft pool.",
      );
    case "tides":
      return tx(
        "Tide Decks",
        "Visible Pool Viewer source-tab label for the Tide construction input.",
      );
    case "catalog":
      return tx(
        "All Cards",
        "Visible Pool Viewer source-tab label for the full card catalog.",
      );
    case "signature":
      return tx(
        "Signature Cards",
        "Visible collection label for the active Dream Avatar's authored signature cards.",
      );
  }
}

function emptySourceLabel(source: PoolViewerSourceId): LocalizedString {
  switch (source) {
    case "run":
      return tx(
        "No run pool cards are available.",
        "Visible Pool Viewer empty-state sentence for an empty current run pool.",
      );
    case "tides":
      return tx(
        "This run has no Tide decks.",
        "Visible Pool Viewer empty-state sentence when the run has no Tide construction inputs.",
      );
    case "catalog":
      return tx(
        "No cards match the current filters.",
        "Visible Pool Viewer empty-state sentence when filters hide every card in the full catalog.",
      );
    case "signature":
      return tx(
        "This avatar has no signature cards.",
        "Visible Pool Viewer empty-state sentence when the Dream Avatar has no authored signature cards.",
      );
  }
}

function typeFilterLabel(cardType: PoolViewerTypeFilter): LocalizedString {
  switch (cardType) {
    case "all":
      return tx(
        "All",
        "Visible card-browser type filter option that keeps every card type.",
      );
    case "character":
      return tx(
        "Characters",
        "Visible card-browser type filter option that keeps Character cards.",
      );
    case "event":
      return tx(
        "Events",
        "Visible card-browser type filter option that keeps Event cards.",
      );
  }
}

function sortDirectionLabel(
  direction: PoolViewerSortDirection,
): LocalizedString {
  switch (direction) {
    case "asc":
      return tx(
        "Sort ascending",
        "Accessible command name for sorting the visible card collection in ascending order.",
      );
    case "desc":
      return tx(
        "Sort descending",
        "Accessible command name for sorting the visible card collection in descending order.",
      );
  }
}

function costFilterLabel(cost: PoolViewerCostFilter): LocalizedString {
  switch (cost) {
    case "all":
    case "0":
    case "1":
    case "2":
    case "3":
    case "4":
      return tx(
        "All costs",
        "Compact visible Pool Viewer Energy-cost filter option. The same source label is used for the no-filter option and the exact-cost zero-through-four options.",
      );
    case "5plus":
      return tx(
        "Cost 5+",
        "Compact visible Pool Viewer Energy-cost filter option that selects cards with a printed cost of five or more.",
      );
    case "x":
      return tx(
        "Cost X",
        "Compact visible Pool Viewer Energy-cost filter option that selects cards with a variable printed cost.",
      );
  }
}

function viewerTitle(title: PoolViewerTitleKind): LocalizedString {
  switch (title) {
    case "pool":
      return tx(
        meaning("pool-viewer-heading", "Pool Viewer"),
        "Visible Pool Viewer heading for the Journey utility overlay.",
      );
    case "battle":
      return tx(
        "Battle Pool Viewer",
        "Visible Pool Viewer heading for the floating Battle inspector.",
      );
  }
}

function sortFieldLabel(sort: PoolViewerSortId): LocalizedString {
  switch (sort) {
    case "name":
      return tx(
        "Name",
        "Visible card-browser sort-field option for canonical authored card names.",
      );
    case "cardNumber":
      return tx(
        "Number",
        "Compact visible Pool Viewer sort-field option for authored card numbers.",
      );
    case "cost":
      return tx(
        "Cost",
        "Visible card-browser sort-field option for printed Energy cost.",
      );
    case "type":
      return tx(
        "Type",
        "Compact visible Pool Viewer sort-field option for card type.",
      );
    case "subtype":
      return tx(
        "Subtype",
        "Visible card-browser sort-field option for canonical authored subtype.",
      );
    case "spark":
      return tx(
        "Spark",
        "Visible card-browser sort-field option for printed Spark.",
      );
  }
}
