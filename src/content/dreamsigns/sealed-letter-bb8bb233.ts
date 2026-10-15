import { triggered, whenAbandon } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { triggerAbandonedNamed } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "bb8bb233-7cb1-43b3-af30-e71ab9e832c5",
  name: "Sealed Letter",
  imageName: "letter_2.png",
  imageAlt: "dark red sealed envelope tied with ribbon and gold wax seal",
  effectDescription:
    "When you abandon a character, its ▸Dissolved ability triggers an additional time.",
  rarity: "Uncommon",
  tideIds: ["3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3"],
  tags: ["J12", "Tag OK", "Ally Audit"],
  abilities: () => [triggered(whenAbandon(), triggerAbandonedNamed("dissolved"))],
  verifiedText: expectedVerifiedText("When you abandon a character, its ▸Dissolved ability triggers an additional time."),
});
