import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../../logging";
import { testCardId, testSemanticEntityId } from "../../../types/test-identities";
import { feedbackForRect } from "./feedback";
import { revealEntityId } from "./identity";
import { logRevealClosed, logRevealOpened } from "./logging";
import type { RevealCoordinatorEvent, RevealCoordinatorSource, RevealSourceIdentity } from "./model";
import { initialRevealCoordinatorState, reduceRevealState } from "./state-machine";

const A: RevealSourceIdentity = {
  entityType: "game-card",
  entityId: testSemanticEntityId("00000000-0000-4000-8000-000000000001"),
};
const B: RevealSourceIdentity = {
  entityType: "site",
  entityId: testSemanticEntityId("00000000-0000-4000-8000-000000000002"),
};
const SA: RevealCoordinatorSource = { identity: A, registrationId: "cumulus-reveal-source-a" };
const SB: RevealCoordinatorSource = { identity: B, registrationId: "cumulus-reveal-source-b" };

function run(...events: RevealCoordinatorEvent[]) {
  return events.reduce(reduceRevealState, initialRevealCoordinatorState);
}

describe("reveal interaction state machine", () => {
  it("starts idle", () => {
    expect(initialRevealCoordinatorState).toMatchObject({ phase: "idle", activeSource: null });
  });

  it("opens immediately for mouse and a hover-capable pen, replacing the active source", () => {
    const state = run(
      { type: "pointer-enter", source: SA, pointerType: "mouse", hoverCapable: true, timestamp: 1 },
      { type: "pointer-enter", source: SB, pointerType: "pen", hoverCapable: true, timestamp: 2 },
    );
    expect(state).toMatchObject({ phase: "hover", activeSource: B, reason: "hover" });
  });

  it("does not treat a contact pen as hovering", () => {
    expect(run({ type: "pointer-enter", source: SA, pointerType: "pen", hoverCapable: false, timestamp: 1 })).toEqual(initialRevealCoordinatorState);
  });

  it("opens on keyboard focus", () => {
    expect(run({ type: "focus", source: SA, timestamp: 1 })).toMatchObject({
      phase: "focus", activeSource: A, reason: "focus",
    });
  });

  it("keeps touch pending for 30ms and then reveals", () => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: SA, pointerType: "touch", pointerId: 1,
      point: { x: 20, y: 30 }, hasAction: true, timestamp: 100,
    };
    expect(run(down, { type: "intent-elapsed", pointerId: 1, timestamp: 129 }).phase).toBe("touch-pending");
    expect(run(down, { type: "intent-elapsed", pointerId: 1, timestamp: 130 })).toMatchObject({
      phase: "touch-reveal", activeSource: A, reason: "press",
    });
  });

  it("fires an available action on quick release and suppresses one at the inclusive hold boundary", () => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: SA, pointerType: "touch", pointerId: 1,
      point: { x: 0, y: 0 }, hasAction: true, timestamp: 100,
    };
    expect(run(down, { type: "pointer-up", pointerId: 1, timestamp: 399 }).activationOutcome).toBe("fired");
    expect(run(down, { type: "pointer-up", pointerId: 1, timestamp: 400 }).activationOutcome).toBe("suppressed-hold");
    expect(run(down, { type: "pointer-up", pointerId: 1, timestamp: 450 }).activationOutcome).toBe("suppressed-hold");
  });

  it("suppresses activation for a source with no action", () => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: SA, pointerType: "touch", pointerId: 1,
      point: { x: 0, y: 0 }, hasAction: false, timestamp: 0,
    };
    expect(run(down, { type: "intent-elapsed", pointerId: 1, timestamp: 30 }).phase).toBe("touch-reveal");
    const state = run(down, { type: "pointer-up", pointerId: 1, timestamp: 20 });
    expect(state.activationOutcome).toBe("suppressed-no-action");
  });

  it("allows movement at 10px and cancels beyond 10px", () => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: SA, pointerType: "touch", pointerId: 7,
      point: { x: 10, y: 10 }, hasAction: true, timestamp: 0,
    };
    expect(run(down, { type: "pointer-move", pointerId: 7, point: { x: 16, y: 18 }, timestamp: 5 }).phase).toBe("touch-pending");
    expect(run(down, { type: "pointer-move", pointerId: 7, point: { x: 21, y: 10 }, timestamp: 5 })).toMatchObject({
      phase: "idle", dismissalReason: "movement", activationOutcome: "suppressed-cancelled",
    });
  });

  it("keeps an owned touch reveal open when pointer capture makes the source receive pointer-leave", () => {
    const down = run({
      type: "pointer-down", source: SA, pointerType: "touch", pointerId: 7,
      point: { x: 10, y: 10 }, hasAction: true, timestamp: 0,
    });

    const left = reduceRevealState(down, {
      type: "pointer-leave", source: SA, pointerId: 7, timestamp: 40,
    });

    expect(left).toEqual(down);
    expect(reduceRevealState(left, {
      type: "pointer-up", pointerId: 7, timestamp: 50,
    })).toMatchObject({
      phase: "idle", dismissalReason: "release", activationOutcome: "fired",
    });
  });

  it.each([
    ["scroll", "scroll"], ["drag", "drag"], ["pointer-cancel", "pointer-cancel"],
    ["resize", "resize"],
    ["orientation-change", "orientation-change"], ["window-blur", "window-blur"],
    ["route-change", "route-change"],
  ] as const)("dismisses and cancels touch on %s", (type, reason) => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: SA, pointerType: "touch", pointerId: 1,
      point: { x: 0, y: 0 }, hasAction: true, timestamp: 0,
    };
    const event = type === "pointer-cancel"
      ? { type, pointerId: 1, timestamp: 40 }
      : { type, timestamp: 40 };
    expect(run(down, event as RevealCoordinatorEvent)).toMatchObject({
      phase: "idle", dismissalReason: reason, activationOutcome: "suppressed-cancelled",
    });
  });

  it("dismisses when the active source unmounts", () => {
    expect(run(
      { type: "focus", source: SA, timestamp: 0 },
      { type: "source-unmount", source: SA, timestamp: 1 },
    )).toMatchObject({ phase: "idle", dismissalReason: "source-unmount" });
  });

  it("gives the first touch ownership and never requests pointer capture", () => {
    const state = run(
      { type: "pointer-down", source: SA, pointerType: "touch", pointerId: 1, point: { x: 0, y: 0 }, hasAction: true, timestamp: 0 },
      { type: "pointer-down", source: SB, pointerType: "touch", pointerId: 2, point: { x: 1, y: 1 }, hasAction: true, timestamp: 1 },
    );
    expect(state.activeSource).toEqual(A);
    expect(state.touch?.pointerId).toBe(1);
    expect(state.capturePointer).toBe(false);
  });

  it("ignores pointer-up and cancellation from a non-owner", () => {
    const owned = run({
      type: "pointer-down", source: SA, pointerType: "touch", pointerId: 1,
      point: { x: 0, y: 0 }, hasAction: true, timestamp: 0,
    });
    expect(reduceRevealState(owned, { type: "pointer-up", pointerId: 2, timestamp: 10 })).toEqual(owned);
    expect(reduceRevealState(owned, { type: "pointer-cancel", pointerId: 2, timestamp: 10 })).toEqual(owned);
  });

  it("keeps hover while mouse press feedback takes precedence", () => {
    const state = run(
      { type: "pointer-enter", source: SA, pointerType: "mouse", hoverCapable: true, timestamp: 0 },
      { type: "pointer-down", source: SA, pointerType: "mouse", pointerId: 1, point: { x: 0, y: 0 }, hasAction: true, timestamp: 1 },
    );
    expect(state).toMatchObject({ phase: "hover", pressed: true, activeSource: A });
  });

  it("clears fine-pointer press on owner release and dismisses on owner cancellation", () => {
    const pressed = run(
      { type: "pointer-enter", source: SA, pointerType: "mouse", hoverCapable: true, timestamp: 0 },
      { type: "pointer-down", source: SA, pointerType: "mouse", pointerId: 9, point: { x: 0, y: 0 }, hasAction: true, timestamp: 1 },
    );
    expect(reduceRevealState(pressed, { type: "pointer-up", pointerId: 8, timestamp: 2 })).toEqual(pressed);
    expect(reduceRevealState(pressed, { type: "pointer-up", pointerId: 9, timestamp: 2 })).toMatchObject({ phase: "hover", pressed: false });
    expect(reduceRevealState(pressed, { type: "pointer-cancel", pointerId: 9, timestamp: 2 })).toMatchObject({ phase: "idle", pressed: false, dismissalReason: "pointer-cancel" });
  });

  it("lets hover replace focus and restores focus when hover ends", () => {
    const state = run(
      { type: "focus", source: SA, timestamp: 0 },
      { type: "pointer-enter", source: SB, pointerType: "mouse", hoverCapable: true, timestamp: 1 },
      { type: "pointer-leave", pointerId: 2, source: SB, timestamp: 2 },
    );
    expect(state).toMatchObject({ phase: "focus", activeSource: A });
  });

  it("restores an eligible focused reveal when the active hover source unmounts", () => {
    const state = run(
      { type: "focus", source: SA, timestamp: 0 },
      { type: "pointer-enter", source: SB, pointerType: "mouse", hoverCapable: true, timestamp: 1 },
      { type: "source-unmount", source: SB, timestamp: 2 },
    );
    expect(state).toMatchObject({
      phase: "focus",
      activeSource: A,
      activeRegistrationId: SA.registrationId,
      focusedSource: SA,
    });
  });

  it("does not restore an Escape-suppressed focus when the hover source unmounts", () => {
    const state = run(
      { type: "focus", source: SA, timestamp: 0 },
      { type: "escape", timestamp: 1 },
      { type: "pointer-enter", source: SB, pointerType: "mouse", hoverCapable: true, timestamp: 2 },
      { type: "source-unmount", source: SB, timestamp: 3 },
    );
    expect(state).toMatchObject({ phase: "idle", activeSource: null, focusedSource: SA, escapeSuppressedSource: SA });
  });

  it("suppresses Escape until focus leaves and visits again", () => {
    const state = run(
      { type: "focus", source: SA, timestamp: 0 },
      { type: "escape", timestamp: 1 },
      { type: "focus", source: SA, timestamp: 2 },
      { type: "blur", source: SA, timestamp: 3 },
      { type: "focus", source: SA, timestamp: 4 },
    );
    expect(state).toMatchObject({ phase: "focus", activeSource: A, escapeSuppressedSource: null });
  });
});

