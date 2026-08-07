# Economy Data

`data/tabula/economy.toml` is the authoritative source for direct economy
tuning. The asset build validates and normalizes it into
`public/economy-data.json`; the browser loads that document as `EconomyData`
before a room begins folding events.

TypeScript owns pricing formulas, eligibility, reward modifiers, seeded random
streams, weighted sampling, and Gamble algorithms. TOML owns the coefficients,
ranges, distributions, caps, stock composition, and payout tables those
algorithms consume. DreamAvatar-specific starting essence remains in
`dream_avatars.toml`, and Exploration encounter-specific essence-per-spark
remains in `exploration.toml`.

## Schema

The root `schema-version` is `1`. Compilation requires every v1 section and
rejects unknown keys.

| Section           | Authored contract                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `journey`         | Default starting essence and the Dreamsign cap.                                                                    |
| `shop.prices`     | Standard-card, specialty-card, and Dreamsign prices.                                                               |
| `shop.stock`      | Card and Dreamsign slot counts for each shop identity.                                                             |
| `shop.discounts`  | Positive weighted distributions for discounted-slot counts and discount percentages.                               |
| `shop.reroll`     | Standard and enhanced prices plus the visit limit.                                                                 |
| `site-rewards`    | Standard/enhanced Essence ranges, Reward fallback range, and Dreamsign Revelation offer counts.                    |
| `purge`           | Ordered marginal costs and the enhanced-site discount percentage. The table length is the paid-purge cap.          |
| `transfiguration` | Global bounds and step, the zero-cost band, exact form bands, and the code-owned delta identities 1, 2, 3, and 4+. |
| `battle-reward`   | Base Essence, Essence per completion level, and the final floor.                                                   |
| `gamble`          | Wagers and rewards for the Three-Gate, Ladder Climb, Starway Stairs, and Four-Suit code-owned identities.          |
| `exploration`     | Default Essence awarded per spark.                                                                                 |

Counts and costs are non-negative integers. Percentages are within `0–100`.
Ranges require `min <= max`. Weighted distributions must be nonempty, have
unique values, and use positive finite weights. The transfiguration compiler
requires complete form and delta bands aligned to its configured step and
bounds; its free band is exactly zero. Gamble attempts and tiers must match the
identities the corresponding algorithms implement.

## Generated artifact and hot reload

Run `scripts/regenerate-assets.sh` to regenerate all derived artifacts. The
economy-specific compiler is `scripts/economy-data.mjs`, and the generated JSON
is gitignored because it is reproduced from TOML.

During Vite development, saving `economy.toml` recompiles
`public/economy-data.json` and reloads the journey app. Full asset setup and the
targeted Vite path call the same compiler and emit the same formatted JSON.

## Room compatibility and hashes

The compiled document contains two SHA-256 diagnostics:

- `contentHash` covers the complete normalized v1 economy document.
- `foldHash` covers every v1 field because every economy value can affect
  deterministic state or authored offers.

Room genesis pins `foldHash`, default starting essence, and the Dreamsign cap.
Genesis and `RESET_JOURNEY` use those pinned values, and the fold context carries
the immutable content configuration through replay. A client joins a room only
when its economy hash matches; an economy edit therefore starts a distinct
compatible game configuration.

DreamAvatar records with `starting-essence` override the journey default,
including an authored value of zero. Records that omit the field receive the
economy default after both catalogs have loaded.

## Algorithm boundary

Tune a number in TOML when it is a direct cost, payout, range, distribution,
stock count, cap, or coefficient. Keep behavioral identities and decisions in
TypeScript: which transfiguration form applies, how a purge total is summed,
which Gamble gate, tier, or suit result was reached, how modifiers affect a battle reward,
how seeded random draws are consumed, and whether an offer is eligible.
