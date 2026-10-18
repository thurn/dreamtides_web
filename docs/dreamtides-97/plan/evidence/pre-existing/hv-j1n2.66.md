# Pre-existing issues found in hv-j1n2.66

- **The development dream's map is outside the map catalog.** The synthetic
  development map (`src/d97/overworld/dev-map.ts`) is 110×110 and its dream
  (`src/content/d97/dreams/development.ts`) names no town, so it would fail
  the P13 size and P33 town rules. `npm run d97:map -- validate --all` covers
  only the catalog's dream and example maps, and no test validates the
  development map, so nothing reports it. A later bead can either compact it
  and name its town, or record it as exempt development scaffolding.
