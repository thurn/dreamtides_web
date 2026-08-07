// Pure view-model construction for the Exploration encounter.

import { resolveDeckEntryCard } from "../../card-type-change";
import type { GameCardModel } from "../../cumulus/components/card/CardView";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  ExplorationActionEffectPart,
  ExplorationActionView,
  ExplorationCardSelectionOperation,
  ExplorationCardChoiceView,
  ExplorationFollowupView,
  ExplorationEntityView,
  ExplorationSiteView,
} from "../../cumulus/screens/ExplorationSiteScreen";
import type { TransfigurationCandidateView } from "../../cumulus/screens/TransfigurationSiteScreen";
import {
  explorationActionUsesSpecialVariable,
  explorationEffectDefinition,
  explorationEncounterForCard,
  type ExplorationActionContent,
  type ExplorationPredicate,
} from "../../data/exploration";
import { createDreamsign } from "../../data/dreamsigns";
import { toJourneyDreamAvatar } from "../../data/dream-avatar-selection";
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
  TransfigurationType,
} from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import {
  buildTransfigurationDisplay,
  offeredTransfigurationForms,
  transfigurationEffectDetails,
} from "../../transfiguration/transfiguration-logic";
import { MERCHANT_TUNING } from "../../journey_v2/tuning";

const FALLBACK_GUIDE_ID = "layaway";
const FALLBACK_GUIDE_NAME = '"Layaway"';
const FALLBACK_GUIDE_LINE =
  "Every card dreams, friend. Draw one, and we'll step inside.";

/** Resolve Layaway, the resident guide for Exploration. */
export function resolveExplorationGuide(
  guides: readonly DreamGuideContent[],
  guideIdOverride?: string,
): DreamGuideContent | null {
  return guideForSiteType(guides, "Exploration", guideIdOverride);
}

