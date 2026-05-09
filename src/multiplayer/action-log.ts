import { ACTION_LOG_LIMIT, type ActionLogEntry } from "./room-types";

export function buildActionLogEntry({
  actorId,
  action,
  source,
  summary,
  timestamp = new Date().toISOString(),
}: {
  actorId: string;
  action: string;
  source: string;
  summary: Record<string, unknown>;
  timestamp?: string;
}): ActionLogEntry {
  return {
    timestamp,
    actorId,
    action,
    source,
    summary,
  };
}

export function pruneActionLog(
  entries: Record<string, ActionLogEntry>,
  limit: number = ACTION_LOG_LIMIT,
): Record<string, ActionLogEntry> {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([leftId, left], [rightId, right]) => {
        const timestampOrder = left.timestamp.localeCompare(right.timestamp);
        return timestampOrder === 0 ? leftId.localeCompare(rightId) : timestampOrder;
      })
      .slice(-limit),
  );
}
