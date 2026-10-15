import { staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { costModifierNth } from "../../engine/effects/primitives/cost-modifier";
import { firstPlayedSparkSetter } from "../../engine/effects/primitives/first-played-spark-setter";
import { dreamsign } from "../define";

export default dreamsign({
  id: "3dd05e97-1af8-4ae9-8e1f-954eaa63e112",
  name: "Flash Powder",
  imageName: "Alchemical_Powder.png",
  imageAlt:
    "Red-orange faceted gem or crystal with rough, glowing, rounded shape.",
  effectDescription:
    "The first character you play each turn costs 2● less and has 0✦.",
  rarity: "Common",
  tideIds: [
    "7dfa6a52-04ce-42fc-9ef6-4e6571435510",
    "80e3d33f-6b21-4739-9050-be8d28de28a6",
    "e03f4d87-bc6c-46f9-9c08-bef7b59a9f70",
  ],
  tags: ["Tag OK"],
  abilities: () => [
    staticAbility(costModifierNth("you", { cardType: "character" }, 1, { reduce: 2 })),
    staticAbility(firstPlayedSparkSetter(0)),
  ],
  verifiedText: expectedVerifiedText("The first character you play each turn costs 2● less and has 0✦."),
});
