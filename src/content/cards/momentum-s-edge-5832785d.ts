import { all, anyCharacter, staticAbility } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Momentum's Edge",
  mtgName: "Metallic Mimic",
  id: "5832785d-fb97-40b5-a12b-bb660f5e04b6",
  renderedText:
    "▸Materialized: Choose a character type. This character is that character type.\n\nCharacters of the chosen type have +1✦.",
  amplifiedText:
    "▸Materialized: Choose a character type. This character is that character type.\n\nCharacters of the chosen type have +2✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [],
  imageNumber: 529374478,
  artOwned: false,
  cardNumber: 342,
  art: { x: 0.228, y: 1, scale: 1.07 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), p.chooseSubtype({ self: true })),
    staticAbility(p.sparkModifier(all(anyCharacter({ subtype: p.CHOSEN_SUBTYPE })), variant.amplified ? 2 : 1)),
  ],
  verifiedText: "1w9sdmq1ojc",
});
