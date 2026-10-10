import { self, staticAbility, supporting, times } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Rusted Colossus",
  mtgName: "",
  id: "5ab11bef-5dcd-49f5-be49-ae2ccde76e70",
  renderedText: "This character has +2✦ for each character supporting it.",
  energyCost: 6,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Starter",
  roles: ["starter-deck"],
  isFast: false,
  isInterrupt: false,
  spark: 6,
  tags: ["Ally Audit"],
  imageNumber: 2123360831,
  artOwned: false,
  cardNumber: 515,
  art: { x: -0.42, y: 1, scale: 1.17 },
  isStarter: true,
  abilities: () => [staticAbility(p.sparkModifier(self(), times(supporting(), 2)))],
  verifiedText: "1k4p9sy4w31",
});
