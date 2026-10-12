import { all, characterYouControl, energy, staticAbility, thisCardIn } from "../../engine/dsl/builders";
import { either, triggered, whenDiscardSelf, whenErodeSelf } from "../../engine/dsl/triggers";
import { grant, grantReclaim } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Pinnacle Ascendant",
  mtgName: "Anger",
  id: "e4e8d3b9-3463-4b92-8fbe-35064f72402d",
  renderedText:
    "Characters you control have awakened.\n\nWhen you discard or erode this card, it gains reclaim 0●.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Ally Audit"],
  imageNumber: 2419795155,
  artOwned: false,
  cardNumber: 166,
  art: { x: -0.042, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    staticAbility(grant(all(characterYouControl()), "awakened")),
    triggered(either(whenDiscardSelf(), whenErodeSelf()), grantReclaim(thisCardIn("void"), { costs: [energy(0)] }), { zone: "void" }),
  ],
  verifiedText: "1pddeflpp6q",
});
