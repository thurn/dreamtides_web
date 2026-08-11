// PoolViewerScreen — the shared Cumulus presentation for the run-pool browser.
//
// The app overlay and floating battle inspector use this same pure screen.  The
// outer controller owns visibility, stateful domain integration, and (for the
// battle) window dragging; this file only renders resolved view data and
// reports stable entry ids through callbacks.

import type { CSSProperties, DragEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  one,
  other,
  otherwise,
  plural,
  select,
  tx,
  txa,
  when,
} from "@trox/runtime";
import { CardBrowserPanel } from "../components/card/CardBrowserPanel";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../components/card/CardChoiceGrid";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { Select } from "../components/controls/Select";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { useLocalizer } from "../../runtime/localization/use-localizer";

export type PoolViewerSourceId =
  | "run"
  | "tides"
  | "catalog"
  | "signature";
export type PoolViewerTitleKind = "pool" | "battle";

export type PoolViewerSortDirection = "asc" | "desc";
export type PoolViewerSortId = "name" | "cardNumber" | "cost" | "type" | "subtype" | "spark";
type PoolViewerSortSelector = "sort-name" | "sort-card-number" | "sort-cost" | "sort-type" | "sort-subtype" | "sort-spark";
export type PoolViewerTypeFilter = "all" | "character" | "event";
export type PoolViewerCostFilter = "all" | "0" | "1" | "2" | "3" | "4" | "5plus" | "x";
type PoolViewerCostSelector = "cost-all" | "cost-0" | "cost-1" | "cost-2" | "cost-3" | "cost-4" | "cost-5plus" | "cost-x";

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
  subtypeOptions: readonly { value: string; label: string }[];
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
  const [expandedDisclosures, setExpandedDisclosures] = useState<Record<string, boolean>>({});
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const selected_source = view.source;
  const viewer_context = view.title;
  const sourceOptions = view.sourceOptions.map((source) => ({
    value: source,
    label: resolve(tx(
      select(source, [
        when("run", "Run Pool"),
        when("tides", "Tide Decks"),
        when("catalog", "All Cards"),
        when("signature", "Signature Cards"),
        otherwise("Pick History"),
      ]),
      "Visible Pool Viewer source-tab label. The source selector is the closed collection kind: run is the current remaining draft pool, tides is the Tide construction input, catalog is the full card catalog, and signature is the Dream Avatar's authored signature cards. The fallback preserves the existing label for an unrecognized future source.",
    )),
  }));
  const emptyLabel = resolve(tx(
    select(selected_source, [
      when("run", "No run pool cards are available."),
      when("tides", "This run has no Tide decks."),
      when("catalog", "No cards match the current filters."),
      when("signature", "This avatar has no signature cards."),
      otherwise("The replay record has no pick history."),
    ]),
    "Visible Pool Viewer empty-state sentence. The source selector identifies the selected semantic collection and determines why it is empty; the fallback preserves the existing explanation for an unrecognized future source.",
  ));
  const galleryCards = view.cards.map((card) => ({
    ...card,
    draggable: onCardDragStart !== undefined,
  }));

  return (
    <section
      className="cumulus"
      data-pool-viewer={view.frame === "fullScreen" ? "overlay" : "floating"}
      style={{ ...rootStyle, ...(view.frame === "fullScreen" ? { position: "fixed", inset: 0, zIndex: 60, background: token("--scrim-gallery"), overflowY: "auto" } : {}) }}
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
          options={(["all", "character", "event"] as const).map((card_type) => ({
            value: card_type,
            label: resolve(tx(
              select(card_type, [
                when("character", "Characters"),
                when("event", "Events"),
                when("all", "All"),
                otherwise("All"),
              ]),
              "Compact visible Pool Viewer card-type filter label. The type selector is a closed product filter enum: all keeps both card types, character keeps Character cards, and event keeps Event cards.",
            )),
          }))}
          value={view.filters.type}
          onChange={(type) => onFiltersChange({ type: type as PoolViewerTypeFilter })}
        />
        <SegmentedControl
          size="sm"
          options={(["asc", "desc"] as const).map((direction) => ({
            value: direction,
            label: direction === "asc"
              ? /* localization-ignore: icon-only sort glyph; the adjacent ariaLabel is localized. */ "↑"
              : /* localization-ignore: icon-only sort glyph; the adjacent ariaLabel is localized. */ "↓",
            ariaLabel: resolve(tx(
              select(direction, [when("desc", "Sort descending"), when("asc", "Sort ascending"), otherwise("Sort ascending")]),
              "Accessible command name for the compact Pool Viewer sort-direction control. The direction selector is asc for ascending order or desc for descending order.",
            )),
          }))}
          value={view.filters.direction}
          onChange={(direction) => onFiltersChange({ direction: direction as PoolViewerSortDirection })}
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.filter}
          ariaLabel={resolve(tx(
            "Filter card subtype",
            "Accessible name for the Pool Viewer selector that filters Character cards by their authored subtype.",
          ))}
          options={[{ value: "", label: resolve(tx(
            "All subtypes",
            "Visible Pool Viewer subtype option that clears the authored Character-subtype filter.",
          )) }, ...view.subtypeOptions]}
          value={view.filters.subtype}
          onChange={(subtype) => onFiltersChange({ subtype })}
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.energy}
          ariaLabel={resolve(tx(
            "Filter card cost",
            "Accessible name for the Pool Viewer selector that filters cards by their Energy-cost category.",
          ))}
          options={(["all", "0", "1", "2", "3", "4", "5plus", "x"] as const).map((cost) => {
            const cost_filter = costSelector(cost);
            return {
              value: cost,
              label: resolve(tx(
              select(cost_filter, [
                when("cost-0", "All costs"),
                when("cost-1", "All costs"),
                when("cost-2", "All costs"),
                when("cost-3", "All costs"),
                when("cost-4", "All costs"),
                when("cost-5plus", "Cost 5+"),
                when("cost-x", "Cost X"),
                otherwise("All costs"),
              ]),
              "Compact visible Pool Viewer Energy-cost filter option. Cost is a product enum, not a quantity: 0 through 4 select exact printed costs, 5plus selects five or more, x selects variable cost, and all disables this filter. Source English for the exact-digit states is intentionally preserved as All costs by the immutable migration parity contract.",
              )),
            };
          })}
          value={view.filters.cost}
          onChange={(cost) => onFiltersChange({ cost: cost as PoolViewerCostFilter })}
        />
      </div>
      {view.disclosures.map((disclosure) => (
        <DisclosureSection
          key={disclosure.id}
          title={
            disclosure.id === "tides"
              ? resolve(tx(
                  "Tide provenance",
                  "Visible title of the Pool Viewer disclosure explaining which Tides constructed the run pool.",
                ))
              : resolve(tx(
                  "Pool construction",
                  "Visible title of the Pool Viewer disclosure identifying the active pool-construction algorithm.",
                ))
          }
          summary={
            disclosure.id === "tides"
              ? resolve(txa(
                  plural(disclosure.tideCount, [
                    one("{tide_count} Tide"),
                    other("{tide_count} Tides"),
                  ]),
                  { tide_count: disclosure.tideCount },
                  "Visible Pool Viewer disclosure summary showing the number of Tides used to construct the pool. tide_count is a visible nonnegative safe integer, can be zero in synthetic or incomplete data, and governs Tide number grammar.",
                ))
              : resolve(txa(
                  "Algorithm: {algorithm_id}",
                  { algorithm_id: disclosure.variant },
                  "Visible Pool Viewer diagnostic summary naming the pool-construction algorithm. algorithm_id is a stable raw internal identifier such as tides4; translators may reorder it but the identifier itself remains unchanged.",
                ))
          }
          expanded={expandedDisclosures[disclosure.id] ?? true}
          onExpandedChange={(expanded) => setExpandedDisclosures((current) => ({ ...current, [disclosure.id]: expanded }))}
          testId={`pool-disclosure-${disclosure.id}`}
        >
          <p style={{ margin: token("--space-s"), font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
            {disclosure.id === "tides"
              ? resolve(txa(
                  plural(disclosure.dealSize, [
                    one("Built to {deal_size} Card with a per-card copy cap of {copy_cap}; {facet_drawn_count} of {facet_available_count} theme Tides were drawn."),
                    other("Built to {deal_size} Cards with a per-card copy cap of {copy_cap}; {facet_drawn_count} of {facet_available_count} theme Tides were drawn."),
                  ]),
                  {
                    deal_size: disclosure.dealSize,
                    copy_cap: disclosure.copyCap,
                    facet_drawn_count: disclosure.facetDrawnCount,
                    facet_available_count: disclosure.facetAvailableCount,
                  },
                  "Visible Pool Viewer diagnostic sentence describing a Tides-built pool. deal_size is the visible nonnegative safe-integer target pool size and governs Card number grammar. copy_cap is the visible nonnegative per-card maximum. facet_drawn_count and facet_available_count are separate visible nonnegative counts showing selected and available theme Tides; drawn can be zero and cannot exceed available.",
                ))
              : resolve(tx(
                  "The active run pool is shown with its remaining copies.",
                  "Visible Pool Viewer disclosure sentence explaining that card quantities are the current remaining copies in the active run pool.",
                ))}
          </p>
        </DisclosureSection>
      ))}
      <CardBrowserPanel
          title={resolve(tx(
            select(viewer_context, [
              when("battle", "Battle Pool Viewer"),
              when("pool", "Pool Viewer"),
              otherwise("Pool Viewer"),
            ]),
            "Visible Pool Viewer heading. The context selector distinguishes the floating Battle inspector from the Journey utility overlay.",
          ))}
          subtitle={resolve(txa(
            plural(view.totalCount, [
              one("{visible_count} of {total_count} Card"),
              other("{visible_count} of {total_count} Cards"),
            ]),
            { visible_count: view.visibleCount, total_count: view.totalCount },
            "Visible Pool Viewer result-count subtitle. visible_count is the nonnegative safe-integer number remaining after filters and may be smaller than total_count. total_count is the nonnegative safe-integer size of the selected source before filters and governs Card number grammar; both numbers are visible.",
          ))}
          rightAccessory={{ kind: "iconButton", button: { glyph: GLYPHS.close, label: resolve(tx(
            "Close pool viewer",
            "Accessible command name for the button that closes the Pool Viewer overlay or floating panel.",
          )), onPress: onClose, testId: "pool-viewer-close" } }}
          toolbar={{
            search: { label: resolve(tx(
              "Search cards",
              "Visible label for the Pool Viewer field that searches authored card names and rules text.",
            )), value: view.filters.query, onChange: (query) => onFiltersChange({ query }), testId: "pool-viewer-search" },
            sort: { ariaLabel: resolve(tx(
              "Sort cards",
              "Accessible name for the Pool Viewer selector that chooses the card property used for sorting.",
            )), value: view.filters.sort, options: view.sortOptions.map((sort) => {
              const sort_field = sortSelector(sort);
              return { value: sort, label: resolve(tx(
              select(sort_field, [
                when("sort-name", "Name"),
                when("sort-card-number", "Number"),
                when("sort-cost", "Cost"),
                when("sort-type", "Type"),
                when("sort-subtype", "Subtype"),
                when("sort-spark", "Spark"),
                otherwise("Spark"),
              ]),
              "Compact visible Pool Viewer sort-field option. The sort selector is a stable card-property key: name, authored card number, Energy cost, card type, authored subtype, or Spark; the fallback preserves the existing label for an unrecognized future key.",
              )) };
            }), onChange: (sort) => onFiltersChange({ sort: sort as PoolViewerSortId }) },
          }}
          cards={galleryCards}
          emptyLabel={emptyLabel}
          presentation={view.frame === "fullScreen" ? "fullScreen" : "embedded"}
          testId="pool-viewer-gallery"
          onCardPress={onCardPress}
          onCardDragStart={onCardDragStart}
          onCardDragEnd={onCardDragEnd}
      />
    </section>
  );
}

function costSelector(value: PoolViewerCostFilter): PoolViewerCostSelector {
  switch (value) {
    case "all": return "cost-all";
    case "0": return "cost-0";
    case "1": return "cost-1";
    case "2": return "cost-2";
    case "3": return "cost-3";
    case "4": return "cost-4";
    case "5plus": return "cost-5plus";
    case "x": return "cost-x";
  }
}

function sortSelector(value: PoolViewerSortId): PoolViewerSortSelector {
  switch (value) {
    case "name": return "sort-name";
    case "cardNumber": return "sort-card-number";
    case "cost": return "sort-cost";
    case "type": return "sort-type";
    case "subtype": return "sort-subtype";
    case "spark": return "sort-spark";
  }
}
