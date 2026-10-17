// Pharaoh's Gate Avatars: desert linen, gold collars, a sun-red bun and a
// hooded tomb-walker.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const SELD_RAKOR_SPRITE = characterSprite({
  id: character("04f13342-9547-4c92-a2c7-82a2f5c07f1a"),
  avatarId: avatar("c72cfd7b-408b-47f6-adf1-1e486a7e20d3"),
  body: "male",
  skin: "brown",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["brown", "blue"] },
    { sheet: sheet("hair_buzzcut"), colors: ["black"] },
    { sheet: sheet("beards_5oclock_shadow"), colors: ["black"] },
    { sheet: sheet("hat_headband_thick"), colors: ["white"] },
    { sheet: sheet("torso_clothes_sleeveless1"), colors: ["tan"] },
    { sheet: sheet("legs_shorts"), colors: ["white"] },
    { sheet: sheet("feet_sandals"), colors: ["leather"] },
  ],
});

const SERAVETH_SPRITE = characterSprite({
  id: character("2e02cc9d-d444-4df7-933d-b1a182865c5a"),
  avatarId: avatar("6488452d-4e9e-466c-96df-716d4ec646b1"),
  body: "female",
  skin: "bronze",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["bronze", "brown"] },
    { sheet: sheet("hair_bob"), colors: ["black"] },
    { sheet: sheet("hat_formal_tiara"), colors: ["tiara_gold"] },
    { sheet: sheet("dress_sash"), colors: ["white"] },
    { sheet: sheet("neck_necklace_beaded_large"), colors: ["gold"] },
    { sheet: sheet("feet_sandals"), colors: ["tan"] },
  ],
});

const VAELA_SPRITE = characterSprite({
  id: character("e12f93c6-8033-4b31-b6e7-402eedfe566c"),
  avatarId: avatar("60bd584b-5bc8-4ee7-8a98-cbb304eb71ab"),
  body: "female",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["light", "blue"] },
    { sheet: sheet("hair_bangs_bun"), colors: ["red"] },
    { sheet: sheet("torso_clothes_sleeveless2"), colors: ["black"] },
    { sheet: sheet("wrists_cuffs"), colors: ["yellow"] },
    { sheet: sheet("legs_skirts_slit"), colors: ["maroon"] },
    { sheet: sheet("feet_sandals"), colors: ["black"] },
  ],
});

const VETHRAN_SPRITE = characterSprite({
  id: character("515ba04f-a88c-413b-98e8-6863c11d8e3c"),
  avatarId: avatar("f0f5449e-01c2-4635-bce1-76b179fc2108"),
  body: "male",
  skin: "taupe",
  parts: [
    { sheet: sheet("heads_human_male_gaunt"), colors: ["taupe", "blue"] },
    { sheet: sheet("hat_hood_cloth"), colors: ["charcoal"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["charcoal"] },
    { sheet: sheet("shoulders_mantal"), colors: ["tan"] },
    { sheet: sheet("neck_gem_emerald"), colors: ["blue"] },
    { sheet: sheet("legs_skirts_plain"), colors: ["charcoal"] },
    { sheet: sheet("feet_sandals"), colors: ["walnut"] },
  ],
});

export const PHARAOHS_GATE_AVATAR_SPRITES = [SELD_RAKOR_SPRITE, SERAVETH_SPRITE, VAELA_SPRITE, VETHRAN_SPRITE];
