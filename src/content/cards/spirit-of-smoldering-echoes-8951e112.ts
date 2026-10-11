import { activated, energy, fromVoid } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Spirit of Smoldering Echoes",
  mtgName: "Jace, Vryn's Prodigy // Jace, Telepath Unbound",
  id: "8951e112-92d2-4246-9859-39320620231b",
  renderedText: "2●: Choose an event in your void to gain reclaim.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Elemental",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Owned"],
  imageNumber: 2023111784,
  artOwned: false,
  cardNumber: 384,
  isStarter: false,
  abilities: () => [activated([energy(2)], p.grantReclaim(fromVoid({ cardType: "event" })))],
  verifiedText: "27iztltk7c9",
});
