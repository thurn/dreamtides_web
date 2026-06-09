import { sha256 } from "js-sha256";
import type { MerchantRewardFamily } from "../catalog/pricing";
import type {
  MerchantContext,
  MerchantDialogueBeat,
  MerchantNeed,
  MerchantNeedKind,
  MerchantOffer,
  MerchantRewardBuilderId,
  MerchantRoleNeed,
} from "../types";

type DialogueTemplate<Slots> = {
  id: string;
  render: (slots: Slots) => string;
};

interface ObservationSlots {
  subject: string;
  theme: string;
  role: string;
  summary: string;
  metric: string;
}

interface OfferSlots {
  offerLabel: string;
  rewardTitle: string;
  rewardSummary: string;
  rewardFamily: string;
  builderId: MerchantRewardBuilderId;
}

interface PriceSlots {
  offerLabel: string;
  price: number;
  valueEssence: number;
  locked: boolean;
}

interface ReactionSlots {
  firstOfferLabel: string;
  secondOfferLabel: string;
}

export interface RenderMerchantDialogueInput {
  context: MerchantContext;
  needs: readonly MerchantNeed[];
  offers: readonly MerchantOffer[];
}

const ROLE_LABELS: Readonly<Record<MerchantRoleNeed, string>> = {
  draw: "card draw",
  recursion: "recursion",
  interaction: "interaction",
  cheap_early_play: "early plays",
  events: "events",
  characters: "characters",
  abandon_outlet: "abandon outlets",
  finisher: "finishers",
};

const BUILDER_FAMILY: Readonly<Record<MerchantRewardBuilderId, MerchantRewardFamily>> = {
  grant_support_card: "cardGrant",
  grant_dreamsign: "dreamsign",
  transfigure_card: "transfiguration",
  purge_weak_card: "purge",
  duplicate_keystone: "duplicate",
  replace_weak_with_fit: "cardGrant",
  gain_essence: "essence",
  raise_essence_cap: "essence",
  add_reclaim_to_event: "other",
  add_fast_to_event: "other",
  reduce_reclaim_cost: "other",
  convert_event_to_role: "other",
  grant_exact_card: "cardGrant",
};

const FAMILY_LABELS: Readonly<Record<MerchantRewardFamily, string>> = {
  cardGrant: "card",
  dreamsign: "Dreamsign",
  transfiguration: "transfiguration",
  duplicate: "duplicate",
  purge: "purge",
  essence: "essence",
  other: "craft",
};

function makeTemplates<Slots>(
  prefix: string,
  renderers: readonly ((slots: Slots) => string)[],
): readonly DialogueTemplate<Slots>[] {
  return renderers.map((render, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    render,
  }));
}

export const GREETING_TEMPLATES = makeTemplates<ReactionSlots>("greeting", [
  () => "Step close; the good bargains keep their own hour.",
  () => "I have warmed the ledger and cooled the asking price.",
  () => "A careful deck makes a careful customer; let us speak plainly.",
  () => "The road has given you a shape, and I have wares cut to it.",
  () => "No shouting stall today, only useful work at a fair table.",
  () => "Your timing is tidy; my case is open and my patience is paid up.",
  () => "Come look. I trade in answers, not glitter.",
  () => "A little inventory, a little instinct, and perhaps a bargain.",
  () => "The dream has brought you to the right counter.",
  () => "I keep my best stock for decks that can tell me what they lack.",
  () => "Let us count needs before we count coins.",
  () => "A warm hand for a sharp bargain; that is my custom.",
  () => "I have listened to the cards before naming the price.",
  () => "The case is small, but the fit may be exact.",
  () => "A merchant should notice before he offers.",
  () => "Good. You arrived while the inventory still remembers you.",
  () => "The shelf has been rearranging itself since you stepped near.",
  () => "I see enough to make two honest offers.",
  () => "No mystery surcharge today; only need, stock, and timing.",
  () => "Bring the deck into the light and I will bring the bargains.",
  () => "The market is kind when the customer is specific.",
  () => "I have two pieces that might earn their keep.",
  () => "Warm terms, clean math, and no hidden drawer.",
  () => "The dream pays attention. So do I.",
]);

export const OBSERVATION_TEMPLATES: Readonly<
  Record<MerchantNeedKind, readonly DialogueTemplate<ObservationSlots>[]>
