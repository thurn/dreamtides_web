import { mergeCardKeywordModification } from "../../card-type-change";
import { createDreamsign } from "../../data/dreamsigns";
import type { JourneyContent } from "../../data/journey-content";
import { deriveEntryIdCounter } from "../../state/deck-entry-ids";
import {
  addSiteToCurrentDreamscape,
  completeJourneySite,
  setJourneyScreen,
} from "../../state/journey-state-actions";
import type {
  DeckEntry,
  Dreamsign,
  JourneyState,
  SiteState,
} from "../../types/journey";
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
      state: JourneyState;
      offer: MerchantOffer;
      appliedPayload: MerchantApplyPayload;
    }
  | {
      ok: false;
      reason: MerchantResolveFailureReason;
      state: JourneyState;
    };

export type ResolveMerchantDeclineResult =
  | {
      ok: true;
      state: JourneyState;
    }
  | {
      ok: false;
      reason:
        | "encounter_unavailable"
        | "stale_encounter"
        | "offer_not_found"
        | "site_unavailable";
      state: JourneyState;
    };

interface ResolveMerchantOfferInput {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
  request: MerchantAcceptRequest;
}

interface ResolveMerchantDeclineInput {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
  request: MerchantDeclineRequest;
}

interface EntryIdAllocator {
  next(): string;
}

/**
 * Builds the allocator a merchant resolution mints fresh deck entries
 * through. When the caller supplies `mintEntryId` (the reducer path, backed
 * by `mintEntryId(deck, ctx.seq, index)` from src/rules/journey/deck.ts — see
 * `site-provider.ts`'s `resolveMerchant`), every minted id follows that SAME
 * seq-keyed scheme every other minting case in the game uses, rather than
 * this module's own independently-evolving `deriveEntryIdCounter` counter
 * (audit finding P3-8). Falls back to the legacy counter scheme when no
 * `mintEntryId` is supplied, for callers outside the reducer seam that have
 * no event seq to key off of.
 */
function createEntryIdAllocator(
  deck: readonly DeckEntry[],
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => string,
): EntryIdAllocator {
  if (mintEntryId !== undefined) {
    let index = 0;
    return {
      next() {
        const id = mintEntryId(deck, index);
        index += 1;
        return id;
      },
    };
  }
  let highWater = deriveEntryIdCounter(deck);
  return {
    next() {
      highWater += 1;
      return `deck-${String(highWater)}`;
    },
  };
}

function fail(
  state: JourneyState,
  reason: MerchantResolveFailureReason,
): ResolveMerchantOfferResult {
  return { ok: false, reason, state };
}

function validateCatalogCard(
  journeyContent: JourneyContent,
  cardUuid: string,
  cardNumber: number,
): boolean {
  const card = journeyContent.cardDatabase.get(cardNumber);
  return card !== undefined && card.id === cardUuid;
}

function validateDeckTarget(
  state: JourneyState,
  journeyContent: JourneyContent,
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
  return validateCatalogCard(journeyContent, payload.cardUuid, payload.cardNumber)
    ? entry
    : null;
}

function dreamsignFromPayload(
  journeyContent: JourneyContent,
  payload: Extract<MerchantApplyPayload, { kind: "add_dreamsign" }>,
): Dreamsign | null {
  const template = journeyContent.dreamsignTemplates.find(
    (candidate) => candidate.id === payload.dreamsignId,
  );
  if (template === undefined || template.id !== payload.dreamsignTemplate.id) {
    return null;
  }
  return createDreamsign(template, false);
}

function markSiteComplete(state: JourneyState, siteId: string): JourneyState | null {
  const completed = completeJourneySite(state, siteId);
  if (completed === state) return null;
  return setJourneyScreen(
    {
      ...completed,
      siteRuntime: {
        ...completed.siteRuntime,
        [siteId]: { kind: "dreamAugury", completed: true },
      },
    },
    { type: "dreamscape" },
  );
}

function applyMerchantPayload(
  state: JourneyState,
  journeyContent: JourneyContent,
  payload: MerchantApplyPayload,
  entryIds: EntryIdAllocator,
): JourneyState | null {
  switch (payload.kind) {
    case "add_catalog_card": {
      if (!validateCatalogCard(journeyContent, payload.cardUuid, payload.cardNumber)) {
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
      const dreamsign = dreamsignFromPayload(journeyContent, payload);
      if (dreamsign === null) return null;
      return {
        ...state,
        dreamsigns: [...state.dreamsigns, dreamsign],
      };
    }
    case "transfigure_deck_entry": {
      const target = validateDeckTarget(state, journeyContent, payload);
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
      const target = validateDeckTarget(state, journeyContent, payload);
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
      if (validateDeckTarget(state, journeyContent, payload) === null) return null;
      return {
        ...state,
        deck: state.deck.filter((entry) => entry.entryId !== payload.entryId),
      };
    }
    case "change_deck_entry_keywords": {
      const target = validateDeckTarget(state, journeyContent, payload);
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
      if (validateDeckTarget(state, journeyContent, payload) === null) return null;
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
      // Use the shared pure function; sourceId is the site type so the merchant
      // offer identity is embedded in the generated id (deterministic per apply).
      return addSiteToCurrentDreamscape(state, payload.siteType, payload.siteType);
    }
    case "composite": {
      let next: JourneyState | null = state;
      for (const child of payload.children) {
        next = applyMerchantPayload(next, journeyContent, child, entryIds);
        if (next === null) return null;
      }
      return next;
    }
  }
}

export function applyMerchantPayloadToState({
  state,
  journeyContent,
  payload,
  mintEntryId,
}: {
  state: JourneyState;
  journeyContent: JourneyContent;
  payload: MerchantApplyPayload;
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => string;
}): JourneyState | null {
  return applyMerchantPayload(
    state,
    journeyContent,
    payload,
    createEntryIdAllocator(state.deck, mintEntryId),
  );
}

function findCurrentOffer(input: {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
  request: MerchantAcceptRequest;
}): MerchantOffer | MerchantResolveFailureReason {
  const { state, journeyContent, site, request } = input;
  let encounter;
  try {
    encounter = generateMerchantEncounter(
      buildMerchantContext({ journeyState: state, journeyContent, site }),
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
  journeyContent,
  site,
  request,
  mintEntryId,
}: ResolveMerchantOfferInput & {
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => string;
}): ResolveMerchantOfferResult {
  const offer = findCurrentOffer({ state, journeyContent, site, request });
  if (typeof offer === "string") return fail(state, offer);

  const payload = payloadForRequest(offer, request);
  if (typeof payload === "string") return fail(state, payload);

  const rewardedState = applyMerchantPayload(
    state,
    journeyContent,
    payload,
    createEntryIdAllocator(state.deck, mintEntryId),
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
  journeyContent,
  site,
  request,
}: ResolveMerchantDeclineInput): ResolveMerchantDeclineResult {
  try {
    const encounter = generateMerchantEncounter(
      buildMerchantContext({ journeyState: state, journeyContent, site }),
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
