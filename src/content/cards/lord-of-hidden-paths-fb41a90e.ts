import { all, characterYouControl, ofSubtype, staticAbility } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { draw, payTo, sparkModifier } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Lord of Hidden Paths",
  mtgName: "Leaf-Crowned Visionary",
  id: "fb41a90e-279c-419c-80fc-7c3469ba0c74",
  renderedText:
    "Spirit animals you control have +1✦.\n\nWhen you play a spirit animal, you may pay 1● to draw a card.",
  amplifiedText:
    "Spirit animals you control have +2✦.\n\nWhen you play a spirit animal, you may pay 1● to draw a card.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Spirit Lord", "Ally Audit"],
  imageNumber: 2594220423,
  artOwned: false,
  cardNumber: 459,
  art: { x: -0.21, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    staticAbility(sparkModifier(all(characterYouControl(ofSubtype("Spirit Animal"))), variant.amplified ? 2 : 1)),
    triggered(whenYouPlay({ subtype: "Spirit Animal" }), payTo({ energy: 1 }, draw(1))),
  ],
  verifiedText: "1ut4p4zyxra",
});
