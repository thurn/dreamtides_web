import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { DisclosureSection } from "../../components/controls/DisclosureSection";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";

export type BattleLogHistoryKind =
  | "numeric-state"
  | "card-instance"
  | "zone-move"
  | "battlefield-position"
  | "visibility"
  | "battle-flow"
  | "result";

export interface BattleLogHistoryEntryView {
  readonly id: string;
  readonly title: string;
  readonly kind: BattleLogHistoryKind;
  readonly surface: string;
  readonly targets: string;
  readonly payloadText: string | null;
  readonly eventLabels: readonly string[];
  readonly aiChoiceLabels: readonly string[];
}

export interface BattleLogTurnView {
  readonly turnNumber: number;
  readonly entries: readonly BattleLogHistoryEntryView[];
}

export interface BattleRawLogEntryView {
  readonly id: string;
  readonly kind: "ai" | "debug" | "judgment" | "info";
  readonly text: string;
}

export interface BattleLogOverlayProps {
  readonly turns: readonly BattleLogTurnView[];
  readonly rawEntries: readonly BattleRawLogEntryView[];
  readonly onClose: () => void;
}

const HISTORY_KINDS: readonly BattleLogHistoryKind[] = [
  "numeric-state",
  "card-instance",
  "zone-move",
  "battlefield-position",
  "visibility",
  "battle-flow",
  "result",
];

/** Pure Cumulus presentation for folded battle history and diagnostic events. */
export function BattleLogOverlay({
  turns,
  rawEntries,
  onClose,
}: BattleLogOverlayProps): ReactElement {
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [expandedRaw, setExpandedRaw] = useState(false);
  const [enabledKinds, setEnabledKinds] = useState<ReadonlySet<BattleLogHistoryKind>>(
    () => new Set(HISTORY_KINDS),
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const visibleTurns = useMemo(
    () => turns
      .map((turn) => ({
        ...turn,
        entries: turn.entries.filter((entry) => enabledKinds.has(entry.kind)),
      }))
      .filter((turn) => turn.entries.length > 0),
    [enabledKinds, turns],
  );

  useEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ top: list.scrollHeight });
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [visibleTurns]);

  return (
    <GlassDialog
      title="Battle Log"
      subtitle="Folded battle history and raw diagnostic events."
      closeLabel="Close battle log"
      onClose={onClose}
      desktopCenterTarget="battlefield"
    >
      <div
        className="cumulus"
        data-battle-log-drawer=""
        data-battle-region="battle-log"
        style={{ display: "grid", gap: token("--space-m") }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: token("--space-xs"),
          }}
        >
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
        <div
          ref={listRef}
          style={{
            display: "grid",
            gap: token("--space-xs"),
            maxHeight: "58vh",
            overflowY: "auto",
          }}
        >
          {visibleTurns.length === 0 ? (
            <p
              style={{
                color: token("--text-on-glass-muted"),
                font: token("--t-body"),
              }}
            >
              No matching history entries.
            </p>
          ) : (
            visibleTurns.map((turn) => {
              const turnKey = String(turn.turnNumber);
              const isTurnExpanded = expandedTurns[turnKey] ?? true;
              return (
                <DisclosureSection
                  key={turnKey}
                  title={`Turn ${turnKey}`}
                  summary={`${String(turn.entries.length)} entries`}
                  expanded={isTurnExpanded}
                  placement="onGlass"
                  onExpandedChange={(expanded) =>
                    setExpandedTurns((current) => ({
                      ...current,
                      [turnKey]: expanded,
                    }))
                  }
                  testId={`battle-log-turn-${turnKey}`}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: token("--space-xs"),
                      paddingTop: token("--space-xs"),
                    }}
                  >
                    {turn.entries.map((entry) => {
                      const isExpanded = expandedEntries[entry.id] ?? false;
                      return (
                        <DisclosureSection
                          key={entry.id}
                          title={entry.title}
                          summary={entry.kind}
                          expanded={isExpanded}
                          placement="onGlass"
                          onExpandedChange={(expanded) =>
                            setExpandedEntries((current) => ({
                              ...current,
                              [entry.id]: expanded,
                            }))
                          }
                          testId={`battle-log-history-entry-${entry.id}`}
                        >
                          <div
                            style={{
                              display: "grid",
                              gap: token("--space-xs"),
                              paddingTop: token("--space-xs"),
                              color: token("--text-on-glass-muted"),
                              font: token("--t-body-sm"),
                            }}
                          >
                            <span>Surface: {entry.surface}</span>
                            <span>Targets: {entry.targets}</span>
                            {entry.payloadText === null ? null : (
                              <pre
                                style={{
                                  margin: 0,
                                  overflowX: "auto",
                                  color: token("--text-on-glass"),
                                  font: token("--t-caption"),
                                }}
                              >
                                {entry.payloadText}
                              </pre>
                            )}
                            {entry.eventLabels.map((label, index) => (
                              <span key={`${label}-${String(index)}`}>{label}</span>
                            ))}
                            {entry.aiChoiceLabels.map((label, index) => (
                              <span key={`ai-choice-${String(index)}`}>{label}</span>
                            ))}
                          </div>
                        </DisclosureSection>
                      );
                    })}
                  </div>
                </DisclosureSection>
              );
            })
          )}
          <DisclosureSection
            title="Raw Events"
            summary={`${String(rawEntries.length)} captured`}
            expanded={expandedRaw}
            placement="onGlass"
            onExpandedChange={setExpandedRaw}
            testId="battle-log-raw-events"
          >
            <div
              style={{
                display: "grid",
                gap: token("--space-xs"),
                paddingTop: token("--space-xs"),
                color: token("--text-on-glass-muted"),
                font: token("--t-caption"),
              }}
            >
              {rawEntries.length === 0 ? (
                <span>No raw events.</span>
              ) : (
                rawEntries.map((entry) => (
                  <span key={entry.id} data-battle-log-raw-kind={entry.kind}>
                    {entry.text}
                  </span>
                ))
              )}
            </div>
          </DisclosureSection>
        </div>
      </div>
    </GlassDialog>
  );
}

function toggleKind(
  current: ReadonlySet<BattleLogHistoryKind>,
  kind: BattleLogHistoryKind,
): ReadonlySet<BattleLogHistoryKind> {
  const next = new Set(current);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  return next.size === 0 ? new Set(HISTORY_KINDS) : next;
}
