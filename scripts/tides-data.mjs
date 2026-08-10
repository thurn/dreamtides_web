/** Compose the generated tide and Dream Avatar pool TOML projections for tides4. */
export function compileTidesData(tidesSource, poolsSource) {
  if (tidesSource?.["schema-version"] !== 1) {
    throw new Error("Expected tides schema-version = 1");
  }
  if (!Array.isArray(tidesSource.tide) || tidesSource.tide.length === 0) {
    throw new Error("Expected a non-empty [[tide]] array in tides.toml");
  }
  if (poolsSource?.["schema-version"] !== 1) {
    throw new Error("Expected Dream Avatar tide pools schema-version = 1");
  }
  if (
    !Array.isArray(poolsSource["dream-avatar-pool"]) ||
    poolsSource["dream-avatar-pool"].length === 0
  ) {
    throw new Error(
      "Expected a non-empty [[dream-avatar-pool]] array in dream_avatar_tide_pools.toml",
    );
  }

  const tides = tidesSource.tide.map((tide) => ({
    id: tide.id,
    displayName: tide["display-name"],
    displayDescription: tide["display-description"],
    resonance: tide.resonance,
    role: tide.role,
    cards: (tide.card ?? []).map((card) => ({
      id: card.id,
      copies: card.copies,
    })),
  }));
  const tidePoolByDreamAvatar = Object.fromEntries(
    poolsSource["dream-avatar-pool"].map((pool) => [
      pool["dream-avatar-id"],
      {
        starter: pool.starter ?? null,
        facets: pool.facets,
        neutral: pool.neutral,
      },
    ]),
  );
  return { version: 1, tides, tidePoolByDreamAvatar };
}
