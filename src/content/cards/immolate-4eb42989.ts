import { enemyCharacter, event, keyword, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Immolate",
  mtgName: "Flare of Malice",
  id: "4eb42989-7498-4995-a3ab-89eb026b0c13",
  renderedText: "Offering\n\nDissolve an enemy.",
  energyCost: 4,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Removal", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 1907487244,
  artOwned: false,
  cardNumber: 167,
  art: { x: 0, y: 1, scale: 1.1 },
  isStarter: false,
  abilities: () => [keyword("offering"), event(p.dissolve(target(enemyCharacter())))],
  verifiedText: "213pikvx3rc",
});
