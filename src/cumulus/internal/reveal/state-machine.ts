import type {
  RevealActivationOutcome, RevealCoordinatorEvent, RevealCoordinatorState,
  RevealCoordinatorSource, RevealDismissalReason, RevealSourceIdentity,
  RevealTouchState,
} from "./model";
import { POINTER_MOVEMENT_SLOP_PX } from "../../primitives/pointer-gesture";

export const REVEAL_INTENT_MS = 30;
export const REVEAL_HOLD_MS = 300;

export const initialRevealCoordinatorState: RevealCoordinatorState = {
  phase: "idle", activeSource: null, activeRegistrationId: null,
  reason: null, focusedSource: null,
  hoveredSource: null, escapeSuppressedSource: null, touch: null,
  pressed: false, pressPointerId: null, capturePointer: false, dismissalReason: null,
  activationOutcome: "none",
};

function sameSource(a: RevealSourceIdentity | null, b: RevealSourceIdentity | null): boolean {
  return a !== null && b !== null && a.entityType === b.entityType && a.entityId === b.entityId;
}

function sameMountedSource(a: RevealCoordinatorSource | null, b: RevealCoordinatorSource | null): boolean {
  return a !== null && b !== null && sameSource(a.identity, b.identity)
    && a.registrationId === b.registrationId;
}

function isActiveSource(state: RevealCoordinatorState, source: RevealCoordinatorSource): boolean {
  return sameSource(state.activeSource, source.identity)
    && state.activeRegistrationId === source.registrationId;
}

function restoreFocus(state: RevealCoordinatorState, reason: RevealDismissalReason): RevealCoordinatorState {
  if (state.focusedSource !== null && !sameMountedSource(state.focusedSource, state.escapeSuppressedSource)) {
    return { ...state, phase: "focus", activeSource: state.focusedSource.identity, activeRegistrationId: state.focusedSource.registrationId, reason: "focus", hoveredSource: null, touch: null, pressed: false, pressPointerId: null, dismissalReason: reason };
  }
  return { ...state, phase: "idle", activeSource: null, activeRegistrationId: null, reason: null, hoveredSource: null, touch: null, pressed: false, pressPointerId: null, dismissalReason: reason };
}

function cancel(state: RevealCoordinatorState, reason: RevealDismissalReason): RevealCoordinatorState {
  const activationOutcome: RevealActivationOutcome = state.touch === null ? state.activationOutcome : "suppressed-cancelled";
  return { ...restoreFocus(state, reason), activationOutcome };
}

function dismissLifecycle(state: RevealCoordinatorState, reason: RevealDismissalReason): RevealCoordinatorState {
  return {
    ...state, phase: "idle", activeSource: null, activeRegistrationId: null, reason: null, hoveredSource: null,
    touch: null, pressed: false, pressPointerId: null, dismissalReason: reason,
    activationOutcome: state.touch === null ? state.activationOutcome : "suppressed-cancelled",
  };
}

export function activationOutcomeForTouch(touch: RevealTouchState, timestamp: number): RevealActivationOutcome {
  if (!touch.hasAction) return "suppressed-no-action";
  return timestamp - touch.startedAt >= REVEAL_HOLD_MS ? "suppressed-hold" : "fired";
}

