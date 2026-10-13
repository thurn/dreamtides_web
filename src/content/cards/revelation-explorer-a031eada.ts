import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { discover } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Revelation Explorer",
  mtgName: "Spellseeker",
  id: "a031eada-2c47-49c6-8c19-d2fe85f8ce97",
  renderedText: "▸Materialized: Discover a ≤2● cost event.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: false,
  spark: 2,
  tags: ["Discover", "Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 2191235665,
  artOwned: false,
  cardNumber: 250,
  art: { x: 0.11, y: -0.1, scale: 1.67 },
  isStarter: false,
  abilities: () => [triggered(onMaterialized(), discover({ cardType: "event", costAtMost: 2 }))],
  verifiedText: expectedVerifiedText("▸Materialized: Discover a ≤2● cost event."),
});
