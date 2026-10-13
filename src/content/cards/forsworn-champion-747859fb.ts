import { abandonCost, activated, ofSubtype, self } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Forsworn Champion",
  mtgName: "Arcbound Ravager",
  id: "747859fb-6fca-49fc-a653-08011a9bb44c",
  renderedText: "❖❖ – Abandon a warrior: This character gains +1✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["tutorial", "Art Owned"],
  imageNumber: 1794244543,
  artOwned: true,
  cardNumber: 217,
  art: { x: -0.032, y: -0.445, scale: 1.37 },
  isStarter: false,
  abilities: () => [activated([abandonCost(ofSubtype("Warrior"))], gainSpark(self(), 1), { speed: "interrupt" })],
  verifiedText: expectedVerifiedText("❖❖ – Abandon a warrior: This character gains +1✦."),
});
