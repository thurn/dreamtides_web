// Winterwake Fjords Avatars: fur-trimmed leather, a legionary's crest and
// a cloaked seer of the fjord mists.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const YVETH_CORAVEL_SPRITE = characterSprite({
  id: character("890f8690-a5c5-4ed5-b486-e70e551bc35b"),
  avatarId: avatar("fe2510d9-bfee-4c35-97f9-30e0cd2e2851"),
  body: "female",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["light", "blue"] },
    { sheet: sheet("hair_braid"), colors: ["blonde"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["bluegray"] },
    { sheet: sheet("torso_armour_leather"), colors: ["brown", "bronze"] },
    { sheet: sheet("legs_pants2"), colors: ["slate"] },
    { sheet: sheet("feet_boots_fold"), colors: ["brown"] },
  ],
});

const DRUSUS_CALVUS_SPRITE = characterSprite({
  id: character("eeca0e50-08a0-4044-a3ae-a111a3752712"),
  avatarId: avatar("bdd3a3a7-242c-4d2b-8071-ebe56891a340"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "blue"] },
    { sheet: sheet("hat_helmet_legion"), colors: ["steel"] },
    { sheet: sheet("hat_accessory_crest_centurion"), colors: ["steel"] },
    { sheet: sheet("torso_armour_legion"), colors: ["steel"] },
    { sheet: sheet("shoulders_legion"), colors: ["steel"] },
    { sheet: sheet("arms_bracers"), colors: ["steel"] },
    { sheet: sheet("legs_skirts_legion"), colors: ["red"] },
    { sheet: sheet("feet_sandals"), colors: ["brown"] },
  ],
});

const EDRAN_SPRITE = characterSprite({
  id: character("6fd6132b-28b5-4f6d-84cd-40854d2559eb"),
  avatarId: avatar("5e28154d-770a-4b84-8aac-9de44f5d7d02"),
  body: "male",
  skin: "olive",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["olive", "green"] },
    { sheet: sheet("hat_hood_cloth"), colors: ["teal"] },
    { sheet: sheet("cape_tattered"), colors: ["teal"] },
    { sheet: sheet("neck_capeclip"), colors: ["teal", "silver"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["black"] },
    { sheet: sheet("legs_pants"), colors: ["black"] },
    { sheet: sheet("feet_boots_basic"), colors: ["black"] },
  ],
});

export const WINTERWAKE_AVATAR_SPRITES = [YVETH_CORAVEL_SPRITE, DRUSUS_CALVUS_SPRITE, EDRAN_SPRITE];
