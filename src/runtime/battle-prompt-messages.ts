import type { BuiltInBattlePromptRef } from "../data/dreamwell-prompts";
import type { ArrangeDestination, PromptKind, PromptRole } from "../engine/prompts/types";

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
        return "Choose how to play it";
      case "chooseX":
        return "Choose the value of X";
      case "chooseOne":
        return "Choose one";
      case "chooseCost":
        return "Choose a cost to pay";
      case "optionalCost":
        return "Pay the optional cost?";
      case "abandonCost":
        return cards("abandon", "character", "characters");
      case "discardCost":
      case "discard":
        return cards("discard");
      case "revealCost":
        return cards("reveal");
      case "banishCost":
        return cards("banish", "void card", "void cards");
      case "offeringCost":
        return cards("choose", "offering", "offerings");
      case "foresee":
        return "Arrange the top of your deck";
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
  | { readonly kind: "route"; readonly index: number };

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
  | { readonly kind: "reclaim"; readonly name: string }
  | {
      readonly kind: "emblem";
      readonly emblem: "avatar" | "dreamsign";
      /** The emblem's name, when the journey content names it. */
      readonly name: string | null;
      /** The ability's index, and how many abilities the emblem offers now. */
      readonly index: number;
      readonly count: number;
    }
  | { readonly kind: "browseVoid" }
  | { readonly kind: "cancel" };

/** Label of one option of an ability chooser. */
export function engineAbilityOptionLabel(option: EngineAbilityOption): string {
  switch (option.kind) {
    case "ability":
      return `Ability ${String(option.index + 1)}`;
    case "reclaim":
      return `Reclaim ${option.name}`;
    case "emblem": {
      const name = option.name ?? (option.emblem === "avatar" ? "Your Avatar" : "Your Dreamsign");
      return option.count > 1 ? `${name}: Ability ${String(option.index + 1)}` : name;
    }
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
  return role === "chooseX" ? "X" : "Value";
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
  | { readonly kind: "autoAnswered"; readonly prompt: PromptKind; readonly sourceName: string | null }
  | { readonly kind: "capacityReached"; readonly missing: number };

/** Copy of a brief battle notice. */
export function engineBattleNoticeCopy(notice: EngineBattleNotice): { readonly title: string; readonly message: string } {
  if (notice.kind === "capacityReached") {
    return {
      title: "Back Rank Full",
      message:
        notice.missing === 1
          ? "One character could not enter your full back rank."
          : `${String(notice.missing)} characters could not enter your full back rank.`,
    };
  }
  const what = notice.prompt === "chooseTargets" ? "target" : notice.prompt === "chooseCards" ? "card" : "choice";
  return {
    title: "Chosen for You",
    message:
      notice.sourceName === null
        ? `There was only one possible ${what}, so it was chosen automatically.`
        : `${notice.sourceName} had only one possible ${what}, so it was chosen automatically.`,
  };
}
