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

const NAME_SLOT = "{name}";

/** Replaces the `{name}` slot in a template with the target's display name. */
export function fillMerchantDialogueName(template: string, name: string): string {
  return template.split(NAME_SLOT).join(name);
}

/**
 * Per-archetype line banks in the merchant's warm-broker voice. Each template
 * hints at the motivation behind the offer, carries at most one `{name}` slot
 * (the target's display name), and renders to at most 10 words even with a
 * 4-word name filled in. Archetypes without a public named target use
 * slot-free templates.
 */
export const MERCHANT_DIALOGUE_BANKS: Readonly<
  Record<MerchantArchetypeId, readonly string[]>
> = {
  fit_card_grant: [
    "{name} belongs with what you've built.",
    "I kept {name} for decks like yours.",
    "{name} slots right into your plans.",
    "Your deck left room for {name}.",
    "{name} fits better than you know.",
    "Trust me, {name} completes the picture.",
    "{name} is exactly the missing piece.",
  ],
  fit_card_draft: [
    "I pulled a few that suit your style.",
    "Pick one; each was chosen for you.",
    "These all want to join your deck.",
    "A small shelf, stocked just for you.",
    "Every one of these fits your build.",
    "Choose freely; I matched them to you.",
  ],
  copies_draft: [
    "Why settle for one when two travel together?",
    "Twins. Whatever you pick comes paired.",
    "Two copies make a habit, not luck.",
    "Pick once, and I'll double the order.",
    "Consistency is kindness. Take the pair.",
    "One choice, two arrivals. Generous, I know.",
  ],
  strong_card: [
    "{name} is the finest thing I carry.",
    "Strength like {name} rarely lingers here.",
    "{name} could carry your whole run.",
    "I don't shelve {name} for just anyone.",
    "{name} earns its keep, believe me.",
    "Raw power, fairly offered: {name}.",
    "{name} wins games. I've watched it.",
  ],
  premium_draft: [
    "Behind the curtain: four of my best.",
    "My top shelf, sight unseen. Trust me.",
    "Four heavyweights wait under this cloth.",
    "The good crates stay closed until you commit.",
    "Unseen, yes, but none of them disappoint.",
    "I only hide what's worth hiding.",
  ],
  category_draft_known: [
    "I stocked exactly the kind you're hunting.",
    "The crate is labeled; the contents surprise.",
    "You know the shape. Trust the contents.",
    "Right category, hidden faces. A fair gamble.",
    "The label tells you plenty already.",
    "What's inside matches the sign outside.",
  ],
  card_bundle: [
    "These were packed together for a reason.",
    "A matched set; they pull one direction.",
    "Kept together because they fight together.",
    "The bundle hums when you keep it whole.",
    "Separately fine. Together, something better.",
    "I don't split sets that sing.",
  ],
  transfigured_draft: [
    "Already improved, before you even arrived.",
    "I do the polishing before the sale.",
    "These come pre-sharpened. My own work.",
    "My workshop touched every one of these.",
    "Each one's been through my hands.",
    "Finished pieces, not raw material. Look.",
  ],
  transfigure: [
    "{name} could be so much more.",
    "Let me sharpen {name} for you.",
    "{name} has room to grow yet.",
    "I see unfinished work in {name}.",
    "Give me {name}; you'll get something better.",
    "{name} deserves a finer edge.",
    "There's a better {name} waiting inside.",
  ],
  starter_transfigure: [
    "Your old starters still have potential.",
    "Let me refit the cards you started with.",
    "Starters age well with a little work.",
    "The humble ones reward a careful hand.",
    "I improve beginnings. It's a specialty.",
    "Even first cards deserve a second draft.",
  ],
  keyword_mod: [
    "{name} just needs a new trick.",
    "A word or two changes {name} entirely.",
    "{name} could learn something useful.",
    "Let me teach {name} new habits.",
    "{name} is one talent short. Fixable.",
    "Small change, large difference for {name}.",
  ],
  tribal_change: [
    "{name} was born into the wrong family.",
    "{name} would thrive among different kin.",
    "New kin would suit {name} nicely.",
    "{name} belongs to another bloodline, truly.",
    "Let {name} run with a new pack.",
    "{name} only needs a change of company.",
  ],
  purge: [
    "{name} is dead weight. Let go.",
    "Your deck would breathe without {name}.",
    "{name} costs you more than it gives.",
    "Some cards overstay. {name} has.",
    "Travel lighter; leave {name} with me.",
    "I take castoffs. {name} qualifies.",
  ],
  purge_replace: [
    "Trade {name} for something that pulls weight.",
    "{name} goes; something better takes its seat.",
    "Out with {name}, in with promise.",
    "Retire {name}. I have its replacement.",
    "{name} leaves; a better card arrives.",
    "Swap {name} out. You won't miss it.",
  ],
  duplicate: [
    "One {name} is good. Two is better.",
    "{name} deserves a twin, don't you think?",
    "Imagine drawing {name} twice as often.",
    "Your best card, echoed. Pick which.",
    "I make perfect copies. Choose the original.",
    "Doubling what works is honest strategy.",
    "A mirror for whichever card you cherish.",
  ],
  dreamsign: [
    "{name} would watch over your whole journey.",
    "A standing blessing: {name}.",
    "{name} keeps working while you sleep.",
    "Carry {name} and the road softens.",
    "{name} pays out every single day.",
    "Signs like {name} choose their bearers.",
  ],
  dreamsign_draft: [
    "Several blessings, and you keep just one.",
    "Choose the sign that suits your road.",
    "Each sign hums differently. Listen close.",
    "A blessing fits best when freely chosen.",
    "Take whichever sign calls to you.",
    "Pick your patron; they're all listening.",
  ],
  add_site: [
    "I can put a new door here.",
    "This dreamscape has room for one more.",
    "Maps can be amended, for a friend.",
    "Another stop on your road, freshly built.",
    "I deal in places, too. Interested?",
    "Let me widen your horizon a little.",
  ],
};

