import type { JourneyContent } from "../../data/journey-content";
import {
  completeJourneySite,
  setJourneyScreen,
} from "../../state/journey-state-actions";
import type { DeckEntry, JourneyState, SiteState } from "../../types/journey";
import { applyJourneyRewardEffect } from "../../rules/journey/reward-effects";
import { buildAuguryContext } from "../context/buildAuguryContext";
import type {
  AuguryAcceptRequest,
  AuguryApplyPayload,
  AuguryChoice,
  AuguryDeclineRequest,
  AuguryOffer,
  AuguryOfferFailureReason,
} from "../types";
import { generateAuguryEncounter } from "./generateAuguryEncounter";
import type { SiteId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";

export type AuguryResolveFailureReason = AuguryOfferFailureReason;

export type ResolveAuguryOfferResult =
  | {
      ok: true;
      state: JourneyState;
      offer: AuguryOffer;
      appliedPayload: AuguryApplyPayload;
    }
  | {
      ok: false;
      reason: AuguryResolveFailureReason;
      state: JourneyState;
    };

export type ResolveAuguryDeclineResult =
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

interface ResolveAuguryOfferInput {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
  request: AuguryAcceptRequest;
}

interface ResolveAuguryDeclineInput {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
  request: AuguryDeclineRequest;
}

function fail(
  state: JourneyState,
  reason: AuguryResolveFailureReason,
): ResolveAuguryOfferResult {
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

export function applyAuguryPayloadToState({
  state,
  journeyContent,
  payload,
  mintEntryId,
}: {
  state: JourneyState;
  journeyContent: JourneyContent;
  payload: AuguryApplyPayload;
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
  request: AuguryAcceptRequest;
}): AuguryOffer | AuguryResolveFailureReason {
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
      encounter = generateAuguryEncounter(
        buildAuguryContext({ journeyState: state, journeyContent, site }),
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
  offer: AuguryOffer,
  choice: AuguryChoice,
): AuguryApplyPayload | null {
  const candidate = offer.choiceRequest?.candidates.find(
    (entry) => entry.choiceId === choice.choiceId,
  );
  return candidate?.applyPayload ?? null;
}

function payloadForRequest(
  offer: AuguryOffer,
  request: AuguryAcceptRequest,
): AuguryApplyPayload | AuguryResolveFailureReason {
  if (offer.choiceRequest !== undefined) {
    if (request.choice === undefined) return "missing_choice";
    return payloadForChoice(offer, request.choice) ?? "invalid_choice";
  }
  return offer.applyPayload ?? "target_unavailable";
}

export function resolveAuguryOffer({
  state,
  journeyContent,
  site,
  request,
  mintEntryId,
}: ResolveAuguryOfferInput & {
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => DeckEntryId;
}): ResolveAuguryOfferResult {
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

export function resolveAuguryDecline({
  state,
  journeyContent,
  site,
  request,
}: ResolveAuguryDeclineInput): ResolveAuguryDeclineResult {
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
        : generateAuguryEncounter(
            buildAuguryContext({ journeyState: state, journeyContent, site }),
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
