import { all, characterYouControl, controls, staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { sparkModifier } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "08a3983a-1b95-4d2e-a445-9d8dc2b8fca7",
  name: "Spider Medallion",
  imageName: "amulet_9.png",
  imageAlt: "Blue metal medallion with purple gem and small orb-like charm.",
  effectDescription: "When you have 3 or more challengers, they have +2✦.",
  rarity: "Uncommon",
  tideIds: [
    "568c305c-6884-4dff-b1ec-c08f387a6527",
    "b2b1b0da-6d48-40cb-9d44-f0a94f0615f5",
  ],
  tags: ["J12", "Tag OK"],
  abilities: () => {
    const challengers = characterYouControl({ challenging: true });
    return [staticAbility(sparkModifier(all(challengers), 2), { while: controls(challengers, 3) })];
  },
  verifiedText: expectedVerifiedText("When you have 3 or more challengers, they have +2✦."),
});
