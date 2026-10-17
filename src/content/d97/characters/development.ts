// Three development character recipes: a knight, a villager and a wolf-headed
// boss. The development dream's occupants use them, and the player walks as
// the knight while their Avatar has no recipe of its own.

import { parseD97CharacterId, parseLpcSheetKey } from "../../../types/identifiers";
import { characterSprite } from "./schema";

const sheet = parseLpcSheetKey;

export const DEV_KNIGHT = characterSprite({
  id: parseD97CharacterId("d9710000-0000-4000-8000-000000000001"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "brown"] },
    { sheet: sheet("hair_bangsshort"), colors: ["chestnut"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["navy"] },
    { sheet: sheet("torso_chainmail"), colors: ["silver"] },
    { sheet: sheet("legs_pants"), colors: ["charcoal"] },
    { sheet: sheet("feet_boots_basic"), colors: ["brown"] },
  ],
});

export const DEV_VILLAGER = characterSprite({
  id: parseD97CharacterId("d9710000-0000-4000-8000-000000000002"),
  body: "female",
  skin: "amber",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["amber", "green"] },
    { sheet: sheet("hair_braid2"), colors: ["strawberry"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["forest"] },
    { sheet: sheet("legs_skirts_plain"), colors: ["tan"] },
    { sheet: sheet("feet_shoes_basic"), colors: ["walnut"] },
  ],
});

export const DEV_WOLF = characterSprite({
  id: parseD97CharacterId("d9710000-0000-4000-8000-000000000003"),
  body: "male",
  skin: "fur_grey",
  parts: [
    { sheet: sheet("heads_wolf_male"), colors: ["fur_grey"] },
    { sheet: sheet("torso_armour_plate"), colors: ["iron"] },
    { sheet: sheet("legs_armour"), colors: ["iron"] },
    { sheet: sheet("feet_armour"), colors: ["iron"] },
  ],
});
