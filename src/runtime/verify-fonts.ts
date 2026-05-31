// Card typography depends on three webfonts loaded from Google Fonts in
// index.html: EB Garamond (card titles), Fira Sans Condensed (card rules
// text), and Anton (spark/energy stat orbs). When the Google Fonts CDN is
// blocked, throttled, or offline, those families silently fall back to
// system fonts and the cards render with the wrong type. This module detects
// that case at runtime and surfaces a visible warning so the cause is
// obvious instead of mysterious.

export interface RequiredFont {
  /** The CSS font-family name as declared in index.html and the card CSS. */
  family: string;
  /** Human-readable description of what the font is used for. */
  usage: string;
}

export const REQUIRED_FONTS: RequiredFont[] = [
  { family: "EB Garamond", usage: "card titles" },
  { family: "Fira Sans Condensed", usage: "card rules text" },
  { family: "Anton", usage: "spark / energy cost" },
];

/**
 * Pure selection of which required fonts are missing, given a predicate that
 * reports whether a single family is available. Kept free of DOM access so it
 * can be unit-tested without a browser.
 */
export function detectMissingFonts(
  isAvailable: (family: string) => boolean,
  fonts: RequiredFont[] = REQUIRED_FONTS,
): RequiredFont[] {
  return fonts.filter((font) => !isAvailable(font.family));
}

// Glyphs and base fonts used for the width-comparison probe. The string mixes
// wide and narrow characters so a fallback substitution produces a measurably
// different width.
const PROBE_TEXT = "WMili 0123456789 mmmmmmmmmmlli";
const PROBE_SIZE = "72px";
const BASE_FONTS = ["monospace", "serif", "sans-serif"];

/**
 * Detects whether a webfont actually loaded by measuring rendered text width.
 *
 * `document.fonts.check()` is unreliable here: it returns true for families
 * that were never declared (nothing to load means "ready"), so it cannot
 * distinguish a present font from a silent fallback. Instead we measure the
 * probe string rendered with each generic base font, then again with the
 * target family stacked in front of that base. If the target loaded, it
 * overrides the base and the width differs; if it is missing, the text falls
 * back to the base and the widths match. Comparing against several bases
 * avoids false negatives when the target happens to share metrics with one.
 */
export function isFontAvailable(family: string): boolean {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // No canvas context means we cannot probe; assume present rather than
    // raising a spurious warning.
    return true;
  }

  return BASE_FONTS.some((base) => {
    ctx.font = `${PROBE_SIZE} ${base}`;
    const baseWidth = ctx.measureText(PROBE_TEXT).width;
    ctx.font = `${PROBE_SIZE} "${family}", ${base}`;
    const targetWidth = ctx.measureText(PROBE_TEXT).width;
    return targetWidth !== baseWidth;
  });
}

const WARNING_ELEMENT_ID = "font-load-warning";

function buildWarningMessage(missing: RequiredFont[]): string {
  const list = missing
    .map((font) => `${font.family} (${font.usage})`)
    .join(", ");
  return `Missing webfont${missing.length > 1 ? "s" : ""}: ${list}. Cards are falling back to system fonts — check that Google Fonts (fonts.googleapis.com / fonts.gstatic.com) is reachable.`;
}

function showFontWarning(missing: RequiredFont[]): void {
  if (document.getElementById(WARNING_ELEMENT_ID)) {
    return;
  }

  const message = buildWarningMessage(missing);

  const banner = document.createElement("div");
  banner.id = WARNING_ELEMENT_ID;
  banner.setAttribute("role", "alert");
  banner.style.cssText = [
    "position:fixed",
    "left:50%",
    "top:12px",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "max-width:min(680px, calc(100vw - 24px))",
    "box-sizing:border-box",
    "padding:10px 40px 10px 14px",
    "background:#7c2d12",
    "color:#fff7ed",
    "border:1px solid #fb923c",
    "border-radius:8px",
    "font-family:ui-sans-serif, system-ui, sans-serif",
    "font-size:13px",
    "line-height:1.4",
    "box-shadow:0 6px 24px rgba(0,0,0,0.45)",
  ].join(";");
  banner.textContent = message;

  const dismiss = document.createElement("button");
  dismiss.setAttribute("aria-label", "Dismiss font warning");
  dismiss.textContent = "×";
  dismiss.style.cssText = [
    "position:absolute",
    "top:6px",
    "right:8px",
    "background:transparent",
    "border:none",
    "color:#fff7ed",
    "font-size:18px",
    "line-height:1",
    "cursor:pointer",
    "padding:2px 4px",
  ].join(";");
  dismiss.addEventListener("click", () => banner.remove());
  banner.appendChild(dismiss);

  document.body.appendChild(banner);
}

/**
 * Awaits font loading, then warns (console + on-screen banner) about any
 * required webfont that failed to load. Safe to call once at startup; it
 * resolves silently when all fonts are present or when run outside a browser.
 */
export async function verifyFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return;
  }

  // Fonts declared via @font-face (how Google Fonts delivers them) load
  // lazily: the browser only fetches a family once an element using it is laid
  // out. At startup — before the first cards render — no element references
  // these families, so document.fonts.ready resolves immediately and a probe
  // would measure the not-yet-loaded fallback and report a false positive.
  // Explicitly request each required family so the fonts are fetched
  // regardless of what is currently on screen, then wait for them to settle.
  await Promise.all(
    REQUIRED_FONTS.map((font) =>
      document.fonts.load(`1em "${font.family}"`).catch(() => undefined),
    ),
  );

  try {
    await document.fonts.ready;
  } catch {
    // Ignore: if the font loading API rejects we still attempt the probe.
  }

  const missing = detectMissingFonts(isFontAvailable);
  if (missing.length === 0) {
    return;
  }

  console.warn(`[fonts] ${buildWarningMessage(missing)}`);
  showFontWarning(missing);
}
