import { event } from "../../engine/dsl/builders";
import { drawDreamwell } from "../../engine/effects/primitives";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Lily Lake",
  id: "558a1f1b-7dc1-4d83-9f00-c6af2187a954",
  renderedText: "Draw an additional Dreamwell card.",
  order: 3,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 1302572581,
  artOwned: true,
  cardNumber: 10,
  tags: ["Art Owned"],
  abilities: () => [event(drawDreamwell())],
  verifiedText: "symw0vh366",
});
