import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Nightmare",
  mtgName: "",
  id: "b0a2c3d4-e5f6-4789-8abc-0def12345678",
  renderedText: "Draw a card.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Special",
  roles: ["nightmare"],
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 1486924805,
  artOwned: false,
  cardNumber: 10002,
  isStarter: false,
  abilities: () => [event(p.draw(1))],
  verifiedText: "17a8eqw0wx0",
});
