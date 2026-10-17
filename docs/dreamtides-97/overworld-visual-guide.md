# Dreamtides 97: Overworld visual guide

**Status:** the look of the web prototype of the D97 overworld. It belongs
with the [design overview](README.md); the D97 stream builds it under
[its plan](plan/README.md), whose [decisions](plan/decisions.md) bind where
they differ from this page.

This guide sets the look of the prototype's overworld: the pixel-art dreams,
the characters standing in them, and the markers that make D97's rules
readable at a glance. The goal is to get the gameplay idea across, not to
preview the final art. The prototype does not try to match the planned 3D
tileset themes.

[Back to the design overview](README.md)

**About the images.** The pictures on this page are local illustrations in the
gitignored [`visual-guide/`](visual-guide/) folder beside this file. They are
composed from Liberated Pixel Cup art and are never committed (invariant
"Never commit image files"). A checkout without them shows broken image links;
the text stands on its own. Some illustrations label a traversed door or the
title chip with a tileset name to orient the reader; in game, dreams have no
names, and a traversed door shows at most a thumbnail of its destination's
art.

## Contents

1. [Principles](#principles)
2. [Art source: Liberated Pixel Cup](#art-source-liberated-pixel-cup)
3. [Rendering stack](#rendering-stack)
4. [Building maps](#building-maps)
5. [Shared visual language](#shared-visual-language)
6. [Prototype tilesets](#prototype-tilesets)
7. [Characters](#characters)
8. [The React overlay](#the-react-overlay)
9. [Asset pipeline](#asset-pipeline)
10. [Open questions](#open-questions)
11. [Attribution](#attribution)

## Principles

1. **Rules first, scenery second.** Every rule the player must reason about
   (who can be fought, what a door is, where the waypoint is, who blocks a
   door) has one marker that reads the same in every tileset.
2. **Doors look like dreams.** A door's frame belongs to its tileset, but its
   opening always holds the same swirling dream veil, so a door never looks
   like scenery.
3. **One art style, many genres.** All art is 32×32 LPC pixel art in a
   three-quarter top-down view, so a dwarven forge and a space station can sit
   one door apart without clashing.
4. **Cheap to author.** A dream map is a crop of an existing LPC Tiled map
   with a committed recipe of typed edits. Agents write and review the recipe
   as text, and read the map back through rendered previews.
5. **React for UI, Pixi for the world.** The world canvas draws only the map,
   characters and markers. Every panel, button and card is existing Cumulus UI.

## Art source: Liberated Pixel Cup

The prototype uses art from the [Liberated Pixel
Cup](https://lpc.opengameart.org/) (LPC) and its community extensions. LPC
gives D97 a large, consistent library: terrain, buildings and props in many
genres, and a character generator with thousands of layered parts.

| Pack | Used for | License |
| --- | --- | --- |
| [LPC Tile Atlas](https://opengameart.org/content/lpc-tile-atlas) | Grass, dirt, sand, water, lava, cliffs, trees, rocks, stone floors, bridges, chests, farm plots | CC-BY-SA 3.0, GPL 3.0 |
| [LPC Tile Atlas2](https://opengameart.org/content/lpc-tile-atlas2) | Houses, roofs, cathedral, castle tower, torii, stone lantern, guardian lion, shoji walls, cherry trees, graves, boats, market props, vending machines, street lamps | CC-BY-SA 3.0, GPL 3.0 |
| [[LPC] Beach / Desert](https://opengameart.org/content/lpc-beach-desert) | Palms, cacti, bones, dead trees, dunes | CC-BY-SA 3.0 |
| [[LPC] Adobe Town Set](https://opengameart.org/content/lpc-adobe-town-set) | Columned temple, adobe walls, awnings | CC-BY 3.0, GPL, OGA-BY 3.0 |
| [LPC Winter Tiles](https://opengameart.org/content/lpc-winter-tiles) | Snow and ice ground, snowy pines | CC-BY 3.0, CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0 |
| [LPC goes to space](https://opengameart.org/content/lpc-goes-to-space) and [[LPC] FraMa sci-fi extensions](https://opengameart.org/content/lpc-frama-sci-fi-extensions) | Station floors and walls, airlocks, consoles, crystals, LED walls, the waypoint obelisk | CC-BY-SA 4.0, GPL 3.0 |
| [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) | Every character sprite | Per part: CC0, CC-BY, CC-BY-SA, OGA-BY, GPL (its `CREDITS.csv`) |
| [LPC Revised](https://github.com/ElizaWy/LPC) by ElizaWy and contributors | Pre-composed backdrop maps in four seasons; terrain for reseasons | CC-BY 3.0, OGA-BY 3.0 |
| [Source of Tales](https://gitlab.com/tales/sourceoftales) | Source Tiled maps: the 200×200 Mountainwatch and Goldenfields maps, caves and interiors | CC-BY-SA 3.0, GPL 3.0 |
| [Big Island](https://github.com/seveibar/liberated-pixel-cup) and [Neverwell Moor](https://github.com/blipjoy/nm-prototype) | Further source Tiled maps | CC-BY-SA 3.0, GPL 3.0 |

**What the licenses require.**

- **Credit every author.** Every source's license and authors are recorded in
  the committed manifest `src/content/d97/art-sources.ts`, and the build
  ships a credits screen generated from it, with the character generator's
  `CREDITS.csv` filtered to the parts in use.
- **Any license is acceptable,** NC and ND included, because D97 is a
  non-commercial prototype.
- **Share-alike.** Edited maps of CC-BY-SA art are CC-BY-SA too. They are
  compiled locally and kept out of the repository, like all art.

**Storage.** The art lives in the local art library (`~/Documents/lpc/`) and
is linked into the gitignored `public/` tree by `scripts/setup-assets.ts`,
exactly like card art. Conversions, such as magenta-key transparency to
alpha, write into the library, never into the repository.
With the art missing, the overworld renders flat placeholder tiles and
colored capsule characters, and stays playable.

## Rendering stack

The overworld is a [PixiJS](https://pixijs.com/) v8 canvas mounted with
[`@pixi/react`](https://react.pixijs.io/) v8, which supports the client's
React 19.

```text
<D97OverworldScreen>                 React, Cumulus screen
  <PixiApplication>                  @pixi/react canvas, fills the screen
    <Camera>                         follows the player, pixel-crisp zoom
      <GroundLayer/>                 the compiled map's Tiled tile layers
      <SortedLayer/>                 props, characters, door frames: y-sorted
      <AbovePlayerLayer/>            layers the map module marks: treetops, roofs
      <MarkerLayer/>                 head icons, veils, motes, thumbnails
  </PixiApplication>
  <OverworldHud/>                    React: act chip, currencies, controls
  <ChallengePreview/> ...            React: every panel and dialog
</D97OverworldScreen>
```

- **Pixel-perfect scaling.** Textures use nearest-neighbor sampling and every
  map pixel draws as a whole number of device pixels. Desktop zooms 2×.
  Phones zoom at least 1.5×, so a standing character is about 48 CSS pixels
  tall and a comfortable tap target, rounded up to whole device pixels per
  map pixel: 1.5× at a device pixel ratio of 2, 5/3× at 3. A phone too
  narrow for 7 tiles across at that zoom steps down one device pixel at a
  time. Positions round to whole screen pixels.
- **Y-sorting.** Props, door frames and characters sort by the bottom edge of
  their footprint, so the player walks behind a tree trunk and in front of its
  roots. Pixi's `sortableChildren` with `zIndex = footY` does this.
- **Game state stays in the event log.** The canvas renders a derived
  overworld view model: the dream, its anchors' occupants, door states, the
  player's tile. Clicking writes intent events through `src/session/actions.ts`
  (walk to an anchor, step through a door, touch a waypoint). Animation state,
  such as a walk cycle or a bobbing icon, is the only state Pixi owns.
- **Movement.** The player walks at 4 tiles per second. On desktop, WASD or
  the arrow keys walk tile by tile, clicking ground walks there along an A*
  path over the walkability grid, clicking an object walks to it and
  interacts, and E or Space interacts with the faced object. On phones, a tap
  walks or interacts. The walk itself is presentation. The interaction is the
  logged event; returning from a battle places the player beside the opponent,
  and a reload places the player at the last door or waypoint used
  ([Appendix B §B17](appendix-b-dreams.md#b17-state-and-logging)).
- **Camera.** The camera follows the player and never shows the whole of a
  medium map: at 2× on desktop it shows about 30×17 tiles. It keeps the
  player clear of the HUD's control bar.

## Building maps

Appendix B gives each dream a map module: a source map, an edit recipe,
named regions and landmarks, and anchors
([§B1](appendix-b-dreams.md#b1-tilesets-and-maps)). Agents design and edit
every map, so every format and tool suits a model: edits are recipe
operations with coordinates and named stamps, never rows of characters. A
model reads text one row at a time and keeps columns aligned poorly, so no
map's source is a hand-written character grid.

Maps are built in this order of preference:

1. **Crops of existing LPC Tiled maps,** chiefly Source of Tales' 200×200
   Mountainwatch and Goldenfields maps, its caves and interiors, Big Island
   and Neverwell Moor.
2. **Reseasons and edits** of those crops.
3. **New maps composed from named stamps,** for themes no existing map
   covers.

The recipe compiler materializes the edited map and its walkability grid at
workspace preparation, like linked art. Neither source maps nor edited maps
are committed. The renderer draws the compiled Tiled layers, and the layers
the module marks draw above the player.

### Tile-built maps

A map composed from stamps starts from a blank canvas. Its recipe paints
terrain shapes (rectangles, paths, cell lists) with auto-tiling, so a pond or
a dirt road gets LPC's bordered edges without the author drawing them, and
places named stamps by tile coordinate. A crop uses the same operations to
erase, repaint and stamp over its source. Every scene in
[Prototype tilesets](#prototype-tilesets) is drawn this way.

```ts
// A fragment of a map module: a crop of a Source of Tales map, edited.
export default defineDreamMap({
  id: parseDreamMapId("…"),
  source: { kind: "tiled", path: "source-of-tales/maps/…", sha256: parseDreamMapSourceHash("…") },
  recipe: [
    { op: "crop", from: [40, 60], to: [149, 169] },
    { op: "erase", from: [55, 25], to: [64, 30] },
    { op: "stamp", stamp: EMBER_ARCH, at: [58, 26] },
    { op: "paintTerrain", terrain: DIRT, layer: "Ground", shape: { kind: "path", points: [[0, 40], [30, 40]] } },
    { op: "abovePlayer", layer: "Over" },
    { op: "block", from: [12, 3], to: [14, 5] },
  ],
  regions: [{ name: "well square", from: [52, 20], to: [76, 34] }],
  landmarks: [{ name: "the ember arch", at: [60, 28] }],
  anchors: [/* doors, waypoint, shop, residents, challengers … with UUIDs */],
});
```

Moving the pond is one edit to its shape, not a rewrite of every row it
crosses.

**Named stamps.** A catalog of LPC chunks (houses, tree clusters, door
frames, waypoint plinths and so on), each with a name, footprint, anchor
points, an above-player mask and a preview sheet. The inspector extracts new
stamps from source maps.

### The authoring loop

An agent authoring a map runs the inspector (`npm run d97:map -- <command>`)
until it is clean:

- **Inspect** prints per-region walkability and reachability summaries,
  landmark and anchor coordinates, and the crossing time between regions at
  walking speed.
- **The validator** checks that every anchor stands on a walkable cell, that
  every anchor is reachable from the entries, that a guarded door is
  unreachable while its guardian stands, that doors stand at least 8 tiles
  apart, and that a medium map's main route meets its crossing-time target.
  It reports findings by coordinate.
- **The preview** renders the whole map, or a zoomed region with a
  coordinate grid, region outlines and anchor letters, to PNGs in a
  gitignored directory. The agent reads the pictures back and fixes what
  reads badly: a cramped plaza, a road that leads nowhere, a door hidden
  behind a house.

### Backdrop maps

A pre-composed scene, such as an LPC Revised demo map, is a source like any
other: the map module crops it and corrects its walkability with recipe
operations. This is the cheapest path to a good-looking dream: the art is
already composed, and the module is a short recipe.

![The LPC Revised winter demo map used as a Winterwake Fjords dream: dream veils fill the two cave mouths and the cottage door, a waypoint stands at the left, and challengers, a guardian, Sigrún, a shopkeeper, a quest giver and a sage carry their head icons.](visual-guide/backdrop-winterwake.png)

The walkability grid comes from the source's collision data and blocking
tile properties. The map module corrects it with rectangle overrides such as
`{ op: "block", from: [12, 3], to: [14, 5] }` or `{ op: "open", … }`, and
places anchors by coordinate or landmark, so the grid itself is never
hand-edited. The same validator and preview apply. In the picture below the
right half shows blocked cells in red and anchors as letters.

![The LPC Revised summer demo map split in two: the left half is the plain backdrop, the right half overlays a 32-pixel grid, red blocked cells and anchor letters for a door, a challenger, a chest and a shop.](visual-guide/backdrop-walkgrid.png)

**Seasons multiply backdrops.** LPC Revised draws its terrain in four seasons,
and its demo map comes in all four. One authored layout can back several
dreams of different tilesets. The prototype accepts the repetition; players
of a prototype care more about what is in a dream than about its layout.

![The same LPC Revised demo map in spring, summer, autumn and winter, captioned as Wilderveil, a meadow, Hope's End outskirts and Winterwake Fjords.](visual-guide/backdrop-seasons.png)

**Finding more pre-composed scenes.**

- **LPC Revised** (`_ Test Scenes/` in the repository) holds the four-season
  demo map and a wide test landscape. Its `Terrain/` sheets come in all four
  seasons, so new backdrops drawn with them can be reseasoned cheaply.
- **[LPC RPG Maker MZ starter
  kit](https://github.com/LiberatedPixelCup/RPG_Maker_MZ_LPC_Starter_Kit)**
  ships Tiled maps over LPC tilesets.
- **OpenGameArt previews.** Many LPC pack pages include a preview scene;
  where a page also ships its Tiled `.tmx` file (FraMa's sci-fi extension
  does), the scene can be re-rendered and adapted. A preview image alone is
  fine as a reference, not as a backdrop, unless its license and authorship are
  clear.
- **Source of Tales, Big Island and Neverwell Moor** ship large Tiled maps
  over LPC tilesets, the first choice for crops.

**Choosing a path.** Crop an existing Tiled map when one fits the theme,
reseason or edit it when it nearly fits, and compose from stamps only when no
source map covers the theme.

## Shared visual language

These markers read the same in every dream.

### Dream doors

A door's frame is diegetic and belongs to its tileset: a garden gate in
Tumbleleaf, an arched stone portal in Frostforge, a torii in Tsukiren, an
airlock in Farpoint Station. Its opening is never a door slab. It always holds
the **dream veil**: a slow swirl of color flecked with stars, a soft glow
around the frame, motes drifting upward and a faint rune ring on the threshold.

![A row of doors: unexplored violet veils in a garden gate, a torii and an airlock; a traversed door with a blue veil; a guarded portal with Korrax standing in front under a crown icon; a red act exit with an incarnation in front; and a white door to Limbo.](visual-guide/ref-doors.png)

| Door state | Veil | Label |
| --- | --- | --- |
| Unexplored | Violet swirl | None; doors are blind ([§B5](appendix-b-dreams.md#b5-doors-and-chokepoints)) |
| Traversed | Blue swirl | No name; at most a small thumbnail of the destination's art, shown on hover and when the player stands near ([§B5](appendix-b-dreams.md#b5-doors-and-chokepoints)) |
| Known through a sage hint | Violet swirl | An eye glyph; the sage marks the destination on the Atlas, never by name |
| Guarded | The door's state color; the guardian stands on the chokepoint tile in front | None until the guardian falls |
| Act exit | Red swirl, larger motes, brighter glow | "Act exit" nameplate |
| Door to Limbo | White swirl | "Limbo" nameplate |

- **Rendering.** The veil is one quad masked to the opening (rectangle or
  arch) with a Pixi filter: a swirl displacement over a gradient, plus a
  sparkle texture that drifts. The glow is a `GlowFilter` from
  `pixi-filters` on the frame. Motes come from a small particle emitter.
- **Stepping through.** The veil brightens and the screen fades to the veil
  color for about 300 ms, then fades in on the destination's matching door.
- **Building doors** into a dream's rooms are ordinary scenery doors with no
  veil; entering a room is a plain fade.
- **Key dreams** have no door. Using a key at a waypoint opens a gold ring
  around the waypoint obelisk; touching it enters the key dream.

### Waypoints

Every dream's waypoint is the same crystal obelisk, whatever the tileset, so
the player learns one object. A dormant waypoint is grey stone; touching it
lights it blue with a glow, motes and a rune ring. The start dream's waypoint
is lit from the start of a run.

![A dormant grey waypoint, an activated blue waypoint, a waypoint with a gold key-dream ring, a chest, a glowing lost object, a beaten challenger without an icon, and a refill arriving in a puff of dream smoke.](visual-guide/ref-objects.png)

### Head icons

Every unbeaten challenger and every friendly NPC with something to offer
carries a speech-bubble badge over their head
([§B11](appendix-b-dreams.md#b11-encounters)). The badge color sorts them at a
glance: red to fight, gold for bosses, cyan for prize duels, green to trade,
purple for Dream Guides, yellow for quests and blue for sages.

![Eleven head-icon badges: crossed swords for a challenger, a crown for guardians and incarnations, a gem for prize duelists, a coin bag for shopkeepers, an amulet for amulet merchants, scales for amulet changers, a star for Dream Guides, a sparkling star for an enhanced guide, an exclamation mark for a quest offer, a question mark for a quest step, and an eye for sages.](visual-guide/ref-icons.png)

- **Size and motion.** 19×22 pixels at 1×, bobbing 2 pixels on a 1.2-second
  cycle. Badges never scale with distance.
- **Enhanced guides** get gold sparkles on the badge
  ([§B13](appendix-b-dreams.md#b13-dream-guides)).
- **Quests.** An exclamation mark offers a quest; a question mark marks a
  character or object that advances an active one.
- **Beaten challengers** lose their badge and stay as ordinary characters,
  slightly desaturated. A spent Dream Guide appearance loses its badge too.
- **Overlap.** When two badges would overlap, the one nearer the player is
  drawn on top and the other fades to half opacity. A badge that would cover
  the player's own body, as when the player stands just north of its
  character, fades out until the player steps away.
- **Townsfolk** never carry a badge.

### Other markers

- **Chests** use the LPC wooden chest. An opened chest shows its open frame.
- **Lost objects** appear only while their quest is active, with a pale gold
  glow and motes.
- **Refills** arrive in a puff of violet dream smoke the first time the player
  sees them ([§B8](appendix-b-dreams.md#b8-refills)).
- **Chokepoints** need no extra marker: the guardian stands on the corridor
  tile in front of the door, and walking into them opens the preview.

## Prototype tilesets

The prototype supports twelve tilesets: the ten Dream Guide home tilesets,
Wilderveil's backdrop sibling the meadow, and Limbo. Tileset names are
internal labels for art sets and never appear in game. Each scene below is a
mockup at 2× of a 22×13-tile excerpt, with characters and markers placed as
the game would show them. The "Map path" column names each scene's starting
point; every path is a source plus recipe operations
([Building maps](#building-maps)). The first dream built is a 110×110 crop
of Source of Tales' Mountainwatch.

| Tileset | Category | Guide at home | Map path |
| --- | --- | --- | --- |
| Tumbleleaf Village | Fantasy | Tobias Tanglefur | Tile-built |
| Frostforge | Fantasy | Durgan Forgehammer | Tile-built |
| Pharaoh's Gate | Historic | Amunet | Tile-built |
| Tsukiren | Historic | Master Takeshi | Tile-built |
| Winterwake Fjords | Historic | Sigrún | Backdrop (winter) |
| Hope's End | Fantasy | Deacon Holt | Tile-built |
| Wilderveil | Nature | Aldric, the Seer | Backdrop (spring) |
| Meadow | Nature | — | Backdrop (summer) |
| The Rust Expanse | Sci-Fi | Maddox | Tile-built |
| Farpoint Station | Sci-Fi | Gravok | Tile-built |
| Grid City | Sci-Fi | "Layaway" | Tile-built |
| Limbo | — | — | Tile-built, fixed map |

Hope's End has no category in Appendix B; this guide files it under Fantasy.
The elven realm, snowfield and pirate island wait for later art passes: the
snowfield can reuse the winter backdrop terrain, and the pirate island the
beach pack, boats and palms.

### Tumbleleaf Village

A talking-animal farming village: brick and stone cottages, a dirt crossroads,
a pond, a tilled field and a produce stand. Doors are red arched garden gates.

![Tumbleleaf Village: cottages along a dirt crossroads, Demetrios guarding a violet garden-gate door at the top, a traversed blue door to Frostforge at the right, Tobias Tanglefur with an enhanced-guide badge, a hedge-hare challenger, a shopkeeper at the produce stand, a quest giver, a sage and a beaten hedge-hare.](visual-guide/scene-tumbleleaf.png)

- **Ground:** grass; dirt roads; tilled soil; grass-edged pond.
- **Structures:** brick and stone cottages, fences.
- **Props:** oak and small trees, bushes, barrels, birdbath, hay, crops,
  produce crates, mushrooms.
- **Door frame:** red arched garden gate.
- **Ambient:** butterflies, swaying crops.

### Frostforge

A dwarven forge hall cut into ice. A grey brick hall wall runs along the top,
the forge floor is dark cobble ringed with frozen dirt, and a lava pool glows
against the snow.

![Frostforge: a grey brick wall with two arched stone portals, one violet and one blue labeled Tumbleleaf Village with Rael guarding it, Durgan at the forge stove, ice miners as challengers, an amulet merchant, a shopkeeper by barrels, a lava pool, snowy pines and a dormant grey waypoint.](visual-guide/scene-frostforge.png)

- **Ground:** snow, ice, frozen dirt, dark cobble, lava.
- **Structures:** grey brick hall wall.
- **Props:** forge stove and chimney, barrels, torches, snowy pines and
  bushes, boulders.
- **Door frame:** arched stone portal set into the wall.
- **Ambient:** heat shimmer over lava, drifting snow.

### Pharaoh's Gate

A sandstone temple court: a columned portico flanked by guardian lions and
standing stones, palms around an oasis, market awnings and desert bones.

![Pharaoh's Gate: Seraveth guarding a violet portal inside a columned temple flanked by lion statues, tomb guards with challenge badges, Amunet beside a market awning, a prize duelist with a gem badge, an amulet changer, palms, an oasis, cacti and a skull.](visual-guide/scene-pharaohs-gate.png)

- **Ground:** sand, sandstone paving, dirt-edged oasis.
- **Structures:** columned temple, adobe walls.
- **Props:** guardian lions, standing stones, palms, cacti, awnings, sand
  rocks, skulls and bones.
- **Door frame:** arched stone portal; red garden gates at the edges.
- **Ambient:** heat haze, blowing sand.

### Tsukiren

A samurai garden: a cobbled approach to a torii, stone lanterns, cherry trees,
a koi pond with an arched bridge and a shoji house under a tiled roof.

![Tsukiren: Tensho guarding a violet veil inside a torii at the top of a cobbled approach lined with stone lanterns, Master Takeshi by a shoji house, a ronin challenger and a beaten ronin, a quest step marker, a shopkeeper, cherry trees, a pond and an arched bridge.](visual-guide/scene-tsukiren.png)

- **Ground:** dark grass, blue cobble, grass-edged pond.
- **Structures:** shoji walls, tiled roof.
- **Props:** torii, stone lanterns, cherry trees, lily pads, arched bridge,
  boulders.
- **Door frame:** torii; a garden gate for minor doors.
- **Ambient:** falling cherry petals.

### Winterwake Fjords

Shown under [Backdrop maps](#backdrop-maps): the winter demo map's cliffs,
frozen river, waterfalls and cottage. Cave mouths and the cottage door are
dream doors.

- **Ground and structures:** baked into the backdrop.
- **Added props:** chests, a waypoint, Viking characters.
- **Door frame:** cave mouths and the cottage door in the backdrop.
- **Ambient:** drifting snow, a slow shimmer on the ice.

### Hope's End

A graveyard chapel at dusk: a pale cathedral front, flagstone paths, rows of
graves, dead trees and torches.

![Hope's End: Last Word, an incarnation at 1.25 scale with a crown badge, standing before the red act-exit veil in the cathedral door; a penitent challenger, Deacon Holt with an enhanced-guide badge, a sage, graves, crosses, dead trees, torches and a waypoint.](visual-guide/scene-hopes-end.png)

- **Ground:** dark grass, flagstones.
- **Structures:** cathedral front.
- **Props:** headstones, grave crosses, dead trees, torches, mushrooms.
- **Door frame:** the cathedral's arched door; garden gates at the edges.
- **Ambient:** low fog, crows.

### Wilderveil and the meadow

Wilderveil uses the spring backdrop and the meadow the summer one (see
[Backdrop maps](#backdrop-maps)). Wilderveil adds mushrooms, cattails and
thornwarden challengers; the meadow adds wildflowers and farm animals.

### The Rust Expanse

A scavengers' wasteland camp: cracked dirt and sand, canvas tents, a giant
ribcage, dead trees and a bunker hatch sunk into a crater.

![The Rust Expanse: Kell Tarn guarding a violet bunker-hatch door in a crater, Maddox outside a tent with an enhanced-guide badge, scrappers with challenge badges, a shopkeeper by a second tent, a giant ribcage, a skull, dead trees, barrels and a waypoint.](visual-guide/scene-rust-expanse.png)

- **Ground:** dirt, dark dirt, sand, crater.
- **Structures:** tents.
- **Props:** ribcage, skulls, bones, dead trees, bonsai-like shrubs,
  barrels, sacks, sand rocks.
- **Door frame:** sci-fi bunker hatch; garden gates reused as scrap-wood
  gates.
- **Ambient:** dust devils.

### Farpoint Station

A space station deck: panel walls with LED boards, a circuit-patterned floor,
consoles, energy crystals and airlocks.

![Farpoint Station: End of Causality, an incarnation, standing before a red act-exit airlock; Gravok with a guide badge, Calloway Flint and a deckhand as challengers, a shopkeeper, an amulet changer, energy crystals, consoles, side airlocks with violet and blue veils, and a waypoint.](visual-guide/scene-farpoint.png)

- **Ground:** station floor panels, dark deck.
- **Structures:** panel walls, LED walls.
- **Props:** consoles, keypads, crystals, floor LEDs.
- **Door frame:** sliding airlock; a large bay door for act exits.
- **Ambient:** blinking LEDs, crystal pulse.

### Grid City

A neon back street: grey brick fronts, graffiti, vending machines, street
lamps and a station door.

![Grid City: Tessa guarding a violet station door, a narrow wooden door with a blue veil labeled Farpoint Station, "Layaway" with a guide badge, runners as challengers, Zeva with a quest badge, a shopkeeper, vending machines, graffiti, street lamps, a burning barrel and a waypoint.](visual-guide/scene-grid-city.png)

- **Ground:** blue stone pavement, flagstone street.
- **Structures:** grey brick fronts, LED boards.
- **Props:** vending machines, graffiti, street lamps, burning barrel, junk,
  barrels, shelves.
- **Door frame:** station sliding door; narrow wooden doors.
- **Ambient:** flickering signs, rain (later).

### Limbo

Limbo is one fixed map: a pale stone court floating over the void, with two
spires and a dais. The five Limbo incarnations stand in an arc; Apollyon
manifests on the dais when the fifth falls
([Appendix C](appendix-c-bosses-and-keys.md)). The whole scene renders through
a desaturating violet color matrix.

![Limbo: five incarnations in an arc on a floating stone court, one beaten and without an icon, Apollyon in gold on the dais above them, the player (as their Avatar, on a gold ring) approaching from below and a waypoint at the left, all washed in violet.](visual-guide/scene-limbo.png)

- **Ground:** void, cream and blue stone.
- **Structures:** spires, vine pillars, the dais.
- **Props:** torches, a fountain on the dais.
- **Door frame:** none inside; the Act 5 door to Limbo uses the white veil.
- **Ambient:** slow void motes rising past the edges.

## Characters

Every character is layered from the [Universal LPC character
generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)'s
sheets: a body, a head, and layers of hair, clothes, headwear and held items.
The renderer stacks a recipe's layer sheets at runtime as sprites that share
one animation frame, in the generator's z-order. When a look loads, each
layer is recolored from the generator's palettes and cut into 64×64 frames,
with walk-cycle and idle sheets in four directions. Nothing is pre-composed,
so a recipe edit shows up on the next reload.

A character's look is a **recipe** in a D97 catalog module
(`src/content/d97/characters/`) keyed by the character's UUID. Each part
names a generator sheet and a palette or variant per color slot:

```ts
export const SIGRUN = characterSprite({
  id: parseD97CharacterId("…"), // Sigrún
  body: "female",
  skin: "light",
  parts: [
    { sheet: sheet("heads_human_female") },
    { sheet: sheet("hair_braid2"), colors: ["strawberry"] },
    { sheet: sheet("torso_clothes_longsleeve"), colors: ["navy"] },
    { sheet: sheet("torso_chainmail"), colors: ["silver"] },
    { sheet: sheet("legs_leggings"), colors: ["gray"] },
    { sheet: sheet("feet_boots_fold"), colors: ["brown"] },
    { sheet: sheet("hat_helmet_spangenhelm_viking"), colors: ["silver"] },
  ],
});
```

Workspace preparation resolves recipes against the local generator into a
character manifest; a recipe naming a missing sheet or palette draws as a
capsule and logs a warning.

### Avatar characters

Each Avatar wears its home tileset's costume language, so a challenger hints
at where they come from: Tsukiren's Avatars wear kimono and armor, Grid City's
wear street clothes, Hope's End's wear crowns, robes and wings.

![Thirty-two Avatar sprites grouped by home dream: Tumbleleaf Village, Pharaoh's Gate, Winterwake Fjords, Frostforge, Hope's End, Tsukiren, Wilderveil, The Rust Expanse, Farpoint Station and Grid City.](visual-guide/characters-avatars.png)

### Dream Guides

Guides are the most recognizable recurring characters, so each has a strong
silhouette: Tobias's bowler and tail, Aldric's wizard hat, Gravok's troll
head and bow tie, "Layaway"'s cap and shades.

![Ten Dream Guide sprites: Tobias Tanglefur, Amunet, Sigrún, Durgan Forgehammer, Deacon Holt, Master Takeshi, Aldric the Seer, Maddox, Gravok and "Layaway".](visual-guide/characters-guides.png)

### Incarnations and Apollyon

Incarnations use monstrous heads (wolf, boar, alien, lizard, orc, minotaur,
skeleton, zombie, vampire, a crowned void-king) and render at 1.25× with a
desaturating tint and a colored aura filter, so a boss reads as a boss from
across the map. Apollyon renders at 2× in gold.

![Ten incarnations, each tinted and haloed in its own color, and Apollyon, winged and crowned in gold.](visual-guide/characters-incarnations.png)

### The player

The player has no sprite of their own: they walk the overworld as their
current Avatar, using that Avatar's character sprite. Switching Avatars at a
waypoint ([§B16](appendix-b-dreams.md#b16-avatar-characters-and-switching)) swaps the sprite
on the spot, with a short puff of dream smoke. The scenes on this page show a
player whose Avatar is Ossian.

The player never meets a roster Avatar as a character
([§B16](appendix-b-dreams.md#b16-avatar-characters-and-switching)), so the
player's sprite is unique in the world. A gold rune ring under the player
marks "you" at a glance among crowds of characters; the player never carries
a head icon.

### Friendly NPCs and generic personas

Friendly NPC roles each have one recognizable outfit, and every tileset has
generic challenger personas suited to it
([§B2](appendix-b-dreams.md#b2-dream-catalog)). Townsfolk are dressed for
their dream, with no role outfit and no badge.

![Six friendly NPC roles (shopkeeper, amulet merchant, amulet changer, sage, quest giver, prize duelist) and ten generic personas, one per tileset, from a hedge-hare to a Grid City runner.](visual-guide/characters-npcs.png)

- **Facing.** Idle characters face down, or toward the player while the player
  is within two tiles. Challengers never walk; friendly characters may idle
  within their anchor tile.
- **Scale.** 1× for everyone except incarnations (1.25×) and Apollyon (2×).
- **Shadows.** Every character gets a soft oval shadow on the ground layer.

## The React overlay

All UI is existing Cumulus React code drawn over the canvas. The canvas never
draws text except the act-exit and Limbo nameplates and head badges.

![The Tumbleleaf scene with a React overlay: a dream title chip at the top left, a currency bar at the top right, a control bar of Deck, Atlas, Quests, Dreamsigns and Menu at the bottom, and a challenge preview panel with three GameCard placeholders, the antes, the extra, and Fight and Not now buttons.](visual-guide/ref-hud.png)

| Surface | Component |
| --- | --- |
| Act, tier, waypoint status (never a dream name) | Cumulus glass chip |
| Essence, amulets, keys | Cumulus status row |
| Deck, Atlas, Quests, Dreamsigns, Menu | Cumulus control bar; each control appears once its surface exists |
| Challenge preview | Cumulus panel with `GameCard` signature cards, antes, extra, Fight / Not now |
| Dialogue | Cumulus panel showing the speaker, the line and the player's choices |
| Shops, guide services, quest log, deck editor | Existing journey-mode screens, adapted by D97 adapters |
| Dream Atlas | The existing atlas components (`AtlasNode`, `AtlasEdge`), with each node showing its tileset thumbnail |

- **Hover and tap.** Hovering a character or door shows a small React tooltip
  anchored to its screen position. On touch, a tap walks or interacts.
- **Input focus.** While a React panel is open, the canvas ignores clicks and
  pauses the player's walk.

## Asset pipeline

- **Compiled maps.** Workspace preparation runs the recipe compiler over
  every map module and writes each compiled map, with its tile layers,
  tilesets and walkability grid, into the gitignored `public/` tree. The map
  modules and stamp catalog, not the maps or PNGs, are versioned. The
  renderer cuts tile frames from the linked Tiled tilesets.
- **Character manifest.** Workspace preparation resolves every recipe against
  the local generator into a manifest of layer sheets and palette swaps. The
  renderer layers and recolors the sheets when a look loads. Recipes are
  versioned; no composite exists.
- **Placeholders.** With any sheet missing, tiles render as flat colors by
  terrain class and characters as colored capsules with their head icons, so
  QA can run without art.
- **Logging.** The overworld logs what the rules need (door traversals,
  waypoint use, previews; [Appendix B
  §B17](appendix-b-dreams.md#b17-state-and-logging)). Rendering choices are not
  logged.

## Open questions

- **Source repetition.** How many dreams can crop the same source map or
  share a seasonal layout before players notice? Playtests answer it.
- **Grid City and Farpoint overlap.** Both lean on the same sci-fi pack. A
  modern-city LPC pack would separate them.
- **Elven realm and pirate island art.** Both need a sourcing pass.
- **Avatar silhouettes at 1×.** Some Avatars read alike on a phone; a pass on
  hats and colors should make each one distinct.

## Attribution

The illustrations on this page compose art by the Liberated Pixel Cup
contributors and community artists, including Lanea "Sharm" Zimmerman,
Stephen "Redshrike" Challener, Daniel Eddeland, Casper Nilsson, bluecarrot16,
William.Thompsonj, Demetrius, Baŝto, Hyptosis, ElizaWy and the many authors
listed in each pack's attribution file and in the character generator's
`CREDITS.csv`. Each pack's page, linked in [Art
source](#art-source-liberated-pixel-cup), names its authors and licenses.
