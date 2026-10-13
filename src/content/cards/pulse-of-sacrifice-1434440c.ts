import { countCards, event } from "../../engine/dsl/builders";
import { discard, gainEnergy, sequence } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { card } from "../define";

export default card({
  name: "Pulse of Sacrifice",
  mtgName: "Lion's Eye Diamond",
  id: "1434440c-c86f-4b7d-83e7-3bd1f7dde63e",
  renderedText: "Discard your hand. Gain 3●.",
  amplifiedText: "Discard your hand. Gain 4●.",
  energyCost: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 708313726,
  artOwned: false,
  cardNumber: 347,
  art: { x: -0.294, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [event(sequence(discard(countCards("hand")), gainEnergy(variant.amplified ? 4 : 3)))],
  verifiedText: expectedVerifiedText("Discard your hand. Gain 3●.", "Discard your hand. Gain 4●."),
});
