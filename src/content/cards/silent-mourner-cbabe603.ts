import { characterYouControl } from "../../engine/dsl/builders";
import { onMaterialized, triggered, whenDissolved } from "../../engine/dsl/triggers";
import { gainPoints, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import ethereal from "../figments/ethereal-3eddb1b8";

export default card({
  name: "Silent Mourner",
  mtgName: "Marionette Apprentice",
  id: "cbabe603-1333-42bd-85c0-555c664b60b3",
  renderedText:
    "▸Materialized: Materialize a 1✦ ethereal figment.\n\nWhen a character you control is dissolved, gain 1⍟.",
  amplifiedText:
    "▸Materialized: Materialize a 2✦ ethereal figment.\n\nWhen a character you control is dissolved, gain 1⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Blood Artist", "Score Trigger", "Art Rework", "Ally Audit", "Art OK"],
  imageNumber: 410444932,
  artOwned: false,
  cardNumber: 50,
  art: { x: -0.2, y: 0.298, scale: 1 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), materializeFigments(parseFigmentId(ethereal.id), 1, { spark: variant.amplified ? 2 : 1 })),
    triggered(whenDissolved(characterYouControl()), gainPoints(1)),
  ],
  verifiedText: "154o9wjfvc7",
});
