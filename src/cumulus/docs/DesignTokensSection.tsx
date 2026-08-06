// DesignTokensSection — the token section of the /cumulus overview. A generated-from-tokens gallery of
// every design token in cumulus-tokens.css: color, typography, radius,
// spacing, motion, and glow/shadow specimens, plus a small curated set of
// the Boxicon/Phosphor glyphs the system actually uses. Renders below
// IntroSection and above the component catalog in `CumulusApp.tsx`'s
// `Overview`.
//
// Boundary: `src/cumulus/**` may not import `scripts/lib/cumulus-css-tokens.mjs`
// (a build-time Node module, forbidden by the Cumulus isolation ESLint rule —
// see eslint-rules/no-external-ui-imports.js). Instead this section reads
// the already-generated `../primitives/tokens` — the single typed mirror of
// cumulus-tokens.css that `scripts/generate-cumulus-tokens.mjs` produces via the
// one parser (parseCssTokens). That generator now carries each token's
// `@kind` marker (color / radius / shadow / font / other) through into
// `TOKENS`, so this section groups by kind + name-prefix without parsing
// any CSS itself, and never drifts from the source sheet by hand: add a
// token to cumulus-tokens.css, rerun `npm run cumulus-tokens`, and it appears
// here automatically.
//
// Dogfoods Cumulus tokens for its own chrome (headings, layout, spacing) via
// `token(...)`, matching IntroSection.tsx and CumulusApp.tsx — the only raw
// values below are the ones a specimen exists to display.

import { useEffect, type CSSProperties, type ReactElement } from "react";
import { token, TOKENS } from "../primitives/tokens";

/** The generated shape of a TOKENS entry, widened away from the exact `as
 * const` literal union so this module can iterate every entry uniformly
 * (some tokens carry a `kind`, most don't). */
interface TokenEntry {
  var: string;
  value: string;
  kind?: string;
}

/** Every generated token, keyed by its `--name`, widened to `TokenEntry`. */
const TOKEN_MAP: Record<string, TokenEntry> = TOKENS;

/** All generated tokens as `[name, entry]` pairs, in the source CSS's
 * declaration order (the order `Object.entries` preserves from `TOKENS`). */
const TOKEN_ENTRIES: [string, TokenEntry][] = Object.entries(TOKEN_MAP);

// ---------------------------------------------------------------------------
// Classification: sort every token into one specimen bucket, then a family
// sub-group within it, purely from data already on the token (its `@kind`
// marker, its name, or the shape of its own value) — never a hand-maintained
// list of token names.
// ---------------------------------------------------------------------------

type Bucket = "color" | "typography" | "radius" | "spacing" | "motion" | "shadow" | "other";

const BUCKET_TITLES: Record<Bucket, string> = {
  color: "Color",
  typography: "Typography",
  radius: "Radius",
  spacing: "Spacing",
  motion: "Motion",
  shadow: "Glow & Shadow",
  other: "Other",
};

/** A value that is (or, after resolving var() aliases, resolves to) a bare
 * hex / rgb(a) / hsl(a) literal — as opposed to a gradient, a shadow list, or
 * a plain length/keyword. */
const COLOR_VALUE_RE = /^(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/;

/** Strips the leading `--` so family and bucket checks operate on the token's
 * public name segments. */
function shortName(name: string): string {
  return name.startsWith("--") ? name.slice(2) : name;
}

/** The token's family: its name's first `-`-delimited segment (e.g.
 * `violet-400` -> `violet`, `space-9` -> `space`, a single-segment name like
 * `accent` -> `accent`). Sibling tokens sharing a family render together. */
function familyOf(name: string): string {
  const short = shortName(name);
  const dash = short.indexOf("-");
  return dash === -1 ? short : short.slice(0, dash);
}

/** Human-readable sub-heading for a token family whose raw segment is a cryptic
 * abbreviation. Most families read fine uppercased (BG, TEXT, GOLD); only the
 * ones spelled as initials need spelling out so the gallery is self-explaining.
 * A family not listed here falls back to its raw segment. */
const FAMILY_LABELS: Record<string, string> = {
  cat: "Card Category",
  dt: "Atlas Theme",
  cv: "Card View",
};

/** The family sub-heading shown above a group of sibling tokens. */
function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family;
}

