import { sha256 } from "js-sha256";
import { AUGURY_ARCHETYPE_BUILDERS } from "../archetypes/registry";
import type {
  AuguryArchetypeBuilder,
  AuguryArchetypeId,
  AuguryOfferDraft,
} from "../archetypes/types";
import { auguryRng, weightedSample } from "../signals/rng";
import { auguryArchetype } from "../../data/augury-data";
import type {
  AuguryContext,
  AuguryEncounter,
  AuguryOffer,
} from "../types";
import type { OfferId } from "../../types/identifiers";
import { parseOfferId, parseSelectionKey } from "../../types/identifiers";
import {
  parseStableDigest,
  type StableDigest,
} from "../../reward-selection/stable";

/**
 * One archetype build attempt during a slot roll. A `built: false` entry is a
 * dead roll — an eligible builder that returned null and was dropped before the
 * slot redrew — so the dead rolls preceding the chosen offer are not invisible.
 */
export interface AuguryRollAttempt {
  archetypeId: AuguryArchetypeId;
  built: boolean;
}

export interface AuguryEncounterGenerationDebug {
  eligibleArchetypeIds: readonly AuguryArchetypeId[];
  rolledA: AuguryArchetypeId | null;
  rolledB: AuguryArchetypeId | null;
  /** Build attempts for slot A in order, including dead rolls (`built: false`). */
  rollsA: readonly AuguryRollAttempt[];
  /** Build attempts for slot B in order, including dead rolls (`built: false`). */
  rollsB: readonly AuguryRollAttempt[];
  /** The debug-forced archetype that was honored for slot A, when any. */
  forcedArchetypeId: AuguryArchetypeId | null;
  encounterSignature: StableDigest;
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
  context: AuguryContext,
  builder: AuguryArchetypeBuilder,
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
  eligible: readonly AuguryArchetypeBuilder[],
  context: AuguryContext,
  saltParts: readonly string[],
): {
  result: {
    builder: AuguryArchetypeBuilder;
    draft: AuguryOfferDraft;
  } | null;
  attempts: AuguryRollAttempt[];
} {
  let pool = [...eligible];
  let attempt = 0;
  const attempts: AuguryRollAttempt[] = [];
  while (pool.length > 0) {
    const rng = auguryRng(...saltParts, "archetype", String(attempt));
    const builder = weightedSample(
      pool,
      (candidate) => weightFor(context, candidate),
      rng,
    );
    if (builder === null) return { result: null, attempts };
    const buildRng = auguryRng(...saltParts, "target", builder.archetypeId);
    const draft = builder.build(
      {
        ...context,
        selectionKey: parseSelectionKey(saltParts.slice(2).join(":")),
      },
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
  builder: AuguryArchetypeBuilder,
  context: AuguryContext,
  saltParts: readonly string[],
): {
  result: {
    builder: AuguryArchetypeBuilder;
    draft: AuguryOfferDraft;
  } | null;
  attempts: AuguryRollAttempt[];
} {
  const attempts: AuguryRollAttempt[] = [];
  for (let attempt = 0; attempt < FORCE_BUILD_ATTEMPTS; attempt += 1) {
    const buildRng = auguryRng(
      ...saltParts,
      "force",
      builder.archetypeId,
      String(attempt),
    );
    const draft = builder.build(
      {
        ...context,
        selectionKey: parseSelectionKey(saltParts.slice(2).join(":")),
      },
      buildRng,
    );
    attempts.push({ archetypeId: builder.archetypeId, built: draft !== null });
    if (draft !== null) {
      return { result: { builder, draft }, attempts };
    }
  }
  return { result: null, attempts };
}

function offerIdentity(offer: AuguryOffer): unknown {
  return {
    offerId: offer.offerId,
    archetypeId: offer.archetypeId,
    family: offer.family,
    targetKey: offer.targetKey,
  };
}

function inputSignature(context: AuguryContext): unknown {
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
  context: AuguryContext,
  offers: readonly Omit<AuguryOffer, "encounterSignature">[],
): StableDigest {
  return parseStableDigest(sha256(
    stableJson({
      input: inputSignature(context),
      offers: offers.map((offer) => offerIdentity(offer as AuguryOffer)),
    }),
  ));
}

function draftToOffer(
  draft: AuguryOfferDraft,
  offerId: OfferId,
): Omit<AuguryOffer, "encounterSignature"> {
  return {
    offerId,
    archetypeId: draft.archetypeId,
    family: draft.family,
    targetKey: draft.targetKey,
    gameObjects: draft.gameObjects,
    ...(draft.applyPayload === undefined
      ? {}
      : { applyPayload: draft.applyPayload }),
    ...(draft.choiceRequest === undefined
      ? {}
      : { choiceRequest: draft.choiceRequest }),
    ...(draft.trace === undefined ? {} : { trace: draft.trace }),
    ...(draft.mechanicId === undefined ? {} : { mechanicId: draft.mechanicId }),
    ...(draft.policyId === undefined ? {} : { policyId: draft.policyId }),
    ...(draft.selectionKey === undefined
      ? {}
      : { selectionKey: draft.selectionKey }),
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

function assertValidEncounter(encounter: AuguryEncounter): void {
  if (encounter.offers.length !== OFFER_IDS.length) {
    throw new Error(
      `Augury encounter requires exactly two offers; generated ${String(encounter.offers.length)}`,
    );
  }
  const [offerA, offerB] = encounter.offers;
  if (offerA === undefined || offerB === undefined) {
    throw new Error("Augury encounter is missing an offer");
  }
  if (offerA.family === offerB.family) {
    throw new Error(
      `Augury offers must come from different families; both were ${offerA.family}`,
    );
  }
  for (const [index, expectedOfferId] of OFFER_IDS.entries()) {
    const offer = encounter.offers[index];
    if (offer?.offerId !== expectedOfferId) {
      throw new Error(
        `Augury offer ${String(index + 1)} must have id ${expectedOfferId}`,
      );
    }
    const choiceCount = offer.choiceRequest?.candidates.length ?? 0;
    if (offer.applyPayload === undefined && choiceCount === 0) {
      throw new Error(
        `Augury offer ${offer.offerId} has neither a payload nor a chooser`,
      );
    }
    if (choiceCount > 4) {
      throw new Error(
        `Augury offer ${offer.offerId} chooser exceeds 4 candidates`,
      );
    }
  }
}

export function generateAuguryEncounterWithDebug(context: AuguryContext): {
  encounter: AuguryEncounter;
  debug: AuguryEncounterGenerationDebug;
} {
  const eligible = AUGURY_ARCHETYPE_BUILDERS.filter((builder) => {
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
  const rollsA: AuguryRollAttempt[] = [];
  let slotA: {
    builder: AuguryArchetypeBuilder;
    draft: AuguryOfferDraft;
  } | null;
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
    throw new Error("Augury could not roll a first offer");
  }
  const honoredForcedArchetypeId =
    forcedBuilder !== null &&
    slotA.builder.archetypeId === forcedBuilder.archetypeId
      ? forcedBuilder.archetypeId
      : null;

  const eligibleB = eligible.filter(
    (builder) => builder.family !== slotA.builder.family,
  );
  const slotBSalt = [context.journeySeed, context.site.id, "B", ...rerollSalt];
  const rolledB = rollSlot(eligibleB, context, slotBSalt);
  if (rolledB.result === null) {
    throw new Error("Augury could not roll a second offer");
  }
  const slotB = rolledB.result;

  const unsignedOffers = [
    draftToOffer(slotA.draft, parseOfferId(OFFER_IDS[0])),
    draftToOffer(slotB.draft, parseOfferId(OFFER_IDS[1])),
  ];
  const encounterSignature = signatureFor(context, unsignedOffers);
  const offers: AuguryOffer[] = unsignedOffers.map((offer) => ({
    ...offer,
    encounterSignature,
  }));

  const encounter: AuguryEncounter = {
    encounterSignature,
    siteId: context.site.id,
    offers,
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

export function generateAuguryEncounter(
  context: AuguryContext,
): AuguryEncounter {
  return generateAuguryEncounterWithDebug(context).encounter;
}
