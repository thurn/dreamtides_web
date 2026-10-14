import { card } from "../define";
import { activated, energy, exhaustSelf, storedCounters } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { gainEnergy, storeCounters } from "../../engine/effects/primitives";

export default card({
  name: "Dawnhorn Elder",
  mtgName: "Joraga Treespeaker",
  id: "691883df-63d8-4664-a1fe-d5f3b5becd11",
  renderedText: "2●, ☾: Store 1⧗.\n\n▸Dawn: Gain 1● for each stored ⧗.",
  amplifiedText: "2●, ☾: Store 2⧗.\n\n▸Dawn: Gain 1● for each stored ⧗.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: [],
  imageNumber: 1114007534,
  artOwned: false,
  cardNumber: 430,
  art: { x: -0.084, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    activated([energy(2), exhaustSelf()], storeCounters(variant.amplified ? 2 : 1)),
    triggered(onDawn(), gainEnergy(storedCounters())),
  ],
  verifiedText: "6qizaiuh73",
});
