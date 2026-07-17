// Typed glyph values for the strict Cumulus API.
//
// A glyph is an icon-font class (Boxicons v3 `bxf bx-…` / `bx bx-…`, or a
// Font-Awesome `fa-…`). Its value space is genuinely open — an icon font ships
// thousands of classes — so, unlike a color, no closed union can name every
// possible glyph. Strictness here means: a component takes a `Glyph`, not a
// `string`, and a `Glyph` is obtained in exactly two ways —
//
//   - `GLYPHS.<name>` — the design system's own named vocabulary (the resource
//     marks, the UI affordance icons). This is what cumulus components and their
//     callers use; it carries no raw class strings into call sites.
//   - `glyph(className)` — the single documented boundary for a class that
//     arrives from GAME DATA (a site-type icon defined in the atlas generator's
//     metadata table, resolved per node). Used only where such a string crosses
//     into the design system, never as a general-purpose wrapper.
//
// A `Glyph` IS its class string at runtime (a branded string), so it drops
// straight onto `className={glyph}` / `<i className={glyph} />`.

/** An icon-font class string that names a glyph. Obtain via {@link GLYPHS} or {@link glyph}. */
export type Glyph = string & { readonly __cumulusGlyph: unique symbol };

/** Brand a raw icon-font class string as a {@link Glyph} (internal helper). */
function g(className: string): Glyph {
  return className as unknown as Glyph;
}

/**
 * The design system's named glyph vocabulary. Consolidates the icon-font
 * classes that were previously duplicated as loose `*_ICON_CLASS` constants
 * across GlowIcon / RulesText / ResourceChip / Button so a mark reads the same
 * everywhere. Reference these by name; do not pass a raw class.
 */
