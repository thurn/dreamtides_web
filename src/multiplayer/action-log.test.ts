import { describe, expect, it } from "vitest";
import { buildActionLogEntry, pruneActionLog } from "./action-log";

describe("action log helpers", () => {
  it("builds an action log entry", () => {
    expect(
      buildActionLogEntry({
        actorId: "client-1",
        action: "startQuest",
        source: "quest_start",
        summary: { dreamcallerId: "caller-1" },
        timestamp: "2026-05-08T12:00:00.000Z",
      }),
    ).toEqual({
      timestamp: "2026-05-08T12:00:00.000Z",
      actorId: "client-1",
      action: "startQuest",
      source: "quest_start",
      summary: { dreamcallerId: "caller-1" },
    });
  });

  it("prunes 55 entries to the newest 50", () => {
    const entries = Object.fromEntries(
      Array.from({ length: 55 }, (_, index) => {
        const actionNumber = index + 1;
        return [
          `action-${actionNumber}`,
          buildActionLogEntry({
            actorId: "client-1",
            action: "testAction",
            source: "test",
            summary: { actionNumber },
            timestamp: `2026-05-08T12:${String(index).padStart(2, "0")}:00.000Z`,
          }),
        ];
      }),
    );

    const pruned = pruneActionLog(entries);

    expect(Object.keys(pruned)).toHaveLength(50);
    expect(pruned["action-1"]).toBeUndefined();
    expect(pruned["action-5"]).toBeUndefined();
    expect(pruned["action-6"]?.timestamp).toBe("2026-05-08T12:05:00.000Z");
    expect(pruned["action-55"]?.timestamp).toBe("2026-05-08T12:54:00.000Z");
  });

  it("uses action id as the tie-breaker for matching timestamps", () => {
    const entries = Object.fromEntries(
      ["action-a", "action-c", "action-b"].map((actionId) => [
        actionId,
        buildActionLogEntry({
          actorId: "client-1",
          action: "testAction",
          source: "test",
          summary: { actionId },
          timestamp: "2026-05-08T12:00:00.000Z",
        }),
      ]),
    );

    expect(Object.keys(pruneActionLog(entries, 2))).toEqual(["action-b", "action-c"]);
  });
});
