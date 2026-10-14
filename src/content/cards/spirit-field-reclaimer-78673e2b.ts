import { activated, banishFromAnyVoidCost, energy, staticAbility, storedCounters, supported } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { sparkModifier, storeCounters } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Spirit Field Reclaimer",
  mtgName: "Lion Sash",
  id: "78673e2b-a6d1-43de-8850-3d3327de5cc6",
  renderedText:
    "Support – Supported characters have +1✦ for each stored ⧗.\n\n1●, Banish a character from a void: Store 1⧗.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Ally Audit", "tutorial", "Art Owned"],
  imageNumber: 2287054239,
  artOwned: true,
  cardNumber: 33,
  art: { x: -0.022, y: -0.517, scale: 1.77 },
  isStarter: false,
  abilities: () => [
    staticAbility(sparkModifier(supported(), storedCounters())),
    activated([energy(1), banishFromAnyVoidCost(1, { cardType: "character" }, "any")], storeCounters(1)),
  ],
  verifiedText: expectedVerifiedText(
    "Support – Supported characters have +1✦ for each stored ⧗.\n\n1●, Banish a character from a void: Store 1⧗.",
  ),
});
