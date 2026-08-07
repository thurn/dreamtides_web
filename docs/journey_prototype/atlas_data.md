# Dream Atlas Data

`data/tabula/atlas.toml` is the authoritative Atlas document. The asset build
validates and normalizes it into `public/atlas-data.json`; the browser loads that
document as `AtlasData` through `loadAtlasData()`.

The Atlas remains a seven-layer game mode. TypeScript owns graph algorithms,
random-number generation, journey routing, site implementations, renderer
geometry, interaction, motion, and accessibility. TOML owns the authored rules
and content those systems consume.

## Schema

The root `schema-version` is `1`. Compilation rejects any unsupported version.
The document contains these sections:

| Section                | Authored contract                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `layers`               | Ordered Layer I–VII records with role, node-count range, site-count range, fill profile, and mandatory site counts. |
| `graph`                | Connection average, reveal lookahead, and the triangular bonus-reveal distribution and eligible layers.             |
| `dreamscape-selection` | Base draw weight, repeat discouragement, adjacency and same-layer exclusions, and the pool-exhaustion policy.       |
| `site-composition`     | Site uniqueness, the known-dreamsign carrier site, and mandatory-capacity behavior.                                 |
| `fill-profiles`        | Signature-site and explicit site weights selected by layer.                                                         |
| `known-dreamsign`      | Per-Atlas maximum, eligible layers, placement probability, and early-reveal bias.                                   |
| `boss`                 | Limbo identity and copy plus stable scene, icon, and Apollyon figure keys.                                          |
| `presentation`         | Unseen/starter copy and validated affiliation templates.                                                            |
| `assets`               | Source filenames and emitted Atlas asset keys.                                                                      |

Affiliations provide `atlas-card-theme` in `affiliations.toml`. Atlas templates
may use `{name}` in the affiliation title and `{card-theme}` in the affiliation
body. The compiler rejects any other placeholder or a missing required
placeholder.

## Layer VII

Layer VII has the `boss` role and represents Limbo. Its node stores the stable
Limbo dreamscape ID and player-facing place name from `atlas.toml`. It does not
resolve a normal `DreamscapeContent`, guide affiliation, signature site, or site
enhancement. Its configured fill profile composes utility sites, and the
structural Battle site is appended last.

## Validation and hashes

`scripts/atlas-data.mjs` is shared by full asset setup and Vite’s targeted TOML
reload. It validates layer and site coverage, ranges, probabilities, weights,
capacity, profiles, templates, affiliation references, and Atlas asset sources
when the external source-art catalog is available.

Vite recompiles Atlas data when its TOML or any referenced Dreamscape or
affiliation catalog changes, so the same reference checks run during targeted
development reloads. Site presentation and mechanics are compiled from
`sites.toml`; guide assignments used by generation enter Atlas through the
validated Sites catalog. See [Dream Guide and Site Data](guide_and_sites_data.md).

The compiled document contains two SHA-256 diagnostics:

- `contentHash` covers the complete normalized Atlas document.
- `foldHash` covers Atlas graph-generation and reducer inputs. Presentation
  copy and artwork are outside this hash.

Atlas generation logs both hashes, the resolved rules, graph edges, candidate
weights, selections, site compositions, known-dreamsign placement, and the boss
decision needed to reconstruct a production run.
