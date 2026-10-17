// The D97 character sprite catalog: every recipe workspace preparation
// resolves and the overworld can draw.

import { FIRST_DREAM_CHARACTER_SPRITES } from "./3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import { AVATAR_CHARACTER_SPRITES } from "./avatars";
import { DEV_KNIGHT, DEV_VILLAGER, DEV_WOLF } from "./development";
import type { CharacterSprite } from "./schema";

export const D97_CHARACTER_SPRITES: readonly CharacterSprite[] = [DEV_KNIGHT, DEV_VILLAGER, DEV_WOLF, ...AVATAR_CHARACTER_SPRITES, ...FIRST_DREAM_CHARACTER_SPRITES];
