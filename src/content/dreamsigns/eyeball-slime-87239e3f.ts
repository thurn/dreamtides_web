import { dreamsign } from "../define";
import { staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { preserveEphemeralHand } from "../../engine/effects/primitives";

export default dreamsign({
  id: "87239e3f-04f7-45bd-9b73-944ef36ad445",
  name: "Eyeball Slime",
  imageName: "monster_jelly.png",
  imageAlt: "bright green slime blob covered in multiple blinking eyeballs",
  effectDescription:
    "Cards in your hand with ephemeral are not banished at the end of your turn.",
  rarity: "Uncommon",
  tideIds: ["5b1199a2-d9c2-48f8-84b4-c111fba6aa64"],
  tags: ["J12", "Tag OK"],
  abilities: () => [staticAbility(preserveEphemeralHand())],
  verifiedText: expectedVerifiedText("Cards in your hand with ephemeral are not banished at the end of your turn."),
});
