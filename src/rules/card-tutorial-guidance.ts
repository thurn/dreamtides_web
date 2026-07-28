import type { CardData } from "../types/cards";
import type { TutorialTriggerDefinition } from "../types/tutorial";
import type { FoldState } from "./fold-state";
import { matchTutorialGuidance } from "./battle/tutorial-guidance";

export interface CardTutorialGuidancePresentation {
  readonly id: string;
  readonly screenKey: string;
  readonly cardId: string;
  readonly triggerId: string;
  readonly speaker: TutorialTriggerDefinition["speaker"];
  readonly text: string;
  readonly duration: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
}

export interface CardTutorialGuidanceMatch {
  readonly card: CardData;
  readonly trigger: TutorialTriggerDefinition;
}

export interface CardTutorialGuidanceContentProvider {
  readonly triggers: readonly TutorialTriggerDefinition[];
  cardById(cardId: string): CardData | undefined;
}

let contentProvider: CardTutorialGuidanceContentProvider | null = null;

/** Register deterministic card and tutorial content before the room log folds. */
export function registerCardTutorialGuidanceContentProvider(
  provider: CardTutorialGuidanceContentProvider | null,
): void {
  contentProvider = provider;
}

/** Stable identity for the one card tutorial allowed during a site visit. */
export function currentCardTutorialScreenKey(state: FoldState): string | null {
  if (
    state.battle !== null ||
    state.journey.runId === null ||
    !state.journey.hasSeenStartingDeckPopup ||
    state.journey.screen.type !== "site"
  ) {
    return null;
  }
  const siteId = state.journey.screen.siteId;
  const site = Object.values(state.journey.atlas.nodes)
    .flatMap((node) => node.sites)
    .find((candidate) => candidate.id === siteId);
  if (
    site === undefined ||
    (
      site.type !== "Draft" &&
      site.type !== "Purge" &&
      site.type !== "Shop" &&
      site.type !== "Transfiguration" &&
      site.type !== "Duplication" &&
      site.type !== "DreamAugury"
    )
  ) {
    return null;
  }
  return `${state.journey.runId}:site:${siteId}`;
}

/**
 * Pick the first visible card with an unseen card-seen trigger. Card order is
 * the screen's display order; the existing trigger matcher owns priority and
 * authored source-order tie breaking within that card.
 */
export function selectCardTutorialGuidance(
  provider: CardTutorialGuidanceContentProvider,
  cardIds: readonly string[],
  seenTriggerIds: ReadonlySet<string>,
): CardTutorialGuidanceMatch | null {
  const visitedCardIds = new Set<string>();
  for (const cardId of cardIds) {
    if (visitedCardIds.has(cardId)) continue;
    visitedCardIds.add(cardId);
    const card = provider.cardById(cardId);
    if (card === undefined) continue;
    const matches = matchTutorialGuidance(provider.triggers, {
      event: "card-seen",
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
  const screenKey = currentCardTutorialScreenKey(state);
  if (
    screenKey === null ||
    payload.screenKey !== screenKey ||
    !Array.isArray(payload.cardIds) ||
    payload.cardIds.length === 0 ||
    payload.cardIds.length > 100 ||
    !payload.cardIds.every((cardId) => typeof cardId === "string") ||
    new Set(payload.cardIds).size !== payload.cardIds.length ||
    (state.cardTutorialPresentation ?? null) !== null ||
    (state.cardTutorialScreenKeysSeen ?? []).includes(screenKey) ||
    contentProvider === null
  ) {
    return null;
  }

  const match = selectCardTutorialGuidance(
    contentProvider,
    payload.cardIds,
    new Set(state.tutorialTriggerIdsSeen ?? []),
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
      id: `card-tutorial:${screenKey}:${match.card.id}:${match.trigger.id}`,
      screenKey,
      cardId: match.card.id,
      triggerId: match.trigger.id,
      speaker: match.trigger.speaker,
      text: match.trigger.text,
      duration: match.trigger.duration,
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
  if (
    presentation === null ||
    payload.presentationId !== presentation.id
  ) {
    return null;
  }
  return { ...state, cardTutorialPresentation: null };
}
