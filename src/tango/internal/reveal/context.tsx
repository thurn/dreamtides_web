import {
  createContext, useCallback, useContext, useEffect, useId, useMemo,
  useReducer, useRef, useState, type HTMLAttributes, type RefCallback,
  type ComponentProps, type CSSProperties, type Dispatch, type ReactNode,
} from "react";
import { logEvent } from "../../../logging";
import type { RichText } from "../../components/card/rich-text";
import { tideAlignmentLabel } from "../../components/hud/tide-spec";
import { infoCardVariant, type RevealCoordinatorSource, type RevealDismissalReason, type RevealInfoCardModel, type RevealSourceIdentity, type RevealSpec } from "./model";
import {
  activationOutcomeForTouch, initialRevealCoordinatorState, reduceRevealState,
  REVEAL_INTENT_MS,
} from "./state-machine";
import { logRevealClosed, logRevealOpened } from "./logging";
import { RevealOverlay, type RevealOverlayActive } from "./RevealOverlay";
import { feedbackForRect, type RevealFeedback } from "./feedback";
import { captureVisualViewport } from "./viewport";

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
  readonly beginGameCardReturn: (source: RevealCoordinatorSource) => boolean;
  readonly cancelGameCardReturn: (reason: RevealDismissalReason) => boolean;
  readonly beginInteraction: () => void;
}

const RevealCoordinatorContext = createContext<RevealCoordinatorValue | null>(null);

