import { describe, expect, it } from "vitest";
import {
  initialRevealCoordinatorState,
  reduceRevealState,
} from "./state-machine";
import type { RevealCoordinatorEvent, RevealSourceIdentity } from "./model";

const A: RevealSourceIdentity = {
  entityType: "card",
  entityId: "00000000-0000-4000-8000-000000000001",
};
const B: RevealSourceIdentity = {
  entityType: "site",
  entityId: "00000000-0000-4000-8000-000000000002",
};

function run(...events: RevealCoordinatorEvent[]) {
  return events.reduce(reduceRevealState, initialRevealCoordinatorState);
}

describe("reveal interaction state machine", () => {
  it("starts idle", () => {
    expect(initialRevealCoordinatorState).toMatchObject({ phase: "idle", activeSource: null });
  });

  it("opens immediately for mouse and a hover-capable pen, replacing the active source", () => {
    const state = run(
      { type: "pointer-enter", source: A, pointerType: "mouse", hoverCapable: true, timestamp: 1 },
      { type: "pointer-enter", source: B, pointerType: "pen", hoverCapable: true, timestamp: 2 },
    );
    expect(state).toMatchObject({ phase: "hover", activeSource: B, reason: "hover" });
  });

  it("opens on keyboard focus", () => {
    expect(run({ type: "focus", source: A, timestamp: 1 })).toMatchObject({
      phase: "focus", activeSource: A, reason: "focus",
    });
  });

  it("keeps touch pending for 30ms and then reveals", () => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: A, pointerType: "touch", pointerId: 1,
      point: { x: 20, y: 30 }, hasAction: true, timestamp: 100,
    };
    expect(run(down, { type: "intent-elapsed", pointerId: 1, timestamp: 129 }).phase).toBe("touch-pending");
    expect(run(down, { type: "intent-elapsed", pointerId: 1, timestamp: 130 })).toMatchObject({
      phase: "touch-reveal", activeSource: A, reason: "press",
    });
  });

  it("fires an available action on quick release and suppresses one at the inclusive hold boundary", () => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: A, pointerType: "touch", pointerId: 1,
      point: { x: 0, y: 0 }, hasAction: true, timestamp: 100,
    };
    expect(run(down, { type: "pointer-up", pointerId: 1, timestamp: 399 }).activationOutcome).toBe("fired");
    expect(run(down, { type: "pointer-up", pointerId: 1, timestamp: 400 }).activationOutcome).toBe("suppressed-hold");
    expect(run(down, { type: "pointer-up", pointerId: 1, timestamp: 450 }).activationOutcome).toBe("suppressed-hold");
  });

  it("suppresses activation for a source with no action", () => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: A, pointerType: "touch", pointerId: 1,
      point: { x: 0, y: 0 }, hasAction: false, timestamp: 0,
    };
    expect(run(down, { type: "intent-elapsed", pointerId: 1, timestamp: 30 }).phase).toBe("touch-reveal");
    const state = run(down, { type: "pointer-up", pointerId: 1, timestamp: 20 });
    expect(state.activationOutcome).toBe("suppressed-no-action");
  });

  it("allows movement at 10px and cancels beyond 10px", () => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: A, pointerType: "touch", pointerId: 7,
      point: { x: 10, y: 10 }, hasAction: true, timestamp: 0,
    };
    expect(run(down, { type: "pointer-move", pointerId: 7, point: { x: 16, y: 18 }, timestamp: 5 }).phase).toBe("touch-pending");
    expect(run(down, { type: "pointer-move", pointerId: 7, point: { x: 21, y: 10 }, timestamp: 5 })).toMatchObject({
      phase: "idle", dismissalReason: "movement", activationOutcome: "suppressed-cancelled",
    });
  });

  it.each([
    ["scroll", "scroll"], ["drag", "drag"], ["pointer-cancel", "pointer-cancel"],
    ["pointer-leave", "pointer-leave"], ["resize", "resize"],
    ["orientation-change", "orientation-change"], ["window-blur", "window-blur"],
    ["route-change", "route-change"],
  ] as const)("dismisses and cancels touch on %s", (type, reason) => {
    const down: RevealCoordinatorEvent = {
      type: "pointer-down", source: A, pointerType: "touch", pointerId: 1,
      point: { x: 0, y: 0 }, hasAction: true, timestamp: 0,
    };
    const event = type === "pointer-cancel" || type === "pointer-leave"
      ? { type, pointerId: 1, timestamp: 40 }
      : { type, timestamp: 40 };
    expect(run(down, event as RevealCoordinatorEvent)).toMatchObject({
      phase: "idle", dismissalReason: reason, activationOutcome: "suppressed-cancelled",
    });
  });

  it("dismisses when the active source unmounts", () => {
    expect(run(
      { type: "focus", source: A, timestamp: 0 },
      { type: "source-unmount", source: A, timestamp: 1 },
    )).toMatchObject({ phase: "idle", dismissalReason: "source-unmount" });
  });

  it("gives the first touch ownership and never requests pointer capture", () => {
    const state = run(
      { type: "pointer-down", source: A, pointerType: "touch", pointerId: 1, point: { x: 0, y: 0 }, hasAction: true, timestamp: 0 },
      { type: "pointer-down", source: B, pointerType: "touch", pointerId: 2, point: { x: 1, y: 1 }, hasAction: true, timestamp: 1 },
    );
    expect(state.activeSource).toEqual(A);
    expect(state.touch?.pointerId).toBe(1);
    expect(state.capturePointer).toBe(false);
  });

  it("keeps hover while mouse press feedback takes precedence", () => {
    const state = run(
      { type: "pointer-enter", source: A, pointerType: "mouse", hoverCapable: true, timestamp: 0 },
      { type: "pointer-down", source: A, pointerType: "mouse", pointerId: 1, point: { x: 0, y: 0 }, hasAction: true, timestamp: 1 },
    );
    expect(state).toMatchObject({ phase: "hover", pressed: true, activeSource: A });
  });

  it("lets hover replace focus and restores focus when hover ends", () => {
    const state = run(
      { type: "focus", source: A, timestamp: 0 },
      { type: "pointer-enter", source: B, pointerType: "mouse", hoverCapable: true, timestamp: 1 },
      { type: "pointer-leave", pointerId: 2, source: B, timestamp: 2 },
    );
    expect(state).toMatchObject({ phase: "focus", activeSource: A });
  });

  it("suppresses Escape until focus leaves and visits again", () => {
    const state = run(
      { type: "focus", source: A, timestamp: 0 },
      { type: "escape", timestamp: 1 },
      { type: "focus", source: A, timestamp: 2 },
      { type: "blur", source: A, timestamp: 3 },
      { type: "focus", source: A, timestamp: 4 },
    );
    expect(state).toMatchObject({ phase: "focus", activeSource: A, escapeSuppressedSource: null });
  });
});
