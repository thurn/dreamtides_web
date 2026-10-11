import { energy, thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenDiscardSelf } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Oblivion Guide",
  mtgName: "Blazing Rootwalla",
  id: "4fe9f53e-149a-4b9f-8fac-f75560c986f2",
  renderedText: "When you discard this card, it gains reclaim 0●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art OK", "Art Owned"],
  imageNumber: 1185684772,
  artOwned: true,
  cardNumber: 375,
  isStarter: false,
  abilities: () => [triggered(whenDiscardSelf(), p.grantReclaim(thisCardIn("void"), { costs: [energy(0)] }), { zone: "void" })],
  verifiedText: "14ntb5937bu",
});
