import { mergeCardKeywordModification } from "../../card-type-change";
import { createDreamsign } from "../../data/dreamsigns";
import type { QuestContent } from "../../data/quest-content";
import { deriveEntryIdCounter } from "../../state/deck-entry-ids";
import { completeQuestSite, setQuestScreen } from "../../state/quest-state-actions";
import type {
  DeckEntry,
  Dreamsign,
  QuestState,
  SiteState,
} from "../../types/quest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import type {
  MerchantAcceptRequest,
  MerchantApplyPayload,
  MerchantChoice,
  MerchantDeclineRequest,
  MerchantOffer,
} from "../types";
import { generateMerchantEncounter } from "./generateMerchantEncounter";

export type MerchantResolveFailureReason =
  | "encounter_unavailable"
  | "stale_encounter"
  | "offer_not_found"
  | "archetype_mismatch"
  | "missing_choice"
  | "invalid_choice"
  | "target_unavailable"
  | "site_unavailable";

export type ResolveMerchantOfferResult =
  | {
      ok: true;
      state: QuestState;
      offer: MerchantOffer;
      appliedPayload: MerchantApplyPayload;
    }
  | {
      ok: false;
      reason: MerchantResolveFailureReason;
      state: QuestState;
    };

export type ResolveMerchantDeclineResult =
  | {
      ok: true;
      state: QuestState;
    }
  | {
      ok: false;
      reason:
        | "encounter_unavailable"
        | "stale_encounter"
        | "offer_not_found"
        | "site_unavailable";
      state: QuestState;
    };

interface ResolveMerchantOfferInput {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
  request: MerchantAcceptRequest;
}

interface ResolveMerchantDeclineInput {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
  request: MerchantDeclineRequest;
}

interface EntryIdAllocator {
  next(): string;
}

function createEntryIdAllocator(deck: readonly DeckEntry[]): EntryIdAllocator {
  let highWater = deriveEntryIdCounter(deck);
  return {
    next() {
      highWater += 1;
      return `deck-${String(highWater)}`;
    },
  };
}

function fail(
  state: QuestState,
  reason: MerchantResolveFailureReason,
): ResolveMerchantOfferResult {
  return { ok: false, reason, state };
}

function validateCatalogCard(
  questContent: QuestContent,
  cardUuid: string,
  cardNumber: number,
): boolean {
  const card = questContent.cardDatabase.get(cardNumber);
  return card !== undefined && card.id === cardUuid;
}

function validateDeckTarget(
  state: QuestState,
  questContent: QuestContent,
  payload: {
    entryId: string;
    cardUuid: string;
    cardNumber: number;
  },
): DeckEntry | null {
  const entry = state.deck.find((candidate) => candidate.entryId === payload.entryId);
  if (entry === undefined || entry.cardNumber !== payload.cardNumber) {
    return null;
  }
  return validateCatalogCard(questContent, payload.cardUuid, payload.cardNumber)
    ? entry
    : null;
}

function dreamsignFromPayload(
  questContent: QuestContent,
  payload: Extract<MerchantApplyPayload, { kind: "add_dreamsign" }>,
): Dreamsign | null {
  const template = questContent.dreamsignTemplates.find(
    (candidate) => candidate.id === payload.dreamsignId,
  );
  if (template === undefined || template.id !== payload.dreamsignTemplate.id) {
    return null;
  }
  return createDreamsign(template, false);
}

function markSiteComplete(state: QuestState, siteId: string): QuestState | null {
  const completed = completeQuestSite(state, siteId);
  if (completed === state) return null;
  return setQuestScreen(
    {
      ...completed,
      siteRuntime: {
        ...completed.siteRuntime,
        [siteId]: { kind: "dreamJourney", completed: true },
      },
    },
    { type: "dreamscape" },
  );
}