/** Follows a value that is *purely* a single `var(--x)` reference to the
 * token it points at, repeating until the value is no longer a bare var()
 * reference (or the alias chain runs out). Composite values — a shadow list,
 * a gradient, a `duration easing` pair — never match the pattern and are
 * returned unchanged, so this only ever "sees through" a plain alias. */
function resolveValue(value: string, depth = 0): string {
  if (depth > 8) {
    return value;
  }
  const match = /^var\((--[a-zA-Z0-9_-]+)\)$/.exec(value.trim());
  if (match === null) {
    return value;
  }
  const referenced = TOKEN_MAP[match[1]];
  if (referenced === undefined) {
    return value;
  }
  return resolveValue(referenced.value, depth + 1);
}

function isColorValue(value: string): boolean {
  return COLOR_VALUE_RE.test(resolveValue(value).trim());
}

/**
 * Sorts a token into a specimen bucket. An explicit `@kind` marker (color /
 * radius / shadow / font) wins outright. The CSS's own `@kind` vocabulary
 * only distinguishes color / radius / shadow / font / other, so a token
 * marked `other` — and the much larger set of tokens with no marker at all,
 * since a name like `--radius-panel` never needed one — falls
 * through to a name-prefix check, and failing that, a check of the value's
 * own shape (a bare hex/rgb/hsl literal reads as color regardless of name).
 */
function bucketOf(name: string, entry: TokenEntry): Bucket {
  if (entry.kind === "radius") return "radius";
  if (entry.kind === "shadow") return "shadow";
  if (entry.kind === "font") return "typography";
  if (entry.kind === "color") return "color";

  const short = shortName(name);
  if (short.startsWith("radius-")) return "radius";
  if (
    short.startsWith("shadow-") ||
    short.startsWith("glow-") ||
    short.startsWith("inset-")
  ) {
    return "shadow";
  }
  if (short.startsWith("space-")) return "spacing";
  if (
    short.startsWith("ease-") ||
    short.startsWith("dur-") ||
    short.startsWith("motion-") ||
    short.startsWith("stagger-")
  ) {
    return "motion";
  }
  if (
    short.startsWith("t-") ||
    short.startsWith("font-") ||
    short.startsWith("weight-") ||
    short.startsWith("tracking-")
  ) {
    return "typography";
  }
  if (isColorValue(entry.value)) return "color";
  return "other";
}

interface FamilyGroup {
  family: string;
  entries: [string, TokenEntry][];
}

/** Groups a bucket's entries by family, preserving first-appearance order —
 * mirroring `groupComponents` in CumulusApp.tsx. */
