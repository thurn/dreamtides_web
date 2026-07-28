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
  currentCardTutorialScreenKey,
  selectCardTutorialGuidance,
} from "../rules/card-tutorial-guidance";
import { useJourney } from "../state/journey-context";
import { BattleTutorialGuidance } from "../cumulus/screens/BattleTutorialGuidance";
import { buildCardTutorialGuidanceView } from "../screens/cumulus_adapters/card-tutorial-guidance-view-model";
import { createCardTutorialGuidanceContentProvider } from "../coop/providers/card-tutorial-guidance-provider";

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
  const screenKey = currentCardTutorialScreenKey(state);
  const presentation = state.cardTutorialPresentation ?? null;
  const view = useMemo(
    () => buildCardTutorialGuidanceView(presentation, cardDatabase),
    [cardDatabase, presentation],
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
      const cardIds = visibleCardIds(stage);
      if (cardIds.length === 0) return;
      const signature = `${screenKey}:${cardIds.join(",")}`;
      if (attemptedSignatureRef.current === signature) return;
      const match = selectCardTutorialGuidance(
        provider,
        cardIds,
        new Set(state.tutorialTriggerIdsSeen ?? []),
      );
      attemptedSignatureRef.current = signature;
      if (match === null) return;
      logEvent("card_tutorial_guidance_open_requested", {
        screenKey,
        cardId: match.card.id,
        triggerId: match.trigger.id,
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
    return () => observer.disconnect();
  }, [
    actions,
    presentation,
    provider,
    screenKey,
    stageRef,
    state.cardTutorialScreenKeysSeen,
    state.tutorialTriggerIdsSeen,
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
      duration: confirmed.duration,
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
