import { activated, energy } from "../../engine/dsl/builders";
import { triggered, whenAbandon } from "../../engine/dsl/triggers";
import { abandon, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import monstrosity from "../figments/monstrosity-ec9f97b2";
import { card } from "../define";

export default card({
  name: "Carrion Lord",
  mtgName: "Baloth Prime",
  id: "a5056a4c-542b-4a7c-8fe6-895126c7d4c8",
  renderedText:
    "When you abandon a ≤2● cost character, materialize a 4✦ monstrosity figment.\n\n4●: Abandon a ≤2● cost character.",
  amplifiedText:
    "When you abandon a ≤2● cost character, materialize a 5✦ monstrosity figment.\n\n4●: Abandon a ≤2● cost character.",
  energyCost: 6,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 6,
  tags: [],
  imageNumber: 1716379555,
  artOwned: false,
  cardNumber: 340,
  art: { x: -0.084, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    triggered(whenAbandon("you", { costAtMost: 2 }), materializeFigments(parseFigmentId(monstrosity.id), 1, { spark: variant.amplified ? 5 : 4 })),
    activated([energy(4)], abandon("you", { costAtMost: 2 })),
  ],
  verifiedText: "2fs40zajnlm",
});
