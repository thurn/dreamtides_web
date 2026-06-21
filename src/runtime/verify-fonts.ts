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

// Some browsers report the @font-face family name with surrounding quotes
// (e.g. '"EB Garamond"'); normalise so it compares equal to our bare name.
function normalizeFamily(family: string): string {
  return family.replace(/^["']|["']$/g, "");
}

/**
 * Whether an `@font-face` for this family is registered with the document at
 * all. Google Fonts delivers each family via `@font-face` rules in the
 * stylesheet linked from index.html. When that stylesheet is blocked,
 * throttled, or offline, no FontFace is registered — which is precisely the
 * "CDN unreachable" case the warning exists to surface.
 */
function isFontFamilyDeclared(family: string): boolean {
  for (const face of document.fonts) {
    if (normalizeFamily(face.family) === family) {
      return true;
    }
  }
  return false;
}

/**
 * Detects whether a required webfont actually loaded.
 *
 * Reads the browser's own FontFaceSet state rather than rendering a probe to a
 * canvas. An earlier canvas width-comparison approach produced false positives
 * in Safari: a `<canvas>` that is not attached to the DOM does not reliably
 * render `@font-face` webfonts there, so the probe measured the fallback width
 * and reported correctly-loaded fonts as missing.
 *
 * The two cases the warning must distinguish:
 *   - The family has no registered face (stylesheet failed to load) → missing.
 *   - The family is registered → trust `document.fonts.check()`, which reports
 *     the real load state. `check()` alone is insufficient because it returns
 *     true for families that were never declared; gating it on the
 *     declared-check above closes that gap.
 */
export function isFontAvailable(family: string): boolean {
  if (typeof document === "undefined" || !("fonts" in document)) {
    // Outside a browser there is nothing to probe; assume present.
    return true;
  }

  if (!isFontFamilyDeclared(family)) {
    return false;
  }

  try {
    return document.fonts.check(`1em "${family}"`);
  } catch {
    // If the check API throws, prefer a silent assume-present over a spurious
    // warning.
    return true;
  }
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

  // Re-check a few times before warning. Safari can resolve `fonts.ready`
  // while a face is still flipping to its loaded state, which would otherwise
  // surface a one-frame false positive on startup.
  let missing = detectMissingFonts(isFontAvailable);
  for (let attempt = 0; attempt < 3 && missing.length > 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    missing = detectMissingFonts(isFontAvailable);
  }
  if (missing.length === 0) {
    return;
  }

  console.warn(`[fonts] ${buildWarningMessage(missing)}`);
  showFontWarning(missing);
}
