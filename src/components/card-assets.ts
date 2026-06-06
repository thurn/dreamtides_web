/**
 * Public URL for the energy cost orb art. The PNG is symlinked into
 * `public/card-frame/` by `scripts/setup-assets.mjs` (and kept out of version
 * control); Vite serves it from the site root. Centralized here so every
 * surface references the same teal energy orb. The spark stat draws the inline
 * `SparkleIcon` SVG instead of a raster orb.
 */
export const ENERGY_ORB_URL = "/card-frame/energy_cost_background.png";