/** Short post-accept reactions, each at most 6 words. */
export const MERCHANT_ACCEPT_REACTIONS: readonly string[] = [
  "Done. A clean trade.",
  "You won't regret it.",
  "Wise. Carry it well.",
  "A pleasure doing business.",
  "It suits you already.",
  "Good eye. Safe travels.",
  "The dream approves, I think.",
];

function pickIndex(rng: MerchantRng, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.floor(rng() * length), length - 1);
}

/**
 * The display name of the offer's public target, when one exists. Hidden
 * offers and choosers either carry no game objects or use slot-free banks,
 * so the name never leaks a concealed candidate.
 */
function targetNameFor(offer: MerchantOffer): string | undefined {
  return offer.gameObjects[0]?.displayName;
}

export function renderMerchantDialogue(
  input: RenderMerchantDialogueInput,
): RenderedMerchantDialogue {
  const { context, offers } = input;
  const seedParts = [context.questSeed, context.site.id];

  const reactionRng = merchantRng(...seedParts, "dialogue", "reaction");
  const acceptReaction =
    MERCHANT_ACCEPT_REACTIONS[
      pickIndex(reactionRng, MERCHANT_ACCEPT_REACTIONS.length)
    ];

  const offerRng = merchantRng(...seedParts, "dialogue", "offer");
  const offerIndex = pickIndex(offerRng, offers.length);
  const offer = offers[offerIndex] ?? offers[0];

  if (offer === undefined) {
    return {
      line: { line: "Something here was meant for you.", offerId: "A" },
      acceptReaction,
    };
  }

  const bank = MERCHANT_DIALOGUE_BANKS[offer.archetypeId];
  const targetName = targetNameFor(offer);
  const slotFree = bank.filter((template) => !template.includes(NAME_SLOT));
  const pool = targetName === undefined && slotFree.length > 0 ? slotFree : bank;

  const templateRng = merchantRng(
    ...seedParts,
    "dialogue",
    "template",
    offer.offerId,
  );
  const template = pool[pickIndex(templateRng, pool.length)];
  const line = fillMerchantDialogueName(template, targetName ?? "it");

  return {
    line: { line, offerId: offer.offerId },
    acceptReaction,
  };
}
