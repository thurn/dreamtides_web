# Pre-existing issues observed by hv-w0ei

- Fresh-worktree dependency installation reports 17 audit vulnerabilities
  (9 moderate, 7 high, 1 critical). The bounded follow-up preserves the existing
  dependency manifest and lockfile; the actual install output is retained in
  `w0ei-evidence/install.stdout`.
- The first focused check reports missing linked local art during workspace
  preparation; restoration links the available local assets. This follow-up
  changes no art or workspace materializations. The actual warnings are
  retained in `w0ei-evidence/focused-initial.stderr`.
