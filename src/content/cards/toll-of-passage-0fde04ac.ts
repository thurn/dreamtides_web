import { event, stackItem } from "../../engine/dsl/builders";
import { prevent } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { card } from "../define";

export default card({
  name: "Toll of Passage",
  mtgName: "Spell Snare",
  id: "0fde04ac-8552-45ce-83a3-5ab2384b36da",
  renderedText: "Prevent a played ≤2● cost card.",
  amplifiedText: "Prevent a played ≤3● cost card.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Counterspell"],
  imageNumber: 499788430,
  artOwned: false,
  cardNumber: 118,
  art: { x: -0.456, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [event(prevent(stackItem({ costAtMost: variant.amplified ? 3 : 2 })))],
  verifiedText: expectedVerifiedText("Prevent a played ≤2● cost card.", "Prevent a played ≤3● cost card."),
});
