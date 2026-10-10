# Pre-existing issues found by hv-n5lj.8

- **Unused files** that knip reports at base `8b1d9e824`, beyond the ones
  `hv-umm2.47.md` lists: `scripts/qa/card-sweep.mjs`,
  `scripts/qa/check-production-bundle.mjs`, and
  `scripts/qa/scenarios/card-lab-play.mjs`. They are run by path, so knip
  needs them as `entry` points in `knip.jsonc`.
- **Mobile tutorial live hand-off layout** (`/tutorial`, beat 19 of the
  `hv-33id.1` walk): at base `8b1d9e824` the mobile board shows a narrower
  lane window than the `hv-33id.1` baseline capture
  `19-live-handoff-mobile.png`, with both characters one lane to the right.
  The same walk against a base snapshot (`base-19-live-handoff-mobile.png`
  in `artifacts/qa/hv-n5lj.8/`) matches this bead's capture pixel for pixel,
  so a Phase 4 battle-screen bead between `2f7ef3f2e` and `8b1d9e824`
  changed it.
