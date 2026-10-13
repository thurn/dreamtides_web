import { abandonCost, activated } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainEnergy } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Shadowbinder",
  mtgName: "Ashnod's Altar",
  id: "448abb34-d77d-40ac-8292-58db03176247",
  renderedText: "Abandon another character: Gain 2●.",
  amplifiedText: "Abandon another character: Gain 3●.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1450052381,
  artOwned: false,
  cardNumber: 25,
  art: { x: -0.08, y: 0.586, scale: 1.2 },
  isStarter: false,
  abilities: (variant) => [activated([abandonCost({ another: true })], gainEnergy(variant.amplified ? 3 : 2))],
  verifiedText: expectedVerifiedText("Abandon another character: Gain 2●.", "Abandon another character: Gain 3●."),
});
