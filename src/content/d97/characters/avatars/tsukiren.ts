// Tsukiren Avatars: kimono and armor: a topknotted swordsman, a horned
// ronin in mail and a shield-bearing guard.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const TENSHO_SPRITE = characterSprite({
  id: character("e0ccbef9-068e-4ce8-9734-eaee914422dd"),
  avatarId: avatar("bf72adff-7d74-4be8-9b93-1db7ba13a1db"),
  body: "muscular",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "brown"] },
    { sheet: sheet("hair_topknot_long"), colors: ["black"] },
    { sheet: sheet("shoulders_mantal"), colors: ["tan"] },
    { sheet: sheet("belt_obi"), colors: ["black"] },
    { sheet: sheet("legs_widepants"), colors: ["red"] },
    { sheet: sheet("feet_socks_tabi"), colors: ["white"] },
    { sheet: sheet("feet_sandals"), colors: ["walnut"] },
  ],
});

const ELDRIK_SPRITE = characterSprite({
  id: character("5a86a7fb-24f7-4a3e-ab48-7f4d9f486993"),
  avatarId: avatar("bfc40414-5264-41bf-86e1-a0f41ee4f5b5"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "blue"] },
    { sheet: sheet("hat_helmet_horned"), colors: ["iron"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["charcoal"] },
    { sheet: sheet("torso_chainmail"), colors: ["steel"] },
    { sheet: sheet("arms_gloves"), colors: ["iron"] },
    { sheet: sheet("legs_pants"), colors: ["charcoal"] },
    { sheet: sheet("feet_boots_basic"), colors: ["black"] },
  ],
});

const VALDREN_SPRITE = characterSprite({
  id: character("cbeda075-cae9-4689-a5f3-92db18e89818"),
  avatarId: avatar("91d4c3b5-fd63-480b-9ed5-979109a227bb"),
  body: "male",
  skin: "brown",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["brown", "brown"] },
    { sheet: sheet("hair_flat_top_straight"), colors: ["black"] },
    { sheet: sheet("torso_armour_plate"), colors: ["steel"] },
    { sheet: sheet("legs_armour"), colors: ["steel"] },
    { sheet: sheet("feet_armour"), colors: ["steel"] },
    { sheet: sheet("shield_heater_revised_wood"), colors: ["walnut"] },
    { sheet: sheet("shield_heater_revised_paint"), colors: ["blue"] },
    { sheet: sheet("shield_heater_revised_trim"), colors: ["gold"] },
  ],
});

export const TSUKIREN_AVATAR_SPRITES = [TENSHO_SPRITE, ELDRIK_SPRITE, VALDREN_SPRITE];
