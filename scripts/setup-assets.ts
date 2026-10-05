/**
 * Links the locally licensed art into the gitignored `public/` tree.
 *
 * Art is kept out of git. This script reads the image references in the
 * `src/content` modules and symlinks each referenced file from the local art
 * library (rooted at `DREAMTIDES_LOCAL_ASSET_HOME`, default `$HOME`) into
 * `public/`, where Vite serves it and the deploy uploads it. Missing art warns
 * and continues; the UI falls back to generated placeholders.
 *
 * Run with `npm run setup-assets` (through tsx, which loads the TypeScript
 * content modules).
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The image references the art linker resolves. */
export interface ArtCatalog {
  /** Card, figment, Dreamwell, and offer-tile image numbers. */
  readonly cardImageNumbers: readonly number[];
  readonly avatars: readonly {
    readonly imageNumber: string;
    readonly name: string;
  }[];
  readonly dreamsignImageNames: readonly string[];
  /** Image numbers of the cards that front Exploration encounters. */
  readonly explorationImageNumbers: readonly number[];
  /** Art file stems of the dreamscapes (their runtime slugs). */
  readonly dreamscapeArtNames: readonly string[];
  /** Guide portraits: the served file stem and its source file. */
  readonly guidePortraits: readonly {
    readonly artName: string;
    readonly portraitSource: string;
  }[];
  readonly atlas: {
    readonly bossSceneSource: string;
    readonly bossIconSource: string;
    readonly bossFigureSource: string;
    readonly unrevealedFrameSource: string;
    readonly unrevealedFrameFile: string;
    readonly bossSceneArtName: string;
    readonly bossIconArtName: string;
    readonly bossFigureArtName: string;
  };
}

/** Where the local art library and the served `public/` tree live. */
export interface ArtPaths {
  readonly publicDir: string;
  readonly imageCacheDir: string;
  readonly avatarArtDir: string;
  readonly dreamsignArtDir: string;
  readonly journeyArtDir: string;
  readonly mainMenuBackgroundArtPath: string;
  readonly explorationHighResArtDir: string;
  readonly explorationSourceArtDir: string;
  readonly explorationTaggedArtDir: string;
  readonly cardFrameArtDir: string;
  readonly dreamscapeSceneArtDir: string;
  readonly dreamscapeIconArtDir: string;
  readonly dreamGuideArtDir: string;
  readonly tutorialDialogueFrameArtPath: string;
}

/**
 * Card chrome art shared by every `CardView` surface: the stat orbs and the
 * parchment frame overlays, from the Dreamtides Unity client asset tree.
 */
const CARD_FRAME_FILES = [
  "energy_cost_background.png",
  "spark_background.png",
  "card_frame.png",
  "card_frame_event.png",
];

/** The default art library locations under `home`. */
export function defaultArtPaths(root: string, home: string): ArtPaths {
  const documents = join(home, "Documents");
  const shutterstock = join(documents, "shutterstock");
  const avatarArtCandidates = [
    join(documents, "synty", "avatars"),
    join(documents, "sytny", "avatars"),
    join(documents, "synty", "dream" + "callers"),
    join(documents, "sytny", "dream" + "callers"),
  ];
  return {
    publicDir: join(root, "public"),
    imageCacheDir: join(
      home,
      "Library",
      "Caches",
      "io.github.dreamtides.tv",
      "image_cache",
    ),
    avatarArtDir:
      avatarArtCandidates.find((dir) => existsSync(dir)) ??
      avatarArtCandidates[0],
    // Dreamsign art uses the `outlined` variants, which carry a glyph outline
    // for on-scene legibility.
    dreamsignArtDir: join(documents, "dreamsigns", "filtered", "outlined"),
    journeyArtDir: join(shutterstock, "images_journeys"),
    mainMenuBackgroundArtPath: join(
      shutterstock,
      "quest_prototype_assets",
      "main-menu-background.jpg",
    ),
    explorationHighResArtDir: join(
      shutterstock,
      "quest_prototype_assets",
      "exploration",
    ),
    explorationSourceArtDir: join(shutterstock, "images"),
    explorationTaggedArtDir: join(shutterstock, "tagged"),
    cardFrameArtDir: join(
      home,
      "dreamtides",
      "client",
      "Assets",
      "ThirdParty",
      "GameAssets",
    ),
    dreamscapeSceneArtDir: join(documents, "synty", "dreamscape_images"),
    dreamscapeIconArtDir: join(documents, "synty", "dreamscape_icons"),
    dreamGuideArtDir: join(documents, "synty", "dream_guides"),
    tutorialDialogueFrameArtPath: join(
      documents,
      "UI",
      "ClassicFantasyRPG_UI",
      "ARTWORKS",
      "UIelements",
      "Round_frame.png",
    ),
  };
}

