import { abandonSelfCost, activated, enemyCharacter, target } from "../../engine/dsl/builders";
import { thisCharacterSpark } from "../../engine/dsl/values";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Cloaked Sentinel",
  mtgName: "Monoskelion",
  id: "75bf1aab-dce0-4bbc-8ab0-a3c84b66ae9a",
  renderedText:
    "Abandon this character: Dissolve an enemy with ✦ less than or equal to this character's ✦.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "tutorial", "Art Owned"],
  imageNumber: 1295291155,
  artOwned: false,
  cardNumber: 507,
  art: { x: 0, y: 0.331, scale: 1.77 },
  isStarter: false,
  abilities: () => [activated([abandonSelfCost()], p.dissolve(target(enemyCharacter({ sparkAtMost: thisCharacterSpark() }))))],
  verifiedText: "w13or9cb1r",
});
