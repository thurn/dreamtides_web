# hv-umm2.304 pre-existing observations

- Fresh installation reports 17 dependency audit findings: 9 moderate,
  7 high and 1 critical. Installation passes; dependency upgrades are outside
  this layout repair.
- On the mobile development route prompt, the engine debug opener partially
  overlaps the prompt's cancel control. The cancel control's exposed center
  remains clickable. This existing developer-control overlap is recorded in
  hv-umm2.313; this bead preserves the player controls and debug composition.

- Mobile fanned hand touch reading for catalog UUID
  `6cf545ba-b014-4333-a0da-573e8f97d734`, physical i19: the mobile
  press-in-place branch in `src/cumulus/internal/reveal/geometry.ts` selects
  the complete source by width, with measured source bottom 857.994 beyond
  the 844px viewport. The printed rules row is cut by the viewport in
  `after-lab-mobile-post-cancel-touch-clip.png` and
  `after-lab-mobile-post-cancel-touch-hidden.png`. Both overflow modes have
  identical gesture delivery, press measurements, source bounds, main
  geometry and empty caps. Filed follow-up: hv-umm2.361, prerequisite hv-umm2.304. This is separate from the viewport overflow
  repair; the reading-geometry module is outside this bead's source areas.