/** The image-cache file name of a card image: SHA-256 of its preview URL. */
export function imageCacheFileName(imageNumber: number): string {
  return createHash("sha256")
    .update(
      `https://www.shutterstock.com/image-illustration/-260nw-${String(imageNumber)}.jpg`,
    )
    .digest("hex");
}

/**
 * Extract the trailing numeric image id from a journey art filename of the
 * form `<arbitrary-prefix>-<digits>.<ext>`, or null when it does not match.
 */
export function journeyImageIdFromFilename(
  filename: string,
): { imageNumber: string; extension: string } | null {
  const match = /-(\d+)\.([A-Za-z0-9]+)$/u.exec(filename);
  if (!match) return null;
  return { imageNumber: match[1], extension: match[2] };
}

function recreateDir(dir: string): void {
  // macOS watchers can briefly retain generated children while Vite is live.
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  mkdirSync(dir, { recursive: true });
}

/** Links one file when it exists; returns whether it was linked. */
function linkIfPresent(source: string, destination: string): boolean {
  if (!existsSync(source)) {
    console.warn(`  Warning: missing art ${source}`);
    return false;
  }
  symlinkSync(source, destination);
  return true;
}

function linkCardImages(catalog: ArtCatalog, paths: ArtPaths): void {
  const cardsDir = join(paths.publicDir, "cards");
  recreateDir(cardsDir);
  const imageNumbers = new Set(
    catalog.cardImageNumbers.filter((imageNumber) => imageNumber > 0),
  );
  let linked = 0;
  for (const imageNumber of imageNumbers) {
    const cachePath = join(paths.imageCacheDir, imageCacheFileName(imageNumber));
    if (existsSync(cachePath)) {
      symlinkSync(cachePath, join(cardsDir, `${String(imageNumber)}.webp`));
      linked++;
    }
  }
  // Uncached images render as generated identicons, so misses are quiet.
  console.log(
    `Linked ${String(linked)} of ${String(imageNumbers.size)} card images`,
  );
}

function linkAvatarArt(catalog: ArtCatalog, paths: ArtPaths): void {
  const avatarsDir = join(paths.publicDir, "avatars");
  const cutoutsDir = join(avatarsDir, "cutout");
  recreateDir(avatarsDir);
  mkdirSync(cutoutsDir, { recursive: true });
  const names = new Map<string, string>();
  for (const avatar of catalog.avatars) {
    if (!names.has(avatar.imageNumber))
      names.set(avatar.imageNumber, avatar.name);
  }
  let portraits = 0;
  let cutouts = 0;
  for (const imageNumber of names.keys()) {
    const filename = `${imageNumber}.png`;
    if (
      linkIfPresent(
        join(paths.avatarArtDir, filename),
        join(avatarsDir, filename),
      )
    ) {
      portraits++;
    }
    // Transparent full-body renders used where the Avatar stands on UI chrome.
    if (
      linkIfPresent(
        join(paths.avatarArtDir, "cutout", filename),
        join(cutoutsDir, filename),
      )
    ) {
      cutouts++;
    }
  }
  console.log(
    `Linked ${String(portraits)} avatar portraits and ${String(cutouts)} cutouts of ${String(names.size)}`,
  );
}

function linkDreamsignArt(catalog: ArtCatalog, paths: ArtPaths): void {
  const dreamsignsDir = join(paths.publicDir, "dreamsigns");
  recreateDir(dreamsignsDir);
  const imageNames = new Set(catalog.dreamsignImageNames);
  let linked = 0;
  for (const imageName of imageNames) {
    if (
      linkIfPresent(
        join(paths.dreamsignArtDir, imageName),
        join(dreamsignsDir, imageName),
      )
    ) {
      linked++;
    }
  }
  console.log(
    `Linked ${String(linked)} of ${String(imageNames.size)} dreamsign images`,
  );
}

/**
 * Journey dream art: `images_journeys/<prefix>-<imageId>.<ext>` links to
 * `public/journeys/<imageId>.<ext>`. `imageId-extension.json` records each
 * id's extension so the browser can build URLs without filesystem access.
 */
