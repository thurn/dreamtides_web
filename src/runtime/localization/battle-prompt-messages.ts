import { meaning, tx, type LocalizedString } from "@trox/runtime";
import type { BuiltInBattlePromptRef } from "../../data/dreamwell-prompts";

/** Presentation-owned copy for a stable built-in battle prompt identity. */
export function builtInBattlePromptMessage(
  ref: BuiltInBattlePromptRef,
): LocalizedString {
  switch (ref.prompt) {
    case "discover-character":
      return tx(
        "Discover a character",
        "[battle] Reusable prompt title for choosing one Character card to discover during battle.",
      );
    case "confirm-yes":
      return tx(
        "Yes",
        "[battle] Affirmative option in a battle confirmation prompt.",
      );
    case "confirm-skip":
      return tx(
        meaning("battle-confirm-skip", "Skip"),
        "[battle] Option that declines a battle confirmation prompt.",
      );
    case "generic":
      return tx(
        "Choose an option",
        "[battle] Safe title for an imported battle prompt whose specific title is unknown.",
      );
    case "generic-subtitle":
      return tx(
        "Choose an available option to continue.",
        "[battle] Safe instruction for an imported battle prompt whose specific instructions are unknown.",
      );
    case "generic-option":
      return tx(
        "Choose this option",
        "[battle] Safe option label for an imported battle prompt whose specific option meaning is unknown.",
      );
    case "switch-side":
      return ref.side === "enemy"
        ? tx(
            "Switch to the Opponent side to resolve this choice.",
            "[battle] Polite battle status shown when the pending choice belongs to the opposing side controlled by the local user.",
          )
        : tx(
            "Switch to the Player side to resolve this choice.",
            "[battle] Polite battle status shown when the pending choice belongs to the player side controlled by the local user.",
          );
  }
}
