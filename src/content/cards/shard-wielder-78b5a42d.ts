import { ofSubtype } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { drawMatching } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Shard Wielder",
  mtgName: "Thraben Inspector",
  id: "78b5a42d-b099-48f1-a1b4-5b6bc177adeb",
  renderedText: "▸Materialized: Draw a warrior.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Rework", "Art OK", "tutorial"],
  imageNumber: 2191235669,
  artOwned: false,
  cardNumber: 59,
  art: { x: -0.458, y: 1, scale: 1.47 },
  isStarter: false,
  abilities: () => [triggered(onMaterialized(), drawMatching(ofSubtype("Warrior")))],
  verifiedText: "26wnwlxvceh",
});
