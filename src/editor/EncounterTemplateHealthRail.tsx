import { useMemo, useState } from "react";
import { GlassButton } from "../cumulus/components/controls/GlassButton";
import { DeveloperRail } from "../cumulus/components/overlay/DeveloperRail";
import { GLYPHS } from "../cumulus/primitives/glyph";
import type {
  EncounterTemplateHealth,
  EncounterTemplateHealthEntry,
  EncounterTemplateHealthStatus,
} from "./exploration-candidates-editor-types";
import "./encounter-template-health-rail.css";

export const TEMPLATE_HEALTH_RAIL_ID = "encounter-template-health";

type TemplateHealthFilter = "selectable" | "unused" | "hidden" | "all";
type TemplateHealthLoadState = "idle" | "loading" | "ready" | "error";

const STATUS_LABELS: Record<EncounterTemplateHealthStatus, string> = {
  hidden: "Hidden",
  warning: "Warning",
  reintroduced: "Reintroduced",
  unused: "Unused",
  available: "Available",
};

function pluralUses(count: number): string {
  return `${String(count)} production ${count === 1 ? "use" : "uses"}`;
}

function isSelectable(entry: EncounterTemplateHealthEntry): boolean {
  return entry.status !== "hidden";
}

function countStatus(
  health: EncounterTemplateHealth,
  status: EncounterTemplateHealthStatus,
): number {
  return health.templates.filter((entry) => entry.status === status).length;
}

function selectableCount(health: EncounterTemplateHealth): number {
  return health.templates.filter(isSelectable).length;
}

function entriesFor(
  health: EncounterTemplateHealth,
  filter: TemplateHealthFilter,
): EncounterTemplateHealthEntry[] {
  const filtered = health.templates.filter((entry) => {
    if (filter === "selectable") return isSelectable(entry);
    if (filter === "unused") return entry.status === "unused";
    if (filter === "hidden") return !isSelectable(entry);
    return true;
  });
  if (filter === "selectable" || filter === "unused") {
    return filtered.sort((left, right) =>
      left.usageCount - right.usageCount || left.templateId - right.templateId);
  }
  if (filter === "hidden") {
    return filtered.sort((left, right) =>
      right.usageCount - left.usageCount || left.templateId - right.templateId);
  }
  return filtered.sort((left, right) => left.templateId - right.templateId);
}

function statusExplanation(
  status: EncounterTemplateHealthStatus,
  requiredTemplateCount: number,
): string {
  if (status === "unused") return "Selectable · no production uses";
  if (status === "available") return "Selectable · below the warning threshold";
  if (status === "warning") return "Selectable · use only for a stronger fit";
  if (status === "reintroduced") {
    return `Selectable · restored to keep at least ${String(requiredTemplateCount)} choices`;
  }
  return "Not selectable · reached its hide threshold";
}

function entryRule(
  entry: EncounterTemplateHealthEntry,
  health: EncounterTemplateHealth,
): string {
  if (entry.status === "unused") {
    return "Never used; prefer it when the fit is comparable.";
  }
  if (entry.status === "reintroduced") {
    return `It reached a hide threshold, then returned to preserve at least ${String(health.requiredTemplateCount)} selectable templates.`;
  }
  if (entry.balanceClass === "unique_effect") {
    return `Unique effect: hidden after ${String(health.uniqueEffectOmissionThreshold)} production use.`;
  }
  if (entry.status === "warning") {
    return `Standard template: warning at ${String(health.softWarningThreshold)}, hidden at ${String(health.omissionThreshold)} uses.`;
  }
  if (entry.status === "hidden") {
    return `Standard template: hidden at ${String(health.omissionThreshold)} production uses.`;
  }
  return `Standard template: below the warning threshold of ${String(health.softWarningThreshold)} use.`;
}

