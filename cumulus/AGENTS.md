# Unity project instructions

These instructions apply to all work under `cumulus/`. The repository-root
instructions still apply.

## Licensed third-party assets

`Assets/ThirdParty/` contains licensed assets, including Synty content. It is a
local project dependency, not repository source.

- Never commit, stage, upload, paste, or otherwise publish files from
  `Assets/ThirdParty/`. Never use `git add -f` to bypass its ignore rule.
- Never commit a Unity scene, prefab, material, mesh, texture, model, audio
  file, metadata file, screenshot, or serialized excerpt when it embeds or
  substantially reproduces licensed third-party content.
- Do not include proprietary asset contents in logs, patches, test fixtures,
  prompts, issue descriptions, or review artifacts. Screenshots may show the
  licensed assets only when they are private, local review artifacts for this
  project.
- Refer to licensed dependencies by their Unity asset path and stable GUID
  where useful. Do not copy their serialized contents into tracked code.
- Do not modify vendor prefabs, materials, models, textures, or metadata in
  place. Instantiate or reference them from Cumulus-owned tooling and objects.
- Preserve every `.meta` file when provisioning licensed assets. Regenerated
  GUIDs break serialized scene references.

Before staging or committing Unity work, run:

```bash
git status --short --ignored
git diff --cached --name-only
```

Stop if either review shows staged content under `cumulus/Assets/ThirdParty/`
or another licensed-asset source.

## Paired worktrees

Licensed assets live in a separate local-only Git repository. Every Unity task
uses two worktrees with the same branch name:

```text
journey_prototype worktree
└── cumulus/Assets/ThirdParty/  licensed-repository worktree
```

From the public task worktree, provision the paired licensed worktree before
reading or editing anything under `Assets/ThirdParty/`:

```bash
cumulus/scripts/provision-licensed-assets.sh
```

The helper reads the licensed repository path from
`journey.cumulusLicensedRepo` in the public repository's local Git config.
It reads the canonical clean worktree from `journey.cumulusLicensedSeed`.
`CUMULUS_LICENSED_REPO` and `CUMULUS_LICENSED_SEED` are explicit per-command
overrides. It verifies that ThirdParty is ignored, the licensed repository is
bare, declares `journey.localOnly=true`, has no remotes, and shares a filesystem
with the seed and destination.

- Never add a remote to the licensed repository.
- Never copy assets from the primary checkout, another worktree, a package
  cache, cloud storage, or the internet.
- Never symlink a shared asset directory. The helper uses APFS copy-on-write
  clones so every agent gets isolated writable files while unchanged file
  extents and Git objects remain shared.
- Keep the canonical seed clean on `main`. Never use it for Unity editing; it
  exists only as the clone source for task worktrees.
- `du` reports each clone's full logical size even while APFS shares its
  unchanged extents. Judge aggregate physical growth from filesystem free
  space or changed-file volume, not by summing worktree `du` output.
- Keep each public worktree's Unity `Library/`, `Temp/`, `Logs/`, and
  `UserSettings/` isolated. Never share or symlink them.
- If provisioning fails or the desired licensed branch is already checked out,
  stop and resolve the worktree mapping. Do not fall back to the primary scene.

Before removing a public task worktree, close Unity and release its nested
licensed worktree first:

```bash
cumulus/scripts/release-licensed-assets.sh
```

The release helper refuses a dirty licensed worktree and retains its branch and
commits in the local repository.

## Promotion

When the user approves promotion of a Cumulus task, perform the complete paired
promotion automatically. Do not leave licensed-scene synchronization as a
manual setup step for the user.

Before moving either repository, close every Unity editor opened by the task
and confirm that the public task worktree, paired licensed task worktree,
canonical licensed seed, and primary licensed checkout are clean. The primary
licensed checkout is the repository at
`<public-primary-checkout>/cumulus/Assets/ThirdParty/`; resolve its absolute
path from the public repository rather than hard-coding a user-specific path.

Promote licensed work while preserving both target histories:

1. In the paired licensed task worktree, integrate the current licensed `main`
   and licensed `primary` tips. If either target is not already an ancestor of
   the task branch, merge it into the task branch there; do not perform the
   conflict-producing merge in the primary checkout or canonical seed.
2. If the integration conflicts in a generated Unity scene, use the most
   recently built scene containing the integrated Cumulus-owned behavior as the
   reconstruction base, then rerun every relevant deterministic builder or
   reconciler in the task worktree. Verify that the result contains the
   behavior from both histories; accepting an entire serialized scene from
   either side is not a complete resolution.
3. Commit the verified integration in the local-only licensed task branch and
   confirm that both licensed `main` and licensed `primary` are ancestors of
   that commit.
4. Fast-forward the canonical seed's `main` branch and the primary licensed
   checkout's `primary` branch to that same commit. Never use `reset` or force
   updates to synchronize them.
5. Confirm that licensed `main`, licensed `primary`, and the licensed task
   branch resolve to the same commit. Reopen the promoted scene from the
   primary Unity project and confirm that it imports without compile,
   serialization, or rendering errors.

