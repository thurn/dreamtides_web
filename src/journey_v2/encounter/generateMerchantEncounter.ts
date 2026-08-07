import { sha256 } from "js-sha256";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../archetypes/registry";
import type {
  MerchantArchetypeBuilder,
  MerchantArchetypeId,
  MerchantOfferDraft,
} from "../archetypes/types";
import { renderMerchantDialogue } from "../dialogue/dialogue";
import { merchantRng, weightedSample } from "../signals/rng";
import { auguryArchetype } from "../../data/augury-data";
import {
  auguryCountWord,
  renderAuguryTemplate,
} from "../../data/augury-data";
import type {
  MerchantContext,
  MerchantEncounter,
  MerchantOffer,
} from "../types";

/**
 * One archetype build attempt during a slot roll. A `built: false` entry is a
 * dead roll — an eligible builder that returned null and was dropped before the
 * slot redrew — so the dead rolls preceding the chosen offer are not invisible.
 */
export interface MerchantRollAttempt {
  archetypeId: MerchantArchetypeId;
  built: boolean;
}

export interface MerchantEncounterGenerationDebug {
  eligibleArchetypeIds: readonly MerchantArchetypeId[];
  rolledA: MerchantArchetypeId | null;
  rolledB: MerchantArchetypeId | null;
  /** Build attempts for slot A in order, including dead rolls (`built: false`). */
  rollsA: readonly MerchantRollAttempt[];
  /** Build attempts for slot B in order, including dead rolls (`built: false`). */
  rollsB: readonly MerchantRollAttempt[];
  /** The debug-forced archetype that was honored for slot A, when any. */
  forcedArchetypeId: MerchantArchetypeId | null;
  encounterSignature: string;
}

/** Build attempts for a debug-forced slot before giving up and rolling normally. */
const FORCE_BUILD_ATTEMPTS = 8;

type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly StableJsonValue[]
  | { readonly [key: string]: StableJsonValue };

const OFFER_IDS = ["A", "B"] as const;

export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function stableJson(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

function toStableJsonValue(value: unknown): StableJsonValue {
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toStableJsonValue(item));
  }
  if (typeof value === "object" && value !== undefined) {
    const source = value as Record<string, unknown>;
    const stable: Record<string, StableJsonValue> = {};
    for (const key of Object.keys(source).sort(compareCodeUnits)) {
      const child = source[key];
      if (child !== undefined && typeof child !== "function") {
        stable[key] = toStableJsonValue(child);
      }
    }
    return stable;
  }
  return null;
}

function weightFor(
  context: MerchantContext,
  builder: MerchantArchetypeBuilder,
): number {
  return auguryArchetype(
    context.rewardSelection.content.auguryData,
    builder.archetypeId,
  ).weight;
}

/**
 * Rolls one archetype slot: weighted-sample an eligible builder, call `build`,
 * and on a null build remove that archetype and redraw. A build/eligibility
 * mismatch must not abort the encounter, so we keep drawing until the candidate
 * pool is exhausted.
 */
function rollSlot(
  eligible: readonly MerchantArchetypeBuilder[],
  context: MerchantContext,
  saltParts: readonly string[],
): {
  result: { builder: MerchantArchetypeBuilder; draft: MerchantOfferDraft } | null;
  attempts: MerchantRollAttempt[];
} {
  let pool = [...eligible];
  let attempt = 0;
  const attempts: MerchantRollAttempt[] = [];
  while (pool.length > 0) {
    const rng = merchantRng(...saltParts, "archetype", String(attempt));
    const builder = weightedSample(
      pool,
      (candidate) => weightFor(context, candidate),
      rng,
    );
    if (builder === null) return { result: null, attempts };
    const buildRng = merchantRng(...saltParts, "target", builder.archetypeId);
    const draft = builder.build(
      { ...context, selectionKey: saltParts.slice(2).join(":") },
      buildRng,
    );
    attempts.push({ archetypeId: builder.archetypeId, built: draft !== null });
    if (draft !== null) {
      return { result: { builder, draft }, attempts };
    }
    pool = pool.filter((candidate) => candidate !== builder);
    attempt += 1;
  }
  return { result: null, attempts };
}

