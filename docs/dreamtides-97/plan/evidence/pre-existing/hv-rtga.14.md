# Pre-existing issues found by hv-rtga.14

## The overworld skips tilesets that omit `columns` and `tilecount`

- **Where:** `frames()` in `src/d97/overworld/tile-textures.ts`.
- **What:** it cuts frames from `tileset.columns` and `tileset.tileCount`
  as compiled. Older Tiled tilesets leave both out, so they compile as 0.
  Source of Tales' `tiles/terrain.tsx` is one; every Mountainwatch and
  Goldenfields crop uses it for its base ground. The renderer then makes no
  frames for that sheet and draws placeholder ground under the map's props.
  It logs no `d97_overworld_art_missing`, because the image itself loads.
- **Evidence:** the first dream's map (`3229d6c7-…`) in the browser draws
  flat placeholder checks where its grass and dirt should be. The map tools
  draw it correctly: the previews derive the grid with `tilesetGrid` in
  `src/d97/map/stamps.ts`.
- **Fix:** derive the grid with `tilesetGrid`, as the preview does. A local
  trial of that one change drew the map correctly. It is outside this bead's
  areas, so it is not part of this commit.
