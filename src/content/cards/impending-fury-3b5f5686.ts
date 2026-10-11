import { characterYouControl, controls } from "../../engine/dsl/builders";
import { onNight, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Impending Fury",
  mtgName: "Kaito Shizuki",
  id: "3b5f5686-f63b-4998-b713-2f6777ecbb5f",
  renderedText:
    "▸Night: Draw a card, then discard a card unless you control a challenger.",
  amplifiedText:
    "▸Night: Draw a card, then discard a card unless you control a challenger or blocker.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "Ally Audit"],
  imageNumber: 695511856,
  artOwned: true,
  cardNumber: 240,
  art: { x: -0.084, y: 0.369, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => {
    // "Discard a card unless you control a challenger or blocker": each role, checked as the discard would happen, skips it.
    const unlessBlocker = variant.amplified
      ? p.ifThen(controls(characterYouControl({ blocking: true })), p.sequence(), p.discard(1))
      : p.discard(1);
    const unlessChallenger = p.ifThen(controls(characterYouControl({ challenging: true })), p.sequence(), unlessBlocker);
    return [triggered(onNight(), p.sequence(p.draw(1), unlessChallenger))];
  },
  verifiedText: "1u91iq6cr5p",
});
