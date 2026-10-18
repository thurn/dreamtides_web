# Dreamtides 97: Art coverage

Which local LPC art covers each tileset, for the map beads of Phase 3 and
later ([§B1](appendix-b-dreams.md#b1-tilesets-and-maps),
[Building maps](overworld-visual-guide.md#building-maps)). Every source
named here is pinned in `src/content/d97/art-sources.ts` and lives under
`~/Documents/lpc/<directory>/`; all of it is served, so no stamp or crop below
trips the `tileset-unserved` validator rule.

## How to read this

- **Crop** names a Tiled map and a tile rectangle (`x1–x2, y1–y2`, source
  coordinates) worth starting from. Preview it first:
  `npm run d97:map -- preview <path.tmx> --rect x,y,w,h --scale 0.5`.
- **Compose** means a blank canvas (`npm run d97:map -- compose`) painted
  with catalog terrains and stamps.
- **Stamps** lists catalog stamps by name (`npm run d97:map -- stamps list
  --theme <theme>`); new ones from the Act 1 art pass are marked *new*.

## Constraints that shape every path

- **Map sources are Tiled maps or blank canvases.** The LPC Revised
  four-season demo map and test landscape (`lpc-revised/_ Test Scenes/`)
  ship as PNGs only, so they are references, not sources. A "backdrop"
  tileset is composed from LPC Revised terrain on a blank canvas, or cropped
  from a Source of Tales, Big Island or Neverwell Moor map.
- **Reseasoning remaps LPC Revised sheets only** (terrain, cliffs, plants,
  trees, wildflowers). The Source of Tales, Big Island and Neverwell Moor
  maps draw with Source of Tales-era sheets, so a crop of them keeps its
  summer look; a reseasoned dream is a composed one.
- **The terrain catalog** holds LPC Revised grass, snow, dirt, sand, cobbles
  and water, and LPC Tile Atlas grass, meadow, dirt, red dirt, sand, cave
  stone, water, lava and pits. Cliffs and ice have no catalog terrain yet;
  a winter dream with cliffs adds them as terrains first
  (`lpc-revised/Terrain/cliff_winter.png`, `terrain_winter_ice.png`).
- **Already used.** The first dream crops Mountainwatch `48–157, 51–160`;
  its pub room crops `goldenfields/pub.tmx`. Later crops avoid that area.

## Large source maps

| Map | Size | What it holds |
| --- | --- | --- |
| `source-of-tales/maps/mountainwatch/main.tmx` | 200×200 | Pine forest and dirt ridges; brick town `92–129, 60–102`; walled farm `164–195, 6–44`; graveyard in pines `140–158, 10–24`; mine pit `19–42, 80–101`; lava cave with the ember arch `35–62, 160–180`; wheat and tilled fields `34–109, 117–155`; rivers and a stone bridge |
| `source-of-tales/maps/goldenfields/main.tmx` | 200×200 | Pale castle with blue spires `39–105, 11–68`; sandy desert cliffs along the top `20–200, 0–17`; shrine pier and torii on the river `140–157, 20–36`; farm village `105–168, 22–125`; riverside tents `3–18, 62–112`; woodland cottage `41–53, 115–126`; cave mouth `184–191, 104–112`; sea below row 130 |
| `big-island/resources/map2.tmx` | 300×300 | An island: harbor village with two docks and rowboats `0–40, 195–235`; hill mining town `51–115, 15–67`; lake with an island village `108–194, 84–178`; pine forest `144–273, 12–133`; oak forest `39–170, 163–263`; wheat and a village `226–290, 161–229`; long beach `108–248, 245–279`; tents `56–74, 242–250` |
| `neverwell-moor/resources/map/earth.tmx` | 128×128 | Pale manor with an iron fence `105–124, 85–105`; windmill `102–110, 65–75`; fenced cottage `92–101, 88–101`; dark lake with a sandstone ruin `46–63, 50–66`; orchard `75–120, 37–65`; sand beaches `5–50, 80–125` |
| `source-of-tales/maps/goldenfields/cave.tmx`, `cave3.tmx`, `mountainwatch/cave1.tmx` | up to 101×100 | Brown cave tunnels and chambers |
| `source-of-tales/maps/*/house*.tmx`, `pub.tmx`, `casern_*.tmx`, `farmhouse*.tmx` | small | Interiors for rooms |

## Coverage by tileset

| Tileset | Category | Path | Sources and maps | Stamps | Gap |
| --- | --- | --- | --- | --- | --- |
| Talking-animal village (Tumbleleaf) | Fantasy | Crop, then stamp | Mountainwatch walled farm or Goldenfields farm village; Big Island village `226–290, 161–229`. Props from `lpc-medieval-village-decorations` | farm cottage, brick house, gabled brick house, paneled house, winch well, signposts, hand cart, market stall, oak tree; *new*: scarecrow, clock oak, garden shed, plank barn, hay lean-to, round hay bale, birdbath | None |
| Graveyard chapel (Hope's End) | Fantasy | Crop, then stamp; or compose (autumn) | Mountainwatch graveyard `140–158, 10–24` (small; extend with stamps); compose with LPC Revised autumn terrain | stone cross, twin headstones, fresh grave, stone tomb, mourning angel, tall cross, stone sarcophagus, dead oak, bare tree; *new*: hooded statue, wolf statue, wrought iron arch (gate door frame), pale gatehouse (arched pale-stone door for the act exit) | No church building ships as one piece; the pale gatehouse stands in for the cathedral door |
| Dwarven forge hall (Frostforge) | Fantasy | Crop a cave, then stamp | Goldenfields or Mountainwatch caves; lava from LPC Tile Atlas; anvils and forge stove in `lpc-medieval-village-decorations` and `lpc-tile-atlas/files/base_out_atlas.png`; snow from `lpc-winter-tiles` | brick archway, brick pillar, iron grate, straw pile, stone idol, stalagmites, snowy firs | No dwarven statuary or forge hall facade |
| Elven realm | Fantasy | Compose | Pale castle pieces (`lpc-tile-atlas2/files/build_atlas.png`, `source-of-tales/tiles/castle_outside.png`), Victorian garden decorations, cherry trees, LPC Revised spring terrain | pale gatehouse, cherry tree, great cherry tree, stone fountain | No elven architecture; a sourcing pass precedes its first dream |
| Space colony (Farpoint Station) | Sci-Fi | Compose | `lpc-goes-to-space`, `lpc-frama-sci-fi-extensions` (its `preview.tmx` is a 16×16 sample) | console desk, cargo pad, bulkhead door, locker bank, exit hatch, sliding door frame; *new*: energy crystal, server rack | No floor-panel terrain in the catalog yet; floors paint as cave stone or need a terrain added from `scifi_space_rpg_tiles_lpcized_0.png` |
| Cyberpunk city (Grid City) | Sci-Fi | Compose | Brick walls from LPC Revised `Structure/Walls`; street props from `lpc-tile-atlas2/files/obj_misk_atlas.png`; LED panels from FraMa | sliding door frame, hand cart; *new*: vending machine, street lamp, burning barrel, junk heap | No neon signage or modern shopfronts; it shares the space pack with Farpoint |
| Post-apocalyptic wasteland (The Rust Expanse) | Sci-Fi | Compose (desert theme) | Sand and red dirt terrains, `lpc-beach-desert` bones and dead trees, Goldenfields tents | canvas tent, great ribcage, saguaro cactus, exit hatch (bunker door), dead oak; *new*: junk heap, burning barrel | None |
| Egypt (Pharaoh's Gate) | Historic | Crop, then stamp; or compose (desert theme) | Goldenfields desert cliffs `20–200, 0–17`; `lpc-adobe-town-set`, `lpc-beach-desert` | adobe dome, canvas awning, palm tree, tall palm, saguaro cactus, guardian lion, stone idol; *new*: columned portico (temple entrance) | No obelisk, sphinx or pyramid |
| Viking (Winterwake Fjords) | Historic | Compose (winter theme) | LPC Revised winter terrain, cliffs and ice; `lpc-winter-tiles` | snowy fir, snowy fir pair, small snowy fir, frosted oak, snow-laden pine, timber hut | No longhouse or longship; cliffs and ice need catalog terrains |
| Samurai Japan (Tsukiren) | Historic | Crop, then stamp | Goldenfields shrine pier and river `130–175, 10–45` | torii gate, cherry tree, great cherry tree, guardian lion, stone lantern, shrine pier; *new*: sampan boat | No standalone shoji house (the shrine pier carries one) |
| Pirate island | Historic | Crop, then stamp | Big Island harbor `0–40, 195–235` and beach `108–248, 245–279`; `lpc-beach-desert` shells and palms | palm tree, tall palm; *new*: rowboat, sampan boat | No ship, cannon or pirate dressing |
| Enchanted forest (Wilderveil) | Nature | Crop; or compose (spring) | Mountainwatch forest edges outside the first dream's crop; Big Island oak forest `39–170, 163–263`; LPC Revised spring terrain and mushrooms | oak tree, tall oak, pine tree, bare tree, boulder, flat rock; *new*: clock oak | None |
| Meadow | Nature | Crop; or compose (summer) | Big Island west grassland and pine forest; Neverwell Moor orchard; LPC Tile Atlas flower meadow | oak tree, tall oak, boulder, flat rock; *new*: scarecrow, round hay bale | None |
| Snowfield | Nature | Compose (winter theme) | LPC Revised winter terrain, `lpc-winter-tiles` | the winter stamps | None |

## Act 1

Act 1 needs about eight dreams over at least three categories
([3.19](plan/phase-3-act-one.md#319-catalog-dreams)). The local library
covers these without new sources:

- **Nature:** a meadow and Wilderveil, both crops (Big Island, Mountainwatch
  forest edges).
- **Fantasy:** Tumbleleaf, a farm crop dressed with the new village stamps;
  Hope's End, the Mountainwatch graveyard crop or a composed autumn
  churchyard, with the pale gatehouse as its act-exit door.
- **Historic:** Tsukiren, the Goldenfields shrine crop with the sampan on the
  river; Pharaoh's Gate, the Goldenfields cliffs or a composed desert with the
  columned portico; the pirate island, the Big Island harbor crop.
- **Sci-Fi:** The Rust Expanse, Farpoint Station or Grid City, composed.

The gaps in the table (elven architecture, neon city fronts, Viking,
Egyptian and pirate set pieces) leave Act 1's dreams buildable; a sourcing
pass for them comes before a dream that needs them.
