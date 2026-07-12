# Cumulus web-to-Unity glass parity

Run the complete measurement from the repository root:

```bash
bash cumulus/scripts/verify-glass-parity.sh
```

The command captures the current Tango web glass and the Unity scene-glass material over three deterministic interior backgrounds plus one flat edge-isolation background at `512 × 288`, compares their material effects, and writes:

- `cumulus/Artifacts/GlassParity/report/report.json` — machine-readable measurements, budgets, verdict, comparison region, and SHA-256 hashes of every input capture;
- `cumulus/Artifacts/GlassParity/report/summary.md` — compact score table;
- `cumulus/Artifacts/GlassParity/report/<scenario>-effect-diff.png` — amplified heatmaps for locating mismatches;
- `cumulus/Artifacts/GlassParity/{web,unity}/` — paired `bare` and `glass` captures for each background.

The artifact directory is ignored. A successful command exits `0`; missing captures, malformed images or manifests, failed Unity evidence, or a score outside the committed budget exits nonzero.

## Interior parity

Every renderer produces two captures per background: the background alone and the background under glass. The comparator subtracts each renderer's own bare capture from its glass capture in linear RGB. Comparing these two material-effect images keeps the score focused on blur, tint, and transmission instead of color-management differences between Chromium and Unity.

Each background score is a weighted sum of four normalized errors:

| Metric | Weight | Meaning |
| --- | ---: | --- |
| `effectMae` | 0.40 | Mean absolute linear-RGB error between the web and Unity material effects. |
| `effectRmse` | 0.25 | Root-mean-square effect error, which gives concentrated visual defects more influence. |
| `edgeAttenuationError` | 0.20 | Difference in the fraction of background edge energy retained through the glass; this is the primary blur-strength signal. |
| `meanColorShiftError` | 0.15 | Difference between the average RGB shifts introduced by each material; this isolates tint and opacity balance. |

The comparison region excludes the outer 48 horizontal and 32 vertical pixels. It evaluates the material interior while leaving rounded geometry, world-space bevels, and border/shadow construction outside the score. The aggregate score is therefore an interior-material parity result, not a whole-pane pixel match.

The aggregate reports both the mean score and the worst background. The manifest also applies the same cap to every individual scenario, so a strong result on one image cannot compensate for a regression on another.

The Unity reference uses a four-level locally filtered blur pyramid with 22 output pixels of support for Chromium's `blur(22px)`, a `0.78` linear-HDR fill alpha for the web material's `rgba(14, 14, 16, 0.54)` layer, and linear-calibrated sheen and inset intensities. These are cross-renderer calibration values: the parity score measures their rendered result rather than requiring the two graphics APIs to use identical numeric inputs.

## Edge restraint

The `edge-neutral` scenario places a bounded pane over a flat field so scene detail and blur cannot masquerade as rim structure. It measures the left and right face rims independently from the interior score:

- maximum width is the 10-percent response width after subtracting a fitted interior sheen/fill gradient;
- maximum luminance lift is the brightest residual above that fitted interior surface.

Unity's face rim is a derivative-scaled screen-space hairline. The semantic web role remains a 14-percent white rim, while the Unity material uses a calibrated linear-HDR opacity that produces the same restrained luminance lift. The physical bevel, specular response, and Fresnel response remain Unity-specific spatial behavior and are exercised by the glass-lab rendering tests.

## Improving the renderer

Lower scores are closer to the web baseline. Use the per-scenario metrics to choose the next rendering adjustment:

- high `edgeAttenuationError`: tune the shared blur radius or kernel;
- high `meanColorShiftError`: tune fill color, saturation, or fill alpha;
- high `effectRmse` with a moderate mean error: inspect the heatmap for localized sheen, UV, or sampling differences;
- one scenario much worse than the others: inspect how the shader handles that background's frequency, luminance, and color range.
- failed edge width: inspect the derivative-scaled rim coverage and pane UV continuity;
- failed edge luminance lift: tune the role's linear-HDR rim calibration or compositing.

After a material change passes on all backgrounds, ratchet the relevant interior or edge budgets downward in `manifest.json` to preserve the improvement. Add an interior scenario when a new production background exposes a distinct failure mode; keep one flat edge scenario so the capture matrix continues to isolate rim behavior.

## Capture ownership

`Web/main.tsx` imports the production `glassSurfaceStyle` and Tango token stylesheet, so the browser side measures the current web material directly. The Unity PlayMode test loads the same committed PNG resources, captures them through the configured URP renderer feature and `TangoSceneGlass` material, and writes validated NUnit evidence through `run_unity_stage`.

The deterministic backgrounds are generated by `cumulus/scripts/generate-parity-backgrounds.py`. Commit the generated PNGs and Unity metadata together whenever that source changes.