function linkJourneyArt(paths: ArtPaths): void {
  const journeysDir = join(paths.publicDir, "journeys");
  recreateDir(journeysDir);
  const extensions: Record<string, string> = {};
  if (existsSync(paths.journeyArtDir)) {
    for (const filename of readdirSync(paths.journeyArtDir)) {
      const parsed = journeyImageIdFromFilename(filename);
      if (parsed === null || extensions[parsed.imageNumber] !== undefined) continue;
      symlinkSync(
        join(paths.journeyArtDir, filename),
        join(journeysDir, `${parsed.imageNumber}.${parsed.extension}`),
      );
      extensions[parsed.imageNumber] = parsed.extension;
    }
  } else {
    console.warn(
      `  Warning: journey art directory not found at ${paths.journeyArtDir}`,
    );
  }
  writeFileSync(
    join(journeysDir, "imageId-extension.json"),
    `${JSON.stringify(extensions, null, 2)}\n`,
  );
  console.log(
    `Linked ${String(Object.keys(extensions).length)} journey images`,
  );
}

function collectJpegPaths(dir: string, recursive: boolean): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) visit(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jpg")) {
        result.push(entryPath);
      }
    }
  };
  visit(dir);
  return result;
}

/**
 * Exploration expands source-card art to the viewport. Curated
 * full-resolution files win; other encounters use the one matching source
 * file.
 */
function linkExplorationArt(catalog: ArtCatalog, paths: ArtPaths): void {
  const destination = join(paths.publicDir, "exploration");
  recreateDir(destination);
  const wanted = new Set(catalog.explorationImageNumbers.map(String));
  const linked = new Set<string>();
  if (existsSync(paths.explorationHighResArtDir)) {
    for (const filename of readdirSync(paths.explorationHighResArtDir)) {
      const match = /^(\d+)\.jpg$/u.exec(filename);
      if (match === null || !wanted.has(match[1])) continue;
      symlinkSync(
        join(paths.explorationHighResArtDir, filename),
        join(destination, filename),
      );
      linked.add(match[1]);
    }
  }
  const sourceFiles = collectJpegPaths(paths.explorationSourceArtDir, false);
  const taggedFiles = collectJpegPaths(paths.explorationTaggedArtDir, true);
  for (const imageNumber of wanted) {
    if (linked.has(imageNumber)) continue;
    const pattern = new RegExp(`(?<!\\d)${imageNumber}\\.jpg$`, "iu");
    const sourceMatches = sourceFiles.filter((path) => pattern.test(path));
    const matches =
      sourceMatches.length > 0
        ? sourceMatches
        : taggedFiles.filter((path) => pattern.test(path));
    if (matches.length !== 1) continue;
    symlinkSync(matches[0], join(destination, `${imageNumber}.jpg`));
    linked.add(imageNumber);
  }
  console.log(
    `Linked ${String(linked.size)} of ${String(wanted.size)} Exploration images`,
  );
}

/**
 * Dream Atlas art: each dreamscape's scene (`<id>.png`) and node icon
 * (`<id>_icon.png`), the final dream under the Atlas boss art ids, guide
 * portraits keyed by guide id, and the round frame for unrevealed nodes.
 */
function linkAtlasArt(catalog: ArtCatalog, paths: ArtPaths): void {
  const scenesDir = join(paths.publicDir, "dreamscapes");
  const iconsDir = join(paths.publicDir, "dreamscape-icons");
  const guidesDir = join(paths.publicDir, "dream-guides");
  const atlasDir = join(paths.publicDir, "atlas");
  for (const dir of [scenesDir, iconsDir, guidesDir, atlasDir])
    recreateDir(dir);
  const { atlas } = catalog;
  for (const name of catalog.dreamscapeArtNames) {
    linkIfPresent(
      join(paths.dreamscapeSceneArtDir, `${name}.png`),
      join(scenesDir, `${name}.png`),
    );
    linkIfPresent(
      join(paths.dreamscapeIconArtDir, `${name}_icon.png`),
      join(iconsDir, `${name}.png`),
    );
  }
  linkIfPresent(
    join(paths.dreamscapeSceneArtDir, atlas.bossSceneSource),
    join(scenesDir, `${atlas.bossSceneArtName}.png`),
  );
  linkIfPresent(
    join(paths.dreamscapeIconArtDir, atlas.bossIconSource),
    join(iconsDir, `${atlas.bossIconArtName}.png`),
  );
  for (const guide of catalog.guidePortraits) {
    linkIfPresent(
      join(paths.dreamGuideArtDir, guide.portraitSource),
      join(guidesDir, `${guide.artName}.png`),
    );
  }
  linkIfPresent(
    join(paths.dreamGuideArtDir, atlas.bossFigureSource),
    join(guidesDir, `${atlas.bossFigureArtName}.png`),
  );
  linkIfPresent(
    join(paths.dreamscapeIconArtDir, atlas.unrevealedFrameSource),
    join(atlasDir, atlas.unrevealedFrameFile),
  );
  linkIfPresent(
    paths.tutorialDialogueFrameArtPath,
    join(atlasDir, "Round_frame.png"),
  );
  console.log("Linked Dream Atlas art");
}

