import type { BuiltInBattlePromptRef } from "../data/dreamwell-prompts";
import type { Cost, Keyword } from "../engine/dsl/types";
import type { EngineEvent } from "../engine/events";
import type { ArrangeDestination, PromptKind, PromptRole } from "../engine/prompts/types";
import type { AbilitySource, InstanceId, Side } from "../engine/state/ids";
import type { Expiry } from "../engine/state/types";

/** Presentation-owned copy for a stable built-in battle prompt identity. */
export function builtInBattlePromptMessage(
  ref: BuiltInBattlePromptRef,
): string {
  switch (ref.prompt) {
    case "discover-character":
      return "Discover a character";
    case "confirm-yes":
      return "Yes";
    case "confirm-skip":
      return "Skip";
    case "generic":
      return "Choose an option";
    case "generic-subtitle":
      return "Choose an available option to continue.";
    case "generic-option":
      return "Choose this option";
    case "switch-side":
      return ref.side === "enemy"
        ? "Switch to the Opponent side to resolve this choice."
        : "Switch to the Player side to resolve this choice.";
  }
}

/**
 * What an engine prompt's heading says: its kind and role, its bounds, and
 * the name of the card that asks (or `null` for a rules prompt or a source
 * the player cannot identify).
 */
export interface EnginePromptHeadingInput {
  readonly kind: PromptKind;
  readonly role: PromptRole;
  readonly min: number;
  readonly max: number;
  readonly sourceName: string | null;
}

/** The pending engine prompt's heading: a title and the line that names its source. */
export interface EnginePromptHeading {
  readonly title: string;
  readonly detail: string | null;
}

