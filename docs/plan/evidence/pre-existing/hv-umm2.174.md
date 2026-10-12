# Pre-existing issues observed in hv-umm2.174

## Kindlehorn DSL example disagrees with canonical amplified text

- Location: `docs/plan/engine-design.md`, Ability DSL and content modules, More examples.
- Entity: `9b9c2743-75b3-499d-b5fb-c3429c92d420`.
- Observation: the illustrative ability array fixes Dawn energy at 1 and selects an amplified activation cost of 2. The canonical card module's amplified text gives 2 energy at Dawn and keeps the activation at 4 energy plus exhaust.
- Current content behavior: Dawn gains 1 energy for base or 2 for amplified, and activation costs 4 energy plus exhaust in both forms, as the printed data requires (D5, D11).
- Scope: the content bead records this documentation issue; its source areas do not include the shared engine-design document.
