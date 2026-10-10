# hv-bbmp pre-existing evidence

- `src/engine/testing/fuzz.ts` selects avatars and dreamsigns from synthetic
  lists while its pool also carries production emblems. Non-card targeting
  needs entity-aware setup and coverage; follow-up `hv-1mj7` covers that
  capability before the Phase 5 mason pass.
- `npm install` reports 17 dependency vulnerabilities: 9 moderate, 7 high,
  and 1 critical. Manifests and lockfile match the assigned base; advisory
  applicability is outside this validation repair.
