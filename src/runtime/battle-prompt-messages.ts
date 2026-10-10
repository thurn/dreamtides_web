import type { BuiltInBattlePromptRef } from "../data/dreamwell-prompts";
import type { PromptRole } from "../engine/prompts/types";

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
 * Heading for an engine prompt the player answers, by its role. The engine
 * names every prompt by a structured role and never builds display strings
 * (D35); the battle screen reads its copy here.
 */
export function enginePromptHeading(role: PromptRole): string {
  switch (role) {
    case "target":
      return "Choose a target";
    case "discardToHandLimit":
      return "Discard down to your hand limit";
    case "playRoute":
      return "Choose how to play this card";
    case "chooseX":
      return "Choose the value of X";
    case "chooseOne":
      return "Choose one";
    case "chooseCost":
      return "Choose a cost to pay";
    case "optionalCost":
      return "Pay the optional cost?";
    case "abandonCost":
      return "Choose characters to abandon";
    case "discardCost":
    case "discard":
      return "Choose cards to discard";
    case "revealCost":
      return "Choose cards to reveal";
    case "banishCost":
      return "Choose cards in your void to banish";
    case "offeringCost":
      return "Choose cards in your hand to banish";
    case "foresee":
      return "Arrange the top of your deck";
    case "youMay":
      return "Do you want to do this?";
    case "preventUnlessPays":
      return "Pay to stop the prevention?";
  }
}

/** One answer button of an engine choice prompt. */
export type EnginePromptOptionCopy =
  | { readonly kind: "yes" }
  | { readonly kind: "no" }
  | { readonly kind: "pay"; readonly energy: number }
  | { readonly kind: "decline" }
  | { readonly kind: "mode"; readonly index: number }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "continue" };

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
    case "mode":
      return `Option ${String(option.index + 1)}`;
    case "number":
      return String(option.value);
    case "continue":
      return "Continue";
  }
}
