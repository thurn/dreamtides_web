# Remaining gaps recorded by hv-pcce.25

- **No catalog recipe exercises the walk-frame idle yet.** Every recipe in
  `src/content/d97/characters/` resolves with an idle sheet on every layer,
  so no shipped resident carries a prop, tool, weapon, wing or child-body
  layer that lacks one. hv-pcce.25's browser QA added a spear
  (`weapon_polearm_spear`, no idle sheet) to the development knight locally,
  uncommitted, to capture the fallback. The generator has about a hundred
  such sheets (tools, shields, weapons, wings, `legs_childpants`,
  `torso_clothes_child_shirt`, `body_zombie`); recipes may use them now.
- **A walk-frame idle is still.** A layer without an idle sheet holds its
  walk sheet's standing frame through both idle columns, so a prop stays
  put while the body under it plays its two-frame idle. If that sway reads
  as a mismatch, the fix belongs in the art (an idle sheet) rather than the
  renderer.
- **An anchor shown under the player.** When a hidden object becomes shown
  while the player stands on (or is mid-step into) its tile, the step
  finishes and the player stands on the object's tile until they walk off;
  the walk never routes onto a shown anchor otherwise. The quest that shows
  an object starts from a panel, so the player is normally elsewhere.
- **The arrival tile ignores hidden anchors.** The scene places the player
  before the quest marks arrive (`setHiddenAnchors` runs from
  `OverworldCanvas`'s effect after mount), so arrival treats every anchor,
  hidden ones included, as blocking. This is conservative and harmless.
- **`src/cumulus/primitives/lpc-character.ts` reads the manifest by cast.**
  It falls back to the walk sheet for an idle-less layer, but it does not
  check the manifest format the way the overworld's
  `parseCharacterManifest` does.
