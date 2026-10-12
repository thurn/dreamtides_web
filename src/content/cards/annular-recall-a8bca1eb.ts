import { anyCharacter, costExactly, event, target, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Annular Recall",
  mtgName: "Repeal",
  id: "a8bca1eb-abc8-42e0-b770-0f03af250b81",
  renderedText: "Return a character with cost X● to hand. Draw a card.",
  energyCost: null,
  xMinimum: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art OK", "Art Owned"],
  imageNumber: 1042405690,
  artOwned: false,
  cardNumber: 91,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.sequence(p.returnToHand(target(anyCharacter(costExactly(x())))), p.draw(1)))],
  verifiedText: "23h8pi17kk7",
});
