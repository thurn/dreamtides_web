import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Genesis Burst",
  mtgName: "High Tide",
  id: "848b41b3-9f87-45fb-b86f-b52fc913d201",
  renderedText: "Double your current ●.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 1314287447,
  artOwned: false,
  cardNumber: 323,
  art: { x: 0.178, y: 0.212, scale: 1.37 },
  isStarter: false,
  abilities: () => [event(p.doubleEnergy())],
  verifiedText: "nohfsi8yqn",
});
