# Pre-existing observations

- `src/draft/draft-engine.ts`, `processPlayerPickInternal`: the logging-enabled public engine path includes `cardName` in its `draft_pick_player` diagnostic. The journey reducer uses `processPlayerPickWithoutLogging`, so this path is outside the atomic preparation and effective-mode repair. The diagnostic differs from the repository's UUID-only logging invariant.
- `src/screens/cumulus_adapters/DreamscapeScreenAdapter.tsx`, `loggedNodeRef`: the once-per-node overview guard stores a branded `AtlasNodeId` in `useRef<string | null>`. Its value originates in `node.id`; its declaration uses a raw string type. The admitted caller repair preserves this existing once-only guard.

- Existing mobile tutorial guidance can overlap first-row draft titles, and the standard transient bounce toast can cover the HUD after a denied action. The repair changes settlement/recovery, not these overlay bodies. Captures `entry-recovered-same-mount-mobile.png` and `draft-denied-restored-mobile.png` show these bounded observations; card centers remain usable and no new layout defect is claimed.
