# Iosevka RON

`IosevkaRON-Regular.ttf` and `IosevkaRON-Italic.ttf` are modified desktop
faces for editing Dreamtides RON catalogs. They use Iosevka Term 34.6.3 as the
base and replace the canonical rules-symbol code points with the filled
Boxicons outlines used by the Cumulus rules-text renderer.

The source characters remain unchanged. The font substitutes display outlines
for energy, spark, essence, points, exhaust, memory, and fast/interrupt
markers. The trigger arrow uses its authored Iosevka Unicode outline.

Regenerate the checked-in faces from an installed Iosevka Term collection:

```sh
python3 -m pip install fonttools brotli
python3 scripts/build-iosevka-ron-font.py --output-dir vendor/iosevka-ron
```

The base font is [Iosevka](https://github.com/be5invis/Iosevka), copyright
Renzhi Li and distributed under the SIL Open Font License 1.1. The upstream
license is included verbatim in `LICENSE-IOSEVKA.md`; the modified faces remain
under those terms.

The substituted outlines come from the vendored Boxicons filled font at
`src/vendor/boxicons/boxicons-filled.woff2`. Boxicons documents its free font
distribution under the [SIL Open Font License 1.1](https://docs.boxicons.com/license/free).
