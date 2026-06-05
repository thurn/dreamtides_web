import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getLogEntries, subscribeLogEntries } from "../../logging";
import type {
  BattleAiChoiceTrace,
  BattleHistory,
  BattleHistoryEntry,
  BattleHistoryEntryKind,
  BattleInit,
  BattleReducerTransition,
} from "../types";

const EMPTY_ENTRIES: ReadonlyArray<Readonly<import("../../logging").LogEntry>> = [];
const HISTORY_KINDS: readonly BattleHistoryEntryKind[] = [
  "numeric-state",
  "card-instance",
  "zone-move",
  "battlefield-position",
  "visibility",
  "battle-flow",
  "result",
] as const;

export function BattleLogDrawer({
  battleInit,
  futureCount: _futureCount,
  history,
  isOpen,
  lastTransition: _lastTransition,
  onClose,
}: {
  battleInit: BattleInit;
  futureCount: number;
  history: BattleHistory;
  isOpen: boolean;
  lastTransition: BattleReducerTransition | null;
  onClose: () => void;
}) {
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [expandedRaw, setExpandedRaw] = useState(false);
  const [enabledKinds, setEnabledKinds] = useState<ReadonlySet<BattleHistoryEntryKind>>(
    () => new Set(HISTORY_KINDS),
  );
  const entries = useSyncExternalStore(
    isOpen ? subscribeLogEntries : subscribeWhenClosed,
    isOpen ? getLogEntries : getEmptyEntries,
    getEmptyEntries,
  );
  const filteredRawEntries = useMemo(
    () => entries.filter((entry) => entry.battleId === battleInit.battleId),
    [battleInit.battleId, entries],
  );
  const groupedHistoryEntries = useMemo(
    () => groupHistoryEntries(history.past, enabledKinds),
    [enabledKinds, history.past],
  );
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const list = listRef.current;
    if (list === null) {
      return;
    }
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ top: list.scrollHeight });
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [groupedHistoryEntries, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setExpandedEntries({});
      setExpandedTurns({});
      setExpandedRaw(false);
      setEnabledKinds(new Set(HISTORY_KINDS));
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className="log-drawer rich"
      data-battle-log-drawer=""
      data-battle-region="battle-log"
    >
      <div className="lg-head">
        <b>Battle log</b>
        <button type="button" className="btn ghost sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="lg-filters">
        {HISTORY_KINDS.map((kind) => {
          const enabled = enabledKinds.has(kind);
          return (
            <button
              key={kind}
              type="button"
              data-battle-log-filter={kind}
              className={`chip ${enabled ? "active" : ""}`}
              onClick={() => setEnabledKinds((current) => toggleKind(current, kind))}
            >
              {kind}
            </button>
          );
        })}
      </div>
      <div ref={listRef} className="lg-list rich">
        {groupedHistoryEntries.length === 0 ? (
          <div className="log-empty">No matching history entries.</div>
        ) : groupedHistoryEntries.map((group) => {
          const turnKey = String(group.turnNumber);
          const isTurnExpanded = expandedTurns[turnKey] ?? true;
          return (
            <section key={turnKey} className="log-turn-group">
              <button
                type="button"
                className="log-turn-header"
                onClick={() => setExpandedTurns((current) => ({
                  ...current,
                  [turnKey]: !isTurnExpanded,
                }))}
              >
                <span>Turn {turnKey}</span>
                <span>{isTurnExpanded ? "Collapse" : "Expand"}</span>
              </button>
              {isTurnExpanded ? group.entries.map((entry) => {
                const entryKey = `${entry.metadata.timestamp}-${entry.metadata.commandId}`;
                const isExpanded = expandedEntries[entryKey] ?? false;
                return (
                  <div key={entryKey} className={`log-history-entry ${entry.metadata.kind}`}>
                    <button
                      type="button"
                      data-battle-log-history-entry={entry.metadata.commandId}
                      className="log-history-summary"
                      onClick={() => setExpandedEntries((current) => ({
                        ...current,
                        [entryKey]: !isExpanded,
                      }))}
                    >
                      <span className="history-label">{entry.metadata.label}</span>
                      <span className="history-kind">{entry.metadata.kind}</span>
                    </button>
                    {isExpanded ? (
                      <div className="log-history-details">
                        <div className="detail-line">
                          <span>Surface</span>
                          <strong>{entry.metadata.sourceSurface}</strong>
                        </div>
                        <div className="detail-line">
                          <span>Targets</span>
                          <strong>{entry.metadata.targets.map((target) => target.ref).join(", ") || "none"}</strong>
                        </div>
                        {entry.metadata.payload === undefined ? null : (
                          <pre>{JSON.stringify(entry.metadata.payload, null, 2)}</pre>
                        )}
                        {entry.after.lastTransition?.logEvents.length ? (
                          <div className="transition-events">
                            {entry.after.lastTransition.logEvents.map((event, index) => (
                              <div key={`${event.event}-${String(index)}`} className="transition-event">
                                <span>{event.event}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {entry.after.lastTransition?.aiChoices.length ? (
                          <div className="transition-ai-choices">
                            {entry.after.lastTransition.aiChoices.map((choice, index) => (
                              <div key={`ai-choice-${String(index)}`} className="ai-choice">
                                <span className="ai-choice-label">{formatAiChoiceLabel(choice)}</span>
                                {choice.heuristicScoreBefore != null && choice.heuristicScoreAfter != null ? (
                                  <span className="ai-choice-score">
                                    {`score ${choice.heuristicScoreBefore.toFixed(1)} → ${choice.heuristicScoreAfter.toFixed(1)}`}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }) : null}
            </section>
          );
        })}
        <section className="log-raw-section">
          <button
            type="button"
            className="log-turn-header"
            onClick={() => setExpandedRaw((current) => !current)}
          >
            <span>Raw Events</span>
            <span>{expandedRaw ? "Collapse" : "Expand"}</span>
          </button>
          {expandedRaw ? (
            <div className="raw-events">
              {filteredRawEntries.length === 0 ? (
                <div className="log-empty">No raw events.</div>
              ) : filteredRawEntries.map((entry) => {
                const label = readLogText(entry.label) ?? entry.event;
                const turnNumber = readLogText(entry.turnNumber) ?? "-";
                const phase = readLogText(entry.phase) ?? "-";
                const kind = classifyLogKind(entry.event);
                return (
                  <div key={`${entry.seq}-${entry.event}`} className={`log-entry ${kind}`}>
                    {turnNumber} · {phase} · {label}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

function groupHistoryEntries(
  entries: readonly BattleHistoryEntry[],
  enabledKinds: ReadonlySet<BattleHistoryEntryKind>,
): Array<{
  turnNumber: number;
  entries: BattleHistoryEntry[];
}> {
  const grouped = new Map<number, BattleHistoryEntry[]>();
  for (const entry of entries) {
    if (!enabledKinds.has(entry.metadata.kind)) {
      continue;
    }
    const turnNumber = entry.after.mutable.turnNumber;
    const bucket = grouped.get(turnNumber);
    if (bucket === undefined) {
      grouped.set(turnNumber, [entry]);
      continue;
    }
    bucket.push(entry);
  }
  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([turnNumber, turnEntries]) => ({
      turnNumber,
      entries: turnEntries,
    }));
}

function toggleKind(
  current: ReadonlySet<BattleHistoryEntryKind>,
  kind: BattleHistoryEntryKind,
): ReadonlySet<BattleHistoryEntryKind> {
  const next = new Set(current);
  if (next.has(kind)) {
    next.delete(kind);
  } else {
    next.add(kind);
  }
  return next.size === 0 ? new Set(HISTORY_KINDS) : next;
}

function formatAiChoiceLabel(choice: BattleAiChoiceTrace): string {
  if (choice.rationale != null && choice.rationale.length > 0) {
    return choice.rationale;
  }
  const parts: string[] = [choice.stage, choice.choice];
  if (choice.cardName != null) {
    parts.push(choice.cardName);
  }
  return parts.join(" · ");
}

function classifyLogKind(event: string): "ai" | "debug" | "judgment" | "info" {
  if (event.includes("judgment")) {
    return "judgment";
  }
  if (event.includes("ai")) {
    return "ai";
  }
  if (
    event.includes("debug") ||
    event.includes("history") ||
    event.includes("command") ||
    event.includes("reward")
  ) {
    return "debug";
  }

  return "info";
}

function readLogText(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function subscribeWhenClosed(): () => void {
  return () => undefined;
}

function getEmptyEntries(): ReadonlyArray<Readonly<import("../../logging").LogEntry>> {
  return EMPTY_ENTRIES;
}
