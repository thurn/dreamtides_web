import {
  createContext, useCallback, useContext, useEffect, useId, useMemo,
  useReducer, useRef, useState, type HTMLAttributes, type RefCallback,
  type Dispatch, type ReactNode,
} from "react";
import { logEvent } from "../../../logging";
import type { RichText } from "../../components/card/rich-text";
import { tideAlignmentLabel } from "../../components/hud/tide-spec";
import type { RevealCoordinatorSource, RevealInfoCardModel, RevealSourceIdentity, RevealSpec } from "./model";
import {
  activationOutcomeForTouch, initialRevealCoordinatorState, reduceRevealState,
  REVEAL_INTENT_MS,
} from "./state-machine";
import { logRevealClosed } from "./logging";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameSource(state: ReturnType<typeof reduceRevealState>, source: RevealCoordinatorSource): boolean {
  return state.activeSource !== null
    && state.activeSource.entityType === source.identity.entityType
    && state.activeSource.entityId === source.identity.entityId
    && state.activeRegistrationId === source.registrationId;
}

function richTextDescription(value: RichText | undefined): string {
  if (value === undefined) return "";
  return value.kind === "stack"
    ? value.parts.map(richTextDescription).filter(Boolean).join(" ")
    : value.text;
}

function infoCardDescription(card: RevealInfoCardModel): string {
  return [
    "meta" in card ? card.meta : undefined,
    card.title,
    "subtitle" in card ? card.subtitle : undefined,
    card.variant === "tide" ? `${tideAlignmentLabel(card.tide)} tide alignment` : undefined,
    richTextDescription(card.body),
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(". ");
}

function gameCardDescription(card: NonNullable<Extract<RevealSpec["primary"], { kind: "gameCard" }>["displaySnapshot"]>): string {
  const energy = card.energyCosts !== undefined && card.energyCosts.length > 0
    ? `Energy ${card.energyCosts.join(" and ")}`
    : `Energy ${card.energyCost === null ? "X" : String(card.energyCost)}`;
  const spark = card.sparkVariable === true
    ? "Spark X"
    : card.spark === null ? undefined : `Spark ${String(card.spark)}`;
  return [
    card.name, card.rarity, card.cardType, card.subtype || undefined, energy, spark,
    card.isFast ? "Fast" : undefined,
    card.isInterrupt === true ? "Interrupt" : undefined,
    card.reclaimCost == null ? undefined : `Reclaim ${String(card.reclaimCost)}`,
    card.renderedText,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(". ");
}

function revealDescription(spec: RevealSpec): string {
  const primary = spec.primary.kind === "infoCard"
    ? infoCardDescription(spec.primary.card)
    : spec.primary.displaySnapshot === undefined
      ? ""
      : gameCardDescription(spec.primary.displaySnapshot);
  return [primary, ...spec.secondaries.map(infoCardDescription)].filter(Boolean).join(". ");
}

function isValidRegistration(identity: RevealSourceIdentity, spec: RevealSpec): boolean {
  if (identity.entityType.trim() === "" || !UUID_PATTERN.test(identity.entityId)) return false;
  if (spec.primary.kind === "gameCard") {
    if (!UUID_PATTERN.test(spec.primary.cardId)) return false;
    if (spec.primary.displaySnapshot === undefined) return false;
    if (spec.primary.displaySnapshot.id.toLowerCase() !== spec.primary.cardId.toLowerCase()) return false;
  }
  return revealDescription(spec).trim().length > 0;
}

interface SourceRegistration {
  readonly descriptionId: string;
  readonly description: string;
  readonly source: RevealCoordinatorSource;
  readonly spec: RevealSpec;
  readonly element: HTMLElement | null;
}
interface RevealCoordinatorValue {
  readonly state: ReturnType<typeof reduceRevealState>;
  readonly dispatch: Dispatch<Parameters<typeof reduceRevealState>[1]>;
  readonly registerSource: (key: string, value: SourceRegistration) => () => void;
  readonly updateSourceElement: (key: string, element: HTMLElement | null) => void;
  readonly unregisterSource: (source: RevealCoordinatorSource) => void;
}

const RevealCoordinatorContext = createContext<RevealCoordinatorValue | null>(null);

export function RevealCoordinatorProvider({ children }: { readonly children: ReactNode }) {
  const parent = useContext(RevealCoordinatorContext);
  if (parent !== null) throw new Error("TangoRoot cannot be nested; mount exactly one TangoRoot per application entry.");
  const [state, dispatch] = useReducer(reduceRevealState, initialRevealCoordinatorState);
  const stateRef = useRef(state); stateRef.current = state;
  const sourcesRef = useRef(new Map<string, SourceRegistration>());
  const [, renderDescriptions] = useState(0);
  const registerSource = useCallback((key: string, value: SourceRegistration) => {
    sourcesRef.current.set(key, value); renderDescriptions((version) => version + 1);
    return () => { sourcesRef.current.delete(key); renderDescriptions((version) => version + 1); };
  }, []);
  const updateSourceElement = useCallback((key: string, element: HTMLElement | null) => {
    const source = sourcesRef.current.get(key);
    if (source !== undefined) sourcesRef.current.set(key, { ...source, element });
  }, []);
  const unregisterSource = useCallback((source: RevealCoordinatorSource) => {
    const current = stateRef.current;
    if (sameSource(current, source)) {
      logRevealClosed({ source: source.identity, dismissalReason: "source-unmount", activationOutcome: current.touch === null ? current.activationOutcome : "suppressed-cancelled" });
    }
    dispatch({ type: "source-unmount", source, timestamp: performance.now() });
  }, []);

  useEffect(() => {
    const now = () => performance.now();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "escape", timestamp: event.timeStamp });
    };
    const events = [
      [window, "resize", () => dispatch({ type: "resize", timestamp: now() })],
      [window, "orientationchange", () => dispatch({ type: "orientation-change", timestamp: now() })],
      [window, "blur", () => dispatch({ type: "window-blur", timestamp: now() })],
      [window, "popstate", () => dispatch({ type: "route-change", timestamp: now() })],
      [window, "hashchange", () => dispatch({ type: "route-change", timestamp: now() })],
    ] as const;
    const handleScroll = () => dispatch({ type: "scroll", timestamp: now() });
    const handleDragStart = () => dispatch({ type: "drag", timestamp: now() });
    const pushStateDescriptor = Object.getOwnPropertyDescriptor(window.history, "pushState");
    const replaceStateDescriptor = Object.getOwnPropertyDescriptor(window.history, "replaceState");
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    const pushState: History["pushState"] = (...args) => {
      originalPushState(...args);
      dispatch({ type: "route-change", timestamp: now() });
    };
    const replaceState: History["replaceState"] = (...args) => {
      originalReplaceState(...args);
      dispatch({ type: "route-change", timestamp: now() });
    };
    window.history.pushState = pushState;
    window.history.replaceState = replaceState;
    for (const [target, name, handler] of events) target.addEventListener(name, handler);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("dragstart", handleDragStart, true);
    return () => {
      for (const [target, name, handler] of events) target.removeEventListener(name, handler);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("dragstart", handleDragStart, true);
      if (window.history.pushState === pushState) {
        if (pushStateDescriptor === undefined) delete (window.history as Partial<History>).pushState;
        else Object.defineProperty(window.history, "pushState", pushStateDescriptor);
      }
      if (window.history.replaceState === replaceState) {
        if (replaceStateDescriptor === undefined) delete (window.history as Partial<History>).replaceState;
        else Object.defineProperty(window.history, "replaceState", replaceStateDescriptor);
      }
    };
  }, []);

  const value = useMemo(() => ({ state, dispatch, registerSource, updateSourceElement, unregisterSource }), [state, registerSource, updateSourceElement, unregisterSource]);
  return (
    <RevealCoordinatorContext.Provider value={value}>
      {children}
      <div hidden data-tango-reveal-descriptions="">
        {[...sourcesRef.current.entries()].map(([key, source]) => (
          <span id={source.descriptionId} key={key}>{source.description}</span>
        ))}
      </div>
    </RevealCoordinatorContext.Provider>
  );
}

