# Pre-existing issues found in hv-rtga.21

- **The first dream's `ruleset` tileset never draws.** The compiled first
  dream map lists Source of Tales' automapping `ruleset` tileset
  (`source-of-tales/automapping/ruleset.png`), but workspace preparation links
  only that library's `items`, `sprites` and `tiles` folders, so every load of
  the map logs `d97_overworld_art_missing` with `["ruleset"]` (twice per
  overworld mount in development). The ground draws correctly, so the
  tileset's tiles appear unused in drawn layers; the compiler could drop
  tilesets no drawn layer references, or the art link could include the
  automapping folder.
- **The first dream's arrival sits under the control bar.** A new run
  arrives at the arrival door's entry, the low cave's `[7, 109]` on the map's
  bottom row (the map module's choice); the camera clamps there, so the
  player stands behind the Deck/Quests/Menu bar on both desktop and mobile.
