import { dreamsign } from "../define";
import { staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { costModifierReclaim } from "../../engine/effects/primitives";

export default dreamsign({
  id: "2059aa74-8897-4c76-833f-ddef7d34346c",
  name: "Skull Codex",
  imageName: "book_5.png",
  imageAlt: "black and gray book with skull emblem and bone corner guards",
  effectDescription: "Reclaim abilities cost you 0●.",
  rarity: "Rare",
  tideIds: [
    "e6863f55-50e7-4c7b-b118-609b5fc5c005",
    "1ad97f42-6157-45b3-8290-e27219c7888a",
    "ab89d262-45d4-438d-8670-79d91f6e944f",
  ],
  tags: ["J11", "Tag OK"],
  abilities: () => [staticAbility(costModifierReclaim("you", { set: 0 }))],
  verifiedText: expectedVerifiedText("Reclaim abilities cost you 0●."),
});