const STANDALONE_COORDINATOR: RevealCoordinatorValue = {
  state: initialRevealCoordinatorState,
  dispatch: () => undefined,
  registerSource: () => () => undefined,
  updateSourceElement: () => undefined,
  unregisterSource: () => undefined,
  beginGameCardReturn: () => false,
  cancelGameCardReturn: () => false,
  beginInteraction: () => undefined,
};

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
  const loggedOpenKeyRef = useRef<string | null>(null);
  const [interactionEpoch, setInteractionEpoch] = useState(0);
  const interactionEpochRef = useRef(0);
  const beginInteraction = useCallback(() => {
    interactionEpochRef.current += 1;
    setInteractionEpoch(interactionEpochRef.current);
  }, []);
  const [returningActive, setReturningActive] = useState<RevealOverlayActive | null>(null);
  const returningRef = useRef<RevealOverlayActive | null>(null);
  const returningOutcomeRef = useRef<typeof state.activationOutcome>("none");
  const returnGenerationRef = useRef(0);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelGameCardReturn = useCallback((reason: RevealDismissalReason): boolean => {
    const returning = returningRef.current;
    if (returning === null) return false;
    returnGenerationRef.current += 1;
    if (returnTimerRef.current !== null) clearTimeout(returnTimerRef.current);
    returnTimerRef.current = null;
    returningRef.current = null;
    setReturningActive(null);
    loggedOpenKeyRef.current = null;
    logRevealClosed({ source: returning.source.identity, dismissalReason: reason, activationOutcome: returningOutcomeRef.current });
    return true;
  }, []);
  const unregisterSource = useCallback((source: RevealCoordinatorSource) => {
    if (returningRef.current?.source.registrationId === source.registrationId) cancelGameCardReturn("source-unmount");
    dispatch({ type: "source-unmount", source, timestamp: performance.now() });
  }, [cancelGameCardReturn]);
  const beginGameCardReturn = useCallback((source: RevealCoordinatorSource): boolean => {
    const current = stateRef.current;
    const registration = sourcesRef.current.get(source.registrationId);
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!sameSource(current, source) || current.reason !== "hover" || registration?.element == null
      || registration.spec.primary.kind !== "gameCard" || captureVisualViewport().layout !== "desktop" || reduced) return false;
    const returning: RevealOverlayActive = {
      source: registration.source,
      spec: registration.spec,
      element: registration.element,
      reason: "hover",
      interactionId: interactionEpochRef.current,
      sourceShowsCompleteGameCard: registration.element.dataset.revealCompleteGameCard === "true",
      returningGameCard: true,
    };
    cancelGameCardReturn("replaced");
    returningRef.current = returning;
    returningOutcomeRef.current = current.activationOutcome;
    setReturningActive(returning);
    if (returnTimerRef.current !== null) clearTimeout(returnTimerRef.current);
    const generation = ++returnGenerationRef.current;
    returnTimerRef.current = setTimeout(() => {
      if (returnGenerationRef.current !== generation || returningRef.current !== returning) return;
      returningRef.current = null;
      setReturningActive(null);
      returnTimerRef.current = null;
      logRevealClosed({ source: source.identity, dismissalReason: "pointer-leave", activationOutcome: current.activationOutcome });
    }, 160);
    return true;
  }, [cancelGameCardReturn]);
  useEffect(() => () => { if (returnTimerRef.current !== null) clearTimeout(returnTimerRef.current); }, []);

  const previousActiveRef = useRef<{ readonly source: RevealCoordinatorSource; readonly activationOutcome: typeof state.activationOutcome } | null>(null);
  useEffect(() => {
    const previous = previousActiveRef.current;
    const currentRegistration = state.activeRegistrationId === null ? undefined : sourcesRef.current.get(state.activeRegistrationId);
    if (previous !== null && previous.source.registrationId !== state.activeRegistrationId
      && returningActive?.source.registrationId !== previous.source.registrationId) {
      logRevealClosed({
        source: previous.source.identity,
        dismissalReason: state.dismissalReason ?? "replaced",
        activationOutcome: state.activationOutcome === "none" ? previous.activationOutcome : state.activationOutcome,
      });
    }
    previousActiveRef.current = currentRegistration === undefined
      ? null
      : { source: currentRegistration.source, activationOutcome: state.activationOutcome };
  }, [returningActive, state]);

  useEffect(() => {
    const now = () => performance.now();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "escape", timestamp: event.timeStamp });
    };
    const events = [
      [window, "resize", () => { cancelGameCardReturn("resize"); dispatch({ type: "resize", timestamp: now() }); }],
      [window, "orientationchange", () => { cancelGameCardReturn("orientation-change"); dispatch({ type: "orientation-change", timestamp: now() }); }],
      [window, "blur", () => { cancelGameCardReturn("window-blur"); dispatch({ type: "window-blur", timestamp: now() }); }],
      [window, "popstate", () => { cancelGameCardReturn("route-change"); dispatch({ type: "route-change", timestamp: now() }); }],
      [window, "hashchange", () => { cancelGameCardReturn("route-change"); dispatch({ type: "route-change", timestamp: now() }); }],
    ] as const;
    const handleScroll = () => { cancelGameCardReturn("scroll"); dispatch({ type: "scroll", timestamp: now() }); };
    const handleDragStart = () => { cancelGameCardReturn("drag"); dispatch({ type: "drag", timestamp: now() }); };
    const pushStateDescriptor = Object.getOwnPropertyDescriptor(window.history, "pushState");
    const replaceStateDescriptor = Object.getOwnPropertyDescriptor(window.history, "replaceState");
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    const pushState: History["pushState"] = (...args) => {
      originalPushState(...args);
      cancelGameCardReturn("route-change");
      dispatch({ type: "route-change", timestamp: now() });
    };
    const replaceState: History["replaceState"] = (...args) => {
      originalReplaceState(...args);
      cancelGameCardReturn("route-change");
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
  }, [cancelGameCardReturn]);

  const value = useMemo(() => ({ state, dispatch, registerSource, updateSourceElement, unregisterSource, beginGameCardReturn, cancelGameCardReturn, beginInteraction }), [state, registerSource, updateSourceElement, unregisterSource, beginGameCardReturn, cancelGameCardReturn, beginInteraction]);
  const activeRegistration = state.activeRegistrationId === null ? undefined : sourcesRef.current.get(state.activeRegistrationId);
  const liveOverlayActive: RevealOverlayActive | null = activeRegistration?.element !== null
    && activeRegistration?.element !== undefined && state.reason !== null
    ? {
        source: activeRegistration.source,
        spec: activeRegistration.spec,
        element: activeRegistration.element,
        reason: state.reason,
        interactionId: interactionEpoch,
        ...(state.touch?.startPoint === undefined ? {} : { touchPoint: state.touch.startPoint }),
        sourceShowsCompleteGameCard: activeRegistration.element.dataset.revealCompleteGameCard === "true",
      }
    : null;
  const overlayActive = liveOverlayActive ?? returningActive;
  const handlePlaced = useCallback<NonNullable<ComponentProps<typeof RevealOverlay>["onPlaced"]>>((decision, geometry) => {
    if (overlayActive === null || overlayActive.returningGameCard === true) return;
    const openKey = `${overlayActive.source.registrationId}:${overlayActive.reason}`;
    if (loggedOpenKeyRef.current === openKey) return;
    loggedOpenKeyRef.current = openKey;
    const primary = overlayActive.spec.primary;
    logRevealOpened({
      source: overlayActive.source.identity,
      primary: { kind: primary.kind, variant: primary.kind === "gameCard" ? "complete" : infoCardVariant(primary.card) },
      secondaryVariants: overlayActive.spec.secondaries.map(infoCardVariant),
      modality: overlayActive.reason === "focus" ? "keyboard" : overlayActive.reason === "press" ? "touch" : "mouse",
      reason: overlayActive.reason,
      geometry,
      shownSecondaryCount: decision.shownSecondaryCount,
      droppedSecondaryCount: decision.droppedSecondaryCount,
      fallbacks: {
        pressInPlace: decision.pressInPlace,
        sideFallback: decision.sideFallback,
        secondaryTruncation: decision.secondaryTruncation,
        bestEffortPrimaryOverlap: decision.bestEffortPrimaryOverlap,
      },
    });
  }, [overlayActive]);
  useEffect(() => { if (overlayActive === null) loggedOpenKeyRef.current = null; }, [overlayActive]);
  return (
    <RevealCoordinatorContext.Provider value={value}>
      {children}
      <RevealOverlay active={overlayActive} onPlaced={handlePlaced} />
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
  /** Source feedback policy. Readable inline copy stays stationary. */
  readonly feedback?: RevealFeedback;
}

