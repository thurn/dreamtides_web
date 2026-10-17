// The Rust Expanse Avatars: scrapper work clothes, a ganger's orange jacket
// and a visored enforcer.

import { parseAvatarId, parseD97CharacterId, parseLpcSheetKey } from "../../../../types/identifiers";
import { characterSprite } from "../schema";

const sheet = parseLpcSheetKey;
const character = parseD97CharacterId;
const avatar = parseAvatarId;

const KELL_TARN_SPRITE = characterSprite({
  id: character("5482c20f-78ef-4e26-a0d9-00c41cc19bc0"),
  avatarId: avatar("133e22dd-f81b-406d-b4e3-98c346d7fd4e"),
  body: "muscular",
  skin: "brown",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["brown", "brown"] },
    { sheet: sheet("hair_dreadlocks_short"), colors: ["black"] },
    { sheet: sheet("facial_glasses_sunglasses"), colors: ["sunglasses"] },
    { sheet: sheet("torso_aprons_suspenders"), colors: ["brown"] },
    { sheet: sheet("legs_pants"), colors: ["tan"] },
    { sheet: sheet("feet_boots_revised"), colors: ["brown"] },
  ],
});

const KAREV_SOLTIS_SPRITE = characterSprite({
  id: character("bfc52d7c-0717-49e6-9bde-cbf1bfbcb919"),
  avatarId: avatar("9e4862fd-e18c-463e-9d5f-e5d73c29a66f"),
  body: "male",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["light", "gray"] },
    { sheet: sheet("hair_high_and_tight"), colors: ["dark_brown"] },
    { sheet: sheet("torso_clothes_longsleeve2_buttoned"), colors: ["orange"] },
    { sheet: sheet("legs_pants"), colors: ["charcoal"] },
    { sheet: sheet("feet_boots_rim"), colors: ["black"] },
  ],
});

const KAEL_VOSS_SPRITE = characterSprite({
  id: character("7a981ce9-39a1-468a-abc3-fbae9e94f746"),
  avatarId: avatar("81954ca0-da36-49dd-915c-1ccb1b2d7b05"),
  body: "male",
  skin: "taupe",
  parts: [
    { sheet: sheet("heads_human_male"), colors: ["taupe", "red"] },
    { sheet: sheet("hat_helmet_bascinet_round"), colors: ["steel"] },
    { sheet: sheet("hat_visor_grated"), colors: ["steel"] },
    { sheet: sheet("torso_clothes_longsleeve2_buttoned"), colors: ["black"] },
    { sheet: sheet("legs_formal"), colors: ["black"] },
    { sheet: sheet("feet_boots_basic"), colors: ["black"] },
  ],
});

export const RUST_EXPANSE_AVATAR_SPRITES = [KELL_TARN_SPRITE, KAREV_SOLTIS_SPRITE, KAEL_VOSS_SPRITE];
