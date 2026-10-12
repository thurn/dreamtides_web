import { anyCharacter, event, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Molten Duel",
  mtgName: "Lightning Bolt",
  id: "6044f6da-cf71-4dbb-9feb-f71ae66a4f5b",
  renderedText: "Dissolve a ≤3✦ character.",
  amplifiedText: "Dissolve a ≤4✦ character.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Removal"],
  imageNumber: 674166682,
  artOwned: false,
  cardNumber: 30,
  art: { x: 0, y: -0.445, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [event(p.dissolve(target(anyCharacter({ sparkAtMost: variant.amplified ? 4 : 3 }))))],
  verifiedText: "1yyhbonr1ir",
});
