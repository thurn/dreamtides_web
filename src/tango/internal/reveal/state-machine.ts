import type {
  RevealActivationOutcome, RevealCoordinatorEvent, RevealCoordinatorState,
  RevealDismissalReason, RevealSourceIdentity,
} from "./model";

export const REVEAL_INTENT_MS = 30;
export const REVEAL_HOLD_MS = 300;
export const REVEAL_MOVEMENT_SLOP_PX = 10;

export const initialRevealCoordinatorState: RevealCoordinatorState = {
  phase: "idle", activeSource: null, reason: null, focusedSource: null,
  hoveredSource: null, escapeSuppressedSource: null, touch: null,
  pressed: false, capturePointer: false, dismissalReason: null,
  activationOutcome: "none",
};

function sameSource(a: RevealSourceIdentity | null, b: RevealSourceIdentity | null): boolean {
  return a !== null && b !== null && a.entityType === b.entityType && a.entityId === b.entityId;
}

function restoreFocus(state: RevealCoordinatorState, reason: RevealDismissalReason): RevealCoordinatorState {
  if (state.focusedSource !== null && !sameSource(state.focusedSource, state.escapeSuppressedSource)) {
    return { ...state, phase: "focus", activeSource: state.focusedSource, reason: "focus", hoveredSource: null, touch: null, pressed: false, dismissalReason: reason };
  }
  return { ...state, phase: "idle", activeSource: null, reason: null, hoveredSource: null, touch: null, pressed: false, dismissalReason: reason };
}

function cancel(state: RevealCoordinatorState, reason: RevealDismissalReason): RevealCoordinatorState {
  const activationOutcome: RevealActivationOutcome = state.touch === null ? state.activationOutcome : "suppressed-cancelled";
  return { ...restoreFocus(state, reason), activationOutcome };
}

function dismissLifecycle(state: RevealCoordinatorState, reason: RevealDismissalReason): RevealCoordinatorState {
  return {
    ...state, phase: "idle", activeSource: null, reason: null, hoveredSource: null,
    touch: null, pressed: false, dismissalReason: reason,
    activationOutcome: state.touch === null ? state.activationOutcome : "suppressed-cancelled",
  };
}

export function reduceRevealState(state: RevealCoordinatorState, event: RevealCoordinatorEvent): RevealCoordinatorState {
  switch (event.type) {
    case "pointer-enter":
      if (event.pointerType === "touch" || !event.hoverCapable || state.touch !== null) return state;
      return { ...state, phase: "hover", activeSource: event.source, hoveredSource: event.source, reason: "hover", dismissalReason: state.activeSource === null || sameSource(state.activeSource, event.source) ? state.dismissalReason : "replaced", activationOutcome: "none" };
    case "pointer-down":
      if (event.pointerType !== "touch") {
        return sameSource(state.activeSource, event.source) ? { ...state, pressed: true } : state;
      }
      if (state.touch !== null) return state;
      return { ...state, phase: "touch-pending", activeSource: event.source, reason: "press", touch: { source: event.source, pointerId: event.pointerId, startPoint: event.point, startedAt: event.timestamp, hasAction: event.hasAction }, pressed: true, dismissalReason: state.activeSource === null || sameSource(state.activeSource, event.source) ? null : "replaced", activationOutcome: "none" };
    case "intent-elapsed":
      if (state.touch?.pointerId !== event.pointerId || event.timestamp - state.touch.startedAt < REVEAL_INTENT_MS) return state;
      return { ...state, phase: "touch-reveal" };
    case "pointer-move": {
      if (state.touch?.pointerId !== event.pointerId) return state;
      const dx = event.point.x - state.touch.startPoint.x;
      const dy = event.point.y - state.touch.startPoint.y;
      return Math.hypot(dx, dy) > REVEAL_MOVEMENT_SLOP_PX ? cancel(state, "movement") : state;
    }
    case "pointer-up": {
      if (state.touch?.pointerId !== event.pointerId) return { ...state, pressed: false };
      const elapsed = event.timestamp - state.touch.startedAt;
      const activationOutcome: RevealActivationOutcome = !state.touch.hasAction
        ? "suppressed-no-action" : elapsed >= REVEAL_HOLD_MS ? "suppressed-hold" : "fired";
      return { ...restoreFocus(state, "release"), activationOutcome };
    }
    case "pointer-cancel":
      return state.touch?.pointerId === event.pointerId ? cancel(state, "pointer-cancel") : state;
    case "pointer-leave":
      if (state.touch?.pointerId === event.pointerId) return cancel(state, "pointer-leave");
      if (state.phase === "hover" && (event.source === undefined || sameSource(state.hoveredSource, event.source))) return restoreFocus(state, "pointer-leave");
      return state;
    case "focus":
      if (sameSource(state.escapeSuppressedSource, event.source) && sameSource(state.focusedSource, event.source)) return state;
      return { ...state, focusedSource: event.source, escapeSuppressedSource: null, ...(state.phase === "hover" ? {} : { phase: "focus" as const, activeSource: event.source, reason: "focus" as const }), dismissalReason: state.activeSource === null ? null : "replaced", activationOutcome: "none" };
    case "blur": {
      if (!sameSource(state.focusedSource, event.source)) return state;
      const next = { ...state, focusedSource: null, escapeSuppressedSource: null };
      return state.phase === "focus" ? { ...next, phase: "idle", activeSource: null, reason: null, dismissalReason: "blur" } : next;
    }
    case "escape":
      return state.phase === "focus" && state.focusedSource !== null
        ? { ...state, phase: "idle", activeSource: null, reason: null, escapeSuppressedSource: state.focusedSource, dismissalReason: "escape" }
        : state;
    case "source-unmount": {
      const wasActive = sameSource(state.activeSource, event.source);
      const next = { ...state, focusedSource: sameSource(state.focusedSource, event.source) ? null : state.focusedSource, hoveredSource: sameSource(state.hoveredSource, event.source) ? null : state.hoveredSource };
      return wasActive ? { ...next, phase: "idle", activeSource: null, reason: null, touch: null, pressed: false, dismissalReason: "source-unmount", activationOutcome: state.touch === null ? state.activationOutcome : "suppressed-cancelled" } : next;
    }
    case "scroll": case "drag": case "resize": case "orientation-change": case "window-blur": case "route-change":
      return state.activeSource === null ? state : dismissLifecycle(state, event.type);
  }
}
