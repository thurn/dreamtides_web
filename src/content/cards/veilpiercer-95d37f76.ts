import { stackItem } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Veilpiercer",
  mtgName: "Spell Queller",
  id: "95d37f76-eb3d-4bcd-a8af-0ae37feabd4d",
  renderedText:
    "▸Materialized: Return a played ≤3● cost card to the opponent's hand. It costs 2● more.",
  amplifiedText:
    "▸Materialized: Return a played ≤4● cost card to the opponent's hand. It costs 2● more.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Common",
  isFast: true,
  isInterrupt: true,
  spark: 3,
  tags: [],
  imageNumber: 2586513027,
  artOwned: false,
  cardNumber: 464,
  isStarter: false,
  abilities: (v) => [triggered(onMaterialized(), p.modifyCardCost(
    p.returnToHand({ kind: "stackTarget", selector: stackItem({ costAtMost: v.amplified ? 4 : 3 }) }, { toOpponentHand: true }),
    { increase: 2 },
  ))],
  verifiedText: "2bglppjii4e",
});
