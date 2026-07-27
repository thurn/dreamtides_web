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

## Provisioning an isolated worktree

Each task still uses its own repository worktree. Provision licensed assets
into that worktree from a user-controlled local asset library outside every
Git checkout.

Use a physical copy per worktree. Do not symlink a worktree to the primary
checkout or to a shared mutable asset directory: Unity writes metadata during
imports, and concurrent agents must not mutate or lock the same files.

The recommended local layout is:

```text
<licensed-library>/Synty/PolygonVikings2/
<worktree>/cumulus/Assets/ThirdParty/Synty/PolygonVikings2/
```

Set a task-specific environment variable to the licensed library root, then
copy the dependency while preserving metadata:

```bash
CUMULUS_LICENSED_SOURCE="/absolute/path/to/licensed-library"
test -d "$CUMULUS_LICENSED_SOURCE/Synty/PolygonVikings2"
mkdir -p cumulus/Assets/ThirdParty/Synty
rsync -a \
  "$CUMULUS_LICENSED_SOURCE/Synty/PolygonVikings2/" \
  cumulus/Assets/ThirdParty/Synty/PolygonVikings2/
git check-ignore -q cumulus/Assets/ThirdParty/Synty/PolygonVikings2
```

If the licensed library has not been configured, stop and ask the user for its
path. Do not read or copy assets from the user's primary Git checkout, Unity
package cache, cloud storage, or another worktree without explicit permission.
Do not download licensed assets.

Keep each worktree's Unity `Library/`, `Temp/`, `Logs/`, and `UserSettings/`
isolated. Never share or symlink these generated directories between worktrees.

## Durable scene changes

An ignored proprietary scene is a local output, not the durable implementation.
Represent intentional changes with tracked, deterministic editor tooling under
`Assets/CumulusMvp/Editor/`.

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
- Keep generated proprietary scenes ignored. Commit the builder, Cumulus-owned
  assets, tests, and documentation that reproduce the result.

After promoting the tracked commit, run the builder once in the user's
provisioned primary checkout to materialize the local scene there. This is the
only promotion step that changes an ignored scene.

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

1. Confirm `Assets/ThirdParty/` remains ignored and unstaged.
2. Re-run the tracked builder against a freshly provisioned worktree copy.
3. Reopen the generated local scene and confirm Unity reports no import,
   compile, serialization, or rendering errors.
4. Run focused tests and the repository review.
5. Provide private local screenshots and the reproducible builder entry point.
6. Commit and push only tracked, distributable Cumulus-owned work.
7. After promotion, materialize the ignored scene in the provisioned primary
   checkout and report that local-only step explicitly.