export function reduceRevealState(state: RevealCoordinatorState, event: RevealCoordinatorEvent): RevealCoordinatorState {
  switch (event.type) {
    case "pointer-enter":
      if (event.pointerType === "touch" || !event.hoverCapable || state.touch !== null) return state;
      return { ...state, phase: "hover", activeSource: event.source.identity, activeRegistrationId: event.source.registrationId, hoveredSource: event.source, reason: "hover", dismissalReason: state.activeSource === null || isActiveSource(state, event.source) ? state.dismissalReason : "replaced", activationOutcome: "none" };
    case "pointer-down":
      if (event.pointerType !== "touch") {
        return isActiveSource(state, event.source)
          ? { ...state, pressed: true, pressPointerId: event.pointerId }
          : state;
      }
      if (state.touch !== null) return state;
      return { ...state, phase: "touch-pending", activeSource: event.source.identity, activeRegistrationId: event.source.registrationId, reason: "press", touch: { source: event.source, pointerId: event.pointerId, startPoint: event.point, startedAt: event.timestamp, hasAction: event.hasAction }, pressed: true, pressPointerId: event.pointerId, dismissalReason: state.activeSource === null || isActiveSource(state, event.source) ? null : "replaced", activationOutcome: "none" };
    case "intent-elapsed":
      if (state.touch?.pointerId !== event.pointerId || event.timestamp - state.touch.startedAt < REVEAL_INTENT_MS) return state;
      return { ...state, phase: "touch-reveal" };
    case "pointer-move": {
      if (state.touch?.pointerId !== event.pointerId) return state;
      const dx = event.point.x - state.touch.startPoint.x;
      const dy = event.point.y - state.touch.startPoint.y;
      return Math.hypot(dx, dy) > POINTER_MOVEMENT_SLOP_PX ? cancel(state, "movement") : state;
    }
    case "pointer-up": {
      if (state.touch !== null) {
        if (state.touch.pointerId !== event.pointerId) return state;
        return { ...restoreFocus(state, "release"), activationOutcome: activationOutcomeForTouch(state.touch, event.timestamp) };
      }
      return state.pressPointerId === event.pointerId
        ? { ...state, pressed: false, pressPointerId: null }
        : state;
    }
    case "pointer-cancel":
      if (state.touch !== null) return state.touch.pointerId === event.pointerId ? cancel(state, "pointer-cancel") : state;
      return state.pressPointerId === event.pointerId ? cancel(state, "pointer-cancel") : state;
    case "pointer-leave":
      if (state.touch?.pointerId === event.pointerId) return cancel(state, "pointer-leave");
      if (state.phase === "hover" && (event.source === undefined || sameMountedSource(state.hoveredSource, event.source))) return restoreFocus(state, "pointer-leave");
      return state;
    case "focus":
      if (sameMountedSource(state.escapeSuppressedSource, event.source) && sameMountedSource(state.focusedSource, event.source)) return state;
      return { ...state, focusedSource: event.source, escapeSuppressedSource: null, ...(state.phase === "hover" ? {} : { phase: "focus" as const, activeSource: event.source.identity, activeRegistrationId: event.source.registrationId, reason: "focus" as const }), dismissalReason: state.activeSource === null ? null : "replaced", activationOutcome: "none" };
    case "blur": {
      if (!sameMountedSource(state.focusedSource, event.source)) return state;
      const next = { ...state, focusedSource: null, escapeSuppressedSource: null };
      return state.phase === "focus" ? { ...next, phase: "idle", activeSource: null, activeRegistrationId: null, reason: null, dismissalReason: "blur" } : next;
    }
    case "escape":
      return state.phase === "focus" && state.focusedSource !== null
        ? { ...state, phase: "idle", activeSource: null, activeRegistrationId: null, reason: null, escapeSuppressedSource: state.focusedSource, dismissalReason: "escape" }
        : state;
    case "source-unmount": {
      const wasActive = isActiveSource(state, event.source);
      const next = { ...state, focusedSource: sameMountedSource(state.focusedSource, event.source) ? null : state.focusedSource, hoveredSource: sameMountedSource(state.hoveredSource, event.source) ? null : state.hoveredSource };
      if (!wasActive) return next;
      if (state.phase === "hover") {
        return {
          ...restoreFocus(next, "source-unmount"),
          activationOutcome: state.touch === null
            ? state.activationOutcome
            : "suppressed-cancelled",
        };
      }
      return { ...next, phase: "idle", activeSource: null, activeRegistrationId: null, reason: null, touch: null, pressed: false, pressPointerId: null, dismissalReason: "source-unmount", activationOutcome: state.touch === null ? state.activationOutcome : "suppressed-cancelled" };
    }
    case "scroll": case "drag": case "resize": case "orientation-change": case "window-blur": case "route-change":
      return state.activeSource === null ? state : dismissLifecycle(state, event.type);
  }
}
