// Pure view-model construction for the Exploration encounter.

import { resolveDeckEntryCard } from "../../card-type-change";
import type { GameCardModel } from "../../cumulus/components/card/CardView";
import type { DreamscapeSiteModel } from "../../cumulus/components/dreamscape/SiteNode";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type {
  ExplorationActionEffectPart,
  ExplorationActionView,
  ExplorationCardSelectionOperation,
  ExplorationCardChoiceView,
  ExplorationFollowupView,
  ExplorationEntityView,
  ExplorationKeywordChangeView,
  ExplorationSiteView,
  ExplorationTransfigurationChangeView,
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
import { createDreamsign } from "../../data/dreamsigns";
import { toJourneyAvatar } from "../../data/avatar-selection";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import { localizedDreamsign } from "../../cumulus/components/hud/localized-dreamsign";
import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../data/sites-data";
import { parseCardId } from "../../types/card-identity";
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
import { LocalizedString, SourceMessage, opaque } from "@trox/runtime";
import { localizedSourceText } from "../../runtime/localization/runtime";
import {
  buildTransfigurationDisplay,
  offeredTransfigurationForms,
  transfigurationEffectDetails,
} from "../../transfiguration/transfiguration-logic";
import { AUGURY_TUNING } from "../../journey_v2/tuning";
import { projectGuideView } from "./guide-view-model";
import { transfigurationForm } from "../../data/transfiguration-data";
import { tx, txa } from "@trox/runtime";
import { localizedTransfigurationPresentation } from "../../cumulus/components/controls/transfiguration-presentation";
import type { GuideId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import type { DreamsignId } from "../../types/identifiers";
import type { AvatarId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import type { IdentityRecord } from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import { parseDreamsignId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSelectionKey } from "../../types/identifiers";
import { parseRewardCandidateKey } from "../../types/identifiers";

/** Resolve Layaway, the resident guide for Exploration. */
export function resolveExplorationGuide(
  guides: readonly DreamGuideContent[],
  presentingGuideId?: GuideId,
): DreamGuideContent {
  return requireGuideForSiteType(guides, "Exploration", presentingGuideId);
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
          (content.rewardSelectionData?.tuning.costBands
            .cheapCharacterMaximum ??
            AUGURY_TUNING.costBands.cheapCharacterMaximum)
      );
    case "legendary":
      return card.rarity === "Legendary";
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
  }
}

function cardById(content: JourneyContent, cardId: CardId): CardData | null {
  return (
    [...content.cardDatabase.values()].find((card) => card.id === cardId) ??
    null
  );
}

function hasStarterCardRole(card: CardData): boolean {
  return (
    card.isStarter === true || card.roles?.includes("starter-deck") === true
  );
}

function dreamsignById(
  content: JourneyContent,
  dreamsignId: DreamsignId,
): ReturnType<typeof createDreamsign> | null {
  const customDreamsign = content.exploration?.customDreamsigns.find(
    (dreamsign) => dreamsign.id === dreamsignId,
  );
  if (customDreamsign !== undefined) return customDreamsign;
  const template = content.dreamsignTemplates.find(
    (dreamsign) => dreamsign.id === dreamsignId,
  );
  return template === undefined ? null : createDreamsign(template);
}

function avatarById(
  content: JourneyContent,
  avatarId: AvatarId,
) {
  const normalized = avatarId.toLowerCase();
  const avatar = content.avatars.find(
    (candidate) => candidate.id.toLowerCase() === normalized,
  );
  return avatar === undefined ? null : toJourneyAvatar(avatar);
}

function modelForCard(card: CardData): GameCardModel {
  return { cardId: card.id, displaySnapshot: card };
}

function deckCardChoice(
  entry: DeckEntry,
  content: JourneyContent,
): ExplorationCardChoiceView<DeckEntryId> | null {
  const base = content.cardDatabase.get(entry.cardNumber);
  if (base === undefined) return null;
  const resolved = resolveDeckEntryCard(
    content.transfigurationData,
    base,
    entry,
  );
  const transfiguration =
    entry.transfiguration === null
      ? undefined
      : buildTransfigurationDisplay(
          content.transfigurationData,
          base,
          entry.transfiguration,
        ).display;
  return {
    entryId: entry.entryId,
    model: {
      ...modelForCard(resolved),
      ...(transfiguration === undefined ? {} : { transfiguration }),
    },
    isBane: entry.isBane,
  };
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
    if (predicate !== undefined && !matchesPredicate(card, predicate, content))
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
        presentation: localizedTransfigurationPresentation(
          transfigurationForm(content.transfigurationData, offer.type),
        ),
        change: offer.change,
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

function preparedMultiCardTransfigurationCandidates(
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): readonly TransfigurationCandidateView[] {
  const preparation = offer.multiCardTransfigurationPreparation;
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
  const preparation = offer.multiCardReplacementPreparation;
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
  return state.dreamsigns.flatMap((dreamsign) =>
    dreamsign.id === undefined
      ? []
      : [localizedDreamsign(dreamsign, "Exploration held Dreamsign")],
  );
}

function dreamsignChoices(
  ids: readonly string[],
  content: JourneyContent,
): readonly ReturnType<typeof localizedDreamsign>[] {
  return ids.flatMap((id) => {
    const dreamsign = dreamsignById(content, parseDreamsignId(id));
    if (dreamsign?.id === undefined) return [];
    return [localizedDreamsign(dreamsign, "Exploration Dreamsign choice")];
  });
}

function dreamsignFlowFollowup(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationFollowupView {
  const preparation = offer.dreamsignPreparation;
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
  title: LocalizedString,
  subtitle: LocalizedString,
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
  title: LocalizedString,
  subtitle: LocalizedString,
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
  fallback: string | LocalizedString | SourceMessage,
): LocalizedString {
  const template = action[key];
  const codeDefault =
    key === "followupSubtitle"
      ? sharedExplorationFollowupSubtitle(action)
      : undefined;
  const selected =
    template === undefined || template === ""
      ? (codeDefault ?? fallback)
      : template;
  const valueFor = (name: string): number | LocalizedString => {
    switch (name) {
      case "count":
        return action.count ?? 1;
      case "subtype":
        return localizedSourceText(action.subtype ?? "Outsider");
      case "transfiguration":
        return localizedSourceText(action.transfiguration ?? "Kindled");
      case "essence_per_spark":
        return authoredEssencePerSpark(action);
      default:
        throw new Error(
          `Missing configured Exploration followup argument {${name}}.`,
        );
    }
  };
  if (selected instanceof LocalizedString) return selected;
  const names =
    selected instanceof SourceMessage
      ? Object.keys(selected.argumentSchemas)
      : [...selected.matchAll(/\{([a-z][a-z0-9_]*)\}/gu)].map(
          (match) => match[1] ?? "",
        );
  const values = Object.fromEntries(
    names.map((name) => [name, valueFor(name)]),
  );
  if (selected instanceof SourceMessage) {
    return selected.bind(
      Object.fromEntries(
        names.map((name) => {
          const value = values[name];
          return [
            name,
            value instanceof LocalizedString ? opaque(value) : value,
          ];
        }),
      ),
    );
  }
  return localizedSourceText(selected, values);
}

function authoredEssencePerSpark(action: ExplorationActionContent): number {
  if (action.essencePerSpark === undefined) {
    throw new Error("Missing essencePerSpark on purge-for-essence action.");
  }
  return action.essencePerSpark;
}

function siteTypeChoiceFollowup(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  content: JourneyContent,
): ExplorationFollowupView {
  const preparation = offer.siteTypeChoicePreparation;
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
            label: localizedSourceText(
              siteTypeName(content.sitesData, choice.siteType),
            ),
            blurb: localizedSourceText(
              siteTypeDescription(content.sitesData, choice.siteType),
            ),
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
        configuredFollowupCopy(
          action,
          content,
          "followupTitle",
          "Release a Fellow Swimmer",
        ),
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
    case "change-random-card-type":
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
      const preparation = offer.compoundActionPreparation;
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
      const preparation = offer.compoundActionPreparation;
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
        (offer.dreamsignPreparation?.requiredOverflowReplacementCount ?? 0) > 0
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
  readonly needle: string;
  readonly part: Exclude<
    ExplorationActionEffectPart,
    { readonly kind: "text" }
  >;
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
  const entryId = offer.starterCardPreparation?.purgedEntryIds[0];
  if (
    entryId === undefined ||
    offer.starterCardPreparation?.purgedEntryIds.length !== 1
  ) {
    return null;
  }
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
): LocalizedString | undefined {
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
  return txa(
    "({description})",
    {
      description: transfigurationForm(
        content.transfigurationData,
        action.transfiguration,
      ).description,
    },
    "[exploration] [transfiguration] Parenthetical disclosure describing the fixed Transfiguration applied by an Exploration action. description is the canonical authored form description.",
  );
}

function deckCardVariableTarget(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): DeckCardVariableTarget | null {
  const compoundPreparation = offer.compoundActionPreparation;
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
  if (argumentNames.includes("offered_card")) {
    const offeredCardId = offer.offeredCardIds[0];
    const offeredCard =
      offeredCardId === undefined ? null : cardById(content, offeredCardId);
    if (offeredCard !== null) {
      references.push({
        needle: "{offered_card}",
        part: { kind: "entity", entity: { kind: "card", card: offeredCard } },
      });
    }
  }
  if (argumentNames.includes("deck_card") && deckCardEntity !== undefined) {
    references.push({
      needle: "{deck_card}",
      part: { kind: "entity", entity: deckCardEntity },
    });
  }
  if (
    argumentNames.includes("starter_card") &&
    starterCardEntity !== undefined
  ) {
    references.push({
      needle: "{starter_card}",
      part: { kind: "entity", entity: starterCardEntity },
    });
  }
  if (argumentNames.includes("fixed_card") && action.cardId !== undefined) {
    const card = cardById(content, action.cardId);
    if (card !== null) {
      references.push({
        needle: "{fixed_card}",
        part: { kind: "entity", entity: { kind: "card", card } },
      });
    }
  }
  if (argumentNames.includes("nightmare_card")) {
    const card = cardById(content, NIGHTMARE_CARD_ID);
    if (card !== null) {
      const copies =
        action.nightmareCount !== undefined &&
        Number.isInteger(action.nightmareCount) &&
        action.nightmareCount > 1
          ? action.nightmareCount
          : undefined;
      references.push({
        needle: "{nightmare_card}",
        part: {
          kind: "entity",
          entity: {
            kind: "card",
            card,
            ...(copies === undefined ? {} : { copies }),
          },
        },
      });
    }
  }
  if (argumentNames.includes("card_type") && action.cardType !== undefined) {
    references.push({
      needle: "{card_type}",
      part: { kind: "card-type", cardType: action.cardType },
    });
  }
  if (action.dreamsignId !== undefined) {
    const dreamsign = dreamsignById(content, action.dreamsignId);
    if (dreamsign !== null) {
      references.push({
        needle: "{dreamsign}",
        part: {
          kind: "entity",
          entity: {
            kind: "dreamsign",
            dreamsign: localizedDreamsign(
              dreamsign,
              "Exploration effect reference",
            ),
          },
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
  if (message instanceof SourceMessage)
    return Object.keys(message.argumentSchemas);
  if (typeof message === "string") {
    return [...message.matchAll(/\{([a-z_]+)\}/g)].map(
      (match) => match[1] ?? "",
    );
  }
  return [];
}

function localizedAuthoredMessage(
  message: string | LocalizedString,
): LocalizedString {
  return message instanceof LocalizedString
    ? message
    : localizedSourceText(message);
}

function localizedUnpreparedEffect(
  message: ExplorationActionContent["effectText"],
): LocalizedString {
  if (message === undefined) {
    return tx(
      "Exploration effect resolved",
      "[exploration] Generic player-safe Exploration outcome used when a resolved typed effect requires presentation arguments that are unavailable.",
    );
  }
  if (message instanceof LocalizedString) return message;
  if (message instanceof SourceMessage) {
    if (Object.keys(message.argumentSchemas).length === 0)
      return message.bind({});
    return tx(
      "Exploration effect resolved",
      "[exploration] Generic player-safe Exploration outcome used when a resolved typed effect requires presentation arguments that are unavailable.",
    );
  }
  return localizedSourceText(message);
}

function localizedExplorationPredicate(
  predicate: ExplorationPredicate | undefined,
): LocalizedString {
  switch (predicate) {
    case "character":
      return localizedSourceText("Character");
    case "event":
      return localizedSourceText("Event");
    case "cheap-character":
      return tx(
        "≤2● cost Character",
        "[exploration] Card predicate name in a derived mechanical effect.",
      );
    case "legendary":
      return tx(
        "legendary",
        "[exploration] Card predicate name in a derived mechanical effect.",
      );
    case "spirit-animal":
      return localizedSourceText("Spirit Animal");
    case "survivor":
      return localizedSourceText("Survivor");
    case "warrior":
      return localizedSourceText("Warrior");
    default:
      throw new Error(
        "Missing predicate for derived Exploration presentation.",
      );
  }
}

/** Build UUID-backed inline entity parts for an Exploration option's effect. */
export function buildExplorationActionEffect(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  content: JourneyContent,
  deckCardEntity?: DeckCardVariableTarget["entity"],
  starterCardEntity?: DeckCardVariableTarget["entity"],
): Pick<
  ExplorationActionView,
  "effectText" | "effectParts" | "effectFallback"
> {
  const references = effectReferencesForAction(
    action,
    offer,
    content,
    deckCardEntity,
    starterCardEntity,
  );
  const localizedEffect = (
    concealedTargets: Readonly<Record<string, LocalizedString>> = {},
  ): LocalizedString => {
    const argumentNames = explorationEffectArgumentNames(action);
    const localizedValues: Record<string, LocalizedString> = Object.fromEntries(
      argumentNames.map((argumentName) => {
        const concealedTarget = concealedTargets[argumentName];
        if (concealedTarget !== undefined) {
          return [argumentName, concealedTarget];
        }
        const reference = references.find(
          (candidate) => candidate.needle === `{${argumentName}}`,
        );
        if (reference === undefined) {
          switch (argumentName) {
            case "card_type":
              if (action.cardType !== undefined)
                return [argumentName, localizedSourceText(action.cardType)];
              break;
            case "predicate":
              return [
                argumentName,
                localizedExplorationPredicate(action.predicate),
              ];
            case "subtype":
              if (action.subtype !== undefined)
                return [argumentName, localizedSourceText(action.subtype)];
              break;
            case "transfiguration":
              if (action.transfiguration !== undefined) {
                return [
                  argumentName,
                  localizedTransfigurationPresentation(
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
            `Missing localized Exploration effect argument {${argumentName}}.`,
          );
        }
        if (reference.part.kind === "card-type") {
          return [argumentName, localizedSourceText(reference.part.cardType)];
        }
        const entity = reference.part.entity;
        return [
          argumentName,
          entity.kind === "card"
            ? localizedSourceText(entity.card.name)
            : entity.dreamsign.name,
        ];
      }),
    );
    if (action.effectText instanceof SourceMessage) {
      return action.effectText.bind(
        Object.fromEntries(
          Object.entries(localizedValues).map(([name, value]) => [
            name,
            opaque(value),
          ]),
        ),
      );
    }
    if (action.effectText instanceof LocalizedString) return action.effectText;
    if (typeof action.effectText === "string")
      return localizedSourceText(action.effectText, localizedValues);
    return derivedExplorationEffectText(
      action,
      localizedValues,
    );
  };
  const argumentNames = explorationEffectArgumentNames(action);
  if (
    argumentNames.includes("deck_card") &&
    !references.some((reference) => reference.needle === "{deck_card}")
  ) {
    const message = localizedEffect({
      deck_card: tx(
        "an eligible card",
        "[exploration] Generic Exploration effect target shown while its exact eligible deck card is intentionally concealed.",
      ),
    });
    return {
      effectText: message,
      effectFallback: { message },
    };
  }
  if (
    argumentNames.includes("starter_card") &&
    !references.some((reference) => reference.needle === "{starter_card}")
  ) {
    const message = localizedEffect({
      starter_card: tx(
        "a Starter card",
        "[exploration] Generic Exploration effect target shown while its exact Starter card is intentionally concealed.",
      ),
    });
    return {
      effectText: message,
      effectFallback: { message },
    };
  }
  return {
    effectText: localizedEffect(),
    ...(references.length === 0
      ? {}
      : { effectParts: references.map((reference) => reference.part) }),
  };
}

function hasUsableDreamsignPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  followup: ExplorationFollowupView,
): boolean {
  const preparation = offer.dreamsignPreparation;
  if (
    preparation === undefined ||
    preparation.unavailableReason !== undefined ||
    preparation.planSignature.length === 0 ||
    !Number.isInteger(preparation.requiredOverflowReplacementCount) ||
    preparation.requiredOverflowReplacementCount < 0
  ) {
    return false;
  }
  const expectedKind =
    action.effectKind === "gain-nightmare-and-dreamsign"
      ? "fixed-gain"
      : action.effectKind === "gain-offered-dreamsign" ||
          action.effectKind === "gain-nightmare-and-offered-dreamsign"
        ? "offered-gain"
        : action.effectKind === "replace-selected-dreamsign-with-offered"
          ? "offered-replacement"
          : action.effectKind === "replace-all-dreamsigns-random"
            ? "replace-all-random"
            : action.effectKind === "purge-selected-dreamsign-and-gain-random"
              ? "purge-and-gain-random"
              : null;
  if (expectedKind === null || preparation.kind !== expectedKind) return false;
  if (
    (action.effectKind === "gain-nightmare-and-dreamsign" ||
      action.effectKind === "gain-nightmare-and-offered-dreamsign") &&
    (preparation.nightmareCount !== action.nightmareCount ||
      !Number.isInteger(preparation.nightmareCount) ||
      (preparation.nightmareCount ?? 0) <= 0)
  ) {
    return false;
  }
  if (action.effectKind === "replace-all-dreamsigns-random") return true;
  if (action.effectKind === "gain-nightmare-and-dreamsign") {
    const expectedDreamsignId = action.dreamsignId?.toLowerCase();
    return (
      expectedDreamsignId !== undefined &&
      preparation.preparedDreamsignIds.length === 1 &&
      preparation.preparedDreamsignIds[0]?.toLowerCase() ===
        expectedDreamsignId &&
      preparation.requiredOverflowReplacementCount <= 1 &&
      ((preparation.requiredOverflowReplacementCount === 0 &&
        followup.kind === "none") ||
        (preparation.requiredOverflowReplacementCount === 1 &&
          followup.kind === "dreamsigns" &&
          followup.dreamsigns.length > 0))
    );
  }
  if (followup.kind !== "dreamsign-flow") return false;
  if (
    action.effectKind === "gain-offered-dreamsign" ||
    action.effectKind === "gain-nightmare-and-offered-dreamsign"
  ) {
    return (
      followup.offered.length > 0 &&
      followup.requiredOverflowReplacementCount <= 1 &&
      followup.held.length >= followup.requiredOverflowReplacementCount
    );
  }
  if (action.effectKind === "replace-selected-dreamsign-with-offered") {
    return followup.offered.length > 0 && followup.held.length > 0;
  }
  return (
    followup.held.length >= preparation.requiredOverflowReplacementCount + 1
  );
}

function hasUsableStarterCardPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  starterTarget: DeckCardVariableTarget | null,
): boolean {
  const preparation = offer.starterCardPreparation;
  if (
    preparation === undefined ||
    preparation.kind !== action.effectKind ||
    preparation.unavailableReason !== undefined ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    preparation.purgedEntryIds.length === 0 ||
    preparation.purgedEntryIds.length !== preparation.purgedCardIds.length ||
    new Set(preparation.purgedEntryIds).size !==
      preparation.purgedEntryIds.length
  ) {
    return false;
  }
  const eligibleCardIdByEntryId = new Map(
    preparation.eligibleStarterCards.map((binding) => [
      binding.entryId,
      binding.cardId,
    ]),
  );
  if (
    preparation.purgedEntryIds.some(
      (entryId, index) =>
        eligibleCardIdByEntryId.get(entryId) !==
        preparation.purgedCardIds[index],
    )
  ) {
    return false;
  }
  const replacementEntryIds = Object.keys(
    preparation.replacementCardIdByEntryId,
  );
  switch (action.effectKind) {
    case "purge-starter-card":
      return (
        preparation.purgedEntryIds.length === 1 &&
        replacementEntryIds.length === 0 &&
        starterTarget?.entity.card.id === preparation.purgedCardIds[0]
      );
    case "purge-random-starter-card":
      return (
        preparation.purgedEntryIds.length === 1 &&
        replacementEntryIds.length === 0
      );
    case "purge-random-starter-and-gain-card":
      return (
        preparation.purgedEntryIds.length === 1 &&
        replacementEntryIds.length === 1 &&
        replacementEntryIds[0] === preparation.purgedEntryIds[0]
      );
    case "replace-all-starter-cards":
      return (
        replacementEntryIds.length === preparation.purgedEntryIds.length &&
        preparation.purgedEntryIds.every((entryId) =>
          replacementEntryIds.includes(entryId),
        )
      );
    default:
      return false;
  }
}

function hasUsableStarterCardTransfigurationPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = offer.starterCardTransfigurationPreparation;
  const expectedKind =
    action.effectKind === "transfigure-random-starter-cards"
      ? "random-count"
      : action.effectKind === "transfigure-all-starter-cards"
        ? "all"
        : null;
  if (
    expectedKind === null ||
    preparation === undefined ||
    preparation.kind !== expectedKind ||
    preparation.unavailableReason !== undefined ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    preparation.selectorSignatures.length === 0 ||
    preparation.targets.length === 0 ||
    offer.canonicalMechanicId !== "transfigure-deck-entry" ||
    offer.selectionPolicyId !== "uniform" ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    (offer.offeredDeckEntryIds?.length ?? 0) !== 0 ||
    JSON.stringify(offer.selectionTraces ?? []) !==
      JSON.stringify(preparation.selectorTraces)
  ) {
    return false;
  }
  const validBindings = (
    bindings: readonly {
      readonly entryId: DeckEntryId;
      readonly cardId: CardId;
    }[],
  ): boolean =>
    new Set(bindings.map((binding) => binding.entryId)).size ===
      bindings.length &&
    bindings.every((binding) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === binding.entryId,
      );
      const base =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      return (
        entry !== undefined &&
        base !== undefined &&
        hasStarterCardRole(base) &&
        base.id === binding.cardId
      );
    });
  if (
    !validBindings(preparation.starterCards) ||
    !validBindings(preparation.eligibleStarterCards) ||
    !validBindings(preparation.targets)
  ) {
    return false;
  }
  const eligibleCardIdByEntryId = new Map(
    preparation.eligibleStarterCards.map((binding) => [
      binding.entryId,
      binding.cardId,
    ]),
  );
  if (
    preparation.targets.some((target) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === target.entryId,
      );
      const base =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      return (
        eligibleCardIdByEntryId.get(target.entryId) !== target.cardId ||
        base === undefined ||
        (entry?.transfiguration !== null &&
          entry?.transfiguration !== target.transfiguration) ||
        !offeredTransfigurationForms(
          content.transfigurationData,
          base,
          null,
        ).some((form) => form.type === target.transfiguration)
      );
    })
  ) {
    return false;
  }
  const preparedTransfigurationEntries = Object.entries(
    offer.transfigurationByEntryId,
  ).sort(([left], [right]) => left.localeCompare(right));
  const targetTransfigurationEntries = preparation.targets
    .map(
      (target) =>
        [target.entryId, target.transfiguration] as readonly [string, string],
    )
    .sort(([left], [right]) => left.localeCompare(right));
  if (
    JSON.stringify(preparedTransfigurationEntries) !==
    JSON.stringify(targetTransfigurationEntries)
  ) {
    return false;
  }
  if (action.effectKind === "transfigure-random-starter-cards") {
    return (
      Number.isInteger(action.count) &&
      (action.count ?? 0) > 0 &&
      preparation.targets.length === action.count
    );
  }
  return (
    preparation.targets.length === preparation.starterCards.length &&
    sameOrderedIds(
      preparation.targets.map((target) => target.entryId),
      preparation.starterCards.map((binding) => binding.entryId),
    )
  );
}

function hasUsableMultiCardTransfigurationPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = offer.multiCardTransfigurationPreparation;
  const expectedMode =
    action.effectKind === "transfigure-selected" && (action.count ?? 1) > 1
      ? "chosen-flexible"
      : action.effectKind === "transfigure-fixed-selected" &&
          (action.count ?? 1) > 1
        ? "chosen-fixed"
        : action.effectKind === "transfigure-random-cards"
          ? "random-flexible"
          : action.effectKind === "transfigure-fixed-random-cards"
            ? "random-fixed"
            : null;
  const expectedPolicy =
    expectedMode === "chosen-flexible" || expectedMode === "chosen-fixed"
      ? "transfiguration-value"
      : "uniform";
  const authoredCount = action.count;
  if (
    expectedMode === null ||
    preparation === undefined ||
    preparation.mode !== expectedMode ||
    preparation.unavailableReason !== undefined ||
    !Number.isInteger(authoredCount) ||
    (authoredCount ?? 0) <= 0 ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    preparation.eligibleCards.length < (authoredCount ?? 0) ||
    offer.canonicalMechanicId !== "transfigure-deck-entry" ||
    offer.selectionPolicyId !== expectedPolicy ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    (offer.offeredDeckEntryIds?.length ?? 0) !== 0 ||
    JSON.stringify(offer.selectionTraces ?? []) !==
      JSON.stringify(preparation.selectorTraces)
  ) {
    return false;
  }
  const eligibleEntryIds = new Set<DeckEntryId>();
  const validEligibleCards = preparation.eligibleCards.every((binding) => {
    if (
      eligibleEntryIds.has(binding.entryId) ||
      binding.transfigurations.length === 0 ||
      new Set(binding.transfigurations).size !== binding.transfigurations.length
    ) {
      return false;
    }
    eligibleEntryIds.add(binding.entryId);
    const entry = state.deck.find(
      (candidate) => candidate.entryId === binding.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      entry === undefined ||
      base === undefined ||
      (entry.transfiguration !== null &&
        !binding.transfigurations.includes(entry.transfiguration)) ||
      base.id !== binding.cardId ||
      (action.predicate !== undefined &&
        !matchesPredicate(base, action.predicate, content))
    ) {
      return false;
    }
    const applicableForms = offeredTransfigurationForms(
      content.transfigurationData,
      base,
      null,
    ).map((form) => form.type);
    return binding.transfigurations.every((form) =>
      applicableForms.includes(form),
    );
  });
  if (!validEligibleCards) return false;

  if (expectedMode === "chosen-flexible" || expectedMode === "chosen-fixed") {
    return (
      preparation.targets.length === 0 &&
      preparation.selectorSignatures.length === 0 &&
      preparation.selectorTraces.length === 0 &&
      Object.keys(offer.transfigurationByEntryId).length === 0 &&
      (expectedMode !== "chosen-fixed" ||
        (action.transfiguration !== undefined &&
          preparation.eligibleCards.every(
            (binding) =>
              binding.transfigurations.length === 1 &&
              binding.transfigurations[0] === action.transfiguration,
          )))
    );
  }
  if (
    preparation.targets.length !== authoredCount ||
    new Set(preparation.targets.map((target) => target.entryId)).size !==
      preparation.targets.length
  ) {
    return false;
  }
  const eligibleByEntryId = new Map(
    preparation.eligibleCards.map((binding) => [binding.entryId, binding]),
  );
  if (
    preparation.targets.some((target) => {
      const binding = eligibleByEntryId.get(target.entryId);
      return (
        binding === undefined ||
        binding.cardId !== target.cardId ||
        !binding.transfigurations.includes(target.transfiguration)
      );
    })
  ) {
    return false;
  }
  const preparedForms = Object.entries(offer.transfigurationByEntryId).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const targetForms = preparation.targets
    .map(
      (target) =>
        [target.entryId, target.transfiguration] as readonly [string, string],
    )
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(preparedForms) === JSON.stringify(targetForms);
}

function hasUsableMultiCardReplacementPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = offer.multiCardReplacementPreparation;
  if (
    action.effectKind !== "replace-selected" ||
    (action.count ?? 1) <= 1 ||
    action.predicate === undefined ||
    preparation === undefined ||
    preparation.kind !== "chosen-replacement" ||
    preparation.predicate !== action.predicate ||
    preparation.authoredMaximumCount !== action.count ||
    preparation.unavailableReason !== undefined ||
    preparation.bindings.length === 0 ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    preparation.selectorSignatures.length !== preparation.bindings.length ||
    preparation.selectorTraces.length !== preparation.bindings.length ||
    offer.canonicalMechanicId !== "replace-deck-entry" ||
    offer.selectionPolicyId !== "card-fit-quality" ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    (offer.offeredDeckEntryIds?.length ?? 0) !== 0 ||
    Object.keys(offer.replacementCardIdByEntryId).length !== 0 ||
    JSON.stringify(offer.selectionTraces ?? []) !==
      JSON.stringify(preparation.selectorTraces)
  ) {
    return false;
  }
  const sourceIds = new Set<DeckEntryId>();
  return preparation.bindings.every((binding) => {
    if (sourceIds.has(binding.sourceEntryId)) return false;
    sourceIds.add(binding.sourceEntryId);
    const entry = state.deck.find(
      (candidate) => candidate.entryId === binding.sourceEntryId,
    );
    const source = entry === undefined ? null : deckCardChoice(entry, content);
    const replacement = cardById(content, binding.replacementCardId);
    return (
      source !== null &&
      source.model.cardId === binding.sourceCardId &&
      matchesPredicate(
        source.model.displaySnapshot,
        preparation.predicate,
        content,
      ) &&
      replacement !== null &&
      replacement.id !== binding.sourceCardId &&
      matchesPredicate(replacement, preparation.predicate, content)
    );
  });
}

function hasUsableRandomDeckTargetPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
  allowResolvedTypeChange = false,
): boolean {
  const preparation = offer.randomDeckTargetPreparation;
  const expectedMechanic =
    action.effectKind === "copy-random-cards"
      ? "duplicate-deck-entry"
      : action.effectKind === "change-random-card-type"
        ? "change-entry-card-type"
        : action.effectKind === "replace-random-with-card"
          ? "replace-deck-entry"
          : null;
  const expectedCount =
    action.effectKind === "replace-random-with-card" ? 1 : action.count;
  if (
    expectedMechanic === null ||
    preparation === undefined ||
    preparation.effectKind !== action.effectKind ||
    preparation.count !== expectedCount ||
    preparation.predicate !== action.predicate ||
    preparation.cardType !== action.cardType ||
    preparation.replacementCardId !== action.cardId ||
    preparation.unavailableReason !== undefined ||
    preparation.eligibleCards.length < preparation.count ||
    preparation.targets.length !== preparation.count ||
    preparation.selectorSignature === undefined ||
    preparation.selectorTrace === undefined ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    offer.canonicalMechanicId !== expectedMechanic ||
    offer.selectionPolicyId !== "uniform" ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    JSON.stringify(offer.selectionTrace) !==
      JSON.stringify(preparation.selectorTrace) ||
    (offer.offeredDeckEntryIds?.length ?? 0) !== 0
  ) {
    return false;
  }
  const eligibleIds = new Set<DeckEntryId>();
  const validEligible = preparation.eligibleCards.every((binding) => {
    if (eligibleIds.has(binding.entryId)) return false;
    eligibleIds.add(binding.entryId);
    const entry = state.deck.find(
      (candidate) => candidate.entryId === binding.entryId,
    );
    const card = entry === undefined ? null : deckCardChoice(entry, content);
    if (card === null || card.model.cardId !== binding.cardId) {
      return false;
    }
    if (
      action.effectKind === "copy-random-cards" ||
      action.effectKind === "replace-random-with-card"
    ) {
      return (
        action.predicate !== undefined &&
        matchesPredicate(card.model.displaySnapshot, action.predicate, content)
      );
    }
    return (
      action.cardType !== undefined &&
      (allowResolvedTypeChange ||
        card.model.displaySnapshot.cardType !== action.cardType)
    );
  });
  return (
    validEligible &&
    new Set(preparation.targets.map((target) => target.entryId)).size ===
      preparation.targets.length &&
    preparation.targets.every((target) =>
      preparation.eligibleCards.some(
        (binding) =>
          binding.entryId === target.entryId &&
          binding.cardId === target.cardId,
      ),
    )
  );
}

function hasUsableDisclosedDeckTargetPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
  allowResolvedTypeChange = false,
): boolean {
  const preparation = offer.disclosedDeckTargetPreparation;
  const target = preparation?.target;
  if (
    action.effectKind !== "change-card-type-selected" ||
    action.deckTarget !== "offered" ||
    action.cardType === undefined ||
    preparation === undefined ||
    target === null ||
    target === undefined ||
    preparation.effectKind !== action.effectKind ||
    preparation.cardType !== action.cardType ||
    preparation.unavailableReason !== undefined ||
    preparation.eligibleCards.length === 0 ||
    preparation.selectorSignature === undefined ||
    preparation.selectorTrace === undefined ||
    offer.canonicalMechanicId !== "change-entry-card-type" ||
    offer.selectionPolicyId !== "deck-entry-centrality" ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    JSON.stringify(offer.selectionTrace) !==
      JSON.stringify(preparation.selectorTrace) ||
    !sameOrderedIds(offer.offeredDeckEntryIds ?? [], [target.entryId]) ||
    offer.randomDeckTargetPreparation !== undefined
  ) {
    return false;
  }
  const uniqueEligible = new Set<DeckEntryId>();
  if (
    !preparation.eligibleCards.every((binding) => {
      if (uniqueEligible.has(binding.entryId)) return false;
      uniqueEligible.add(binding.entryId);
      const entry = state.deck.find(
        (candidate) => candidate.entryId === binding.entryId,
      );
      const card = entry === undefined ? null : deckCardChoice(entry, content);
      return (
        card !== null &&
        card.model.cardId === binding.cardId &&
        (allowResolvedTypeChange ||
          card.model.displaySnapshot.cardType !== action.cardType)
      );
    })
  ) {
    return false;
  }
  return preparation.eligibleCards.some(
    (binding) =>
      binding.entryId === target.entryId && binding.cardId === target.cardId,
  );
}

function hasUsableCompoundActionPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = offer.compoundActionPreparation;
  if (
    preparation === undefined ||
    preparation.unavailableReason !== undefined ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    offer.selectionTrace !== undefined ||
    JSON.stringify(offer.selectionTraces ?? []) !==
      JSON.stringify(preparation.selectorTraces) ||
    preparation.selectorSignatures.length !==
      preparation.selectorTraces.length ||
    preparation.selectorSignatures.some((signature) => signature.length === 0)
  ) {
    return false;
  }

  const currentCard = (entryId: DeckEntryId, cardId: CardId) => {
    const entry = state.deck.find((candidate) => candidate.entryId === entryId);
    const card = entry === undefined ? null : deckCardChoice(entry, content);
    return card !== null && card.model.cardId === cardId ? card : null;
  };
  const hasDistinctEntries = (
    bindings: readonly { readonly entryId: DeckEntryId }[],
  ) =>
    new Set(bindings.map((binding) => binding.entryId)).size ===
    bindings.length;

  switch (action.effectKind) {
    case "transfigure-all-cards":
      if (preparation.kind !== "all-card-transfiguration") return false;
      return (
        preparation.targets.length > 0 &&
        preparation.targets.length === state.deck.length &&
        preparation.allCards.length === preparation.targets.length &&
        hasDistinctEntries(preparation.targets) &&
        sameOrderedIds(
          preparation.targets.map((target) => target.entryId),
          preparation.allCards.map((card) => card.entryId),
        ) &&
        preparation.targets.every((target, index) => {
          const card = preparation.allCards[index];
          return (
            card !== undefined &&
            card.cardId === target.cardId &&
            card.positiveForms.includes(target.transfiguration) &&
            currentCard(target.entryId, target.cardId) !== null
          );
        })
      );
    case "purge-disclosed-and-transfigure-same-type": {
      if (
        preparation.kind !== "purge-disclosed-transfigure-same-type" ||
        preparation.transfiguration !== action.transfiguration ||
        preparation.target === null ||
        preparation.companionTargets.length === 0 ||
        !hasDistinctEntries([
          preparation.target,
          ...preparation.companionTargets,
        ]) ||
        !sameOrderedIds(offer.offeredDeckEntryIds ?? [], [
          preparation.target.entryId,
        ])
      ) {
        return false;
      }
      const target = currentCard(
        preparation.target.entryId,
        preparation.target.cardId,
      );
      return (
        target !== null &&
        target.model.displaySnapshot.cardType ===
          preparation.target.effectiveCardType &&
        preparation.eligiblePurgeTargets.some(
          (candidate) =>
            candidate.entryId === preparation.target?.entryId &&
            candidate.cardId === preparation.target.cardId &&
            candidate.effectiveCardType ===
              preparation.target.effectiveCardType,
        ) &&
        preparation.companionTargets.every(
          (companion) =>
            companion.transfiguration === preparation.transfiguration &&
            currentCard(companion.entryId, companion.cardId) !== null,
        )
      );
    }
    case "make-predicate-fast-and-gain-nightmares":
      if (preparation.kind !== "predicate-fast-nightmares") return false;
      return (
        preparation.predicate === action.predicate &&
        preparation.nightmareCount === action.nightmareCount &&
        Number.isInteger(preparation.nightmareCount) &&
        preparation.nightmareCount > 0 &&
        hasDistinctEntries(preparation.targets) &&
        preparation.targets.every((target) => {
          const card = currentCard(target.entryId, target.cardId);
          return (
            card !== null &&
            matchesPredicate(
              card.model.displaySnapshot,
              preparation.predicate,
              content,
            )
          );
        })
      );
    case "take-transfigured-cards-and-gain-nightmares":
      if (preparation.kind !== "take-transfigured-nightmares") return false;
      return (
        preparation.predicate === action.predicate &&
        preparation.offerCount === action.offerCount &&
        preparation.transfiguration === action.transfiguration &&
        preparation.nightmareCount === action.nightmareCount &&
        preparation.offeredCards.length === preparation.offerCount &&
        new Set(preparation.offeredCards.map((card) => card.cardId)).size ===
          preparation.offeredCards.length &&
        sameOrderedIds(
          offer.offeredCardIds,
          preparation.offeredCards.map((card) => card.cardId),
        ) &&
        preparation.offeredCards.every(
          (card) =>
            card.transfiguration === preparation.transfiguration &&
            cardById(content, card.cardId) !== null,
        )
      );
    case "purge-one-transfigure-and-copy-others":
      if (preparation.kind !== "purge-transfigure-copy") return false;
      return (
        preparation.offerCount === action.offerCount &&
        preparation.transfiguration === action.transfiguration &&
        preparation.targets.length === preparation.offerCount &&
        preparation.targets.length === 4 &&
        hasDistinctEntries(preparation.targets) &&
        sameOrderedIds(
          offer.offeredDeckEntryIds ?? [],
          preparation.targets.map((target) => target.entryId),
        ) &&
        preparation.targets.every(
          (target) =>
            target.transfiguration === preparation.transfiguration &&
            currentCard(target.entryId, target.cardId) !== null &&
            preparation.eligibleCards.some(
              (card) =>
                card.entryId === target.entryId &&
                card.cardId === target.cardId,
            ),
        )
      );
    default:
      return false;
  }
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
  const requiresDeckCardTarget =
    explorationActionUsesOfferedDeckTarget(action) ||
    action.effectKind === "purge-disclosed-and-transfigure-same-type";
  const hasPreparedRandomEssence =
    action.effectKind !== "gain-random-essence" ||
    (Number.isInteger(offer.preparedEssenceAmount) &&
      offer.essencePreparation?.purpose === "essence-amount" &&
      offer.essencePreparation.minimumEssence === action.minimumEssence &&
      offer.essencePreparation.maximumEssence === action.maximumEssence &&
      (offer.preparedEssenceAmount ?? -1) >= (action.minimumEssence ?? 0) &&
      (offer.preparedEssenceAmount ?? -1) <=
        (action.maximumEssence ?? Number.POSITIVE_INFINITY));
  const usesDreamsignPreparation =
    action.effectKind === "gain-nightmare-and-dreamsign" ||
    action.effectKind === "gain-nightmare-and-offered-dreamsign" ||
    action.effectKind === "gain-offered-dreamsign" ||
    action.effectKind === "replace-selected-dreamsign-with-offered" ||
    action.effectKind === "replace-all-dreamsigns-random" ||
    action.effectKind === "purge-selected-dreamsign-and-gain-random";
  const usesStarterCardPreparation =
    action.effectKind === "purge-starter-card" ||
    action.effectKind === "purge-random-starter-card" ||
    action.effectKind === "purge-random-starter-and-gain-card" ||
    action.effectKind === "replace-all-starter-cards";
  const usesStarterCardTransfigurationPreparation =
    action.effectKind === "transfigure-random-starter-cards" ||
    action.effectKind === "transfigure-all-starter-cards";
  const usesMultiCardTransfigurationPreparation =
    (action.effectKind === "transfigure-selected" && (action.count ?? 1) > 1) ||
    (action.effectKind === "transfigure-fixed-selected" &&
      (action.count ?? 1) > 1) ||
    action.effectKind === "transfigure-random-cards" ||
    action.effectKind === "transfigure-fixed-random-cards";
  const usesMultiCardReplacementPreparation =
    action.effectKind === "replace-selected" && (action.count ?? 1) > 1;
  const usesRandomDeckTargetPreparation =
    action.effectKind === "copy-random-cards" ||
    action.effectKind === "change-random-card-type" ||
    action.effectKind === "replace-random-with-card";
  const usesDisclosedDeckTargetPreparation =
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "offered";
  const usesCompoundActionPreparation =
    action.effectKind === "transfigure-all-cards" ||
    action.effectKind === "purge-disclosed-and-transfigure-same-type" ||
    action.effectKind === "make-predicate-fast-and-gain-nightmares" ||
    action.effectKind === "take-transfigured-cards-and-gain-nightmares" ||
    action.effectKind === "purge-one-transfigure-and-copy-others";
  const siteInsertionPreparation = offer.siteInsertionPreparation;
  const siteInsertionNode =
    siteInsertionPreparation === undefined
      ? undefined
      : state.atlas.nodes[siteInsertionPreparation.targetNodeId];
  const hasUsableSiteInsertionPreparation =
    action.effectKind !== "add-fixed-site" ||
    (action.siteType !== undefined &&
      siteInsertionPreparation !== undefined &&
      offer.canonicalMechanicId === "add-site" &&
      offer.selectionPolicyId === "fixed" &&
      offer.selectionKey === parseSelectionKey(action.id) &&
      offer.selectionSignature === siteInsertionPreparation.planSignature &&
      offer.selectionTrace === undefined &&
      offer.selectionTraces === undefined &&
      offer.offeredSiteType === undefined &&
      siteInsertionPreparation.sourceSiteId === state.activeSiteId &&
      siteInsertionPreparation.sourceActionId === action.id &&
      siteInsertionPreparation.targetNodeId === state.currentDreamscape &&
      siteInsertionPreparation.targetNodeId === state.atlas.currentNodeId &&
      siteInsertionNode !== undefined &&
      siteInsertionPreparation.insertionIndex ===
        siteInsertionPreparation.siblingSiteIdsBefore.length &&
      sameOrderedIds(
        siteInsertionNode.sites.map((site) => site.id),
        siteInsertionPreparation.siblingSiteIdsBefore,
      ) &&
      siteInsertionPreparation.insertedSite.id.length > 0 &&
      siteInsertionPreparation.insertedSite.type === action.siteType &&
      !siteInsertionPreparation.insertedSite.isEnhanced &&
      !siteInsertionPreparation.insertedSite.isVisited);
  const siteTypeChoicePreparation = offer.siteTypeChoicePreparation;
  const siteTypeChoiceNode =
    siteTypeChoicePreparation === undefined
      ? undefined
      : state.atlas.nodes[siteTypeChoicePreparation.targetNodeId];
  const preparedSiteTypes =
    siteTypeChoicePreparation?.choices.map((choice) => choice.siteType) ?? [];
  const hasUsableSiteTypeChoicePreparation =
    action.effectKind !== "choose-site-type" ||
    (siteTypeChoicePreparation !== undefined &&
      followup.kind === "site-types" &&
      offer.canonicalMechanicId === "add-site" &&
      offer.selectionPolicyId === "site-uniform" &&
      offer.selectionKey === parseSelectionKey(action.id) &&
      offer.selectionSignature === siteTypeChoicePreparation.planSignature &&
      offer.selectionTrace !== undefined &&
      siteTypeChoicePreparation.selectorSignature.length > 0 &&
      offer.selectionTrace.mechanicId === "add-site" &&
      offer.selectionTrace.policyId === "site-uniform" &&
      offer.selectionTrace.selectionKey === parseSelectionKey(action.id) &&
      sameOrderedIds(
        offer.selectionTrace.selectedKeys,
        preparedSiteTypes.map(parseRewardCandidateKey),
      ) &&
      offer.selectionTraces === undefined &&
      offer.offeredSiteType === undefined &&
      siteTypeChoicePreparation.sourceSiteId === state.activeSiteId &&
      siteTypeChoicePreparation.sourceActionId === action.id &&
      siteTypeChoicePreparation.targetNodeId === state.currentDreamscape &&
      siteTypeChoicePreparation.targetNodeId === state.atlas.currentNodeId &&
      siteTypeChoiceNode !== undefined &&
      siteTypeChoicePreparation.insertionIndex ===
        siteTypeChoicePreparation.siblingSiteIdsBefore.length &&
      sameOrderedIds(
        siteTypeChoiceNode.sites.map((site) => site.id),
        siteTypeChoicePreparation.siblingSiteIdsBefore,
      ) &&
      siteTypeChoicePreparation.choices.length === action.offerCount &&
      followup.choices.length === siteTypeChoicePreparation.choices.length &&
      new Set(preparedSiteTypes).size === preparedSiteTypes.length &&
      siteTypeChoicePreparation.choices.every(
        (choice) =>
          choice.insertedSite.type === choice.siteType &&
          choice.insertedSite.id.length > 0 &&
          !choice.insertedSite.isEnhanced &&
          !choice.insertedSite.isVisited,
      ));
  const hasRequiredOffer = !hasPreparedRandomEssence
    ? false
    : usesCompoundActionPreparation
      ? hasUsableCompoundActionPreparation(action, offer, state, content)
      : usesDreamsignPreparation
        ? hasUsableDreamsignPreparation(action, offer, followup)
        : usesStarterCardPreparation
          ? hasUsableStarterCardPreparation(action, offer, starterCardTarget)
          : usesStarterCardTransfigurationPreparation
            ? hasUsableStarterCardTransfigurationPreparation(
                action,
                offer,
                state,
                content,
              )
            : usesMultiCardTransfigurationPreparation
              ? hasUsableMultiCardTransfigurationPreparation(
                  action,
                  offer,
                  state,
                  content,
                )
              : usesMultiCardReplacementPreparation
                ? hasUsableMultiCardReplacementPreparation(
                    action,
                    offer,
                    state,
                    content,
                  )
                : usesDisclosedDeckTargetPreparation
                  ? hasUsableDisclosedDeckTargetPreparation(
                      action,
                      offer,
                      state,
                      content,
                    )
                  : usesRandomDeckTargetPreparation
                    ? hasUsableRandomDeckTargetPreparation(
                        action,
                        offer,
                        state,
                        content,
                      )
                    : action.effectKind === "add-fixed-site"
                      ? hasUsableSiteInsertionPreparation
                      : action.effectKind === "choose-site-type"
                        ? hasUsableSiteTypeChoicePreparation
                        : action.effectKind === "gain-random-dreamsign"
                          ? (offer.offeredDreamsignIds?.length ?? 0) > 0
                          : action.effectKind === "transfigure-all-for-essence"
                            ? (offer.eligibleDeckEntryIds?.length ?? 0) > 0 &&
                              Number.isInteger(action.essence) &&
                              (action.essence ?? 0) > 0 &&
                              state.essence >=
                                (action.essence ?? Number.POSITIVE_INFINITY)
                            : action.effectKind === "gain-offered-card"
                              ? offer.offeredCardIds.length === 1
                              : action.effectKind === "copy-offered-deck-card"
                                ? (offer.offeredDeckEntryIds?.length ?? 0) > 0
                                : action.effectKind ===
                                    "purge-random-subtype-and-increase-spark"
                                  ? (offer.offeredDeckEntryIds?.length ?? 0) ===
                                    1
                                  : action.effectKind === "choose-avatar"
                                    ? (offer.offeredAvatarIds?.length ??
                                        0) > 0
                                    : action.effectKind === "add-site"
                                      ? offer.offeredSiteType !== undefined
                                      : requiresDeckCardTarget
                                        ? deckCardTarget !== null
                                        : true;
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
      ? txa(
          "{site_type}.",
          { site_type: offer.offeredSiteType },
          "[exploration] Parenthetical disclosure naming the authored site type offered by an Exploration action.",
        )
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
    label: localizedAuthoredMessage(action.label),
    ...effect,
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
        : usesStarterCardPreparation
          ? { automaticSelection: {} }
          : usesStarterCardTransfigurationPreparation
            ? { automaticSelection: {} }
            : usesMultiCardTransfigurationPreparation &&
                (action.effectKind === "transfigure-random-cards" ||
                  action.effectKind === "transfigure-fixed-random-cards")
              ? { automaticSelection: {} }
              : usesRandomDeckTargetPreparation
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

