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
import { useMessages } from "../hooks/use-messages";

export type PoolViewerSourceId =
  | "run"
  | "tides"
  | "catalog"
  | "signature"
  | "deck"
  | "history";
export type PoolViewerTitleKind = "pool" | "battle";

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

export interface PoolViewerReplayCardView {
  entryId: string;
  label: string;
  picked: boolean;
  cardId: string | null;
}

export interface PoolViewerReplayRowView {
  entryId: string;
  pickNumber: number;
  pickedCardNames: readonly string[];
  cards: readonly PoolViewerReplayCardView[];
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
  | { id: "record"; recordId: string; sourceFile: string }
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
  sortOptions: readonly string[];
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

interface RuntimeListFormatter {
  format(values: readonly string[]): string;
}

function formatLocalizedList(values: readonly string[]): string {
  const ListFormat = (
    Intl as typeof Intl & {
      ListFormat: new () => RuntimeListFormatter;
    }
  ).ListFormat;
  return new ListFormat().format(values);
}

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
  const t = useMessages();
  const [expandedDisclosures, setExpandedDisclosures] = useState<Record<string, boolean>>({});
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sourceOptions = view.sourceOptions.map((id) => ({
    value: id,
    label: t("card-pool-source-option", { source: id }),
  }));
  const emptyLabel =
    view.error ?? t("card-pool-empty-state", { source: view.source });
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
          options={(["all", "character", "event"] as const).map((value) => ({
            value,
            label: t("card-pool-type-filter-option", { type: value }),
          }))}
          value={view.filters.type}
          onChange={(type) => onFiltersChange({ type: type as PoolViewerTypeFilter })}
        />
        <SegmentedControl
          size="sm"
          options={[
            { value: "asc", label: "↑", ariaLabel: t("card-pool-sort-direction", { direction: "asc" }) },
            { value: "desc", label: "↓", ariaLabel: t("card-pool-sort-direction", { direction: "desc" }) },
          ]}
          value={view.filters.direction}
          onChange={(direction) => onFiltersChange({ direction: direction as PoolViewerSortDirection })}
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.filter}
          ariaLabel={t("card-pool-subtype-filter-label")}
          options={[{ value: "", label: t("card-pool-all-subtypes-option") }, ...view.subtypeOptions]}
          value={view.filters.subtype}
          onChange={(subtype) => onFiltersChange({ subtype })}
        />
        <Select
          size="sm"
          leadingGlyph={GLYPHS.energy}
          ariaLabel={t("card-pool-cost-filter-label")}
          options={(["all", "0", "1", "2", "3", "4", "5plus", "x"] as const).map((value) => ({
            value,
            label: t("card-pool-cost-filter-option", {
              cost: value === "5plus" ? "fivePlus" : value,
            }),
          }))}
          value={view.filters.cost}
          onChange={(cost) => onFiltersChange({ cost: cost as PoolViewerCostFilter })}
        />
      </div>
      {view.disclosures.map((disclosure) => (
        <DisclosureSection
          key={disclosure.id}
          title={
            disclosure.id === "tides"
              ? t("card-pool-tide-provenance-title")
              : disclosure.id === "record"
                ? t("card-pool-replay-record-title")
                : t("card-pool-construction-title")
          }
          summary={
            disclosure.id === "tides"
              ? t("card-pool-tide-provenance-summary", {
                  tideCount: disclosure.tideCount,
                })
              : disclosure.id === "record"
                ? disclosure.recordId
                : t("card-pool-construction-summary", {
                    algorithm: disclosure.variant,
                  })
          }
          expanded={expandedDisclosures[disclosure.id] ?? true}
          onExpandedChange={(expanded) => setExpandedDisclosures((current) => ({ ...current, [disclosure.id]: expanded }))}
          testId={`pool-disclosure-${disclosure.id}`}
        >
          <p style={{ margin: token("--space-s"), font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
            {disclosure.id === "tides"
              ? t("card-pool-tide-provenance-description", {
                  dealSize: disclosure.dealSize,
                  copyCap: disclosure.copyCap,
                  facetDrawnCount: disclosure.facetDrawnCount,
                  facetAvailableCount: disclosure.facetAvailableCount,
                })
              : disclosure.id === "record"
                ? t("card-pool-replay-record-description", {
                    sourceFile: disclosure.sourceFile,
                  })
                : t("card-pool-construction-description")}
          </p>
        </DisclosureSection>
      ))}
      {view.source === "history" ? (
        <section data-pool-pick-history="" style={{ overflowY: "auto", padding: token("--space-s") }}>
          {view.replayRows.length === 0 ? (
            <p data-pool-empty="" style={{ font: token("--t-body"), color: token("--text-on-glass-muted") }}>{emptyLabel}</p>
          ) : view.replayRows.map((row) => (
            <DisclosureSection key={row.entryId} title={t("card-pool-replay-pick-title", { pickNumber: row.pickNumber })} summary={t("card-pool-replay-pick-summary", { hasPicks: row.pickedCardNames.length === 0 ? "no" : "yes", cardList: formatLocalizedList(row.pickedCardNames) })} expanded={expandedDisclosures[row.entryId] ?? true} onExpandedChange={(expanded) => setExpandedDisclosures((current) => ({ ...current, [row.entryId]: expanded }))} testId={row.entryId}>
              <p style={{ margin: token("--space-s"), font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
                {formatLocalizedList(
                  row.cards.map((card) =>
                    t("card-pool-replay-card-label", {
                      picked: card.picked ? "yes" : "no",
                      cardName: card.label,
                    }),
                  ),
                )}
              </p>
            </DisclosureSection>
          ))}
        </section>
      ) : (
        <CardBrowserPanel
          title={t("card-pool-viewer-title", { context: view.title })}
          subtitle={t("card-pool-browser-count", {
            visibleCount: view.visibleCount,
            totalCount: view.totalCount,
          })}
          rightAccessory={{ kind: "iconButton", button: { glyph: GLYPHS.close, label: t("card-pool-close-action"), onPress: onClose, testId: "pool-viewer-close" } }}
          toolbar={{
            search: { label: t("card-pool-search-label"), value: view.filters.query, onChange: (query) => onFiltersChange({ query }), testId: "pool-viewer-search" },
            sort: { ariaLabel: t("card-pool-sort-label"), value: view.filters.sort, options: view.sortOptions.map((value) => ({ value, label: t("card-pool-sort-option", { sort: value }) })), onChange: (sort) => onFiltersChange({ sort }) },
          }}
          cards={galleryCards}
          emptyLabel={emptyLabel}
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
