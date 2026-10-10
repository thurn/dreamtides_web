# hv-n5lj.47 pre-existing issues

## The missing Begin in hv-n5lj.44's tutorial walk

The front door has not changed: `/main` shows New Journey, which leads to
`/loading`, whose Begin shows after `LOADING_SCREEN_DURATION_MS`. No
front-door file changed between `30f060ca2` and staging `1cdc46246`
(`MainMenuScreen`, `LoadingScreen`, `FrontDoorRouter`, `rules/front-door.ts`,
their adapters, `game-selection.ts`, and `root-router.tsx`). The hv-n5lj.8
walk, unchanged apart from the per-viewport split hv-n5lj.44 made
(`artifacts/qa/hv-n5lj.47/old-walk.mjs`), passes on `1cdc46246` with every
beat checked (`old-walk.result.json`).

The hv-n5lj.44 run failed because its served checkout changed under it. Its
server log (`artifacts/qa/hv-n5lj.44/tutorial-walk.server.log`) shows two
hot-update waves, at 9:58:27 and 9:58:39, during the walk (9:58:18 to
9:59:10). Each wave covers the importers of the typed token mirror
`src/cumulus/primitives/tokens.ts`, `LoadingScreen` and `MainMenuScreen`
among them. No other runner's report on that checkout overlaps the walk, so
something else ran `scripts/prepare-workspace.mjs` there (`npm test`,
`npm run review`, a build, and every dev server run it).

Two pre-existing behaviours turn that into a reset to the main menu:

- **`scripts/generate-cumulus-tokens.mjs` writes `tokens.ts` even when its
  content is unchanged.** Every `prepare-workspace` run on a checkout that a
  dev server serves sends that server a hot update of every token importer.
  A write-if-changed in the generator would remove the waves; the generator
  is outside this bead's areas.
- **A hot update that remounts the app restarts the game from the URL the
  page loaded with.** `root-router.tsx` parses `window.location.search` once,
  before the session adds `game=`. With a `?seed=` entry the remounted session
  creates a fresh game on `/main`. `artifacts/qa/hv-n5lj.47/begin-probe.mjs`
  reproduces it: one `node scripts/generate-cumulus-tokens.mjs` while the
  game sat on `/loading?seed=1&game=jspndi` moved it to
  `/main?seed=1&game=usztnf` with no navigation. A reload of
  `/loading?seed=1&game=…` keeps the game on the loading screen
  (`reload-probe.mjs`), so this is a development-only effect.

A third, milder effect: saving any file the dev server watches outside the
module graph reloads the page. A `touch README.md` during
`begin-probe.mjs` reloaded `/loading?seed=1&game=cye7wn` (a new navigation,
same game), and a README edit during this bead's first desktop run of
`tutorial-walk` failed it with "Execution context was destroyed"
(`tutorial-walk-desktop-run1.result.json`); the three runs that followed,
with the checkout left alone, passed.

The hv-n5lj.44 note's "the current main menu does not show Begin" is this
reset: the walk waited on a main menu it had been sent back to. The README's
Scenario runner section says to run and edit nothing on a checkout a runner
serves.
