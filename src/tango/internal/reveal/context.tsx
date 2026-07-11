import {
  createContext, useCallback, useContext, useEffect, useId, useMemo,
  useReducer, useRef, useState, type HTMLAttributes, type RefCallback,
  type Dispatch, type ReactNode,
} from "react";
import { logEvent } from "../../../logging";
import type { RichText } from "../../components/card/rich-text";
import type { RevealInfoCardModel, RevealSourceIdentity, RevealSpec } from "./model";
import { initialRevealCoordinatorState, reduceRevealState } from "./state-machine";
import { logRevealClosed } from "./logging";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameSource(a: RevealSourceIdentity | null, b: RevealSourceIdentity): boolean {
  return a !== null && a.entityType === b.entityType && a.entityId === b.entityId;
}

function richTextDescription(value: RichText | undefined): string {
  if (value === undefined) return "";
  return value.kind === "stack"
    ? value.parts.map(richTextDescription).filter(Boolean).join(" ")
    : value.text;
}

function infoCardDescription(card: RevealInfoCardModel): string {
  return [card.title, "subtitle" in card ? card.subtitle : undefined, richTextDescription(card.body)]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(". ");
}

function revealDescription(spec: RevealSpec): string {
  const primary = spec.primary.kind === "infoCard"
    ? infoCardDescription(spec.primary.card)
    : spec.primary.displaySnapshot === undefined
      ? `Game card ${spec.primary.cardId}`
      : [spec.primary.displaySnapshot.name, spec.primary.displaySnapshot.renderedText].filter(Boolean).join(". ");
  return [primary, ...spec.secondaries.map(infoCardDescription)].filter(Boolean).join(". ");
}

function isValidRegistration(identity: RevealSourceIdentity, spec: RevealSpec): boolean {
  if (identity.entityType.trim() === "" || !UUID_PATTERN.test(identity.entityId)) return false;
  if (spec.primary.kind === "gameCard") {
    if (!UUID_PATTERN.test(spec.primary.cardId)) return false;
    if (spec.primary.displaySnapshot !== undefined && spec.primary.displaySnapshot.id !== spec.primary.cardId) return false;
  }
  return revealDescription(spec).trim().length > 0;
}

interface SourceRegistration {
  readonly descriptionId: string;
  readonly description: string;
  readonly identity: RevealSourceIdentity;
  readonly spec: RevealSpec;
  readonly element: HTMLElement | null;
}
interface RevealCoordinatorValue {
  readonly state: ReturnType<typeof reduceRevealState>;
  readonly dispatch: Dispatch<Parameters<typeof reduceRevealState>[1]>;
  readonly registerSource: (key: string, value: SourceRegistration) => () => void;
  readonly updateSourceElement: (key: string, element: HTMLElement | null) => void;
  readonly unregisterSource: (source: RevealSourceIdentity) => void;
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
  const unregisterSource = useCallback((source: RevealSourceIdentity) => {
    const current = stateRef.current;
    if (sameSource(current.activeSource, source)) {
      logRevealClosed({ source, dismissalReason: "source-unmount", activationOutcome: current.touch === null ? current.activationOutcome : "suppressed-cancelled" });
    }
    dispatch({ type: "source-unmount", source, timestamp: performance.now() });
  }, []);

