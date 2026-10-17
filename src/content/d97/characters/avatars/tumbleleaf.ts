// Tumbleleaf Village Avatars: rustic village cloth, a barbarian king in a
// gold crown and a hoplite in gold bronze.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const GRATH_SPRITE = characterSprite({
  id: character("9bbccf8f-19c6-4568-ad78-c68e410f6b38"),
  avatarId: avatar("94e7c651-25e9-4a62-9de4-eaf5ba20542c"),
  body: "male",
  skin: "amber",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["amber", "brown"] },
    { sheet: sheet("hair_long_messy"), colors: ["dark_brown"] },
    { sheet: sheet("beards_beard"), colors: ["dark_brown"] },
    { sheet: sheet("torso_clothes_sleeveless2"), colors: ["forest"] },
    { sheet: sheet("arms_bracers"), colors: ["bronze"] },
    { sheet: sheet("legs_pants"), colors: ["brown"] },
    { sheet: sheet("feet_boots_fold"), colors: ["walnut"] },
  ],
});

const RADULF_SPRITE = characterSprite({
  id: character("10d44f70-f58e-4b63-a216-034517e0e32b"),
  avatarId: avatar("3ebaba62-9000-429d-b203-2a5a9724389a"),
  body: "muscular",
  skin: "olive",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["olive", "gray"] },
    { sheet: sheet("hair_plain"), colors: ["gray"] },
    { sheet: sheet("beards_trimmed"), colors: ["gray"] },
    { sheet: sheet("hat_formal_crown"), colors: ["crown_gold"] },
    { sheet: sheet("shoulders_legion"), colors: ["gold"] },
    { sheet: sheet("neck_necklace_beaded_large"), colors: ["gold"] },
    { sheet: sheet("arms_bracers"), colors: ["gold"] },
    { sheet: sheet("legs_skirts_legion"), colors: ["maroon"] },
    { sheet: sheet("feet_sandals"), colors: ["leather"] },
  ],
});

const DEMETRIOS_SPRITE = characterSprite({
  id: character("6392ec6a-50f4-4951-ba37-b733cb22327b"),
  avatarId: avatar("2c53b1b9-9291-4bba-8d3a-f40b545c8f3c"),
  body: "male",
  skin: "olive",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["olive", "brown"] },
    { sheet: sheet("hat_helmet_maximus"), colors: ["gold"] },
    { sheet: sheet("hat_accessory_plumage"), colors: ["red"] },
    { sheet: sheet("torso_armour_plate"), colors: ["gold"] },
    { sheet: sheet("arms_armour"), colors: ["gold"] },
    { sheet: sheet("cape_solid"), colors: ["red"] },
    { sheet: sheet("legs_skirts_legion"), colors: ["red"] },
    { sheet: sheet("feet_sandals"), colors: ["leather"] },
  ],
});

export const TUMBLELEAF_AVATAR_SPRITES = [GRATH_SPRITE, RADULF_SPRITE, DEMETRIOS_SPRITE];
