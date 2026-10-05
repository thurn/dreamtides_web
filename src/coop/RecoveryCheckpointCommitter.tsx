import type { ReactNode } from "react";

/**
 * Screen-level checkpoint marker. Renders nothing: a local game persists its
 * fold checkpoints through its event log (src/session/local-game.ts).
 */
export function RecoveryCheckpointCommitter(_props: {
  readonly sourcePath: string;
}): ReactNode {
  return null;
}