/**
 * Builds a specific (debug-forced) archetype for a slot, redrawing the build
 * RNG up to {@link FORCE_BUILD_ATTEMPTS} times when a build returns null. The
 * force suffix keeps these draws disjoint from the normal roll, so forcing a
 * category never collides with the unforced encounter's signatures.
 */
function forceSlot(
  builder: MerchantArchetypeBuilder,
  context: MerchantContext,
  saltParts: readonly string[],
): {
  result: { builder: MerchantArchetypeBuilder; draft: MerchantOfferDraft } | null;
  attempts: MerchantRollAttempt[];
} {
  const attempts: MerchantRollAttempt[] = [];
  for (let attempt = 0; attempt < FORCE_BUILD_ATTEMPTS; attempt += 1) {
    const buildRng = merchantRng(
      ...saltParts,
      "force",
      builder.archetypeId,
      String(attempt),
    );
    const draft = builder.build(
      { ...context, selectionKey: saltParts.slice(2).join(":") },
      buildRng,
    );
    attempts.push({ archetypeId: builder.archetypeId, built: draft !== null });
    if (draft !== null) {
      return { result: { builder, draft }, attempts };
    }
  }
  return { result: null, attempts };
}

function offerIdentity(offer: MerchantOffer): unknown {
  return {
    offerId: offer.offerId,
    archetypeId: offer.archetypeId,
    family: offer.family,
    title: offer.title,
    summary: offer.summary,
    targetKey: offer.targetKey,
  };
}

function inputSignature(context: MerchantContext): unknown {
  return {
    journeySeed: context.journeySeed,
    siteId: context.site.id,
    deck: context.deckCards
      .map((deckCard) => ({
        entryId: deckCard.entryId,
        cardNumber: deckCard.cardNumber,
        transfiguration: deckCard.deckEntry.transfiguration,
        keywordModification: deckCard.deckEntry.keywordModification ?? null,
        typeChange: deckCard.deckEntry.typeChange ?? null,
        isBane: deckCard.deckEntry.isBane,
      }))
      .sort((a, b) => compareCodeUnits(a.entryId, b.entryId)),
    heldDreamsignIds: [...context.heldDreamsignIds].sort(compareCodeUnits),
  };
}

function signatureFor(
  context: MerchantContext,
  offers: readonly Omit<MerchantOffer, "encounterSignature">[],
): string {
  return sha256(
    stableJson({
      input: inputSignature(context),
      offers: offers.map((offer) => offerIdentity(offer as MerchantOffer)),
    }),
  );
}

