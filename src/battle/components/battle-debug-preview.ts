import type { BattleCommand } from "../debug/commands";
import type {
  BattleDeckCardDefinition,
  BattleInit,
  BattleSide,
} from "../types";

const PREVIEW_VOID_CHARACTER_COUNT = 5;

export type BattlefieldPreviewInPlayCount = 9 | 19;
export type BattlefieldPreviewInPlayCounts = Readonly<
  Record<BattleSide, BattlefieldPreviewInPlayCount>
>;

const STANDARD_IN_PLAY_COUNTS: BattlefieldPreviewInPlayCounts = {
  player: 19,
  enemy: 19,
};

/**
 * Builds the single debug edit that replaces both battlefields with a dense
 * staggered-grid preview and adds five cards to each void. Definitions stay
 * UUID-identified and cycle when a deck contains fewer distinct character
 * definitions than the requested preview needs.
 */
export function createFillBattlefieldPreviewCommand(
  init: BattleInit,
  createdAtMs: number,
  inPlayCounts: BattlefieldPreviewInPlayCounts = STANDARD_IN_PLAY_COUNTS,
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
          inPlayCounts.player + PREVIEW_VOID_CHARACTER_COUNT,
        ),
        enemy: previewDefinitions(
          enemyCharacters.length > 0 ? enemyCharacters : sharedCharacters,
          inPlayCounts.enemy + PREVIEW_VOID_CHARACTER_COUNT,
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
  count: number,
): BattleDeckCardDefinition[] {
  return Array.from(
    { length: count },
    (_, index) => definitions[index % definitions.length],
  );
}