function sameOrderedIds<Value>(
  actual: readonly Value[],
  expected: readonly Value[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function persistedSelectionIds(
  resolution: NonNullable<ExplorationSiteRuntime["resolution"]>,
): readonly DeckEntryId[] | null {
  const entryIds = resolution.selection?.entryIds;
  return Array.isArray(entryIds) &&
    entryIds.every((entryId): entryId is string => typeof entryId === "string")
    ? entryIds.map(parseDeckEntryId)
    : null;
}

function persistedSelectionCardIds(
  resolution: NonNullable<ExplorationSiteRuntime["resolution"]>,
): readonly CardId[] | null {
  const cardIds = resolution.selection?.cardIds;
  return Array.isArray(cardIds) &&
    cardIds.every((cardId): cardId is string => typeof cardId === "string") &&
    new Set(cardIds).size === cardIds.length
    ? cardIds.map(parseCardId)
    : null;
}

function resolvedTransfigurationViews(
  mappings: NonNullable<
    NonNullable<ExplorationSiteRuntime["resolution"]>["cardTransfigurations"]
  >,
  state: JourneyState,
  content: JourneyContent,
): readonly ExplorationTransfigurationChangeView[] | null {
  if (
    new Set(mappings.map((mapping) => mapping.entryId)).size !== mappings.length
  ) {
    return null;
  }
  const views = mappings.flatMap((mapping) => {
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      entry === undefined ||
      base === undefined ||
      base.id !== mapping.cardId ||
      mapping.beforeTransfiguration !== null ||
      entry.transfiguration !== mapping.afterTransfiguration
    ) {
      return [];
    }
    const before = deckCardChoice({ ...entry, transfiguration: null }, content);
    const after = deckCardChoice(entry, content);
    if (
      before === null ||
      after === null ||
      before.model.transfiguration !== undefined ||
      after.model.transfiguration?.type !== mapping.afterTransfiguration
    ) {
      return [];
    }
    return [
      {
        ...mapping,
        before,
        after: {
          ...after,
          model: {
            ...after.model,
            transfiguration: after.model.transfiguration,
          },
        },
      },
    ];
  });
  return views.length === mappings.length ? views : null;
}

function compoundActionRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  const preparation = offer?.compoundActionPreparation;
  if (
    resolution === null ||
    offer === undefined ||
    preparation === undefined ||
    preparation.unavailableReason !== undefined ||
    resolution.selectionSignature !== preparation.planSignature ||
    offer.selectionSignature !== preparation.planSignature ||
    resolution.selectionRulesVersion !== preparation.selectionRulesVersion ||
    resolution.selectionContentRevision !== preparation.selectionContentRevision
  ) {
    return null;
  }

  const transfigurationMappings = resolution.cardTransfigurations ?? [];
  const transfigurations = resolvedTransfigurationViews(
    transfigurationMappings,
    state,
    content,
  );
  if (transfigurations === null) return null;

  const purgedSnapshots = resolution.purgedEntrySnapshots ?? [];
  const purged = purgedSnapshots.flatMap((entry) => {
    const card = deckCardChoice(entry, content);
    return card === null ? [] : [card];
  });
  if (
    purged.length !== purgedSnapshots.length ||
    purged.some((card) =>
      state.deck.some((entry) => entry.entryId === card.entryId),
    ) ||
    !sameOrderedIds(
      purged.map((card) => card.entryId),
      resolution.purgedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      purged.map((card) => card.model.cardId),
      resolution.purgedCardIds,
    )
  ) {
    return null;
  }
  const stateBefore: JourneyState = {
    ...state,
    deck: [...state.deck, ...purgedSnapshots],
  };
  if (
    !hasUsableCompoundActionPreparation(action, offer, stateBefore, content)
  ) {
    return null;
  }

  const keywordMappings = resolution.cardKeywordChanges ?? [];
  const keywordChanges = keywordMappings.flatMap((mapping) => {
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      entry === undefined ||
      base === undefined ||
      base.id !== mapping.cardId ||
      JSON.stringify(entry.keywordModification ?? null) !==
        JSON.stringify(mapping.after)
    ) {
      return [];
    }
    const before = deckCardChoice(
      { ...entry, keywordModification: mapping.before },
      content,
    );
    const after = deckCardChoice(entry, content);
    return before === null || after === null
      ? []
      : [
          {
            entryId: mapping.entryId,
            cardId: mapping.cardId,
            beforeKeywordModification: mapping.before,
            afterKeywordModification: mapping.after,
            before,
            after,
          } satisfies ExplorationKeywordChangeView,
        ];
  });
  if (
    keywordChanges.length !== keywordMappings.length ||
    new Set(keywordChanges.map((mapping) => mapping.entryId)).size !==
      keywordChanges.length
  ) {
    return null;
  }

  const nightmareMappings = resolution.nightmareGains ?? [];
  const nightmares = nightmareMappings.flatMap((mapping) => {
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const card = entry === undefined ? null : deckCardChoice(entry, content);
    return card !== null &&
      mapping.cardId === NIGHTMARE_CARD_ID &&
      card.model.cardId === NIGHTMARE_CARD_ID
      ? [card]
      : [];
  });
  if (
    nightmares.length !== nightmareMappings.length ||
    new Set(nightmares.map((card) => card.entryId)).size !== nightmares.length
  ) {
    return null;
  }

  const copyMappings = resolution.cardCopies ?? [];
  const copies = copyMappings.flatMap((mapping) => {
    const sourceEntry = state.deck.find(
      (entry) => entry.entryId === mapping.sourceEntryId,
    );
    const copyEntry = state.deck.find(
      (entry) => entry.entryId === mapping.mintedEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const copy =
      copyEntry === undefined ? null : deckCardChoice(copyEntry, content);
    return source !== null &&
      copy !== null &&
      source.model.cardId === mapping.sourceCardId &&
      copy.model.cardId === mapping.mintedCardId &&
      source.model.cardId === copy.model.cardId
      ? [{ source, copy }]
      : [];
  });
  if (
    copies.length !== copyMappings.length ||
    new Set(copies.map((pair) => pair.copy.entryId)).size !== copies.length
  ) {
    return null;
  }

  const hasExactSelectionKeys = (expected: readonly string[]) => {
    if (resolution.selection === undefined) return false;
    const keys = Object.keys(resolution.selection).sort();
    return sameOrderedIds(keys, [...expected].sort());
  };
  const matchesPreparedTransfigurations = (
    targets: readonly {
      readonly entryId: DeckEntryId;
      readonly cardId: CardId;
      readonly transfiguration: TransfigurationType;
    }[],
  ) =>
    transfigurationMappings.length === targets.length &&
    transfigurationMappings.every((mapping, index) => {
      const target = targets[index];
      return (
        target !== undefined &&
        mapping.entryId === target.entryId &&
        mapping.cardId === target.cardId &&
        mapping.afterTransfiguration === target.transfiguration
      );
    });
  const matchesNightmareGains = () =>
    sameOrderedIds(
      nightmares.map((card) => card.entryId),
      resolution.gainedEntryIds ?? [],
    ) &&
    sameOrderedIds(
      nightmares.map((card) => card.model.cardId),
      resolution.gainedCardIds,
    );

  switch (action.effectKind) {
    case "transfigure-all-cards":
      return preparation.kind === "all-card-transfiguration" &&
        hasExactSelectionKeys([]) &&
        purged.length === 0 &&
        keywordChanges.length === 0 &&
        nightmares.length === 0 &&
        copies.length === 0 &&
        matchesPreparedTransfigurations(preparation.targets) &&
        sameOrderedIds(
          transfigurations.map((mapping) => mapping.entryId),
          resolution.affectedEntryIds,
        ) &&
        sameOrderedIds(resolution.gainedEntryIds ?? [], []) &&
        sameOrderedIds(resolution.gainedCardIds, [])
        ? {
            kind: "multi-card-transfiguration",
            sourceKind: "transfigure-all-cards",
            transfigurations,
          }
        : null;
    case "purge-disclosed-and-transfigure-same-type": {
      const selectedIds = persistedSelectionIds(resolution);
      return preparation.kind === "purge-disclosed-transfigure-same-type" &&
        preparation.target !== null &&
        hasExactSelectionKeys(["entryIds"]) &&
        selectedIds !== null &&
        sameOrderedIds(selectedIds, [preparation.target.entryId]) &&
        purged.length === 1 &&
        purged[0]?.entryId === preparation.target.entryId &&
        purged[0]?.model.cardId === preparation.target.cardId &&
        matchesPreparedTransfigurations(preparation.companionTargets) &&
        sameOrderedIds(resolution.affectedEntryIds, [
          preparation.target.entryId,
          ...preparation.companionTargets.map((target) => target.entryId),
        ]) &&
        resolution.resolvedCardType === preparation.target.effectiveCardType &&
        keywordChanges.length === 0 &&
        nightmares.length === 0 &&
        copies.length === 0 &&
        sameOrderedIds(resolution.gainedEntryIds ?? [], []) &&
        sameOrderedIds(resolution.gainedCardIds, [])
        ? {
            kind: "compound-card-mutation",
            sourceKind: action.effectKind,
            purged,
            transfigurations,
            keywordChanges,
            nightmares,
            copies,
          }
        : null;
    }
    case "make-predicate-fast-and-gain-nightmares":
      return preparation.kind === "predicate-fast-nightmares" &&
        hasExactSelectionKeys([]) &&
        resolution.resolvedPredicate === preparation.predicate &&
        purged.length === 0 &&
        transfigurations.length === 0 &&
        keywordChanges.length === preparation.targets.length &&
        keywordMappings.every((mapping, index) => {
          const target = preparation.targets[index];
          return (
            target !== undefined &&
            mapping.entryId === target.entryId &&
            mapping.cardId === target.cardId &&
            JSON.stringify(mapping.after) ===
              JSON.stringify({ ...(mapping.before ?? {}), fast: true })
          );
        }) &&
        sameOrderedIds(
          resolution.affectedEntryIds,
          preparation.targets.map((target) => target.entryId),
        ) &&
        nightmares.length === preparation.nightmareCount &&
        matchesNightmareGains() &&
        copies.length === 0
        ? {
            kind: "compound-card-mutation",
            sourceKind: action.effectKind,
            purged,
            transfigurations,
            keywordChanges,
            nightmares,
            copies,
          }
        : null;
    case "take-transfigured-cards-and-gain-nightmares": {
      const selectedCardIds = persistedSelectionCardIds(resolution);
      const selectedPrepared =
        preparation.kind === "take-transfigured-nightmares" &&
        selectedCardIds !== null
          ? selectedCardIds.flatMap((cardId) => {
              const prepared = preparation.offeredCards.find(
                (offer) => offer.cardId === cardId,
              );
              return prepared === undefined ? [] : [prepared];
            })
          : [];
      return preparation.kind === "take-transfigured-nightmares" &&
        hasExactSelectionKeys(["cardIds"]) &&
        selectedCardIds !== null &&
        selectedPrepared.length === selectedCardIds.length &&
        transfigurationMappings.length === selectedPrepared.length &&
        transfigurationMappings.every((mapping, index) => {
          const prepared = selectedPrepared[index];
          return (
            prepared !== undefined &&
            mapping.cardId === prepared.cardId &&
            mapping.afterTransfiguration === prepared.transfiguration
          );
        }) &&
        resolution.resolvedPredicate === preparation.predicate &&
        sameOrderedIds(
          resolution.affectedEntryIds,
          transfigurations.map((mapping) => mapping.entryId),
        ) &&
        purged.length === 0 &&
        keywordChanges.length === 0 &&
        nightmares.length === preparation.nightmareCount &&
        sameOrderedIds(resolution.gainedEntryIds ?? [], [
          ...transfigurations.map((mapping) => mapping.entryId),
          ...nightmares.map((card) => card.entryId),
        ]) &&
        sameOrderedIds(resolution.gainedCardIds, [
          ...selectedCardIds,
          ...nightmares.map((card) => card.model.cardId),
        ]) &&
        copies.length === 0
        ? {
            kind: "compound-card-mutation",
            sourceKind: action.effectKind,
            purged,
            transfigurations,
            keywordChanges,
            nightmares,
            copies,
          }
        : null;
    }
    case "purge-one-transfigure-and-copy-others": {
      const selectedIds = persistedSelectionIds(resolution);
      const selectedId = selectedIds?.[0];
      const companionTargets =
        preparation.kind === "purge-transfigure-copy"
          ? preparation.targets.filter(
              (target) => target.entryId !== selectedId,
            )
          : [];
      return preparation.kind === "purge-transfigure-copy" &&
        hasExactSelectionKeys(["entryIds"]) &&
        selectedIds?.length === 1 &&
        preparation.targets.some((target) => target.entryId === selectedId) &&
        purged.length === 1 &&
        purged[0]?.entryId === selectedId &&
        purged[0]?.model.cardId ===
          preparation.targets.find((target) => target.entryId === selectedId)
            ?.cardId &&
        matchesPreparedTransfigurations(companionTargets) &&
        sameOrderedIds(resolution.affectedEntryIds, [
          selectedId,
          ...companionTargets.map((target) => target.entryId),
        ]) &&
        keywordChanges.length === 0 &&
        nightmares.length === 0 &&
        copies.length === 3 &&
        copyMappings.every((mapping, index) => {
          const target = companionTargets[index];
          return (
            target !== undefined &&
            mapping.sourceEntryId === target.entryId &&
            mapping.sourceCardId === target.cardId &&
            mapping.mintedCardId === target.cardId
          );
        }) &&
        sameOrderedIds(
          resolution.gainedEntryIds ?? [],
          copyMappings.map((mapping) => mapping.mintedEntryId),
        ) &&
        sameOrderedIds(
          resolution.gainedCardIds,
          companionTargets.map((target) => target.cardId),
        )
        ? {
            kind: "compound-card-mutation",
            sourceKind: action.effectKind,
            purged,
            transfigurations,
            keywordChanges,
            nightmares,
            copies,
          }
        : null;
    }
    default:
      return null;
  }
}

function multiCardReplacementRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    resolution === null ||
    offer === undefined ||
    action.effectKind !== "replace-selected" ||
    (action.count ?? 1) <= 1
  ) {
    return null;
  }
  const purgedSnapshots = resolution.purgedEntrySnapshots ?? [];
  const stateBefore: JourneyState = {
    ...state,
    deck: [...state.deck, ...purgedSnapshots],
  };
  if (
    !hasUsableMultiCardReplacementPreparation(
      action,
      offer,
      stateBefore,
      content,
    )
  ) {
    return null;
  }
  const persisted = resolution.cardReplacements ?? [];
  const selectedIds = persistedSelectionIds(resolution);
  const sourceIds = persisted.map((mapping) => mapping.sourceEntryId);
  const replacementIds = persisted.map((mapping) => mapping.replacementEntryId);
  if (
    selectedIds === null ||
    persisted.length === 0 ||
    persisted.length > (action.count ?? 0) ||
    persisted.length !== purgedSnapshots.length ||
    new Set(sourceIds).size !== sourceIds.length ||
    new Set(replacementIds).size !== replacementIds.length ||
    !sameOrderedIds(sourceIds, selectedIds) ||
    !sameOrderedIds(
      purgedSnapshots.map((snapshot) => snapshot.entryId),
      selectedIds,
    ) ||
    !sameOrderedIds(selectedIds, resolution.affectedEntryIds) ||
    !sameOrderedIds(selectedIds, resolution.purgedEntryIds ?? []) ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.sourceCardId),
      resolution.purgedCardIds,
    ) ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.replacementEntryId),
      resolution.gainedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.replacementCardId),
      resolution.gainedCardIds,
    )
  ) {
    return null;
  }
  const snapshotsByEntryId = new Map(
    purgedSnapshots.map((entry) => [entry.entryId, entry]),
  );
  const preparedByEntryId = new Map(
    offer.multiCardReplacementPreparation?.bindings.map((binding) => [
      binding.sourceEntryId,
      binding,
    ]),
  );
  const replacements = persisted.flatMap((mapping) => {
    const prepared = preparedByEntryId.get(mapping.sourceEntryId);
    const sourceEntry = snapshotsByEntryId.get(mapping.sourceEntryId);
    const replacementEntry = state.deck.find(
      (entry) => entry.entryId === mapping.replacementEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const replacement =
      replacementEntry === undefined
        ? null
        : deckCardChoice(replacementEntry, content);
    if (
      prepared === undefined ||
      source === null ||
      replacement === null ||
      prepared.sourceCardId !== mapping.sourceCardId ||
      prepared.replacementCardId !== mapping.replacementCardId ||
      source.model.cardId !== mapping.sourceCardId ||
      replacement.model.cardId !== mapping.replacementCardId
    ) {
      return [];
    }
    return [{ purged: source, gained: replacement }];
  });
  return replacements.length === persisted.length
    ? {
        kind: "card-replacements",
        sourceKind: "replace-selected",
        replacements,
      }
    : null;
}

function randomFixedCardReplacementRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    resolution === null ||
    offer === undefined ||
    action.effectKind !== "replace-random-with-card" ||
    action.cardId === undefined ||
    action.predicate === undefined
  ) {
    return null;
  }
  const snapshots = resolution.purgedEntrySnapshots ?? [];
  const stateBefore: JourneyState = {
    ...state,
    deck: [...state.deck, ...snapshots],
  };
  if (
    !hasUsableRandomDeckTargetPreparation(action, offer, stateBefore, content)
  ) {
    return null;
  }
  const preparation = offer.randomDeckTargetPreparation;
  const target = preparation?.targets[0];
  const mapping = resolution.cardReplacements?.[0];
  const sourceSnapshot = snapshots[0];
  if (
    preparation === undefined ||
    preparation.targets.length !== 1 ||
    target === undefined ||
    resolution.cardReplacements?.length !== 1 ||
    mapping === undefined ||
    snapshots.length !== 1 ||
    sourceSnapshot === undefined ||
    resolution.selection === undefined ||
    Object.keys(resolution.selection).length !== 0 ||
    mapping.sourceEntryId !== target.entryId ||
    mapping.sourceCardId !== target.cardId ||
    mapping.replacementCardId !== action.cardId ||
    sourceSnapshot.entryId !== mapping.sourceEntryId ||
    !sameOrderedIds(resolution.affectedEntryIds, [mapping.sourceEntryId]) ||
    !sameOrderedIds(resolution.purgedEntryIds ?? [], [mapping.sourceEntryId]) ||
    !sameOrderedIds(resolution.purgedCardIds, [mapping.sourceCardId]) ||
    !sameOrderedIds(resolution.gainedEntryIds ?? [], [
      mapping.replacementEntryId,
    ]) ||
    !sameOrderedIds(resolution.gainedCardIds, [mapping.replacementCardId])
  ) {
    return null;
  }
  const replacementEntry = state.deck.find(
    (entry) => entry.entryId === mapping.replacementEntryId,
  );
  const purged = deckCardChoice(sourceSnapshot, content);
  const gained =
    replacementEntry === undefined
      ? null
      : deckCardChoice(replacementEntry, content);
  if (
    purged === null ||
    gained === null ||
    purged.model.cardId !== mapping.sourceCardId ||
    gained.model.cardId !== mapping.replacementCardId
  ) {
    return null;
  }
  return {
    kind: "card-replacements",
    sourceKind: "replace-random-with-card",
    replacements: [{ purged, gained }],
  };
}

function randomCardCopiesRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    resolution === null ||
    offer === undefined ||
    action.effectKind !== "copy-random-cards" ||
    !hasUsableRandomDeckTargetPreparation(action, offer, state, content)
  ) {
    return null;
  }
  const preparation = offer.randomDeckTargetPreparation;
  const mappings = resolution.cardCopies ?? [];
  if (
    preparation === undefined ||
    mappings.length !== action.count ||
    new Set(mappings.map((mapping) => mapping.mintedEntryId)).size !==
      mappings.length ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.sourceEntryId),
      preparation.targets.map((target) => target.entryId),
    ) ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.sourceEntryId),
      resolution.affectedEntryIds,
    ) ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.mintedEntryId),
      resolution.gainedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.mintedCardId),
      resolution.gainedCardIds,
    )
  ) {
    return null;
  }
  const pairs = mappings.flatMap((mapping, index) => {
    const target = preparation.targets[index];
    const sourceEntry = state.deck.find(
      (entry) => entry.entryId === mapping.sourceEntryId,
    );
    const copyEntry = state.deck.find(
      (entry) => entry.entryId === mapping.mintedEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const copy =
      copyEntry === undefined ? null : deckCardChoice(copyEntry, content);
    if (
      target === undefined ||
      source === null ||
      copy === null ||
      target.cardId !== mapping.sourceCardId ||
      source.model.cardId !== mapping.sourceCardId ||
      copy.model.cardId !== mapping.mintedCardId ||
      mapping.sourceCardId !== mapping.mintedCardId
    ) {
      return [];
    }
    return [{ source, copy }];
  });
  return pairs.length === mappings.length
    ? { kind: "card-copies-multiple", pairs, count: pairs.length }
    : null;
}

function cardTypeChangesRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  const isRandom = action.effectKind === "change-random-card-type";
  const isDisclosed =
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "offered";
  const isChosen =
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "chosen";
  if (
    resolution === null ||
    offer === undefined ||
    (!isRandom && !isDisclosed && !isChosen) ||
    (isRandom &&
      !hasUsableRandomDeckTargetPreparation(
        action,
        offer,
        state,
        content,
        true,
      )) ||
    (isDisclosed &&
      !hasUsableDisclosedDeckTargetPreparation(
        action,
        offer,
        state,
        content,
        true,
      ))
  ) {
    return null;
  }
  const mappings = resolution.cardTypeChanges ?? [];
  let preparedTargets: Array<{ entryId: DeckEntryId; cardId: CardId }>;
  if (isRandom) {
    preparedTargets = [...(offer.randomDeckTargetPreparation?.targets ?? [])];
  } else if (isDisclosed) {
    const disclosedTarget = offer.disclosedDeckTargetPreparation?.target;
    if (disclosedTarget === undefined || disclosedTarget === null) return null;
    preparedTargets = [disclosedTarget];
  } else {
    preparedTargets = mappings.map((mapping) => ({
      entryId: mapping.entryId,
      cardId: mapping.cardId,
    }));
  }
  const expectedCount = isRandom ? (action.count ?? 0) : 1;
  if (
    action.cardType === undefined ||
    resolution.resolvedCardType !== action.cardType ||
    mappings.length !== expectedCount ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.entryId),
      preparedTargets.map((target) => target.entryId),
    ) ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.entryId),
      resolution.affectedEntryIds,
    )
  ) {
    return null;
  }
  const changes = mappings.flatMap((mapping, index) => {
    const target = preparedTargets[index];
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      target === undefined ||
      entry === undefined ||
      base === undefined ||
      target.cardId !== mapping.cardId ||
      base.id !== mapping.cardId ||
      mapping.beforeCardType === mapping.afterCardType ||
      mapping.afterCardType !== action.cardType ||
      mapping.afterTypeChange.cardType !== mapping.afterCardType ||
      JSON.stringify(entry.typeChange ?? null) !==
        JSON.stringify(mapping.afterTypeChange)
    ) {
      return [];
    }
    const before = deckCardChoice(
      { ...entry, typeChange: mapping.beforeTypeChange },
      content,
    );
    const after = deckCardChoice(entry, content);
    if (
      before === null ||
      after === null ||
      before.model.displaySnapshot.cardType !== mapping.beforeCardType ||
      after.model.displaySnapshot.cardType !== mapping.afterCardType
    ) {
      return [];
    }
    return [{ ...mapping, before, after }];
  });
  return changes.length === mappings.length
    ? {
        kind: "card-type-changes",
        sourceKind: isRandom
          ? "change-random-card-type"
          : "change-card-type-selected",
        changes,
      }
    : null;
}

function multiCardTransfigurationRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (
    resolution === null ||
    !(
      (action.effectKind === "transfigure-selected" &&
        (action.count ?? 1) > 1) ||
      (action.effectKind === "transfigure-fixed-selected" &&
        (action.count ?? 1) > 1) ||
      action.effectKind === "transfigure-random-cards" ||
      action.effectKind === "transfigure-fixed-random-cards"
    )
  ) {
    return null;
  }
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    offer === undefined ||
    !hasUsableMultiCardTransfigurationPreparation(action, offer, state, content)
  ) {
    return null;
  }
  const preparation = offer.multiCardTransfigurationPreparation;
  const persisted = resolution.cardTransfigurations ?? [];
  const authoredCount = action.count ?? 0;
  const persistedEntryIds = persisted.map((mapping) => mapping.entryId);
  const chosenMode =
    preparation?.mode === "chosen-flexible" ||
    preparation?.mode === "chosen-fixed";
  const selectedIds = chosenMode ? persistedSelectionIds(resolution) : null;
  if (
    preparation === undefined ||
    persisted.length !== authoredCount ||
    persisted.length === 0 ||
    new Set(persistedEntryIds).size !== persistedEntryIds.length ||
    (chosenMode &&
      (selectedIds === null ||
        !sameOrderedIds(persistedEntryIds, selectedIds))) ||
    !sameOrderedIds(persistedEntryIds, resolution.affectedEntryIds) ||
    (preparation.mode !== "chosen-flexible" &&
      preparation.mode !== "chosen-fixed" &&
      (!sameOrderedIds(
        persisted.map((mapping) => mapping.entryId),
        preparation.targets.map((target) => target.entryId),
      ) ||
        persisted.some((mapping, index) => {
          const target = preparation.targets[index];
          return (
            target === undefined ||
            mapping.cardId !== target.cardId ||
            mapping.afterTransfiguration !== target.transfiguration
          );
        }))) ||
    (preparation.mode === "chosen-fixed" &&
      persisted.some(
        (mapping) => mapping.afterTransfiguration !== action.transfiguration,
      ))
  ) {
    return null;
  }
  const eligibleByEntryId = new Map(
    preparation.eligibleCards.map((binding) => [binding.entryId, binding]),
  );
  const transfigurations = persisted.flatMap((mapping) => {
    const binding = eligibleByEntryId.get(mapping.entryId);
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      binding === undefined ||
      entry === undefined ||
      base === undefined ||
      mapping.cardId !== binding.cardId ||
      mapping.cardId !== base.id ||
      mapping.beforeTransfiguration !== null ||
      !binding.transfigurations.includes(mapping.afterTransfiguration) ||
      entry.transfiguration !== mapping.afterTransfiguration
    ) {
      return [];
    }
    const before = deckCardChoice({ ...entry, transfiguration: null }, content);
    const after = deckCardChoice(entry, content);
    if (
      before === null ||
      after === null ||
      before.model.transfiguration !== undefined ||
      after.model.transfiguration?.type !== mapping.afterTransfiguration
    ) {
      return [];
    }
    return [
      {
        ...mapping,
        before,
        after: {
          ...after,
          model: {
            ...after.model,
            transfiguration: after.model.transfiguration,
          },
        },
      },
    ];
  });
  if (transfigurations.length !== persisted.length) return null;
  return {
    kind: "multi-card-transfiguration",
    sourceKind: action.effectKind,
    transfigurations,
  };
}

function starterCardTransfigurationRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  if (
    action.effectKind !== "transfigure-random-starter-cards" &&
    action.effectKind !== "transfigure-all-starter-cards"
  ) {
    return null;
  }
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    offer === undefined ||
    !hasUsableStarterCardTransfigurationPreparation(
      action,
      offer,
      state,
      content,
    )
  ) {
    return null;
  }
  const preparation = offer?.starterCardTransfigurationPreparation;
  const persisted = resolution.starterCardTransfigurations ?? [];
  if (
    preparation === undefined ||
    preparation.unavailableReason !== undefined ||
    persisted.length === 0 ||
    persisted.length !== preparation.targets.length ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.entryId),
      preparation.targets.map((target) => target.entryId),
    ) ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.entryId),
      resolution.affectedEntryIds,
    )
  ) {
    return null;
  }
  const transfigurations = persisted.flatMap((mapping, index) => {
    const target = preparation.targets[index];
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      target === undefined ||
      entry === undefined ||
      base === undefined ||
      !hasStarterCardRole(base) ||
      mapping.cardId !== base.id ||
      mapping.cardId !== target.cardId ||
      mapping.beforeTransfiguration !== null ||
      mapping.afterTransfiguration !== target.transfiguration ||
      entry.transfiguration !== mapping.afterTransfiguration
    ) {
      return [];
    }
    const before = deckCardChoice({ ...entry, transfiguration: null }, content);
    const after = deckCardChoice(entry, content);
    if (
      before === null ||
      after === null ||
      before.model.cardId !== mapping.cardId ||
      after.model.cardId !== mapping.cardId ||
      before.model.transfiguration !== undefined ||
      after.model.transfiguration?.type !== mapping.afterTransfiguration
    ) {
      return [];
    }
    return [
      {
        ...mapping,
        before,
        after: {
          ...after,
          model: {
            ...after.model,
            transfiguration: after.model.transfiguration,
          },
        },
      },
    ];
  });
  if (transfigurations.length !== persisted.length) return null;
  return {
    kind: "starter-card-transfiguration",
    sourceKind: action.effectKind,
    transfigurations,
  };
}

function starterCardRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const sourceKind = action.effectKind;
  if (
    sourceKind !== "purge-starter-card" &&
    sourceKind !== "purge-random-starter-card" &&
    sourceKind !== "purge-random-starter-and-gain-card" &&
    sourceKind !== "replace-all-starter-cards"
  ) {
    return null;
  }
  const purgedSnapshots = resolution.purgedEntrySnapshots ?? [];
  const purged = purgedSnapshots.flatMap((entry) => {
    const choice = deckCardChoice(entry, content);
    return choice === null ? [] : [choice];
  });
  if (
    purged.length !== purgedSnapshots.length ||
    !sameOrderedIds(
      purged.map((card) => card.entryId),
      resolution.purgedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      purged.map((card) => card.model.cardId),
      resolution.purgedCardIds,
    )
  ) {
    return null;
  }
  const persistedPairs = resolution.starterCardReplacements ?? [];
  if (
    sourceKind === "purge-starter-card" ||
    sourceKind === "purge-random-starter-card"
  ) {
    if (purged.length !== 1 || persistedPairs.length !== 0) return null;
    return {
      kind: "starter-card-mutation",
      sourceKind,
      mode: "purge",
      purged,
      replacements: [],
    };
  }
  if (
    persistedPairs.length !== purged.length ||
    (sourceKind === "purge-random-starter-and-gain-card" &&
      persistedPairs.length !== 1)
  ) {
    return null;
  }
  const purgedByEntryId = new Map(purged.map((card) => [card.entryId, card]));
  const replacements = persistedPairs.flatMap((pair) => {
    const purgedCard = purgedByEntryId.get(pair.purgedEntryId);
    const gainedEntry = state.deck.find(
      (entry) => entry.entryId === pair.gainedEntryId,
    );
    const gainedCard =
      gainedEntry === undefined ? null : deckCardChoice(gainedEntry, content);
    if (
      purgedCard === undefined ||
      purgedCard.model.cardId !== pair.purgedCardId ||
      gainedCard === null ||
      gainedCard.model.cardId !== pair.gainedCardId
    ) {
      return [];
    }
    return [{ purged: purgedCard, gained: gainedCard }];
  });
  if (
    replacements.length !== persistedPairs.length ||
    !sameOrderedIds(
      persistedPairs.map((pair) => pair.purgedEntryId),
      resolution.purgedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      persistedPairs.map((pair) => pair.purgedCardId),
      resolution.purgedCardIds,
    ) ||
    !sameOrderedIds(
      replacements.map((pair) => pair.purged.entryId),
      persistedPairs.map((pair) => pair.purgedEntryId),
    ) ||
    !sameOrderedIds(
      replacements.map((pair) => pair.gained.entryId),
      resolution.gainedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      replacements.map((pair) => pair.gained.model.cardId),
      resolution.gainedCardIds,
    )
  ) {
    return null;
  }
  return {
    kind: "starter-card-mutation",
    sourceKind,
    mode: "replace",
    purged,
    replacements,
  };
}

