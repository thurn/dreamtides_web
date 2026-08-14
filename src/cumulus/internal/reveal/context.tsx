import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type HTMLAttributes,
  type RefCallback,
  type ComponentProps,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
} from "react";
import { logEvent } from "../../../logging";
import type { RichText } from "../../components/card/rich-text";
import { tideAccessibilityName } from "../../components/hud/tide-spec";
import {
  infoCardVariant,
  type RevealCoordinatorSource,
  type RevealDescriptionUnit,
  type RevealDismissalReason,
  type RevealGameCard,
  type RevealInfoCardModel,
  type RevealPlacementException,
  type RevealSourceIdentity,
  type RevealSpec,
} from "./model";
import {
  activationOutcomeForTouch,
  initialRevealCoordinatorState,
  reduceRevealState,
  REVEAL_INTENT_MS,
} from "./state-machine";
import { logRevealClosed, logRevealOpened } from "./logging";
import { RevealOverlay, type RevealOverlayActive } from "./RevealOverlay";
import { feedbackForRect, type RevealFeedback } from "./feedback";
import { txa, tx } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import { localizedSourceText } from "../../../runtime/localization/runtime";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameSource(
  state: ReturnType<typeof reduceRevealState>,
  source: RevealCoordinatorSource,
): boolean {
  return (
    state.activeSource !== null &&
    state.activeSource.entityType === source.identity.entityType &&
    state.activeSource.entityId === source.identity.entityId &&
    state.activeRegistrationId === source.registrationId
  );
}

function canonicalDescription(
  text: string | undefined,
): RevealDescriptionUnit[] {
  return text === undefined || text.trim() === ""
    ? []
    : [{ kind: "message", message: localizedSourceText(text) }];
}

function richTextDescriptionUnits(
  value: RichText | undefined,
): RevealDescriptionUnit[] {
  if (value === undefined) return [];
  if (value.kind === "definitions") {
    return value.entries.flatMap((entry) => [
      { kind: "message", message: entry.term },
      { kind: "message", message: entry.definition },
    ]);
  }
  if (value.kind === "stack") {
    return value.parts.flatMap(richTextDescriptionUnits);
  }
  return [{ kind: "message", message: value.text }];
}

function infoCardDescriptionUnits(
  card: RevealInfoCardModel,
): RevealDescriptionUnit[] {
  const titleUnits =
    card.title === undefined
      ? []
      : [{ kind: "message", message: card.title } as const];
  const bodyUnits = richTextDescriptionUnits(card.body);
  return [
    ...titleUnits,
    ...(!("subtitle" in card) || card.subtitle === undefined
      ? []
      : [{ kind: "message", message: card.subtitle } as const]),
    ...(card.variant === "tide"
      ? canonicalDescription(tideAccessibilityName(card.tide))
      : []),
    ...bodyUnits,
  ];
}

