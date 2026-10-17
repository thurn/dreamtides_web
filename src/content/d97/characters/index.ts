// The D97 character sprite catalog: every recipe the dream catalog and the
// player's Avatars draw. The development recipes (`./development.ts`) join it
// only in development builds (src/d97/development-content.ts) and in
// workspace preparation (scripts/d97/link-characters.ts).

import { FIRST_DREAM_CHARACTER_SPRITES } from "./3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import { AVATAR_CHARACTER_SPRITES } from "./avatars";
import type { CharacterSprite } from "./schema";

export const D97_CHARACTER_SPRITES: readonly CharacterSprite[] = [...AVATAR_CHARACTER_SPRITES, ...FIRST_DREAM_CHARACTER_SPRITES];
