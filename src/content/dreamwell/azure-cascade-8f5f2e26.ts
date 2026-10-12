import { event } from "../../engine/dsl/builders";
import { discover } from "../../engine/effects/primitives/discover";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Azure Cascade",
  id: "8f5f2e26-44b5-447b-90d0-eaf22ab29fed",
  renderedText: "Discover a character.",
  order: 3,
  energyAdded: 0,
  cardType: "Dreamwell",
  imageNumber: 485518030,
  artOwned: false,
  cardNumber: 39,
  tags: [],
  abilities: () => [event(discover({ cardType: "character" }))],
  verifiedText: "y491632w5m",
});
