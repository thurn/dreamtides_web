import { activated, exhaustSelf, keyword } from "../../engine/dsl/builders";
import { atEndOfTurn } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import ember from "../figments/ember-361b4942";

export default card({
  name: "Pyre Wight",
  mtgName: "Chandra, Acolyte of Flame",
  id: "5a27e236-86d7-442f-81d2-fb29a2b7f12a",
  renderedText:
    "Awakened\n\n☾: Materialize two 1✦ ember figments with awakened. Abandon them at end of turn.",
  amplifiedText:
    "Awakened\n\n☾: Materialize two 2✦ ember figments with awakened. Abandon them at end of turn.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Figment Maker", "Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 712713349,
  artOwned: false,
  cardNumber: 101,
  art: { x: -0.042, y: 0.897, scale: 1.07 },
  isStarter: false,
  abilities: (v) => [
    keyword("awakened"),
    activated(
      [exhaustSelf()],
      p.withMaterialized(
        p.materializeFigments(parseFigmentId(ember.id), 2, { spark: v.amplified ? 2 : 1 }),
        p.delayed(atEndOfTurn(), p.abandonCards([p.capturedCards()])),
      ),
    ),
  ],
  verifiedText: "ovv2n8zl6w",
});
