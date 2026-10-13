import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenMaterialize } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Sky Legion Invoker",
  mtgName: "Losheel, Clockwork Scholar",
  id: "8367b757-c3d2-4c22-9043-8baadee1c5ba",
  renderedText: "Once per turn, when you materialize a warrior, draw a card.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "tutorial", "Art Owned"],
  imageNumber: 1289324101,
  artOwned: true,
  cardNumber: 407,
  art: { x: 0.252, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(whenMaterialize(characterYouControl({ subtype: "Warrior" })), p.draw(1), { oncePerTurn: true })],
  verifiedText: "c7s11tzsxm",
});
