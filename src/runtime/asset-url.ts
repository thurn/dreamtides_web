/**
 * Resolves a runtime URL for a binary game-art asset (card / avatar /
 * dreamsign / atlas images) so the same code serves art from two origins:
 *
 *   - Local dev: `VITE_ASSET_BASE_URL` is empty, so `assetUrl("/cards/1.webp")`
 *     returns `/cards/1.webp` unchanged. The Vite dev server serves it from the
 *     `public/` directory, where `scripts/setup-assets.mjs` has symlinked the
 *     art out of the developer's `~/Documents` source folders.
 *   - Production: the build sets `VITE_ASSET_BASE_URL` to the Firebase Storage
 *     bucket origin (see `.env.production`), so the same call returns
 *     `https://storage.googleapis.com/<bucket>/cards/1.webp`. The large binaries
 *     are served from the bucket instead of being bundled into the Hosting
 *     deploy.
 *
 * Only binary art is routed through here; the generated `*-data.json` catalogs
 * stay on Hosting alongside the code that fetches them, since they are small and
 * version-coupled to the build.
 */

/**
 * The asset origin, trailing slash trimmed. `import.meta.env.VITE_ASSET_BASE_URL`
 * is injected by Vite at build time; it is absent (undefined) under dev and the
 * test runner, which both resolve to relative URLs.
 */
const ASSET_BASE_URL = (
  (import.meta.env.VITE_ASSET_BASE_URL as string | undefined) ?? ""
).replace(/\/+$/, "");

/**
 * Prefix a root-relative art path with the configured asset origin. `path`
 * should be a root-relative path beginning with `/` (e.g. `/cards/1.webp`); a
 * path without a leading slash is treated as root-relative and normalized. When
 * no origin is configured the path is returned unchanged.
 */
export function assetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${ASSET_BASE_URL}${normalized}`;
}
