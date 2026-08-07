import { merchantRng, type MerchantRng } from "../signals/rng";
import { auguryArchetype } from "../../data/augury-data";
import auguryJson from "../../generated/config/augury-data.json";
import { parseAuguryData } from "../../data/augury-data";
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

const NAME_SLOT = "{name}";

const generatedAuguryData = parseAuguryData(auguryJson);

/** Generated compatibility view of the TOML-authored dialogue banks. */
export const MERCHANT_DIALOGUE_BANKS = Object.fromEntries(
  generatedAuguryData.archetypes.map((entry) => [entry.id, entry.dialogueLines]),
) as Readonly<Record<string, readonly string[]>>;

/** Generated compatibility view of the TOML-authored accept reactions. */
export const MERCHANT_ACCEPT_REACTIONS = generatedAuguryData.dialogue.acceptReactions;

/** Replaces the `{name}` slot in a template with the target's display name. */
export function fillMerchantDialogueName(template: string, name: string): string {
  return template.split(NAME_SLOT).join(name);
}

function pickIndex(rng: MerchantRng, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.floor(rng() * length), length - 1);
}

export function renderMerchantDialogue(
  input: RenderMerchantDialogueInput,
): RenderedMerchantDialogue {
  const { context, offers } = input;
  const seedParts = [context.journeySeed, context.site.id];
  const auguryData = context.rewardSelection.content.auguryData;

  const reactionRng = merchantRng(...seedParts, "dialogue", "reaction");
  const acceptReaction =
    auguryData.dialogue.acceptReactions[
      pickIndex(reactionRng, auguryData.dialogue.acceptReactions.length)
    ];

  const offerRng = merchantRng(...seedParts, "dialogue", "offer");
  const offerIndex = pickIndex(offerRng, offers.length);
  const offer = offers[offerIndex] ?? offers[0];

  if (offer === undefined) {
    return {
      line: { line: auguryData.dialogue.fallbackLine, offerId: "A" },
      acceptReaction,
    };
  }

  // The merchant speaks only in dream-imagery: a line is chosen by archetype,
  // never filled with a card or target name, so the words never spoil what is
  // actually on the table.
  const bank = auguryArchetype(auguryData, offer.archetypeId).dialogueLines;
  const templateRng = merchantRng(
    ...seedParts,
    "dialogue",
    "template",
    offer.offerId,
  );
  const line = bank[pickIndex(templateRng, bank.length)];

  return {
    line: { line, offerId: offer.offerId },
    acceptReaction,
  };
}
