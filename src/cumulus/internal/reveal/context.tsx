import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo,
  useReducer, useRef, useState, type HTMLAttributes, type RefCallback,
  type ComponentProps, type CSSProperties, type Dispatch, type ReactNode,
} from "react";
import { logEvent } from "../../../logging";
import type { RichText } from "../../components/card/rich-text";
import { tideAlignmentLabel } from "../../components/hud/tide-spec";
import { infoCardVariant, type RevealCoordinatorSource, type RevealDismissalReason, type RevealGameCard, type RevealInfoCardModel, type RevealSourceIdentity, type RevealSpec } from "./model";
import {
  activationOutcomeForTouch, initialRevealCoordinatorState, reduceRevealState,
  REVEAL_INTENT_MS,
} from "./state-machine";
import { logRevealClosed, logRevealOpened } from "./logging";
import { RevealOverlay, type RevealOverlayActive } from "./RevealOverlay";
import { feedbackForRect, type RevealFeedback } from "./feedback";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameSource(state: ReturnType<typeof reduceRevealState>, source: RevealCoordinatorSource): boolean {
  return state.activeSource !== null
    && state.activeSource.entityType === source.identity.entityType
    && state.activeSource.entityId === source.identity.entityId
    && state.activeRegistrationId === source.registrationId;
}

function richTextDescription(value: RichText | undefined): string {
  if (value === undefined) return "";
  if (value.kind === "definitions") {
    return value.entries
      .map((entry) => `${entry.term}. ${entry.definition}`)
      .join(" ");
  }
  if (value.kind === "stack") {
    return value.parts.map(richTextDescription).filter(Boolean).join(" ");
  }
  if (value.kind === "inline") {
    return value.parts.map(richTextDescription).join("");
  }
  if (value.kind === "glyph") {
    return value.label;
  }
  return value.text;
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
  const primary = spec.primary.kind === "source"
    ? spec.primary.description
    : spec.primary.kind === "infoCard"
      ? infoCardDescription(spec.primary.card)
    : spec.primary.kind === "galleryAction"
      ? spec.primary.action.label
    : spec.primary.displaySnapshot === undefined
      ? ""
      : gameCardDescription(spec.primary.displaySnapshot);
  return [primary, ...spec.secondaries.map(infoCardDescription)].filter(Boolean).join(". ");
}

function isValidGameCard(card: RevealGameCard): boolean {
  return UUID_PATTERN.test(card.cardId)
    && card.displaySnapshot !== undefined
    && card.displaySnapshot.id.toLowerCase() === card.cardId.toLowerCase();
}

function isValidRegistration(identity: RevealSourceIdentity, spec: RevealSpec): boolean {
  if (identity.entityType.trim() === "" || !UUID_PATTERN.test(identity.entityId)) return false;
  if (spec.primary.kind === "gameCard" && !isValidGameCard(spec.primary)) return false;
  if (!(spec.adjacentCards ?? []).every(isValidGameCard)) return false;
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
  readonly beginInteraction: (source: RevealCoordinatorSource, reason: NonNullable<ReturnType<typeof reduceRevealState>["reason"]>, sourceRect: InteractionSnapshot["sourceRect"], modality: "mouse" | "pen" | "touch" | "keyboard") => void;
  readonly isKeyboardFocusEligible: () => boolean;
}

interface InteractionSnapshot {
  readonly id: number;
  readonly registrationId: string;
  readonly reason: NonNullable<ReturnType<typeof reduceRevealState>["reason"]>;
  readonly sourceRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly modality: "mouse" | "pen" | "touch" | "keyboard";
}

function captureSourceRect(element: HTMLElement): InteractionSnapshot["sourceRect"] {
  const value = element.getBoundingClientRect();
  return Object.freeze({ x: value.x, y: value.y, width: value.width, height: value.height });
}

function overlayInteractionKey(active: RevealOverlayActive): string {
  return `${active.source.registrationId}:${active.reason}:${String(active.interactionId)}`;
}

const RevealCoordinatorContext = createContext<RevealCoordinatorValue | null>(null);

