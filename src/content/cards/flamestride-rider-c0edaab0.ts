import { abandonSelfCost, activated, enemyCharacter, energy, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Flamestride Rider",
  mtgName: "Pyrite Spellbomb",
  id: "c0edaab0-1e6d-4f0f-8d37-6fc90c8bee7f",
  renderedText:
    "1●, Abandon this character: Choose one: Draw a card or dissolve a ≤2✦ enemy.",
  amplifiedText:
    "1●, Abandon this character: Choose one: Draw a card or dissolve a ≤3✦ enemy.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2586513025,
  artOwned: false,
  cardNumber: 332,
  art: { x: 0.21, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    activated([energy(1), abandonSelfCost()], p.chooseOne(p.draw(1), p.dissolve(target(enemyCharacter({ sparkAtMost: variant.amplified ? 3 : 2 }))))),
  ],
  verifiedText: "ls98bfkwzw",
});
