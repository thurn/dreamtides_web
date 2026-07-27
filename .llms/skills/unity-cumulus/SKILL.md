---
name: unity-cumulus
description: Use when working with the Unity 3D implementation of Cumulus, including its runtime, rendering, materials, shaders, scenes, tests, and verification tooling.
---

The Unity 6.5 Cumulus implementation is the standalone project in `cumulus/`, with production code and assets under `cumulus/Assets/CumulusMvp/`, the design reference at `docs/cumulus/unity-3d-ui.md`, and verification helpers under `cumulus/scripts/`.

Licensed Unity assets and proprietary scenes live in a separate local-only Git
repository. Before inspecting or editing `cumulus/Assets/ThirdParty/`, run
`cumulus/scripts/provision-licensed-assets.sh` from the task's public
repository worktree. This creates a paired licensed-assets worktree on the same
branch name using APFS copy-on-write files from the configured clean seed.
Stop if provisioning fails; never copy from the primary checkout, symlink
shared assets, add a remote to the licensed repository, or force-add ThirdParty
content to the public repository.

Treat the two branches as one task. Commit distributable Cumulus code, builders,
tests, and documentation to the public branch. Commit proprietary scene changes
only to the paired local licensed-assets branch. Push only the public branch.
Before handoff, verify both worktrees are clean and report both commit IDs;
promotion must advance both repositories deliberately. Before removing the
public worktree, run `cumulus/scripts/release-licensed-assets.sh` so the nested
licensed worktree is cleanly unregistered first.

For rendering or material changes, automated verification is necessary but not
sufficient visual evidence. Capture the same scene with the target effect on
and off, measure a nonzero contribution in the affected region, verify the
change moves in the expected direction, and confirm a deliberately broken
negative control fails the relevant metric. Finish with a holistic cold review
of the final frame so a localized metric cannot conceal a composition defect.
