import { abandonCost, activated, countersCost, energy } from "../../engine/dsl/builders";
import { materializeFigments, storeCounters } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import warrior from "../figments/warrior-bb1a5acd";

export default card({
  name: "Grim Recruiter",
  mtgName: "Spawning Pit",
  id: "cf173b05-7bf2-465b-91e2-41f213c536d1",
  renderedText:
    "Abandon a character: Store 1⧗.\n\n2●, 2⧗: Materialize two 1✦ warrior figments.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Figment Maker", "Art Rework", "Art OK"],
  imageNumber: 492981619,
  artOwned: false,
  cardNumber: 480,
  art: { x: 0.353, y: 0.266, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    activated([abandonCost()], storeCounters(1)),
    activated([energy(2), countersCost(2)], materializeFigments(parseFigmentId(warrior.id), 2, { spark: 1 })),
  ],
  verifiedText: "12usqe9prdp",
});