function gameCardDescriptionUnits(
  card: NonNullable<
    Extract<RevealSpec["primary"], { kind: "gameCard" }>["displaySnapshot"]
  >,
): RevealDescriptionUnit[] {
  const energyUnits: RevealDescriptionUnit[] =
    card.energyCosts !== undefined && card.energyCosts.length > 0
      ? card.energyCosts.map((energyCost) => ({
          kind: "message",
          message: txa(
            "Energy cost: {energy_cost}.",
            { energy_cost: energyCost },
            "[accessibility] Complete Energy-cost sentence for a card. energy_cost is one non-negative printed or alternative resource amount.",
          ),
        }))
      : [
          {
            kind: "message",
            message:
              card.energyCost === null
                ? tx(
                    "Energy cost: X.",
                    "[accessibility] Complete Energy-cost sentence for a card whose cost is variable.",
                  )
                : txa(
                    "Energy cost: {energy_cost}.",
                    { energy_cost: card.energyCost },
                    "[accessibility] Complete Energy-cost sentence for a card. energy_cost is one non-negative printed or alternative resource amount.",
                  ),
          },
        ];
  return [
    {
      kind: "message",
      message: txa(
        "Card name: {card_name}.",
        { card_name: card.name },
        "[accessibility] Complete identity sentence for a revealed game card. card_name is the canonical UUID-resolved authored name and has no grammatical-gender metadata.",
      ),
    },
    ...(card.rarity === undefined
      ? []
      : [
          {
            kind: "message" as const,
            message: txa(
              "Rarity: {rarity}.",
              { rarity: card.rarity },
              "[accessibility] Complete rarity sentence for a revealed game card. rarity is the card catalog's authored rarity label.",
            ),
          },
        ]),
    {
      kind: "message",
      message: txa(
        "Card type: {card_type}.",
        { card_type: card.cardType },
        "[accessibility] Complete card-type sentence for a revealed game card. card_type is the authored Character or Event display label.",
      ),
    },
    ...(card.subtype === undefined ||
    card.subtype.trim() === "" ||
    card.subtype === "*"
      ? []
      : [
          {
            kind: "message" as const,
            message: txa(
              "Subtype: {card_subtype}.",
              { card_subtype: card.subtype },
              "[accessibility] Complete subtype sentence for a revealed game card. card_subtype is the authored catalog subtype and remains grammatically opaque.",
            ),
          },
        ]),
    ...energyUnits,
    ...(card.sparkVariable === true
      ? [
          {
            kind: "message" as const,
            message: tx(
              "Spark: X.",
              "[accessibility] Complete Spark sentence for a card whose Spark is variable.",
            ),
          },
        ]
      : card.spark === null
        ? []
        : [
            {
              kind: "message" as const,
              message: txa(
                "Spark: {spark_amount}.",
                { spark_amount: card.spark },
                "[accessibility] Complete Spark sentence for a revealed card. spark_amount is the non-negative printed challenge strength.",
              ),
            },
          ]),
    ...(card.isFast
      ? [
          {
            kind: "message" as const,
            message: tx(
              "This card is Fast.",
              "[accessibility] Complete trait sentence for a Fast game card.",
            ),
          },
        ]
      : []),
    ...(card.isInterrupt === true
      ? [
          {
            kind: "message" as const,
            message: tx(
              "This card has Interrupt.",
              "[accessibility] Complete trait sentence for a game card with Interrupt.",
            ),
          },
        ]
      : []),
    ...(card.reclaimCost == null
      ? []
      : [
          {
            kind: "message" as const,
            message: txa(
              "Reclaim cost: {reclaim_cost}.",
              { reclaim_cost: card.reclaimCost },
              "[accessibility] Complete Reclaim-cost sentence for a revealed game card. reclaim_cost is a non-negative resource amount.",
            ),
          },
        ]),
    ...canonicalDescription(card.renderedText),
  ];
}

function revealDescriptionUnits(spec: RevealSpec): RevealDescriptionUnit[] {
  const primary =
    spec.primary.kind === "source"
      ? [{ kind: "message", message: spec.primary.description } as const]
      : spec.primary.kind === "infoCard"
        ? infoCardDescriptionUnits(spec.primary.card)
        : spec.primary.kind === "galleryAction"
          ? [{ kind: "message", message: spec.primary.action.label } as const]
          : gameCardDescriptionUnits(spec.primary.displaySnapshot);
  return [...primary, ...spec.secondaries.flatMap(infoCardDescriptionUnits)];
}
function isValidGameCard(card: RevealGameCard): boolean {
  return (
    UUID_PATTERN.test(card.cardId) &&
    card.displaySnapshot !== undefined &&
    card.displaySnapshot.id.toLowerCase() === card.cardId.toLowerCase()
  );
}

function isValidRegistration(
  identity: RevealSourceIdentity,
  spec: RevealSpec,
): boolean {
  if (
    identity.entityType.trim() === "" ||
    !UUID_PATTERN.test(identity.entityId)
  )
    return false;
  if (spec.primary.kind === "gameCard" && !isValidGameCard(spec.primary))
    return false;
  if (!(spec.adjacentCards ?? []).every(isValidGameCard)) return false;
  return revealDescriptionUnits(spec).length > 0;
}

