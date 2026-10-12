import { energy, event, reclaim, self, sourceWasReclaimed } from "../../engine/dsl/builders";
import { copyCard, draw, gainEnergy, ifThen, sequence } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Prismatic Portal",
  mtgName: "Sevinne's Reclamation",
  id: "74e82d0d-e107-4207-ad2a-73d016ea54a9",
  renderedText:
    "Gain 2●. Draw a card. If this event was reclaimed, copy it.\n\nReclaim 6●",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2586513021,
  artOwned: true,
  cardNumber: 253,
  art: { x: -0.049, y: 1, scale: 1.07 },
  isStarter: false,
  abilities: () => [
    event(sequence(gainEnergy(2), draw(1), ifThen(sourceWasReclaimed(), copyCard(self())))),
    reclaim(energy(6)),
  ],
  verifiedText: "1lufyi14eg",
});
