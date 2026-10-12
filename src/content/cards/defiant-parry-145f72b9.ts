import { event, keyword, stackItem } from "../../engine/dsl/builders";
import { prevent } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Defiant Parry",
  mtgName: "Daze",
  id: "145f72b9-5ff7-4477-b7f5-55ca89a135ae",
  renderedText:
    "Offering\n\nPrevent a played card unless the opponent pays 1●.",
  amplifiedText:
    "Offering\n\nPrevent a played card unless the opponent pays 2●.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Counterspell"],
  imageNumber: 1897537153,
  artOwned: false,
  cardNumber: 319,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: ({ amplified }) => [keyword("offering"), event(prevent(stackItem({ controller: "opponent" }), { unlessPays: amplified ? 2 : 1 }))],
  verifiedText: "1zvxsc4wh5m",
});
