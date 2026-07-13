import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds a reverse index from a raw COLOR value to the semantic Cumulus token that
 * carries it, so `no-hardcoded-values` can tell an author "use var(--accent)"
 * instead of `#a855f7`.
 *
 * The source of truth is `src/cumulus/primitives/cumulus-tokens.css`. Each `--name:
 * value;` declaration is parsed; a value that is a single `var(--other)`
 * reference is followed through the primitive layer until it resolves to a
 * literal color (`#rrggbb`, `rgb()/rgba()`, `hsl()/hsla()`). Composite values —
 * gradients, shadow lists, `font: … / …` shorthands — never resolve to a bare
 * color and are skipped, so only true color tokens land in the index.
 *
 * When several tokens share one color (e.g. `--accent`, `--essence`, and the
 * `--primitive-violet-400` they both alias all resolve to `#a855f7`), the SUGGESTED
 * token is the most semantic one: a clean role name (`--accent`) is preferred
 * over a compatibility-bridge alias (`--dt-*`, `--color-*`) and over the raw
 * `--primitive-*` it resolves through. That keeps product UI pointed at the
 * re-skinnable semantic layer.
 *
 * The parse happens once at module load. If the stylesheet can't be read the
 * index is simply empty and the rule degrades to reporting the literal with no
 * suggestion — it never throws.
 */

/** Normalize a color literal for value-equality: lowercase, whitespace-free,
 * with 3/4-digit hex expanded to 6/8 so `#fff` == `#ffffff`. */
export function normalizeColor(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  let value = raw.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      value =
        "#" +
        digits
          .split("")
          .map((c) => c + c)
          .join("");
    }
    return value;
  }
  if (/^(rgba?|hsla?)\(/.test(value)) {
    // Collapse all internal whitespace so `rgba(168, 85, 247, 0.16)` matches a
    // declaration written `rgba(168,85,247,0.16)`.
    return value.replace(/\s+/g, "");
  }
  return null;
}

/** True when a resolved value is a single bare color literal (not a gradient,
 * shadow, or other composite that merely CONTAINS a color). */
function isBareColor(value) {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) {
    return true;
  }
  // A single rgb/hsl function and nothing after its closing paren.
  return /^(rgba?|hsla?)\([^()]*\)$/.test(v);
}

/** Rank a token name by how "semantic" it is — lower is a better suggestion. */
function semanticRank(name) {
  if (name.startsWith("--primitive-")) {
    return 3; // raw material
  }
  if (name.startsWith("--dt-") || name.startsWith("--color-") || name.startsWith("--cv-")) {
    return 2; // production-bridge / legacy aliases
  }
  return 0; // clean semantic role name
}

/** Parse `--name: value;` declarations out of the token stylesheet. */
function parseDeclarations(css) {
  const declarations = new Map();
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    // Last declaration wins, mirroring the CSS cascade.
    declarations.set(match[1], match[2].trim());
  }
  return declarations;
}

/** Follow a chain of single `var(--x)` references to the underlying literal. */
function resolve_(name, declarations, depth) {
  if (depth > 16) {
    return null;
  }
  const value = declarations.get(name);
  if (value === undefined) {
    return null;
  }
  const varRef = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/.exec(value);
  if (varRef) {
    return resolve_(varRef[1], declarations, depth + 1);
  }
  return value;
}

function buildIndex() {
  const index = new Map();
  let css;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    css = readFileSync(
      resolve(here, "../src/cumulus/primitives/cumulus-tokens.css"),
      "utf8",
    );
  } catch {
    return index;
  }
  const declarations = parseDeclarations(css);
  for (const name of declarations.keys()) {
    const resolved = resolve_(name, declarations, 0);
    if (resolved === null || !isBareColor(resolved)) {
      continue;
    }
    const key = normalizeColor(resolved);
    if (key === null) {
      continue;
    }
    const existing = index.get(key);
    if (existing === undefined || semanticRank(name) < semanticRank(existing)) {
      index.set(key, name);
    }
  }
  return index;
}

const COLOR_TOKEN_INDEX = buildIndex();

function buildNameSet() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(
      resolve(here, "../src/cumulus/primitives/cumulus-tokens.css"),
      "utf8",
    );
    return new Set(parseDeclarations(css).keys());
  } catch {
    return new Set();
  }
}

const TOKEN_NAME_SET = buildNameSet();

/**
 * Every custom-property name declared in cumulus-tokens.css (semantic, bridge,
 * and primitive alike). `valid-token-references` checks literal `var(--x)`
 * strings against this set; an empty set (stylesheet unreadable) makes that
 * rule degrade to a no-op rather than flag everything.
 */
export function knownTokenNames() {
  return TOKEN_NAME_SET;
}

/**
 * The semantic token whose value equals `literal`, or null if none matches.
 * Primitive/bridge tokens are only ever returned when no cleaner role token
 * shares the color (they lose the {@link semanticRank} tie-break otherwise).
 */
export function colorTokenFor(literal) {
  const key = normalizeColor(literal);
  if (key === null) {
    return null;
  }
  return COLOR_TOKEN_INDEX.get(key) ?? null;
}

function buildSpaceIndex() {
  const index = new Map();
  let css;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    css = readFileSync(
      resolve(here, "../src/cumulus/primitives/cumulus-tokens.css"),
      "utf8",
    );
  } catch {
    return index;
  }
  for (const [name, value] of parseDeclarations(css)) {
    if (!name.startsWith("--space-")) {
      continue;
    }
    const px = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
    if (px) {
      index.set(Number(px[1]), name);
    } else if (value.trim() === "0") {
      index.set(0, name);
    }
  }
  return index;
}

const SPACE_TOKEN_INDEX = buildSpaceIndex();

/**
 * The `--space-*` token whose value is exactly `px` pixels, or null when the
 * length is off the spacing scale. `no-untokenized-lengths` uses this both to
 * suggest/autofix the matching step and to tell an author their value needs
 * snapping to the scale.
 */
export function spaceTokenFor(px) {
  if (typeof px !== "number" || Number.isNaN(px)) {
    return null;
  }
  return SPACE_TOKEN_INDEX.get(px) ?? null;
}