export interface RevealSourceRegistration {
  readonly identity: RevealSourceIdentity;
  readonly spec: RevealSpec;
  readonly onActivate?: () => void;
}

export interface RevealSourceBinding {
  readonly ref: RefCallback<HTMLElement>;
  readonly sourceProps: Pick<HTMLAttributes<HTMLElement>,
    "aria-describedby" | "onPointerEnter" | "onPointerLeave" | "onPointerDown" |
    "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onFocus" | "onBlur"> & {
      readonly "data-reveal-active": "true" | "false";
    };
}

/** Private binding for named Tango entity components. */
export function useRevealSource(registration: RevealSourceRegistration): RevealSourceBinding {
  const coordinator = useContext(RevealCoordinatorContext);
  if (coordinator === null) throw new Error("useRevealSource requires the application TangoRoot.");
  const reactId = useId();
  const descriptionId = `tango-reveal-description-${reactId.replace(/:/g, "")}`;
  const valid = isValidRegistration(registration.identity, registration.spec);
  const identity = registration.identity;
  const registrationKey = `tango-reveal-source-${reactId.replace(/:/g, "")}`;
  const mountedSource: RevealCoordinatorSource = { identity, registrationId: registrationKey };
  const spec = registration.spec;
  const specFingerprint = JSON.stringify(spec);
  const descriptionText = revealDescription(spec);
  const activate = registration.onActivate;
  const nodeRef = useRef<HTMLElement | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerSource = coordinator.registerSource;
  const unregisterSource = coordinator.unregisterSource;

  useEffect(() => {
    if (!valid) {
      logEvent("tango_entity_reveal_invalid_source", { sourceEntityType: identity.entityType, sourceEntityId: identity.entityId, reason: "malformed-semantic-data" });
      return;
    }
    const unregisterRegistration = registerSource(registrationKey, {
      descriptionId, description: descriptionText, source: mountedSource, spec,
      element: nodeRef.current,
    });
    return () => { if (intentTimer.current !== null) clearTimeout(intentTimer.current); unregisterRegistration(); unregisterSource(mountedSource); };
  }, [registerSource, unregisterSource, descriptionId, descriptionText, identity.entityId, identity.entityType, registrationKey, specFingerprint, valid]);

  const ref = useCallback<RefCallback<HTMLElement>>((node) => {
    nodeRef.current = node;
    coordinator.updateSourceElement(registrationKey, node);
  }, [coordinator.updateSourceElement, registrationKey]);
  const active = valid && sameSource(coordinator.state, mountedSource);
  return {
    ref,
    sourceProps: {
      "aria-describedby": valid ? descriptionId : undefined,
      "data-reveal-active": active ? "true" : "false",
      onPointerEnter: (event) => { if (valid) coordinator.dispatch({ type: "pointer-enter", source: mountedSource, pointerType: event.pointerType, hoverCapable: event.pointerType === "mouse" || (event.pointerType === "pen" && event.buttons === 0 && event.pressure === 0), timestamp: event.timeStamp }); },
      onPointerLeave: (event) => {
        if (intentTimer.current !== null) { clearTimeout(intentTimer.current); intentTimer.current = null; }
        if (valid) coordinator.dispatch({ type: "pointer-leave", source: mountedSource, pointerId: event.pointerId, timestamp: event.timeStamp });
      },
      onPointerDown: (event) => {
        if (!valid) return;
        coordinator.dispatch({ type: "pointer-down", source: mountedSource, pointerType: event.pointerType, pointerId: event.pointerId, point: { x: event.clientX, y: event.clientY }, hasAction: activate !== undefined, timestamp: event.timeStamp });
        if (event.pointerType === "touch") {
          intentTimer.current = setTimeout(() => coordinator.dispatch({ type: "intent-elapsed", pointerId: event.pointerId, timestamp: event.timeStamp + REVEAL_INTENT_MS }), REVEAL_INTENT_MS);
        }
      },
      onPointerMove: (event) => { if (valid) coordinator.dispatch({ type: "pointer-move", pointerId: event.pointerId, point: { x: event.clientX, y: event.clientY }, timestamp: event.timeStamp }); },
      onPointerUp: (event) => {
        if (!valid) return;
        if (intentTimer.current !== null) { clearTimeout(intentTimer.current); intentTimer.current = null; }
        const touch = coordinator.state.touch;
        const shouldActivate = touch?.pointerId === event.pointerId && activationOutcomeForTouch(touch, event.timeStamp) === "fired" && activate !== undefined;
        coordinator.dispatch({ type: "pointer-up", pointerId: event.pointerId, timestamp: event.timeStamp });
        if (shouldActivate) activate();
      },
      onPointerCancel: (event) => {
        if (intentTimer.current !== null) { clearTimeout(intentTimer.current); intentTimer.current = null; }
        if (valid) coordinator.dispatch({ type: "pointer-cancel", pointerId: event.pointerId, timestamp: event.timeStamp });
      },
      onFocus: (event) => { if (valid) coordinator.dispatch({ type: "focus", source: mountedSource, timestamp: event.timeStamp }); },
      onBlur: (event) => { if (valid) coordinator.dispatch({ type: "blur", source: mountedSource, timestamp: event.timeStamp }); },
    },
  };
}
