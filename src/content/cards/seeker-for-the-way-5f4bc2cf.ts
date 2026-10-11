import { conditionCardCounts, energy, reclaim } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Seeker for the Way",
  mtgName: "Scrapwork Mutt",
  id: "5f4bc2cf-4464-409f-acd5-fe4d6df28a05",
  renderedText:
    "▸Materialized: You may discard a card to draw a card.\n\nReclaim 2●",
  amplifiedText:
    "▸Materialized: You may discard a card to draw 2 cards.\n\nReclaim 2●",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Owned"],
  imageNumber: 1913887483,
  artOwned: true,
  cardNumber: 92,
  isStarter: false,
  abilities: (variant) => [
    triggered(
      onMaterialized(),
      p.ifThen(conditionCardCounts("hand", 1), p.optional(p.sequence(p.discard(1), p.draw(variant.amplified ? 2 : 1)))),
    ),
    reclaim(energy(2)),
  ],
  verifiedText: "fk75y40g64",
});
