// PoolViewerScreen — the shared Cumulus presentation for the run-pool browser.
//
// The app overlay and floating battle inspector use this same pure screen.  The
// outer controller owns visibility, stateful domain integration, and (for the
// battle) window dragging; this file only renders resolved view data and
// reports stable entry ids through callbacks.

import type { CSSProperties, DragEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import { CardBrowserPanel } from "../components/card/CardBrowserPanel";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../components/card/CardChoiceGrid";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { Select } from "../components/controls/Select";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";

export type PoolViewerSourceId =
  | "run"
  | "tides"
  | "catalog"
  | "idf3"
  | "signature"
  | "deck"
  | "history";

export type PoolViewerSortDirection = "asc" | "desc";
export type PoolViewerTypeFilter = "all" | "character" | "event";
export type PoolViewerCostFilter = "all" | "0" | "1" | "2" | "3" | "4" | "5plus" | "x";

export interface PoolViewerFilterView {
  query: string;
  sort: string;
  direction: PoolViewerSortDirection;
  type: PoolViewerTypeFilter;
  subtype: string;
  cost: PoolViewerCostFilter;
}

export interface PoolViewerSourceOption {
  id: PoolViewerSourceId;
  label: string;
}

export interface PoolViewerReplayCardView {
  entryId: string;
  label: string;
  picked: boolean;
  cardId: string | null;
}

export interface PoolViewerReplayRowView {
  entryId: string;
  title: string;
  summary: string;
  cards: readonly PoolViewerReplayCardView[];
}

export interface PoolViewerDisclosureView {
  id: string;
  title: string;
  summary?: string;
  body: string;
}

export interface PoolViewerView {
  title: string;
  frame: "fullScreen" | "floating";
  source: PoolViewerSourceId;
  sourceOptions: readonly PoolViewerSourceOption[];
  filters: PoolViewerFilterView;
  cards: readonly CardGalleryCardView[];
  totalCount: number;
  visibleCount: number;
  emptyLabel: string;
  sortOptions: readonly { value: string; label: string }[];
  subtypeOptions: readonly { value: string; label: string }[];
  disclosures: readonly PoolViewerDisclosureView[];
  replayRows: readonly PoolViewerReplayRowView[];
  error: string | null;
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
  const [expandedDisclosures, setExpandedDisclosures] = useState<Record<string, boolean>>({});
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sourceOptions = view.sourceOptions.map(({ id, label }) => ({
    value: id,
    label,
  }));
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
          options={[
            { value: "all", label: "All" },
            { value: "character", label: "Characters" },
            { value: "event", label: "Events" },
          ]}
          value={view.filters.type}
          onChange={(type) => onFiltersChange({ type: type as PoolViewerTypeFilter })}
        />
        <SegmentedControl
          size="sm"
          options={[
            { value: "asc", label: "↑", ariaLabel: "Sort ascending" },
            { value: "desc", label: "↓", ariaLabel: "Sort descending" },
          ]}
          value={view.filters.direction}
          onChange={(direction) => onFiltersChange({ direction: direction as PoolViewerSortDirection })}
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.filter}
          ariaLabel="Filter card subtype"
          options={[{ value: "", label: "All subtypes" }, ...view.subtypeOptions]}
          value={view.filters.subtype}
          onChange={(subtype) => onFiltersChange({ subtype })}
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.energy}
          ariaLabel="Filter card cost"
          options={[
            { value: "all", label: "All costs" },
            { value: "0", label: "Cost 0" },
            { value: "1", label: "Cost 1" },
            { value: "2", label: "Cost 2" },
            { value: "3", label: "Cost 3" },
            { value: "4", label: "Cost 4" },
            { value: "5plus", label: "Cost 5+" },
            { value: "x", label: "Cost X" },
          ]}
          value={view.filters.cost}
          onChange={(cost) => onFiltersChange({ cost: cost as PoolViewerCostFilter })}
        />
      </div>
      {view.disclosures.map((disclosure) => (
        <DisclosureSection
          key={disclosure.id}
          title={disclosure.title}
          summary={disclosure.summary}
          expanded={expandedDisclosures[disclosure.id] ?? true}
          onExpandedChange={(expanded) => setExpandedDisclosures((current) => ({ ...current, [disclosure.id]: expanded }))}
          testId={`pool-disclosure-${disclosure.id}`}
        >
          <p style={{ margin: token("--space-s"), font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
            {disclosure.body}
          </p>
        </DisclosureSection>
      ))}
      {view.source === "history" ? (
        <section data-pool-pick-history="" style={{ overflowY: "auto", padding: token("--space-s") }}>
          {view.replayRows.length === 0 ? (
            <p data-pool-empty="" style={{ font: token("--t-body"), color: token("--text-on-glass-muted") }}>{view.emptyLabel}</p>
          ) : view.replayRows.map((row) => (
            <DisclosureSection key={row.entryId} title={row.title} summary={row.summary} expanded={expandedDisclosures[row.entryId] ?? true} onExpandedChange={(expanded) => setExpandedDisclosures((current) => ({ ...current, [row.entryId]: expanded }))} testId={row.entryId}>
              <p style={{ margin: token("--space-s"), font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
                {row.cards.map((card) => `${card.picked ? "✓ " : ""}${card.label}`).join(" · ")}
              </p>
            </DisclosureSection>
          ))}
        </section>
      ) : (
        <CardBrowserPanel
          title={view.title}
          subtitle={`${String(view.visibleCount)} of ${String(view.totalCount)} cards`}
          rightAccessory={{ kind: "iconButton", button: { glyph: GLYPHS.close, label: "Close pool viewer", onPress: onClose, testId: "pool-viewer-close" } }}
          toolbar={{
            search: { label: "Search cards", value: view.filters.query, onChange: (query) => onFiltersChange({ query }), testId: "pool-viewer-search" },
            sort: { ariaLabel: "Sort cards", value: view.filters.sort, options: [...view.sortOptions], onChange: (sort) => onFiltersChange({ sort }) },
          }}
          cards={galleryCards}
          emptyLabel={view.error ?? view.emptyLabel}
          presentation={view.frame === "fullScreen" ? "fullScreen" : "embedded"}
          testId="pool-viewer-gallery"
          onCardPress={onCardPress}
          onCardDragStart={onCardDragStart}
          onCardDragEnd={onCardDragEnd}
        />
      )}
    </section>
  );
}
