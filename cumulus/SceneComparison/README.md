# Cumulus whole-scene comparison

Capture and compare the registered shop-glass scene from the repository root:

```bash
npm run compare-cumulus-scene
```

The default capture is `3840 × 2160`. Pass a registered scene id and optional
width and height to change the target while preserving identical dimensions on
both renderers:

```bash
npm run compare-cumulus-scene -- cumulus-shop-glass-demo 2560 1440
```

To copy `unity.png` and `web.png` into a fresh temporary directory and open
both images in their default macOS application, run:

```bash
npm run open-cumulus-scene-comparison
```

The open command accepts the same optional scene id, width, and height:

```bash
npm run open-cumulus-scene-comparison -- cumulus-shop-glass-demo 2560 1440
```

The command rebuilds and renders the Unity scene, opens its paired web endpoint
in an isolated browser session, verifies the URL and viewport, and captures the
same full frame. It writes renderer PNGs, numeric whole-frame error metrics, an
amplified difference image, and a center split image under:

`cumulus/Artifacts/SceneComparison/<scene-id>/<width>x<height>/`

Artifacts are ignored by Git. The web reference for the initial scene is
available while Vite is running at:

`/cumulus/SceneComparison/Web/?scene=cumulus-shop-glass-demo`

## Adding a scene

Add one entry to `manifest.json` with a stable id, Unity scene path, static
rebuild method, web path, renderer id, and renderer data. Add the corresponding
React renderer to `Web/main.tsx`. The capture and comparator do not need
scene-specific changes.

The whole-frame score includes the backdrop, panel geometry, and glass. Use it
for convergence and visual localization. The existing Glass Parity harness
continues to isolate the material effect from renderer color-management and
geometry differences.
