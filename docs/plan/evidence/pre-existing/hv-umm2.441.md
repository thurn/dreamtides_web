# hv-umm2.441 pre-existing observations

- The tracked inventory is stale on base 739d2d49fa1c925be80066313d50e264a18dd571. The unchanged generator detects playRestriction as present while the tracked inventory marks it missing. The fresh old-generator projection has 222 beads; the tracked projection has 223. `before-cli-check.log` preserves exit 1; the unchanged regeneration output is retained and tracked bytes were restored identically before implementation. This observation is distinct from the lifecycle diagnostic, whose output is byte-identical to the fresh old generator.
- npm install reports 17 dependency advisories: 9 moderate, 7 high and 1 critical. Package manifest and lockfile are unchanged.

The inherited tracked snapshot also differs from the fresh generator in 10 existing UUID records: current status, rulesDecisions, requiredPrimitives or routing metadata. `inherited-staleness-details.json` enumerates every UUID and field. Prompt existence/usage and the full UUID set remain identical. The lifecycle change itself produces byte-identical fresh output.
