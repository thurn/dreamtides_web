# hv-umm2.370 pre-existing observations

The source-card selector-X defect is the in-scope review finding tracked by this bead. No additional engine correctness issue was identified during this bounded work.

The fresh `npm install` reported 17 dependency audit vulnerabilities (9 moderate, 7 high, 1 critical). The dependency manifest and lockfile match the base; the findings were not independently audited, and remediation is outside this bead's areas.

The review harness reports missing-art warnings from its isolated local-assets fixture, then restores the worktree's ordinary links. Focused tests, review and knip pass. This records observed fixture output rather than an engine defect.