function rewardForResolution(
  runtime: ExplorationSiteRuntime,
  siteId: SiteId,
  state: JourneyState,
  content: JourneyContent,
  sceneNode: DreamscapeNode | null,
  actions: readonly ExplorationActionContent[],
  actionViews: readonly ExplorationActionView[],
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const resolvedAction = actions.find(
    (action) => action.id === resolution.actionId,
  );
  const resolvedActionView = actionViews.find(
    (action) => action.id === resolution.actionId,
  );
  const resolvedEffectAnnouncement =
    resolvedActionView === undefined && resolvedAction === undefined
      ? tx(
          "Exploration effect resolved",
          "[exploration] Generic player-safe Exploration outcome used when a resolved typed effect requires presentation arguments that are unavailable.",
        )
      : (resolvedActionView?.effectText ??
        localizedUnpreparedEffect(resolvedAction?.effectText ?? ""));
  if (
    resolvedAction?.effectKind === "add-fixed-site" ||
    resolvedAction?.effectKind === "choose-site-type"
  ) {
    const insertion = resolution.siteInsertion;
    const targetNode =
      insertion === undefined
        ? undefined
        : state.atlas.nodes[insertion.targetNodeId];
    const insertedSite =
      insertion === undefined || targetNode === undefined
        ? undefined
        : targetNode.sites[insertion.insertionIndex];
    const siblingSiteIdsAfter =
      insertion === undefined || targetNode === undefined
        ? []
        : targetNode.sites
            .filter((_, index) => index !== insertion.insertionIndex)
            .map((site) => site.id);
    const selectedSiteType =
      resolvedAction.effectKind === "add-fixed-site"
        ? resolvedAction.siteType
        : resolution.selection?.siteType;
    const preparedChoice =
      resolvedAction.effectKind === "choose-site-type"
        ? runtime.actionOffers
            .find((offer) => offer.actionId === resolvedAction.id)
            ?.siteTypeChoicePreparation?.choices.find(
              (choice) => choice.siteType === selectedSiteType,
            )
        : undefined;
    if (
      insertion === undefined ||
      typeof selectedSiteType !== "string" ||
      sceneNode === null ||
      sceneNode.id !== insertion.targetNodeId ||
      state.currentDreamscape !== insertion.targetNodeId ||
      state.atlas.currentNodeId !== insertion.targetNodeId ||
      targetNode !== sceneNode ||
      insertedSite === undefined ||
      targetNode.sites.length !== insertion.siblingSiteIdsBefore.length + 1 ||
      !sameOrderedIds(siblingSiteIdsAfter, insertion.siblingSiteIdsBefore) ||
      JSON.stringify(insertedSite) !== JSON.stringify(insertion.insertedSite) ||
      insertedSite.type !== selectedSiteType ||
      (resolvedAction.effectKind === "choose-site-type" &&
        (preparedChoice === undefined ||
          JSON.stringify(preparedChoice.insertedSite) !==
            JSON.stringify(insertion.insertedSite))) ||
      insertedSite.isEnhanced ||
      insertedSite.isVisited
    ) {
      return null;
    }
    const model: DreamscapeSiteModel = {
      id: insertedSite.id,
      type: insertedSite.type,
      isVisited: insertedSite.isVisited,
      pos: { x: 50, y: 50 },
      index: insertion.insertionIndex,
      isBattle: false,
      isLocked: false,
      isInteractive: false,
      label: localizedSourceText(
        siteTypeName(content.sitesData, insertedSite.type),
      ),
      blurb: localizedSourceText(
        siteTypeDescription(content.sitesData, insertedSite.type),
      ),
      icon: glyph(siteTypeIcon(content.sitesData, insertedSite.type)),
    };
    return {
      kind: "site-insertion",
      sourceKind: resolvedAction.effectKind,
      targetNodeId: insertion.targetNodeId,
      insertionIndex: insertion.insertionIndex,
      siblingSiteIdsBefore: insertion.siblingSiteIdsBefore,
      model,
    };
  }
  if (
    resolvedAction !== undefined &&
    (resolvedAction.effectKind === "transfigure-all-cards" ||
      resolvedAction.effectKind ===
        "purge-disclosed-and-transfigure-same-type" ||
      resolvedAction.effectKind === "make-predicate-fast-and-gain-nightmares" ||
      resolvedAction.effectKind ===
        "take-transfigured-cards-and-gain-nightmares" ||
      resolvedAction.effectKind === "purge-one-transfigure-and-copy-others")
  ) {
    return compoundActionRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction !== undefined &&
    ((resolvedAction.effectKind === "transfigure-selected" &&
      (resolvedAction.count ?? 1) > 1) ||
      (resolvedAction.effectKind === "transfigure-fixed-selected" &&
        (resolvedAction.count ?? 1) > 1) ||
      resolvedAction.effectKind === "transfigure-random-cards" ||
      resolvedAction.effectKind === "transfigure-fixed-random-cards")
  ) {
    return multiCardTransfigurationRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction?.effectKind === "replace-selected" &&
    (resolvedAction.count ?? 1) > 1
  ) {
    return multiCardReplacementRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (resolvedAction?.effectKind === "replace-random-with-card") {
    return randomFixedCardReplacementRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (resolvedAction?.effectKind === "copy-random-cards") {
    return randomCardCopiesRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction?.effectKind === "change-random-card-type" ||
    resolvedAction?.effectKind === "change-card-type-selected"
  ) {
    return cardTypeChangesRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction?.effectKind === "purge-starter-card" ||
    resolvedAction?.effectKind === "purge-random-starter-card" ||
    resolvedAction?.effectKind === "purge-random-starter-and-gain-card" ||
    resolvedAction?.effectKind === "replace-all-starter-cards"
  ) {
    return starterCardRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction?.effectKind === "transfigure-random-starter-cards" ||
    resolvedAction?.effectKind === "transfigure-all-starter-cards"
  ) {
    return starterCardTransfigurationRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction !== undefined &&
    (resolvedAction.effectKind === "gain-nightmare-and-dreamsign" ||
      resolvedAction.effectKind === "gain-nightmare-and-offered-dreamsign" ||
      resolvedAction.effectKind === "gain-offered-dreamsign" ||
      resolvedAction.effectKind === "replace-selected-dreamsign-with-offered" ||
      resolvedAction.effectKind === "replace-all-dreamsigns-random" ||
      resolvedAction.effectKind ===
        "purge-selected-dreamsign-and-gain-random") &&
    resolution.dreamsignMutation !== undefined
  ) {
    const mutation = resolution.dreamsignMutation;
    const replacements = mutation.replacements.flatMap((pair) => {
      const removed = dreamsignById(content, pair.removedDreamsignId);
      const gained = dreamsignById(content, pair.gainedDreamsignId);
      if (removed?.id === undefined || gained?.id === undefined) {
        return [];
      }
      return [
        {
          removed: localizedDreamsign(removed, "Exploration removed Dreamsign"),
          gained: localizedDreamsign(gained, "Exploration gained Dreamsign"),
        },
      ];
    });
    const dreamsignMutation = {
      before: dreamsignChoices(mutation.beforeIds, content),
      after: dreamsignChoices(mutation.afterIds, content),
      offered: dreamsignChoices(mutation.offeredIds, content),
      gained: dreamsignChoices(mutation.gainedIds, content),
      purged: dreamsignChoices(mutation.purgedIds, content),
      replacements,
      poolRegenerated: mutation.poolRegenerated,
    };
    if (
      resolvedAction.effectKind === "gain-nightmare-and-dreamsign" ||
      resolvedAction.effectKind === "gain-nightmare-and-offered-dreamsign"
    ) {
      const nightmareEntryIds = resolution.gainedEntryIds ?? [];
      const nightmares = nightmareEntryIds.flatMap((entryId) => {
        const entry = state.deck.find(
          (candidate) => candidate.entryId === entryId,
        );
        if (entry === undefined) return [];
        const card = deckCardChoice(entry, content);
        return card?.model.cardId === NIGHTMARE_CARD_ID ? [card] : [];
      });
      const persistedNightmareCount = resolution.gainedCardIds.filter(
        (cardId) => cardId === NIGHTMARE_CARD_ID,
      ).length;
      if (
        nightmares.length === persistedNightmareCount &&
        nightmares.length === resolvedAction.nightmareCount
      ) {
        return {
          kind: "nightmare-dreamsign-bundle",
          sourceKind: resolvedAction.effectKind,
          nightmares,
          ...dreamsignMutation,
        };
      }
      return null;
    }
    return {
      kind: "dreamsign-mutation",
      sourceKind: resolvedAction.effectKind,
      ...dreamsignMutation,
    };
  }
  if (
    resolvedAction !== undefined &&
    (resolvedAction.effectKind === "gain-essence" ||
      resolvedAction.effectKind === "gain-random-essence" ||
      resolvedAction.effectKind === "double-essence") &&
    resolution.essenceBefore !== undefined &&
    resolution.essenceAfter !== undefined
  ) {
    return {
      kind: "direct-essence",
      sourceKind: resolvedAction.effectKind,
      essenceBefore: resolution.essenceBefore,
      essenceGained: resolution.essenceGained,
      essenceAfter: resolution.essenceAfter,
      ...(resolution.essencePreparation === undefined
        ? {}
        : {
            minimumEssence: resolution.essencePreparation.minimumEssence,
            maximumEssence: resolution.essencePreparation.maximumEssence,
          }),
    };
  }
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
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
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
  if (resolvedAction?.effectKind === "copy-selected-cards") {
    const sources = resolution.affectedEntryIds.flatMap((entryId) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (entry === undefined) return [];
      const source = deckCardChoice(entry, content);
      return source === null ? [] : [source];
    });
    const copies = (resolution.gainedEntryIds ?? []).flatMap((entryId) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
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
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
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
  if (resolvedAction?.effectKind === "choose-avatar") {
    const currentId = resolution.chosenAvatarId;
    const current =
      currentId === undefined ? null : avatarById(content, currentId);
    const previous =
      resolution.previousAvatarId === undefined
        ? null
        : avatarById(content, resolution.previousAvatarId);
    if (current !== null) {
      return { kind: "avatar", previous, current };
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
    (resolvedAction?.effectKind === "free-next-shop" ||
      resolvedAction?.effectKind === "lose-half-essence-and-free-purchases") &&
    resolution.shopModifier !== undefined &&
    resolution.shopModifier.sourceSiteId === siteId &&
    resolution.shopModifier.sourceActionId === resolvedAction.id
  ) {
    if (
      resolvedAction.effectKind === "free-next-shop" &&
      resolution.shopModifier.kind === "free-next-shop"
    ) {
      return {
        kind: "shop-modifier",
        modifier: "free-next-shop",
        sourceSiteId: resolution.shopModifier.sourceSiteId,
        sourceActionId: resolution.shopModifier.sourceActionId,
      };
    }
    if (
      resolvedAction.effectKind === "lose-half-essence-and-free-purchases" &&
      resolution.shopModifier.kind === "free-purchases" &&
      resolution.shopModifier.initialCount === resolvedAction.count &&
      resolution.shopModifier.remainingCount === resolvedAction.count &&
      resolution.essenceBefore !== undefined &&
      resolution.essenceAfter !== undefined &&
      resolution.essenceSpent !== undefined &&
      resolution.essenceSpent === Math.floor(resolution.essenceBefore / 2) &&
      resolution.essenceAfter ===
        resolution.essenceBefore - resolution.essenceSpent
    ) {
      return {
        kind: "shop-modifier",
        modifier: "free-purchases",
        sourceSiteId: resolution.shopModifier.sourceSiteId,
        sourceActionId: resolution.shopModifier.sourceActionId,
        freePurchaseCount: resolution.shopModifier.initialCount,
        essenceBefore: resolution.essenceBefore,
        essenceSpent: resolution.essenceSpent,
        essenceAfter: resolution.essenceAfter,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "transfigure-selected" ||
    (resolvedAction?.effectKind === "transfigure-fixed-selected" &&
      (resolvedAction.count ?? 1) === 1)
  ) {
    const entryId = resolution.affectedEntryIds[0];
    const entry = state.deck.find((candidate) => candidate.entryId === entryId);
    const type =
      resolution.chosenTransfiguration ?? resolvedAction.transfiguration;
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      entryId !== undefined &&
      entry !== undefined &&
      type !== undefined &&
      base !== undefined
    ) {
      const before = resolveDeckEntryCard(content.transfigurationData, base, {
        ...entry,
        transfiguration: null,
      });
      const after = resolveDeckEntryCard(content.transfigurationData, base, {
        ...entry,
        transfiguration: type,
      });
      const display = buildTransfigurationDisplay(
        content.transfigurationData,
        base,
        type,
      ).display;
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
        dreamsign: localizedDreamsign(
          purgedDreamsign,
          "Exploration purged Dreamsign",
        ),
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
        essencePerSpark: authoredEssencePerSpark(resolvedAction),
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
      case "purge-random-subtype-and-increase-spark":
        return {
          kind: "spark" as const,
          amount: resolvedAction.sparkBonus ?? 1,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      case "make-fast-all":
        return {
          kind: "fast" as const,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      case "reduce-cost-all-and-gain-nightmares":
        return {
          kind: "energy-cost" as const,
          amount: resolvedAction.energyCostReduction ?? 0,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      case "change-subtype-all":
      case "change-subtype-selected":
        return {
          kind: "subtype" as const,
          subtype: resolution.chosenSubtype ?? null,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      case "purge-duplicates-and-grant-reclaim":
        return {
          kind: "reclaim" as const,
          announcement: resolvedEffectAnnouncement,
          cards,
          reclaimCostByEntryId: resolution.reclaimCostByEntryId ?? {},
        };
      case "transfigure-all-for-essence": {
        const transfiguration =
          resolution.chosenTransfiguration ?? resolvedAction.transfiguration;
        if (transfiguration === undefined) return null;
        return {
          kind: "transfiguration" as const,
          transfiguration,
          formName: localizedSourceText(
            transfigurationForm(content.transfigurationData, transfiguration)
              .name,
          ),
          essenceSpent: resolution.essenceSpent ?? 0,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      }
      default:
        return null;
    }
  })();
  const cards = resolution.gainedCardIds.flatMap((cardId) => {
    const card = cardById(content, cardId);
    return card === null ? [] : [modelForCard(card)];
  });
  const purgedCards =
    resolvedAction?.effectKind === "purge-selected" ||
    resolvedAction?.effectKind === "purge-random-subtype-and-increase-spark"
      ? (resolution.purgedEntrySnapshots ?? []).flatMap((entry) => {
          const card = deckCardChoice(entry, content);
          return card === null ? [] : [card];
        })
      : resolvedAction?.effectKind === "purge-and-copy" ||
          resolvedAction?.effectKind === "purge-duplicates-and-grant-reclaim" ||
          resolvedAction?.effectKind === "replace-selected" ||
          resolvedAction?.effectKind === "replace-selected-with-card"
        ? resolution.purgedCardIds.flatMap((cardId, index) => {
            const card = cardById(content, cardId);
            if (card === null) return [];
            return [
              {
                entryId: parseDeckEntryId(
                  resolution.purgedEntryIds?.[index] ??
                    `purged:${String(index)}:${card.id}`,
                ),
                model: modelForCard(card),
                isBane: false,
              },
            ];
          })
        : [];
  const dreamsigns = resolution.gainedDreamsignIds.flatMap((dreamsignId) => {
    const dreamsign = state.dreamsigns.find(
      (candidate) => candidate.id === dreamsignId,
    );
    return dreamsign === undefined
      ? []
      : [localizedDreamsign(dreamsign, "Exploration gained Dreamsign")];
  });
  const semanticKind =
    resolvedAction?.effectKind === "purge-selected"
      ? "card-purge"
      : resolvedAction?.effectKind === "replace-selected" ||
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
        objects: { cards, purgedCards: purgedCards, dreamsigns },
        deckModification,
      };
}

/** Build the complete Exploration presentation from persisted domain data. */
export function buildExplorationSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Exploration" };
  guide: DreamGuideContent;
  guideLine: LocalizedString;
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
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
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
    narrative: localizedAuthoredMessage(encounter.prose),
    actions,
    resolvedActionId: params.runtime.resolution?.actionId ?? null,
    reward,
    outcomeKind,
  };
}
