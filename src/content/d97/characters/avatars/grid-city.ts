// Grid City Avatars: street clothes: a long-coated fixer, a hooded mechanic,
// a pink-mohawked runner and a buttoned courier.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const VRAKMOTH_SPRITE = characterSprite({
  id: character("81dda305-849e-49ae-a9b2-19dfd32e260c"),
  avatarId: avatar("86026206-1b11-4f38-a24e-fd3c697f5353"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "gray"] },
    { sheet: sheet("hair_curtains_long"), colors: ["black"] },
    { sheet: sheet("facial_eyepatch_left"), colors: ["black"] },
    { sheet: sheet("torso_clothes_longsleeve2_cardigan"), colors: ["black"] },
    { sheet: sheet("legs_formal"), colors: ["black"] },
    { sheet: sheet("feet_shoes_revised"), colors: ["black"] },
  ],
});

const CORVATH_SPRITE = characterSprite({
  id: character("5d0ce1d5-726c-47e0-a6c3-fe4b7ce9ec9b"),
  avatarId: avatar("b8c1b0ab-0fe6-47d6-b576-0c2231aeb81e"),
  body: "male",
  skin: "taupe",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["taupe", "brown"] },
    { sheet: sheet("hair_curly_short"), colors: ["dark_gray"] },
    { sheet: sheet("torso_clothes_tshirt"), colors: ["gray"] },
    { sheet: sheet("torso_aprons_overalls"), colors: ["white"] },
    { sheet: sheet("legs_pants"), colors: ["gray"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["white"] },
  ],
});

const TESSA_SPRITE = characterSprite({
  id: character("f045208d-0eb8-4c96-96f4-632deec4d161"),
  avatarId: avatar("ba973428-6d90-4847-b779-cb7e25a5ac84"),
  body: "female",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["light", "purple"] },
    { sheet: sheet("hair_longhawk"), colors: ["pink"] },
    { sheet: sheet("torso_clothes_tshirt"), colors: ["black"] },
    { sheet: sheet("legs_leggings"), colors: ["purple"] },
    { sheet: sheet("feet_boots_revised"), colors: ["black"] },
  ],
});

const ZEVA_SPRITE = characterSprite({
  id: character("ca0c1c17-d194-478e-a2c2-2b5dd45143a0"),
  avatarId: avatar("4d5e3933-7dd6-406b-922d-dd78acfa044a"),
  body: "female",
  skin: "brown",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["brown", "brown"] },
    { sheet: sheet("hair_bob_side_part"), colors: ["navy"] },
    { sheet: sheet("torso_clothes_longsleeve2_buttoned"), colors: ["tan"] },
    { sheet: sheet("legs_pants2"), colors: ["charcoal"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["black"] },
  ],
});

export const GRID_CITY_AVATAR_SPRITES = [VRAKMOTH_SPRITE, CORVATH_SPRITE, TESSA_SPRITE, ZEVA_SPRITE];
