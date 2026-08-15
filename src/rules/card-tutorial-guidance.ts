import type { CardData } from "../types/cards";
import type { JourneyState, SiteState } from "../types/journey";
import type { TutorialTriggerDefinition } from "../types/tutorial";
import { activeFirstVisitTutorialSite } from "../data/site-tutorial-guidance";
import type { FoldState } from "./fold-state";
import { matchTutorialGuidance } from "./battle/tutorial-guidance";
import { tutorialSpeechBubbleDelaySeconds } from "../data/tutorial-speech-bubble";
import { parseCardId } from "../types/card-identity";
import type { CardId } from "../types/card-identity";
import {
  parseCardTutorialScreenKey,
  parsePresentationId,
} from "../types/identifiers";
import type {
  CardTutorialScreenKey,
  PresentationId,
  TutorialTriggerId,
} from "../types/identifiers";

export interface CardTutorialGuidancePresentation {
  readonly id: PresentationId;
  readonly screenKey: CardTutorialScreenKey;
  readonly cardId: CardId | null;
  readonly triggerId: TutorialTriggerId;
  readonly speaker: TutorialTriggerDefinition["speaker"];
  readonly text: string;
  readonly delay?: number;
  readonly duration: number;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
}

export interface CardTutorialGuidanceMatch {
  readonly card: CardData | null;
  readonly trigger: TutorialTriggerDefinition;
}

export interface CardTutorialGuidanceContext {
  readonly screenKey: CardTutorialScreenKey;
  readonly event: "card-seen" | "transfiguration-seen";
  /** Local presentation milestone that must be visible before requesting guidance. */
  readonly visibilityGate?: "exploration-actions";
}

export interface CardTutorialGuidanceContentProvider {
  readonly triggers: readonly TutorialTriggerDefinition[];
  cardById(cardId: CardId): CardData | undefined;
  hasVisibleTransfigurationReward(
    journey: JourneyState,
    site: SiteState,
  ): boolean;
}

let contentProvider: CardTutorialGuidanceContentProvider | null = null;

/** Register deterministic card and tutorial content before the room log folds. */
export function registerCardTutorialGuidanceContentProvider(
  provider: CardTutorialGuidanceContentProvider | null,
): void {
  contentProvider = provider;
}

function currentTutorialSite(state: FoldState): SiteState | null {
  if (
    state.battle !== null ||
    !state.journey.hasSeenStartingDeckPopup ||
    state.journey.screen.type !== "site" ||
    activeFirstVisitTutorialSite(state.journey) !== null
  ) {
    return null;
  }
  const siteId = state.journey.screen.siteId;
  const site = Object.values(state.journey.atlas.nodes)
    .flatMap((node) => node.sites)
    .find((candidate) => candidate.id === siteId);
  return site ?? null;
}

/** Resolve the supplemental tutorial event exposed by the current site surface. */
export function currentCardTutorialContext(
  state: FoldState,
  provider: CardTutorialGuidanceContentProvider | null = contentProvider,
): CardTutorialGuidanceContext | null {
  const runId = state.journey.runId;
  const site = currentTutorialSite(state);
  if (runId === null || site === null) return null;
  const siteId = site.id;
  const siteScreenKey = `${state.journey.runId}:site:${siteId}`;
  if (site.type === "Transfiguration") {
    const runtime = state.journey.siteRuntime[siteId];
    return runtime?.kind === "cardChoice" &&
      runtime.choiceKind === "transfiguration" &&
      runtime.transfigurationOffers.length > 0
      ? {
          screenKey: parseCardTutorialScreenKey(
            `${siteScreenKey}:concept:transfiguration`,
          ),
          event: "transfiguration-seen",
        }
      : null;
  }
  if (
    site.type === "Exploration" &&
    provider?.hasVisibleTransfigurationReward(state.journey, site) === true
  ) {
    return {
      screenKey: parseCardTutorialScreenKey(
        `${siteScreenKey}:concept:transfiguration`,
      ),
      event: "transfiguration-seen",
      visibilityGate: "exploration-actions",
    };
  }
  if (
    site.type === "Augury" &&
    provider?.hasVisibleTransfigurationReward(state.journey, site) === true
  ) {
    return {
      screenKey: parseCardTutorialScreenKey(
        `${siteScreenKey}:concept:transfiguration`,
      ),
      event: "transfiguration-seen",
    };
  }
  if (site.type !== "Draft") return null;

  const draft = state.journey.draftState;
  if (
    draft === null ||
    draft.activeSiteId !== siteId ||
    draft.currentOffer.length === 0
  ) {
    return null;
  }
  return {
    screenKey: parseCardTutorialScreenKey(
      `${siteScreenKey}:draft-offer:${String(draft.pickNumber)}:` +
        draft.currentOffer.join(","),
    ),
    event: "card-seen",
  };
}

/** Stable identity for one supplemental tutorial on the current site surface. */
export function currentCardTutorialScreenKey(
  state: FoldState,
  provider?: CardTutorialGuidanceContentProvider | null,
): CardTutorialScreenKey | null {
  return currentCardTutorialContext(state, provider)?.screenKey ?? null;
}

