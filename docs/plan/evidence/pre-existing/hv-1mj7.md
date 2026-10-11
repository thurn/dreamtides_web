# hv-1mj7 pre-existing observations

- Fresh-worktree `npm install` reports 17 dependency audit advisories (9 moderate,
  7 high, 1 critical). Dependency upgrades are outside this harness bead.
- The review preparation stage temporarily links its isolated asset sandbox and
  prints missing-art warnings. Its restore stage links the complete local art
  materialization; headless engine tests do not read image assets.
- Failure-log paths are derived from seed prefix, first ordinal and game count.
  Simultaneous failing runs with identical options can write the same artifact;
  this existing synchronous writer does not provide transactional writes across
  processes. Runs should use distinct seed prefixes. A stopped writer can leave
  a partial artifact; the command's seed, targets and ordinal reproduce setup
  independently of a retained file.

# Target availability at this source base

The production Dreamsign catalog has 152 pending definitions and one vanilla
empty-text definition, with zero authored battle ability lists. Explicit targets
require a non-empty authored battle list, so pending battle Dreamsigns and
journey-only Dreamsigns receive an unsupported-target diagnostic. Synthetic
fixtures prove authored Dreamsign selection, resolution and replay. Full-pool
random battles include all catalog Dreamsign definitions.

All production Dreamwell cards have recurring orders 1 through 4. The harness
explicitly rejects non-recurring Dreamwell targets because the shared deck
builder samples recurring tiers. A synthetic invalid-tier fixture pins that
boundary.
