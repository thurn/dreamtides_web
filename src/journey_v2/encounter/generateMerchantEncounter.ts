import { sha256 } from "js-sha256";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../archetypes/registry";
import type {
  MerchantArchetypeBuilder,
  MerchantArchetypeId,
  MerchantOfferDraft,
} from "../archetypes/types";
import { renderMerchantDialogue } from "../dialogue/dialogue";
import { merchantRng, weightedSample } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type {
  MerchantContext,
  MerchantEncounter,
  MerchantOffer,
} from "../types";

export interface MerchantEncounterGenerationDebug {
  eligibleArchetypeIds: readonly MerchantArchetypeId[];
  rolledA: MerchantArchetypeId | null;
  rolledB: MerchantArchetypeId | null;
  encounterSignature: string;
}

type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly StableJsonValue[]
  | { readonly [key: string]: StableJsonValue };

const OFFER_IDS = ["A", "B"] as const;

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
    for (const key of Object.keys(source).sort()) {
      const child = source[key];
      if (child !== undefined && typeof child !== "function") {
        stable[key] = toStableJsonValue(child);
      }
    }
    return stable;
  }
  return null;
}

function weightFor(builder: MerchantArchetypeBuilder): number {
  return MERCHANT_TUNING.weights[builder.archetypeId];
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
): { builder: MerchantArchetypeBuilder; draft: MerchantOfferDraft } | null {
  let pool = [...eligible];
  let attempt = 0;
  while (pool.length > 0) {
    const rng = merchantRng(...saltParts, "archetype", String(attempt));
    const builder = weightedSample(pool, weightFor, rng);
    if (builder === null) return null;
    const buildRng = merchantRng(...saltParts, "target", builder.archetypeId);
    const draft = builder.build(context, buildRng);
    if (draft !== null) {
      return { builder, draft };
    }
    pool = pool.filter((candidate) => candidate !== builder);
    attempt += 1;
  }
  return null;
}

function offerIdentity(offer: MerchantOffer): unknown {
  return {
    offerId: offer.offerId,
    archetypeId: offer.archetypeId,
    family: offer.family,
    title: offer.title,
    summary: offer.summary,
    hiddenUntilCommit: offer.hiddenUntilCommit,
    targetKey: offer.targetKey,
  };
}

function inputSignature(context: MerchantContext): unknown {
  return {
    questSeed: context.questSeed,
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
      .sort((a, b) => a.entryId.localeCompare(b.entryId)),
    heldDreamsignIds: [...context.heldDreamsignIds].sort(),
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
): Omit<MerchantOffer, "encounterSignature"> {
  return {
    offerId,
    archetypeId: draft.archetypeId,
    family: draft.family,
    title: draft.title,
    summary: draft.summary,
    hiddenUntilCommit: draft.hiddenUntilCommit,
    targetKey: draft.targetKey,
    gameObjects: draft.gameObjects,
    ...(draft.applyPayload === undefined
      ? {}
      : { applyPayload: draft.applyPayload }),
    ...(draft.choiceRequest === undefined
      ? {}
      : { choiceRequest: draft.choiceRequest }),
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
  const eligible = MERCHANT_ARCHETYPE_BUILDERS.filter((builder) =>
    builder.eligible(context),
  );
  const eligibleArchetypeIds = eligible.map((builder) => builder.archetypeId);

  // A non-zero debug reroll nonce mixes a "reroll|N" suffix into the salt so
  // the same quest parameters yield a fresh encounter. A zero/absent nonce
  // contributes nothing, leaving untouched encounters bit-identical.
  const rerollSalt =
    context.rerollNonce && context.rerollNonce > 0
      ? ["reroll", String(context.rerollNonce)]
      : [];

  const slotASalt = [context.questSeed, context.site.id, "A", ...rerollSalt];
  const rolledA = rollSlot(eligible, context, slotASalt);
  if (rolledA === null) {
    throw new Error("Dream Merchant could not roll a first offer");
  }

  const eligibleB = eligible.filter(
    (builder) => builder.family !== rolledA.builder.family,
  );
  const slotBSalt = [context.questSeed, context.site.id, "B", ...rerollSalt];
  const rolledB = rollSlot(eligibleB, context, slotBSalt);
  if (rolledB === null) {
    throw new Error("Dream Merchant could not roll a second offer");
  }

  const unsignedOffers = [
    draftToOffer(rolledA.draft, OFFER_IDS[0]),
    draftToOffer(rolledB.draft, OFFER_IDS[1]),
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
      rolledA: rolledA.builder.archetypeId,
      rolledB: rolledB.builder.archetypeId,
      encounterSignature,
    },
  };
}

export function generateMerchantEncounter(
  context: MerchantContext,
): MerchantEncounter {
  return generateMerchantEncounterWithDebug(context).encounter;
}
