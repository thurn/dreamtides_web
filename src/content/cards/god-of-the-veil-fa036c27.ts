import { staticAbility } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "God of the Veil",
  mtgName: "Crucible of Worlds",
  id: "fa036c27-2234-4f76-8857-c242530627ce",
  renderedText: "You may play ≤2● cost characters from your void.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 695511850,
  artOwned: false,
  cardNumber: 360,
  art: { x: -0.006, y: 1, scale: 1.16 },
  isStarter: false,
  abilities: () => [
    staticAbility(p.playFromZone("void", { cardType: "character", costAtMost: 2 })),
  ],
  verifiedText: "87urllqae",
});