export function EncounterTemplateHealthRail({
  health,
  loadState,
  loadMessage,
  onClose,
  onRefresh,
  onFilterChange,
}: {
  health: EncounterTemplateHealth | null;
  loadState: TemplateHealthLoadState;
  loadMessage: string;
  onClose: () => void;
  onRefresh: () => void;
  onFilterChange: (filter: TemplateHealthFilter) => void;
}) {
  const [filter, setFilter] = useState<TemplateHealthFilter>("selectable");
  const entries = useMemo(
    () => health === null ? [] : entriesFor(health, filter),
    [filter, health],
  );
  const isLoading = loadState === "loading";
  const subtitle = health === null
    ? isLoading ? "Reading current template balance…" : "Template balance unavailable"
    : `${String(health.recordedTemplateUses)} uses across ${String(health.productionEncounters)} production encounters${isLoading ? " · refreshing…" : ""}`;

  function chooseFilter(selected: TemplateHealthFilter) {
    setFilter(selected);
    onFilterChange(selected);
  }

  return (
    <DeveloperRail
      id={TEMPLATE_HEALTH_RAIL_ID}
      side="right"
      title="Template Health"
      subtitle={subtitle}
      onClose={onClose}
      testId="encounter-template-health-rail"
      headerAction={{
        glyph: GLYPHS.refresh,
        label: "Refresh template health",
        onPress: onRefresh,
        disabled: isLoading,
        testId: "refresh-template-health",
      }}
    >
      {health === null ? (
        <div className="encounter-template-health-empty">
          <p>{loadState === "error" ? loadMessage : "Calculating current template usage…"}</p>
          {loadState === "error" && (
            <GlassButton
              label="Try again"
              placement="onGlass"
              onPress={onRefresh}
            />
          )}
        </div>
      ) : (
        <div className="encounter-template-health-content">
          <section className="encounter-template-health-overview" aria-labelledby="template-health-overview-heading">
            <div className="encounter-template-health-section-heading">
              <span>Selection overview</span>
              <h2 id="template-health-overview-heading">What can be chosen now</h2>
            </div>
            <div className="encounter-template-health-selection-grid">
              <div data-template-selection-state="selectable">
                <strong>{selectableCount(health)}</strong>
                <span>Selectable</span>
                <small>Can appear in a new design</small>
              </div>
              <div data-template-selection-state="hidden">
                <strong>{countStatus(health, "hidden")}</strong>
                <span>Hidden</span>
                <small>Temporarily excluded</small>
              </div>
            </div>
            <p>Every template is either selectable or hidden. Selectable templates may still carry usage guidance.</p>
          </section>

          <section className="encounter-template-health-breakdown" aria-labelledby="template-health-breakdown-heading">
            <div className="encounter-template-health-section-heading">
              <span>Status guide</span>
              <h2 id="template-health-breakdown-heading">Why a template has its status</h2>
            </div>
            {(["unused", "available", "warning", "reintroduced", "hidden"] as const).map((status) => (
              <div key={status} data-template-health-status={status}>
                <strong>{countStatus(health, status)}</strong>
                <span>{STATUS_LABELS[status]}</span>
                <small>{statusExplanation(status, health.requiredTemplateCount)}</small>
              </div>
            ))}
          </section>

          <section className="encounter-template-health-policy" aria-labelledby="template-health-policy-heading">
            <div className="encounter-template-health-section-heading">
              <span>Thresholds</span>
              <h2 id="template-health-policy-heading">How hiding works</h2>
            </div>
            <dl>
              <div>
                <dt>Standard templates</dt>
                <dd>Warn at {health.softWarningThreshold}; hide at {health.omissionThreshold} uses.</dd>
              </div>
              <div>
                <dt>Unique effects</dt>
                <dd>Hide after {health.uniqueEffectOmissionThreshold} use.</dd>
              </div>
              <div>
                <dt>Reintroduced</dt>
                <dd>A hidden template restored only when fewer than {health.requiredTemplateCount} choices would remain.</dd>
              </div>
            </dl>
          </section>

          <div
            className="encounter-template-health-filters"
            role="group"
            aria-label="Filter templates"
          >
            {([
              ["selectable", `Selectable (${String(selectableCount(health))})`],
              ["unused", `Unused (${String(countStatus(health, "unused"))})`],
              ["hidden", `Hidden (${String(countStatus(health, "hidden"))})`],
              ["all", `All (${String(health.catalogTemplateCount)})`],
            ] as const).map(([value, label]) => (
              <GlassButton
                key={value}
                label={label}
                placement="onGlass"
                size="compact"
                pressed={filter === value}
                testId={`template-health-filter-${value}`}
                onPress={() => chooseFilter(value)}
              />
            ))}
          </div>

          <section
            className="encounter-template-health-results"
            data-template-health-filter={filter}
            aria-live="polite"
          >
            <div className="encounter-template-health-results-heading">
              <h2>{filter === "selectable" ? "Selectable templates" : filter === "unused" ? "Unused templates" : filter === "hidden" ? "Hidden templates" : "All templates"}</h2>
              <span>{entries.length}</span>
            </div>
            <div className="encounter-template-health-list">
              {entries.map((entry) => (
                <article
                  className="encounter-template-health-entry"
                  data-template-health-status={entry.status}
                  data-template-id={entry.templateId}
                  key={entry.templateId}
                >
                  <header>
                    <span>Template {entry.templateId}</span>
                    <strong>{isSelectable(entry) ? "Selectable" : "Hidden"}</strong>
                  </header>
                  <p>{entry.template}</p>
                  <footer>
                    <span><strong>{pluralUses(entry.usageCount)}</strong></span>
                    <span>{STATUS_LABELS[entry.status]}</span>
                  </footer>
                  <p className="encounter-template-health-rule">{entryRule(entry, health)}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </DeveloperRail>
  );
}
