// Which game a URL without `?game=` asks for. The front door (`/` and `/main`)
// resumes this browser's most recently played game. Every other entry, and any
// URL that shapes a new game (a seed, a QA scene, a saved journey to load, a
// forced Gamble game), asks for a new game, so those parameters never act on a
// resumed one.

/** Query parameters that change only presentation, never which game plays. */
const PRESENTATION_PARAMS: ReadonlySet<string> = new Set([
  "tutorialSpeed",
  "ai",
]);

/** Front-door paths, without trailing slashes. */
const FRONT_DOOR_PATHS: ReadonlySet<string> = new Set(["", "/main"]);

/**
 * Whether a URL without `?game=` resumes the most recent game rather than
 * creating one. `pathname` has no trailing slash.
 */
export function resumesRecentGame(pathname: string, search: string): boolean {
  if (!FRONT_DOOR_PATHS.has(pathname)) return false;
  const params = new URLSearchParams(search);
  if (params.has("game")) return false;
  for (const key of params.keys()) {
    if (!PRESENTATION_PARAMS.has(key)) return false;
  }
  return true;
}
