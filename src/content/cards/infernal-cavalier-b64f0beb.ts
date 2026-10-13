import { fromVoid } from "../../engine/dsl/builders";
import { onDissolved, triggered } from "../../engine/dsl/triggers";
import { returnFromVoid } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Infernal Cavalier",
  mtgName: "Workshop Assistant",
  id: "b64f0beb-6ba4-4559-b6ab-091c2f60a613",
  renderedText:
    "▸Dissolved: Return another warrior from your void to your hand.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["tutorial"],
  imageNumber: 2421338075,
  artOwned: false,
  cardNumber: 495,
  art: { x: -0.139, y: -0.394, scale: 1.47 },
  isStarter: false,
  abilities: () => [triggered(onDissolved(), returnFromVoid(fromVoid({ cardType: "character", subtype: "Warrior" }, { another: true }), { toYourHand: true }))],
  verifiedText: "1ogqyxnik64",
});
