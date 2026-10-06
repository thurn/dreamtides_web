// Pure view-model construction for the Exploration encounter: the site view
// and its action offers. The resolved-action reward comes from
// exploration-resolution-view-model.ts.

import { resolveDeckEntryCard } from "../../card-type-change";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type {
  ExplorationActionView,
  ExplorationCardSelectionOperation,
  ExplorationCardChoiceView,
  ExplorationFollowupView,
  ExplorationEntityView,
  ExplorationSiteView,
} from "../../cumulus/screens/ExplorationSiteScreen";
import type { TransfigurationCandidateView } from "../../cumulus/screens/TransfigurationSiteScreen";
import {
  EXPLORATION_CHOOSABLE_SITE_TYPES,
  explorationActionUsesOfferedDeckTarget,
  explorationEncounterForCard,
  type ExplorationActionContent,
  type ExplorationPredicate,
} from "../../data/exploration";
import {
  derivedExplorationEffectArgumentNames,
  derivedExplorationEffectText,
  sharedExplorationFollowupSubtitle,
} from "../../data/exploration-presentation";
import {
  cardById,
  explorationOfferPlan,
  hasUsableExplorationOffer,
  usesMultiCardTransfigurationPreparation,
  usesRandomDeckTargetPreparation,
  usesStarterCardPreparation,
  usesStarterCardTransfigurationPreparation,
} from "../../exploration/offer-usability";
import { matchesPredicate } from "../../exploration/predicates";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import { toDreamsignView } from "../../cumulus/components/hud/dreamsign-view";
import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../data/sites-data";
import type { DreamGuideContent } from "../../types/content";
import type {
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
import { projectGuideView } from "./guide-view-model";
import { transfigurationForm } from "../../data/transfiguration-data";
import { transfigurationPresentation } from "../../cumulus/components/controls/transfiguration-presentation";
import type { GuideId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import type { DeckEntryId } from "../../types/identifiers";
import type { IdentityRecord } from "../../types/identifiers";
import {
  annotateText,
  fillTemplate,
  plainAnnotatedText,
} from "../../runtime/text";
import {
  dreamsignById,
  avatarById,
  modelForCard,
  deckCardChoice,
  dreamsignChoices,
  authoredEssencePerSpark,
  templateArgumentNames,
} from "./exploration-choices";
import { rewardForResolution } from "./exploration-resolution-view-model";

/** Resolve Layaway, the resident guide for Exploration. */
export function resolveExplorationGuide(
  guides: readonly DreamGuideContent[],
  presentingGuideId?: GuideId,
): DreamGuideContent {
  return requireGuideForSiteType(guides, "Exploration", presentingGuideId);
}

function eligibleDeckCards(
  state: JourneyState,
  content: JourneyContent,
  predicate?: ExplorationPredicate,
): readonly ExplorationCardChoiceView<DeckEntryId>[] {
  return state.deck.flatMap((entry) => {
    const card = deckCardChoice(entry, content);
    if (card === null) return [];
    if (
      predicate !== undefined &&
      !matchesPredicate(
        card.model.displaySnapshot,
        predicate,
        content.rewardSelectionData.tuning.costBands,
      )
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
  offeredEntryIds?: readonly DeckEntryId[],
): readonly TransfigurationCandidateView[] {
  const offered =
    offeredEntryIds === undefined ? null : new Set(offeredEntryIds);
  return state.deck.flatMap((entry) => {
    if (offered !== null && !offered.has(entry.entryId)) return [];
    if (entry.transfiguration !== null) return [];
    const base = content.cardDatabase.get(entry.cardNumber);
    if (base === undefined) return [];
    const card = resolveDeckEntryCard(content.transfigurationData, base, entry);
    if (
      predicate !== undefined &&
      !matchesPredicate(
        card,
        predicate,
        content.rewardSelectionData.tuning.costBands,
      )
    )
      return [];
    const forms = offeredTransfigurationForms(
      content.transfigurationData,
      card,
      null,
    ).map((offer) => {
      const preview = buildTransfigurationDisplay(
        content.transfigurationData,
        card,
        offer.type,
      );
      return {
        type: offer.type,
        presentation: transfigurationPresentation(
          transfigurationForm(content.transfigurationData, offer.type),
        ),
        change: offer.change,
        effectDetails: transfigurationEffectDetails(offer, card),
        pricing: { kind: "unpriced" as const },
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

function preparedMultiCardTransfigurationCandidates(
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): readonly TransfigurationCandidateView[] {
  const preparation = explorationOfferPlan(offer, "multi-card-transfiguration");
  if (preparation === undefined) return [];
  const candidatesByEntryId = new Map(
    freeTransfigurationCandidates(
      state,
      content,
      undefined,
      preparation.eligibleCards.map((binding) => binding.entryId),
    ).map((candidate) => [candidate.entryId, candidate]),
  );
  return preparation.eligibleCards.flatMap((binding) => {
    const candidate = candidatesByEntryId.get(binding.entryId);
    if (candidate === undefined || candidate.model.cardId !== binding.cardId) {
      return [];
    }
    const allowedForms = new Set(binding.transfigurations);
    const forms = candidate.forms.filter((form) => allowedForms.has(form.type));
    return forms.length === binding.transfigurations.length
      ? [{ ...candidate, forms }]
      : [];
  });
}

function preparedMultiCardTransfigurationCards(
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): readonly ExplorationCardChoiceView<DeckEntryId>[] {
  return preparedMultiCardTransfigurationCandidates(offer, state, content).map(
    (candidate) => ({
      entryId: candidate.entryId,
      model: candidate.model,
      isBane:
        state.deck.find((entry) => entry.entryId === candidate.entryId)
          ?.isBane ?? false,
    }),
  );
}

function preparedMultiCardReplacementCards(
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): readonly ExplorationCardChoiceView<DeckEntryId>[] {
  const preparation = explorationOfferPlan(offer, "multi-card-replacement");
  if (preparation === undefined) return [];
  return preparation.bindings.flatMap((binding) => {
    const entry = state.deck.find(
      (candidate) => candidate.entryId === binding.sourceEntryId,
    );
    if (entry === undefined) return [];
    const choice = deckCardChoice(entry, content);
    return choice !== null && choice.model.cardId === binding.sourceCardId
      ? [choice]
      : [];
  });
}

function offeredCards(
  ids: readonly CardId[],
  content: JourneyContent,
  transfigurationByCardId?: Readonly<
    IdentityRecord<CardId, TransfigurationType>
  >,
): readonly ExplorationCardChoiceView<CardId>[] {
  return ids.flatMap((id) => {
    const card = cardById(content, id);
    if (card === null) return [];
    const transfiguration = transfigurationByCardId?.[card.id];
    if (transfiguration === undefined) {
      return [{ entryId: card.id, model: modelForCard(card), isBane: false }];
    }
    const preview = buildTransfigurationDisplay(
      content.transfigurationData,
      card,
      transfiguration,
    );
    return [
      {
        entryId: card.id,
        model: {
          cardId: card.id,
          displaySnapshot: preview.card,
          transfiguration: preview.display,
        },
        isBane: false,
      },
    ];
  });
}

function offeredDeckCards(
  ids: readonly string[],
  state: JourneyState,
  content: JourneyContent,
): readonly ExplorationCardChoiceView<DeckEntryId>[] {
  return ids.flatMap((entryId) => {
    const entry = state.deck.find((candidate) => candidate.entryId === entryId);
    if (entry === undefined) return [];
    const card = deckCardChoice(entry, content);
    return card === null ? [] : [card];
  });
}

function heldDreamsignChoices(state: JourneyState) {
  return state.dreamsigns.map((dreamsign) => toDreamsignView(dreamsign));
}

function dreamsignFlowFollowup(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationFollowupView {
  const preparation = explorationOfferPlan(offer, "dreamsign");
  const requiredOverflowReplacementCount =
    preparation?.requiredOverflowReplacementCount ?? 0;
  const common = {
    kind: "dreamsign-flow" as const,
    title: configuredFollowupCopy(
      action,
      content,
      "followupTitle",
      action.label,
    ),
    subtitle: configuredFollowupCopy(
      action,
      content,
      "followupSubtitle",
      "Choose the Dreamsigns for this exchange.",
    ),
    held: heldDreamsignChoices(state),
    requiredOverflowReplacementCount,
  };
  switch (action.effectKind) {
    case "gain-offered-dreamsign":
    case "gain-nightmare-and-offered-dreamsign":
      return {
        ...common,
        mode: "gain-offered",
        offered: dreamsignChoices(offer.offeredDreamsignIds ?? [], content),
      };
    case "replace-selected-dreamsign-with-offered":
      return {
        ...common,
        mode: "replace-with-offered",
        offered: dreamsignChoices(offer.offeredDreamsignIds ?? [], content),
      };
    case "purge-selected-dreamsign-and-gain-random":
      return {
        ...common,
        mode: "purge-and-gain-random",
        offered: [],
      };
    default:
      return { kind: "none" };
  }
}

function deckEntryFollowup(
  title: string,
  subtitle: string,
  cards: readonly ExplorationCardChoiceView<DeckEntryId>[],
  mode: "single" | "exact" | "purge-and-copy",
  selectionOperation: ExplorationCardSelectionOperation | undefined,
  count = 1,
): ExplorationFollowupView {
  return {
    kind: "cards",
    title,
    subtitle,
    cards,
    mode,
    selectionKey: "entryIds",
    ...(selectionOperation === undefined ? {} : { selectionOperation }),
    min: count,
    max: count,
  };
}

function catalogCardFollowup(
  title: string,
  subtitle: string,
  cards: readonly ExplorationCardChoiceView<CardId>[],
  mode: "single" | "exact",
  selectionOperation: ExplorationCardSelectionOperation | undefined,
  count = 1,
): ExplorationFollowupView {
  return {
    kind: "cards",
    title,
    subtitle,
    cards,
    mode,
    selectionKey: "cardIds",
    ...(selectionOperation === undefined ? {} : { selectionOperation }),
    min: count,
    max: count,
  };
}

function configuredFollowupCopy(
  action: ExplorationActionContent,
  _content: JourneyContent,
  key: "followupTitle" | "followupSubtitle",
  fallback?: string,
): string {
  const template = action[key];
  const codeDefault =
    key === "followupSubtitle"
      ? sharedExplorationFollowupSubtitle(action)
      : undefined;
  const selected =
    template === undefined || template === ""
      ? (codeDefault ?? fallback)
      : template;
  if (selected === undefined) {
    throw new Error(
      `Missing configured Exploration ${key} for action ${action.id}.`,
    );
  }
  const valueFor = (name: string): number | string => {
    switch (name) {
      case "count":
        return action.count ?? 1;
      case "subtype":
        return action.subtype ?? "Outsider";
      case "transfiguration":
        return action.transfiguration ?? "Kindled";
      case "essence_per_spark":
        return authoredEssencePerSpark(action);
      default:
        throw new Error(
          `Missing configured Exploration followup argument {${name}}.`,
        );
    }
  };
  const names = [...selected.matchAll(/\{([a-z][a-z0-9_]*)\}/gu)].map(
    (match) => match[1] ?? "",
  );
  const values = Object.fromEntries(
    names.map((name) => [name, valueFor(name)]),
  );
  return fillTemplate(selected, values);
}

function siteTypeChoiceFollowup(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  content: JourneyContent,
): ExplorationFollowupView {
  const preparation = explorationOfferPlan(offer, "site-type-choice");
  const choices =
    preparation?.choices.flatMap((choice, index) => {
      if (
        !EXPLORATION_CHOOSABLE_SITE_TYPES.includes(choice.siteType) ||
        choice.insertedSite.type !== choice.siteType ||
        choice.insertedSite.id.length === 0 ||
        choice.insertedSite.isEnhanced ||
        choice.insertedSite.isVisited
      ) {
        return [];
      }
      return [
        {
          siteType: choice.siteType,
          model: {
            id: choice.insertedSite.id,
            type: choice.insertedSite.type,
            isVisited: choice.insertedSite.isVisited,
            pos: { x: 50, y: 50 },
            index,
            isBattle: false,
            isLocked: false,
            isInteractive: true,
            label: siteTypeName(content.sitesData, choice.siteType),
            blurb: siteTypeDescription(content.sitesData, choice.siteType),
            icon: glyph(siteTypeIcon(content.sitesData, choice.siteType)),
          },
        },
      ];
    }) ?? [];
  return {
    kind: "site-types",
    title: configuredFollowupCopy(
      action,
      content,
      "followupTitle",
      action.label,
    ),
    subtitle: configuredFollowupCopy(
      action,
      content,
      "followupSubtitle",
      action.label,
    ),
    choices,
  };
}

function followupForAction(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationFollowupView {
  const deckCards = eligibleDeckCards(state, content, action.predicate);
  const hasMintedDeckCard = explorationActionUsesOfferedDeckTarget(action);
  switch (action.effectKind) {
    case "purge-and-copy":
      return deckEntryFollowup(
        configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          "Exchange Familiar Forms",
        ),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "First choose a card to purge, then choose a different card to copy.",
        ),
        eligibleDeckCards(state, content),
        "purge-and-copy",
        undefined,
        2,
      );
    case "transfigure-selected":
      if (action.count !== undefined && action.count > 1) {
        return {
          kind: "multi-card-transfiguration",
          title: configuredFollowupCopy(
            action,
            content,
            "followupTitle",
            action.label,
          ),
          subtitle: configuredFollowupCopy(
            action,
            content,
            "followupSubtitle",
            "Choose the cards, then choose one transfiguration for each.",
          ),
          count: action.count,
          candidates: preparedMultiCardTransfigurationCandidates(
            offer,
            state,
            content,
          ),
        };
      }
      return {
        kind: "transfiguration",
        candidates: freeTransfigurationCandidates(
          state,
          content,
          action.predicate,
          hasMintedDeckCard ? (offer.offeredDeckEntryIds ?? []) : undefined,
        ),
      };
    case "transfigure-random-cards":
    case "transfigure-fixed-random-cards":
      return { kind: "none" };
    case "purge-selected":
      return {
        kind: "cards",
        title: configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          "Feed the Fire",
        ),
        subtitle: configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose an Event to purge.",
        ),
        cards: deckCards,
        mode: (action.count ?? 1) > 1 ? "exact" : "single",
        selectionKey: "entryIds",
        selectionOperation: "purge",
        min: (action.count ?? 1) > 1 ? 0 : 1,
        max: action.count ?? 1,
      };
    case "purge-for-essence":
      return deckEntryFollowup(
        configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          "Trade Away a Figure",
        ),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          `Choose a card to purge for ${String(authoredEssencePerSpark(action))} essence per ✦.`,
        ),
        eligibleDeckCards(state, content),
        "single",
        "purge",
      );
    case "change-subtype-selected":
      if (hasMintedDeckCard) return { kind: "none" };
      return deckEntryFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          `Choose a Character to become ${action.subtype ?? "Outsider"}.`,
        ),
        deckCards,
        "single",
        "change",
      );
    case "copy-selected-card":
      if (hasMintedDeckCard) return { kind: "none" };
      return deckEntryFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          `Choose a card to gain ${String(action.count ?? 1)} copies of.`,
        ),
        deckCards,
        "single",
        "copy",
      );
    case "copy-selected-cards":
      return deckEntryFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          `Choose ${String(action.count ?? 2)} cards to copy.`,
        ),
        deckCards,
        "exact",
        "copy",
        action.count ?? 2,
      );
    case "copy-offered-deck-card":
      return deckEntryFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose one offered card to copy.",
        ),
        offeredDeckCards(offer.offeredDeckEntryIds ?? [], state, content),
        "single",
        "copy",
      );
    case "replace-selected":
      if ((action.count ?? 1) > 1) {
        const cards = preparedMultiCardReplacementCards(offer, state, content);
        return {
          kind: "cards",
          title: configuredFollowupCopy(action, content, "followupTitle"),
          subtitle: configuredFollowupCopy(
            action,
            content,
            "followupSubtitle",
            `Choose up to ${String(action.count)} cards to exchange.`,
          ),
          cards,
          mode: "exact",
          selectionKey: "entryIds",
          selectionOperation: "purge",
          min: 1,
          max: Math.min(action.count ?? 1, cards.length),
        };
      }
      return deckEntryFollowup(
        configuredFollowupCopy(action, content, "followupTitle"),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose a Spirit Animal to exchange.",
        ),
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
      return deckEntryFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose a card to replace.",
        ),
        deckCards,
        "single",
        "purge",
      );
    case "change-card-type-selected":
      if (hasMintedDeckCard) return { kind: "none" };
      return deckEntryFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          `Choose a card to become ${action.cardType ?? "Character"}.`,
        ),
        deckCards.filter(
          (card) =>
            action.cardType !== undefined &&
            card.model.displaySnapshot.cardType !== action.cardType,
        ),
        "single",
        "change",
      );
    case "transfigure-fixed-selected":
      if (hasMintedDeckCard) return { kind: "none" };
      if ((action.count ?? 1) > 1) {
        return {
          kind: "cards",
          title: configuredFollowupCopy(
            action,
            content,
            "followupTitle",
            action.label,
          ),
          subtitle: configuredFollowupCopy(
            action,
            content,
            "followupSubtitle",
            `Choose ${String(action.count)} cards to become ${action.transfiguration ?? "Kindled"}.`,
          ),
          cards: preparedMultiCardTransfigurationCards(offer, state, content),
          mode: "exact",
          selectionKey: "entryIds",
          selectionOperation: "transfigure",
          min: action.count ?? 1,
          max: action.count ?? 1,
        };
      }
      return deckEntryFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          `Choose a card to become ${action.transfiguration ?? "Kindled"}.`,
        ),
        deckCards.filter(
          (card) =>
            state.deck.find((entry) => entry.entryId === card.entryId)
              ?.transfiguration === null &&
            offeredTransfigurationForms(
              content.transfigurationData,
              card.model.displaySnapshot,
              null,
            ).some((form) => form.type === action.transfiguration),
        ),
        "single",
        "transfigure",
      );
    case "draft-card":
      return catalogCardFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose one offered card.",
        ),
        offeredCards(offer.offeredCardIds, content),
        "single",
        undefined,
        1,
      );
    case "transfigured-card-draft":
      return catalogCardFollowup(
        configuredFollowupCopy(action, content, "followupTitle", action.label),
        configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose one offered transfigured card.",
        ),
        offeredCards(
          offer.offeredCardIds,
          content,
          offer.transfigurationByCardId,
        ),
        "single",
        undefined,
        1,
      );
    case "gain-offered-card":
    case "add-site":
    case "add-fixed-site":
    case "transfigure-all-for-essence":
    case "copy-random-cards":
    case "replace-random-with-card":
      return { kind: "none" };
    case "choose-site-type":
      return siteTypeChoiceFollowup(action, offer, content);
    case "take-cards": {
      const cards = offeredCards(offer.offeredCardIds, content);
      return {
        kind: "cards",
        title: configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          action.label,
        ),
        subtitle: configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose any number of offered cards.",
        ),
        cards,
        mode: "exact",
        selectionKey: "cardIds",
        min: 0,
        max: cards.length,
      };
    }
    case "take-transfigured-cards-and-gain-nightmares": {
      const preparation = explorationOfferPlan(offer, "compound-action");
      if (
        preparation === undefined ||
        preparation.kind !== "take-transfigured-nightmares"
      ) {
        return { kind: "none" };
      }
      const transfigurationByCardId = Object.fromEntries(
        preparation.offeredCards.map((card) => [
          card.cardId,
          card.transfiguration,
        ]),
      );
      const cards = offeredCards(
        preparation.offeredCards.map((card) => card.cardId),
        content,
        transfigurationByCardId,
      );
      return {
        kind: "cards",
        title: configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          action.label,
        ),
        subtitle: configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose any number of offered cards.",
        ),
        cards,
        mode: "exact",
        selectionKey: "cardIds",
        selectionOperation: "transfigure",
        min: 0,
        max: cards.length,
      };
    }
    case "purge-one-transfigure-and-copy-others": {
      const preparation = explorationOfferPlan(offer, "compound-action");
      if (
        preparation === undefined ||
        preparation.kind !== "purge-transfigure-copy"
      ) {
        return { kind: "none" };
      }
      return {
        kind: "cards",
        title: configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          action.label,
        ),
        subtitle: configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose one prepared card to purge.",
        ),
        cards: offeredDeckCards(
          preparation.targets.map((target) => target.entryId),
          state,
          content,
        ),
        mode: "single",
        selectionKey: "entryIds",
        selectionOperation: "purge",
        min: 1,
        max: 1,
      };
    }
    case "choose-pack":
      return {
        kind: "packs",
        title: configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          action.label,
        ),
        subtitle: configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose one pack to add to your deck.",
        ),
        packs: offer.packCardIds.map((ids, index) => ({
          index,
          cards: offeredCards(ids, content),
        })),
      };
    case "change-subtype-all":
      return {
        kind: "subtypes",
        title: configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          action.label,
        ),
        subtitle: configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose the subtype for every Character in your deck.",
        ),
        options: action.subtypeOptions ?? [],
      };
    case "gain-dreamsign":
    case "gain-random-dreamsign":
      if (state.dreamsigns.length >= state.maxDreamsigns) {
        return {
          kind: "dreamsigns",
          title: configuredFollowupCopy(
            action,
            content,
            "followupTitle",
            action.label,
          ),
          subtitle: configuredFollowupCopy(
            action,
            content,
            "followupSubtitle",
            "Choose a Dreamsign to replace.",
          ),
          selectionKey: "replacedDreamsignId",
          dreamsigns: heldDreamsignChoices(state),
        };
      }
      return { kind: "none" };
    case "gain-offered-dreamsign":
    case "gain-nightmare-and-offered-dreamsign":
    case "replace-selected-dreamsign-with-offered":
    case "purge-selected-dreamsign-and-gain-random":
      return dreamsignFlowFollowup(action, offer, state, content);
    case "gain-nightmare-and-dreamsign":
      if (
        (explorationOfferPlan(offer, "dreamsign")
          ?.requiredOverflowReplacementCount ?? 0) > 0
      ) {
        return {
          kind: "dreamsigns",
          title: configuredFollowupCopy(
            action,
            content,
            "followupTitle",
            action.label,
          ),
          subtitle: configuredFollowupCopy(
            action,
            content,
            "followupSubtitle",
            "Choose a Dreamsign to replace.",
          ),
          selectionKey: "replacedDreamsignId",
          dreamsigns: heldDreamsignChoices(state),
        };
      }
      return { kind: "none" };
    case "replace-all-dreamsigns-random":
      return { kind: "none" };
    case "purge-dreamsign-for-essence":
      return {
        kind: "dreamsigns",
        title: configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          action.label,
        ),
        subtitle: configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose a Dreamsign to purge.",
        ),
        selectionKey: "dreamsignId",
        dreamsigns: heldDreamsignChoices(state),
      };
    case "choose-avatar":
      return {
        kind: "avatars",
        title: configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          action.label,
        ),
        subtitle: configuredFollowupCopy(
          action,
          content,
          "followupSubtitle",
          "Choose your new Avatar.",
        ),
        avatars: (offer.offeredAvatarIds ?? []).flatMap((id) => {
          const avatar = avatarById(content, id);
          return avatar === null ? [] : [avatar];
        }),
      };
    case "gain-card":
    case "gain-nightmare-and-card":
    case "gain-random-cards":
    case "gain-essence":
    case "gain-random-essence":
    case "double-essence":
    case "gain-essence-per-card":
    case "increase-spark-all":
    case "purge-random-subtype-and-increase-spark":
    case "make-fast-all":
    case "reduce-cost-all-and-gain-nightmares":
    case "next-battle-opening-hand":
    case "next-battle-starting-energy":
    case "next-battle-smaller-hand-and-cost-discount":
    case "purge-duplicates-and-grant-reclaim":
    case "transfigure-next-draft-or-shop":
    case "purge-starter-card":
    case "purge-random-starter-card":
    case "purge-random-starter-and-gain-card":
    case "replace-all-starter-cards":
    case "transfigure-random-starter-cards":
    case "transfigure-all-starter-cards":
    case "free-next-shop":
    case "lose-half-essence-and-free-purchases":
    case "transfigure-all-cards":
    case "purge-disclosed-and-transfigure-same-type":
    case "make-predicate-fast-and-gain-nightmares":
      return { kind: "none" };
  }
}

