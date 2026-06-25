import { describe, expect, it } from "vitest";
import type { QuestState } from "../types/quest";
import {
  actionLogPath,
  buildMetadataUpdate,
  buildQuestFieldUpdate,
  presencePath,
  questStatePath,
  roomLogsPath,
  roomPath,
} from "./room-paths";

describe("room path helpers", () => {
  it("builds stable Firebase paths", () => {
    expect(roomPath("ab12")).toBe("rooms/ab12");
    expect(questStatePath("ab12")).toBe("rooms/ab12/questState");
    expect(presencePath("ab12", "client-1")).toBe("rooms/ab12/presence/client-1");
    expect(actionLogPath("ab12", "action-1")).toBe("rooms/ab12/actionLog/action-1");
    expect(roomLogsPath("ab12")).toBe("rooms/ab12/logs");
  });

  it("rejects unsafe Firebase path segments", () => {
    expect(() => roomPath("bad/room")).toThrow("roomId must be a non-empty Firebase path segment.");
    expect(() => roomPath("bad$room")).toThrow("roomId must be a non-empty Firebase path segment.");
    expect(() => roomPath("bad[room")).toThrow("roomId must be a non-empty Firebase path segment.");
    expect(() => roomPath("bad]room")).toThrow("roomId must be a non-empty Firebase path segment.");
    expect(() => presencePath("ab12", "client.1")).toThrow("clientId must be a non-empty Firebase path segment.");
    expect(() => actionLogPath("ab12", "action#1")).toThrow("actionId must be a non-empty Firebase path segment.");
    expect(() => presencePath("ab12", "client\n1")).toThrow("clientId must be a non-empty Firebase path segment.");
    expect(() => actionLogPath("ab12", "action\u007f1")).toThrow("actionId must be a non-empty Firebase path segment.");
    expect(() => roomPath("a".repeat(769))).toThrow("roomId must be a non-empty Firebase path segment.");
  });

  it("builds focused quest field updates", () => {
    const update = buildQuestFieldUpdate("ab12", "essence", 375, "2026-05-08T12:00:00.000Z");

    expect(update).toEqual({
      "rooms/ab12/questState/essence": 375,
      "rooms/ab12/metadata/updatedAt": "2026-05-08T12:00:00.000Z",
    });
    expect(Object.keys(update)).not.toContain("rooms/ab12/questState");
  });

  it("accepts any top-level quest state field", () => {
    const screen: QuestState["screen"] = { type: "atlas" };

    expect(buildQuestFieldUpdate("ab12", "screen", screen, "2026-05-08T12:00:00.000Z")).toEqual({
      "rooms/ab12/questState/screen": { type: "atlas" },
      "rooms/ab12/metadata/updatedAt": "2026-05-08T12:00:00.000Z",
    });
  });

  it("builds metadata-only updates", () => {
    expect(buildMetadataUpdate("ab12", "2026-05-08T12:00:00.000Z")).toEqual({
      "rooms/ab12/metadata/updatedAt": "2026-05-08T12:00:00.000Z",
    });
  });
});
