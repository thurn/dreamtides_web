/**
 * Seeded site scatter for the dreamscape detail screen. The redesigned screen
 * presents a dreamscape as its full-bleed scene art with each site floating in
 * the scene as a circular node. Positions are produced by seeded rejection
 * sampling so a given dreamscape's layout is stable across renders (the seed is
 * derived from the node id) yet carries no obvious grid. Coordinates are
 * returned in percentages of the stage so the layout is fully responsive.
 */

/** A scattered site position, in percentages of the stage (0-100). */
export interface ScatterPoint {
  x: number;
  y: number;
}

/** Deterministic 32-bit PRNG (mulberry32). Same seed yields the same stream. */
export function mulberry32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Folds a string (a node id) into a 32-bit integer seed so each dreamscape node
 * gets a stable, distinct scatter layout. FNV-1a, which spreads similar ids
 * (e.g. `node-3` vs `node-4`) into very different seeds.
 */
export function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Scatters `count` site nodes across the scene with a minimum separation,
 * keeping clear of the top-left title block. Poisson-ish rejection sampling
 * inside a comfortable band of the stage; the band leaves the bottom strip free
 * for the HUD. Falls back to a centred point if sampling cannot place a node
 * within the guard budget so the count of returned points always equals
 * `count`.
 */
export function scatterSites(count: number, seed: number): ScatterPoint[] {
  const rng = mulberry32(seed);
  const points: ScatterPoint[] = [];
  // Band, in % of the stage. The bottom stops at 82% so nodes never collide
  // with the HUD bar pinned to the bottom of the viewport.
  const X0 = 9;
  const X1 = 91;
  const Y0 = 35;
  const Y1 = 82;
  const minDistance = count > 5 ? 15.5 : 18; // min separation in %
  let guard = 0;
  while (points.length < count && guard < 4000) {
    guard++;
    const x = X0 + rng() * (X1 - X0);
    const y = Y0 + rng() * (Y1 - Y0);
    // Keep clear of the top-left title block.
    if (x < 33 && y < 41) continue;
    const ok = points.every((p) => {
      const dx = p.x - x;
      const dy = (p.y - y) * 0.86; // weight y for the wide stage
      return Math.hypot(dx, dy) >= minDistance;
    });
    if (ok) points.push({ x, y });
  }
  // Guard budget exhausted: pad with a stable centre point so callers always
  // receive exactly `count` positions.
  while (points.length < count) {
    points.push({ x: 50, y: 58 });
  }
  return points;
}
