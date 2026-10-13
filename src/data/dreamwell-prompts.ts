export type BuiltInBattlePromptRef =
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "discover-character";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "confirm-yes";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "confirm-skip";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "generic";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "generic-subtitle";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "generic-option";
    }
  | {
      readonly kind: "built-in-battle-prompt";
      readonly prompt: "switch-side";
      readonly side: "player" | "enemy";
    };

export function builtInBattlePromptRef(
  prompt: Exclude<BuiltInBattlePromptRef["prompt"], "switch-side">,
): BuiltInBattlePromptRef;
export function builtInBattlePromptRef(
  prompt: "switch-side",
  side: "player" | "enemy",
): BuiltInBattlePromptRef;
export function builtInBattlePromptRef(
  prompt: BuiltInBattlePromptRef["prompt"],
  side?: "player" | "enemy",
): BuiltInBattlePromptRef {
  if (prompt === "switch-side") {
    if (side !== "player" && side !== "enemy") {
      throw new TypeError("A switch-side battle prompt requires a valid side");
    }
    return { kind: "built-in-battle-prompt", prompt, side };
  }
  if (side !== undefined) {
    throw new TypeError("Only a switch-side battle prompt accepts a side");
  }
  return { kind: "built-in-battle-prompt", prompt };
}
