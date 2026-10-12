import { activated, characterYouControl, energy, exhaustSelf } from "../../engine/dsl/builders";
import { triggered, whenScores } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import outsider from "../figments/outsider-bf9ccca0";

export default card({
  name: "Dustway Ringleader",
  mtgName: "Kaito Shizuki",
  id: "8e003d04-e489-4c55-9c72-fc5612909d07",
  renderedText:
    "3●, ☾: Materialize a 1✦ outsider figment.\n\nWhen an outsider you control scores ⍟, draw a card and gain 2⍟.",
  amplifiedText:
    "3●, ☾: Materialize a 2✦ outsider figment.\n\nWhen an outsider you control scores ⍟, draw a card and gain 2⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Ally Audit", "Art OK"],
  imageNumber: 678431947,
  artOwned: false,
  cardNumber: 241,
  art: { x: -0.541, y: 0.18, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [
    activated(
      [energy(3), exhaustSelf()],
      p.materializeFigments(parseFigmentId(outsider.id), 1, { spark: variant.amplified ? 2 : 1 }),
    ),
    triggered(
      whenScores(characterYouControl({ subtype: "Outsider" })),
      p.sequence(p.draw(1), p.gainPoints(2)),
    ),
  ],
  verifiedText: "aquk0s4rm9",
});
