import { abandonCost, activated } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainEnergy } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Infernal Ascendant",
  mtgName: "Phyrexian Altar",
  id: "fbf725ca-8837-46d4-970c-922153e27b6e",
  renderedText: "Abandon another character: Gain 1●.",
  amplifiedText: "Abandon another character: Gain 2●.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Monster",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Free Sacrifice"],
  imageNumber: 1633431256,
  artOwned: false,
  cardNumber: 281,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [activated([abandonCost({ another: true })], gainEnergy(variant.amplified ? 2 : 1))],
  verifiedText: expectedVerifiedText("Abandon another character: Gain 1●.", "Abandon another character: Gain 2●."),
});
