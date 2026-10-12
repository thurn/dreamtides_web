import { event } from "../../engine/dsl/builders";
import { discover } from "../../engine/effects/primitives/discover";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Ringvale",
  id: "f61431f3-33bd-42ff-a229-b4013582e86e",
  renderedText: "Discover a ≤2● cost card.",
  order: 2,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 2622590199,
  artOwned: false,
  cardNumber: 24,
  tags: [],
  abilities: () => [event(discover({ costAtMost: 2 }))],
  verifiedText: "1cwf85lyp03",
});
