import { additionalCost } from "../../engine/dsl/builders";
import { either, onDawn, onMaterialized, triggered } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainEnergy } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Fangbound",
  mtgName: "Chrome Mox",
  id: "c750af2e-8185-4af0-bb38-4a41430c71b3",
  renderedText:
    "To play this card, banish a card from hand.\n\n▸Materialized, ▸Dawn: Gain 1●.",
  energyCost: 0,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: [],
  imageNumber: 2438838887,
  artOwned: false,
  cardNumber: 121,
  isStarter: false,
  abilities: () => [
    additionalCost({ cost: "banishFromHand", count: 1 }),
    triggered(either(onMaterialized(), onDawn()), gainEnergy(1)),
  ],
  verifiedText: expectedVerifiedText("To play this card, banish a card from hand.\n\n▸Materialized, ▸Dawn: Gain 1●."),
});