> = {
  under_supported_payoff: makeTemplates("observation-under-supported-payoff", [
    (s) => `${s.subject} is asking for ${s.theme}; ${s.summary}`,
    (s) => `The promise in ${s.subject} wants more company in ${s.theme}. ${s.metric}`,
    (s) => `I can see the payoff, but ${s.theme} support is thin around ${s.subject}.`,
    (s) => `${s.subject} has taste; it is tasting for ${s.theme}. ${s.summary}`,
    (s) => `A payoff without enough ${s.theme} is a locked drawer with a good key.`,
    (s) => `Your ${s.theme} count makes ${s.subject} work harder than it should.`,
    (s) => `The ledger marks ${s.subject} as hungry for ${s.theme}. ${s.metric}`,
    (s) => `${s.subject} can pay you back if the ${s.theme} shelf gets deeper.`,
    (s) => `There is a bargain in feeding ${s.subject} the ${s.theme} it names.`,
    (s) => `I would not ignore ${s.subject}; its need is specifically ${s.theme}.`,
    (s) => `The deck points at ${s.subject}, then points again at ${s.theme}.`,
    (s) => `A little more ${s.theme} turns ${s.subject} from promise into account.`,
  ]),
  missing_role: makeTemplates("observation-missing-role", [
    (s) => `Your list is light on ${s.role}; ${s.summary}`,
    (s) => `${s.role} is the empty shelf I notice first. ${s.metric}`,
    (s) => `The deck has plans, but fewer ${s.role} than those plans deserve.`,
    (s) => `A practical buyer would ask for ${s.role} here.`,
    (s) => `The bargain I see begins with the missing role: ${s.role}.`,
    (s) => `You have enough ambition; the counterweight is ${s.role}.`,
    (s) => `When a deck hesitates, I check ${s.role}; yours gives me a number to mind.`,
    (s) => `A touch more ${s.role} would make the rest of the list easier to sell.`,
    (s) => `The useful gap is not vague. It is ${s.role}.`,
    (s) => `I can stock the part of the plan labeled ${s.role}.`,
    (s) => `${s.role} would buy your stronger cards the time they want.`,
    (s) => `The count says ${s.role}; the counter agrees. ${s.summary}`,
  ]),
  upgrade_target: makeTemplates("observation-upgrade-target", [
    (s) => `${s.subject} is a fine place to spend improvement. ${s.summary}`,
    (s) => `The clean work is on ${s.subject}: ${s.metric}`,
    (s) => `Some cards want replacing; ${s.subject} wants sharpening.`,
    (s) => `I can see a higher version of ${s.subject} waiting at the edge.`,
    (s) => `${s.subject} has leverage enough to justify a careful touch.`,
    (s) => `The best upgrade target in the case is not hidden: ${s.subject}.`,
    (s) => `A measured change to ${s.subject} could move the whole account.`,
    (s) => `${s.subject} is already doing work; that makes the upgrade cleaner.`,
    (s) => `There is value in improving what the deck already trusts: ${s.subject}.`,
    (s) => `I would not scatter craft when ${s.subject} accepts it so neatly.`,
    (s) => `Your strongest line may be making ${s.subject} more exact.`,
    (s) => `The projection is tidy around ${s.subject}. ${s.metric}`,
  ]),
  curve_problem: makeTemplates("observation-curve-problem", [
    (s) => `The curve is asking for ${s.role}; ${s.summary}`,
    (s) => `The timing account points at ${s.role}. ${s.metric}`,
    (s) => `A deck with this shape wants earlier receipts. ${s.metric}`,
    (s) => `The timing problem is plain: more ${s.role}.`,
    (s) => `I would balance the account around ${s.role}. ${s.summary}`,
    (s) => `The opening shelf wants more ${s.role}. ${s.metric}`,
    (s) => `The curve points downward toward ${s.role}.`,
    (s) => `A merchant respects timing; this deck needs ${s.role}.`,
    (s) => `The curve read names ${s.role}, not a vague remedy.`,
    (s) => `A card at the right hour matters here. ${s.summary}`,
    (s) => `The curve wants a steadier step through ${s.role}.`,
    (s) => `The number I mind is early access. ${s.metric}`,
  ]),
  weak_card: makeTemplates("observation-weak-card", [
    (s) => `${s.subject} is occupying a slot more valuable than its work.`,
    (s) => `I would buy back the weakness around ${s.subject}. ${s.summary}`,
    (s) => `Not every card is guilty; ${s.subject} is simply overmatched.`,
    (s) => `The deck can breathe if ${s.subject} leaves the ledger.`,
    (s) => `${s.subject} looks like the cleanest place to reduce drag.`,
    (s) => `A warm bargain sometimes means removing the cold card: ${s.subject}.`,
    (s) => `Your list has better customers than ${s.subject} for that slot.`,
    (s) => `I see no shame in selling off ${s.subject} at the right counter.`,
    (s) => `The easiest improvement may be subtraction, starting with ${s.subject}.`,
    (s) => `${s.subject} is where the deck pays rent without getting service.`,
    (s) => `A purge is useful when the target is this specific: ${s.subject}.`,
    (s) => `The account tightens if ${s.subject} stops drawing from it.`,
  ]),
  dreamsign_gap: makeTemplates("observation-dreamsign-gap", [
    (s) => `The passive side of the deck wants ${s.theme}. ${s.summary}`,
    (s) => `A Dreamsign could cover the quiet gap marked ${s.theme}.`,
    (_s) => `Your cards ask for support between turns, not only in hand.`,
    (s) => `The missing piece may be a sign, and the sign points at ${s.theme}.`,
    (s) => `A held blessing would smooth this account around ${s.theme}.`,
    (s) => `I would look beyond the deck box for this need: ${s.theme}.`,
    (s) => `The counter has Dreamsign stock that answers ${s.theme}.`,
    (_s) => `Some bargains sit beside the deck rather than inside it.`,
    (s) => `${s.theme} is a quiet need, but quiet needs still charge interest.`,
    (s) => `The list could use a standing term for ${s.theme}.`,
    (s) => `A Dreamsign is the cleanest receipt for ${s.theme}.`,
    (s) => `This is not a card-slot problem alone; ${s.theme} wants a sign.`,
  ]),
};

