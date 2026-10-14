import { thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { materialize } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Titan of Forgotten Echoes",
  mtgName: "Vengevine",
  id: "c32ef131-d283-4bf1-bf65-2d5e5d232168",
  renderedText:
    "When you play your second card in a turn, materialize this character from your void.",
  amplifiedText:
    "When you play your second card in a turn, materialize this character from your void with awakened.",
  energyCost: 5,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 5,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 2521694543,
  artOwned: true,
  cardNumber: 224,
  art: { x: 0.16, y: 1, scale: 1.47 },
  isStarter: false,
  abilities: (variant) => [triggered(whenYouPlay({}, 2), materialize(thisCardIn("void"), { awakened: variant.amplified }), { zone: "void" })],
  verifiedText: expectedVerifiedText(
    "When you play your second card in a turn, materialize this character from your void.",
    "When you play your second card in a turn, materialize this character from your void with awakened.",
  ),
});