/** Links every referenced art file into `paths.publicDir`. */
export function linkArt(catalog: ArtCatalog, paths: ArtPaths): void {
  mkdirSync(paths.publicDir, { recursive: true });
  linkCardImages(catalog, paths);
  linkAvatarArt(catalog, paths);
  linkDreamsignArt(catalog, paths);
  linkJourneyArt(paths);
  const mainMenuDir = join(paths.publicDir, "main-menu");
  recreateDir(mainMenuDir);
  linkIfPresent(
    paths.mainMenuBackgroundArtPath,
    join(mainMenuDir, "background.jpg"),
  );
  linkExplorationArt(catalog, paths);
  const cardFrameDir = join(paths.publicDir, "card-frame");
  recreateDir(cardFrameDir);
  for (const filename of CARD_FRAME_FILES) {
    linkIfPresent(
      join(paths.cardFrameArtDir, filename),
      join(cardFrameDir, filename),
    );
  }
  linkAtlasArt(catalog, paths);
}

/** The art references of the `src/content` catalogs. */
export async function contentArtCatalog(): Promise<ArtCatalog> {
  const { CARDS } = await import("../src/content/cards/index.ts");
  const { FIGMENTS } = await import("../src/content/figments/index.ts");
  const { DREAMWELL_CARDS } = await import("../src/content/dreamwell/index.ts");
  const { AVATARS } = await import("../src/content/avatars/index.ts");
  const { DREAMSIGNS } = await import("../src/content/dreamsigns/index.ts");
  const { AUGURY } = await import("../src/content/augury.ts");
  const { EXPLORATION } = await import("../src/content/exploration.ts");
  const { DREAMSCAPES } = await import("../src/content/dreamscapes.ts");
  const { DREAM_GUIDES } = await import("../src/content/guides.ts");
  const { ATLAS } = await import("../src/content/atlas.ts");
  const imageNumberByCardId = new Map<string, number>(
    CARDS.map((card) => [card.id.toLowerCase(), card.imageNumber]),
  );
  const offerTileImageNumbers = AUGURY.archetypes.flatMap((archetype) => {
    const presentation: { backgroundArt?: { imageNumber: number } } =
      archetype.presentation;
    return presentation.backgroundArt === undefined
      ? []
      : [presentation.backgroundArt.imageNumber];
  });
  return {
    cardImageNumbers: [
      ...CARDS.map((card) => card.imageNumber),
      ...FIGMENTS.map((figment) => figment.imageNumber),
      ...DREAMWELL_CARDS.map((card) => card.imageNumber),
      ...offerTileImageNumbers,
    ],
    avatars: AVATARS,
    dreamsignImageNames: DREAMSIGNS.map((dreamsign) => dreamsign.imageName),
    explorationImageNumbers: EXPLORATION.encounters.flatMap((encounter) => {
      const imageNumber = imageNumberByCardId.get(
        encounter.cardId.toLowerCase(),
      );
      return imageNumber === undefined ? [] : [imageNumber];
    }),
    dreamscapeArtNames: DREAMSCAPES.map((dreamscape) => dreamscape.id),
    guidePortraits: DREAM_GUIDES.map((guide) => ({
      artName: guide.id,
      portraitSource: guide.portraitSource,
    })),
    atlas: {
      bossSceneSource: ATLAS.assets.bossSceneSource,
      bossIconSource: ATLAS.assets.bossIconSource,
      bossFigureSource: ATLAS.assets.bossFigureSource,
      unrevealedFrameSource: ATLAS.assets.unrevealedFrameSource,
      unrevealedFrameFile: ATLAS.assets.unrevealedFrameKey,
      bossSceneArtName: ATLAS.boss.sceneArtId,
      bossIconArtName: ATLAS.boss.iconArtId,
      bossFigureArtName: ATLAS.boss.figureArtId,
    },
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(import.meta.dirname, "..");
  const home = resolve(process.env.DREAMTIDES_LOCAL_ASSET_HOME ?? homedir());
  linkArt(await contentArtCatalog(), defaultArtPaths(root, home));
  console.log("Asset setup complete.");
}