interface ExplorationEffectReference {
  readonly placeholder: string;
  readonly entity: ExplorationEntityView;
}

interface DeckCardVariableTarget {
  readonly entryId: DeckEntryId;
  readonly entity: Extract<ExplorationEntityView, { readonly kind: "card" }>;
}

function starterCardVariableTarget(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): DeckCardVariableTarget | null {
  if (action.effectKind !== "purge-starter-card") return null;
  const purgedEntryIds = explorationOfferPlan(
    offer,
    "starter-card",
  )?.purgedEntryIds;
  const entryId = purgedEntryIds?.[0];
  if (entryId === undefined || purgedEntryIds?.length !== 1) return null;
  const entry = state.deck.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) return null;
  const choice = deckCardChoice(entry, content);
  if (choice === null) return null;
  return {
    entryId,
    entity: {
      kind: "card",
      card: choice.model.displaySnapshot,
      entryId,
      ...(choice.model.transfiguration === undefined
        ? {}
        : { transfiguration: choice.model.transfiguration }),
    },
  };
}

function fixedTransfigurationDisclosure(
  action: ExplorationActionContent,
  content: JourneyContent,
): string | undefined {
  if (
    (action.effectKind !== "transfigure-fixed-selected" &&
      action.effectKind !== "transfigure-all-for-essence" &&
      action.effectKind !== "purge-disclosed-and-transfigure-same-type" &&
      action.effectKind !== "take-transfigured-cards-and-gain-nightmares" &&
      action.effectKind !== "purge-one-transfigure-and-copy-others") ||
    action.transfiguration === undefined
  ) {
    return undefined;
  }
  return `(${
    transfigurationForm(content.transfigurationData, action.transfiguration)
      .description
  })`;
}

