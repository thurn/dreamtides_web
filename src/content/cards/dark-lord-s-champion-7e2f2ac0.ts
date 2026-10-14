import { thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenDraw } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { materialize } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Dark Lord's Champion",
  mtgName: "Sneaky Snacker",
  id: "7e2f2ac0-4e3c-4520-80c6-c830581b40de",
  renderedText:
    "When you draw your third card in a turn, materialize this character from your void.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 5,
  tags: ["Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 247705264,
  artOwned: false,
  cardNumber: 490,
  art: { x: 0, y: -0.343, scale: 1.5 },
  isStarter: false,
  abilities: () => [triggered(whenDraw("you", 3), materialize(thisCardIn("void")), { zone: "void" })],
  verifiedText: expectedVerifiedText("When you draw your third card in a turn, materialize this character from your void."),
});
