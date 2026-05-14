/** A structured effect applied when a dream journey is chosen. */
export type JourneyEffect =
  | { type: "addEssence"; amount: number }
  | { type: "removeEssence"; amount: number }
  | { type: "removeRandomCards"; count: number }
  | { type: "addRandomCards"; count: number }
  | {
      type: "addEssenceAndRemoveCards";
      essenceAmount: number;
      removeCount: number;
    }
  | {
      type: "removeCardsAndAddRandomCards";
      removeCount: number;
      addCount: number;
    }
  | { type: "upgradeRandomCards"; count: number }
  /**
   * Bane cards. Dream Journeys are the source of Banes in the run — the
   * negative cost side of a journey's bargain.
   */
  | { type: "addBaneCards"; count: number }
  | {
      type: "addEssenceAndAddBaneCards";
      essenceAmount: number;
      baneCount: number;
    }
  | {
      type: "addRandomCardsAndAddBaneCards";
      addCount: number;
      baneCount: number;
    }
  | { type: "reduceMaxDreamsigns"; amount: number };

/** A dramatic deck-altering event offered at journey sites. */
export interface DreamJourney {
  name: string;
  description: string;
  effect: JourneyEffect;
}

/** The 10 available dream journeys. */
export const DREAM_JOURNEYS: readonly DreamJourney[] = [
  {
    name: "The Drowning Library",
    description:
      "You descend into a submerged archive where ink bleeds from dissolving pages. Three of your cards are lost to the flood, but the waters leave behind concentrated essence.",
    effect: { type: "addEssenceAndRemoveCards", essenceAmount: 200, removeCount: 3 },
  },
  {
    name: "Feast of the Pale Court",
    description:
      "Spectral nobles invite you to dine. Each course strips away a memory, but the feast leaves you brimming with power.",
    effect: { type: "addEssenceAndRemoveCards", essenceAmount: 300, removeCount: 5 },
  },
  {
    name: "The Ember Lottery",
    description:
      "A cloaked figure offers you a fistful of smoldering tickets. Two cards materialize from the flames.",
    effect: { type: "addRandomCards", count: 2 },
  },
  {
    name: "Mirror of Unbecoming",
    description:
      "You gaze into a mirror that reflects not what you are, but what you could have been. Four cards are swept away, dissolved into possibility.",
    effect: { type: "removeRandomCards", count: 4 },
  },
  {
    name: "The Wanderer's Toll",
    description:
      "A giant carved from driftwood blocks the path. Pay its toll in essence and it grants safe passage through treacherous dreamscapes ahead.",
    effect: { type: "removeEssence", amount: 100 },
  },
  {
    name: "Garden of Crystallized Thought",
    description:
      "Frozen ideas bloom like gemstones in an impossible garden. You harvest three cards from the crystalline branches.",
    effect: { type: "addRandomCards", count: 3 },
  },
  {
    name: "Descent into the Sable Marrow",
    description:
      "You plunge into the bone-deep dark beneath the dreamscape. Three of your cards are transfigured by the pressure into something stronger.",
    effect: { type: "upgradeRandomCards", count: 3 },
  },
  {
    name: "The Shattered Hourglass",
    description:
      "Time fragments scatter across the ground. You gather enough sand to fuel your journey, essence condensing from broken moments.",
    effect: { type: "addEssence", amount: 250 },
  },
  {
    name: "Pact of the Drowned Stars",
    description:
      "Fallen constellations whisper bargains from beneath black water. You surrender two cards and an unfamiliar champion rises from the drowned sky in return.",
    effect: { type: "removeCardsAndAddRandomCards", removeCount: 2, addCount: 1 },
  },
  {
    name: "The Flensing Wind",
    description:
      "A howling gale strips away everything inessential. Two cards are torn from your deck, but the wind deposits a single card in their place.",
    effect: { type: "removeCardsAndAddRandomCards", removeCount: 2, addCount: 1 },
  },
  {
    name: "The Gilded Maw",
    description:
      "A river of liquid gold pours from a crack in the dream. You drink deep and gain essence, but the gold carries a curse — bane cards seep into your deck.",
    effect: {
      type: "addEssenceAndAddBaneCards",
      essenceAmount: 300,
      baneCount: 3,
    },
  },
  {
    name: "Pact of the Vault Guardian",
    description:
      "A spectral merchant offers two cards from a locked vault. The vault's guardian marks your soul in exchange — two bane cards join your deck.",
    effect: {
      type: "addRandomCardsAndAddBaneCards",
      addCount: 2,
      baneCount: 2,
    },
  },
  {
    name: "The Toxic Hoard",
    description:
      "The dreamscape peels back to reveal a trapped hoard of essence. You flee with the gold as four bane cards latch onto your deck.",
    effect: {
      type: "addEssenceAndAddBaneCards",
      essenceAmount: 400,
      baneCount: 4,
    },
  },
  {
    name: "The Weeping Idol",
    description:
      "A weeping idol grants a surge of raw power. Its corrosive tears narrow the mind — your maximum dreamsign capacity is reduced.",
    effect: { type: "reduceMaxDreamsigns", amount: 2 },
  },
] as const;
