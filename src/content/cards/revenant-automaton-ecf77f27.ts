import { abandonCost, activated, thisCardIn } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Revenant Automaton",
  mtgName: "Cauldron Familiar",
  id: "ecf77f27-df0f-47c4-99c2-48d7fa46a137",
  renderedText:
    "▸Materialized: Gain 1⍟.\n\nAbandon a character: Materialize this character from your void.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2530614279,
  artOwned: false,
  cardNumber: 191,
  art: { x: 0.256, y: 0.115, scale: 1.77 },
  isStarter: false,
  abilities: () => [
    triggered(onMaterialized(), p.gainPoints(1)),
    activated([abandonCost()], p.materialize(thisCardIn("void")), { zone: "void" }),
  ],
  verifiedText: "g0954j4obr",
});
