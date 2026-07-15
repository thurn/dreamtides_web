import type { BattleCommand } from "../debug/commands";
import type {
  BattleDeckCardDefinition,
  BattleInit,
} from "../types";

const PREVIEW_FRONT_CHARACTER_COUNT = 4;
const PREVIEW_BACK_CHARACTER_COUNT = 5;
const PREVIEW_VOID_CHARACTER_COUNT = 5;
const PREVIEW_CHARACTER_COUNT =
  PREVIEW_FRONT_CHARACTER_COUNT +
  PREVIEW_BACK_CHARACTER_COUNT +
  PREVIEW_VOID_CHARACTER_COUNT;

/**
 * Builds the single debug edit that replaces both battlefields with a dense
 * staggered-grid preview and adds five cards to each void. Definitions stay
 * UUID-identified and cycle when a deck contains fewer than fourteen distinct
 * character definitions.
 */
export function createFillBattlefieldPreviewCommand(
  init: BattleInit,
  createdAtMs: number,
): BattleCommand | null {
  const playerCharacters = characterDefinitions(init.playerDeckOrder);
  const enemyCharacters = characterDefinitions(init.enemyDeckDefinition);
  const sharedCharacters = [...playerCharacters, ...enemyCharacters];
  if (sharedCharacters.length === 0) {
    return null;
  }

  return {
    id: "DEBUG_EDIT",
    edit: {
      kind: "FILL_BATTLEFIELD_PREVIEW",
      definitions: {
        player: previewDefinitions(
          playerCharacters.length > 0 ? playerCharacters : sharedCharacters,
        ),
        enemy: previewDefinitions(
          enemyCharacters.length > 0 ? enemyCharacters : sharedCharacters,
        ),
      },
      createdAtMs,
    },
    sourceSurface: "debug-menu",
  };
}

function characterDefinitions(
  definitions: readonly BattleDeckCardDefinition[],
): BattleDeckCardDefinition[] {
  return definitions.filter(
    (definition) => definition.battleCardKind === "character",
  );
}

function previewDefinitions(
  definitions: readonly BattleDeckCardDefinition[],
): BattleDeckCardDefinition[] {
  return Array.from(
    { length: PREVIEW_CHARACTER_COUNT },
    (_, index) => definitions[index % definitions.length],
  );
}
