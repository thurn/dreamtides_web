// Every Avatar's character sprite recipe, grouped by home dream.

import { FARPOINT_AVATAR_SPRITES } from "./farpoint";
import { FROSTFORGE_AVATAR_SPRITES } from "./frostforge";
import { GRID_CITY_AVATAR_SPRITES } from "./grid-city";
import { HOPES_END_AVATAR_SPRITES } from "./hopes-end";
import { PHARAOHS_GATE_AVATAR_SPRITES } from "./pharaohs-gate";
import { RUST_EXPANSE_AVATAR_SPRITES } from "./rust-expanse";
import { TSUKIREN_AVATAR_SPRITES } from "./tsukiren";
import { TUMBLELEAF_AVATAR_SPRITES } from "./tumbleleaf";
import { WILDERVEIL_AVATAR_SPRITES } from "./wilderveil";
import { WINTERWAKE_AVATAR_SPRITES } from "./winterwake";
import type { CharacterSprite } from "../schema";

export const AVATAR_CHARACTER_SPRITES: readonly CharacterSprite[] = [
  ...TUMBLELEAF_AVATAR_SPRITES,
  ...PHARAOHS_GATE_AVATAR_SPRITES,
  ...WINTERWAKE_AVATAR_SPRITES,
  ...FROSTFORGE_AVATAR_SPRITES,
  ...HOPES_END_AVATAR_SPRITES,
  ...TSUKIREN_AVATAR_SPRITES,
  ...WILDERVEIL_AVATAR_SPRITES,
  ...RUST_EXPANSE_AVATAR_SPRITES,
  ...FARPOINT_AVATAR_SPRITES,
  ...GRID_CITY_AVATAR_SPRITES,
];
