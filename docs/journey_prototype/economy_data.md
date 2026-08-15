# Economy Data

Economy tuning is authored beside the behavior it configures:

| Canonical source | Ownership |
| --- | --- |
| `data/journey.ron` | Default starting Essence and the Dreamsign cap. |
| `data/shop_site.ron` | Shop prices, stock, discounts, and rerolls. |
| `data/sites.ron` | Shared site rewards and Purge pricing. |
| `data/battle.ron` | Battle reward Essence. |
| `data/exploration_site.ron` | The `essence_per_spark` value on every `PurgeForEssence` effect. |

The game-data compiler validates each typed RON source and emits its generated
compatibility TOML. The asset build assembles the journey, shop, site, and
battle economy fields into `public/economy-data.json`; the browser loads that
aggregate as `EconomyData` before a room begins folding events.

TypeScript owns pricing formulas, eligibility, reward modifiers, seeded random
streams, weighted sampling, and Gamble algorithms. RON owns the coefficients,
ranges, distributions, caps, stock composition, and payout tables those
algorithms consume. Avatar-specific starting Essence is authored in
`data/avatars.ron`, and Exploration encounter-specific essence-per-spark is
authored in `data/exploration_site.ron`.

## Validation

Counts and costs are non-negative integers. Percentages are within `0–100`.
Ranges require `min <= max`. Weighted distributions must be nonempty, have
unique values, and use positive finite weights.

The source models reject unknown fields. `shop_site.ron` validates both weighted
discount distributions. `sites.ron` validates reward ranges, Purge marginal
costs, and its enhanced discount. `battle.ron` validates its battle rules and
reward fields. Every `PurgeForEssence` Exploration effect supplies a positive
`essence_per_spark` value in its own definition.

## Workspace materialization and hot reload

Normal development, review, test, build, and deploy commands materialize all
derived artifacts automatically. The Rust adapters own RON-to-TOML lowering,
and `scripts/economy-data.mjs` validates and assembles the browser aggregate.
Generated TOML and JSON files are disposable workspace state reproduced from
RON.

During Vite development, saving `journey.ron`, `shop_site.ron`, `sites.ron`, or
`battle.ron` recompiles the affected compatibility TOML and
`public/economy-data.json`, then reloads the journey app. A `sites.ron` edit also
refreshes `public/sites-data.json`.

## Room compatibility and hashes

The compiled aggregate contains two SHA-256 diagnostics:

- `contentHash` covers the complete normalized economy document.
- `foldHash` covers every economy value that can affect deterministic state or authored offers.

Room genesis pins `foldHash`, default starting Essence, and the Dreamsign cap.
Genesis and `RESET_JOURNEY` use those pinned values, and the fold context carries
the immutable content configuration through replay. A client joins a room only
when its economy hash matches.

Avatar records with `starting-essence` override the journey default,
including an authored value of zero. Records that omit the field receive the
journey default after both catalogs have loaded.