export const OFFER_FRAMING_TEMPLATES: Readonly<
  Record<MerchantRewardFamily, readonly DialogueTemplate<OfferSlots>[]>
> = {
  cardGrant: makeTemplates("offer-card-grant", [
    (s) => `${s.offerLabel} is ${s.rewardTitle}: ${s.rewardSummary}`,
    (s) => `For ${s.offerLabel}, I put a fitting card on the counter: ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} answers with cardboard, specifically ${s.rewardTitle}.`,
    (s) => `The card shelf offers ${s.rewardTitle} as ${s.offerLabel}.`,
    (s) => `${s.offerLabel} keeps the bargain concrete: ${s.rewardSummary}`,
    (s) => `If you want new stock, ${s.offerLabel} is ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} buys a card-shaped answer from the case: ${s.rewardTitle}.`,
    (s) => `I would name ${s.offerLabel} the ${s.rewardFamily} bargain: ${s.rewardTitle}.`,
  ]),
  dreamsign: makeTemplates("offer-dreamsign", [
    (s) => `${s.offerLabel} is a Dreamsign arrangement: ${s.rewardTitle}.`,
    (s) => `For ${s.offerLabel}, the useful thing sits beside the deck: ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} buys a standing term, ${s.rewardTitle}, not another hand card.`,
    (s) => `The sign case opens for ${s.offerLabel}: ${s.rewardSummary}`,
    (s) => `${s.offerLabel} answers quietly with ${s.rewardTitle}.`,
    (s) => `I can write ${s.offerLabel} as the Dreamsign bargain ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} is for the space between draws: ${s.rewardTitle}.`,
    (s) => `If you prefer a passive receipt, ${s.offerLabel} is ${s.rewardTitle}.`,
  ]),
  transfiguration: makeTemplates("offer-transfiguration", [
    (s) => `${s.offerLabel} changes what you already own: ${s.rewardTitle}.`,
    (s) => `For ${s.offerLabel}, ${s.rewardTitle} sharpens a deck entry instead of adding clutter.`,
    (s) => `${s.offerLabel} is craft work: ${s.rewardSummary}`,
    (s) => `The transfiguration bench names ${s.rewardTitle} for ${s.offerLabel}.`,
    (s) => `${s.offerLabel} keeps ${s.rewardTitle} with the same customer and improves the service.`,
    (s) => `If you want precision, ${s.offerLabel} is ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} spends on ${s.rewardTitle} rather than inventory.`,
    (s) => `I can make ${s.offerLabel} ${s.rewardTitle}, a cleaner version of your current plan.`,
  ]),
  duplicate: makeTemplates("offer-duplicate", [
    (s) => `${s.offerLabel} doubles down: ${s.rewardTitle}.`,
    (s) => `For ${s.offerLabel}, ${s.rewardTitle} copies the card the deck already values.`,
    (s) => `${s.offerLabel} says ${s.rewardTitle} is more of the proven piece.`,
    (s) => `The duplicate bargain is ${s.rewardTitle} under ${s.offerLabel}.`,
    (s) => `${s.offerLabel} increases supply with ${s.rewardTitle}.`,
    (s) => `If consistency is the price of comfort, ${s.offerLabel} is ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} buys ${s.rewardTitle} from the same strong line.`,
    (s) => `I can make ${s.offerLabel} ${s.rewardTitle}, a second copy of the trusted customer.`,
  ]),
  purge: makeTemplates("offer-purge", [
    (s) => `${s.offerLabel} improves the list by subtraction: ${s.rewardTitle}.`,
    (s) => `For ${s.offerLabel}, ${s.rewardTitle} takes a weak slot off your hands.`,
    (s) => `${s.offerLabel} is ${s.rewardTitle}, a clean sale of what is not earning its place.`,
    (s) => `The purge counter names ${s.rewardTitle} for ${s.offerLabel}.`,
    (s) => `${s.offerLabel} buys less drag through ${s.rewardTitle}.`,
    (s) => `If removal is the honest work, ${s.offerLabel} is ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} trims the account through ${s.rewardTitle}.`,
    (s) => `I can make ${s.offerLabel} ${s.rewardTitle}, where absence does the labor.`,
  ]),
  essence: makeTemplates("offer-essence", [
    (s) => `${s.offerLabel} deals in resources directly: ${s.rewardTitle}.`,
    (s) => `For ${s.offerLabel}, ${s.rewardTitle} adjusts the purse instead of the deck.`,
    (s) => `${s.offerLabel} keeps the terms liquid: ${s.rewardSummary}`,
    (s) => `The essence drawer is open for ${s.offerLabel}: ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} buys room to maneuver through ${s.rewardTitle}.`,
    (s) => `If you want flexibility, ${s.offerLabel} is ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} answers with ${s.rewardTitle}, clean and immediate.`,
    (s) => `I can make ${s.offerLabel} ${s.rewardTitle}, a resource bargain rather than card work.`,
  ]),
  other: makeTemplates("offer-other", [
    (s) => `${s.offerLabel} is specialized craft: ${s.rewardTitle}.`,
    (s) => `For ${s.offerLabel}, ${s.rewardTitle} alters the terms around a specific card.`,
    (s) => `${s.offerLabel} is ${s.rewardTitle}, exact work rather than broad stock.`,
    (s) => `The custom drawer names ${s.rewardTitle} for ${s.offerLabel}.`,
    (s) => `${s.offerLabel} uses ${s.rewardTitle}, a narrow tool for a narrow need.`,
    (s) => `If you want the tailored bargain, ${s.offerLabel} is ${s.rewardTitle}.`,
    (s) => `${s.offerLabel} answers with ${s.rewardTitle}, changing the rule on the receipt.`,
    (s) => `I can make ${s.offerLabel} ${s.rewardTitle}, the careful piece of craft.`,
  ]),
};