function deckCardVariableTarget(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): DeckCardVariableTarget | null {
  const compoundPreparation = explorationOfferPlan(offer, "compound-action");
  const isDisclosedCompoundTarget =
    action.effectKind === "purge-disclosed-and-transfigure-same-type" &&
    compoundPreparation?.kind === "purge-disclosed-transfigure-same-type";
  if (
    !explorationActionUsesOfferedDeckTarget(action) &&
    !isDisclosedCompoundTarget
  ) {
    return null;
  }
  const offeredEntryId = isDisclosedCompoundTarget
    ? compoundPreparation.target?.entryId
    : offer.offeredDeckEntryIds?.[0];
  if (offeredEntryId === undefined || offer.offeredDeckEntryIds?.length !== 1) {
    return null;
  }
  const target = state.deck.find((entry) => entry.entryId === offeredEntryId);
  if (target === undefined) return null;
  const base = content.cardDatabase.get(target.cardNumber);
  if (base === undefined) return null;
  const card = resolveDeckEntryCard(content.transfigurationData, base, target);
  const entity =
    action.effectKind === "transfigure-fixed-selected" &&
    action.transfiguration !== undefined
      ? (() => {
          const preview = buildTransfigurationDisplay(
            content.transfigurationData,
            card,
            action.transfiguration,
          );
          return {
            kind: "card" as const,
            card: preview.card,
            entryId: target.entryId,
            transfiguration: preview.display,
          };
        })()
      : { kind: "card" as const, card, entryId: target.entryId };
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
  starterCardEntity?: DeckCardVariableTarget["entity"],
): readonly ExplorationEffectReference[] {
  const references: ExplorationEffectReference[] = [];
  const argumentNames = explorationEffectArgumentNames(action);
  const offeredCardPlaceholder = argumentNames.find(
    (name) => name === "offered_card",
  );
  if (offeredCardPlaceholder !== undefined) {
    const offeredCardId = offer.offeredCardIds[0];
    const offeredCard =
      offeredCardId === undefined ? null : cardById(content, offeredCardId);
    if (offeredCard !== null) {
      references.push({
        placeholder: offeredCardPlaceholder,
        entity: { kind: "card", card: offeredCard },
      });
    }
  }
  const deckCardPlaceholder = argumentNames.find(
    (name) => name === "deck_card",
  );
  if (deckCardPlaceholder !== undefined && deckCardEntity !== undefined) {
    references.push({
      placeholder: deckCardPlaceholder,
      entity: deckCardEntity,
    });
  }
  const starterCardPlaceholder = argumentNames.find(
    (name) => name === "starter_card",
  );
  if (starterCardPlaceholder !== undefined && starterCardEntity !== undefined) {
    references.push({
      placeholder: starterCardPlaceholder,
      entity: starterCardEntity,
    });
  }
  const fixedCardPlaceholder = argumentNames.find(
    (name) => name === "fixed_card",
  );
  if (fixedCardPlaceholder !== undefined && action.cardId !== undefined) {
    const card = cardById(content, action.cardId);
    if (card !== null) {
      references.push({
        placeholder: fixedCardPlaceholder,
        entity: { kind: "card", card },
      });
    }
  }
  const nightmareCardPlaceholder = argumentNames.find(
    (name) => name === "nightmare_card",
  );
  if (nightmareCardPlaceholder !== undefined) {
    const card = cardById(content, NIGHTMARE_CARD_ID);
    if (card !== null) {
      const copies =
        action.nightmareCount !== undefined &&
        Number.isInteger(action.nightmareCount) &&
        action.nightmareCount > 1
          ? action.nightmareCount
          : undefined;
      references.push({
        placeholder: nightmareCardPlaceholder,
        entity: {
          kind: "card",
          card,
          ...(copies === undefined ? {} : { copies }),
        },
      });
    }
  }
  const dreamsignPlaceholder = argumentNames.find(
    (name) => name === "dreamsign",
  );
  if (dreamsignPlaceholder !== undefined && action.dreamsignId !== undefined) {
    const dreamsign = dreamsignById(content, action.dreamsignId);
    if (dreamsign !== null) {
      references.push({
        placeholder: dreamsignPlaceholder,
        entity: {
          kind: "dreamsign",
          dreamsign: toDreamsignView(dreamsign),
        },
      });
    }
  }
  return references;
}