export function RevealCoordinatorProvider({ children }: { readonly children: ReactNode }) {
  const parent = useContext(RevealCoordinatorContext);
  if (parent !== null) throw new Error("CumulusRoot cannot be nested; mount exactly one CumulusRoot per application entry.");
  const [state, dispatch] = useReducer(reduceRevealState, initialRevealCoordinatorState);
  const sourcesRef = useRef(new Map<string, SourceRegistration>());
  const keyboardFocusEligibleRef = useRef(true);
  const [, renderDescriptions] = useState(0);
  const registerSource = useCallback((key: string, value: SourceRegistration) => {
    sourcesRef.current.set(key, value); renderDescriptions((version) => version + 1);
    return () => { sourcesRef.current.delete(key); renderDescriptions((version) => version + 1); };
  }, []);
  const updateSourceElement = useCallback((key: string, element: HTMLElement | null) => {
    const source = sourcesRef.current.get(key);
    if (source !== undefined) sourcesRef.current.set(key, { ...source, element });
  }, []);
  const openedInteractionRef = useRef<{ readonly key: string; readonly source: RevealCoordinatorSource; readonly interactionId: number; readonly reason: NonNullable<typeof state.reason> } | null>(null);
  const [interactionSnapshot, setInteractionSnapshot] = useState<InteractionSnapshot | null>(null);
  const interactionEpochRef = useRef(0);
  const interactionSnapshotRef = useRef<InteractionSnapshot | null>(null);
  const beginInteraction = useCallback((source: RevealCoordinatorSource, reason: InteractionSnapshot["reason"], sourceRect: InteractionSnapshot["sourceRect"], modality: InteractionSnapshot["modality"]) => {
    const snapshot = Object.freeze({
      id: interactionEpochRef.current + 1,
      registrationId: source.registrationId,
      reason,
      sourceRect,
      modality,
    });
    interactionEpochRef.current = snapshot.id;
    interactionSnapshotRef.current = snapshot;
    setInteractionSnapshot(snapshot);
  }, []);
  const closeOpenedInteraction = useCallback((key: string, reason: RevealDismissalReason, activationOutcome: typeof state.activationOutcome): boolean => {
    const opened = openedInteractionRef.current;
    if (opened === null || opened.key !== key) return false;
    openedInteractionRef.current = null;
    logRevealClosed({ source: opened.source.identity, interactionId: opened.interactionId, reason: opened.reason, dismissalReason: reason, activationOutcome });
    return true;
  }, []);
  const unregisterSource = useCallback((source: RevealCoordinatorSource) => {
    dispatch({ type: "source-unmount", source, timestamp: performance.now() });
  }, []);

  useEffect(() => {
    const now = () => performance.now();
    const handleKeyDown = (event: KeyboardEvent) => {
      keyboardFocusEligibleRef.current = true;
      if (event.key === "Escape") dispatch({ type: "escape", timestamp: event.timeStamp });
    };
    const handlePointerDown = () => { keyboardFocusEligibleRef.current = false; };
    const events = [
      [window, "resize", () => dispatch({ type: "resize", timestamp: now() })],
      [window, "orientationchange", () => dispatch({ type: "orientation-change", timestamp: now() })],
      [window, "blur", () => dispatch({ type: "window-blur", timestamp: now() })],
      [window, "popstate", () => dispatch({ type: "route-change", timestamp: now() })],
      [window, "hashchange", () => dispatch({ type: "route-change", timestamp: now() })],
    ] as const;
    const handleVisualViewportResize = () => dispatch({ type: "resize", timestamp: now() });
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
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("dragstart", handleDragStart, true);
    window.visualViewport?.addEventListener?.("resize", handleVisualViewportResize);
    return () => {
      for (const [target, name, handler] of events) target.removeEventListener(name, handler);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("dragstart", handleDragStart, true);
      window.visualViewport?.removeEventListener?.("resize", handleVisualViewportResize);
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

  const isKeyboardFocusEligible = useCallback(() => keyboardFocusEligibleRef.current, []);
  const value = useMemo(() => ({ state, dispatch, registerSource, updateSourceElement, unregisterSource, beginInteraction, isKeyboardFocusEligible }), [state, registerSource, updateSourceElement, unregisterSource, beginInteraction, isKeyboardFocusEligible]);
  const activeRegistration = state.activeRegistrationId === null ? undefined : sourcesRef.current.get(state.activeRegistrationId);
  useLayoutEffect(() => {
    if (state.reason !== "focus" || activeRegistration?.element == null) return;
    const snapshot = interactionSnapshotRef.current;
    if (snapshot?.registrationId === activeRegistration.source.registrationId && snapshot.reason === "focus") return;
    beginInteraction(activeRegistration.source, "focus", captureSourceRect(activeRegistration.element), "keyboard");
  }, [activeRegistration, beginInteraction, state.reason]);
  const liveOverlayActive: RevealOverlayActive | null = activeRegistration?.element !== null
    && activeRegistration?.element !== undefined && state.reason !== null && state.phase !== "touch-pending"
    && interactionSnapshot !== null
    && interactionSnapshot.registrationId === activeRegistration.source.registrationId
    && interactionSnapshot.reason === state.reason
    ? {
        source: activeRegistration.source,
        spec: activeRegistration.spec,
        element: activeRegistration.element,
        reason: state.reason,
        interactionId: interactionSnapshot.id,
        sourceRect: interactionSnapshot.sourceRect,
        modality: interactionSnapshot.modality,
        ...(state.touch?.startPoint === undefined ? {} : { touchPoint: state.touch.startPoint }),
        sourceShowsCompleteGameCard: activeRegistration.element.dataset.revealCompleteGameCard === "true",
        sourceIsBattlefieldGameCard: activeRegistration.element.dataset.gameCardPresentation === "battlefield",
      }
    : null;
  const overlayActive = liveOverlayActive;
  const overlayKey = overlayActive === null ? null : overlayInteractionKey(overlayActive);
  useEffect(() => {
    const opened = openedInteractionRef.current;
    if (opened !== null && opened.key !== overlayKey) {
      closeOpenedInteraction(opened.key, state.dismissalReason ?? "replaced", state.activationOutcome);
    }
  }, [closeOpenedInteraction, overlayKey, state.activationOutcome, state.dismissalReason]);
  const handlePlaced = useCallback<NonNullable<ComponentProps<typeof RevealOverlay>["onPlaced"]>>((decision, geometry) => {
    if (overlayActive === null) return;
    const openKey = overlayInteractionKey(overlayActive);
    if (openedInteractionRef.current?.key === openKey) return;
    if (openedInteractionRef.current !== null) {
      closeOpenedInteraction(openedInteractionRef.current.key, "replaced", "none");
    }
    const primary = overlayActive.spec.primary;
    logRevealOpened({
      source: overlayActive.source.identity,
      interactionId: overlayActive.interactionId,
      primary: {
        kind: primary.kind,
        variant: primary.kind === "source"
          ? "in-place"
          : primary.kind === "gameCard"
            ? "complete"
          : primary.kind === "galleryAction"
            ? "card-shaped"
            : infoCardVariant(primary.card),
      },
      secondaryVariants: overlayActive.spec.secondaries.map(infoCardVariant),
      adjacentCardIds: (overlayActive.spec.adjacentCards ?? []).map(
        (card) => card.cardId,
      ),
      modality: overlayActive.modality,
      reason: overlayActive.reason,
      geometry,
      shownSecondaryCount: decision.shownSecondaryCount,
      droppedSecondaryCount: decision.droppedSecondaryCount,
      shownAdjacentCount: decision.shownAdjacentCount,
      droppedAdjacentCount: decision.droppedAdjacentCount,
      fallbacks: {
        pressInPlace: decision.pressInPlace,
        sideFallback: decision.sideFallback,
        secondaryTruncation: decision.secondaryTruncation,
        adjacentTruncation: decision.adjacentTruncation,
        bestEffortPrimaryOverlap: decision.bestEffortPrimaryOverlap,
      },
    });
    openedInteractionRef.current = { key: openKey, source: overlayActive.source, interactionId: overlayActive.interactionId, reason: overlayActive.reason };
  }, [closeOpenedInteraction, overlayActive]);
  return (
    <RevealCoordinatorContext.Provider value={value}>
      {children}
      <RevealOverlay active={overlayActive} onPlaced={handlePlaced} />
      <div hidden data-cumulus-reveal-descriptions="">
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
      readonly "data-reveal-entity-type": string;
      readonly "data-reveal-entity-id": string;
      readonly "data-reveal-primary-variant": string;
      readonly "data-reveal-secondary-titles": string;
      readonly style: CSSProperties;
    };
}

/** Private binding for named Cumulus entity components. */
export function useRevealSource(registration: RevealSourceRegistration): RevealSourceBinding {
  const coordinator = useContext(RevealCoordinatorContext);
  if (coordinator === null) throw new Error("Semantic Cumulus reveal sources require one mounted CumulusRoot.");
  const reactId = useId();
  const descriptionId = `cumulus-reveal-description-${reactId.replace(/:/g, "")}`;
  const valid = isValidRegistration(registration.identity, registration.spec);
  const identity = registration.identity;
  const registrationKey = `cumulus-reveal-source-${reactId.replace(/:/g, "")}`;
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
    if (!valid) {
      logEvent("cumulus_entity_reveal_invalid_source", { sourceEntityType: identity.entityType, sourceEntityId: identity.entityId, reason: "malformed-semantic-data" });
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
  const measureFeedback = (sourceRect: InteractionSnapshot["sourceRect"]): void => {
    setFeedback(feedbackForRect(sourceRect, feedbackVariant));
  };
  return {
    ref,
    sourceProps: {
      "aria-describedby": valid ? descriptionId : undefined,
      "data-reveal-active": active ? "true" : "false",
      "data-reveal-feedback": feedbackVariant === "stationary" ? "stationary" : "measured",
      "data-reveal-entity-type": identity.entityType,
      "data-reveal-entity-id": identity.entityId,
      "data-reveal-primary-variant": spec.primary.kind === "source"
        ? "source"
        : spec.primary.kind === "gameCard"
          ? "gameCard"
        : spec.primary.kind === "galleryAction"
          ? "galleryAction"
          : (spec.primary.card.variant ?? "text"),
      "data-reveal-secondary-titles": spec.secondaries.map((card) => card.title).join("\u001f"),
      style: { "--reveal-press-scale": String(feedback.pressScale), "--reveal-hover-scale": String(feedback.hoverScale) } as CSSProperties,
      onPointerEnter: (event) => { if (valid) { const hoverCapable = event.pointerType === "mouse" || (event.pointerType === "pen" && event.buttons === 0 && event.pressure === 0); if (hoverCapable && coordinator.state.touch === null) { const sourceRect = captureSourceRect(event.currentTarget); coordinator.beginInteraction(mountedSource, "hover", sourceRect, event.pointerType === "pen" ? "pen" : "mouse"); measureFeedback(sourceRect); } coordinator.dispatch({ type: "pointer-enter", source: mountedSource, pointerType: event.pointerType, hoverCapable, timestamp: event.timeStamp }); } },
      onPointerLeave: (event) => {
        if (event.pointerType !== "touch" && intentTimer.current !== null) { clearTimeout(intentTimer.current); intentTimer.current = null; }
        if (valid) {
          coordinator.dispatch({ type: "pointer-leave", source: mountedSource, pointerId: event.pointerId, timestamp: event.timeStamp });
        }
      },
      onPointerDown: (event) => {
        if (!valid) return;
        const sourceRect = captureSourceRect(event.currentTarget);
        if (event.pointerType === "touch" && coordinator.state.touch === null) coordinator.beginInteraction(mountedSource, "press", sourceRect, "touch");
        measureFeedback(sourceRect);
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
      onFocus: (event) => { if (valid && coordinator.isKeyboardFocusEligible()) { const sourceRect = captureSourceRect(event.currentTarget); coordinator.beginInteraction(mountedSource, "focus", sourceRect, "keyboard"); measureFeedback(sourceRect); coordinator.dispatch({ type: "focus", source: mountedSource, timestamp: event.timeStamp }); } },
      onBlur: (event) => { if (valid) coordinator.dispatch({ type: "blur", source: mountedSource, timestamp: event.timeStamp }); },
    },
  };
}
