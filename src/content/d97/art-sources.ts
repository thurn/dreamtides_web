/**
 * The D97 LPC art library manifest (P23).
 *
 * Every art source D97 draws from, with where it came from, the exact pin
 * fetched, its licenses and its credited authors. The library itself lives
 * outside the repository, at `~/Documents/lpc/` by default, one directory per
 * source. `scripts/setup-assets.ts` links each source's `served` subtrees
 * into the gitignored `public/d97/<directory>/`; the credits screen is
 * generated from this manifest and the sources' `creditsFiles`.
 */

/** A pinned git checkout: a shallow clone of `repository` at `commit`. */
interface GitPin {
  readonly kind: "git";
  readonly repository: string;
  readonly branch: string;
  readonly commit: string;
}

/** Downloaded files, each pinned by its SHA-256. Zips unpack into `files/`. */
interface ArchivePin {
  readonly kind: "archive";
  readonly files: readonly {
    readonly url: string;
    readonly sha256: string;
  }[];
}

export interface D97ArtSource {
  readonly title: string;
  /** The page that publishes the source. */
  readonly url: string;
  readonly pin: GitPin | ArchivePin;
  /** License names as the source states them; any one may be chosen. */
  readonly licenses: readonly string[];
  /** Credited authors, from the source's page or attribution files. */
  readonly authors: readonly string[];
  /** Library-relative attribution files with per-file credits. */
  readonly creditsFiles: readonly string[];
  /** The source's directory in the library and under `public/d97/`. */
  readonly directory: string;
  /**
   * Source-relative subtrees served to the browser. Tooling that runs at
   * workspace preparation (map compilation, character compositing) reads the
   * whole library directly.
   */
  readonly served: readonly string[];
}

const OGA_FILES = "https://opengameart.org/sites/default/files";

