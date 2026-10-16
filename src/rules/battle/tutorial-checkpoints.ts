import type { TutorialBattlePresentation, TutorialCheckpoint } from "./fold";

/** The durable queue alone determines the presentation currently holding input. */
export function currentTutorialPresentation<P extends TutorialBattlePresentation>(
  host: { readonly checkpoints: readonly TutorialCheckpoint<P>[] } | null | undefined,
): P | null {
  return host?.checkpoints[0]?.presentation ?? null;
}

/** Keep the saved compatibility projection in its existing field order and shape. */
export function tutorialCheckpointQueue<P extends TutorialBattlePresentation>(checkpoints: readonly TutorialCheckpoint<P>[]) {
  return { checkpoints, tutorialPresentation: currentTutorialPresentation({ checkpoints }) };
}
