// Frostforge Avatars: forge-hall wool and leather, a white-haired smith and a
// star-hatted rune wizard.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const KASANE_SPRITE = characterSprite({
  id: character("8a77324e-c80c-4a5f-ba70-3c1940ca4d37"),
  avatarId: avatar("2b7e921d-0cd7-4c20-a415-9e7eede7b477"),
  body: "female",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["light", "gray"] },
    { sheet: sheet("hair_xlong"), colors: ["white"] },
    { sheet: sheet("torso_clothes_longsleeve2_scoop"), colors: ["gray"] },
    { sheet: sheet("neck_scarf"), colors: ["sky"] },
    { sheet: sheet("legs_pants2"), colors: ["bluegray"] },
    { sheet: sheet("feet_boots_rim"), colors: ["white"] },
  ],
});

const RAEL_SPRITE = characterSprite({
  id: character("de59dfd8-20c7-4e55-a668-49dfae06954e"),
  avatarId: avatar("84e7020c-7384-4cc3-a20f-ab05f03cc375"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "orange"] },
    { sheet: sheet("hair_spiked_porcupine"), colors: ["orange"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["maroon"] },
    { sheet: sheet("torso_armour_leather"), colors: ["charcoal", "iron"] },
    { sheet: sheet("legs_pants"), colors: ["charcoal"] },
    { sheet: sheet("feet_boots_revised"), colors: ["black"] },
  ],
});

const OVANEL_SPRITE = characterSprite({
  id: character("2bdfffa4-ad23-4e86-ab2d-7c8850bc0553"),
  avatarId: avatar("f6208407-c4e9-42ac-b533-346704f5e39e"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male_elderly"), colors: ["light", "blue"] },
    { sheet: sheet("hair_long"), colors: ["white"] },
    { sheet: sheet("beards_winter"), colors: ["white"] },
    { sheet: sheet("hat_magic_celestial"), colors: ["purple"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["purple"] },
    { sheet: sheet("legs_skirts_plain"), colors: ["purple"] },
    { sheet: sheet("feet_slippers"), colors: ["maroon"] },
  ],
});

export const FROSTFORGE_AVATAR_SPRITES = [KASANE_SPRITE, RAEL_SPRITE, OVANEL_SPRITE];
