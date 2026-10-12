import { event } from "../../engine/dsl/builders";
import { gainEnergy } from "../../engine/effects/primitives";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Prismatic Pastures",
  id: "d585b78a-dfe3-4e12-95ac-432c3c880540",
  renderedText: "Gain 3●.",
  order: 4,
  energyAdded: 0,
  cardType: "Dreamwell",
  imageNumber: 2295991867,
  artOwned: true,
  cardNumber: 19,
  tags: ["Art Owned"],
  abilities: () => [event(gainEnergy(3))],
  verifiedText: "1l39m00odfq",
});
