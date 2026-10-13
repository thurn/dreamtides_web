/** Player-facing journeySites copy shared by the site builders. */
export const JOURNEY_SITE_MESSAGES = {
  randomTransfigurationTitle: "Transfigure Cards",
  randomTransfigurationInstruction: (count: number) => `You may apply a random transfiguration to up to ${String(count)} cards after this battle.`,
  continue: "Continue",
  transfigureCount: (count: number) => `Transfigure ${String(count)}`,
  remainingTransfigurations: (count: number) => `You may transfigure ${String(count)} more ${count === 1 ? "card" : "cards"} here.`,
  reroll: "Reroll Exploration",
  enhanced: "This site is enhanced.",
} as const;