function draftToOffer(
  draft: MerchantOfferDraft,
  offerId: string,
  context: MerchantContext,
): Omit<MerchantOffer, "encounterSignature"> {
  const config = auguryArchetype(
    context.rewardSelection.content.auguryData,
    draft.archetypeId,
  );
  const objectNames = draft.gameObjects.map((object) => object.displayName);
  const choiceCount = draft.choiceRequest?.candidates.length ?? 0;
  const count = choiceCount > 0 ? choiceCount : Math.max(1, objectNames.length);
  const firstChoiceName = draft.choiceRequest?.candidates[0]?.gameObjects[0]
    ?.displayName;
  const firstObject = draft.gameObjects[0];
  const inferredTransfiguration = firstObject?.badge?.label;
  const values = {
    card: objectNames[0] ?? firstChoiceName ?? draft.targetKey,
    cards: objectNames.join(", "),
    count,
    "count-word": auguryCountWord(count),
    site: draft.targetKey,
    transfiguration: inferredTransfiguration ?? draft.targetKey.split(":").slice(-1)[0] ?? "",
    subtype: inferredTransfiguration?.replace(/^Becomes a /u, "") ?? draft.targetKey.split(":").slice(-1)[0] ?? "",
    ...draft.copyVariables,
  } as const;
  const renderedCandidates = draft.choiceRequest?.candidates.map((candidate) => {
    const card = candidate.gameObjects[0]?.displayName ?? candidate.choiceId;
    const transfiguration = candidate.gameObjects[0]?.badge?.label ?? values.transfiguration;
    const candidateValues = { ...values, card, transfiguration };
    return {
      ...candidate,
      title: renderAuguryTemplate(config.copy.candidateTitle, candidateValues),
      summary: renderAuguryTemplate(config.copy.candidateSummary, candidateValues),
    };
  });
  return {
    offerId,
    archetypeId: draft.archetypeId,
    family: draft.family,
    title: renderAuguryTemplate(config.copy.title, values),
    summary: renderAuguryTemplate(config.copy.summary, values),
    detailHeadline: renderAuguryTemplate(config.copy.detailHeadline, values),
    detailSubtitle: renderAuguryTemplate(config.copy.detailSubtitle, values),
    targetKey: draft.targetKey,
    gameObjects: draft.gameObjects,
    ...(draft.applyPayload === undefined
      ? {}
      : { applyPayload: draft.applyPayload }),
    ...(draft.choiceRequest === undefined || renderedCandidates === undefined
      ? {}
      : {
          choiceRequest: {
            ...draft.choiceRequest,
            prompt: renderAuguryTemplate(config.copy.prompt, values),
            candidates: renderedCandidates,
          },
        }),
    ...(draft.trace === undefined ? {} : { trace: draft.trace }),
    ...(draft.mechanicId === undefined ? {} : { mechanicId: draft.mechanicId }),
    ...(draft.policyId === undefined ? {} : { policyId: draft.policyId }),
    ...(draft.selectionKey === undefined ? {} : { selectionKey: draft.selectionKey }),
    ...(draft.selectionRulesVersion === undefined
      ? {}
      : { selectionRulesVersion: draft.selectionRulesVersion }),
    ...(draft.selectionContentRevision === undefined
      ? {}
      : { selectionContentRevision: draft.selectionContentRevision }),
    ...(draft.selectionTrace === undefined
      ? {}
      : { selectionTrace: draft.selectionTrace }),
  };
}

function assertValidEncounter(encounter: MerchantEncounter): void {
  if (encounter.offers.length !== OFFER_IDS.length) {
    throw new Error(
      `Dream Merchant encounter requires exactly two offers; generated ${String(encounter.offers.length)}`,
    );
  }
  const [offerA, offerB] = encounter.offers;
  if (offerA === undefined || offerB === undefined) {
    throw new Error("Dream Merchant encounter is missing an offer");
  }
  if (offerA.family === offerB.family) {
    throw new Error(
      `Dream Merchant offers must come from different families; both were ${offerA.family}`,
    );
  }
  for (const [index, expectedOfferId] of OFFER_IDS.entries()) {
    const offer = encounter.offers[index];
    if (offer?.offerId !== expectedOfferId) {
      throw new Error(
        `Dream Merchant offer ${String(index + 1)} must have id ${expectedOfferId}`,
      );
    }
    const choiceCount = offer.choiceRequest?.candidates.length ?? 0;
    if (offer.applyPayload === undefined && choiceCount === 0) {
      throw new Error(
        `Dream Merchant offer ${offer.offerId} has neither a payload nor a chooser`,
      );
    }
    if (choiceCount > 4) {
      throw new Error(
        `Dream Merchant offer ${offer.offerId} chooser exceeds 4 candidates`,
      );
    }
  }
}