export interface RevealSourceBinding {
  readonly ref: RefCallback<HTMLElement>;
  readonly sourceProps: Pick<HTMLAttributes<HTMLElement>,
    "aria-describedby" | "onPointerEnter" | "onPointerLeave" | "onPointerDown" |
    "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onFocus" | "onBlur"> & {
      readonly "data-reveal-active": "true" | "false";
      readonly "data-reveal-feedback": "measured" | "stationary";
      readonly style: CSSProperties;
    };
}

/** Private binding for named Tango entity components. */
export function useRevealSource(registration: RevealSourceRegistration): RevealSourceBinding {
  const mountedCoordinator = useContext(RevealCoordinatorContext);
  const coordinator = mountedCoordinator ?? STANDALONE_COORDINATOR;
  const hasMountedCoordinator = mountedCoordinator !== null;
  const reactId = useId();
  const descriptionId = `tango-reveal-description-${reactId.replace(/:/g, "")}`;
  const valid = hasMountedCoordinator && isValidRegistration(registration.identity, registration.spec);
  const identity = registration.identity;
  const registrationKey = `tango-reveal-source-${reactId.replace(/:/g, "")}`;
  const mountedSource: RevealCoordinatorSource = { identity, registrationId: registrationKey };
  const spec = registration.spec;
  const specFingerprint = JSON.stringify(spec);
  const descriptionText = revealDescription(spec);
  const activate = registration.onActivate;
  const feedbackVariant = registration.feedback ?? "scale";
  const [feedback, setFeedback] = useState(() => feedbackForRect({ width: 1, height: 1 }, feedbackVariant));
  const nodeRef = useRef<HTMLElement | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerSource = coordinator.registerSource;
  const unregisterSource = coordinator.unregisterSource;

  useEffect(() => {
    if (!hasMountedCoordinator) return;
    if (!valid) {
      logEvent("tango_entity_reveal_invalid_source", { sourceEntityType: identity.entityType, sourceEntityId: identity.entityId, reason: "malformed-semantic-data" });
      return;
    }
    const unregisterRegistration = registerSource(registrationKey, {
      descriptionId, description: descriptionText, source: mountedSource, spec,
      element: nodeRef.current,
    });
    return () => { if (intentTimer.current !== null) clearTimeout(intentTimer.current); unregisterRegistration(); unregisterSource(mountedSource); };
  }, [hasMountedCoordinator, registerSource, unregisterSource, descriptionId, descriptionText, identity.entityId, identity.entityType, registrationKey, specFingerprint, valid]);

  const ref = useCallback<RefCallback<HTMLElement>>((node) => {
    nodeRef.current = node;
    coordinator.updateSourceElement(registrationKey, node);
  }, [coordinator.updateSourceElement, registrationKey]);
  const active = valid && sameSource(coordinator.state, mountedSource);
  const measureFeedback = (element: HTMLElement): void => {
    const measured = element.getBoundingClientRect();
    setFeedback(feedbackForRect({ width: measured.width, height: measured.height }, feedbackVariant));
  };
  return {
    ref,
    sourceProps: {
      "aria-describedby": valid ? descriptionId : undefined,
      "data-reveal-active": active ? "true" : "false",
      "data-reveal-feedback": feedbackVariant === "stationary" ? "stationary" : "measured",
      style: { "--reveal-press-scale": String(feedback.pressScale), "--reveal-hover-scale": String(feedback.hoverScale) } as CSSProperties,
      onPointerEnter: (event) => { if (valid) { coordinator.cancelGameCardReturn("replaced"); coordinator.beginInteraction(); measureFeedback(event.currentTarget); coordinator.dispatch({ type: "pointer-enter", source: mountedSource, pointerType: event.pointerType, hoverCapable: event.pointerType === "mouse" || (event.pointerType === "pen" && event.buttons === 0 && event.pressure === 0), timestamp: event.timeStamp }); } },
      onPointerLeave: (event) => {
        if (intentTimer.current !== null) { clearTimeout(intentTimer.current); intentTimer.current = null; }
        if (valid) { coordinator.beginGameCardReturn(mountedSource); coordinator.dispatch({ type: "pointer-leave", source: mountedSource, pointerId: event.pointerId, timestamp: event.timeStamp }); }
      },
      onPointerDown: (event) => {
        if (!valid) return;
        if (event.pointerType === "touch") coordinator.beginInteraction();
        measureFeedback(event.currentTarget);
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
      onFocus: (event) => { if (valid) { coordinator.cancelGameCardReturn("replaced"); coordinator.beginInteraction(); coordinator.dispatch({ type: "focus", source: mountedSource, timestamp: event.timeStamp }); } },
      onBlur: (event) => { if (valid) coordinator.dispatch({ type: "blur", source: mountedSource, timestamp: event.timeStamp }); },
    },
  };
}
