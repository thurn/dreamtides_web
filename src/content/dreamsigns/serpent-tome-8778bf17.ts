import { dreamsign } from "../define";
import { staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { costModifierReclaim } from "../../engine/effects/primitives";

export default dreamsign({
  id: "8778bf17-4e0a-4ce7-b23c-4daf49a782a7",
  name: "Serpent Tome",
  imageName: "book_6.png",
  imageAlt: "green book with a coiled serpent embossed on the cover",
  effectDescription: "Reclaim abilities cost you 1● less.",
  rarity: "Uncommon",
  tideIds: [
    "ab89d262-45d4-438d-8670-79d91f6e944f",
    "1a075e25-0344-4103-997c-dd8f8a57c84e",
    "e6863f55-50e7-4c7b-b118-609b5fc5c005",
  ],
  tags: ["Tag OK"],
  abilities: () => [staticAbility(costModifierReclaim("you", { reduce: 1 }))],
  verifiedText: expectedVerifiedText("Reclaim abilities cost you 1● less."),
});
