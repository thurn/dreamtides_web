import { energy, fromVoid } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { thisCharacterSpark } from "../../engine/dsl/values";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Pastward Wanderer",
  mtgName: "Dreadhorde Arcanist",
  id: "95711262-8510-475c-a572-c1cd144d54cb",
  renderedText:
    "▸Dawn: Choose an event in your void with cost less than or equal to this character's ✦. That event gains reclaim 0●.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Child",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 758082499,
  artOwned: false,
  cardNumber: 107,
  art: { x: 0, y: -0.197, scale: 1.87 },
  isStarter: false,
  abilities: () => [
    triggered(onDawn(), p.grantReclaim(fromVoid({ cardType: "event" }, { costAtMost: thisCharacterSpark() }), { costs: [energy(0)] })),
  ],
  verifiedText: "26e3c4zgrxr",
});
