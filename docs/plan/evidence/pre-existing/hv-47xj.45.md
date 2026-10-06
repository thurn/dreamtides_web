# hv-47xj.45 pre-existing issues

- `generateSiteComposition` in `src/atlas/atlas-generator.ts` adds the known
  Dreamsign's Reward site after the fill, even when the layer's mandatory sites
  already fill the dreamscape. With `hasKnownDreamsign: true` on the synthetic
  Atlas data's 0-indexed layer 1 (two Drafts, Purge, Augury, signature site,
  Battle), the result has 7 sites. `docs/design.md` says a non-starter
  dreamscape has 3–6 sites and that the Reward takes a fill slot. Atlas
  generation only places known Dreamsigns in `knownDreamsign.eligibleLayers`,
  so a generated atlas does not hit this today. The rewritten composition sweep
  checks known-Dreamsign compositions only in eligible layers.