function explorationEffectArgumentNames(
  action: ExplorationActionContent,
): readonly string[] {
  const message = action.effectText;
  if (message === undefined)
    return derivedExplorationEffectArgumentNames(action);
  return templateArgumentNames(message);
}

function explorationPredicate(
  predicate: ExplorationPredicate | undefined,
): string {
  switch (predicate) {
    case "character":
      return "Character";
    case "event":
      return "Event";
    case "cheap-character":
      return "≤2● cost Character";
    case "legendary":
      return "legendary";
    case "spirit-animal":
      return "Spirit Animal";
    case "survivor":
      return "Survivor";
    case "warrior":
      return "Warrior";
    default:
      throw new Error(
        "Missing predicate for derived Exploration presentation.",
      );
  }
}

/** Attach UUID-backed reveal entities to an Exploration effect's placeholders. */
export function buildExplorationActionEffect(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  content: JourneyContent,
  deckCardEntity?: DeckCardVariableTarget["entity"],
  starterCardEntity?: DeckCardVariableTarget["entity"],
): Pick<ExplorationActionView, "effectText" | "effectFallback"> {
  const references = effectReferencesForAction(
    action,
    offer,
    content,
    deckCardEntity,
    starterCardEntity,
  );
  const effectValues = (
    concealedTargets: Readonly<Record<string, string>> = {},
  ): Record<string, string> => {
    const argumentNames = explorationEffectArgumentNames(action);
    const templateValues: Record<string, string> = Object.fromEntries(
      argumentNames.map((argumentName) => {
        const concealedTarget = concealedTargets[argumentName];
        if (concealedTarget !== undefined) {
          return [argumentName, concealedTarget];
        }
        const reference = references.find(
          (candidate) => candidate.placeholder === argumentName,
        );
        if (reference === undefined) {
          switch (argumentName) {
            case "card_type":
              if (action.cardType !== undefined)
                return [argumentName, action.cardType];
              break;
            case "predicate":
              return [argumentName, explorationPredicate(action.predicate)];
            case "subtype":
              if (action.subtype !== undefined)
                return [argumentName, action.subtype];
              break;
            case "transfiguration":
              if (action.transfiguration !== undefined) {
                return [
                  argumentName,
                  transfigurationPresentation(
                    transfigurationForm(
                      content.transfigurationData,
                      action.transfiguration,
                    ),
                  ).name,
                ];
              }
              break;
          }
          throw new Error(
            `Missing Exploration effect argument {${argumentName}}.`,
          );
        }
        const entity = reference.entity;
        return [
          argumentName,
          entity.kind === "card" ? entity.card.name : entity.dreamsign.name,
        ];
      }),
    );
    return templateValues;
  };
  const renderEffect = (values: Readonly<Record<string, string>>): string =>
    action.effectText === undefined
      ? derivedExplorationEffectText(action, values)
      : fillTemplate(action.effectText, values);
  const argumentNames = explorationEffectArgumentNames(action);
  if (
    argumentNames.includes("deck_card") &&
    !references.some((reference) => reference.placeholder === "deck_card")
  ) {
    const message = renderEffect(
      effectValues({ deck_card: "an eligible card" }),
    );
    return {
      effectText: plainAnnotatedText(message),
      effectFallback: { message },
    };
  }
  if (
    argumentNames.includes("starter_card") &&
    !references.some((reference) => reference.placeholder === "starter_card")
  ) {
    const message = renderEffect(
      effectValues({ starter_card: "a Starter card" }),
    );
    return {
      effectText: plainAnnotatedText(message),
      effectFallback: { message },
    };
  }
  const values = effectValues();
  return {
    effectText: annotateText(
      renderEffect,
      values,
      Object.fromEntries(
        references
          .filter((reference) =>
            Object.prototype.hasOwnProperty.call(values, reference.placeholder),
          )
          .map((reference) => [reference.placeholder, reference.entity]),
      ),
    ),
  };
}

