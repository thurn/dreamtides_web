import { characterYouControl, controls, ofSubtype, target } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { gainSpark, ifThen, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import wraith from "../figments/wraith-c5a98a5b";
import { card } from "../define";

export default card({
  name: "Ghostcaller",
  mtgName: "Ophiomancer",
  id: "f7084ba7-8c85-4847-80df-b0c98ec77d78",
  renderedText:
    "▸Dawn: Give a wraith you control +1✦. If you control no wraiths, materialize a 0✦ wraith figment with vengeful instead.",
  amplifiedText:
    "▸Dawn: Give a wraith you control +2✦. If you control no wraiths, materialize a 0✦ wraith figment with vengeful instead.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Ally Audit", "Art OK"],
  imageNumber: 478671154,
  artOwned: false,
  cardNumber: 479,
  art: { x: 0.062, y: 0, scale: 1.67 },
  isStarter: false,
  abilities: (variant) => [triggered(onDawn(), ifThen(
    controls(characterYouControl(ofSubtype("Wraith"))),
    gainSpark(target(characterYouControl(ofSubtype("Wraith"))), variant.amplified ? 2 : 1),
    materializeFigments(parseFigmentId(wraith.id), 1, { spark: 0 }),
  ))],
  verifiedText: "tztfrgrzhp",
});
