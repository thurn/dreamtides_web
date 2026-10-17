// Farpoint Station Avatars: spacefarer whites, a captain's bicorne and a
// lizard-headed marine in plate.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const SERENATH_VEYL_SPRITE = characterSprite({
  id: character("29877707-6b07-47b9-ad60-00733608a3f7"),
  avatarId: avatar("9e19b3d1-12f2-43c1-9cb1-08de7cd32e32"),
  body: "female",
  skin: "blue",
  parts: [
    { sheet: sheet("heads_human_female"), colors: ["blue", "purple"] },
    { sheet: sheet("hair_relm_xlong"), colors: ["violet"] },
    { sheet: sheet("torso_clothes_longsleeve2"), colors: ["white"] },
    { sheet: sheet("neck_gem_round"), colors: ["blue"] },
    { sheet: sheet("legs_skirt_straight"), colors: ["sky"] },
    { sheet: sheet("feet_shoes_sara"), colors: ["white"] },
  ],
});

const CALLOWAY_FLINT_SPRITE = characterSprite({
  id: character("8bd7eef9-b2f8-4b9c-89ba-cea2505ffac9"),
  avatarId: avatar("8a2fcd65-bba7-459c-a6b0-f0391b9293fd"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "blue"] },
    { sheet: sheet("hair_plain"), colors: ["dark_brown"] },
    { sheet: sheet("beards_mustache"), colors: ["dark_brown"] },
    { sheet: sheet("hat_bicorne_athwart_admiral"), colors: ["black"] },
    { sheet: sheet("torso_clothes_longsleeve2_buttoned"), colors: ["navy"] },
    { sheet: sheet("shoulders_epaulets"), colors: ["yellow"] },
    { sheet: sheet("neck_cravat"), colors: ["white"] },
    { sheet: sheet("legs_formal"), colors: ["navy"] },
    { sheet: sheet("feet_boots_rim"), colors: ["black"] },
  ],
});

const THREXAN_SPRITE = characterSprite({
  id: character("2e0e1b9b-5fa9-4e1f-8236-c1bcb687fc92"),
  avatarId: avatar("b99936ca-97f9-4930-af5a-fa9ef92557ef"),
  body: "male",
  skin: "green",
  parts: [
    { sheet: sheet("heads_lizard_male"), colors: ["green"] },
    { sheet: sheet("tail_lizard"), colors: ["green"] },
    { sheet: sheet("torso_armour_plate"), colors: ["silver"] },
    { sheet: sheet("legs_armour"), colors: ["silver"] },
    { sheet: sheet("feet_armour"), colors: ["silver"] },
  ],
});

export const FARPOINT_AVATAR_SPRITES = [SERENATH_VEYL_SPRITE, CALLOWAY_FLINT_SPRITE, THREXAN_SPRITE];
