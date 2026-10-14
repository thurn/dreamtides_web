import { event, dissolvedThisTurn } from "../../engine/dsl/builders";
import { draw } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { card } from "../define";

export default card({
  name: "Scuttled Fortune",
  mtgName: "Liliana's Standard Bearer",
  id: "2a230602-a39b-4ec2-a467-97b92b389aff",
  renderedText:
    "Draw a card for each character you controlled that dissolved this turn.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: null,
  tags: ["Ally Audit", "tutorial"],
  imageNumber: 539226472,
  artOwned: false,
  cardNumber: 63,
  art: { x: 0.171, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(draw(dissolvedThisTurn()))],
  verifiedText: expectedVerifiedText("Draw a card for each character you controlled that dissolved this turn."),
});
