import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { GlassButton } from "../../cumulus/components/controls/GlassButton";
import { DisclosureSection } from "../../cumulus/components/controls/DisclosureSection";
import { GlassDialog } from "../../cumulus/components/overlay/GlassDialog";
import { token } from "../../cumulus/primitives/tokens";
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
    <GlassDialog
      title="Battle Log"
      subtitle="Folded battle history and raw diagnostic events."
      closeLabel="Close battle log"
      onClose={onClose}
      desktopCenterTarget="battlefield"
    >
      <div className="cumulus" data-battle-log-drawer="" data-battle-region="battle-log" style={{ display: "grid", gap: token("--space-5") }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-2") }}>
          {HISTORY_KINDS.map((kind) => (
            <GlassButton
              key={kind}
              label={kind}
              placement="onGlass"
              variant={enabledKinds.has(kind) ? "accent" : "default"}
              testId={`battle-log-filter-${kind}`}
              onPress={() => setEnabledKinds((current) => toggleKind(current, kind))}
            />
          ))}
        </div>
        <div ref={listRef} style={{ display: "grid", gap: token("--space-3"), maxHeight: "58vh", overflowY: "auto" }}>
          {groupedHistoryEntries.length === 0 ? (
            <p style={{ color: token("--text-on-glass-muted"), font: token("--t-body") }}>No matching history entries.</p>
          ) : groupedHistoryEntries.map((group) => {
            const turnKey = String(group.turnNumber);
            const isTurnExpanded = expandedTurns[turnKey] ?? true;
            return (
              <DisclosureSection
                key={turnKey}
                title={`Turn ${turnKey}`}
                summary={`${String(group.entries.length)} entries`}
                expanded={isTurnExpanded}
                onExpandedChange={(expanded) => setExpandedTurns((current) => ({ ...current, [turnKey]: expanded }))}
                testId={`battle-log-turn-${turnKey}`}
              >
                <div style={{ display: "grid", gap: token("--space-3"), paddingTop: token("--space-3") }}>
                  {group.entries.map((entry) => {
                    const entryKey = `${entry.metadata.timestamp}-${entry.metadata.commandId}`;
                    const isExpanded = expandedEntries[entryKey] ?? false;
                    return (
                      <DisclosureSection
                        key={entryKey}
                        title={entry.metadata.label}
                        summary={entry.metadata.kind}
                        expanded={isExpanded}
                        onExpandedChange={(expanded) => setExpandedEntries((current) => ({ ...current, [entryKey]: expanded }))}
                        testId={`battle-log-history-entry-${entry.metadata.commandId}`}
                      >
                        <div style={{ display: "grid", gap: token("--space-2"), paddingTop: token("--space-3"), color: token("--text-on-glass-muted"), font: token("--t-body-sm") }}>
                          <span>Surface: {entry.metadata.sourceSurface}</span>
                          <span>Targets: {entry.metadata.targets.map((target) => target.ref).join(", ") || "none"}</span>
                          {entry.metadata.payload === undefined ? null : <pre style={{ margin: 0, overflowX: "auto", color: token("--text-on-glass"), font: token("--t-caption") }}>{JSON.stringify(entry.metadata.payload, null, 2)}</pre>}
                          {entry.after.lastTransition?.logEvents.map((event, index) => <span key={`${event.event}-${String(index)}`}>{event.event}</span>)}
                          {entry.after.lastTransition?.aiChoices.map((choice, index) => (
                            <span key={`ai-choice-${String(index)}`}>
                              {formatAiChoiceLabel(choice)}{choice.heuristicScoreBefore != null && choice.heuristicScoreAfter != null ? ` · score ${choice.heuristicScoreBefore.toFixed(1)} → ${choice.heuristicScoreAfter.toFixed(1)}` : ""}
                            </span>
                          ))}
                        </div>
                      </DisclosureSection>
                    );
                  })}
                </div>
              </DisclosureSection>
            );
          })}
          <DisclosureSection title="Raw Events" summary={`${String(filteredRawEntries.length)} captured`} expanded={expandedRaw} onExpandedChange={setExpandedRaw} testId="battle-log-raw-events">
            <div style={{ display: "grid", gap: token("--space-2"), paddingTop: token("--space-3"), color: token("--text-on-glass-muted"), font: token("--t-caption") }}>
              {filteredRawEntries.length === 0 ? <span>No raw events.</span> : filteredRawEntries.map((entry) => {
                const label = readLogText(entry.label) ?? entry.event;
                const turnNumber = readLogText(entry.turnNumber) ?? "-";
                const phase = readLogText(entry.phase) ?? "-";
                return <span key={`${entry.seq}-${entry.event}`} data-battle-log-raw-kind={classifyLogKind(entry.event)}>{turnNumber} · {phase} · {label}</span>;
              })}
            </div>
          </DisclosureSection>
        </div>
      </div>
    </GlassDialog>
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