If `main` and `primary` have diverged, a direct
`git merge --ff-only main` from the primary checkout cannot reconcile them.
Merge both histories into the isolated licensed task branch and run the
builder-and-verification sequence above before fast-forwarding either target.
Stop the promotion if the histories cannot be reconciled and verified; never
discard either line of licensed scene work.

After the licensed targets agree, promote the public task commits onto public
`master`, push public `master`, release the nested licensed worktree, and clean
up the public worktree and task branches. The licensed repository remains
local-only and must not gain a remote.

## Durable scene changes

Proprietary scenes are durable only in the local licensed repository. Cumulus
behavior that can be expressed independently remains durable as tracked,
deterministic editor tooling under `Assets/CumulusMvp/Editor/`.

- Author an idempotent builder or reconciler that opens the licensed scene,
  creates or updates Cumulus-owned objects, and saves the local scene.
- Put all owned objects beneath a clearly named root such as
  `Cumulus Shop Mockup`. Reconcile that root by stable object names so rerunning
  the builder updates it without duplicates.
- Store Cumulus-owned meshes, shaders, materials, scripts, and prefabs under
  `Assets/CumulusMvp/`. Reference vendor assets; do not duplicate them there.
- Resolve Dreamsigns and cards by UUID. Names are display text only.
- Keep camera-relative layout explicit and deterministic. Read the target
  camera from the scene, then derive panel placement from its projection or
  from documented world-space anchors. Do not depend on the current Scene view.
- Expose both a Unity menu item for interactive iteration and a static batch
  entry point suitable for repeatable capture and validation.
- Fail with a clear message when the licensed scene, a required vendor GUID, or
  a required Cumulus asset is absent.
- Commit proprietary scene edits only in the paired licensed-assets branch.
  Commit builders, Cumulus-owned assets, and documentation only in the
  public branch.
- Keep the two commits logically paired in the handoff. Push only the public
  branch; the licensed branch remains on this machine.

## Verification and review artifacts

Do not create or maintain automated Unity C# tests for the Cumulus MVP. Do not
recreate `Assets/CumulusMvp/Tests/` or add EditMode or PlayMode test assemblies.
Verify changes with clean Unity imports, deterministic builder runs, batch
captures, compile and build validation, static checks, and the repository
review required by the root instructions. Licensed-content integration checks
are local-only because CI cannot access the asset library.

For visual or rendering work:

- Capture the target camera, not the Scene view.
- Capture a representative frame early enough to correct the composition.
- Verify the requested resolution, camera, visible Cumulus-owned root, and an
  empty Unity error buffer before accepting a capture.
- Measure layout from camera projection or renderer bounds. For a screen-edge
  panel, record its viewport margins, internal gaps, and clipping state.
- Follow the `unity-cumulus` rendering checks when material or renderer behavior
  changes: effect on/off, nonzero measured contribution, expected direction,
  a broken negative control, and a final cold visual review.
- Store captures under `cumulus/Artifacts/` or another ignored local artifact
  directory. Do not commit image files.
- Before sharing an artifact outside the local Codex review, confirm that its
  audience is authorized to see the licensed Synty content.

## Unity CLI

`/Users/dthurn/.unity/bin/unity` may be used for editor discovery, opening the
worktree project, batch execution, and tests.

- Start with `unity --help`, `unity status`, and command-specific `--help`.
- `unity status`, `unity list`, and `unity command` require a connected editor
  with Unity's Pipeline package installed. Treat “no instances found” as a
  capability result, not a project failure.
- Do not install the Pipeline package, change `Packages/manifest.json`, upgrade
  the editor, alter licensing, or sign in through the CLI unless the user
  explicitly requests it.
- Prefer existing repository scripts when they already wrap Unity with the
  correct editor version, logging, timeout, and artifact paths.
- Use non-interactive and machine-readable output for automation where
  supported. Preserve the command, exit status, Unity log, and output artifact
  path in the task record.
- Never connect the CLI to the primary checkout while implementing in a
  worktree. Pass the worktree's absolute `cumulus/` project path explicitly.
- Record and clean up every editor instance or long-lived CLI session started
  by the task.

## Handoff checklist

Before asking to promote a Unity scene task:

1. Confirm the public repository ignores and has not staged ThirdParty content.
2. Confirm the licensed worktree belongs to the configured local-only
   repository and that repository has no remotes.
3. Reopen the changed local scene and confirm Unity reports no import,
   compile, serialization, or rendering errors.
4. Run focused import, builder, capture, compile, or build checks and the
   repository review.
5. Provide private local screenshots and any reproducible builder entry point.
6. Commit both worktrees and report both commit IDs.
7. Push only tracked, distributable Cumulus-owned work from the public branch.
8. On approval, run the paired promotion procedure above so licensed `main`,
   licensed `primary`, and the licensed task branch end at one verified commit.
9. Promote and push the public commits, then release the nested licensed
   worktree before cleaning up the public worktree.
