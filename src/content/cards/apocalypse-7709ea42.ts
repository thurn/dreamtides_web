import { all, anyCharacter, event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Apocalypse",
  mtgName: "Damn",
  id: "7709ea42-d73a-4d6b-b8b3-e3f66f44e9ea",
  renderedText: "Dissolve all characters.",
  energyCost: 4,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art OK", "Art Owned"],
  imageNumber: 1200949222,
  artOwned: true,
  cardNumber: 416,
  art: { x: 0.084, y: 0.032, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.dissolve(all(anyCharacter())))],
  verifiedText: "1p83xh1bw5k",
});