export const PRICE_FRAMING_TEMPLATES = makeTemplates<PriceSlots>("price", [
  (s) => `${s.offerLabel} is priced at ${s.price} essence.`,
  (s) => `The ledger asks ${s.price} essence for ${s.offerLabel}.`,
  (s) => `${s.offerLabel} costs ${s.price} essence; the value mark is ${s.valueEssence}.`,
  (s) => `I can hold ${s.offerLabel} for ${s.price} essence.`,
  (s) => `The counter price on ${s.offerLabel} is ${s.price} essence.`,
  (s) => `${s.offerLabel} is ${s.price} essence, counted cleanly.`,
  (s) => `For ${s.offerLabel}, the purse line reads ${s.price} essence.`,
  (s) => `${s.offerLabel} leaves my case for ${s.price} essence.`,
  (s) => `The bargain on ${s.offerLabel} is fixed at ${s.price} essence.`,
  (s) => `${s.offerLabel} carries a ${s.price}-essence tag.`,
  (s) => `I name ${s.price} essence for ${s.offerLabel}.`,
  (s) => `${s.offerLabel} is ${s.price} essence today.`,
  (s) => `The receipt would show ${s.price} essence for ${s.offerLabel}.`,
  (s) => `${s.offerLabel} asks ${s.price} essence from the purse.`,
]);