function matchesPredicate(
  card: CardData,
  predicate: ExplorationPredicate,
  content: JourneyContent,
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
        card.energyCost <=
          (content.rewardSelectionData?.tuning.costBands.cheapCharacterMaximum ??
            MERCHANT_TUNING.costBands.cheapCharacterMaximum)
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

function dreamAvatarById(content: JourneyContent, dreamAvatarId: string) {
  const normalized = dreamAvatarId.toLowerCase();
  const dreamAvatar = content.dreamAvatars.find(
    (candidate) => candidate.id.toLowerCase() === normalized,
  );
  return dreamAvatar === undefined ? null : toJourneyDreamAvatar(dreamAvatar);
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
      !matchesPredicate(card.model.displaySnapshot, predicate, content)
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
  offeredEntryIds?: readonly string[],
): readonly TransfigurationCandidateView[] {
  const offered =
    offeredEntryIds === undefined ? null : new Set(offeredEntryIds);
  return state.deck.flatMap((entry) => {
    if (offered !== null && !offered.has(entry.entryId)) return [];
    if (entry.transfiguration !== null) return [];
    const base = content.cardDatabase.get(entry.cardNumber);
    if (base === undefined) return [];
    const card = resolveDeckEntryCard(base, entry);
    if (predicate !== undefined && !matchesPredicate(card, predicate, content)) return [];
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
  transfigurationByCardId?: Readonly<Record<string, TransfigurationType>>,
): readonly ExplorationCardChoiceView[] {
  return ids.flatMap((id) => {
    const card = cardById(content, id);
    if (card === null) return [];
    const transfiguration = transfigurationByCardId?.[card.id];
    if (transfiguration === undefined) {
      return [{ entryId: card.id, model: modelForCard(card), isBane: false }];
    }
    const preview = buildTransfigurationDisplay(card, transfiguration);
    return [{
      entryId: card.id,
      model: {
        cardId: card.id,
        displaySnapshot: preview.card,
        transfiguration: preview.display,
      },
      isBane: false,
    }];
  });
}

function offeredDeckCards(
  ids: readonly string[],
  state: JourneyState,
  content: JourneyContent,
): readonly ExplorationCardChoiceView[] {
  return ids.flatMap((entryId) => {
    const entry = state.deck.find((candidate) => candidate.entryId === entryId);
    if (entry === undefined) return [];
    const card = deckCardChoice(entry, content);
    return card === null ? [] : [card];
  });
}

function heldDreamsignChoices(state: JourneyState) {
  return state.dreamsigns.filter(
    (dreamsign): dreamsign is typeof dreamsign & { readonly id: string } =>
      dreamsign.id !== undefined,
  );
}

function deckFollowup(
  title: string,
  subtitle: string,
  cards: readonly ExplorationCardChoiceView[],
  mode: "single" | "exact" | "purge-and-copy",
  selectionOperation: ExplorationCardSelectionOperation | undefined,
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
    ...(selectionOperation === undefined ? {} : { selectionOperation }),
    min: count,
    max: count,
  };
}

function configuredFollowupCopy(
  action: ExplorationActionContent,
  content: JourneyContent,
  key: "followupTitle" | "followupSubtitle",
  fallback: string,
): string {
  const exploration = content.exploration;
  const template = exploration === undefined
    ? undefined
    : explorationEffectDefinition(exploration, action.effectKind)?.copy[key];
  if (template === undefined || template === "") return fallback;
  const values: Readonly<Record<string, string | number>> = {
    "action-label": action.label,
    count: action.count ?? 1,
    subtype: action.subtype ?? "Outsider",
    transfiguration: action.transfiguration ?? "Kindled",
    "essence-per-spark":
      action.essencePerSpark ?? content.economyData.exploration.defaultEssencePerSpark,
  };
  return template.replace(/\{([^{}]+)\}/gu, (slot, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Exploration copy is missing ${slot}`);
    return String(value);
  });
}

function followupForAction(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationFollowupView {
  const deckCards = eligibleDeckCards(state, content, action.predicate);
  const hasMintedDeckCard = explorationActionUsesSpecialVariable(
    action,
    "$DECK_CARD",
  );
  switch (action.effectKind) {
    case "purge-and-copy":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", "Exchange Familiar Forms"),
        configuredFollowupCopy(action, content, "followupSubtitle", "First choose a card to purge, then choose a different card to copy."),
        eligibleDeckCards(state, content),
        "purge-and-copy",
        undefined,
        2,
      );
    case "transfigure-selected":
      return {
        kind: "transfiguration",
        candidates:
          action.count === undefined || action.count === 1
            ? freeTransfigurationCandidates(
                state,
                content,
                action.predicate,
                hasMintedDeckCard ? offer.offeredDeckEntryIds ?? [] : undefined,
              )
            : [],
      };
    case "purge-selected":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", "Feed the Fire"),
        configuredFollowupCopy(action, content, "followupSubtitle", "Choose an Event to purge."),
        deckCards,
        "single",
        "purge",
      );
    case "purge-for-essence":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", "Trade Away a Figure"),
        configuredFollowupCopy(action, content, "followupSubtitle", `Choose a card to purge for ${String(action.essencePerSpark ?? content.economyData.exploration.defaultEssencePerSpark)} essence per ✦.`),
        eligibleDeckCards(state, content),
        "single",
        "purge",
      );
    case "change-subtype-selected":
      if (hasMintedDeckCard) return { kind: "none" };
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(action, content, "followupSubtitle", `Choose a Character to become ${action.subtype ?? "Outsider"}.`),
        deckCards,
        "single",
        "change",
      );
    case "copy-selected-card":
      if (hasMintedDeckCard) return { kind: "none" };
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(action, content, "followupSubtitle", `Choose a card to gain ${String(action.count ?? 1)} copies of.`),
        deckCards,
        "single",
        "copy",
      );
    case "copy-selected-cards":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(action, content, "followupSubtitle", `Choose ${String(action.count ?? 2)} cards to copy.`),
        deckCards,
        "exact",
        "copy",
        action.count ?? 2,
      );
    case "copy-offered-deck-card":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(action, content, "followupSubtitle", "Choose one offered card to copy."),
        offeredDeckCards(offer.offeredDeckEntryIds ?? [], state, content),
        "single",
        "copy",
      );
    case "replace-selected":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", "Release a Fellow Swimmer"),
        configuredFollowupCopy(action, content, "followupSubtitle", "Choose a Spirit Animal to exchange."),
        deckCards.filter((card) =>
          Object.prototype.hasOwnProperty.call(
            offer.replacementCardIdByEntryId,
            card.entryId,
          ),
        ),
        "single",
        "purge",
      );
    case "replace-selected-with-card":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(action, content, "followupSubtitle", "Choose a card to replace."),
        deckCards,
        "single",
        "purge",
      );
    case "transfigure-fixed-selected":
      if (hasMintedDeckCard) return { kind: "none" };
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(action, content, "followupSubtitle", `Choose a card to become ${action.transfiguration ?? "Kindled"}.`),
        deckCards.filter(
          (card) =>
            state.deck.find((entry) => entry.entryId === card.entryId)
              ?.transfiguration === null &&
            offeredTransfigurationForms(
              card.model.displaySnapshot,
              null,
            ).some((form) => form.type === action.transfiguration),
        ),
        "single",
        "transfigure",
      );
    case "draft-card":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(action, content, "followupSubtitle", "Choose one offered card."),
        offeredCards(offer.offeredCardIds, content),
        "single",
        undefined,
        1,
        "cardIds",
      );
    case "transfigured-card-draft":
      return deckFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(action, content, "followupSubtitle", "Choose one offered transfigured card."),
        offeredCards(offer.offeredCardIds, content, offer.transfigurationByCardId),
        "single",
        undefined,
        1,
        "cardIds",
      );
    case "gain-offered-card":
    case "add-site":
      return { kind: "none" };
    case "take-cards": {
      const cards = offeredCards(offer.offeredCardIds, content);
      return {
        kind: "cards",
        title: configuredFollowupCopy(action, content, "followupTitle", action.label),
        subtitle: configuredFollowupCopy(action, content, "followupSubtitle", "Choose any number of offered cards."),
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
        title: configuredFollowupCopy(action, content, "followupTitle", action.label),
        subtitle: configuredFollowupCopy(action, content, "followupSubtitle", "Choose one pack to add to your deck."),
        packs: offer.packCardIds.map((ids, index) => ({
          index,
          cards: offeredCards(ids, content),
        })),
      };
    case "change-subtype-all":
      return {
        kind: "subtypes",
        title: configuredFollowupCopy(action, content, "followupTitle", action.label),
        subtitle: configuredFollowupCopy(action, content, "followupSubtitle", "Choose the subtype for every Character in your deck."),
        options: action.subtypeOptions ?? [],
      };
    case "gain-dreamsign":
    case "gain-random-dreamsign":
      if (state.dreamsigns.length >= state.maxDreamsigns) {
        return {
          kind: "dreamsigns",
          title: configuredFollowupCopy(action, content, "followupTitle", action.label),
          subtitle: configuredFollowupCopy(action, content, "followupSubtitle", "Choose a Dreamsign to replace."),
          selectionKey: "replacedDreamsignId",
          dreamsigns: heldDreamsignChoices(state),
        };
      }
      return { kind: "none" };
    case "purge-dreamsign-for-essence":
      return {
        kind: "dreamsigns",
        title: configuredFollowupCopy(action, content, "followupTitle", action.label),
        subtitle: configuredFollowupCopy(action, content, "followupSubtitle", "Choose a Dreamsign to purge."),
        selectionKey: "dreamsignId",
        dreamsigns: heldDreamsignChoices(state),
      };
    case "choose-dream-avatar":
      return {
        kind: "dreamAvatars",
        title: configuredFollowupCopy(action, content, "followupTitle", action.label),
        subtitle: configuredFollowupCopy(action, content, "followupSubtitle", "Choose your new Dream Avatar."),
        dreamAvatars: (offer.offeredDreamAvatarIds ?? []).flatMap((id) => {
          const dreamAvatar = dreamAvatarById(content, id);
          return dreamAvatar === null ? [] : [dreamAvatar];
        }),
      };
    case "gain-card":
    case "gain-nightmare-and-card":
    case "gain-random-cards":
    case "gain-essence-per-card":
    case "increase-spark-all":
    case "make-fast-all":
    case "reduce-cost-all-and-gain-nightmares":
    case "next-battle-opening-hand":
    case "next-battle-starting-energy":
    case "next-battle-smaller-hand-and-cost-discount":
    case "purge-duplicates-and-grant-reclaim":
    case "transfigure-next-draft-or-shop":
      return { kind: "none" };
  }
}

interface ExplorationEffectReference {
  readonly needle: string;
  readonly entity: ExplorationEntityView;
}

interface DeckCardVariableTarget {
  readonly entryId: string;
  readonly entity: Extract<ExplorationEntityView, { readonly kind: "card" }>;
}

function fixedTransfigurationEffect(
  transfiguration: TransfigurationType,
): string {
  switch (transfiguration) {
    case "Empowered":
      return "Halve its ● cost, rounded down";
    case "Kindled":
      return "Double its ✦, or set it to 1 if it is 0";
    case "Inspired":
      return 'Add "Draw a card" to its rules text';
    case "Enduring":
      return 'Add "Reclaim" to its rules text';
    case "Hastened":
      return "Make it Fast";
    case "Amplified":
      return "Increase the first number in its rules text by 1";
    case "Resonant":
      return "Widen a named trigger to fire more often";
    case "Attuned":
      return "Reduce an activated ability's cost by 1●";
    case "Perfected":
      return "Apply every available transfiguration";
  }
}

function appendFixedTransfigurationEffect(
  effect: Pick<ExplorationActionView, "effectText" | "effectParts">,
  action: ExplorationActionContent,
): Pick<ExplorationActionView, "effectText" | "effectParts"> {
  if (
    action.effectKind !== "transfigure-fixed-selected" ||
    action.transfiguration === undefined
  ) {
    return effect;
  }
  const suffix = ` (${fixedTransfigurationEffect(action.transfiguration)})`;
  return {
    effectText: `${effect.effectText}${suffix}`,
    ...(effect.effectParts === undefined
      ? {}
      : {
          effectParts: [
            ...effect.effectParts,
            { kind: "text" as const, text: suffix },
          ],
        }),
  };
}

function deckCardVariableTarget(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): DeckCardVariableTarget | null {
  if (!explorationActionUsesSpecialVariable(action, "$DECK_CARD")) return null;
  const offeredEntryId = offer.offeredDeckEntryIds?.[0];
  if (offeredEntryId === undefined || offer.offeredDeckEntryIds?.length !== 1) {
    return null;
  }
  const target = state.deck.find((entry) => entry.entryId === offeredEntryId);
  if (target === undefined) return null;
  const base = content.cardDatabase.get(target.cardNumber);
  if (base === undefined) return null;
  const card = resolveDeckEntryCard(base, target);
  const entity =
    action.effectKind === "transfigure-fixed-selected" &&
    action.transfiguration !== undefined
      ? (() => {
          const preview = buildTransfigurationDisplay(card, action.transfiguration);
          return {
            kind: "card" as const,
            card: preview.card,
            transfiguration: preview.display,
          };
        })()
      : { kind: "card" as const, card };
  return {
    entryId: target.entryId,
    entity,
  };
}

function effectReferencesForAction(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  content: JourneyContent,
  deckCardEntity?: DeckCardVariableTarget["entity"],
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
  if (
    action.effectText.includes("$DECK_CARD") &&
    deckCardEntity !== undefined
  ) {
    references.push({
      needle: "$DECK_CARD",
      entity: deckCardEntity,
    });
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
      const copies =
        cardId === NIGHTMARE_CARD_ID &&
        action.nightmareCount !== undefined &&
        Number.isInteger(action.nightmareCount) &&
        action.nightmareCount > 1
          ? action.nightmareCount
          : undefined;
      references.push({
        needle: card.name,
        entity: {
          kind: "card",
          card,
          ...(copies === undefined ? {} : { copies }),
        },
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
  deckCardEntity?: DeckCardVariableTarget["entity"],
): Pick<ExplorationActionView, "effectText" | "effectParts"> {
  const references = effectReferencesForAction(
    action,
    offer,
    content,
    deckCardEntity,
  );
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
    return {
      effectText: action.effectText
        .split("$DECK_CARD")
        .join("an eligible card"),
    };
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
  const deckCardTarget = deckCardVariableTarget(action, offer, state, content);
  const followup = followupForAction(action, offer, state, content);
  const requiresDeckCardTarget = explorationActionUsesSpecialVariable(
    action,
    "$DECK_CARD",
  );
  const hasRequiredOffer =
    action.effectKind === "gain-random-dreamsign"
      ? (offer.offeredDreamsignIds?.length ?? 0) > 0
      : action.effectKind === "gain-offered-card"
        ? offer.offeredCardIds.length === 1
        : action.effectKind === "copy-offered-deck-card"
          ? (offer.offeredDeckEntryIds?.length ?? 0) > 0
          : action.effectKind === "choose-dream-avatar"
            ? (offer.offeredDreamAvatarIds?.length ?? 0) > 0
            : action.effectKind === "add-site"
              ? offer.offeredSiteType !== undefined
            : requiresDeckCardTarget
              ? deckCardTarget !== null
              : true;
  const available =
    hasRequiredOffer &&
    (followup.kind === "none" ||
      (followup.kind === "transfiguration" &&
        followup.candidates.length > 0) ||
      (followup.kind === "cards" && followup.cards.length >= followup.min) ||
      (followup.kind === "packs" && followup.packs.length > 0) ||
      (followup.kind === "subtypes" && followup.options.length > 0) ||
      (followup.kind === "dreamsigns" && followup.dreamsigns.length > 0) ||
      (followup.kind === "dreamAvatars" && followup.dreamAvatars.length > 0));
  const effect = appendFixedTransfigurationEffect(
    buildExplorationActionEffect(
      action,
      offer,
      content,
      deckCardTarget?.entity,
    ),
    action,
  );
  const disclosedEffect = action.effectKind === "add-site" && offer.offeredSiteType !== undefined
    ? { effectText: `${effect.effectText} ${offer.offeredSiteType}.` }
    : effect;
  return {
    id: action.id,
    effectKind: action.effectKind,
    mechanics: {
      effectKind: action.effectKind,
      ...(action.templateId === undefined ? {} : { templateId: action.templateId }),
      ...(action.predicate === undefined ? {} : { predicate: action.predicate }),
      ...(action.count === undefined ? {} : { count: action.count }),
      ...(action.cardId === undefined ? {} : { cardId: action.cardId }),
      ...(action.offerCount === undefined ? {} : { offerCount: action.offerCount }),
      ...(action.packCount === undefined ? {} : { packCount: action.packCount }),
      ...(action.packSize === undefined ? {} : { packSize: action.packSize }),
      ...(action.essencePerSpark === undefined
        ? {}
        : { essencePerSpark: action.essencePerSpark }),
      ...(action.essencePerCard === undefined
        ? {}
        : { essencePerCard: action.essencePerCard }),
      ...(action.sparkBonus === undefined ? {} : { sparkBonus: action.sparkBonus }),
      ...(action.essence === undefined ? {} : { essence: action.essence }),
      ...(action.energyCostReduction === undefined
        ? {}
        : { energyCostReduction: action.energyCostReduction }),
      ...(action.nightmareCount === undefined
        ? {}
        : { nightmareCount: action.nightmareCount }),
      ...(action.dreamsignId === undefined ? {} : { dreamsignId: action.dreamsignId }),
      ...(action.subtype === undefined ? {} : { subtype: action.subtype }),
      ...(action.subtypeOptions === undefined
        ? {}
        : { subtypeOptions: action.subtypeOptions }),
      ...(action.transfiguration === undefined
        ? {}
        : { transfiguration: action.transfiguration }),
    },
    label: action.label,
    ...disclosedEffect,
    followup,
    ...(action.effectKind === "gain-offered-card" &&
    offer.offeredCardIds[0] !== undefined
      ? { automaticSelection: { cardIds: [offer.offeredCardIds[0]] } }
      : deckCardTarget !== null &&
          (action.effectKind === "transfigure-fixed-selected" ||
            action.effectKind === "change-subtype-selected" ||
            action.effectKind === "copy-selected-card")
        ? { automaticSelection: { entryIds: [deckCardTarget.entryId] } }
      : {}),
    available,
  };
}

function rewardForResolution(
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
  actions: readonly ExplorationActionContent[],
  actionViews: readonly ExplorationActionView[],
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const resolvedAction = actions.find(
    (action) => action.id === resolution.actionId,
  );
  const resolvedEffectText =
    actionViews.find((action) => action.id === resolution.actionId)?.effectText ??
    resolvedAction?.effectText
      .split("$DECK_CARD")
      .join("the affected card") ??
    "Exploration effect resolved";
  if (resolvedAction?.effectKind === "purge-and-copy") {
    const purgedEntry = resolution.purgedEntrySnapshots?.[0];
    const purgedCard =
      purgedEntry === undefined ? null : deckCardChoice(purgedEntry, content);
    const sourceEntryId = resolution.affectedEntryIds[0];
    const sourceEntry = state.deck.find(
      (candidate) => candidate.entryId === sourceEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const cards = (resolution.gainedEntryIds ?? []).flatMap((entryId) => {
      const entry = state.deck.find((candidate) => candidate.entryId === entryId);
      if (entry === undefined) return [];
      const card = deckCardChoice(entry, content);
      return card === null ? [] : [card];
    });
    if (
      purgedCard !== null &&
      sourceEntryId !== undefined &&
      source !== null &&
      cards.length > 0
    ) {
      return {
        kind: "purge-and-copy",
        purgedCard,
        sourceEntryId,
        source,
        cards,
        count: cards.length,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "copy-selected-cards"
  ) {
    const sources = resolution.affectedEntryIds.flatMap((entryId) => {
      const entry = state.deck.find((candidate) => candidate.entryId === entryId);
      if (entry === undefined) return [];
      const source = deckCardChoice(entry, content);
      return source === null ? [] : [source];
    });
    const copies = (resolution.gainedEntryIds ?? []).flatMap((entryId) => {
      const entry = state.deck.find((candidate) => candidate.entryId === entryId);
      if (entry === undefined) return [];
      const copy = deckCardChoice(entry, content);
      return copy === null ? [] : [copy];
    });
    if (sources.length > 0 && sources.length === copies.length) {
      return {
        kind: "card-copies-multiple",
        pairs: sources.map((source, index) => ({
          source,
          copy: copies[index],
        })),
        count: copies.length,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "copy-selected-card" ||
    resolvedAction?.effectKind === "copy-offered-deck-card"
  ) {
    const sourceEntryId = resolution.affectedEntryIds[0];
    const sourceEntry = state.deck.find(
      (candidate) => candidate.entryId === sourceEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const cards = (resolution.gainedEntryIds ?? []).flatMap((entryId) => {
      const entry = state.deck.find((candidate) => candidate.entryId === entryId);
      if (entry === undefined) return [];
      const card = deckCardChoice(entry, content);
      return card === null ? [] : [card];
    });
    if (sourceEntryId !== undefined && source !== null && cards.length > 0) {
      return {
        kind: "card-copies",
        sourceEntryId,
        source,
        cards,
        count: cards.length,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "next-battle-opening-hand" ||
    resolvedAction?.effectKind === "next-battle-starting-energy"
  ) {
    const modifier = resolution.battleModifier;
    if (
      modifier !== undefined &&
      modifier.kind !== "smaller-hand-and-cost-discount"
    ) {
      return {
        kind: "battle-modifier",
        modifier: modifier.kind,
        amount: modifier.amount,
        battlesRemaining: modifier.battlesRemaining,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "next-battle-smaller-hand-and-cost-discount"
  ) {
    const modifier = resolution.battleModifier;
    if (modifier?.kind === "smaller-hand-and-cost-discount") {
      return {
        kind: "smaller-hand-and-cost-discount",
        openingHandDelta: modifier.openingHandDelta,
        energyCostReduction: modifier.energyCostReduction,
        battlesRemaining: modifier.battlesRemaining,
      };
    }
  }
  if (resolvedAction?.effectKind === "choose-dream-avatar") {
    const currentId = resolution.chosenDreamAvatarId;
    const current =
      currentId === undefined ? null : dreamAvatarById(content, currentId);
    const previous =
      resolution.previousDreamAvatarId === undefined
        ? null
        : dreamAvatarById(content, resolution.previousDreamAvatarId);
    if (current !== null) {
      return { kind: "dream-avatar", previous, current };
    }
  }
  if (
    resolvedAction?.effectKind === "transfigure-next-draft-or-shop" &&
    resolution.siteOfferModifier !== undefined
  ) {
    return {
      kind: "site-offer-modifier",
      modifier: resolution.siteOfferModifier.kind,
      sourceSiteId: resolution.siteOfferModifier.sourceSiteId,
      sourceActionId: resolution.siteOfferModifier.sourceActionId,
    };
  }
  if (
    resolvedAction?.effectKind === "transfigure-selected" ||
    resolvedAction?.effectKind === "transfigure-fixed-selected"
  ) {
    const entryId = resolution.affectedEntryIds[0];
    const entry = state.deck.find((candidate) => candidate.entryId === entryId);
    const type =
      resolution.chosenTransfiguration ?? resolvedAction.transfiguration;
    const base =
      entry === undefined ? undefined : content.cardDatabase.get(entry.cardNumber);
    if (entryId !== undefined && entry !== undefined && type !== undefined && base !== undefined) {
      const before = resolveDeckEntryCard(base, {
        ...entry,
        transfiguration: null,
      });
      const after = resolveDeckEntryCard(base, {
        ...entry,
        transfiguration: type,
      });
      const display = buildTransfigurationDisplay(base, type).display;
      return {
        kind: "transfiguration",
        entryId,
        before: modelForCard(before),
        after: {
          cardId: after.id,
          displaySnapshot: after,
          transfiguration: display,
        },
      };
    }
  }
  if (resolvedAction?.effectKind === "purge-dreamsign-for-essence") {
    const purgedDreamsignId = resolution.purgedDreamsignIds?.[0];
    const purgedDreamsign =
      purgedDreamsignId === undefined
        ? null
        : dreamsignById(content, purgedDreamsignId);
    if (purgedDreamsign !== null) {
      return {
        kind: "purged-dreamsign-essence",
        dreamsign: purgedDreamsign,
        totalEssence: resolution.essenceGained,
      };
    }
  }
  if (resolvedAction?.effectKind === "purge-for-essence") {
    const purgedEntry = resolution.purgedEntrySnapshots?.[0];
    const card =
      purgedEntry === undefined ? null : deckCardChoice(purgedEntry, content);
    if (card !== null) {
      return {
        kind: "purged-card-essence",
        card,
        spark: Math.max(0, card.model.displaySnapshot.spark ?? 0),
        essencePerSpark:
          resolvedAction.essencePerSpark ?? content.economyData.exploration.defaultEssencePerSpark,
        totalEssence: resolution.essenceGained,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "gain-essence-per-card" &&
    resolvedAction.essencePerCard !== undefined
  ) {
    return {
      kind: "essence",
      cards: resolution.affectedEntryIds.flatMap((entryId) => {
        const entry = state.deck.find(
          (candidate) => candidate.entryId === entryId,
        );
        if (entry === undefined) return [];
        const card = deckCardChoice(entry, content);
        return card === null ? [] : [card];
      }),
      essencePerCard: resolvedAction.essencePerCard,
      totalEssence: resolution.essenceGained,
    };
  }
  const deckModification = (() => {
    if (resolvedAction === undefined) return null;
    const affectedEntryIds = new Set(resolution.affectedEntryIds);
    const cards = state.deck.flatMap((entry) => {
      if (!affectedEntryIds.has(entry.entryId)) return [];
      const card = deckCardChoice(entry, content);
      return card === null ? [] : [card];
    });
    if (cards.length === 0) return null;
    switch (resolvedAction.effectKind) {
      case "increase-spark-all":
        return {
          kind: "spark" as const,
          headline: `+${String(resolvedAction.sparkBonus ?? 1)} ✦`,
          announcement: resolvedEffectText,
          cards,
        };
      case "make-fast-all":
        return {
          kind: "fast" as const,
          headline: "Fast",
          announcement: resolvedEffectText,
          cards,
        };
      case "reduce-cost-all-and-gain-nightmares":
        return {
          kind: "energy-cost" as const,
          headline: `−${String(resolvedAction.energyCostReduction ?? 0)} ●`,
          announcement: resolvedEffectText,
          cards,
        };
      case "change-subtype-all":
      case "change-subtype-selected":
        return {
          kind: "subtype" as const,
          headline: resolution.chosenSubtype ?? "Subtype",
          announcement: resolvedEffectText,
          cards,
        };
      case "purge-duplicates-and-grant-reclaim":
        return {
          kind: "reclaim" as const,
          headline: "Reclaim",
          announcement: resolvedEffectText,
          cards,
          reclaimCostByEntryId: resolution.reclaimCostByEntryId ?? {},
        };
      default:
        return null;
    }
  })();
  const cards = resolution.gainedCardIds.flatMap((cardId) => {
    const card = cardById(content, cardId);
    return card === null ? [] : [modelForCard(card)];
  });
  const purgedCards =
    resolvedAction?.effectKind === "purge-and-copy" ||
    resolvedAction?.effectKind === "purge-duplicates-and-grant-reclaim" ||
    resolvedAction?.effectKind === "replace-selected" ||
    resolvedAction?.effectKind === "replace-selected-with-card"
      ? resolution.purgedCardIds.flatMap((cardId, index) => {
          const card = cardById(content, cardId);
          if (card === null) return [];
          return [{
            entryId:
              resolution.purgedEntryIds?.[index] ??
              `purged:${String(index)}:${card.id}`,
            model: modelForCard(card),
            isBane: false,
          }];
        })
      : [];
  const dreamsigns = resolution.gainedDreamsignIds.flatMap((dreamsignId) => {
    const normalized = dreamsignId.toLowerCase();
    const dreamsign = state.dreamsigns.find(
      (candidate) => candidate.id?.toLowerCase() === normalized,
    );
    return dreamsign === undefined ? [] : [dreamsign];
  });
  const semanticKind =
    resolvedAction?.effectKind === "replace-selected" ||
    resolvedAction?.effectKind === "replace-selected-with-card"
      ? "card-replacement"
      : resolvedAction?.effectKind === "gain-offered-card" ||
          resolvedAction?.effectKind === "draft-card" ||
          resolvedAction?.effectKind === "take-cards" ||
          resolvedAction?.effectKind === "copy-selected-cards"
        ? "card-acquisition"
        : "objects";
  return cards.length === 0 &&
    purgedCards.length === 0 &&
    dreamsigns.length === 0 &&
    deckModification === null &&
    semanticKind === "objects"
    ? null
    : {
        semanticKind,
        objects: { cards, purgedCards, dreamsigns },
        deckModification,
      };
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
  const reward = rewardForResolution(
    params.runtime,
    params.state,
    params.content,
    encounter.actions,
    actions,
  );
  const outcomeKind =
    reward === null
      ? null
      : "kind" in reward
        ? reward.kind
        : reward.deckModification?.kind ?? reward.semanticKind ?? "objects";
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
    reward,
    outcomeKind,
  };
}
