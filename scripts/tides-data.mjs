/** Compose the generated tide and Avatar TOML projections for tides4. */
export function compileTidesData(tidesSource, avatarsSource) {
  if (tidesSource?.["schema-version"] !== 1) {
    throw new Error("Expected tides schema-version = 1");
  }
  if (!Array.isArray(tidesSource.tide) || tidesSource.tide.length === 0) {
    throw new Error("Expected a non-empty [[tide]] array in tides.toml");
  }
  if (!Array.isArray(avatarsSource?.avatar) || avatarsSource.avatar.length === 0) {
    throw new Error("Expected a non-empty [[avatar]] array in avatars.toml");
  }
  const selection = tidesSource.selection;
  if (
    typeof selection?.["band-fraction"] !== "number" ||
    typeof selection?.["band-minimum"] !== "number"
  ) throw new Error("Expected unified selection tuning in tides.toml");

  const tides = tidesSource.tide.map((tide) => ({
    id: tide.id,
    displayName: tide["display-name"],
    auguryPackageReference: tide["augury-package-reference"],
    displayDescription: tide["display-description"],
    resonance: tide.resonance,
    role: tide.role,
    cards: (tide.card ?? []).map((card) => ({
      id: card.id,
      copies: card.copies,
    })),
  }));
  const tidePoolByAvatar = Object.fromEntries(
    avatarsSource.avatar.map((avatar) => [
      avatar.id,
      {
        starter: avatar["tide-pool"]?.starter ?? null,
        facets: avatar["tide-pool"]?.facets,
        neutral: avatar["tide-pool"]?.neutral,
      },
    ]),
  );
  return {
    version: 2,
    selection: {
      bandFraction: selection["band-fraction"],
      bandMinimum: selection["band-minimum"],
    },
    tides,
    tidePoolByAvatar,
  };
}
