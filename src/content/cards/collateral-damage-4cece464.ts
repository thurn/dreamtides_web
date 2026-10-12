import { all, anyCharacter, event, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Collateral Damage",
  mtgName: "The Meathook Massacre",
  id: "4cece464-2fde-483d-af92-04cd0341be5b",
  renderedText: "Dissolve each ≤X✦ character.",
  energyCost: 2,
  energyCosts: ["2", "X"],
  xMinimum: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 703988038,
  artOwned: false,
  cardNumber: 247,
  art: { x: 0.546, y: 0.608, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.dissolve(all(anyCharacter({ sparkAtMost: x() }))))],
  verifiedText: "bk6zaqfi48",
});