  useEffect(() => {
    const now = () => performance.now();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "escape", timestamp: event.timeStamp });
    };
    const events = [
      [window, "scroll", () => dispatch({ type: "scroll", timestamp: now() })],
      [window, "resize", () => dispatch({ type: "resize", timestamp: now() })],
      [window, "orientationchange", () => dispatch({ type: "orientation-change", timestamp: now() })],
      [window, "blur", () => dispatch({ type: "window-blur", timestamp: now() })],
      [window, "popstate", () => dispatch({ type: "route-change", timestamp: now() })],
    ] as const;
    for (const [target, name, handler] of events) target.addEventListener(name, handler);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      for (const [target, name, handler] of events) target.removeEventListener(name, handler);
      window.removeEventListener("keydown", handleKeyDown);
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
  const spec = registration.spec;
  const specFingerprint = JSON.stringify(spec);
  const identityKey = `${identity.entityType}:${identity.entityId}`;
  const descriptionText = revealDescription(spec);
  const activate = registration.onActivate;
  const nodeRef = useRef<HTMLElement | null>(null);
  const touchStartedAt = useRef<number | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerSource = coordinator.registerSource;
  const unregisterSource = coordinator.unregisterSource;

  useEffect(() => {
    if (!valid) {
      logEvent("tango_entity_reveal_invalid_source", { sourceEntityType: identity.entityType, sourceEntityId: identity.entityId, reason: "malformed-semantic-data" });
      return;
    }
    const unregisterRegistration = registerSource(identityKey, {
      descriptionId, description: descriptionText, identity, spec,
      element: nodeRef.current,
    });
    return () => { if (intentTimer.current !== null) clearTimeout(intentTimer.current); unregisterRegistration(); unregisterSource(identity); };
  }, [registerSource, unregisterSource, descriptionId, descriptionText, identity.entityId, identity.entityType, identityKey, specFingerprint, valid]);

  const ref = useCallback<RefCallback<HTMLElement>>((node) => {
    nodeRef.current = node;
    coordinator.updateSourceElement(identityKey, node);
  }, [coordinator.updateSourceElement, identityKey]);
  const active = valid && sameSource(coordinator.state.activeSource, identity);
  return {
    ref,
    sourceProps: {
      "aria-describedby": valid ? descriptionId : undefined,
      "data-reveal-active": active ? "true" : "false",
      onPointerEnter: (event) => { if (valid) coordinator.dispatch({ type: "pointer-enter", source: identity, pointerType: event.pointerType, hoverCapable: event.pointerType === "mouse" || event.pointerType === "pen", timestamp: event.timeStamp }); },
      onPointerLeave: (event) => { if (valid) coordinator.dispatch({ type: "pointer-leave", source: identity, pointerId: event.pointerId, timestamp: event.timeStamp }); },
      onPointerDown: (event) => {
        if (!valid) return;
        coordinator.dispatch({ type: "pointer-down", source: identity, pointerType: event.pointerType, pointerId: event.pointerId, point: { x: event.clientX, y: event.clientY }, hasAction: activate !== undefined, timestamp: event.timeStamp });
        if (event.pointerType === "touch") {
          touchStartedAt.current = event.timeStamp;
          intentTimer.current = setTimeout(() => coordinator.dispatch({ type: "intent-elapsed", pointerId: event.pointerId, timestamp: event.timeStamp + 30 }), 30);
        }
      },
      onPointerMove: (event) => { if (valid) coordinator.dispatch({ type: "pointer-move", pointerId: event.pointerId, point: { x: event.clientX, y: event.clientY }, timestamp: event.timeStamp }); },
      onPointerUp: (event) => {
        if (!valid) return;
        if (intentTimer.current !== null) { clearTimeout(intentTimer.current); intentTimer.current = null; }
        const shouldActivate = coordinator.state.touch?.pointerId === event.pointerId && touchStartedAt.current !== null && event.timeStamp - touchStartedAt.current < 300 && activate !== undefined;
        coordinator.dispatch({ type: "pointer-up", pointerId: event.pointerId, timestamp: event.timeStamp });
        touchStartedAt.current = null; if (shouldActivate) activate();
      },
      onPointerCancel: (event) => { if (valid) coordinator.dispatch({ type: "pointer-cancel", pointerId: event.pointerId, timestamp: event.timeStamp }); },
      onFocus: (event) => { if (valid) coordinator.dispatch({ type: "focus", source: identity, timestamp: event.timeStamp }); },
      onBlur: (event) => { if (valid) coordinator.dispatch({ type: "blur", source: identity, timestamp: event.timeStamp }); },
    },
  };
}