interface SourceRegistration {
  readonly descriptionId: string;
  readonly descriptionUnits: readonly RevealDescriptionUnit[];
  readonly source: RevealCoordinatorSource;
  readonly spec: RevealSpec;
  readonly placementException?: RevealPlacementException;
  readonly element: HTMLElement | null;
}
interface RevealCoordinatorValue {
  readonly resolve: ReturnType<typeof useLocalizer>;
  readonly state: ReturnType<typeof reduceRevealState>;
  readonly dispatch: Dispatch<Parameters<typeof reduceRevealState>[1]>;
  readonly registerSource: (
    key: string,
    value: SourceRegistration,
  ) => () => void;
  readonly updateSourceElement: (
    key: string,
    element: HTMLElement | null,
  ) => void;
  readonly unregisterSource: (source: RevealCoordinatorSource) => void;
  readonly beginInteraction: (
    source: RevealCoordinatorSource,
    reason: NonNullable<ReturnType<typeof reduceRevealState>["reason"]>,
    sourceRect: InteractionSnapshot["sourceRect"],
    modality: "mouse" | "pen" | "touch" | "keyboard",
  ) => void;
  readonly isKeyboardFocusEligible: () => boolean;
}

interface InteractionSnapshot {
  readonly id: number;
  readonly registrationId: string;
  readonly reason: NonNullable<ReturnType<typeof reduceRevealState>["reason"]>;
  readonly sourceRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly modality: "mouse" | "pen" | "touch" | "keyboard";
}

function captureSourceRect(
  element: HTMLElement,
): InteractionSnapshot["sourceRect"] {
  const value = element.getBoundingClientRect();
  return Object.freeze({
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  });
}

function overlayInteractionKey(active: RevealOverlayActive): string {
  return `${active.source.registrationId}:${active.reason}:${String(active.interactionId)}`;
}

const RevealCoordinatorContext = createContext<RevealCoordinatorValue | null>(
  null,
);

