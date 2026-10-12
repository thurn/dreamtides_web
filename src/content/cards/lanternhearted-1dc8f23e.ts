import { activated, characterYouControl, energy, exhaustSelf, keyword, reclaim, target, upTo } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Lanternhearted",
  mtgName: "Fatestitcher",
  id: "1dc8f23e-58bd-47e5-9510-b48315fba1df",
  renderedText: "Awakened, Reclaim 1●\n\n☾: Awaken a character you control.",
  amplifiedText:
    "Awakened, Reclaim 1●\n\n☾: Awaken up to two characters you control.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Awaken", "Ally Audit"],
  imageNumber: 1180104046,
  artOwned: false,
  cardNumber: 314,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    keyword("awakened"),
    reclaim(energy(1)),
    activated([exhaustSelf()], p.awaken(variant.amplified ? upTo(characterYouControl(), 2) : target(characterYouControl()))),
  ],
  verifiedText: "1bpcnabtau8",
});