/** Whether visible UUIDs resolve to the authoritative persisted Draft offer. */
export function cardIdsMatchCurrentDraftOffer(
  state: FoldState,
  cardIds: readonly CardId[],
  provider: CardTutorialGuidanceContentProvider,
): boolean {
  const site = currentTutorialSite(state);
  if (site?.type !== "Draft") return true;
  const draft = state.journey.draftState;
  if (
    draft === null ||
    draft.activeSiteId !== site.id ||
    cardIds.length !== draft.currentOffer.length
  ) {
    return false;
  }
  const offeredNumbers = new Set(draft.currentOffer);
  const visibleNumbers = cardIds.map(
    (cardId) => provider.cardById(cardId)?.cardNumber,
  );
  return (
    visibleNumbers.every(
      (cardNumber): cardNumber is number =>
        cardNumber !== undefined && offeredNumbers.has(cardNumber),
    ) && new Set(visibleNumbers).size === cardIds.length
  );
}

/**
 * Pick the first visible card with an unseen card-seen trigger. Card order is
 * the screen's display order; the existing trigger matcher owns priority and
 * authored source-order tie breaking within that card.
 */
export function selectCardTutorialGuidance(
  provider: CardTutorialGuidanceContentProvider,
  cardIds: readonly CardId[],
  seenTriggerIds: ReadonlySet<TutorialTriggerId>,
  event: "card-seen" | "transfiguration-seen" = "card-seen",
): CardTutorialGuidanceMatch | null {
  if (event === "transfiguration-seen") {
    const trigger = matchTutorialGuidance(provider.triggers, {
      event,
      renderedText: "",
      seenTriggerIds,
    })[0];
    return trigger === undefined ? null : { card: null, trigger };
  }
  const visitedCardIds = new Set<CardId>();
  for (const cardId of cardIds) {
    if (visitedCardIds.has(cardId)) continue;
    visitedCardIds.add(cardId);
    const card = provider.cardById(cardId);
    if (card === undefined) continue;
    const matches = matchTutorialGuidance(provider.triggers, {
      event: "card-seen",
      cardId: card.id,
      renderedText: card.renderedText,
      cardKind: card.cardType === "Event" ? "event" : "character",
      seenTriggerIds,
    });
    const trigger = matches[0];
    if (trigger !== undefined) return { card, trigger };
  }
  return null;
}

/** Open one shared, first-occurrence tutorial for the current site screen. */
export function openCardTutorialGuidance(
  state: FoldState,
  payload: Record<string, unknown>,
): FoldState | null {
  const context = currentCardTutorialContext(state);
  const screenKey = context?.screenKey ?? null;
  if (
    context === null ||
    screenKey === null ||
    payload.screenKey !== screenKey ||
    !Array.isArray(payload.cardIds) ||
    (context?.event === "card-seen" && payload.cardIds.length === 0) ||
    payload.cardIds.length > 100 ||
    !payload.cardIds.every((cardId) => typeof cardId === "string") ||
    new Set(payload.cardIds).size !== payload.cardIds.length ||
    (state.cardTutorialPresentation ?? null) !== null ||
    (state.cardTutorialScreenKeysSeen ?? []).includes(screenKey) ||
    contentProvider === null ||
    !cardIdsMatchCurrentDraftOffer(
      state,
      payload.cardIds.map(parseCardId),
      contentProvider,
    )
  ) {
    return null;
  }

  const cardIds = payload.cardIds.map(parseCardId);
  const match = selectCardTutorialGuidance(
    contentProvider,
    cardIds,
    new Set(state.tutorialTriggerIdsSeen ?? []),
    context.event,
  );
  if (match === null) return null;

  const triggerIdsSeen = new Set(state.tutorialTriggerIdsSeen ?? []);
  triggerIdsSeen.add(match.trigger.id);
  return {
    ...state,
    tutorialTriggerIdsSeen: [...triggerIdsSeen],
    cardTutorialScreenKeysSeen: [
      ...(state.cardTutorialScreenKeysSeen ?? []),
      screenKey,
    ],
    cardTutorialPresentation: {
      id: parsePresentationId(
        `card-tutorial:${screenKey}:${match.card?.id ?? "site"}:${match.trigger.id}`,
      ),
      screenKey,
      cardId: match.card?.id ?? null,
      triggerId: match.trigger.id,
      speaker: match.trigger.speaker,
      text: match.trigger.text,
      delay: tutorialSpeechBubbleDelaySeconds(match.trigger, context.event),
      duration: match.trigger.duration,
      horizontalOffset: match.trigger.horizontalOffset,
      verticalOffset: match.trigger.verticalOffset,
      bubbleWidth: match.trigger.bubbleWidth,
    },
  };
}

/** Clear the exact shared card tutorial after its authored dwell or dismissal. */
export function completeCardTutorialGuidance(
  state: FoldState,
  payload: Record<string, unknown>,
): FoldState | null {
  const presentation = state.cardTutorialPresentation ?? null;
  if (presentation === null || payload.presentationId !== presentation.id) {
    return null;
  }
  return { ...state, cardTutorialPresentation: null };
}

/**
 * Keep guidance for exactly the site surface or persisted Draft offer that
 * opened it. Normal site actions remain available; the first action that moves
 * to another surface retires the guidance with that same folded transition.
 */
export function reconcileCardTutorialGuidance(state: FoldState): FoldState {
  const presentation = state.cardTutorialPresentation ?? null;
  if (
    presentation === null ||
    currentCardTutorialScreenKey(state) === presentation.screenKey
  ) {
    return state;
  }
  return { ...state, cardTutorialPresentation: null };
}