export function RevealCoordinatorProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const resolve = useLocalizer();
  const parent = useContext(RevealCoordinatorContext);
  if (parent !== null)
    throw new Error(
      "CumulusRoot cannot be nested; mount exactly one CumulusRoot per application entry.",
    );
  const [state, dispatch] = useReducer(
    reduceRevealState,
    initialRevealCoordinatorState,
  );
  const sourcesRef = useRef(new Map<string, SourceRegistration>());
  const keyboardFocusEligibleRef = useRef(true);
  const [, renderDescriptions] = useState(0);
  const registerSource = useCallback(
    (key: string, value: SourceRegistration) => {
      sourcesRef.current.set(key, value);
      renderDescriptions((version) => version + 1);
      return () => {
        sourcesRef.current.delete(key);
        renderDescriptions((version) => version + 1);
      };
    },
    [],
  );
  const updateSourceElement = useCallback(
    (key: string, element: HTMLElement | null) => {
      const source = sourcesRef.current.get(key);
      if (source !== undefined)
        sourcesRef.current.set(key, { ...source, element });
    },
    [],
  );
  const openedInteractionRef = useRef<{
    readonly key: string;
    readonly source: RevealCoordinatorSource;
    readonly interactionId: number;
    readonly reason: NonNullable<typeof state.reason>;
  } | null>(null);
  const [interactionSnapshot, setInteractionSnapshot] =
    useState<InteractionSnapshot | null>(null);
  const interactionEpochRef = useRef(0);
  const interactionSnapshotRef = useRef<InteractionSnapshot | null>(null);
  const beginInteraction = useCallback(
    (
      source: RevealCoordinatorSource,
      reason: InteractionSnapshot["reason"],
      sourceRect: InteractionSnapshot["sourceRect"],
      modality: InteractionSnapshot["modality"],
    ) => {
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
    },
    [],
  );
  const closeOpenedInteraction = useCallback(
    (
      key: string,
      reason: RevealDismissalReason,
      activationOutcome: typeof state.activationOutcome,
    ): boolean => {
      const opened = openedInteractionRef.current;
      if (opened === null || opened.key !== key) return false;
      openedInteractionRef.current = null;
      logRevealClosed({
        source: opened.source.identity,
        interactionId: opened.interactionId,
        reason: opened.reason,
        dismissalReason: reason,
        activationOutcome,
      });
      return true;
    },
    [],
  );
  const unregisterSource = useCallback((source: RevealCoordinatorSource) => {
    dispatch({ type: "source-unmount", source, timestamp: performance.now() });
  }, []);

  useEffect(() => {
    const now = () => performance.now();
    const handleKeyDown = (event: KeyboardEvent) => {
      keyboardFocusEligibleRef.current = true;
      if (event.key === "Escape")
        dispatch({ type: "escape", timestamp: event.timeStamp });
    };
    const handlePointerDown = () => {
      keyboardFocusEligibleRef.current = false;
    };
    // Mobile WebKit can retarget a touch's terminal event away from the source
    // after the reveal portal mounts. Window-level ownership guarantees that
    // every observed release or cancellation closes the active interaction.
    const handlePointerUp = (event: PointerEvent) => {
      dispatch({
        type: "pointer-up",
        pointerId: event.pointerId,
        timestamp: event.timeStamp,
      });
    };
    const handlePointerCancel = (event: PointerEvent) => {
      dispatch({
        type: "pointer-cancel",
        pointerId: event.pointerId,
        timestamp: event.timeStamp,
      });
    };
    const events = [
      [window, "resize", () => dispatch({ type: "resize", timestamp: now() })],
      [
        window,
        "orientationchange",
        () => dispatch({ type: "orientation-change", timestamp: now() }),
      ],
      [
        window,
        "blur",
        () => dispatch({ type: "window-blur", timestamp: now() }),
      ],
      [
        window,
        "popstate",
        () => dispatch({ type: "route-change", timestamp: now() }),
      ],
      [
        window,
        "hashchange",
        () => dispatch({ type: "route-change", timestamp: now() }),
      ],
    ] as const;
    const handleVisualViewportResize = () =>
      dispatch({ type: "resize", timestamp: now() });
    const handleScroll = () => dispatch({ type: "scroll", timestamp: now() });
    const handleDragStart = () => dispatch({ type: "drag", timestamp: now() });
    const pushStateDescriptor = Object.getOwnPropertyDescriptor(
      window.history,
      "pushState",
    );
    const replaceStateDescriptor = Object.getOwnPropertyDescriptor(
      window.history,
      "replaceState",
    );
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(
      window.history,
    );
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
    for (const [target, name, handler] of events)
      target.addEventListener(name, handler);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("dragstart", handleDragStart, true);
    window.visualViewport?.addEventListener?.(
      "resize",
      handleVisualViewportResize,
    );
    return () => {
      for (const [target, name, handler] of events)
        target.removeEventListener(name, handler);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("dragstart", handleDragStart, true);
      window.visualViewport?.removeEventListener?.(
        "resize",
        handleVisualViewportResize,
      );
      if (window.history.pushState === pushState) {
        if (pushStateDescriptor === undefined)
          delete (window.history as Partial<History>).pushState;
        else
          Object.defineProperty(
            window.history,
            "pushState",
            pushStateDescriptor,
          );
      }
      if (window.history.replaceState === replaceState) {
        if (replaceStateDescriptor === undefined)
          delete (window.history as Partial<History>).replaceState;
        else
          Object.defineProperty(
            window.history,
            "replaceState",
            replaceStateDescriptor,
          );
      }
    };
  }, []);

  const isKeyboardFocusEligible = useCallback(
    () => keyboardFocusEligibleRef.current,
    [],
  );
  const value = useMemo(
    () => ({
      resolve,
      state,
      dispatch,
      registerSource,
      updateSourceElement,
      unregisterSource,
      beginInteraction,
      isKeyboardFocusEligible,
    }),
    [
      resolve,
      state,
      registerSource,
      updateSourceElement,
      unregisterSource,
      beginInteraction,
      isKeyboardFocusEligible,
    ],
  );
  const activeRegistration =
    state.activeRegistrationId === null
      ? undefined
      : sourcesRef.current.get(state.activeRegistrationId);
  useLayoutEffect(() => {
    if (state.reason !== "focus" || activeRegistration?.element == null) return;
    const snapshot = interactionSnapshotRef.current;
    if (
      snapshot?.registrationId === activeRegistration.source.registrationId &&
      snapshot.reason === "focus"
    )
      return;
    beginInteraction(
      activeRegistration.source,
      "focus",
      captureSourceRect(activeRegistration.element),
      "keyboard",
    );
  }, [activeRegistration, beginInteraction, state.reason]);
  const liveOverlayActive: RevealOverlayActive | null =
    activeRegistration?.element !== null &&
    activeRegistration?.element !== undefined &&
    state.reason !== null &&
    state.phase !== "touch-pending" &&
    interactionSnapshot !== null &&
    interactionSnapshot.registrationId ===
      activeRegistration.source.registrationId &&
    interactionSnapshot.reason === state.reason
      ? {
          source: activeRegistration.source,
          spec: activeRegistration.spec,
          ...(activeRegistration.placementException === undefined
            ? {}
            : { placementException: activeRegistration.placementException }),
          element: activeRegistration.element,
          reason: state.reason,
          interactionId: interactionSnapshot.id,
          sourceRect: interactionSnapshot.sourceRect,
          modality: interactionSnapshot.modality,
          ...(state.touch?.startPoint === undefined
            ? {}
            : { touchPoint: state.touch.startPoint }),
          sourceShowsCompleteGameCard:
            activeRegistration.element.dataset.revealCompleteGameCard ===
            "true",
          sourceIsBattlefieldGameCard:
            activeRegistration.element.dataset.gameCardPresentation ===
            "battlefield",
          sourceRemainsVisible:
            activeRegistration.element.dataset.revealSourceRetain === "true",
        }
      : null;
  const overlayActive = liveOverlayActive;
  const overlayKey =
    overlayActive === null ? null : overlayInteractionKey(overlayActive);
  useEffect(() => {
    const opened = openedInteractionRef.current;
    if (opened !== null && opened.key !== overlayKey) {
      closeOpenedInteraction(
        opened.key,
        state.dismissalReason ?? "replaced",
        state.activationOutcome,
      );
    }
  }, [
    closeOpenedInteraction,
    overlayKey,
    state.activationOutcome,
    state.dismissalReason,
  ]);
  const handlePlaced = useCallback<
    NonNullable<ComponentProps<typeof RevealOverlay>["onPlaced"]>
  >(
    (decision, geometry) => {
      if (overlayActive === null) return;
      const openKey = overlayInteractionKey(overlayActive);
      if (openedInteractionRef.current?.key === openKey) return;
      if (openedInteractionRef.current !== null) {
        closeOpenedInteraction(
          openedInteractionRef.current.key,
          "replaced",
          "none",
        );
      }
      const primary = overlayActive.spec.primary;
      logRevealOpened({
        source: overlayActive.source.identity,
        interactionId: overlayActive.interactionId,
        primary: {
          kind: primary.kind,
          variant:
            primary.kind === "source"
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
      openedInteractionRef.current = {
        key: openKey,
        source: overlayActive.source,
        interactionId: overlayActive.interactionId,
        reason: overlayActive.reason,
      };
    },
    [closeOpenedInteraction, overlayActive],
  );
  return (
    <RevealCoordinatorContext.Provider value={value}>
      {children}
      <RevealOverlay active={overlayActive} onPlaced={handlePlaced} />
      <div hidden data-cumulus-reveal-descriptions="">
        {[...sourcesRef.current.entries()].map(([key, source]) => (
          <span id={source.descriptionId} key={key}>
            {source.descriptionUnits.map((unit, index) => (
              <span key={String(index)}>{resolve(unit.message)}</span>
            ))}
          </span>
        ))}
      </div>
    </RevealCoordinatorContext.Provider>
  );
}

export interface RevealSourceRegistration {
  readonly identity: RevealSourceIdentity;
  readonly spec: RevealSpec;
  /**
   * The one-off Augury OfferTile exception to normal beside-source
   * desktop placement. Ordinary reveal sources must leave this unset.
   */
  readonly placementException?: RevealPlacementException;
  readonly onActivate?: () => void;
  /** Source feedback policy. Readable inline copy stays stationary. */
  readonly feedback?: RevealFeedback;
}

export interface RevealSourceBinding {
  readonly ref: RefCallback<HTMLElement>;
  readonly sourceProps: Pick<
    HTMLAttributes<HTMLElement>,
    | "aria-describedby"
    | "onPointerEnter"
    | "onPointerLeave"
    | "onPointerDown"
    | "onPointerMove"
    | "onPointerUp"
    | "onPointerCancel"
    | "onFocus"
    | "onBlur"
  > & {
    readonly "data-reveal-active": "true" | "false";
    readonly "data-reveal-feedback": "measured" | "stationary";
    readonly "data-reveal-entity-type": string;
    readonly "data-reveal-entity-id": string;
    readonly "data-reveal-primary-variant": string;
    readonly "data-reveal-placement-exception"?: RevealPlacementException;
    readonly "data-reveal-secondary-titles": string;
    readonly style: CSSProperties;
  };
}

/** Private binding for named Cumulus entity components. */
export function useRevealSource(
  registration: RevealSourceRegistration,
): RevealSourceBinding {
  const coordinator = useContext(RevealCoordinatorContext);
  if (coordinator === null)
    throw new Error(
      "Semantic Cumulus reveal sources require one mounted CumulusRoot.",
    );
  const resolve = coordinator.resolve;
  const reactId = useId();
  const descriptionId = `cumulus-reveal-description-${reactId.replace(/:/g, "")}`;
  const valid = isValidRegistration(registration.identity, registration.spec);
  const identity = registration.identity;
  const registrationKey = `cumulus-reveal-source-${reactId.replace(/:/g, "")}`;
  const mountedSource: RevealCoordinatorSource = {
    identity,
    registrationId: registrationKey,
  };
  const spec = registration.spec;
  const descriptionUnits = valid ? revealDescriptionUnits(spec) : [];
  const descriptionFingerprint = descriptionUnits
    .map((unit) => `message:${unit.message.toCanonicalJSON()}`)
    .join("\u001e");
  const specFingerprint = [
    spec.primary.kind,
    descriptionFingerprint,
    spec.primary.kind === "gameCard" ? spec.primary.cardId : "",
    spec.secondaries.map(infoCardVariant).join(","),
    (spec.adjacentCards ?? []).map((card) => card.cardId).join(","),
  ].join("\u001f");
  const placementException = registration.placementException;
  const activate = registration.onActivate;
  const feedbackVariant = registration.feedback ?? "scale";
  const [feedback, setFeedback] = useState(() =>
    feedbackForRect({ width: 1, height: 1 }, feedbackVariant),
  );
  const nodeRef = useRef<HTMLElement | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerSource = coordinator.registerSource;
  const unregisterSource = coordinator.unregisterSource;

  useEffect(() => {
    if (!valid) {
      logEvent("cumulus_entity_reveal_invalid_source", {
        sourceEntityType: identity.entityType,
        sourceEntityId: identity.entityId,
        reason: "malformed-semantic-data",
      });
      return;
    }
    const unregisterRegistration = registerSource(registrationKey, {
      descriptionId,
      descriptionUnits,
      source: mountedSource,
      spec,
      ...(placementException === undefined ? {} : { placementException }),
      element: nodeRef.current,
    });
    return () => {
      if (intentTimer.current !== null) clearTimeout(intentTimer.current);
      unregisterRegistration();
      unregisterSource(mountedSource);
    };
  }, [
    registerSource,
    unregisterSource,
    descriptionId,
    descriptionFingerprint,
    identity.entityId,
    identity.entityType,
    placementException,
    registrationKey,
    specFingerprint,
    valid,
  ]);

  const ref = useCallback<RefCallback<HTMLElement>>(
    (node) => {
      nodeRef.current = node;
      coordinator.updateSourceElement(registrationKey, node);
    },
    [coordinator.updateSourceElement, registrationKey],
  );
  const active = valid && sameSource(coordinator.state, mountedSource);
  const measureFeedback = (
    sourceRect: InteractionSnapshot["sourceRect"],
  ): void => {
    setFeedback(feedbackForRect(sourceRect, feedbackVariant));
  };
  return {
    ref,
    sourceProps: {
      "aria-describedby": valid ? descriptionId : undefined,
      "data-reveal-active": active ? "true" : "false",
      "data-reveal-feedback":
        feedbackVariant === "stationary" ? "stationary" : "measured",
      "data-reveal-entity-type": identity.entityType,
      "data-reveal-entity-id": identity.entityId,
      "data-reveal-primary-variant":
        spec.primary.kind === "source"
          ? "source"
          : spec.primary.kind === "gameCard"
            ? "gameCard"
            : spec.primary.kind === "galleryAction"
              ? "galleryAction"
              : (spec.primary.card.variant ?? "text"),
      "data-reveal-placement-exception": placementException,
      "data-reveal-secondary-titles": spec.secondaries
        .map((card) => (card.title === undefined ? "" : resolve(card.title)))
        .join("\u001f"),
      style: {
        "--reveal-press-scale": String(feedback.pressScale),
        "--reveal-hover-scale": String(feedback.hoverScale),
      } as CSSProperties,
      onPointerEnter: (event) => {
        if (valid) {
          const hoverCapable =
            event.pointerType === "mouse" ||
            (event.pointerType === "pen" &&
              event.buttons === 0 &&
              event.pressure === 0);
          if (hoverCapable && coordinator.state.touch === null) {
            const sourceRect = captureSourceRect(event.currentTarget);
            coordinator.beginInteraction(
              mountedSource,
              "hover",
              sourceRect,
              event.pointerType === "pen" ? "pen" : "mouse",
            );
            measureFeedback(sourceRect);
          }
          coordinator.dispatch({
            type: "pointer-enter",
            source: mountedSource,
            pointerType: event.pointerType,
            hoverCapable,
            timestamp: event.timeStamp,
          });
        }
      },
      onPointerLeave: (event) => {
        if (event.pointerType !== "touch" && intentTimer.current !== null) {
          clearTimeout(intentTimer.current);
          intentTimer.current = null;
        }
        if (valid) {
          coordinator.dispatch({
            type: "pointer-leave",
            source: mountedSource,
            pointerId: event.pointerId,
            timestamp: event.timeStamp,
          });
        }
      },
      onPointerDown: (event) => {
        if (!valid) return;
        const sourceRect = captureSourceRect(event.currentTarget);
        if (event.pointerType === "touch" && coordinator.state.touch === null)
          coordinator.beginInteraction(
            mountedSource,
            "press",
            sourceRect,
            "touch",
          );
        measureFeedback(sourceRect);
        coordinator.dispatch({
          type: "pointer-down",
          source: mountedSource,
          pointerType: event.pointerType,
          pointerId: event.pointerId,
          point: { x: event.clientX, y: event.clientY },
          hasAction: activate !== undefined,
          timestamp: event.timeStamp,
        });
        if (event.pointerType === "touch") {
          intentTimer.current = setTimeout(
            () =>
              coordinator.dispatch({
                type: "intent-elapsed",
                pointerId: event.pointerId,
                timestamp: event.timeStamp + REVEAL_INTENT_MS,
              }),
            REVEAL_INTENT_MS,
          );
        }
      },
      onPointerMove: (event) => {
        if (valid)
          coordinator.dispatch({
            type: "pointer-move",
            pointerId: event.pointerId,
            point: { x: event.clientX, y: event.clientY },
            timestamp: event.timeStamp,
          });
      },
      onPointerUp: (event) => {
        if (!valid) return;
        if (intentTimer.current !== null) {
          clearTimeout(intentTimer.current);
          intentTimer.current = null;
        }
        const touch = coordinator.state.touch;
        const shouldActivate =
          touch?.pointerId === event.pointerId &&
          activationOutcomeForTouch(touch, event.timeStamp) === "fired" &&
          activate !== undefined;
        coordinator.dispatch({
          type: "pointer-up",
          pointerId: event.pointerId,
          timestamp: event.timeStamp,
        });
        if (shouldActivate) activate();
      },
      onPointerCancel: (event) => {
        if (intentTimer.current !== null) {
          clearTimeout(intentTimer.current);
          intentTimer.current = null;
        }
        if (valid)
          coordinator.dispatch({
            type: "pointer-cancel",
            pointerId: event.pointerId,
            timestamp: event.timeStamp,
          });
      },
      onFocus: (event) => {
        if (valid && coordinator.isKeyboardFocusEligible()) {
          const sourceRect = captureSourceRect(event.currentTarget);
          coordinator.beginInteraction(
            mountedSource,
            "focus",
            sourceRect,
            "keyboard",
          );
          measureFeedback(sourceRect);
          coordinator.dispatch({
            type: "focus",
            source: mountedSource,
            timestamp: event.timeStamp,
          });
        }
      },
      onBlur: (event) => {
        if (valid)
          coordinator.dispatch({
            type: "blur",
            source: mountedSource,
            timestamp: event.timeStamp,
          });
      },
    },
  };
}
