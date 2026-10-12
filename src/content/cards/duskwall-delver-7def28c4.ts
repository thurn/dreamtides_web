import { characterYouControl, thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Duskwall Delver",
  mtgName: "Nether Traitor",
  id: "7def28c4-d75a-47e1-ae86-5b7093cc0419",
  renderedText:
    "When a character you control is dissolved, you may pay 1● to materialize this character from your void.",
  amplifiedText:
    "When a character you control is dissolved, you may pay 1● to materialize this character from your void with awakened.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Ally Audit"],
  imageNumber: 2018848979,
  artOwned: false,
  cardNumber: 380,
  isStarter: false,
  abilities: (variant) => [
    // Its void ability watches other dissolves, not its own (RD-hv-umm2.65-1).
    triggered(
      whenDissolved(characterYouControl()),
      p.payTo({ energy: 1 }, p.materialize(thisCardIn("void"), { awakened: variant.amplified })),
      { zone: "void" },
    ),
  ],
  verifiedText: "gd2ljukuyb",
});
