// The first dream's residents, as sprite recipes (decision P15), written
// against its brief (`../dreams/3229d6c7-0700-4f37-9b07-921e3dccb8b6.md`):
// a brick hill town on a harvest evening that will not end. Country cloth in
// browns, tans and whites; flour, straw and sawdust. The guardian draws as
// its Avatar's own recipe (`./avatars/`).
//
// - Wenna Ashdown, the innkeeper: broad, brisk, floury-sleeved; counts
//   everything in barrels, time included.
// - Reeve Tobin Rook: old, upright, fond of rules about bells.
// - Hessa Mott: a young reaper, sharp, sunburnt, impatient with ceremony.
// - Pell the baker: cheerful about loaves that never finish rising.
// - Ambrose Finch: a fiddler forever tuning one string.
// - Dilly Sorrel: a child who always loses count at the same sheaf.
// - Widow Marrable: lays an extra place for whoever comes in from the dark.
// - Cobb: the bridge-keeper, who counts every crossing.
// - Garrow: a thresher who plays the way he works, in rhythm.
// - The Scarecrow: down off its pole; it does not explain itself.
// - Oswin Marl: the reeve's tithe clerk, who tallies a deck as he plays it.
// - Mother Yarrow: a hedge-witch amused by everything.
// - Aldo Hewitt: a woodcutter, blunt and fair.

import { parseD97CharacterId, parseLpcSheetKey } from "../../../types/identifiers";
import { characterSprite } from "./schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;

export const WENNA_ASHDOWN = characterSprite({
  id: character("40da29e9-e76a-49b5-b614-51a791c418d8"),
  body: "female",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["light", "brown"] },
    { sheet: sheet("hair_bangs_bun"), colors: ["chestnut"] },
    { sheet: sheet("torso_clothes_longsleeve2_scoop"), colors: ["white"] },
    { sheet: sheet("hat_headband_kerchief"), colors: ["white"] },
    { sheet: sheet("legs_skirts_plain"), colors: ["maroon"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["brown"] },
  ],
});

export const TOBIN_ROOK = characterSprite({
  id: character("af2eff5b-991f-4f3b-b634-645a4a3d6e05"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male_elderly"), colors: ["light", "gray"] },
    { sheet: sheet("hair_balding"), colors: ["white"] },
    { sheet: sheet("beards_trimmed"), colors: ["white"] },
    { sheet: sheet("torso_clothes_longsleeve2_buttoned"), colors: ["charcoal"] },
    { sheet: sheet("cape_solid"), colors: ["maroon"] },
    { sheet: sheet("legs_formal"), colors: ["charcoal"] },
    { sheet: sheet("feet_shoes_revised"), colors: ["black"] },
  ],
});

export const HESSA_MOTT = characterSprite({
  id: character("706af7e7-1e4e-4cf5-8657-04198ce5c541"),
  body: "female",
  skin: "amber",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["amber", "green"] },
    { sheet: sheet("hair_ponytail"), colors: ["sandy"] },
    { sheet: sheet("torso_clothes_shortsleeve"), colors: ["tan"] },
    { sheet: sheet("legs_pants"), colors: ["brown"] },
    { sheet: sheet("feet_boots_basic"), colors: ["walnut"] },
  ],
});

export const PELL = characterSprite({
  id: character("3749761d-0447-4406-8630-9ff1a561e3e8"),
  body: "female",
  skin: "olive",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["olive", "brown"] },
    { sheet: sheet("hair_bob"), colors: ["dark_brown"] },
    { sheet: sheet("hat_headband_kerchief"), colors: ["white"] },
    { sheet: sheet("torso_clothes_shortsleeve"), colors: ["white"] },
        { sheet: sheet("legs_skirts_plain"), colors: ["brown"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["walnut"] },
  ],
});

export const AMBROSE_FINCH = characterSprite({
  id: character("405dfff8-9339-47c5-8984-992d10c5ee65"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "blue"] },
    { sheet: sheet("hair_messy1"), colors: ["ginger"] },
    { sheet: sheet("torso_clothes_longsleeve2_buttoned"), colors: ["white"] },
    { sheet: sheet("torso_clothes_vest_open"), colors: ["forest"] },
    { sheet: sheet("legs_pants"), colors: ["navy"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["black"] },
  ],
});

export const DILLY_SORREL = characterSprite({
  id: character("157e72bf-c6fc-4cd6-8456-682cb4fea784"),
  body: "teen",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female_small"), colors: ["light", "blue"] },
    { sheet: sheet("hair_wavy"), colors: ["strawberry"] },
    { sheet: sheet("torso_clothes_shortsleeve"), colors: ["green"] },
    { sheet: sheet("legs_skirts_plain"), colors: ["tan"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["brown"] },
  ],
});

