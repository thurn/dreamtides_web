// The D97 character sprite recipe (decision P15): a character's look as
// layers of Universal LPC Spritesheet Character Generator sheets, stacked at
// runtime in the generator's z-order. A recipe names a body type, a skin
// palette and parts; each part names a sheet definition by its file name and
// the palette (or variant) for each of its color slots. Workspace
// preparation resolves recipes against the local generator into
// `public/d97/characters/manifest.json` (scripts/d97/link-characters.ts).

import type { AvatarId, D97CharacterId, LpcSheetKey } from "../../../types/identifiers";

/** The generator's body types. */
export type LpcBodyType = "male" | "female" | "muscular" | "teen" | "pregnant" | "child";

export interface CharacterSpritePart {
  readonly sheet: LpcSheetKey;
  /**
   * One palette or variant name per color slot, in slot order. A slot left
   * out keeps the sheet's base colors; a skin slot follows the recipe's skin.
   */
  readonly colors?: readonly string[];
}

export interface CharacterSprite {
  readonly id: D97CharacterId;
  readonly body: LpcBodyType;
  /** The skin palette (the generator's body material). */
  readonly skin: string;
  /** Parts drawn over the body; the generator's z-order decides stacking. */
  readonly parts: readonly CharacterSpritePart[];
  /** The Avatar this recipe draws, for Avatar characters and the player. */
  readonly avatarId?: AvatarId;
}

/** Declare a character sprite recipe. */
export function characterSprite(recipe: CharacterSprite): CharacterSprite {
  return recipe;
}