function applyMerchantPayload(
  state: QuestState,
  questContent: QuestContent,
  payload: MerchantApplyPayload,
  entryIds: EntryIdAllocator,
): QuestState | null {
  switch (payload.kind) {
    case "add_catalog_card": {
      if (!validateCatalogCard(questContent, payload.cardUuid, payload.cardNumber)) {
        return null;
      }
      return {
        ...state,
        deck: [
          ...state.deck,
          {
            entryId: entryIds.next(),
            cardNumber: payload.cardNumber,
            transfiguration: payload.transfiguration ?? null,
            isBane: false,
          },
        ],
      };
    }
    case "add_dreamsign": {
      const dreamsign = dreamsignFromPayload(questContent, payload);
      if (dreamsign === null) return null;
      return {
        ...state,
        dreamsigns: [...state.dreamsigns, dreamsign],
      };
    }
    case "transfigure_deck_entry": {
      const target = validateDeckTarget(state, questContent, payload);
      if (target === null) return null;
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === payload.entryId
            ? { ...entry, transfiguration: payload.transfiguration }
            : entry,
        ),
      };
    }
    case "duplicate_deck_entry": {
      const target = validateDeckTarget(state, questContent, payload);
      if (target === null) return null;
      return {
        ...state,
        deck: [
          ...state.deck,
          {
            ...target,
            entryId: entryIds.next(),
          },
        ],
      };
    }
    case "remove_deck_entry": {
      if (validateDeckTarget(state, questContent, payload) === null) return null;
      return {
        ...state,
        deck: state.deck.filter((entry) => entry.entryId !== payload.entryId),
      };
    }
    case "change_deck_entry_keywords": {
      const target = validateDeckTarget(state, questContent, payload);
      if (target === null) return null;
      const keywordModification = mergeCardKeywordModification(
        target.keywordModification,
        payload.keywords,
      );
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === payload.entryId
            ? { ...entry, keywordModification }
            : entry,
        ),
      };
    }
    case "change_deck_entry_type": {
      if (validateDeckTarget(state, questContent, payload) === null) return null;
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === payload.entryId
            ? { ...entry, typeChange: payload.typeChange }
            : entry,
        ),
      };
    }
    case "add_site": {
      // The real placement lands in Task 14; the payload kind exists now so the
      // union is stable. Until then, applying it is a safe no-op.
      return state;
    }
    case "composite": {
      let next: QuestState | null = state;
      for (const child of payload.children) {
        next = applyMerchantPayload(next, questContent, child, entryIds);
        if (next === null) return null;
      }
      return next;
    }
  }
}

export function applyMerchantPayloadToState({
  state,
  questContent,
  payload,
}: {
  state: QuestState;
  questContent: QuestContent;
  payload: MerchantApplyPayload;
}): QuestState | null {
  return applyMerchantPayload(
    state,
    questContent,
    payload,
    createEntryIdAllocator(state.deck),
  );
}

function findCurrentOffer(input: {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
  request: MerchantAcceptRequest;
}): MerchantOffer | MerchantResolveFailureReason {
  const { state, questContent, site, request } = input;
  let encounter;
  try {
    encounter = generateMerchantEncounter(
      buildMerchantContext({ questState: state, questContent, site }),
    );
  } catch {
    return "encounter_unavailable";
  }
  if (encounter.encounterSignature !== request.encounterSignature) {
    return "stale_encounter";
  }
  const offer = encounter.offers.find(
    (candidate) => candidate.offerId === request.offerId,
  );
  if (offer === undefined) return "offer_not_found";
  if (offer.archetypeId !== request.archetypeId) return "archetype_mismatch";
  return offer;
}

function payloadForChoice(
  offer: MerchantOffer,
  choice: MerchantChoice,
): MerchantApplyPayload | null {
  const candidate = offer.choiceRequest?.candidates.find(
    (entry) => entry.choiceId === choice.choiceId,
  );
  return candidate?.applyPayload ?? null;
}

function payloadForRequest(
  offer: MerchantOffer,
  request: MerchantAcceptRequest,
): MerchantApplyPayload | MerchantResolveFailureReason {
  if (offer.choiceRequest !== undefined) {
    if (request.choice === undefined) return "missing_choice";
    return payloadForChoice(offer, request.choice) ?? "invalid_choice";
  }
  return offer.applyPayload ?? "target_unavailable";
}

export function resolveMerchantOffer({
  state,
  questContent,
  site,
  request,
}: ResolveMerchantOfferInput): ResolveMerchantOfferResult {
  const offer = findCurrentOffer({ state, questContent, site, request });
  if (typeof offer === "string") return fail(state, offer);

  const payload = payloadForRequest(offer, request);
  if (typeof payload === "string") return fail(state, payload);

  const rewardedState = applyMerchantPayload(
    state,
    questContent,
    payload,
    createEntryIdAllocator(state.deck),
  );
  if (rewardedState === null) return fail(state, "target_unavailable");

  const completedState = markSiteComplete(rewardedState, site.id);
  if (completedState === null) return fail(state, "site_unavailable");

  return {
    ok: true,
    state: completedState,
    offer,
    appliedPayload: payload,
  };
}

export function resolveMerchantDecline({
  state,
  questContent,
  site,
  request,
}: ResolveMerchantDeclineInput): ResolveMerchantDeclineResult {
  try {
    const encounter = generateMerchantEncounter(
      buildMerchantContext({ questState: state, questContent, site }),
    );
    if (encounter.encounterSignature !== request.encounterSignature) {
      return { ok: false, reason: "stale_encounter", state };
    }
    if (
      encounter.offers.find((candidate) => candidate.offerId === request.offerId) ===
      undefined
    ) {
      return { ok: false, reason: "offer_not_found", state };
    }
  } catch {
    return { ok: false, reason: "encounter_unavailable", state };
  }

  const completedState = markSiteComplete(state, site.id);
  if (completedState === null) {
    return { ok: false, reason: "site_unavailable", state };
  }
  return { ok: true, state: completedState };
}
