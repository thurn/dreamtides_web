import { activated, exhaustSelf } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Echo Technician",
  mtgName: "Emry, Lurker of the Loch",
  id: "cd3d8e4a-618e-4c2f-be60-0363b81887f1",
  renderedText:
    "▸Materialized: Erode 4.\n\n☾: You may play an event from your void.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Tinkerer",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Self-Mill", "Art Rework", "Art OK"],
  imageNumber: 1983798665,
  artOwned: false,
  cardNumber: 291,
  isStarter: false,
  abilities: () => [
    triggered(onMaterialized(), p.erode(4)),
    activated([exhaustSelf()], p.playFromZone("void", { cardType: "event" }, { next: true })),
  ],
  verifiedText: "172r3zv14di",
});
