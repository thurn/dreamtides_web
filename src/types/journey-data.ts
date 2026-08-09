export interface JourneyData {
  schemaVersion: 1;
  contentHash: string;
  presentation: {
    start: { title: string; chooseAction: string; rerollAction: string };
    startingDeck: {
      title: string;
      subtitle: string;
      emptyState: string;
      beginAction: string;
    };
    dreamsignReplacement: {
      title: string;
      newDreamsignLabel: string;
      replaceAction: string;
      keepCurrentAction: string;
    };
  };
}
