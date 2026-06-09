import type { MerchantArchetypeId } from "../archetypes/types";
import { merchantRng, type MerchantRng } from "../signals/rng";
import type {
  MerchantContext,
  MerchantDialogueLine,
  MerchantOffer,
} from "../types";

export interface RenderMerchantDialogueInput {
  context: MerchantContext;
  offers: readonly MerchantOffer[];
}

export interface RenderedMerchantDialogue {
  line: MerchantDialogueLine;
  acceptReaction: string;
}

/** A line template; `{name}` is replaced with the offer title. */
type DialogueTemplate = (name: string) => string;

/**
 * Per-archetype line banks (<=10 words, warm-broker voice). Only the two
 * shipped archetypes have bespoke banks; every other archetype falls back to
 * the generic bank until its dedicated copy lands.
 */
const ARCHETYPE_TEMPLATES: Partial<
  Record<MerchantArchetypeId, readonly DialogueTemplate[]>
> = {
  strong_card: [
    (name) => `${name} is the strong stock today.`,
    (name) => `I would not pass ${name} by.`,
  ],
  dreamsign: [
    (name) => `${name} would sit well beside your deck.`,
    (name) => `A standing blessing: ${name}.`,
  ],
};

const GENERIC_TEMPLATES: readonly DialogueTemplate[] = [
  (name) => `${name} caught my eye for you.`,
  (name) => `Consider ${name}; the fit is fair.`,
];

const ACCEPT_REACTIONS: readonly string[] = [
  "Done. A clean trade.",
  "Bought and witnessed.",
  "The deck will feel it.",
  "A tidy purchase.",
];

function pickIndex(rng: MerchantRng, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.floor(rng() * length), length - 1);
}

function templatesFor(archetypeId: MerchantArchetypeId): readonly DialogueTemplate[] {
  return ARCHETYPE_TEMPLATES[archetypeId] ?? GENERIC_TEMPLATES;
}

export function renderMerchantDialogue(
  input: RenderMerchantDialogueInput,
): RenderedMerchantDialogue {
  const { context, offers } = input;
  const seedParts = [context.questSeed, context.site.id];

  const offerRng = merchantRng(...seedParts, "dialogue", "offer");
  const offerIndex = pickIndex(offerRng, offers.length);
  const offer = offers[offerIndex] ?? offers[0];

  if (offer === undefined) {
    return {
      line: { line: "Two honest offers, both free.", offerId: "A" },
      acceptReaction: ACCEPT_REACTIONS[0],
    };
  }

  const bank = templatesFor(offer.archetypeId);
  const templateRng = merchantRng(...seedParts, "dialogue", "template", offer.offerId);
  const template = bank[pickIndex(templateRng, bank.length)];

  const reactionRng = merchantRng(...seedParts, "dialogue", "reaction");
  const acceptReaction =
    ACCEPT_REACTIONS[pickIndex(reactionRng, ACCEPT_REACTIONS.length)];

  return {
    line: { line: template(offer.title), offerId: offer.offerId },
    acceptReaction,
  };
}
