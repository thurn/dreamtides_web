// Hope's End Avatars: crowns, robes and wings: a crowned black knight, a
// winged herald and a gold-collared priest-king.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const KORRAX_SPRITE = characterSprite({
  id: character("be7770b0-be3e-40f7-867c-78bf97b2648a"),
  avatarId: avatar("6029be40-75b9-4c07-912f-9718b6c5c747"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "gray"] },
    { sheet: sheet("hat_helmet_greathelm"), colors: ["iron"] },
    { sheet: sheet("hat_formal_crown"), colors: ["crown_gold"] },
    { sheet: sheet("torso_armour_plate"), colors: ["iron"] },
    { sheet: sheet("arms_armour"), colors: ["iron"] },
    { sheet: sheet("cape_solid"), colors: ["black"] },
    { sheet: sheet("legs_armour"), colors: ["iron"] },
    { sheet: sheet("feet_armour"), colors: ["iron"] },
  ],
});

const KALETH_SPRITE = characterSprite({
  id: character("2ad7fe87-5901-4ba9-9f2b-5bd88a776d01"),
  avatarId: avatar("3c4773e4-f8e1-4686-86cb-b407a42489d4"),
  body: "female",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["light", "blue"] },
    { sheet: sheet("hair_long"), colors: ["platinum"] },
    { sheet: sheet("wings_feathered"), colors: ["blonde"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["white"] },
    { sheet: sheet("legs_skirt_straight"), colors: ["gray"] },
    { sheet: sheet("feet_sandals"), colors: ["white"] },
  ],
});

const SENEMHET_SPRITE = characterSprite({
  id: character("741e962f-7242-4396-8cec-4572a01f1847"),
  avatarId: avatar("1cc5a88a-134f-42f7-a0ae-95ace44b3745"),
  body: "male",
  skin: "bronze",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["bronze", "brown"] },
    { sheet: sheet("hat_formal_crown"), colors: ["crown_gold"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["black"] },
    { sheet: sheet("shoulders_mantal"), colors: ["yellow"] },
    { sheet: sheet("neck_necklace_beaded_large"), colors: ["gold"] },
    { sheet: sheet("legs_skirts_plain"), colors: ["black"] },
    { sheet: sheet("feet_sandals"), colors: ["yellow"] },
  ],
});

export const HOPES_END_AVATAR_SPRITES = [KORRAX_SPRITE, KALETH_SPRITE, SENEMHET_SPRITE];