export const GLYPHS = {
  // Resource marks (Boxicons v3 filled).
  essence: g("bxf bx-crypto"),
  energy: g("bxf bx-fire-alt"),
  spark: g("bxf bx-sparkles"),
  /** The single-star spark, cleaner than `spark` at small inline sizes. */
  sparkInline: g("bxf bx-sparkle"),
  points: g("bxf bx-star-circle"),
  counter: g("bxf bx-hourglass"),
  /** The exhaust / tap activation mark (the filled moon). */
  exhaust: g("bxf bx-moon"),
  /** Activated-ability lightning bolt. */
  bolt: g("bxf bx-bolt"),
  /** Leading caret used before a resolved-ability clause in rules text. */
  caretRight: g("bxf bx-caret-right"),

  // Tide marks (Boxicons v3 filled) — the closed set of five tide icons. These
  // mirror the production per-color tide glyphs in `src/components/tide-visuals`
  // (TIDE_COLOR_CHIP), the source of truth used by the Dreamcaller-select screen
  // and the tides editor.
  tideEmber: g("bxf bx-hot"),
  tideValor: g("bxf bx-shield"),
  tideVision: g("bxf bx-eye-alt"),
  tideWild: g("bxf bx-leaf"),
  tideShadow: g("bxf bx-skull"),

  // Domain / UI glyphs.
  water: g("bxf bx-water"),
  affiliationRow: g("bxf bx-rectangle-vertical"),
  starterFlag: g("fa-solid fa-flag"),

  // Affordance glyphs.
  check: g("bx bx-check"),
  lock: g("bx bx-lock"),
  /** The filled padlock — the solid variant used on the locked site-node badge. */
  lockFilled: g("bxf bx-lock"),
  close: g("bx bx-x"),
  closeFilled: g("bxf bx-x"),
  /** The (i) help mark, revealing an explanatory popover on hover / press. */
  info: g("bx bx-info-circle"),
  /** The filled (i) help mark — the solid disc variant for on-media use. */
  infoFilled: g("bxf bx-info-circle"),
  /** The filled warning triangle used for authoring and validation alerts. */
  warning: g("bxf bx-alert-triangle"),
  arrowLeft: g("bx bx-arrow-left"),
  arrowRight: g("bx bx-arrow-right"),
  /** The filled right arrow used between tangible before/after objects. */
  arrowRightFilled: g("bxf bx-arrow-right"),
  chevronLeft: g("bx bx-chevron-left"),
  chevronRight: g("bx bx-chevron-right"),
  /** A downward chevron. */
  chevronDown: g("bx bx-chevron-down"),
  /** An upward chevron. */
  chevronUp: g("bx bx-chevron-up"),
  /** The filled downward caret that marks a Select trigger as a dropdown. */
  caretDown: g("bxf bx-caret-down"),
  /** Filled up/down arrows — the leading mark on a sort dropdown button. */
  sort: g("bxf bx-arrow-up-down"),
  /** Hammer shared with the Transfiguration atlas-site mark. */
  transfigurationSite: g("fa-solid fa-hammer"),
  /** Filled funnel — the leading mark on a filter dropdown button. */
  filter: g("bxf bx-filter"),
  /** The filled star that heads a curated / signature item. */
  star: g("bxf bx-star"),
  /** A wrapped gift, used for granted objects and rewards. */
  gift: g("bxf bx-gift"),
  /** Filled phase marks used by the compact battle phase indicator. */
  phaseDawn: g("bxf bx-sun-rise"),
  phaseDay: g("bxf bx-sun"),
  phaseDusk: g("bxf bx-sun-set"),
  phaseNight: g("bxf bx-moon-stars"),
  phaseChallenge: g("bxf bx-sword-alt"),
  /** Two overlapping pages, used for duplication and copy effects. */
  copy: g("bxf bx-copy"),
  /** A plain plus mark, used to join objects into one granted bundle. */
  plus: g("bxf bx-plus"),
  /** A plain minus mark, used by compact decrement controls. */
  minus: g("bxf bx-minus"),
  /** The settings gear — the desktop quest-menu disclosure trigger. */
  gear: g("bxf bx-cog"),
  /** The bug mark — the battle debug-menu disclosure trigger. */
  bug: g("bxf bx-bug"),
  /** The prohibition mark — opens a non-empty banished zone. */
  block: g("bx bx-block"),
  /** A right sidebar — the battle inspector disclosure trigger. */
  sidebarRight: g("bx bx-sidebar-right"),
  /** The hamburger bars — the mobile quest-menu disclosure trigger. */
  menu: g("bxf bx-menu"),
  /** The circular refresh arrows used by shop restock actions. */
  refresh: g("bxf bx-refresh-cw"),
  /** Counter-clockwise refresh arrows used for character-type changes. */
  refreshCcw: g("bxf bx-refresh-ccw"),
  /** A pencil over a square, used for targeted text or keyword edits. */
  pencilSquare: g("bxf bx-pencil-square"),
  /** GitHub brand mark from the locally vendored Boxicons logos font. */
  github: g("bxl bxl-github"),
  /** Discord brand mark from the locally vendored Boxicons logos font. */
  discord: g("bxl bxl-discord-alt"),

  // Named Transfiguration marks. These mirror the card renderer's per-form
  // emblems and keep forge UI callers out of raw icon-font class strings.
  transfigurationEmpowered: g("bxf bx-bolt"),
  transfigurationAmplified: g("bxf bx-trending-up"),
  transfigurationKindled: g("bxf bx-flame"),
  transfigurationInspired: g("bxf bx-brain"),
  transfigurationEnduring: g("bxf bx-infinite"),
  transfigurationHastened: g("bxf bx-rocket"),
  transfigurationResonant: g("bxf bx-broadcast"),
  transfigurationAttuned: g("bxf bx-slider"),
  transfigurationPerfected: g("bxf bx-diamond"),
} as const;

/**
 * Brand a glyph class that arrives from GAME DATA (e.g. a site-type icon from
 * the atlas generator's metadata table) as a {@link Glyph}. This is the one
 * sanctioned boundary between untyped game-data icon strings and the typed UI;
 * prefer a {@link GLYPHS} name for the design system's own marks.
 */
export function glyph(className: string): Glyph {
  return g(className);
}
