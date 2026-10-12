import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenMaterialize } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Sage of the High Hills",
  mtgName: "Molten Gatekeeper",
  id: "2c9711c7-800c-4e55-a488-17ea5a6813c6",
  renderedText: "When you materialize another character, gain 1⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Musician",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Score Trigger", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 1084620026,
  artOwned: false,
  cardNumber: 139,
  art: { x: 0, y: 0.1, scale: 1.2 },
  isStarter: false,
  abilities: () => [triggered(whenMaterialize(characterYouControl({ another: true })), p.gainPoints(1))],
  verifiedText: "ow75gflccy",
});
