import { event, x } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { draw } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Dreamscatter",
  mtgName: "Expansion // Explosion",
  id: "4fac8060-2644-409f-806b-c6a845ef6f31",
  renderedText: "Draw X cards.",
  energyCost: 2,
  energyCosts: ["2", "X"],
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 489056605,
  artOwned: true,
  cardNumber: 196,
  art: { x: -0.285, y: 0.032, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(draw(x()))],
  verifiedText: expectedVerifiedText("Draw X cards."),
});
