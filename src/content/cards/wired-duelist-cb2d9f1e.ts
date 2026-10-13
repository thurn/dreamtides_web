import { characterYouControl, self, target } from "../../engine/dsl/builders";
import { onDawn, onDissolved, triggered } from "../../engine/dsl/triggers";
import { thisCharacterSpark } from "../../engine/dsl/values";
import { gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Wired Duelist",
  mtgName: "Scrapyard Recombiner",
  id: "cb2d9f1e-8888-44c7-9918-57b2ec8c78e1",
  renderedText:
    "▸Dawn: This character gains +1✦.\n\n▸Dissolved: Give a character you control +X✦ where X is this character's ✦.",
  amplifiedText:
    "▸Dawn: This character gains +2✦.\n\n▸Dissolved: Give a character you control +X✦ where X is this character's ✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Ally Audit", "tutorial"],
  imageNumber: 1721490838,
  artOwned: false,
  cardNumber: 353,
  art: { x: -0.126, y: -0.131, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onDawn(), gainSpark(self(), variant.amplified ? 2 : 1)),
    triggered(onDissolved(), gainSpark(target(characterYouControl()), thisCharacterSpark())),
  ],
  verifiedText: "1nowo1g7k76",
});