export const D97_ART_SOURCES: readonly D97ArtSource[] = [
  {
    title: "Source of Tales",
    url: "https://gitlab.com/tales/sourceoftales",
    pin: {
      kind: "git",
      repository: "https://gitlab.com/tales/sourceoftales.git",
      branch: "master",
      commit: "ce4457dfd9da49be9daf54098b15ac73ed830fd0",
    },
    licenses: ["CC-BY-SA 3.0", "GPL 3.0"],
    authors: [
      "Erik Schilling",
      "Jessica Tölke",
      "Felix Stadthaus",
      "Stefan Beller",
      "Przemysław Grzywacz",
      "Thorbjørn Lindeijer",
      "Tom Leese",
      "Lanea Zimmerman (Sharm)",
      "Stephen Challener (Redshrike)",
      "Daniel Eddeland",
      "Casper Nilsson",
      "Johannes Sjölund",
      "and the artists listed in AUTHORS.txt",
    ],
    creditsFiles: ["source-of-tales/AUTHORS.txt"],
    directory: "source-of-tales",
    served: ["tiles", "sprites", "items"],
  },
  {
    title: "LPC Revised",
    url: "https://github.com/ElizaWy/LPC",
    pin: {
      kind: "git",
      repository: "https://github.com/ElizaWy/LPC.git",
      branch: "main",
      commit: "f07f7f5892e67c932c68f70bb04472f2c64e46bc",
    },
    licenses: ["OGA-BY 3.0", "CC-BY 3.0"],
    authors: [
      "Eliza Wyatt (DeathsDarling)",
      "Lanea Zimmerman (Sharm)",
      "Stephen Challener (Redshrike)",
      "Johannes Sjölund (Wulax)",
      "bluecarrot16",
      "BenCreating",
      "Durrani",
      "YuriNikolai",
      "Craftpix.net 2D Game Assets",
    ],
    creditsFiles: ["lpc-revised/Credits.txt"],
    directory: "lpc-revised",
    served: ["Terrain", "Objects", "Structure", "FX", "_ Test Scenes"],
  },
  {
    title: "Universal LPC Spritesheet Character Generator",
    url: "https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator",
    pin: {
      kind: "git",
      repository:
        "https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git",
      branch: "master",
      commit: "9bf06be193b053db256b2536824af426de046aa2",
    },
    licenses: ["CC0", "CC-BY 3.0", "CC-BY-SA 3.0", "OGA-BY 3.0", "GPL 3.0"],
    authors: ["The contributors listed per sprite part in CREDITS.csv"],
    creditsFiles: ["ulpc-generator/CREDITS.csv"],
    directory: "ulpc-generator",
    served: [],
  },
  {
    title: "LPC Tile Atlas",
    url: "https://opengameart.org/content/lpc-tile-atlas",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/Atlas_0.zip`,
          sha256:
            "4b8d0030c4e5c18029a0298caf11c74d38eb10273ac44e364ef620b81bcaa5fd",
        },
      ],
    },
    licenses: ["CC-BY-SA 3.0", "GPL 3.0"],
    authors: [
      "adrix89",
      "Casper Nilsson",
      "Charles Sanchez (CharlesGabriel)",
      "Daniel Armstrong (HughSpectrum)",
      "Daniel Eddeland",
      "Johann Charlot",
      "Lanea Zimmerman (Sharm)",
      "Manuel Riecke (MrBeast)",
      "Skyler Robert Colladay",
      "Stephen Challener (Redshrike)",
    ],
    creditsFiles: ["lpc-tile-atlas/files/Attribution.txt"],
    directory: "lpc-tile-atlas",
    served: ["files"],
  },
  {
    title: "LPC Tile Atlas2",
    url: "https://opengameart.org/content/lpc-tile-atlas2",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/Atlas2.zip`,
          sha256:
            "db68bae7222fa84806bad88cd6fc9c239ece3bdd49fda5a0decc21f0f6e09088",
        },
      ],
    },
    licenses: ["CC-BY-SA 3.0", "GPL 3.0"],
    authors: [
      "adrix89",
      "Barbara Rivera",
      "Casper Nilsson",
      "Charles Sanchez (CharlesGabriel)",
      "Chris Phillips",
      "Daniel Armstrong (HughSpectrum)",
      "Daniel Eddeland",
      "Jonas Klinger",
      "Joshua Taylor",
      "Lanea Zimmerman (Sharm)",
      "Leo Villeveygoux",
      "Manuel Riecke (MrBeast)",
      "Mark Weyer",
      "Matthew Nash",
      "Skyler Robert Colladay",
      "Stephen Challener (Redshrike)",
    ],
    creditsFiles: ["lpc-tile-atlas2/files/Attribution2.txt"],
    directory: "lpc-tile-atlas2",
    served: ["files"],
  },
  {
    title: "LPC goes to space",
    url: "https://opengameart.org/content/lpc-goes-to-space",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/scifi_space_rpg_tiles_lpcized_0.png`,
          sha256:
            "fc6acc103df0bc1a4b59d541b12bfdaf7e5ad3eebf76f6178191c355c7325307",
        },
        {
          url: `${OGA_FILES}/spaceship_6.png`,
          sha256:
            "c22b96008e133917608dcb3d48de419d917067818bad82c30b689423d15f330f",
        },
        {
          url: `${OGA_FILES}/items_27.png`,
          sha256:
            "efcb6aa468ed7a975f24fb70c73ccff0fe09ea4083aad84f88738ee06d108045",
        },
      ],
    },
    licenses: ["CC-BY-SA 4.0", "GPL 3.0"],
    authors: ["Basxto", "Hyptosis", "FunwithPixels", "Skorpio"],
    creditsFiles: [],
    directory: "lpc-goes-to-space",
    served: ["files"],
  },
  {
    title: "[LPC] FraMa sci-fi extensions",
    url: "https://opengameart.org/content/lpc-frama-sci-fi-extensions",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/frama_scifi_extension.zip`,
          sha256:
            "67ca176eefccb2ddb2c85099738e9d4f8f72fbbfdf6ff4ca7f614dd2aae80d99",
        },
      ],
    },
    licenses: ["CC-BY-SA 4.0", "GPL 3.0"],
    authors: ["Basxto", "Wonko", "Hyptosis", "FunwithPixels", "Skorpio"],
    creditsFiles: [],
    directory: "lpc-frama-sci-fi-extensions",
    served: ["files"],
  },
  {
    title: "LPC Winter Tiles",
    url: "https://opengameart.org/content/lpc-winter-tiles",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/TilesA2.png`,
          sha256:
            "f39d6f1034ec5508089ae2bc8f1e476ae96463cca698ff689b9a0807d93c00be",
        },
        {
          url: `${OGA_FILES}/TilesA3.png`,
          sha256:
            "44d4818a295280c7363310ac7c788b5f330f65522881dd43db9f927512e31be0",
        },
        {
          url: `${OGA_FILES}/TilesB.png`,
          sha256:
            "23bfbb2a2508b3d03a7b34e853e23681cdc247edd949eab82596c5ef12587173",
        },
      ],
    },
    licenses: ["CC-BY 3.0", "CC-BY-SA 3.0", "GPL 3.0", "OGA-BY 3.0"],
    authors: ["Demetrius", "Lanea Zimmerman (Sharm)", "William Thompson"],
    creditsFiles: [],
    directory: "lpc-winter-tiles",
    served: ["files"],
  },
  {
    title: "[LPC] Beach / Desert",
    url: "https://opengameart.org/content/lpc-beach-desert",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/lpc-beach-desert-v2.zip`,
          sha256:
            "74314f9f46d8115f3e7d22ee6e25c6d71aa5aa18ea157caaab83d0af592f2759",
        },
      ],
    },
    licenses: ["CC-BY-SA 3.0"],
    authors: [
      "bluecarrot16",
      "Guillaume Lecollinet",
      "Johann Charlot",
      "cynicmusic",
      "Surt",
      "vk",
      "Yar",
      "Michele Bucelli (Buch)",
      "Richard Kettering (Jetrel)",
      "Zachariah Husiar (Zabin)",
      "Hyptosis",
      "Lanea Zimmerman (Sharm)",
      "Frode Lindeijer (Modanung)",
    ],
    creditsFiles: [
      "lpc-beach-desert/files/lpc-beach-desert/CREDITS-beach-desert.txt",
    ],
    directory: "lpc-beach-desert",
    served: ["files"],
  },
  {
    title: "[LPC] Adobe Town Set",
    url: "https://opengameart.org/content/lpc-adobe-town-set",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/adobe-2.png`,
          sha256:
            "39df483f1315ffe55642027fac9ad787a1f88332da8799e2e0e1a2e89bda7794",
        },
      ],
    },
    licenses: ["CC-BY 3.0", "GPL 3.0", "GPL 2.0", "OGA-BY 3.0"],
    authors: ["bluecarrot16", "Lanea Zimmerman (Sharm)", "William Thompson"],
    creditsFiles: [],
    directory: "lpc-adobe-town-set",
    served: ["files"],
  },
  {
    title: "[LPC] Medieval Village Decorations",
    url: "https://opengameart.org/content/lpc-medieval-village-decorations",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/decoration_medieval.zip`,
          sha256:
            "c061a00c301aec1119e1e066d2c1625175a29d1fbf5a73dbff08d3a4b023c7c3",
        },
      ],
    },
    licenses: ["CC-BY-SA 4.0", "CC-BY-SA 3.0"],
    authors: [
      "bluecarrot16",
      "and the artists listed in CREDITS-decorations-medieval.txt",
    ],
    creditsFiles: [
      "lpc-medieval-village-decorations/files/decoration_medieval/CREDITS-decorations-medieval.txt",
    ],
    directory: "lpc-medieval-village-decorations",
    served: ["files"],
  },
  {
    title: "[LPC] Victorian Town Decorations",
    url: "https://opengameart.org/content/lpc-victorian-town-decorations",
    pin: {
      kind: "archive",
      files: [
        {
          url: `${OGA_FILES}/lpc-victorian-decoration.zip`,
          sha256:
            "f2fdffe9137b0a1128591634769ba6f6625220fea0eae5ac82fd7391d310e8cf",
        },
      ],
    },
    licenses: ["CC-BY-SA 4.0"],
    authors: [
      "bluecarrot16",
      "Casper Nilsson",
      "Lanea Zimmerman (Sharm)",
      "William Thompson",
      "and the artists listed in CREDITS-decorations-victorian.txt",
    ],
    creditsFiles: [
      "lpc-victorian-town-decorations/files/lpc-victorian-decoration/CREDITS-decorations-victorian.txt",
    ],
    directory: "lpc-victorian-town-decorations",
    served: ["files"],
  },
  {
    title: "Big Island",
    url: "https://github.com/seveibar/liberated-pixel-cup",
    pin: {
      kind: "git",
      repository: "https://github.com/seveibar/liberated-pixel-cup.git",
      branch: "master",
      commit: "c333646785780b6b8eaf90fa6fd75db49b07d76b",
    },
    licenses: ["CC-BY-SA 3.0", "GPL 3.0"],
    authors: [
      "Severin Ibarluzea",
      "Casper Nilsson",
      "Daniel Eddeland",
      "Johannes Sjölund",
      "Joshua Taylor",
      "Lanea Zimmerman (Sharm)",
      "Mark Weyer",
      "Stephen Challener (Redshrike)",
    ],
    creditsFiles: ["big-island/AUTHORS.txt"],
    directory: "big-island",
    served: ["resources/assets"],
  },
  {
    title: "Neverwell Moor",
    url: "https://github.com/blipjoy/nm-prototype",
    pin: {
      kind: "git",
      repository: "https://github.com/blipjoy/nm-prototype.git",
      branch: "gh-pages",
      commit: "99e23cd262d252d7a97b1a52e11c9207ca2bccaf",
    },
    licenses: ["CC-BY-SA 3.0", "GPL 3.0"],
    authors: [
      "Jason Oster",
      "Casper Nilsson",
      "Charles Sanchez",
      "Chris Bellanger",
      "Daniel Eddeland",
      "Etherian",
      "Guido Bos",
      "Janne Hanhisuanto",
      "Jetrel",
      "Lanea Zimmerman (Sharm)",
      "Matthew Nash",
      "Nelson James Gatlin",
      "Pol Camara",
      "Radomir Dopieralski",
      "Stephen Challener (Redshrike)",
      "Thane Brimhall",
    ],
    creditsFiles: ["neverwell-moor/AUTHORS.txt"],
    directory: "neverwell-moor",
    served: ["resources/img"],
  },
];
