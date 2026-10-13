import { abandonCost, activated, exhaustSelf } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainEnergy } from "../../engine/effects/primitives";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { card } from "../define";

export default card({
  name: "Iron Pharaoh",
  mtgName: "Phyrexian Tower",
  id: "0458658d-7e02-4286-9249-93674d16620b",
  renderedText: "▸Dawn: Gain 1●.\n\n☾, Abandon a character: Gain 1●.",
  amplifiedText: "▸Dawn: Gain 2●.\n\n☾, Abandon a character: Gain 2●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 393588445,
  artOwned: false,
  cardNumber: 153,
  art: { x: 0, y: 1, scale: 1 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onDawn(), gainEnergy(variant.amplified ? 2 : 1)),
    activated([exhaustSelf(), abandonCost()], gainEnergy(variant.amplified ? 2 : 1)),
  ],
  verifiedText: expectedVerifiedText("▸Dawn: Gain 1●.\n\n☾, Abandon a character: Gain 1●.", "▸Dawn: Gain 2●.\n\n☾, Abandon a character: Gain 2●."),
});
