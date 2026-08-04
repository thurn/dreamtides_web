// Pure view-model construction for the Exploration encounter.

import { resolveDeckEntryCard } from "../../card-type-change";
import type { GameCardModel } from "../../cumulus/components/card/CardView";
import type { EntityReferenceModel } from "../../cumulus/components/card/EntityReference";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  ExplorationActionEffectPart,
  ExplorationActionView,
  ExplorationCardChoiceView,
  ExplorationFollowupView,
  ExplorationSiteView,
} from "../../cumulus/screens/ExplorationSiteScreen";
import type { TransfigurationCandidateView } from "../../cumulus/screens/TransfigurationSiteScreen";
import {
  EXPLORATION_ESSENCE_PER_SPARK,
  explorationEncounterForCard,
  type ExplorationActionContent,
  type ExplorationPredicate,
} from "../../data/exploration";
import { createDreamsign } from "../../data/dreamsigns";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { guideForSiteType } from "../../data/dreamscapes";
import { asCardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  DeckEntry,
  DreamscapeNode,
  ExplorationActionOfferRuntime,
  ExplorationSiteRuntime,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import {
  buildTransfigurationDisplay,
  offeredTransfigurationForms,
  transfigurationEffectDetails,
} from "../../transfiguration/transfiguration-logic";

const FALLBACK_GUIDE_ID = "layaway";
const FALLBACK_GUIDE_NAME = '"Layaway"';
const FALLBACK_GUIDE_LINE =
  "Every card dreams, friend. Draw one, and we'll step inside.";

/** Resolve Layaway, the resident guide for Exploration. */
export function resolveExplorationGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "Exploration");
}

function matchesPredicate(
  card: CardData,
  predicate: ExplorationPredicate,
): boolean {
  switch (predicate) {
    case "character":
      return card.cardType === "Character";
    case "event":
      return card.cardType === "Event";
    case "cheap-character":
      return (
        card.cardType === "Character" &&
        card.energyCost !== null &&
        card.energyCost <= 2
      );
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
  }
}

function cardById(content: JourneyContent, cardId: string): CardData | null {
  const normalized = cardId.toLowerCase();
  return (
    [...content.cardDatabase.values()].find(
      (card) => card.id.toLowerCase() === normalized,
    ) ?? null
  );
}

function dreamsignById(
  content: JourneyContent,
  dreamsignId: string,
): ReturnType<typeof createDreamsign> | null {
  const normalized = dreamsignId.toLowerCase();
  const customDreamsign = content.exploration?.customDreamsigns.find(
    (dreamsign) => dreamsign.id?.toLowerCase() === normalized,
  );
  if (customDreamsign !== undefined) return customDreamsign;
  const template = content.dreamsignTemplates.find(
    (dreamsign) => dreamsign.id.toLowerCase() === normalized,
  );
  return template === undefined ? null : createDreamsign(template);
}

function modelForCard(card: CardData): GameCardModel {
  return { cardId: card.id, displaySnapshot: card };
}

function deckCardChoice(
  entry: DeckEntry,
  content: JourneyContent,
): ExplorationCardChoiceView | null {
  const base = content.cardDatabase.get(entry.cardNumber);
  if (base === undefined) return null;
  const resolved = resolveDeckEntryCard(base, entry);
  return {
    entryId: entry.entryId,
    model: modelForCard(resolved),
    isBane: entry.isBane,
  };
}

function eligibleDeckCards(
  state: JourneyState,
  content: JourneyContent,
  predicate?: ExplorationPredicate,
): readonly ExplorationCardChoiceView[] {
  return state.deck.flatMap((entry) => {
    const card = deckCardChoice(entry, content);
    if (card === null) return [];
    if (
      predicate !== undefined &&
      !matchesPredicate(card.model.displaySnapshot, predicate)
    ) {
      return [];
    }
    return [card];
  });
}