function countOf(min: number, max: number, one: string, many: string): string {
  if (max <= 1) return min === 0 ? `up to one ${one}` : `a${/^[aeiou]/u.test(one) ? "n" : ""} ${one}`;
  if (min === max) return `${String(max)} ${many}`;
  return min === 0 ? `up to ${String(max)} ${many}` : `${String(min)} to ${String(max)} ${many}`;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Heading for an engine prompt the player answers, from the templates for its
 * role and kind. Titles stay short enough for one line beside Cancel on a
 * phone, so the banner never reaches the opponent's status display. The engine names every prompt by a structured role and never
 * builds display strings (D35); the battle screen reads its copy here.
 */
export function enginePromptHeading(input: EnginePromptHeadingInput): EnginePromptHeading {
  const { min, max } = input;
  const cards = (verb: string, one = "card", many = "cards", where = "") =>
    sentence(`${verb} ${countOf(min, max, one, many)}${where}`);
  const title = ((): string => {
    switch (input.role) {
      case "target":
        return input.kind === "chooseTargets" ? cards("choose", "target", "targets") : cards("choose");
      case "discardToHandLimit":
        return cards("discard");
      case "playRoute":
      case "voidRoute":
        return "Choose how to play it";
      case "chooseX":
      case "discoverCost":
        return "Choose the value of X";
      case "chooseOne":
        return "Choose one";
      case "choosePlayer":
        return "Choose a player";
      case "chooseCost":
        return "Choose a cost to pay";
      case "optionalPayment":
        return "Pay the energy cost?";
      case "optionalCost":
        return "Pay the optional cost?";
      case "abandonCost":
      case "abandon":
        return cards("abandon", "character", "characters");
      case "discardCost":
      case "discard":
        return cards("discard");
      case "discardChosen":
        return "Discard an opponent card";
      case "banishChosen":
        return "Banish an opponent card";
      case "revealCost":
        return cards("reveal");
      case "banishCost":
        return cards("banish", "void card", "void cards");
      case "offeringCost":
        return cards("choose", "offering", "offerings");
      case "foresee":
        return "Arrange the top of your deck";
      case "discover":
        return cards("discover");
      case "lookAtTop":
        return cards("draw");
      case "chooseAmong":
        return cards("put", "card", "cards", " into your hand");
      case "chooseFromOpponentHand":
        return cards("take", "card", "cards", " from their hand");
      case "shuffleInto":
        return cards("shuffle", "card", "cards", " into your deck");
      case "putInDeck":
        return "Place the cards you looked at";
      case "youMay":
        return "Do you want to do this?";
      case "preventUnlessPays":
        return "Pay to save your card?";
    }
  })();
  const detail =
    input.sourceName !== null
      ? `From ${input.sourceName}`
      : input.role === "discardToHandLimit"
        ? "Your hand is over its limit."
        : null;
  return { title, detail };
}

/** One answer button of an engine choice prompt. */
export type EnginePromptOptionCopy =
  | { readonly kind: "yes" }
  | { readonly kind: "no" }
  | { readonly kind: "pay"; readonly energy: number }
  | { readonly kind: "decline" }
  /** The empty answer of an "up to" prompt answered on the board. */
  | { readonly kind: "skip" }
  /** A mode, with its text when the card's own text spells out each mode. */
  | { readonly kind: "mode"; readonly index: number; readonly text: string | null }
  /** A play route of the playRoute prompt, in the engine's route order: from hand, then as an Offering. */
  | { readonly kind: "route"; readonly index: number }
  /** A play route of the voidRoute prompt, in the engine's route order: by a play permission, then by Reclaim. */
  | { readonly kind: "voidRoute"; readonly index: number }
  /** A player relative to the answering controller. */
  | { readonly kind: "player"; readonly index: number };

/** Label of one answer button of an engine choice prompt. */
export function enginePromptOptionLabel(option: EnginePromptOptionCopy): string {
  switch (option.kind) {
    case "yes":
      return "Yes";
    case "no":
      return "No";
    case "pay":
      return `Pay ${String(option.energy)} ●`;
    case "decline":
      return "Decline";
    case "skip":
      return "Skip";
    case "mode":
      return option.text ?? `Option ${String(option.index + 1)}`;
    case "route":
      return option.index === 0 ? "Pay Its Cost" : "Play as an Offering";
    case "voidRoute":
      return option.index === 0 ? "Pay Its Cost" : "Reclaim";
    case "player":
      return option.index === 0 ? "You" : "Opponent";
  }
}

/**
 * The text of each mode of a "Choose one: A; or B." ability, read from the
 * card's rendered text, or `null` when that text does not spell out exactly
 * `count` modes (the buttons then fall back to numbered options).
 */
export function enginePromptModeTexts(renderedText: string, count: number): string[] | null {
  const marker = /choose one:/iu.exec(renderedText);
  if (marker === null) return null;
  const [body = ""] = renderedText.slice(marker.index + marker[0].length).split(/\.(?:\s|$)/u);
  const modes = body
    .split(/;\s*or\s+|,\s*or\s+|;\s*|\s+or\s+/u)
    .map((mode) => mode.trim())
    .filter((mode) => mode.length > 0);
  return modes.length === count ? modes.map(sentence) : null;
}

/** The heading of an ability chooser the player opened on a card or emblem. */
export const ENGINE_ABILITY_CHOOSER_TITLE = "Choose an ability";

/** One option of an ability chooser the player opened on a card, the void, or the status display. */
export type EngineAbilityOption =
  | { readonly kind: "ability"; readonly index: number }
  /** Play a card from the void, by a play permission or Reclaim. */
  | { readonly kind: "playFromVoid"; readonly name: string }
  | {
      readonly kind: "emblem";
      readonly emblem: "avatar" | "dreamsign";
      /** The emblem's name, when the journey content names it. */
      readonly name: string | null;
      /** The ability's index, and how many abilities the emblem offers now. */
      readonly index: number;
      readonly count: number;
    }
  | {
      readonly kind: "payToEnd";
      /** Energy the payment costs. */
      readonly cost: number;
      /** The name of the effect's source card or emblem, when the player can name it. */
      readonly name: string | null;
    }
  | { readonly kind: "browseVoid" }
  | { readonly kind: "cancel" };

/** Label of one option of an ability chooser. */
export function engineAbilityOptionLabel(option: EngineAbilityOption): string {
  switch (option.kind) {
    case "ability":
      return `Ability ${String(option.index + 1)}`;
    case "playFromVoid":
      return `Play ${option.name}`;
    case "emblem": {
      const name = option.name ?? (option.emblem === "avatar" ? "Your Avatar" : "Your Dreamsign");
      return option.count > 1 ? `${name}: Ability ${String(option.index + 1)}` : name;
    }
    case "payToEnd":
      return `End ${option.name ?? "the Effect"} (${String(option.cost)} Energy)`;
    case "browseVoid":
      return "View Your Void";
    case "cancel":
      return "Cancel";
  }
}

/** Copy of the human's response window (P1): the opponent's card on the stack and the choice to respond or pass. */
export function engineResponseWindowHeading(stackCardName: string | null): EnginePromptHeading {
  return {
    title: "Respond or Pass",
    detail: stackCardName === null ? "Your opponent's card is waiting to resolve." : `${stackCardName} is waiting to resolve.`,
  };
}

/** The visible label of a chooseNumber prompt's number picker: the variable it sets. */
export function engineNumberPickerLabel(role: PromptRole): string {
  return role === "chooseX" || role === "discoverCost" ? "X" : "Value";
}

/** One destination of an arrange prompt: its lane heading and the compact label of each card's destination control. */
export function engineArrangeDestinationLabel(destination: ArrangeDestination): {
  readonly label: string;
  readonly shortLabel: string;
} {
  switch (destination) {
    case "top":
      return { label: "Top of Deck", shortLabel: "Top" };
    case "bottom":
      return { label: "Bottom of Deck", shortLabel: "Bottom" };
    case "void":
      return { label: "Void", shortLabel: "Void" };
    case "hand":
      return { label: "Hand", shortLabel: "Hand" };
  }
}

/** Labels of the number picker of a chooseNumber prompt. */
export const ENGINE_NUMBER_PICKER_COPY = {
  decrement: "Lower value",
  increment: "Higher value",
  submit: "Confirm",
} as const;

/** A brief notice about something the engine did on the player's behalf. */
export type EngineBattleNotice =
  /** A prompt with one legal answer answered itself; `role` names what the answer was for. */
  | {
      readonly kind: "autoAnswered";
      readonly prompt: PromptKind;
      readonly role: PromptRole;
      readonly sourceName: string | null;
    }
  | { readonly kind: "capacityReached"; readonly missing: number }
  /** An ability found nothing to target; `sourceName` names it when the player can identify it. */
  | { readonly kind: "noLegalTarget"; readonly sourceName: string | null };

/** Copy of a brief battle notice. */
export function engineBattleNoticeCopy(notice: EngineBattleNotice): { readonly title: string; readonly message: string } {
  if (notice.kind === "noLegalTarget") {
    return {
      title: "No Legal Target",
      message:
        notice.sourceName === null
          ? "An ability had nothing it could target, so it did nothing."
          : `${notice.sourceName} had nothing it could target, so it did nothing.`,
    };
  }
  if (notice.kind === "capacityReached") {
    return {
      title: "Back Rank Full",
      message:
        notice.missing === 1
          ? "One character could not enter your full back rank."
          : `${String(notice.missing)} characters could not enter your full back rank.`,
    };
  }
  const what = autoAnsweredChoice(notice.prompt, notice.role);
  return {
    title: "Chosen for You",
    message:
      notice.sourceName === null
        ? `There was only one ${what}, so it was chosen for you.`
        : `There was only one ${what} for ${notice.sourceName}, so it was chosen for you.`,
  };
}

/** What an automatically answered prompt had only one of, from what it was for. */
function autoAnsweredChoice(kind: PromptKind, role: PromptRole): string {
  switch (role) {
    case "target":
      return kind === "chooseTargets" ? "legal target" : "card you could choose";
    case "discardToHandLimit":
    case "discardCost":
    case "discard":
      return "card you could discard";
    case "discardChosen":
      return "card of theirs you could discard";
    case "banishChosen":
      return "card of theirs you could banish";
    case "playRoute":
    case "voidRoute":
      return "way to play it";
    case "chooseX":
    case "discoverCost":
      return "value of X you could choose";
    case "chooseOne":
      return "mode you could choose";
    case "choosePlayer":
      return "player you could choose";
    case "chooseCost":
    case "optionalCost":
      return "way to pay its cost";
    case "abandonCost":
    case "abandon":
      return "character you could abandon";
    case "revealCost":
      return "card you could reveal";
    case "banishCost":
      return "void card you could banish";
    case "offeringCost":
      return "offering you could choose";
    case "foresee":
      return "way to arrange the top of your deck";
    case "discover":
      return "card you could discover";
    case "lookAtTop":
      return "card you could draw";
    case "chooseAmong":
      return "card you could put into your hand";
    case "chooseFromOpponentHand":
      return "card you could take from their hand";
    case "shuffleInto":
      return "card you could shuffle into your deck";
    case "putInDeck":
      return "way to place the cards you looked at";
    case "youMay":
    case "optionalPayment":
    case "preventUnlessPays":
      return "answer you could give";
  }
}

/** The battle log's heading, empty state, and turn headings. */
export const ENGINE_BATTLE_LOG_COPY = {
  title: "Battle Log",
  subtitle: "What has happened this battle, newest last.",
  close: "Close battle log",
  empty: "Nothing has happened yet.",
  turn: (turnNumber: number, yours: boolean): string =>
    `Turn ${String(turnNumber)} · ${yours ? "Your Turn" : "Opponent's Turn"}`,
} as const;

const KEYWORD_NAMES: Readonly<Record<Keyword, string>> = {
  vengeful: "Vengeful",
  awakened: "Awakened",
  cannotBePrevented: "cannot be prevented",
  cannotBeTargeted: "cannot be targeted",
  veil: "Veil",
  reclaim: "Reclaim",
  offering: "Offering",
};

/** How long an effect lasts, as the player reads it; empty for a permanent change. */
function expiryPhrase(expiry: Expiry, human: Side): string {
  switch (expiry.at) {
    case "endOfTurn":
      return " until end of turn";
    case "turnStart":
      return expiry.side === human ? " until your next turn" : " until your opponent's next turn";
    case "nextDay":
      return " until the next Day";
    case "sourceLeavesPlay":
      return " while its source is in play";
    case "paid":
      return " until its price is paid";
    case "never":
      return "";
  }
}

/** One cost of a stated Reclaim cost ("Reclaim 0●"), as the player reads it. */
function costPhrase(cost: Cost): string {
  switch (cost.cost) {
    case "energy":
      return `${String(cost.amount)} energy`;
    case "energyX":
      return "X energy";
    case "exhaustSelf":
      return "exhaust it";
    case "abandon":
      return `abandon ${plural(cost.count, "character", "characters")}`;
    case "discard":
      return cost.count === "x" ? "discard X cards" : `discard ${plural(cost.count, "card", "cards")}`;
    case "counters":
      return `remove ${plural(cost.amount, "memory counter", "memory counters")}`;
    case "points":
      return `pay ${plural(cost.amount, "point", "points")}`;
    case "banishFromVoid":
      return `banish ${cost.count === "x" ? "X cards" : plural(cost.count, "card", "cards")} from your void`;
    case "banishFromHand":
      return `banish ${plural(cost.count, "other card", "other cards")} from your hand`;
    case "reveal":
      return `reveal ${plural(cost.count, "card", "cards")}`;
    case "choice":
      return cost.options.map((option) => option.map(costPhrase).join(" and ")).join(" or ");
    case "optional":
      return `optionally ${cost.costs.map(costPhrase).join(" and ")}`;
  }
}

/** A stated Reclaim cost after the keyword's name; empty when the gain states none. */
function reclaimCostPhrase(costs: readonly Cost[] | undefined): string {
  return costs === undefined ? "" : ` (cost: ${costs.length === 0 ? "nothing" : costs.map(costPhrase).join(", ")})`;
}

/** The cards a play permission naming no card covers: "one event", "characters". */
function permittedCards(status: Extract<EngineStatusCopy, { readonly kind: "playFrom" }>): string {
  const cards = status.cardType ?? "card";
  return status.next ? `one ${cards}` : `${cards}s`;
}

function signed(amount: number, unit: string): string {
  return `${amount < 0 ? "−" : "+"}${String(Math.abs(amount))} ${unit}`;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * A lasting status shown as an indicator on a card or beside a player's
 * status display, with what it is and how long it lasts.
 */
export type EngineStatusCopy =
  | { readonly kind: "spark"; readonly amount: number; readonly expiry: Expiry }
  | { readonly kind: "baseSpark"; readonly value: number; readonly expiry: Expiry }
  | { readonly kind: "allTypes"; readonly expiry: Expiry }
  | {
      readonly kind: "keyword";
      readonly keyword: Keyword;
      readonly gains: boolean;
      readonly expiry: Expiry;
      /** A gained Reclaim's stated cost ("gains reclaim 0●"), when its grant states one. */
      readonly reclaimCosts?: readonly Cost[];
    }
  | { readonly kind: "grantedKeyword"; readonly keyword: Keyword }
  | { readonly kind: "offering" }
  | { readonly kind: "reclaimed" }
  | { readonly kind: "ephemeral" }
  | { readonly kind: "created" }
  | { readonly kind: "triggersDisabled"; readonly expiry: Expiry }
  | { readonly kind: "temporary"; readonly expiry: Expiry }
  | { readonly kind: "payable"; readonly payer: Side; readonly cost: number }
  | { readonly kind: "returns"; readonly expiry: Expiry }
  | {
      readonly kind: "cost";
      readonly amount: number;
      readonly cardType: "character" | "event" | null;
      readonly next: boolean;
      readonly expiry: Expiry;
    }
  | { readonly kind: "delayedTrigger"; readonly once: boolean; readonly expiry: Expiry }
  /**
   * A play permission: a card that may be played from the void (`named`), or
   * cards of `cardType` a player may play from their void, one when `next`.
   */
  | {
      readonly kind: "playFrom";
      readonly named: boolean;
      readonly cardType: "character" | "event" | null;
      readonly next: boolean;
      readonly expiry: Expiry;
    }
  | { readonly kind: "avatarExhausted" };

/** The accessible name of a status indicator: the status and its duration, from `human`'s side. */
export function engineStatusLabel(status: EngineStatusCopy, human: Side): string {
  switch (status.kind) {
    case "spark":
      return `${signed(status.amount, "spark")}${expiryPhrase(status.expiry, human)}`;
    case "baseSpark":
      return `Base spark ${String(status.value)}${expiryPhrase(status.expiry, human)}`;
    case "allTypes":
      return `Has all character types${expiryPhrase(status.expiry, human)}`;
    case "keyword":
      return `${status.gains ? "Gains" : "Loses"} ${KEYWORD_NAMES[status.keyword]}${reclaimCostPhrase(status.reclaimCosts)}${expiryPhrase(status.expiry, human)}`;
    case "grantedKeyword":
      return status.keyword === "cannotBePrevented" || status.keyword === "cannotBeTargeted"
        ? sentence(KEYWORD_NAMES[status.keyword])
        : `Has ${KEYWORD_NAMES[status.keyword]}`;
    case "offering":
      return "Played by Offering: banished at the end of the turn";
    case "reclaimed":
      return "Played by Reclaim: banished instead of going anywhere else";
    case "ephemeral":
      return "Ephemeral: banished at the end of the turn while in hand";
    case "created":
      return "Created by an effect: ceases to exist instead of going to a deck, hand, void, or banishment";
    case "triggersDisabled":
      return `Triggered abilities do not trigger${expiryPhrase(status.expiry, human)}`;
    case "temporary":
      return `Ceases to exist${status.expiry.at === "never" ? " when its effect ends" : ` at the end of its effect${expiryPhrase(status.expiry, human)}`}`;
    case "payable":
      return status.payer === human
        ? `Affected until you pay ${String(status.cost)} energy`
        : `Affected until your opponent pays ${String(status.cost)} energy`;
    case "returns":
      return `A banished card returns to play${status.expiry.at === "never" ? "" : expiryPhrase(status.expiry, human).replace(/^ until/u, " at")}`;
    case "cost": {
      const cards = status.cardType === null ? "card" : status.cardType;
      const subject = status.next ? `The next ${cards} played` : `${sentence(cards)}s played`;
      const change = `${status.next ? "costs" : "cost"} ${String(Math.abs(status.amount))} energy ${status.amount < 0 ? "less" : "more"}`;
      return `${subject} ${change}${expiryPhrase(status.expiry, human)}`;
    }
    case "delayedTrigger":
      return `${status.once ? "A delayed ability is waiting" : "An ability triggers"}${expiryPhrase(status.expiry, human)}`;
    case "playFrom":
      return `${status.named ? "Can be played from the void" : `May play ${permittedCards(status)} from the void`}${expiryPhrase(status.expiry, human)}`;
    case "avatarExhausted":
      return "Avatar exhausted";
  }
}

/** Names what a battle log line mentions, resolved just before display. */
export interface EngineBattleLogWords {
  /** The side the log is written for. */
  readonly human: Side;
  /** A card's name, or `null` when the player cannot identify it. */
  readonly card: (instance: InstanceId | null) => string | null;
  /** A Dreamwell card's name, or `null`. */
  readonly dreamwell: (event: Extract<EngineEvent, { kind: "dreamwellDrawn" }>) => string | null;
}

/**
 * The battle log's plain-English line for an engine event as the player sees
 * it, or `null` for an event the log leaves out (bookkeeping, and changes
 * the board shows on its own, such as exhaustion and energy paid or
 * refreshed).
 */
export function engineBattleLogText(event: EngineEvent, words: EngineBattleLogWords): string | null {
  const { human } = words;
  const who = (side: Side) => (side === human ? "You" : "Your opponent");
  const whose = (side: Side) => (side === human ? "your" : "your opponent's");
  const card = (instance: InstanceId | null) => words.card(instance) ?? "A card";
  const named = (instance: InstanceId | null) => words.card(instance) ?? "a card";
  const source = (ability: AbilitySource | null): string =>
    ability === null
      ? "An ability"
      : typeof ability === "string"
        ? card(ability)
        : sentence(`${whose(ability.side)} ${ability.kind === "avatar" ? "Avatar" : "Dreamsign"}`);
  switch (event.kind) {
    case "abandoned":
      return `${who(event.side)} abandoned ${named(event.instance)}.`;
    case "abilityActivated":
      return `${who(event.side)} activated ${source(event.source).replace(/^Your/u, "your")}.`;
    case "avatarExhaustionChanged":
      return event.exhausted ? `${sentence(whose(event.side))} Avatar is exhausted.` : null;
    case "banished":
      return `${card(event.instance)} was banished.`;
    case "battleEnded":
      return event.result.kind === "draw"
        ? "The battle ended in a draw."
        : `${who(event.result.winner)} won the battle.`;
    case "blockersDesignated": {
      const count = Object.keys(event.blockers).length;
      return count === 0 ? null : `${who(event.side)} blocked with ${plural(count, "character", "characters")}.`;
    }
    case "capacityReached":
      return `${plural(event.missing, "character", "characters")} could not enter ${whose(event.side)} full back rank.`;
    case "cardCopied":
      return `${who(event.side)} copied ${named(event.original)}.`;
    case "cardCreated":
      // A copy on the stack is logged as copied (`cardCopied`).
      return event.zone === "stack" ? null : `${who(event.side)} created ${named(event.instance)}${event.zone === "hand" ? " in hand" : ""}.`;
    case "cardDiscovered":
      return `${who(event.side)} discovered ${named(event.instance)}.`;
    case "cardDrawn":
      return `${who(event.side)} drew ${named(event.instance)}.`;
    case "cardPlayed":
      return `${who(event.side)} played ${named(event.instance)}.`;
    case "cardsPlaced": {
      const where =
        event.to === "void"
          ? `into ${whose(event.side)} void`
          : `${event.to === "deckTop" ? "on top" : "on the bottom"} of ${whose(event.side)} deck`;
      return `${sentence(cardList(event.cards, words))} ${event.cards.length === 1 ? "was" : "were"} put ${where}.`;
    }
    case "cardTaken": {
      const holder = event.holder === human ? "your" : event.holder === event.side ? "their" : "your opponent's";
      const zone = event.from === "banished" ? "Banished zone" : event.from;
      return `${who(event.side)} put ${named(event.instance)} from ${holder} ${zone} into ${event.side === human ? "your" : "their"} hand.`;
    }
    case "ceasedToExist":
      // A copy leaving the stack as it resolves is no news.
      return event.from === "stack" ? null : `${card(event.instance)} ceased to exist.`;
    case "challengersDesignated":
      return event.challengers.length === 0
        ? null
        : `${who(event.side)} challenged with ${plural(event.challengers.length, "character", "characters")}.`;
    case "controlChanged":
      return `${who(event.to)} gained control of ${named(event.instance)}.`;
    case "countersChanged":
      return `${card(event.instance)} has ${plural(event.counters, "memory counter", "memory counters")}.`;
    case "discarded":
      return `${who(event.side)} discarded ${named(event.instance)}.`;
    case "dissolved":
      return `${card(event.instance)} was dissolved.`;
    case "dreamwellDrawn": {
      const name = words.dreamwell(event);
      return `${who(event.side)} drew ${name ?? "a Dreamwell card"} and gained ${plural(event.energyAdded, "energy", "energy")}.`;
    }
    case "effectStarted":
      return effectStartedText(event, human, card);
    case "energyChanged": {
      // Payments and the turn's refresh show on the energy display alone, and a Dreamwell card's line names the energy it adds.
      if (event.cause !== "effect") return null;
      const [amount, unit] = event.maxChange === 0 ? [event.change, "energy"] : [event.maxChange, "maximum energy"];
      if (amount === 0) return null;
      return `${who(event.side)} ${amount > 0 ? "gained" : "lost"} ${plural(Math.abs(amount), unit, unit)}.`;
    }
    case "eroded":
      return `${card(event.instance)} was eroded into ${whose(event.side)} void.`;
    case "fatigue":
      return `${who(event.side)} had no card to draw, so ${who(event.side === "player" ? "enemy" : "player").toLowerCase()} gained ${plural(event.points, "point", "points")}.`;
    case "figmentsMerged":
      return `${card(event.source)} merged into ${named(event.destination)}, which has ${String(event.spark)} spark.`;
    case "foresaw": {
      // Names the cards only when the player can identify every one of them; otherwise counts them.
      const list = (instances: readonly (InstanceId | null)[]) =>
        instances.every((instance) => words.card(instance) !== null)
          ? instances.map(named).join(", ")
          : plural(instances.length, "card", "cards");
      const moves = [
        ...(event.voided.length > 0 ? [`put ${list(event.voided)} into ${whose(event.side)} void`] : []),
        ...(event.kept.length > 0 ? [`kept ${list(event.kept)} on top`] : []),
      ];
      return `${who(event.side)} foresaw ${plural(event.kept.length + event.voided.length, "card", "cards")}: ${moves.join(" and ")}.`;
    }
    case "laneResolved": {
      if (event.blocker === null) {
        return event.scored > 0
          ? `${card(event.challenger)} challenged unblocked and scored ${plural(event.scored, "point", "points")}.`
          : `${card(event.challenger)} challenged unblocked.`;
      }
      if (event.winner === null) return `${card(event.challenger)} and ${named(event.blocker)} tied their challenge.`;
      return `${card(event.challenger)} (${String(event.challengerSpark)} spark) challenged ${named(event.blocker)} (${String(event.blockerSpark)} spark).`;
    }
    case "lookedAtTop": {
      const top = event.cards.length === 1 ? "card" : `${String(event.cards.length)} cards`;
      return `${who(event.side)} looked at the top ${top} of ${event.side === human ? "your" : "their"} deck.`;
    }
    case "loopEnded":
      return `${who(event.side)} stopped repeating after ${plural(event.iterations, "repetition", "repetitions")}.`;
    case "loopStarted":
      return event.count === "untilVictory"
        ? `${who(event.side)} chose to repeat until victory.`
        : `${who(event.side)} chose to repeat ${plural(event.count, "time", "times")}.`;
    case "materialized":
      return event.rematerialized ? `${card(event.instance)} rematerialized.` : `${card(event.instance)} entered play.`;
    case "noLegalTarget":
      return `${source(event.source)} had no legal target.`;
    case "payableEffectEnded":
      return event.paid ? `${who(event.payer)} paid to end an effect.` : null;
    case "payableEffectRegistered":
      return `${source(event.source)}: ${engineStatusLabel({ kind: "payable", payer: event.payer, cost: event.cost }, human).toLowerCase()}.`;
    case "pointsScored":
      if (event.cause === "challenge") return null;
      return event.amount < 0
        ? `${who(event.side)} lost ${plural(-event.amount, "point", "points")}.`
        : `${who(event.side)} gained ${plural(event.amount, "point", "points")}.`;
    case "prevented":
      return `${card(event.instance)} was prevented.`;
    case "repositioned":
      return event.swappedWith === null
        ? `${card(event.instance)} moved to the ${event.to.rank} rank.`
        : `${card(event.instance)} swapped places with ${named(event.swappedWith)}.`;
    case "returnedToHand":
      return `${card(event.instance)} returned to ${whose(event.side)} hand.`;
    case "revealed":
      // `side` is whose hand the cards were revealed from, which is not always who revealed them (an opponent's effect may reveal it).
      return `Revealed from ${whose(event.side)} hand: ${event.instances.map(named).join(", ")}.`;
    case "shuffledIntoDeck": {
      const deck = `${whose(event.side)} deck`;
      if (event.cards.length === 0) return `${sentence(deck)} was shuffled.`;
      return `${sentence(cardList(event.cards, words))} ${event.cards.length === 1 ? "was" : "were"} shuffled into ${deck}.`;
    }
    case "sparkGained":
      return `${card(event.instance)}: ${engineStatusLabel({ kind: "spark", amount: event.amount, expiry: event.expiry }, human)}.`;
    case "triggerResolved":
      return event.applied && event.source !== null ? `${source(event.source)}'s triggered ability resolved.` : null;
    case "turnStarted":
      return `${sentence(whose(event.side))} turn began${event.extra ? " (an extra turn)" : ""}.`;
    case "winConditionMet":
      return `${who(event.side)} met a condition to win the game.`;
    case "abilityResolved":
    case "effectEnded":
    case "enteredVoid":
    case "exhaustionChanged":
    case "feasibilityBounded":
    case "leftPlay":
    case "leftVoid":
    case "pendingAbility":
    case "phaseChanged":
    case "promptAutoAnswered":
    case "resolved":
    case "triggerQueued":
      return null;
  }
}

/** The cards a log line names: those the player can identify by name, then a count of the rest. */
function cardList(cards: readonly (InstanceId | null)[], words: EngineBattleLogWords): string {
  const names = cards.flatMap((instance) => {
    const name = words.card(instance);
    return name === null ? [] : [name];
  });
  const hidden = cards.length - names.length;
  const parts = [
    ...names,
    ...(hidden > 0 ? [names.length > 0 ? plural(hidden, "other card", "other cards") : hidden === 1 ? "a card" : plural(hidden, "card", "cards")] : []),
  ];
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1] ?? ""}` : (parts[0] ?? "");
}

function effectStartedText(
  event: Extract<EngineEvent, { kind: "effectStarted" }>,
  human: Side,
  card: (instance: InstanceId | null) => string,
): string | null {
  const { change, expiry } = event;
  const line = (subject: string, status: EngineStatusCopy) => `${subject}: ${engineStatusLabel(status, human)}.`;
  switch (change.kind) {
    case "spark":
      return line(card(change.instance), { kind: "spark", amount: change.amount, expiry });
    case "baseSpark":
      return line(card(change.instance), { kind: "baseSpark", value: change.value, expiry });
    case "allTypes":
      return line(card(change.instance), { kind: "allTypes", expiry });
    case "keyword":
      return line(card(change.instance), {
        kind: "keyword",
        keyword: change.keyword,
        gains: change.gains,
        expiry,
        ...(change.reclaimCosts === undefined ? {} : { reclaimCosts: change.reclaimCosts }),
      });
    case "disableTriggers":
      return line(card(change.instance), { kind: "triggersDisabled", expiry });
    case "temporary":
      return line(card(change.instance), { kind: "temporary", expiry });
    case "banishedUntil":
      return `${card(change.instance)} will return to play${expiry.at === "never" ? "" : expiryPhrase(expiry, human).replace(/^ until/u, " at")}.`;
    case "cost":
      return `${engineStatusLabel(
        { kind: "cost", amount: change.amount, cardType: change.filter.cardType ?? null, next: change.next, expiry },
        human,
      )} for ${change.player === human ? "you" : "your opponent"}.`;
    case "trigger":
      return `${engineStatusLabel({ kind: "delayedTrigger", once: change.once, expiry }, human)}.`;
    case "playFrom": {
      const status: EngineStatusCopy = { kind: "playFrom", named: change.instance !== null, cardType: change.filter.cardType ?? null, next: change.next, expiry };
      if (change.instance !== null) return line(card(change.instance), status);
      const mine = change.player === human;
      return `${mine ? "You" : "Your opponent"} may play ${permittedCards(status)} from ${mine ? "your" : "their"} void${expiryPhrase(expiry, human)}.`;
    }
    case "reclaimNotBanished":
      // Only a static ability makes this change, so no effect starts with it.
      return null;
  }
}
