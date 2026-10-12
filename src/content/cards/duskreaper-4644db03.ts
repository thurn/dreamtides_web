import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Duskreaper",
  mtgName: "Cruel Celebrant",
  id: "4644db03-fbcd-4af5-a229-17962ce093d5",
  renderedText: "When a character you control is dissolved, gain 1⍟.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Blood Artist", "Score Trigger", "Ally Audit", "Art Owned"],
  imageNumber: 2023111793,
  artOwned: false,
  cardNumber: 249,
  art: { x: -0.294, y: 0.032, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(whenDissolved(characterYouControl()), p.gainPoints(1))],
  verifiedText: "w015af792x",
});
