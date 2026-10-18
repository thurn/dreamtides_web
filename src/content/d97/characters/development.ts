// Two development character recipes: a knight and a villager. The
// development dream's occupants use them; only development builds register
// them (src/d97/development-content.ts).

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
