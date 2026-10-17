// Wilderveil Avatars: forest leathers, a masked hood and an orc in fur and
// iron.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const OSSIAN_SPRITE = characterSprite({
  id: character("632439cb-b650-4e39-b0e8-2b8e02089634"),
  avatarId: avatar("b9bf6d4b-907c-4750-b51c-811aff29de59"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "green"] },
    { sheet: sheet("hair_bedhead"), colors: ["chestnut"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["brown"] },
    { sheet: sheet("torso_armour_leather"), colors: ["forest", "bronze"] },
    { sheet: sheet("legs_pants"), colors: ["walnut"] },
    { sheet: sheet("feet_boots_fold"), colors: ["brown"] },
  ],
});

const CAEDRYN_SPRITE = characterSprite({
  id: character("9eb05998-2e5b-462e-ba3a-568e6cd0f2ea"),
  avatarId: avatar("9d64a4a2-3dc7-456e-9eb2-5fe3a48883c4"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "blue"] },
    { sheet: sheet("hat_hood_cloth"), colors: ["black"] },
    { sheet: sheet("facial_mask_plain"), colors: ["black"] },
    { sheet: sheet("cape_solid"), colors: ["black"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["charcoal"] },
    { sheet: sheet("shoulders_pauldrons"), colors: ["black"] },
    { sheet: sheet("legs_pants"), colors: ["black"] },
    { sheet: sheet("feet_boots_revised"), colors: ["black"] },
  ],
});

const KRAGG_SPRITE = characterSprite({
  id: character("a1bd999c-016a-4612-8c89-241fcd77e7fb"),
  avatarId: avatar("16b579fe-c15b-4df6-8262-d45ce44732ae"),
  body: "muscular",
  skin: "green",
  parts: [
    { sheet: sheet("heads_orc_male"), colors: ["green"] },
    { sheet: sheet("hat_helmet_barbarian_nasal"), colors: ["iron", "leather"] },
    { sheet: sheet("shoulders_pauldrons"), colors: ["leather"] },
    { sheet: sheet("bauldron"), colors: ["leather"] },
    { sheet: sheet("arms_bracers"), colors: ["iron"] },
    { sheet: sheet("legs_pants"), colors: ["brown"] },
    { sheet: sheet("feet_boots_basic"), colors: ["brown"] },
  ],
});

export const WILDERVEIL_AVATAR_SPRITES = [OSSIAN_SPRITE, CAEDRYN_SPRITE, KRAGG_SPRITE];
