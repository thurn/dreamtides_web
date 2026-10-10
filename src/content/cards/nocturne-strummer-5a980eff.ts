import { staticAbility, supported } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Nocturne Strummer",
  mtgName: "",
  id: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
  renderedText: "Support – Supported characters have +2✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Musician",
  rarity: "Starter",
  roles: ["starter-deck"],
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Ally Audit"],
  imageNumber: 507269458,
  artOwned: false,
  cardNumber: 510,
  art: { x: -0.684, y: 1, scale: 1.17 },
  isStarter: true,
  abilities: () => [staticAbility(p.sparkModifier(supported(), 2))],
  verifiedText: "htd2d4p1j",
});
