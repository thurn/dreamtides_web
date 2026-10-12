import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Centennial Square",
  id: "af2ef62f-d31b-4544-a2b0-f5aab03c2d7c",
  renderedText: "Choose one: Draw a card or gain 2●.",
  order: 4,
  energyAdded: 0,
  cardType: "Dreamwell",
  imageNumber: 1504647500,
  artOwned: false,
  cardNumber: 33,
  tags: [],
  abilities: () => [event(p.chooseOne(p.draw(1), p.gainEnergy(2)))],
  verifiedText: "14vul9chg0z",
});