describe("reveal diagnostic logging", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    resetLog();
  });

  it("logs the complete immutable open decision snapshot", () => {
    const rectangle = { x: 1, y: 2, width: 100, height: 120 } as const;
    const geometry = {
      viewport: { layout: "mobile", width: 390, height: 844, offsetLeft: 7, offsetTop: 13, safeArea: { top: 12, right: 0, bottom: 20, left: 0 } },
      sourceRect: rectangle,
      touchPoint: { x: 30, y: 40 },
      placement: { family: "mobile-touch-corner", orientation: "primary-right" },
      finalRects: { primary: rectangle, secondaries: [rectangle], adjacents: [rectangle] },
      circleClearance: -3,
    } as const;
    logRevealOpened({
      source: { entityType: "game-card", entityId: testSemanticEntityId("00000000-0000-4000-8000-000000000001") },
      interactionId: 7,
      primary: { kind: "gameCard", variant: "complete" },
      secondaryVariants: ["text", "icon"], modality: "touch", reason: "press",
      adjacentCardIds: [testCardId("00000000-0000-4000-8000-000000000003")],
      geometry, shownSecondaryCount: 1, droppedSecondaryCount: 1,
      shownAdjacentCount: 1, droppedAdjacentCount: 0,
      fallbacks: { pressInPlace: false, sideFallback: true, secondaryTruncation: true, adjacentTruncation: false, bestEffortPrimaryOverlap: true },
    });
    expect(getLogEntries()[getLogEntries().length - 1]).toMatchObject({
      event: "cumulus_entity_reveal_opened", sourceEntityType: "game-card",
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
      source: { entityType: "site", entityId: testSemanticEntityId("00000000-0000-4000-8000-000000000002") },
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

describe("reveal feedback", () => {
  it("scales interactive sources and keeps stationary readable sources still", () => {
    const rect = { width: 100, height: 200 };
    const scaled = feedbackForRect(rect, "scale");
    expect(scaled.pressScale).toBeLessThan(1);
    expect(scaled.hoverScale).toBeGreaterThan(1);
    expect(feedbackForRect(rect, "stationary")).toEqual({ pressScale: 1, hoverScale: 1 });
  });
});

describe("revealEntityId", () => {
  it("preserves UUIDs and deterministically derives RFC 4122 UUIDs", () => {
    const uuid = "12345678-1234-4abc-8def-1234567890ab";
    expect(revealEntityId("tide", uuid)).toBe(uuid);
    expect(revealEntityId("tide", "stable-id")).toBe(revealEntityId("tide", "stable-id"));
    expect(revealEntityId("tide", "stable-id")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps exact case-sensitive stable-id material distinct", () => {
    expect(revealEntityId("tide", "Tide-A")).not.toBe(revealEntityId("tide", "tide-a"));
  });

  it("has no collisions across a representative compatibility-id sample", () => {
    const ids = Array.from({ length: 2_000 }, (_, index) =>
      revealEntityId("tide", `entity-${String(index)}`),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
