import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  useActions,
  useConfirmedGameState,
  useGameState,
} from "../coop/hooks";
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

function visibleCardIds(stage: HTMLElement): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const card of stage.querySelectorAll<HTMLElement>(
    '[data-game-card-source][data-card-id]',
  )) {
    if (card.closest("[data-card-tutorial-guidance]") !== null) continue;
    const rect = card.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const cardId = card.dataset.cardId;
    if (cardId === undefined || seen.has(cardId)) continue;
    seen.add(cardId);
    ids.push(cardId);
  }
  return ids;
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
  const presentation = state.cardTutorialPresentation ?? null;
  const siteTutorialActive =
    activeFirstVisitTutorialSite(state.journey) !== null;
  const view = useMemo(
    () =>
      buildCardTutorialGuidanceView(
        siteTutorialActive ? null : presentation,
        cardDatabase,
      ),
    [cardDatabase, presentation, siteTutorialActive],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (
      stage === null ||
      screenKey === null ||
      presentation !== null ||
      (state.cardTutorialScreenKeysSeen ?? []).includes(screenKey)
    ) {
      return undefined;
    }

    const inspect = (): void => {
      if (triggerEvent === null) return;
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
    presentation,
    provider,
    screenKey,
    stageRef,
    state.cardTutorialScreenKeysSeen,
    state.tutorialTriggerIdsSeen,
    triggerEvent,
  ]);

  const complete = useCallback(
    (reason: "timer" | "manual") => {
      const confirmed = confirmedState.cardTutorialPresentation ?? null;
      if (confirmed === null) return;
      logEvent("card_tutorial_guidance_advance_requested", {
        presentationId: confirmed.id,
        screenKey: confirmed.screenKey,
        cardId: confirmed.cardId,
        triggerId: confirmed.triggerId,
        reason,
      });
      void actions
        .completeCardTutorialGuidance(confirmed.id, confirmed.screenKey)
        .catch(() => undefined);
    },
    [actions, confirmedState.cardTutorialPresentation],
  );

  useEffect(() => {
    const confirmed = confirmedState.cardTutorialPresentation ?? null;
    if (confirmed === null) return;
    logEvent("card_tutorial_guidance_presented", {
      presentationId: confirmed.id,
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
