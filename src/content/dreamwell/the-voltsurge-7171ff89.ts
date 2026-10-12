import { event } from "../../engine/dsl/builders";
import { draw, eachPlayer } from "../../engine/effects/primitives";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "The Voltsurge",
  id: "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
  renderedText: "Each player draws 2 cards.",
  order: 3,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 1125132389,
  artOwned: true,
  cardNumber: 14,
  tags: ["Art Owned"],
  abilities: () => [event(eachPlayer(draw(2)))],
  verifiedText: "1ce1s0tuf09",
});