export const WIDOW_MARRABLE = characterSprite({
  id: character("fc5a8301-3b85-4ba2-a1bb-ffa93faa860b"),
  body: "female",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female_elderly"), colors: ["light", "gray"] },
    { sheet: sheet("hair_bangs_bun"), colors: ["white"] },
    { sheet: sheet("torso_clothes_longsleeve2"), colors: ["black"] },
    { sheet: sheet("hat_hood_cloth"), colors: ["charcoal"] },
    { sheet: sheet("legs_skirts_plain"), colors: ["charcoal"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["black"] },
  ],
});

export const COBB = characterSprite({
  id: character("b8755686-ecea-4778-b315-6e3ac07251f4"),
  body: "male",
  skin: "olive",
  parts: [
    { sheet: sheet("heads_human_male_plump"), colors: ["olive", "brown"] },
    { sheet: sheet("hair_plain"), colors: ["gray"] },
    { sheet: sheet("beards_bigstache"), colors: ["gray"] },
    { sheet: sheet("hat_cap_leather"), colors: ["leather"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["slate"] },
    { sheet: sheet("torso_aprons_overalls"), colors: ["brown"] },
    { sheet: sheet("legs_pants"), colors: ["brown"] },
    { sheet: sheet("feet_boots_basic"), colors: ["brown"] },
  ],
});

export const GARROW_THRESHER = characterSprite({
  id: character("5bbdd684-d869-45a2-b2bd-afc415be692f"),
  body: "male",
  skin: "bronze",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["bronze", "brown"] },
    { sheet: sheet("hair_buzzcut"), colors: ["dark_brown"] },
    { sheet: sheet("torso_clothes_sleeveless2"), colors: ["tan"] },
    { sheet: sheet("legs_pants"), colors: ["brown"] },
    { sheet: sheet("feet_boots_fold"), colors: ["walnut"] },
  ],
});

export const THE_SCARECROW = characterSprite({
  id: character("a94a23d9-a9e2-4f95-b1f4-137e189585d3"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_jack"), colors: ["jack"] },
    { sheet: sheet("hat_tricorne_thatch"), colors: ["tan"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["tan"] },
    { sheet: sheet("torso_aprons_overalls"), colors: ["brown"] },
    { sheet: sheet("legs_pants2"), colors: ["tan"] },
  ],
});

export const OSWIN_MARL = characterSprite({
  id: character("1a06d884-dc83-4fd3-99db-9fe6d6539030"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male_gaunt"), colors: ["light", "gray"] },
    { sheet: sheet("hair_parted"), colors: ["black"] },
    { sheet: sheet("facial_glasses_halfmoon"), colors: ["brass"] },
    { sheet: sheet("torso_clothes_longsleeve2_buttoned"), colors: ["white"] },
    { sheet: sheet("torso_clothes_vest_open"), colors: ["black"] },
    { sheet: sheet("legs_formal"), colors: ["black"] },
    { sheet: sheet("feet_shoes_revised"), colors: ["black"] },
  ],
});

export const MOTHER_YARROW = characterSprite({
  id: character("fb5bf89d-a4bd-42cd-bb89-dd5c9c3f8e51"),
  body: "female",
  skin: "taupe",
  parts: [
    { sheet: sheet("heads_human_female_elderly"), colors: ["taupe", "green"] },
    { sheet: sheet("hair_long_messy"), colors: ["gray"] },
    { sheet: sheet("hat_headband_kerchief"), colors: ["forest"] },
    { sheet: sheet("torso_clothes_longsleeve2_cardigan"), colors: ["forest"] },
    { sheet: sheet("legs_skirts_plain"), colors: ["brown"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["brown"] },
  ],
});

export const ALDO_HEWITT = characterSprite({
  id: character("ce35f8cf-1350-4aec-86d2-2a659e4b717b"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "brown"] },
    { sheet: sheet("hair_plain"), colors: ["dark_brown"] },
    { sheet: sheet("beards_beard"), colors: ["sandy"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["red"] },
    { sheet: sheet("torso_aprons_suspenders"), colors: ["brown"] },
    { sheet: sheet("legs_pants"), colors: ["charcoal"] },
    { sheet: sheet("feet_boots_rim"), colors: ["brown"] },
  ],
});

export const FIRST_DREAM_CHARACTER_SPRITES = [
  WENNA_ASHDOWN,
  TOBIN_ROOK,
  HESSA_MOTT,
  PELL,
  AMBROSE_FINCH,
  DILLY_SORREL,
  WIDOW_MARRABLE,
  COBB,
  GARROW_THRESHER,
  THE_SCARECROW,
  OSWIN_MARL,
  MOTHER_YARROW,
  ALDO_HEWITT,
];
