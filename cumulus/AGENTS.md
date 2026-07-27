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
quest_prototype worktree
└── cumulus/Assets/ThirdParty/  licensed-repository worktree
```

From the public task worktree, provision the paired licensed worktree before
reading or editing anything under `Assets/ThirdParty/`:

```bash
cumulus/scripts/provision-licensed-assets.sh
```

The helper reads the licensed repository path from
`quest.cumulusLicensedRepo` in the public repository's local Git config.
`CUMULUS_LICENSED_REPO` is an explicit per-command override. It verifies that
ThirdParty is ignored, the licensed repository declares
`quest.localOnly=true`, and the repository has no remotes.

- Never add a remote to the licensed repository.
- Never copy assets from the primary checkout, another worktree, a package
  cache, cloud storage, or the internet.
- Never symlink a shared asset directory. A physical Git worktree gives every
  agent isolated writable files while sharing immutable objects.
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
  Commit builders, Cumulus-owned assets, tests, and documentation only in the
  public branch.
- Keep the two commits logically paired in the handoff. Push only the public
  branch; the licensed branch remains on this machine.

## Verification and review artifacts

Run focused EditMode or PlayMode tests while iterating, then the repository
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
4. Run focused tests and the repository review.
5. Provide private local screenshots and any reproducible builder entry point.
6. Commit both worktrees and report both commit IDs.
7. Push only tracked, distributable Cumulus-owned work from the public branch.
8. Promote the public and licensed commits deliberately; never imply that
   promoting one repository also promoted the other.
9. Release the nested licensed worktree before cleaning up the public worktree.
