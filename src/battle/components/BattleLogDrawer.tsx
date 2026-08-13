import { useMemo, useSyncExternalStore } from "react";
import {
  BattleLogOverlay,
  type BattleLogTurnView,
} from "../../cumulus/screens/battle-overlays/BattleLogOverlay";
import { getLogEntries, subscribeLogEntries } from "../../logging";
import type {
  BattleAiChoiceTrace,
  BattleHistory,
  BattleInit,
  BattleReducerTransition,
} from "../types";
import { assertLocalized } from "@trox/runtime";

const EMPTY_ENTRIES: ReadonlyArray<Readonly<import("../../logging").LogEntry>> = [];
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
  const entries = useSyncExternalStore(
    isOpen ? subscribeLogEntries : subscribeWhenClosed,
    isOpen ? getLogEntries : getEmptyEntries,
    getEmptyEntries,
  );
  const filteredRawEntries = useMemo(
    () => entries.filter((entry) => entry.battleId === battleInit.battleId),
    [battleInit.battleId, entries],
  );
  const turns = useMemo(() => buildTurnViews(history), [history]);
  const rawEntries = useMemo(
    () => filteredRawEntries.map((entry) => {
      const label = readLogText(entry.label) ?? entry.event;
      const turnNumber = readLogText(entry.turnNumber) ?? "-";
      const phase = readLogText(entry.phase) ?? "-";
      return {
        id: `${entry.seq}-${entry.event}`,
        kind: classifyLogKind(entry.event),
        text: assertLocalized(`${turnNumber} · ${phase} · ${label}`),
      };
    }),
    [filteredRawEntries],
  );

  if (!isOpen) {
    return null;
  }

  return <BattleLogOverlay turns={turns} rawEntries={rawEntries} onClose={onClose} />;
}

function buildTurnViews(history: BattleHistory): BattleLogTurnView[] {
  const grouped = new Map<number, BattleLogTurnView["entries"][number][]>();
  for (const entry of history.past) {
    const turnNumber = entry.after.mutable.turnNumber;
    const choiceLabels = (entry.after.lastTransition?.aiChoices ?? []).map((choice) =>
      `${formatAiChoiceLabel(choice)}${choice.heuristicScoreBefore != null && choice.heuristicScoreAfter != null
        ? ` · score ${choice.heuristicScoreBefore.toFixed(1)} → ${choice.heuristicScoreAfter.toFixed(1)}`
        : ""}`,
    );
    const view = {
      id: entry.metadata.commandId,
      title: assertLocalized(entry.metadata.label),
      kind: entry.metadata.kind,
      surface: assertLocalized(entry.metadata.sourceSurface),
      targets: assertLocalized(entry.metadata.targets.map((target) => target.ref).join(", ") || "none"),
      payloadText: entry.metadata.payload === undefined
        ? null
        : assertLocalized(JSON.stringify(entry.metadata.payload, null, 2)),
      eventLabels: (entry.after.lastTransition?.logEvents ?? []).map((event) => assertLocalized(event.event)),
      aiChoiceLabels: choiceLabels.map((label) => assertLocalized(label)),
    };
    grouped.set(turnNumber, [...(grouped.get(turnNumber) ?? []), view]);
  }
  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([turnNumber, entries]) => ({ turnNumber, entries }));
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
