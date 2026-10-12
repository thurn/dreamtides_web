import { event } from "../../engine/dsl/builders";
import { gainPoints } from "../../engine/effects/primitives";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Autumn Glade",
  id: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
  renderedText: "Gain 2⍟.",
  order: 1,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 1789989917,
  artOwned: true,
  cardNumber: 5,
  tags: ["Art Owned"],
  abilities: () => [event(gainPoints(2))],
  verifiedText: "z4jsv175p6",
});
