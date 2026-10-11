import { event } from "../../engine/dsl/builders";
import { takeExtraTurn } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Moment Rewound",
  mtgName: "Time Walk",
  id: "a911ef71-799c-4240-ad13-8fabd3caeafa",
  renderedText: "Take an extra turn after this one.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Legendary",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 758082493,
  artOwned: false,
  cardNumber: 38,
  art: { x: -0.63, y: 0.032, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(takeExtraTurn())],
  verifiedText: "l5zg9ng007",
});
