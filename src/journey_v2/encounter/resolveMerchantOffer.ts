import type { JourneyContent } from "../../data/journey-content";
import {
  completeJourneySite,
  setJourneyScreen,
} from "../../state/journey-state-actions";
import type { DeckEntry, JourneyState, SiteState } from "../../types/journey";
import { applyJourneyRewardEffect } from "../../rules/journey/reward-effects";
import { buildMerchantContext } from "../context/buildMerchantContext";
import type {
  MerchantAcceptRequest,
  MerchantApplyPayload,
  MerchantChoice,
  MerchantDeclineRequest,
  MerchantOffer,
} from "../types";
import { generateMerchantEncounter } from "./generateMerchantEncounter";
import type { SiteId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";

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

function fail(
  state: JourneyState,
  reason: MerchantResolveFailureReason,
): ResolveMerchantOfferResult {
  return { ok: false, reason, state };
}

function markSiteComplete(
  state: JourneyState,
  siteId: SiteId,
): JourneyState | null {
  const completed = completeJourneySite(state, siteId);
  if (completed === state) return null;
  return setJourneyScreen(
    {
      ...completed,
      siteRuntime: {
        ...completed.siteRuntime,
        [siteId]: { kind: "augury", completed: true },
      },
    },
    { type: "dreamscape" },
  );
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
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => DeckEntryId;
}): JourneyState | null {
  return applyJourneyRewardEffect({
    state,
    journeyContent,
    effect: payload,
    mintEntryId,
  });
}

function findCurrentOffer(input: {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
  request: MerchantAcceptRequest;
}): MerchantOffer | MerchantResolveFailureReason {
  const { state, journeyContent, site, request } = input;
  const runtime = state.siteRuntime[site.id];
  let encounter = runtime?.kind === "augury" ? runtime.encounter : undefined;
  if (
    runtime?.kind === "augury" &&
    runtime.selectionRulesVersion !== undefined
  ) {
    if (request.selectionRulesVersion !== runtime.selectionRulesVersion) {
      return "stale_encounter";
    }
    if (encounter === undefined) return "encounter_unavailable";
  } else {
    try {
      encounter = generateMerchantEncounter(
        buildMerchantContext({ journeyState: state, journeyContent, site }),
      );
    } catch {
      return "encounter_unavailable";
    }
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
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => DeckEntryId;
}): ResolveMerchantOfferResult {
  const offer = findCurrentOffer({ state, journeyContent, site, request });
  if (typeof offer === "string") return fail(state, offer);

  const payload = payloadForRequest(offer, request);
  if (typeof payload === "string") return fail(state, payload);

  const rewardedState = applyJourneyRewardEffect({
    state,
    journeyContent,
    effect: payload,
    mintEntryId,
  });
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
    const runtime = state.siteRuntime[site.id];
    if (
      runtime?.kind === "augury" &&
      runtime.selectionRulesVersion !== undefined &&
      request.selectionRulesVersion !== runtime.selectionRulesVersion
    ) {
      return { ok: false, reason: "stale_encounter", state };
    }
    const encounter =
      runtime?.kind === "augury" && runtime.encounter !== undefined
        ? runtime.encounter
        : generateMerchantEncounter(
            buildMerchantContext({ journeyState: state, journeyContent, site }),
          );
    if (encounter.encounterSignature !== request.encounterSignature) {
      return { ok: false, reason: "stale_encounter", state };
    }
    if (
      encounter.offers.find(
        (candidate) => candidate.offerId === request.offerId,
      ) === undefined
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
