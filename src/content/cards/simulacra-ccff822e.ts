import { activated, characterYouControl, energy, exhaustSelf, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Simulacra",
  mtgName: "Saheeli, Sublime Artificer",
  id: "ccff822e-e2ae-4d38-9720-6df289dbe4cd",
  renderedText:
    "2●, ☾: Materialize a figment copy of a character you control until end of turn.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Ally Audit"],
  imageNumber: 443761831,
  artOwned: false,
  cardNumber: 260,
  isStarter: false,
  abilities: () => [
    activated(
      [energy(2), exhaustSelf()],
      p.materializeFigmentCopy(target(characterYouControl()), { untilEndOfTurn: true }),
    ),
  ],
  verifiedText: "1lzz5h6l6t0",
});
