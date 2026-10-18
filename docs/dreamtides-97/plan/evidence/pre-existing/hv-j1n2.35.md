# Pre-existing issues found in hv-j1n2.35

- The overworld visual guide's Backdrop maps section and its tileset table
  ("Backdrop (winter)", "Backdrop (spring)", "Backdrop (summer)") treat the
  LPC Revised four-season demo map as a map source. The local library holds
  that map only as PNGs (`lpc-revised/_ Test Scenes/DemoGame - *.png`), and
  a map module's source is a Tiled map or a blank canvas
  (`src/d97/map/definition.ts`), so those tilesets are composed from LPC
  Revised terrain or cropped from other Tiled maps instead.
  `docs/dreamtides-97/art-coverage.md` records the paths in use.
- The same section calls a crop of Source of Tales, Big Island or Neverwell
  Moor reseasonable, but `reseason` remaps LPC Revised sheet families only
  (`src/content/d97/terrains/seasons.ts`), and none of those Tiled maps draws
  with LPC Revised sheets.