export function generateMerchantEncounterWithDebug(
  context: MerchantContext,
): { encounter: MerchantEncounter; debug: MerchantEncounterGenerationDebug } {
  const eligible = MERCHANT_ARCHETYPE_BUILDERS.filter((builder) => {
    const config = auguryArchetype(
      context.rewardSelection.content.auguryData,
      builder.archetypeId,
    );
    if (config.family !== builder.family) {
      throw new Error(
        `Augury archetype ${builder.archetypeId} has mismatched family ${config.family}`,
      );
    }
    return config.enabled && builder.eligible(context);
  });
  const eligibleArchetypeIds = eligible.map((builder) => builder.archetypeId);

  // A non-zero debug reroll nonce mixes a "reroll|N" suffix into the salt so
  // the same journey parameters yield a fresh encounter. A zero/absent nonce
  // contributes nothing, leaving untouched encounters bit-identical.
  const rerollSalt =
    context.rerollNonce && context.rerollNonce > 0
      ? ["reroll", String(context.rerollNonce)]
      : [];

  // A debug-forced archetype only applies when it is actually eligible for the
  // current journey state; otherwise it is silently ignored and slot A rolls
  // normally. Forcing targets slot A so the encounter always shows at least one
  // offer of the chosen category.
  const forcedBuilder =
    context.forcedArchetypeId === undefined
      ? null
      : (eligible.find(
          (builder) => builder.archetypeId === context.forcedArchetypeId,
        ) ?? null);

  const slotASalt = [context.journeySeed, context.site.id, "A", ...rerollSalt];
  // Slot A: a forced builder's attempts come first; if it never builds we fall
  // back to a normal roll and concatenate both attempt logs so the dead forced
  // rolls remain visible alongside the eventual pick.
  const rollsA: MerchantRollAttempt[] = [];
  let slotA: { builder: MerchantArchetypeBuilder; draft: MerchantOfferDraft } | null;
  if (forcedBuilder === null) {
    const rolled = rollSlot(eligible, context, slotASalt);
    rollsA.push(...rolled.attempts);
    slotA = rolled.result;
  } else {
    const forced = forceSlot(forcedBuilder, context, slotASalt);
    rollsA.push(...forced.attempts);
    if (forced.result !== null) {
      slotA = forced.result;
    } else {
      const rolled = rollSlot(eligible, context, slotASalt);
      rollsA.push(...rolled.attempts);
      slotA = rolled.result;
    }
  }
  if (slotA === null) {
    throw new Error("Dream Merchant could not roll a first offer");
  }
  const honoredForcedArchetypeId =
    forcedBuilder !== null && slotA.builder.archetypeId === forcedBuilder.archetypeId
      ? forcedBuilder.archetypeId
      : null;

  const eligibleB = eligible.filter(
    (builder) => builder.family !== slotA.builder.family,
  );
  const slotBSalt = [context.journeySeed, context.site.id, "B", ...rerollSalt];
  const rolledB = rollSlot(eligibleB, context, slotBSalt);
  if (rolledB.result === null) {
    throw new Error("Dream Merchant could not roll a second offer");
  }
  const slotB = rolledB.result;

  const unsignedOffers = [
    draftToOffer(slotA.draft, OFFER_IDS[0], context),
    draftToOffer(slotB.draft, OFFER_IDS[1], context),
  ];
  const encounterSignature = signatureFor(context, unsignedOffers);
  const offers: MerchantOffer[] = unsignedOffers.map((offer) => ({
    ...offer,
    encounterSignature,
  }));

  const dialogue = renderMerchantDialogue({ context, offers });

  const encounter: MerchantEncounter = {
    encounterSignature,
    siteId: context.site.id,
    offers,
    dialogue: dialogue.line,
    acceptReaction: dialogue.acceptReaction,
  };

  assertValidEncounter(encounter);

  return {
    encounter,
    debug: {
      eligibleArchetypeIds,
      rolledA: slotA.builder.archetypeId,
      rolledB: slotB.builder.archetypeId,
      rollsA,
      rollsB: rolledB.attempts,
      forcedArchetypeId: honoredForcedArchetypeId,
      encounterSignature,
    },
  };
}

export function generateMerchantEncounter(
  context: MerchantContext,
): MerchantEncounter {
  return generateMerchantEncounterWithDebug(context).encounter;
}
