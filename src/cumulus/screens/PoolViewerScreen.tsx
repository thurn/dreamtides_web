// PoolViewerScreen — the Cumulus presentation for the full-screen run-pool
// browser overlay.
//
// The outer adapter owns visibility and stateful domain integration; this file
// only renders semantic view data and reports stable entry ids through
// callbacks.

import type { CSSProperties, ReactElement } from "react";
import {
  parseCardSubtype,
  type CardSubtype,
} from "../../types/card-identity";
import { useEffect, useState } from "react";
import { CardBrowserPanel } from "../components/card/CardBrowserPanel";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../components/card/CardChoiceGrid";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { Select } from "../components/controls/Select";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { DeckEntryId } from "../../types/identifiers";
import { formatNumber } from "../../runtime/format-number";

export type PoolViewerSourceId = "run" | "tides" | "catalog" | "signature";

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
  subtype: CardSubtype | "";
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

export type PoolViewerDisclosureId = PoolViewerDisclosureView["id"];

export interface PoolViewerView {
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
  onCardPress: (entryId: DeckEntryId) => void;
}

const rootStyle: CSSProperties = {
  minHeight: "100vh",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  color: token("--text-on-glass"),
  position: "fixed",
  inset: 0,
  zIndex: 60,
  background: token("--scrim-gallery"),
  overflowY: "auto",
};

const controlsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: token("--space-s"),
  padding: token("--space-s"),
};

/** Pure full-screen pool viewer overlay. */
export function PoolViewerScreen({
  view,
  onClose,
  onSourceChange,
  onFiltersChange,
  onCardPress,
}: PoolViewerScreenProps): ReactElement {
  const [expandedDisclosures, setExpandedDisclosures] = useState<
    ReadonlyMap<PoolViewerDisclosureId, boolean>
  >(() => new Map());
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

  return (
    <section className="cumulus" data-pool-viewer="overlay" style={rootStyle}>
      <div style={controlsStyle} data-pool-viewer-controls="">
        <SegmentedControl
          size="sm"
          options={sourceOptions}
          value={view.source}
          onChange={(value) => {
            const source = view.sourceOptions.find(
              (candidate) => candidate === value,
            );
            if (source !== undefined) onSourceChange(source);
          }}
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
                ? "↑"
                : "↓",
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
          ariaLabel={"Filter card subtype"}
          options={[
            {
              value: "",
              label: "All subtypes",
            },
            ...view.subtypeOptions.map((option) => ({
              value: option.value,
              label: option.label,
            })),
          ]}
          value={view.filters.subtype}
          onChange={(subtype) =>
            onFiltersChange({
              subtype: subtype === "" ? "" : parseCardSubtype(subtype),
            })
          }
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.energy}
          ariaLabel={"Filter card cost"}
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
            onFiltersChange({ cost })
          }
        />
      </div>
      {view.disclosures.map((disclosure) => (
        <DisclosureSection
          key={disclosure.id}
          title={
            disclosure.id === "tides"
              ? "Tide provenance"
              : "Pool construction"
          }
          summary={
            disclosure.id === "tides"
              ? (disclosure.tideCount === 1 ? `${formatNumber(disclosure.tideCount)} Tide` : `${formatNumber(disclosure.tideCount)} Tides`)
              : `Algorithm: ${disclosure.variant}`
          }
          expanded={expandedDisclosures.get(disclosure.id) ?? true}
          onExpandedChange={(expanded) =>
            setExpandedDisclosures((current) =>
              new Map(current).set(disclosure.id, expanded),
            )
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
              ? (disclosure.dealSize === 1 ? `Built to ${formatNumber(disclosure.dealSize)} Card with a per-card copy cap of ${formatNumber(disclosure.copyCap)}; ${formatNumber(disclosure.facetDrawnCount)} of ${formatNumber(disclosure.facetAvailableCount)} theme Tides were drawn.` : `Built to ${formatNumber(disclosure.dealSize)} Cards with a per-card copy cap of ${formatNumber(disclosure.copyCap)}; ${formatNumber(disclosure.facetDrawnCount)} of ${formatNumber(disclosure.facetAvailableCount)} theme Tides were drawn.`)
              : "The active run pool is shown with its remaining copies."}
          </p>
        </DisclosureSection>
      ))}
      <CardBrowserPanel
        title="Pool Viewer"
        subtitle={(view.totalCount === 1 ? `${formatNumber(view.visibleCount)} of ${formatNumber(view.totalCount)} Card` : `${formatNumber(view.visibleCount)} of ${formatNumber(view.totalCount)} Cards`)}
        rightAccessory={{
          kind: "iconButton",
          button: {
            glyph: GLYPHS.close,
            label: "Close pool viewer",
            onPress: onClose,
            testId: "pool-viewer-close",
          },
        }}
        toolbar={{
          search: {
            label: "Search cards",
            value: view.filters.query,
            onChange: (query) => onFiltersChange({ query }),
            testId: "pool-viewer-search",
          },
          sort: {
            ariaLabel: "Sort cards",
            value: view.filters.sort,
            options: view.sortOptions.map((sort) => {
              return { value: sort, label: sortFieldLabel(sort) };
            }),
            onChange: (value) => {
              const sort = view.sortOptions.find(
                (candidate) => candidate === value,
              );
              if (sort !== undefined) onFiltersChange({ sort });
            },
          },
        }}
        cards={view.cards}
        emptyLabel={emptySourceLabel(view.source)}
        presentation="fullScreen"
        testId="pool-viewer-gallery"
        onCardPress={onCardPress}
      />
    </section>
  );
}

function sourceOptionLabel(source: PoolViewerSourceId): string {
  switch (source) {
    case "run":
      return "Run Pool";
    case "tides":
      return "Tide Decks";
    case "catalog":
      return "All Cards";
    case "signature":
      return "Signature Cards";
  }
}

function emptySourceLabel(source: PoolViewerSourceId): string {
  switch (source) {
    case "run":
      return "No run pool cards are available.";
    case "tides":
      return "This run has no Tide decks.";
    case "catalog":
      return "No cards match the current filters.";
    case "signature":
      return "This avatar has no signature cards.";
  }
}

function typeFilterLabel(cardType: PoolViewerTypeFilter): string {
  switch (cardType) {
    case "all":
      return "All";
    case "character":
      return "Characters";
    case "event":
      return "Events";
  }
}

function sortDirectionLabel(
  direction: PoolViewerSortDirection,
): string {
  switch (direction) {
    case "asc":
      return "Sort ascending";
    case "desc":
      return "Sort descending";
  }
}

function costFilterLabel(cost: PoolViewerCostFilter): string {
  switch (cost) {
    case "all":
    case "0":
    case "1":
    case "2":
    case "3":
    case "4":
      return "All costs";
    case "5plus":
      return "Cost 5+";
    case "x":
      return "Cost X";
  }
}

function sortFieldLabel(sort: PoolViewerSortId): string {
  switch (sort) {
    case "name":
      return "Name";
    case "cardNumber":
      return "Number";
    case "cost":
      return "Cost";
    case "type":
      return "Type";
    case "subtype":
      return "Subtype";
    case "spark":
      return "Spark";
  }
}
