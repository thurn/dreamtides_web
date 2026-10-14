import { whenRemovesEnemy, triggered } from "../../engine/dsl/triggers";
import { gainEnergy } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dreamsign } from "../define";

export default dreamsign({
  id: "c92438fc-8e1f-4f97-9dcf-8ca0edaa8607",
  name: "Black Horn",
  imageName: "leech.png",
  imageAlt:
    "curved black horn or claw with cream spots and bright green interior",
  effectDescription: "When you dissolve or banish an enemy character, gain 2●.",
  rarity: "Rare",
  tideIds: ["7343b376-88d2-45fe-8b5e-79763480ee7e"],
  tags: ["J12", "Tag OK"],
  abilities: () => [triggered(whenRemovesEnemy(), gainEnergy(2))],
  verifiedText: expectedVerifiedText("When you dissolve or banish an enemy character, gain 2●."),
});