function freeTransfigurationCandidates(
  state: JourneyState,
  content: JourneyContent,
  predicate?: ExplorationPredicate,
): readonly TransfigurationCandidateView[] {
  return state.deck.flatMap((entry) => {
    if (entry.transfiguration !== null) return [];
    const base = content.cardDatabase.get(entry.cardNumber);
    if (base === undefined) return [];
    const card = resolveDeckEntryCard(base, entry);
    if (predicate !== undefined && !matchesPredicate(card, predicate)) return [];
    const forms = offeredTransfigurationForms(card, null).map((offer) => {
      const preview = buildTransfigurationDisplay(card, offer.type);
      return {
        type: offer.type,
        description: offer.description,
        effectDetails: transfigurationEffectDetails(offer, card),
        essenceCost: 0,
        affordable: true,
        previewModel: {
          cardId: card.id,
          displaySnapshot: preview.card,
          transfiguration: preview.display,
        },
      };
    });
    if (forms.length === 0) return [];
    return [
      {
        entryId: entry.entryId,
        model: modelForCard(card),
        availability: "available" as const,
        reforgedType: null,
        forms,
      },
    ];
  });
}

function offeredCards(
  ids: readonly string[],
  content: JourneyContent,
): readonly ExplorationCardChoiceView[] {
  return ids.flatMap((id) => {
    const card = cardById(content, id);
    return card === null
      ? []
      : [{ entryId: card.id, model: modelForCard(card), isBane: false }];
  });
}

function heldDreamsignChoices(state: JourneyState) {
  return state.dreamsigns.flatMap((dreamsign) =>
    dreamsign.id === undefined
      ? []
      : [
          {
            id: dreamsign.id,
            name: dreamsign.name,
            effectText: dreamsign.effectDescription,
          },
        ],
  );
}

function deckFollowup(
  title: string,
  subtitle: string,
  cards: readonly ExplorationCardChoiceView[],
  mode: "single" | "exact" | "purge-and-copy",
  count = 1,
  selectionKey: "entryIds" | "cardIds" = "entryIds",
): ExplorationFollowupView {
  return {
    kind: "cards",
    title,
    subtitle,
    cards,
    mode,
    selectionKey,
    min: count,
    max: count,
  };
}