export const LOCKED_PRICE_FRAMING_TEMPLATES = makeTemplates<PriceSlots>(
  "locked-price",
  [
    (s) => `${s.offerLabel} is marked at ${s.price} essence, but your purse is short.`,
    (s) => `The ledger names ${s.price} essence for ${s.offerLabel}; it cannot be paid yet.`,
    (s) => `${s.offerLabel} stays unavailable until you can cover ${s.price} essence.`,
    (s) => `I can name ${s.price} essence for ${s.offerLabel}, but not collect it from this purse.`,
    (s) => `The counter holds ${s.offerLabel} back; ${s.price} essence is more than you carry.`,
    (s) => `${s.offerLabel} is locked behind a ${s.price}-essence purse line.`,
    (s) => `Short purse, clear math: ${s.offerLabel} needs ${s.price} essence before it can move.`,
    (s) => `${s.offerLabel} remains only a quote at ${s.price} essence for now.`,
    (s) => `The price on ${s.offerLabel} is ${s.price} essence, and the purse cannot meet it yet.`,
    (s) => `I cannot release ${s.offerLabel}; the shortfall stands at a ${s.price}-essence price.`,
    (s) => `${s.offerLabel} is not payable yet, though the tag reads ${s.price} essence.`,
    (s) => `The bargain is unavailable until ${s.price} essence is in hand for ${s.offerLabel}.`,
  ],
);

export const WALK_AWAY_TEMPLATES = makeTemplates<ReactionSlots>("walk-away", [
  () => "Walking away is a clean choice; unsold goods keep no grudge.",
  () => "You may leave the counter with your purse and your deck unchanged.",
  () => "A bargain refused is still information bought cheaply.",
  () => "If neither price fits the hour, keep your essence warm.",
  () => "The road remains open if the counter does not call to you.",
  () => "No debt follows a closed hand.",
  () => "I charge nothing for knowing what you will not buy.",
  () => "The best purchase may be patience.",
  () => "You can pass, and I will close the case politely.",
  () => "Some stock is right and still not right now.",
  () => "Your walk-away price is always honored here.",
  () => "Keep the purse if the deck prefers certainty.",
]);

export const ACCEPT_REACTION_TEMPLATES = makeTemplates<ReactionSlots>(
  "accept-reaction",
  [
    () => "Done. I wrap the bargain before the dream changes its mind.",
    () => "Accepted, counted, and written warm in the ledger.",
    () => "A tidy purchase. The deck should feel the change at once.",
    () => "Good trade. I like a customer who knows the needed shelf.",
    () => "Then the receipt is yours and the counter is clear.",
    () => "We have terms. I will make the work exact.",
    () => "Bought and witnessed; the inventory has already adjusted.",
    () => "A clean acceptance makes a clean transformation.",
    () => "The bargain takes. Spend it well.",
    () => "I accept your acceptance, which is the pleasant part of commerce.",
    () => "The price is paid and the useful thing is yours.",
    () => "There. The dream records the sale in warm ink.",
  ],
);

export const DECLINE_REACTION_TEMPLATES = makeTemplates<ReactionSlots>(
  "decline-reaction",
  [
    () => "Declined, then. I fold the cloth without complaint.",
    () => "No sale today; the inventory will not sulk.",
    () => "A closed purse is sometimes the clever purse.",
    () => "Then keep your essence and your present shape.",
    () => "The counter closes cleanly, as all fair counters should.",
    () => "I will not chase you down the road with a price tag.",
    () => "Refusal is also a kind of taste.",
    () => "Very well. The goods return to their quiet places.",
    () => "No bargain binds what you decline.",
    () => "The ledger leaves this page blank and warm.",
    () => "Then the deck keeps its current account.",
    () => "A pass is accepted as neatly as a purchase.",
  ],
);

