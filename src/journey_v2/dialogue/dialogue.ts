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
 * Per-archetype line banks in the merchant's cryptic, poetic voice. He never
 * names a card, a creature, or a rule — he gestures at the *shape* of what he
 * is offering in dream-imagery and lets the player uncover the rest. Every
 * line is slot-free (no `{name}`), so nothing on the table is ever spoiled by
 * the words he chooses.
 */
export const MERCHANT_DIALOGUE_BANKS: Readonly<
  Record<MerchantArchetypeId, readonly string[]>
> = {
  fit_card_grant: [
    "Some things drift a long way only to find their owner.",
    "I kept this shaped like the hollow you carry.",
    "It has been waiting to belong to someone. To you.",
    "A stranger that will feel like an old friend.",
    "This was always going to end up in your hands.",
  ],
  fit_card_draft: [
    "Several roads, and each one bends quietly toward you.",
    "Kindred things, gathered. Take whichever leans your way.",
    "I sifted the tide and kept only what suits you.",
    "All of these already half-belong to you.",
    "Choose freely — none of them are strangers to your path.",
  ],
  copies_draft: [
    "Whatever you cherish, the dream will gladly echo.",
    "Hold a thing close enough and it learns to return.",
    "One becomes two when you want it badly enough.",
    "Take it once; the dream remembers it twice.",
    "What repeats becomes certain. Choose what you trust.",
  ],
  strong_card: [
    "Something fierce is sleeping here, and it stirs for you.",
    "Not gentle, this one. But it was made to win.",
    "Raw weather in a small shape. Carry it carefully.",
    "I keep the dangerous ones for travelers who can hold them.",
    "Power, plainly. The dream doesn't dress it up.",
  ],
  category_draft_known: [
    "A drawer of kindred things, all leaning the same way.",
    "Where you are going, your kin have gone before.",
    "I gathered a little family for you. Pick one to keep.",
    "Same blood, different faces. Choose the one that calls.",
    "These belong to one another, and soon to you.",
  ],
  card_bundle: [
    "These were never meant to travel alone.",
    "Apart they are quiet; together they sing.",
    "I bound them because they finish each other's sentences.",
    "A knot of things that only make sense as one.",
    "Keep them whole and you'll hear them hum.",
  ],
  transfigured_draft: [
    "I finish my work before I ever offer it.",
    "These came to me dull and leave me gleaming.",
    "Already sharpened, every one, by my own hand.",
    "No raw material here — only what I've already perfected.",
    "I polished these in the long dark. Look how they shine.",
  ],
  transfigure: [
    "Even a dreaming thing can be honed.",
    "There is a finer version of this, waiting inside.",
    "Give me a moment with it, and it will thank you.",
    "Unfinished. But I see what it longs to become.",
    "A little heat, a little patience, and it changes.",
  ],
  starter_transfigure: [
    "The first things you carried still hunger to grow.",
    "Humble beginnings reward a careful hand.",
    "What you started with can yet become more.",
    "Old companions, given a second and brighter draft.",
    "Even the plainest seed remembers how to bloom.",
  ],
  keyword_mod: [
    "A small new habit can change a whole life.",
    "One trick it never knew it wanted to learn.",
    "Teach an old thing a new word and watch it wake.",
    "Barely a change. It will feel like a different soul.",
    "A single new gift, and everything after it shifts.",
  ],
  tribal_change: [
    "Blood is only a story. It can be retold.",
    "Born to one kin, but it would run better with another.",
    "Let me change the company it keeps.",
    "A new family suits it better than the old one did.",
    "It only ever wanted to belong somewhere else.",
  ],
  purge: [
    "Some weight is only weight. Set it down with me.",
    "Travel lighter. Leave the dead branch behind.",
    "Not everything you carry is still worth carrying.",
    "Let me take the stone from your shoe.",
    "Release it, and feel how the road opens.",
  ],
  purge_replace: [
    "Let the withered branch fall; another bud waits.",
    "Trade the burden for something that pulls its weight.",
    "Out with the silence, in with a clearer note.",
    "Give me the stone; I'll hand you a seed.",
    "One leaves so a better thing can take its seat.",
  ],
  duplicate: [
    "The mirror is fond of your finest reflection.",
    "Whatever you love most, the dream will love twice.",
    "Some things are worth seeing again, and again.",
    "Point to your treasure and I will echo it.",
    "Doubling what already works is the oldest magic.",
  ],
  dreamsign: [
    "A quiet star to walk beneath, all the way home.",
    "A blessing that keeps working while you sleep.",
    "Something to watch over the long road ahead.",
    "Carry this and the nights grow a little softer.",
    "A faithful light. It asks nothing and gives daily.",
  ],
  dreamsign_draft: [
    "Several stars lean close. Choose one to follow.",
    "These lights all hum — listen for the one that's yours.",
    "Pick the patron whose silence sounds like home.",
    "A blessing fits best when it is freely chosen.",
    "Many guardians offered; you may keep a single one.",
  ],
  add_site: [
    "I can open a door where there was only wall.",
    "Your map has room for one more strange place.",
    "Let me fold a new stop into the road ahead.",
    "Somewhere worth visiting, drawn fresh just for you.",
    "The dreamscape will widen, if you let it.",
  ],
};

/** Short post-accept reactions, each a brief poetic murmur. */
export const MERCHANT_ACCEPT_REACTIONS: readonly string[] = [
  "It already looks at home with you.",
  "The dream settles. Go well.",
  "A fair bargain, and a quiet one.",
  "Carry it gently. It will carry you.",
  "There. The road feels lighter now.",
  "The dark approves, I think.",
  "Some trades the morning never undoes.",
];

function pickIndex(rng: MerchantRng, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.floor(rng() * length), length - 1);
}

export function renderMerchantDialogue(
  input: RenderMerchantDialogueInput,
): RenderedMerchantDialogue {
  const { context, offers } = input;
  const seedParts = [context.journeySeed, context.site.id];

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

  // The merchant speaks only in dream-imagery: a line is chosen by archetype,
  // never filled with a card or target name, so the words never spoil what is
  // actually on the table.
  const bank = MERCHANT_DIALOGUE_BANKS[offer.archetypeId];
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
