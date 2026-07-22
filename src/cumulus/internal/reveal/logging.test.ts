import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../../logging";
import { logRevealClosed, logRevealOpened } from "./logging";

const rectangle = { x: 1, y: 2, width: 100, height: 120 } as const;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetLog();
});

describe("reveal diagnostic logging", () => {
  it("logs the complete immutable open decision snapshot", () => {
    const geometry = {
      viewport: { layout: "mobile", width: 390, height: 844, offsetLeft: 7, offsetTop: 13, safeArea: { top: 12, right: 0, bottom: 20, left: 0 } },
      sourceRect: rectangle,
      touchPoint: { x: 30, y: 40 },
      placement: { family: "touch-corner", orientation: "primary-right" },
      finalRects: { primary: rectangle, secondaries: [rectangle], adjacents: [rectangle] },
      circleClearance: -3,
    } as const;
    logRevealOpened({
      source: { entityType: "card", entityId: "00000000-0000-4000-8000-000000000001" },
      interactionId: 7,
      primary: { kind: "gameCard", variant: "complete" },
      secondaryVariants: ["text", "icon"], modality: "touch", reason: "press",
      adjacentCardIds: ["00000000-0000-4000-8000-000000000003"],
      geometry, shownSecondaryCount: 1, droppedSecondaryCount: 1,
      shownAdjacentCount: 1, droppedAdjacentCount: 0,
      fallbacks: { pressInPlace: false, sideFallback: true, secondaryTruncation: true, adjacentTruncation: false, bestEffortPrimaryOverlap: true },
    });
    expect(getLogEntries()[getLogEntries().length - 1]).toMatchObject({
      event: "cumulus_entity_reveal_opened", sourceEntityType: "card",
      interactionId: 7,
      sourceEntityId: "00000000-0000-4000-8000-000000000001",
      primaryKind: "gameCard", primaryVariant: "complete",
      secondaryVariants: ["text", "icon"], viewport: geometry.viewport,
      adjacentCardIds: ["00000000-0000-4000-8000-000000000003"],
      modality: "touch", reason: "press", sourceRect: rectangle,
      touchPoint: { x: 30, y: 40 }, placement: geometry.placement,
      finalRects: geometry.finalRects, shownSecondaryCount: 1,
      droppedSecondaryCount: 1, fallbacks: {
        pressInPlace: false, sideFallback: true, secondaryTruncation: true,
        adjacentTruncation: false,
        bestEffortPrimaryOverlap: true,
      },
      shownAdjacentCount: 1, droppedAdjacentCount: 0,
      circleClearance: -3,
    });
  });

  it("logs dismissal and activation outcome on close", () => {
    logRevealClosed({
      source: { entityType: "site", entityId: "00000000-0000-4000-8000-000000000002" },
      interactionId: 8, reason: "focus",
      dismissalReason: "scroll", activationOutcome: "suppressed-cancelled",
    });
    expect(getLogEntries()[getLogEntries().length - 1]).toMatchObject({
      event: "cumulus_entity_reveal_closed", dismissalReason: "scroll",
      interactionId: 8, reason: "focus",
      activationOutcome: "suppressed-cancelled",
    });
  });
});
