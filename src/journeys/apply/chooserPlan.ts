// Chooser request / resolution types.
//
// Wave 1 placeholder. The dispatch loop in `applyOption` / `applyBranch`
// already threads an optional `resolutions` map into per-template `apply`
// calls so that future Wave 2 chosen-target templates can read their
// player-supplied resolution without revisiting the dispatch frame.
//
// Wave 1 leaves both aliases as `never`: no Wave 1 template requests a
// chooser, no Wave 1 callsite produces a resolution, and the optional
// `chooserResolution` parameter on `Reward.apply` always resolves to
// `undefined`. Task 20 widens these aliases to concrete shapes alongside the
// `choosePlan` hook.
export type ChooserRequest = never;
export type ChooserResolution = never;
