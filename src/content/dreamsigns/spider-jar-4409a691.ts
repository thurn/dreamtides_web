import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import warrior from "../figments/warrior-bb1a5acd";
import { dreamsign } from "../define";

export default dreamsign({
  id: "4409a691-49b4-4fb0-82f6-4f45ae86d8c2",
  name: "Spider Jar",
  imageName: "black_widow.png",
  imageAlt: "clear blue jar holding a black spider with red markings",
  effectDescription:
    "When you play your second character each turn, materialize a 1✦ warrior figment.",
  rarity: "Uncommon",
  tideIds: [
    "833ba3dd-498a-42ce-9a03-32f6636acea1",
    "254054e3-1a7c-4bf4-8c30-491fdeeab40c",
    "4b01b6c1-ccca-4e19-848a-d799d46088b2",
  ],
  tags: ["Tag OK"],
  abilities: () => [
    triggered(whenYouPlay({ cardType: "character" }, 2), materializeFigments(parseFigmentId(warrior.id), 1, { spark: 1 })),
  ],
  verifiedText: expectedVerifiedText("When you play your second character each turn, materialize a 1✦ warrior figment."),
});
