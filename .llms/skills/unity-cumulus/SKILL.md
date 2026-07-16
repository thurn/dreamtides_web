---
name: unity-cumulus
description: Use when working with the Unity 3D implementation of Cumulus, including its runtime, rendering, materials, shaders, scenes, tests, and verification tooling.
---

The Unity 6.5 Cumulus implementation is the standalone project in `cumulus/`, with production code and assets under `cumulus/Assets/CumulusMvp/`, the design reference at `docs/cumulus/unity-3d-ui.md`, and verification helpers under `cumulus/scripts/`.

For rendering or material changes, automated verification is necessary but not
sufficient visual evidence. Capture the same scene with the target effect on
and off, measure a nonzero contribution in the affected region, verify the
change moves in the expected direction, and confirm a deliberately broken
negative control fails the relevant metric. Finish with a holistic cold review
of the final frame so a localized metric cannot conceal a composition defect.
