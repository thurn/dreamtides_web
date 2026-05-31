/**
 * Public URLs for the cost / spark orb art. The PNGs are symlinked into
 * `public/card-frame/` by `scripts/setup-assets.mjs` (and kept out of version
 * control); Vite serves them from the site root. Centralized here so every
 * surface references the same teal energy orb and gold spark orb.
 */
export const ENERGY_ORB_URL = "/card-frame/energy_cost_background.png";
export const SPARK_ORB_URL = "/card-frame/spark_background.png";