function followupForAction(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationFollowupView {
  const deckCards = eligibleDeckCards(state, content, action.predicate);
  switch (action.effectKind) {
    case "purge-and-copy":
      return deckFollowup(
        "Exchange Familiar Forms",
        "First choose a card to purge, then choose a different card to copy.",
        eligibleDeckCards(state, content),
        "purge-and-copy",
        2,
      );
    case "transfigure-selected":
      return {
        kind: "transfiguration",
        candidates:
          action.count === undefined || action.count === 1
            ? freeTransfigurationCandidates(state, content, action.predicate)
            : [],
      };
    case "purge-selected":
      return deckFollowup(
        "Feed the Fire",
        "Choose an Event to purge.",
        deckCards,
        "single",
      );
    case "purge-for-essence":
      return deckFollowup(
        "Trade Away a Figure",
        `Choose a card to purge for ${String(action.essencePerSpark ?? EXPLORATION_ESSENCE_PER_SPARK)} essence per ✦.`,
        eligibleDeckCards(state, content),
        "single",
      );
    case "change-subtype-selected":
      return deckFollowup(
        action.label,
        `Choose a Character to become ${action.subtype ?? "Outsider"}.`,
        deckCards,
        "single",
      );
    case "replace-selected":
      return deckFollowup(
        "Release a Fellow Swimmer",
        "Choose a Spirit Animal to exchange.",
        deckCards.filter((card) =>
          Object.prototype.hasOwnProperty.call(
            offer.replacementCardIdByEntryId,
            card.entryId,
          ),
        ),
        "single",
      );
    case "transfigure-fixed-selected":
      return deckFollowup(
        "Gather the Falling Light",
        `Choose a Character to become ${action.transfiguration ?? "Kindled"}.`,
        deckCards.filter(
          (card) =>
            state.deck.find((entry) => entry.entryId === card.entryId)
              ?.transfiguration === null,
        ),
        "single",
      );
    case "draft-card":
      return deckFollowup(
        action.label,
        "Choose one offered card.",
        offeredCards(offer.offeredCardIds, content),
        "single",
        1,
        "cardIds",
      );
    case "gain-offered-card":
      return { kind: "none" };
    case "take-cards": {
      const cards = offeredCards(offer.offeredCardIds, content);
      return {
        kind: "cards",
        title: action.label,
        subtitle: "Choose any number of offered cards.",
        cards,
        mode: "exact",
        selectionKey: "cardIds",
        min: 0,
        max: cards.length,
      };
    }
    case "choose-pack":
      return {
        kind: "packs",
        title: action.label,
        subtitle: "Choose one pack to add to your deck.",
        packs: offer.packCardIds.map((ids, index) => ({
          index,
          cards: offeredCards(ids, content),
        })),
      };
    case "change-subtype-all":
      return {
        kind: "subtypes",
        title: action.label,
        subtitle: "Choose the subtype for every Character in your deck.",
        options: action.subtypeOptions ?? [],
      };
    case "gain-dreamsign":
    case "gain-random-dreamsign":
      if (state.dreamsigns.length >= state.maxDreamsigns) {
        return {
          kind: "dreamsigns",
          title: action.label,
          subtitle: "Choose a Dreamsign to replace.",
          selectionKey: "replacedDreamsignId",
          dreamsigns: heldDreamsignChoices(state),
        };
      }
      return { kind: "none" };
    case "purge-dreamsign-for-essence":
      return {
        kind: "dreamsigns",
        title: action.label,
        subtitle: "Choose a Dreamsign to purge.",
        selectionKey: "dreamsignId",
        dreamsigns: heldDreamsignChoices(state),
      };
    case "gain-card":
    case "gain-nightmare-and-card":
    case "gain-random-cards":
    case "gain-essence-per-card":
    case "increase-spark-all":
    case "make-fast-all":
    case "reduce-cost-all-and-gain-nightmares":
      return { kind: "none" };
  }
}

interface ExplorationEffectReference {
  readonly needle: string;
  readonly entity: EntityReferenceModel;
}

function effectReferencesForAction(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  content: JourneyContent,
): readonly ExplorationEffectReference[] {
  const references: ExplorationEffectReference[] = [];
  if (action.effectText.includes("$OFFERED_CARD")) {
    const offeredCardId = offer.offeredCardIds[0];
    const offeredCard =
      offeredCardId === undefined ? null : cardById(content, offeredCardId);
    if (offeredCard !== null) {
      references.push({
        needle: "$OFFERED_CARD",
        entity: { kind: "card", card: offeredCard },
      });
    }
  }
  const cardIds = [action.cardId];
  if (
    action.effectKind === "gain-nightmare-and-card" ||
    action.effectKind === "reduce-cost-all-and-gain-nightmares"
  ) {
    cardIds.push(NIGHTMARE_CARD_ID);
  }
  for (const cardId of cardIds) {
    if (cardId === undefined) continue;
    const card = cardById(content, cardId);
    if (card !== null) {
      references.push({
        needle: card.name,
        entity: { kind: "card", card },
      });
    }
  }
  if (action.dreamsignId !== undefined) {
    const dreamsign = dreamsignById(content, action.dreamsignId);
    if (dreamsign !== null) {
      references.push({
        needle: dreamsign.name,
        entity: { kind: "dreamsign", dreamsign },
      });
    }
  }
  return references;
}

/** Build UUID-backed inline entity parts for an Exploration option's effect. */
export function buildExplorationActionEffect(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  content: JourneyContent,
): Pick<ExplorationActionView, "effectText" | "effectParts"> {
  const references = effectReferencesForAction(action, offer, content);
  const parts: ExplorationActionEffectPart[] = [];
  let cursor = 0;
  while (cursor < action.effectText.length) {
    const next = references
      .map((reference) => ({
        reference,
        index: action.effectText
          .toLowerCase()
          .indexOf(reference.needle.toLowerCase(), cursor),
      }))
      .filter((candidate) => candidate.index >= cursor)
      .sort((left, right) => left.index - right.index)[0];
    if (next === undefined) break;
    if (next.index > cursor) {
      parts.push({
        kind: "text",
        text: action.effectText.slice(cursor, next.index),
      });
    }
    parts.push({ kind: "entity", entity: next.reference.entity });
    cursor = next.index + next.reference.needle.length;
  }
  if (!parts.some((part) => part.kind === "entity")) {
    return { effectText: action.effectText };
  }
  if (cursor < action.effectText.length) {
    parts.push({ kind: "text", text: action.effectText.slice(cursor) });
  }
  return {
    effectText: parts
      .map((part) =>
        part.kind === "text"
          ? part.text
          : part.entity.kind === "card"
            ? part.entity.card.name
            : part.entity.dreamsign.name,
      )
      .join(""),
    effectParts: parts,
  };
}

function actionView(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationActionView {
  const followup = followupForAction(action, offer, state, content);
  const hasRequiredOffer =
    action.effectKind === "gain-random-dreamsign"
      ? (offer.offeredDreamsignIds?.length ?? 0) > 0
      : action.effectKind === "gain-offered-card"
        ? offer.offeredCardIds.length === 1
        : true;
  const available =
    hasRequiredOffer &&
    (followup.kind === "none" ||
      (followup.kind === "transfiguration" &&
        followup.candidates.length > 0) ||
      (followup.kind === "cards" && followup.cards.length >= followup.min) ||
      (followup.kind === "packs" && followup.packs.length > 0) ||
      (followup.kind === "subtypes" && followup.options.length > 0) ||
      (followup.kind === "dreamsigns" && followup.dreamsigns.length > 0));
  return {
    id: action.id,
    label: action.label,
    ...buildExplorationActionEffect(action, offer, content),
    followup,
    ...(action.effectKind === "gain-offered-card" &&
    offer.offeredCardIds[0] !== undefined
      ? { automaticSelection: { cardIds: [offer.offeredCardIds[0]] } }
      : {}),
    available,
  };
}

function rewardForResolution(
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
  actions: readonly ExplorationActionContent[],
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const resolvedAction = actions.find(
    (action) => action.id === resolution.actionId,
  );
  if (resolvedAction?.effectKind === "increase-spark-all") {
    const affectedEntryIds = new Set(resolution.affectedEntryIds);
    const cards = state.deck.flatMap((entry) => {
      if (!affectedEntryIds.has(entry.entryId)) return [];
      const card = deckCardChoice(entry, content);
      return card === null ? [] : [card];
    });
    return {
      kind: "deck-spark",
      amount: resolvedAction.sparkBonus ?? 1,
      announcement: resolvedAction.effectText,
      cards,
    };
  }
  const cards = resolution.gainedCardIds.flatMap((cardId) => {
    const card = cardById(content, cardId);
    return card === null ? [] : [modelForCard(card)];
  });
  const dreamsigns = resolution.gainedDreamsignIds.flatMap((dreamsignId) => {
    const normalized = dreamsignId.toLowerCase();
    const dreamsign = state.dreamsigns.find(
      (candidate) => candidate.id?.toLowerCase() === normalized,
    );
    return dreamsign === undefined ? [] : [dreamsign];
  });
  return cards.length === 0 && dreamsigns.length === 0
    ? null
    : { kind: "objects", cards, dreamsigns };
}

/** Build the complete Exploration presentation from persisted domain data. */
export function buildExplorationSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Exploration" };
  guide: DreamGuideContent | null;
  runtime: ExplorationSiteRuntime;
  state: JourneyState;
  content: JourneyContent;
}): ExplorationSiteView | null {
  const exploration = params.content.exploration;
  if (exploration === undefined) return null;
  const encounter = explorationEncounterForCard(
    exploration,
    params.runtime.encounterCardId,
  );
  const sourceCard = cardById(params.content, params.runtime.encounterCardId);
  if (encounter === null || sourceCard === null) return null;
  const actions = encounter.actions.flatMap((action) => {
    const offer = params.runtime.actionOffers.find(
      (candidate) => candidate.actionId === action.id,
    );
    return offer === undefined
      ? []
      : [actionView(action, offer, params.state, params.content)];
  });
  if (actions.length !== 2) return null;
  const guideId = params.guide?.id ?? FALLBACK_GUIDE_ID;
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  return {
    siteId: params.site.id,
    scene,
    fullArt: artRef.explorationCard(sourceCard.imageNumber),
    guide: {
      id: guideId,
      name: params.guide?.name ?? FALLBACK_GUIDE_NAME,
      line: params.guide?.dialog[0] ?? FALLBACK_GUIDE_LINE,
      art: artRef.dreamGuide(guideId),
    },
    card: { cardId: asCardId(sourceCard.id), displaySnapshot: sourceCard },
    narrative: encounter.prose,
    actions: actions as [ExplorationActionView, ExplorationActionView],
    resolvedActionId: params.runtime.resolution?.actionId ?? null,
    reward: rewardForResolution(
      params.runtime,
      params.state,
      params.content,
      encounter.actions,
    ),
  };
}
