# Pre-existing issues found by hv-7x4l.16

- `src/engine/steps/kinds/resolve-top.ts`: a created event that resolves moves
  to its owner's void through `moveInstance` instead of ceasing to exist
  (rules § Created Cards; engine-design § Zones and zone changes lists
  "created cards cease to exist" as the first `moveInstance` replacement).
  Only `preventCard` applies the replacement today. Copies (Phase 3.8) depend
  on it.
