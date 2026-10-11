# Pre-existing observations for hv-4a0x

- The debug probe's event history (`window.__engineProbe.events`,
  `src/battle/components/EngineDebugPanel.tsx`) holds only the engine events
  published after the lazily loaded debug panel mounts. In a card-lab stage
  whose declared enemy script plays at load, the enemy's `cardPlayed` and
  payment events for the staged instance are absent from it (observed: an
  empty instance-scoped history for `i10` after the play). The judged
  opponent scenario therefore asserts the play from the committed state
  (zone and energy) and the durable game log. This is QA tooling outside this
  bead's Areas.
- A declared enemy whose optional payment is unaffordable is never asked:
  the engine declines without a `payOrDecline` prompt, so the opponent's
  decline path has no policy decision to judge, and Greedy pays whenever the
  payment is affordable.
