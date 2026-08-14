import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useActions, useConfirmedGameState, useGameState } from "../coop/hooks";
import { logEvent } from "../logging";
import {
  cardIdsMatchCurrentDraftOffer,
  currentCardTutorialContext,
  selectCardTutorialGuidance,
} from "../rules/card-tutorial-guidance";
import { useJourney } from "../state/journey-context";
import { BattleTutorialGuidance } from "../cumulus/screens/BattleTutorialGuidance";
import { buildCardTutorialGuidanceView } from "../screens/cumulus_adapters/card-tutorial-guidance-view-model";
import { createCardTutorialGuidanceContentProvider } from "../coop/providers/card-tutorial-guidance-provider";
import { activeFirstVisitTutorialSite } from "../data/site-tutorial-guidance";
import { asPresentationId } from "../types/identifiers";
import { asCardId } from "../types/card-identity";
import type { CardId } from "../types/card-identity";

function visibleCardIds(stage: HTMLElement): readonly CardId[] {
  const ids: CardId[] = [];
  const seen = new Set<CardId>();
  for (const card of stage.querySelectorAll<HTMLElement>(
    "[data-game-card-source][data-card-id]",
  )) {
    if (card.closest("[data-card-tutorial-guidance]") !== null) continue;
    const rect = card.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const cardId = card.dataset.cardId;
    if (cardId === undefined) continue;
    const identity = asCardId(cardId);
    if (seen.has(identity)) continue;
    seen.add(identity);
    ids.push(identity);
  }
  return ids;
}

function tutorialContextIsVisible(
  stage: HTMLElement,
  visibilityGate: "exploration-actions" | undefined,
): boolean {
  if (visibilityGate === undefined) return true;
  const source = stage.querySelector<HTMLElement>(
    '[data-tutorial-guidance-concept="exploration-actions"]',
  );
  if (source === null) return false;
  const rect = source.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * App-shell bridge between visible site cards and the shared tutorial fold.
 * Screens remain props-only; the first connected client to observe the cards
 * submits the same run/site-scoped intent as every other client.
 */
export function JourneyCardTutorialController({
  stageRef,
}: {
  readonly stageRef: RefObject<HTMLElement | null>;
}) {
  const state = useGameState();
  const confirmedState = useConfirmedGameState();
  const actions = useActions();
  const { journeyContent, cardDatabase } = useJourney();
  const attemptedSignatureRef = useRef<string | null>(null);
  const provider = useMemo(
    () => createCardTutorialGuidanceContentProvider(journeyContent),
    [journeyContent],
  );
  const context = currentCardTutorialContext(state, provider);
  const screenKey = context?.screenKey ?? null;
  const triggerEvent = context?.event ?? null;
  const visibilityGate = context?.visibilityGate;
  const [visibilityGateReady, setVisibilityGateReady] = useState(false);
  const presentationLocallyVisible =
    visibilityGate === undefined || visibilityGateReady;
  const presentation = state.cardTutorialPresentation ?? null;
  const siteTutorialActive =
    activeFirstVisitTutorialSite(state.journey) !== null;
  const view = useMemo(
    () =>
      buildCardTutorialGuidanceView(
        siteTutorialActive || !presentationLocallyVisible ? null : presentation,
        cardDatabase,
      ),
    [
      cardDatabase,
      presentation,
      presentationLocallyVisible,
      siteTutorialActive,
    ],
  );

  useEffect(() => {
    const stage = stageRef.current;
    const inspect = (): void => {
      setVisibilityGateReady(
        stage !== null && tutorialContextIsVisible(stage, visibilityGate),
      );
    };
    inspect();
    if (stage === null || visibilityGate === undefined) return undefined;
    const observer = new MutationObserver(inspect);
    observer.observe(stage, {
      attributeFilter: ["data-tutorial-guidance-concept"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [screenKey, stageRef, visibilityGate]);

  useEffect(() => {
    const stage = stageRef.current;
    if (
      stage === null ||
      screenKey === null ||
      !presentationLocallyVisible ||
      presentation !== null ||
      (state.cardTutorialScreenKeysSeen ?? []).includes(screenKey)
    ) {
      return undefined;
    }

    const inspect = (): void => {
      if (triggerEvent === null) return;
      if (!tutorialContextIsVisible(stage, visibilityGate)) return;
      const cardIds = triggerEvent === "card-seen" ? visibleCardIds(stage) : [];
      if (triggerEvent === "card-seen" && cardIds.length === 0) return;
      const signature = `${screenKey}:${cardIds.join(",")}`;
      if (attemptedSignatureRef.current === signature) return;
      attemptedSignatureRef.current = signature;
      if (!cardIdsMatchCurrentDraftOffer(state, cardIds, provider)) return;
      const match = selectCardTutorialGuidance(
        provider,
        cardIds,
        new Set(state.tutorialTriggerIdsSeen ?? []),
        triggerEvent,
      );
      if (match === null) return;
      logEvent("card_tutorial_guidance_open_requested", {
        screenKey,
        cardId: match.card?.id ?? null,
        triggerId: match.trigger.id,
        triggerEvent,
        visibleCardIds: cardIds,
      });
      void actions
        .openCardTutorialGuidance(screenKey, cardIds)
        .catch(() => undefined);
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(stage, {
      attributeFilter: ["data-card-id"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
    };
  }, [
    actions,
    presentationLocallyVisible,
    presentation,
    provider,
    screenKey,
    stageRef,
    state.cardTutorialScreenKeysSeen,
    state.tutorialTriggerIdsSeen,
    triggerEvent,
    visibilityGate,
  ]);

  const complete = useCallback(
    (reason: "timer" | "manual") => {
      const confirmed = confirmedState.cardTutorialPresentation ?? null;
      if (confirmed === null) return;
      logEvent("card_tutorial_guidance_advance_requested", {
        presentationId: asPresentationId(confirmed.id),
        screenKey: confirmed.screenKey,
        cardId: confirmed.cardId,
        triggerId: confirmed.triggerId,
        reason,
      });
      void actions
        .completeCardTutorialGuidance(
          asPresentationId(confirmed.id),
          confirmed.screenKey,
        )
        .catch(() => undefined);
    },
    [actions, confirmedState.cardTutorialPresentation],
  );

  useEffect(() => {
    const confirmed = confirmedState.cardTutorialPresentation ?? null;
    if (confirmed === null) return;
    logEvent("card_tutorial_guidance_presented", {
      presentationId: asPresentationId(confirmed.id),
      screenKey: confirmed.screenKey,
      cardId: confirmed.cardId,
      triggerId: confirmed.triggerId,
      speaker: confirmed.speaker,
      delay: confirmed.delay,
      duration: confirmed.duration,
      horizontalOffset: confirmed.horizontalOffset,
      verticalOffset: confirmed.verticalOffset,
      bubbleWidth: confirmed.bubbleWidth,
    });
  }, [confirmedState.cardTutorialPresentation]);

  return (
    <BattleTutorialGuidance
      view={view}
      onDismiss={() => complete("manual")}
      onDurationComplete={() => complete("timer")}
    />
  );
}
