// The D97 character sprite catalog: every recipe workspace preparation
// resolves and the overworld can draw.

import { AVATAR_CHARACTER_SPRITES } from "./avatars";
import { DEV_KNIGHT, DEV_VILLAGER, DEV_WOLF } from "./development";
import type { CharacterSprite } from "./schema";

export const D97_CHARACTER_SPRITES: readonly CharacterSprite[] = [DEV_KNIGHT, DEV_VILLAGER, DEV_WOLF, ...AVATAR_CHARACTER_SPRITES];