function groupByFamily(entries: [string, TokenEntry][]): FamilyGroup[] {
  const groups: FamilyGroup[] = [];
  for (const entry of entries) {
    const family = familyOf(entry[0]);
    let group = groups.find((candidate) => candidate.family === family);
    if (!group) {
      group = { family, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

type Buckets = Record<Bucket, [string, TokenEntry][]>;

/** Sorts a list of token entries into specimen buckets, preserving source
 * order within each bucket. */
function bucketize(entries: [string, TokenEntry][]): Buckets {
  const buckets: Buckets = {
    color: [],
    typography: [],
    radius: [],
    spacing: [],
    motion: [],
    shadow: [],
    other: [],
  };
  for (const [name, entry] of entries) {
    buckets[bucketOf(name, entry)].push([name, entry]);
  }
  return buckets;
}

/** The complete public token vocabulary, bucketized for the specimen gallery. */
const TOKEN_BUCKETS = bucketize(TOKEN_ENTRIES);

// ---------------------------------------------------------------------------
// Table-of-contents anchors. Each token category gets a stable DOM id the overview's table of
// contents can nest under "Design Tokens" and scroll-track. The order here is
// the order TokenGallery renders the buckets in, so the TOC reads top-to-bottom.
// ---------------------------------------------------------------------------

/** The buckets in the fixed order TokenGallery renders them. */
const ORDERED_BUCKETS: Bucket[] = [
  "color",
  "typography",
  "radius",
  "spacing",
  "motion",
  "shadow",
  "other",
];

/** Stable DOM id for a token category's section (Color, Typography, ...). */
function tokenCategoryId(bucket: Bucket): string {
  return `cumulus-toc-tokencat-${bucket}`;
}

/** DOM id of the Iconography section (not token-backed, so it isn't a bucket). */
const ICONOGRAPHY_ANCHOR_ID = "cumulus-toc-tokencat-icon";

/**
 * The token-category sub-entries the overview's table of contents nests under
 * "Design Tokens": every non-empty category in render order, then
 * Iconography. Derived from the same buckets the section renders, so it can
 * never drift from the on-page headings.
 */
export const TOKEN_TOC_ENTRIES: { id: string; label: string }[] = [
  ...ORDERED_BUCKETS.filter((bucket) => TOKEN_BUCKETS[bucket].length > 0).map(
    (bucket) => ({ id: tokenCategoryId(bucket), label: BUCKET_TITLES[bucket] }),
  ),
  { id: ICONOGRAPHY_ANCHOR_ID, label: "Iconography" },
];

// ---------------------------------------------------------------------------
// Shared chrome (dogfooding Cumulus tokens), matching IntroSection.tsx's style.
// ---------------------------------------------------------------------------

const eyebrowStyle: CSSProperties = {
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  color: token("--accent-bright"),
  margin: 0,
};

const sectionTitleStyle: CSSProperties = {
  font: token("--t-title"),
  color: token("--text-primary"),
  margin: `${token("--space-3")} 0 ${token("--space-6")}`,
};

const leadStyle: CSSProperties = {
  font: token("--t-lead"),
  color: token("--text-secondary"),
  margin: `0 0 ${token("--space-9")}`,
  maxWidth: "62ch",
};

const groupWrapStyle: CSSProperties = {
  marginBottom: token("--space-10"),
};

const groupTitleStyle: CSSProperties = {
  font: token("--t-title-sm"),
  color: token("--text-primary"),
  margin: `0 0 ${token("--space-3")}`,
};

const groupDescriptionStyle: CSSProperties = {
  font: token("--t-body-sm"),
  color: token("--text-secondary"),
  margin: `0 0 ${token("--space-6")}`,
  maxWidth: "68ch",
};

const familyTitleStyle: CSSProperties = {
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  color: token("--text-muted"),
  margin: `0 0 ${token("--space-3")}`,
};

const familyBlockStyle: CSSProperties = {
  marginBottom: token("--space-6"),
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: token("--space-5"),
};

const specimenTileStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: token("--space-2"),
  padding: token("--space-5"),
  background: token("--surface-card"),
  border: `1px solid ${token("--border-soft")}`,
  borderRadius: token("--radius-control"),
  minWidth: 0,
};

const specimenNameStyle: CSSProperties = {
  font: token("--t-popover-meta"),
  color: token("--text-secondary"),
  margin: 0,
  wordBreak: "break-all",
};

const specimenValueStyle: CSSProperties = {
  font: token("--t-caption"),
  color: token("--text-muted"),
  margin: 0,
  wordBreak: "break-all",
};

/** Wraps one top-level bucket ("Color", "Typography", ...) with a heading,
 * a one-line description, and its content. `id`, when given, anchors the
 * section so the overview's table of contents can scroll to and track it. */
function TokenGroup({
  title,
  description,
  id,
  children,
}: {
  title: string;
  description: string;
  id?: string;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <section id={id} style={groupWrapStyle}>
      <h3 style={groupTitleStyle}>{title}</h3>
      <p style={groupDescriptionStyle}>{description}</p>
      {children}
    </section>
  );
}

/** Renders a bucket's entries, grouping into family sub-headings only when
 * the bucket actually contains more than one family (a bucket like Radius,
 * which is entirely `--r-*`, renders as one flat grid instead). */
function FamilyGrid({
  entries,
  renderSpecimen,
}: {
  entries: [string, TokenEntry][];
  renderSpecimen: (name: string, entry: TokenEntry) => ReactElement;
}): ReactElement {
  const families = groupByFamily(entries);
  if (families.length <= 1) {
    return (
      <div style={gridStyle}>
        {entries.map(([name, entry]) => (
          <div key={name}>{renderSpecimen(name, entry)}</div>
        ))}
      </div>
    );
  }
  return (
    <>
      {families.map(({ family, entries: familyEntries }) => (
        <div key={family} style={familyBlockStyle}>
          <p style={familyTitleStyle}>{familyLabel(family)}</p>
          <div style={gridStyle}>
            {familyEntries.map(([name, entry]) => (
              <div key={name}>{renderSpecimen(name, entry)}</div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

const colorSwatchStyle: CSSProperties = {
  width: "100%",
  height: "56px",
  borderRadius: token("--radius-inset"),
  border: `1px solid ${token("--border-mid")}`,
  boxShadow: token("--shadow-sm"),
};

function ColorSpecimen(name: string, entry: TokenEntry): ReactElement {
  const resolved = resolveValue(entry.value);
  const showResolved = resolved !== entry.value;
  return (
    <div style={specimenTileStyle}>
      <div style={{ ...colorSwatchStyle, background: `var(${name})` }} />
      <p style={specimenNameStyle}>{name}</p>
      <p style={specimenValueStyle}>{entry.value}</p>
      {showResolved && <p style={specimenValueStyle}>= {resolved}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

const typeSampleStyle: CSSProperties = {
  color: token("--text-primary"),
  margin: 0,
};

function TypographySpecimen(name: string, entry: TokenEntry): ReactElement {
  const family = familyOf(name);
  let sample: ReactElement;
  if (family === "font") {
    sample = (
      <p style={{ ...typeSampleStyle, fontFamily: `var(${name})`, fontSize: "19px" }}>
        Aa Bb Cc — the dreaming fox
      </p>
    );
  } else if (family === "w") {
    sample = (
      <p
        style={{
          ...typeSampleStyle,
          fontFamily: token("--font-ui"),
          fontSize: "19px",
          fontWeight: `var(${name})`,
        }}
      >
        Weight {entry.value}
      </p>
    );
  } else if (family === "tracking") {
    sample = (
      <p
        style={{
          ...typeSampleStyle,
          font: token("--t-eyebrow"),
          textTransform: "uppercase",
          letterSpacing: `var(${name})`,
        }}
      >
        Tracking sample
      </p>
    );
  } else {
    // family === "t": the composite `font` shorthand tokens.
    sample = <p style={{ ...typeSampleStyle, font: `var(${name})` }}>Dream deeply, wake changed.</p>;
  }
  return (
    <div style={specimenTileStyle}>
      {sample}
      <p style={specimenNameStyle}>{name}</p>
      <p style={specimenValueStyle}>{entry.value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

function RadiusSpecimen(name: string, entry: TokenEntry): ReactElement {
  return (
    <div style={specimenTileStyle}>
      <div
        style={{
          width: "100%",
          height: "56px",
          background: token("--surface-raised"),
          border: `1px solid ${token("--border-soft")}`,
          borderRadius: `var(${name})`,
        }}
      />
      <p style={specimenNameStyle}>{name}</p>
      <p style={specimenValueStyle}>{entry.value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

function SpacingSpecimen(name: string, entry: TokenEntry): ReactElement {
  return (
    <div style={specimenTileStyle}>
      <div
        style={{
          height: token("--space-4"),
          width: `var(${name})`,
          minWidth: "2px",
          background: token("--accent"),
          borderRadius: token("--radius-pill"),
        }}
      />
      <p style={specimenNameStyle}>{name}</p>
      <p style={specimenValueStyle}>{entry.value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Motion — durations, easings, and the composite motion-* tokens, dogfooded
// as a drifting dot. Respects prefers-reduced-motion via a CSS media query
// on the shared keyframes class (the same technique Motes.tsx uses), rather
// than a JS check, so an inline `animation` shorthand never fights it.
// ---------------------------------------------------------------------------

const MOTION_STYLE_ELEMENT_ID = "cumulus-primitives-motion-kf";

/** Inserts the shared drift keyframes + reduced-motion guard into
 * document.head, once per document, the first time DesignTokensSection mounts. */
function ensureMotionKeyframes(): void {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(MOTION_STYLE_ELEMENT_ID) !== null) {
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.id = MOTION_STYLE_ELEMENT_ID;
  styleElement.textContent =
    // A fixed pixel offset, not a percentage: translateX()'s percentage
    // resolves against the dot's OWN border box (16px), not the track it
    // sits in, so a percentage-based distance here would collapse to ~0.
    "@keyframes cumulusPrimitivesDrift{0%,100%{transform:translateX(0)}50%{transform:translateX(48px)}}" +
    ".cumulus-primitives-dot{animation-name:cumulusPrimitivesDrift;animation-iteration-count:infinite}" +
    "@media(prefers-reduced-motion:reduce){.cumulus-primitives-dot{animation-play-state:paused}}";
  document.head.appendChild(styleElement);
}

function useMotionKeyframes(): void {
  useEffect(() => {
    ensureMotionKeyframes();
  }, []);
}

const motionTrackStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: token("--space-8"),
  background: token("--surface-raised"),
  borderRadius: token("--radius-pill"),
  overflow: "hidden",
};

const motionDotStyle: CSSProperties = {
  position: "absolute",
  top: "4px",
  left: "4px",
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  background: token("--accent-bright"),
  boxShadow: token("--glow-accent-soft"),
};

/** Splits a composite `duration easing` value (the `--motion-*` tokens'
 * shape, e.g. "420ms var(--ease-out)") into its two space-separated parts,
 * so each can drive a separate longhand `animation-*` property instead of
 * the `animation` shorthand (which would reset `animation-play-state` and
 * defeat the reduced-motion override above). */
function splitDurationEasing(value: string): { duration: string; easing: string } {
  const [duration, ...rest] = value.trim().split(/\s+/);
  return { duration: duration ?? value, easing: rest.join(" ") || token("--ease-out") };
}

function MotionSpecimen(name: string, entry: TokenEntry): ReactElement {
  const family = familyOf(name);
  let dotStyle: CSSProperties = motionDotStyle;
  if (family === "ease") {
    dotStyle = { ...motionDotStyle, animationDuration: token("--dur-slow"), animationTimingFunction: `var(${name})` };
  } else if (family === "dur") {
    dotStyle = { ...motionDotStyle, animationDuration: `var(${name})`, animationTimingFunction: token("--ease-out") };
  } else if (family === "motion") {
    const { duration, easing } = splitDurationEasing(entry.value);
    dotStyle = { ...motionDotStyle, animationDuration: duration, animationTimingFunction: easing };
  } else {
    // family === "stagger": a single token that has no duration/easing of its
    // own — visualized instead by the staggered row below, so the dot here
    // just sits still under a neutral reference motion.
    dotStyle = { ...motionDotStyle, animationDuration: token("--dur-base"), animationTimingFunction: token("--ease-out") };
  }
  return (
    <div style={specimenTileStyle}>
      <div style={motionTrackStyle}>
        <div className="cumulus-primitives-dot" style={dotStyle} />
      </div>
      <p style={specimenNameStyle}>{name}</p>
      <p style={specimenValueStyle}>{entry.value}</p>
    </div>
  );
}

const STAGGER_DEMO_COUNT = 4;

/** A row of dots sharing one reference duration/easing, each delayed by an
 * increasing multiple of `--stagger-travel` — the shape the token is
 * actually used in (several like objects entering in a cascade). */
function StaggerSpecimen(name: string): ReactElement {
  return (
    <div style={specimenTileStyle}>
      <div style={{ ...motionTrackStyle, display: "flex", alignItems: "center" }}>
        {Array.from({ length: STAGGER_DEMO_COUNT }, (_, index) => (
          <div
            key={index}
            className="cumulus-primitives-dot"
            style={{
              ...motionDotStyle,
              position: "relative",
              top: 0,
              left: 0,
              marginLeft: index === 0 ? token("--space-2") : token("--space-3"),
              animationDuration: token("--dur-base"),
              animationTimingFunction: token("--ease-out"),
              animationDelay: `calc(var(${name}) * ${String(index)})`,
            }}
          />
        ))}
      </div>
      <p style={specimenNameStyle}>{name}</p>
      <p style={specimenValueStyle}>staggered by index × the token</p>
    </div>
  );
}

function renderMotionEntries(entries: [string, TokenEntry][]): ReactElement {
  const families = groupByFamily(entries);
  return (
    <>
      {families.map(({ family, entries: familyEntries }) => (
        <div key={family} style={familyBlockStyle}>
          <p style={familyTitleStyle}>{familyLabel(family)}</p>
          <div style={gridStyle}>
            {family === "stagger"
              ? familyEntries.map(([name]) => <div key={name}>{StaggerSpecimen(name)}</div>)
              : familyEntries.map(([name, entry]) => <div key={name}>{MotionSpecimen(name, entry)}</div>)}
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Glow & Shadow
// ---------------------------------------------------------------------------

function ShadowSpecimen(name: string, entry: TokenEntry): ReactElement {
  return (
    <div style={specimenTileStyle}>
      <div
        style={{
          height: "56px",
          margin: token("--space-3"),
          background: token("--surface-card"),
          borderRadius: token("--radius-control"),
          boxShadow: `var(${name})`,
        }}
      />
      <p style={specimenNameStyle}>{name}</p>
      <p style={specimenValueStyle}>{entry.value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iconography — not backed by TOKENS (glyphs aren't design tokens), so this
// is a small curated sample of the Boxicon/Phosphor faces actually used
// elsewhere in the product (grep'd from src/battle and src/cumulus), rather
// than data derived from the token sheet.
// ---------------------------------------------------------------------------

interface IconSample {
  className: string;
  label: string;
}

const ICON_SAMPLES: IconSample[] = [
  { className: "bxf bx-crypto", label: "essence" },
  { className: "bxf bx-sparkles", label: "spark" },
  { className: "bxf bx-fire-alt", label: "energy" },
  { className: "bxf bx-water", label: "tide" },
  { className: "bxf bx-sword", label: "battle" },
  { className: "bx bx-check", label: "confirm" },
  { className: "bx bx-x", label: "dismiss" },
  { className: "bx bx-lock", label: "locked" },
  { className: "ph-fill ph-cards", label: "deck (Phosphor fallback)" },
];

function IconSpecimen({ className, label }: IconSample): ReactElement {
  return (
    <div style={specimenTileStyle}>
      <i className={className} aria-hidden="true" style={{ fontSize: "26px", color: token("--text-primary") }} />
      <p style={specimenNameStyle}>{className}</p>
      <p style={specimenValueStyle}>{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Other — every remaining token (layout constants, gradients, atlas washes),
// rendered as a compact name/value list so nothing generated is ever silently
// missing from the page.
// ---------------------------------------------------------------------------

const otherRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: token("--space-5"),
  padding: `${token("--space-2")} 0`,
  borderBottom: `1px solid ${token("--border-soft")}`,
};

function OtherSpecimen(name: string, entry: TokenEntry): ReactElement {
  return (
    <div style={otherRowStyle}>
      <span style={specimenNameStyle}>{name}</span>
      <span style={{ ...specimenValueStyle, textAlign: "right" }}>{entry.value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier headings, guidance note, and the shared gallery body
// ---------------------------------------------------------------------------

const noteStyle: CSSProperties = {
  font: token("--t-body-sm"),
  color: token("--text-secondary"),
  margin: `0 0 ${token("--space-9")}`,
  padding: token("--space-6"),
  background: token("--accent-tint"),
  border: `1px solid ${token("--border-accent")}`,
  borderRadius: token("--radius-panel"),
  maxWidth: "72ch",
};

const codeTokenStyle: CSSProperties = {
  font: token("--t-popover-meta"),
  color: token("--accent-bright"),
};

/**
 * The rule every reader needs before the gallery: choose tokens by their
 * public role rather than by their current resolved value.
 */
function TokenGuidance(): ReactElement {
  return (
    <p style={noteStyle}>
      <strong style={{ color: token("--text-primary") }}>Choose tokens by role.</strong>{" "}
      Use <code style={codeTokenStyle}>--surface-card</code> because the element is a card surface,{" "}
      <code style={codeTokenStyle}>--radius-control</code> because it is a control, and{" "}
      <code style={codeTokenStyle}>--font-ui</code> because it speaks in the UI voice. The spacing, type, motion,
      and elevation families are sanctioned scales used directly by product code. If the vocabulary lacks the
      role you need, add a named token here rather than writing an incidental value at the call site.
    </p>
  );
}

/** Renders the bucketized public-token specimens. Each category carries the
 * DOM id the overview's table of contents scroll-tracks. */
function TokenGallery({ buckets }: { buckets: Buckets }): ReactElement {
  const idFor = (bucket: Bucket): string => tokenCategoryId(bucket);
  return (
    <>
      {buckets.color.length > 0 && (
        <TokenGroup
          id={idFor("color")}
          title={BUCKET_TITLES.color}
          description="Grouped by family. Each swatch shows the token's resolved color."
        >
          <FamilyGrid entries={buckets.color} renderSpecimen={ColorSpecimen} />
        </TokenGroup>
      )}

      {buckets.typography.length > 0 && (
        <TokenGroup
          id={idFor("typography")}
          title={BUCKET_TITLES.typography}
          description="The type scale (--t-*), font roles, families, weights, and letter-tracking that make it up."
        >
          <FamilyGrid entries={buckets.typography} renderSpecimen={TypographySpecimen} />
        </TokenGroup>
      )}

      {buckets.radius.length > 0 && (
        <TokenGroup id={idFor("radius")} title={BUCKET_TITLES.radius} description="Corner radii, from the tightest inset to a fully round pill.">
          <FamilyGrid entries={buckets.radius} renderSpecimen={RadiusSpecimen} />
        </TokenGroup>
      )}

      {buckets.spacing.length > 0 && (
        <TokenGroup id={idFor("spacing")} title={BUCKET_TITLES.spacing} description="The 8pt-based spacing scale, shown as proportional bars.">
          <FamilyGrid entries={buckets.spacing} renderSpecimen={SpacingSpecimen} />
        </TokenGroup>
      )}

      {buckets.motion.length > 0 && (
        <TokenGroup
          id={idFor("motion")}
          title={BUCKET_TITLES.motion}
          description="Durations, easings, and the two canonical object-travel / container-transform combos, dogfooded as a drifting dot. Respects prefers-reduced-motion — the dot holds still if your system requests it."
        >
          {renderMotionEntries(buckets.motion)}
        </TokenGroup>
      )}

      {buckets.shadow.length > 0 && (
        <TokenGroup
          id={idFor("shadow")}
          title={BUCKET_TITLES.shadow}
          description="Elevation shadows and the signature violet glow, applied to a plain surface tile."
        >
          <FamilyGrid entries={buckets.shadow} renderSpecimen={ShadowSpecimen} />
        </TokenGroup>
      )}

      {buckets.other.length > 0 && (
        <TokenGroup
          id={idFor("other")}
          title={BUCKET_TITLES.other}
          description="Everything else the token sheet declares — layout constants, gradients, and atlas-specific washes — with no specimen shape of its own."
        >
          <div>
            {buckets.other.map(([name, entry]) => (
              <div key={name}>{OtherSpecimen(name, entry)}</div>
            ))}
          </div>
        </TokenGroup>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DesignTokensSection
// ---------------------------------------------------------------------------

/**
 * The Design Tokens section of the /cumulus overview. Presents the public token
 * vocabulary as a specimen gallery grouped by `@kind` and name-prefix family,
 * plus a curated iconography sample. Generated
 * from `../primitives/tokens` (itself generated from the CSS by the one shared
 * parser), so it can never drift from the token sheet by hand.
 */
export function DesignTokensSection(): ReactElement {
  useMotionKeyframes();
  return (
    <section id="cumulus-toc-tokens" aria-labelledby="cumulus-design-tokens-heading" style={{ marginBottom: token("--space-10") }}>
      <p style={eyebrowStyle}>Tokens</p>
      <h2 id="cumulus-design-tokens-heading" style={sectionTitleStyle}>
        Design Tokens
      </h2>
      <p style={leadStyle}>
        Every specimen below is rendered straight from the {TOKEN_ENTRIES.length} custom
        properties declared in cumulus-tokens.css, via the generated{" "}
        <code>../primitives/tokens</code> mirror — add or edit a token, rerun{" "}
        <code>npm run cumulus-tokens</code>, and this gallery updates with it.
      </p>

      <TokenGuidance />

      <TokenGallery buckets={TOKEN_BUCKETS} />

      <TokenGroup
        id={ICONOGRAPHY_ANCHOR_ID}
        title="Iconography"
        description="A sample of the Boxicon (regular + filled) and vendored Phosphor-Fill glyphs the product actually uses — not generated from tokens, since glyphs aren't design tokens."
      >
        <div style={gridStyle}>
          {ICON_SAMPLES.map((icon) => (
            <div key={icon.className}>{IconSpecimen(icon)}</div>
          ))}
        </div>
      </TokenGroup>
    </section>
  );
}
