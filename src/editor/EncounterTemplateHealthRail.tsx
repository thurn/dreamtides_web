import { useMemo, useState } from "react";
import { GlassButton } from "../cumulus/components/controls/GlassButton";
import { SegmentedControl } from "../cumulus/components/controls/SegmentedControl";
import { DeveloperRail } from "../cumulus/components/overlay/DeveloperRail";
import { GLYPHS } from "../cumulus/primitives/glyph";
import type {
  EncounterTemplateHealth,
  EncounterTemplateHealthEntry,
  EncounterTemplateHealthStatus,
} from "./encounter-editor-types";

export const TEMPLATE_HEALTH_RAIL_ID = "encounter-template-health";

type TemplateHealthFilter = "outliers" | "unused" | "candidates";
type TemplateHealthLoadState = "idle" | "loading" | "ready" | "error";

const STATUS_LABELS: Record<EncounterTemplateHealthStatus, string> = {
  hidden: "Hidden",
  warning: "Warning",
  reintroduced: "Reintroduced",
  unused: "Unused",
  available: "Candidate",
};

function reasonLabel(entry: EncounterTemplateHealthEntry): string {
  if (entry.status === "unused") return "Never used";
  if (entry.reasons.includes("rank_1") && entry.reasons.includes("overall")) return "Rank 1 + all ranks";
  if (entry.reasons.includes("rank_1")) return "Rank 1";
  if (entry.reasons.includes("overall")) return "All ranks";
  return "Balanced usage";
}

function countStatus(
  health: EncounterTemplateHealth,
  status: EncounterTemplateHealthStatus,
): number {
  return health.templates.filter((entry) => entry.status === status).length;
}

function candidatesFor(
  health: EncounterTemplateHealth,
  filter: TemplateHealthFilter,
): EncounterTemplateHealthEntry[] {
  const filtered = health.templates.filter((entry) => {
    if (filter === "outliers") {
      return ["hidden", "warning", "reintroduced"].includes(entry.status);
    }
    if (filter === "unused") return entry.status === "unused";
    return entry.status !== "hidden";
  });
  const statusOrder: Record<EncounterTemplateHealthStatus, number> = {
    hidden: 0,
    reintroduced: 1,
    warning: 2,
    unused: 3,
    available: 4,
  };
  return filtered.sort((left, right) => {
    if (filter === "candidates") {
      return left.rankOneUsageCount - right.rankOneUsageCount
        || left.usageCount - right.usageCount
        || left.templateId - right.templateId;
    }
    return statusOrder[left.status] - statusOrder[right.status]
      || right.rankOneUsageCount - left.rankOneUsageCount
      || right.usageCount - left.usageCount
      || left.templateId - right.templateId;
  });
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
  const [filter, setFilter] = useState<TemplateHealthFilter>("outliers");
  const entries = useMemo(
    () => health === null ? [] : candidatesFor(health, filter),
    [filter, health],
  );
  const isLoading = loadState === "loading";
  const subtitle = health === null
    ? isLoading ? "Reading current candidate balance…" : "Candidate balance unavailable"
    : `${String(health.completedCards)} cards · ${String(health.catalogTemplateCount)} templates${isLoading ? " · refreshing…" : ""}`;

  function chooseFilter(next: string) {
    const selected = next as TemplateHealthFilter;
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
          <section className="encounter-template-health-priority" aria-labelledby="template-health-priority-heading">
            <div className="encounter-template-health-section-heading">
              <span>Primary signal</span>
              <h2 id="template-health-priority-heading">Rank-1 diversity</h2>
            </div>
            <div className="encounter-template-health-metric-grid">
              <div>
                <strong>{health.recordedRankOneTemplateUses}</strong>
                <span>rank-1 uses</span>
                <small>Mean {health.meanRankOneUsesPerTemplate.toFixed(2)}</small>
              </div>
              <div>
                <strong>{health.rankOneSoftWarningThreshold} / {health.rankOneOmissionThreshold}</strong>
                <span>warn / hide</span>
                <small>Per template</small>
              </div>
              <div>
                <strong>{health.recordedTemplateUses}</strong>
                <span>all-rank uses</span>
                <small>Mean {health.meanUsesPerTemplate.toFixed(2)}</small>
              </div>
              <div>
                <strong>{health.softWarningThreshold} / {health.omissionThreshold}</strong>
                <span>warn / hide</span>
                <small>Per template</small>
              </div>
            </div>
            <p>{health.guidance}</p>
          </section>

          <section className="encounter-template-health-statuses" aria-label="Template status counts">
            {(["hidden", "warning", "reintroduced", "unused"] as const).map((status) => (
              <div key={status} data-template-health-status={status}>
                <strong>{countStatus(health, status)}</strong>
                <span>{STATUS_LABELS[status]}</span>
              </div>
            ))}
          </section>

          <SegmentedControl
            options={[
              { value: "outliers", label: "Outliers" },
              { value: "unused", label: "Unused" },
              { value: "candidates", label: "Candidates" },
            ]}
            value={filter}
            onChange={chooseFilter}
            size="sm"
            full
          />

          <section className="encounter-template-health-results" aria-live="polite">
            <div className="encounter-template-health-results-heading">
              <h2>{filter === "outliers" ? "Outliers" : filter === "unused" ? "Unused templates" : "Selectable candidates"}</h2>
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
                    <strong>{STATUS_LABELS[entry.status]}</strong>
                  </header>
                  <p>{entry.template}</p>
                  <footer>
                    <span><strong>{entry.rankOneUsageCount}</strong> rank 1</span>
                    <span><strong>{entry.usageCount}</strong> all ranks</span>
                    <span>{reasonLabel(entry)}</span>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </DeveloperRail>
  );
}