function hashIndex(parts: readonly string[], length: number): number {
  const digest = sha256(parts.join("\u001f")).slice(0, 12);
  return Number.parseInt(digest, 16) % length;
}

function selectTemplate<Slots>(
  bank: readonly DialogueTemplate<Slots>[],
  parts: readonly string[],
  usedTemplateIds: Set<string>,
): DialogueTemplate<Slots> {
  const start = hashIndex(parts, bank.length);
  for (let offset = 0; offset < bank.length; offset += 1) {
    const template = bank[(start + offset) % bank.length];
    if (!usedTemplateIds.has(template.id)) {
      usedTemplateIds.add(template.id);
      return template;
    }
  }
  throw new Error("Dream Merchant dialogue template bank exhausted");
}

function roleForNeed(need: MerchantNeed): string {
  if (need.observation.roleLabel !== undefined) return need.observation.roleLabel;
  if ("role" in need && need.role !== undefined) return ROLE_LABELS[need.role];
  return need.label;
}

function themeForNeed(need: MerchantNeed): string {
  if (need.observation.theme !== undefined) return need.observation.theme;
  if ("support" in need && "theme" in need.support) return need.support.theme;
  if ("themeId" in need && need.themeId !== undefined) return need.themeId;
  return need.label;
}

function subjectForNeed(need: MerchantNeed): string {
  if (need.observation.subject !== undefined) return need.observation.subject;
  if (need.needType === "card") {
    return need.references[0]?.displayName ?? need.label;
  }
  return need.label;
}

function metricForNeed(need: MerchantNeed): string {
  const metric = need.observation.metric;
  if (metric === undefined) return need.observation.summary;
  if (metric.from !== undefined || metric.to !== undefined) {
    const from = metric.from ?? "?";
    const to = metric.to ?? "?";
    return `${metric.label}: ${from} to ${to}`;
  }
  if (metric.value !== undefined) return `${metric.label}: ${metric.value}`;
  return metric.label;
}

function observationSlots(need: MerchantNeed): ObservationSlots {
  return {
    subject: subjectForNeed(need),
    theme: themeForNeed(need),
    role: roleForNeed(need),
    summary: need.observation.summary,
    metric: metricForNeed(need),
  };
}

function offerLabel(offer: MerchantOffer): string {
  return `offer ${offer.offerId}`;
}

function offerSlots(
  offer: MerchantOffer,
  rewardFamily: MerchantRewardFamily,
): OfferSlots {
  return {
    offerLabel: offerLabel(offer),
    rewardTitle: offer.reward.title,
    rewardSummary: offer.reward.summary,
    rewardFamily: FAMILY_LABELS[rewardFamily],
    builderId: offer.rewardBuilderId,
  };
}

function priceSlots(offer: MerchantOffer): PriceSlots {
  return {
    offerLabel: offerLabel(offer),
    price: offer.price,
    valueEssence: offer.priceDetail.valueEssence,
    locked: offer.locked,
  };
}

function reactionSlots(offers: readonly MerchantOffer[]): ReactionSlots {
  return {
    firstOfferLabel: offers[0] === undefined ? "offer A" : offerLabel(offers[0]),
    secondOfferLabel: offers[1] === undefined ? "offer B" : offerLabel(offers[1]),
  };
}

function beat(input: {
  id: string;
  template: { id: string };
  kind: MerchantDialogueBeat["kind"];
  phase: MerchantDialogueBeat["phase"];
  text: string;
  offer?: MerchantOffer;
  need?: MerchantNeed;
  rewardFamily?: MerchantRewardFamily;
}): MerchantDialogueBeat {
  return {
    id: input.id,
    templateId: input.template.id,
    kind: input.kind,
    phase: input.phase,
    text: input.text,
    ...(input.offer === undefined
      ? {}
      : {
          offerId: input.offer.offerId,
          rewardBuilderId: input.offer.rewardBuilderId,
          price: input.offer.price,
        }),
    ...(input.need === undefined ? {} : { needId: input.need.needId }),
    ...(input.rewardFamily === undefined
      ? {}
      : { rewardFamily: input.rewardFamily }),
  };
}

