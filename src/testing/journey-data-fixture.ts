import type { JourneyData } from "../types/journey-data";

export const JOURNEY_DATA_FIXTURE: JourneyData = {
  schemaVersion: 1,
  contentHash: "e".repeat(64),
  presentation: {
    start: {
      title: "Choose Your Avatar",
      chooseAction: "Choose",
      rerollAction: "Reroll Avatars",
    },
    startingDeck: {
      title: "Starting Deck",
      subtitle: "These are the cards you begin the journey with.",
      emptyState: "No cards in starting deck.",
      beginAction: "Begin Journey",
    },
    dreamsignReplacement: {
      title: "Choose a Dreamsign to Replace",
      newDreamsignLabel: "New Dreamsign",
      replaceAction: "Replace",
      keepCurrentAction: "Keep Current Dreamsigns",
    },
  },
};