function actionView(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationActionView {
  const deckCardTarget = deckCardVariableTarget(action, offer, state, content);
  const starterCardTarget = starterCardVariableTarget(
    action,
    offer,
    state,
    content,
  );
  const followup = followupForAction(action, offer, state, content);
  const hasRequiredOffer = hasUsableExplorationOffer({
    action,
    offer,
    state,
    content,
    followup,
    starterTargetCardId: starterCardTarget?.entity.card.id,
    hasDeckCardTarget: deckCardTarget !== null,
  });
  const available =
    hasRequiredOffer &&
    (followup.kind === "none" ||
      (followup.kind === "transfiguration" && followup.candidates.length > 0) ||
      (followup.kind === "multi-card-transfiguration" &&
        followup.candidates.length >= followup.count) ||
      (followup.kind === "cards" && followup.cards.length >= followup.min) ||
      (followup.kind === "packs" && followup.packs.length > 0) ||
      (followup.kind === "subtypes" && followup.options.length > 0) ||
      (followup.kind === "dreamsigns" && followup.dreamsigns.length > 0) ||
      (followup.kind === "dreamsign-flow" &&
        (followup.offered.length > 0 || followup.held.length > 0)) ||
      (followup.kind === "avatars" && followup.avatars.length > 0) ||
      (followup.kind === "site-types" && followup.choices.length > 0));
  const effect = buildExplorationActionEffect(
    action,
    offer,
    content,
    deckCardTarget?.entity,
    starterCardTarget?.entity,
  );
  const effectDisclosure =
    fixedTransfigurationDisclosure(action, content) ??
    (action.effectKind === "add-site" && offer.offeredSiteType !== undefined
      ? `${offer.offeredSiteType}.`
      : undefined);
  return {
    id: action.id,
    effectKind: action.effectKind,
    mechanics: {
      effectKind: action.effectKind,
      ...(action.deckTarget === undefined
        ? {}
        : { deckTarget: action.deckTarget }),
      ...(action.predicate === undefined
        ? {}
        : { predicate: action.predicate }),
      ...(action.count === undefined ? {} : { count: action.count }),
      ...(action.cardId === undefined ? {} : { cardId: action.cardId }),
      ...(action.offerCount === undefined
        ? {}
        : { offerCount: action.offerCount }),
      ...(action.packCount === undefined
        ? {}
        : { packCount: action.packCount }),
      ...(action.packSize === undefined ? {} : { packSize: action.packSize }),
      ...(action.essencePerSpark === undefined
        ? {}
        : { essencePerSpark: action.essencePerSpark }),
      ...(action.essencePerCard === undefined
        ? {}
        : { essencePerCard: action.essencePerCard }),
      ...(action.sparkBonus === undefined
        ? {}
        : { sparkBonus: action.sparkBonus }),
      ...(action.essence === undefined ? {} : { essence: action.essence }),
      ...(action.minimumEssence === undefined
        ? {}
        : { minimumEssence: action.minimumEssence }),
      ...(action.maximumEssence === undefined
        ? {}
        : { maximumEssence: action.maximumEssence }),
      ...(action.energyCostReduction === undefined
        ? {}
        : { energyCostReduction: action.energyCostReduction }),
      ...(action.nightmareCount === undefined
        ? {}
        : { nightmareCount: action.nightmareCount }),
      ...(action.dreamsignId === undefined
        ? {}
        : { dreamsignId: action.dreamsignId }),
      ...(action.subtype === undefined ? {} : { subtype: action.subtype }),
      ...(action.subtypeOptions === undefined
        ? {}
        : { subtypeOptions: action.subtypeOptions }),
      ...(action.transfiguration === undefined
        ? {}
        : { transfiguration: action.transfiguration }),
      ...(action.cardType === undefined ? {} : { cardType: action.cardType }),
      ...(action.siteType === undefined ? {} : { siteType: action.siteType }),
    },
    label: action.label,
    ...effect,
    ...(action.transfiguration === undefined
      ? {}
      : {
          transfigurationGlossaryId: transfigurationForm(
            content.transfigurationData,
            action.transfiguration,
          ).glossaryUuid,
        }),
    ...(effectDisclosure === undefined ? {} : { effectDisclosure }),
    followup,
    ...(action.effectKind === "gain-offered-card" &&
    offer.offeredCardIds[0] !== undefined
      ? { automaticSelection: { cardIds: [offer.offeredCardIds[0]] } }
      : deckCardTarget !== null &&
          (action.effectKind === "transfigure-fixed-selected" ||
            action.effectKind === "change-subtype-selected" ||
            action.effectKind === "copy-selected-card" ||
            action.effectKind === "change-card-type-selected" ||
            action.effectKind === "purge-disclosed-and-transfigure-same-type")
        ? { automaticSelection: { entryIds: [deckCardTarget.entryId] } }
        : usesStarterCardPreparation(action)
          ? { automaticSelection: {} }
          : usesStarterCardTransfigurationPreparation(action)
            ? { automaticSelection: {} }
            : usesMultiCardTransfigurationPreparation(action) &&
                (action.effectKind === "transfigure-random-cards" ||
                  action.effectKind === "transfigure-fixed-random-cards")
              ? { automaticSelection: {} }
              : usesRandomDeckTargetPreparation(action)
                ? { automaticSelection: {} }
                : action.effectKind === "transfigure-all-cards" ||
                    action.effectKind ===
                      "make-predicate-fast-and-gain-nightmares"
                  ? { automaticSelection: {} }
                  : action.effectKind === "add-fixed-site"
                    ? { automaticSelection: {} }
                    : {}),
    available,
  };
}

/** Build the complete Exploration presentation from persisted domain data. */
export function buildExplorationSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Exploration" };
  guide: DreamGuideContent;
  guideLine: string;
  runtime: ExplorationSiteRuntime;
  state: JourneyState;
  content: JourneyContent;
}): ExplorationSiteView | null {
  const exploration = params.content.exploration;
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
    if (offer === undefined) return [];
    const view = actionView(action, offer, params.state, params.content);
    if (
      action.effectKind === "purge-random-subtype-and-increase-spark" &&
      !view.available &&
      params.runtime.resolution?.actionId !== action.id
    ) {
      return [];
    }
    return [view];
  });
  if (actions.length < 1 || actions.length > 4) return null;
  const scene: ArtRef | null = dreamscapeSceneRef(
    params.sceneNode,
    params.content,
  );
  const reward = rewardForResolution(
    params.runtime,
    params.site.id,
    params.state,
    params.content,
    params.sceneNode,
    encounter.actions,
    actions,
  );
  const outcomeKind =
    reward === null
      ? null
      : "kind" in reward
        ? reward.kind
        : (reward.deckModification?.kind ?? reward.semanticKind ?? "objects");
  return {
    siteId: params.site.id,
    scene,
    fullArt: artRef.explorationCard(sourceCard.imageNumber),
    guide: projectGuideView(params.guide, params.guideLine),
    card: { cardId: sourceCard.id, displaySnapshot: sourceCard },
    narrative: encounter.prose,
    actions,
    resolvedActionId: params.runtime.resolution?.actionId ?? null,
    reward,
    outcomeKind,
  };
}