export function merchantRewardFamilyFor(
  builderId: MerchantRewardBuilderId,
): MerchantRewardFamily {
  return BUILDER_FAMILY[builderId];
}

export function renderMerchantDialogue(
  input: RenderMerchantDialogueInput,
): readonly MerchantDialogueBeat[] {
  const { context, needs, offers } = input;
  const needsById = new Map(needs.map((need) => [need.needId, need]));
  const usedTemplateIds = new Set<string>();
  const beats: MerchantDialogueBeat[] = [];
  const seedParts = [context.questSeed, context.site.id, context.site.type];
  const sharedReactionSlots = reactionSlots(offers);

  const greeting = selectTemplate(
    GREETING_TEMPLATES,
    [...seedParts, "greeting"],
    usedTemplateIds,
  );
  beats.push(
    beat({
      id: "greeting",
      template: greeting,
      kind: "greeting",
      phase: "pre_offer",
      text: greeting.render(sharedReactionSlots),
    }),
  );

  for (const offer of offers) {
    const need = needsById.get(offer.needId);
    if (need === undefined) {
      throw new Error(
        `Dream Merchant dialogue cannot reference unknown need ${offer.needId}`,
      );
    }
    const observation = selectTemplate(
      OBSERVATION_TEMPLATES[need.needKind],
      [...seedParts, "observation", offer.offerId, need.needId],
      usedTemplateIds,
    );
    beats.push(
      beat({
        id: `observation:${offer.offerId}:${need.needId}`,
        template: observation,
        kind: "observation",
        phase: "pre_offer",
        text: observation.render(observationSlots(need)),
        offer,
        need,
      }),
    );
  }

  for (const offer of offers) {
    const rewardFamily = merchantRewardFamilyFor(offer.rewardBuilderId);
    const offerTemplate = selectTemplate(
      OFFER_FRAMING_TEMPLATES[rewardFamily],
      [...seedParts, "offer", offer.offerId, offer.needId, offer.rewardBuilderId],
      usedTemplateIds,
    );
    beats.push(
      beat({
        id: `offer:${offer.offerId}`,
        template: offerTemplate,
        kind: "offer_framing",
        phase: "pre_offer",
        text: offerTemplate.render(offerSlots(offer, rewardFamily)),
        offer,
        rewardFamily,
      }),
    );
  }

  for (const offer of offers) {
    const priceBank = offer.locked
      ? LOCKED_PRICE_FRAMING_TEMPLATES
      : PRICE_FRAMING_TEMPLATES;
    const priceTemplate = selectTemplate(
      priceBank,
      [
        ...seedParts,
        offer.locked ? "locked-price" : "price",
        offer.offerId,
        String(offer.price),
      ],
      usedTemplateIds,
    );
    beats.push(
      beat({
        id: `price:${offer.offerId}`,
        template: priceTemplate,
        kind: "price_framing",
        phase: "pre_offer",
        text: priceTemplate.render(priceSlots(offer)),
        offer,
        rewardFamily: merchantRewardFamilyFor(offer.rewardBuilderId),
      }),
    );
  }

  const walkAway = selectTemplate(
    WALK_AWAY_TEMPLATES,
    [...seedParts, "walk-away"],
    usedTemplateIds,
  );
  beats.push(
    beat({
      id: "walk-away",
      template: walkAway,
      kind: "walk_away",
      phase: "pre_offer",
      text: walkAway.render(sharedReactionSlots),
    }),
  );

  const accept = selectTemplate(
    ACCEPT_REACTION_TEMPLATES,
    [...seedParts, "accept"],
    usedTemplateIds,
  );
  beats.push(
    beat({
      id: "accept-reaction",
      template: accept,
      kind: "accept_reaction",
      phase: "accept_reaction",
      text: accept.render(sharedReactionSlots),
    }),
  );

  const decline = selectTemplate(
    DECLINE_REACTION_TEMPLATES,
    [...seedParts, "decline"],
    usedTemplateIds,
  );
  beats.push(
    beat({
      id: "decline-reaction",
      template: decline,
      kind: "decline_reaction",
      phase: "decline_reaction",
      text: decline.render(sharedReactionSlots),
    }),
  );

  return beats;
}
