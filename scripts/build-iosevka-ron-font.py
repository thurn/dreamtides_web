#!/usr/bin/env python3
"""Build an Iosevka family that previews Dreamtides rules glyphs in RON files.

The source characters remain unchanged. Their cmap entries point at the same
filled Boxicons outlines used by the Cumulus rules-text renderer.

Requires the ``fonttools`` and ``brotli`` Python packages.
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path

try:
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import TTCollection, TTFont
except ImportError as error:
    raise SystemExit(
        "Missing font tooling. Install it with: python3 -m pip install fonttools brotli"
    ) from error


REPO_ROOT = Path(__file__).resolve().parent.parent
BOXICONS_FONT = REPO_ROOT / "src/vendor/boxicons/boxicons-filled.woff2"
BOXICONS_CSS = REPO_ROOT / "src/vendor/boxicons/boxicons-filled.css"
DEFAULT_IOSEVKA = Path.home() / "Library/Fonts/SGr-IosevkaTerm-Regular.ttc"
DEFAULT_OUTPUT_DIR = Path.home() / "Library/Fonts"

FAMILY_NAME = "Iosevka RON"
CELL_ADVANCE = 500
VISUAL_SIZE = 560
VISUAL_CENTER_X = CELL_ADVANCE / 2
VISUAL_CENTER_Y = 320


@dataclass(frozen=True)
class Substitution:
    character: str
    boxicon: str
    glyph_name: str


# Keep this vocabulary aligned with SYMBOL_MAP in card-text.ts and the filled
# glyphs selected by RulesText.tsx / StandaloneGlyph.tsx. The trigger arrow ▸
# stays authored Unicode in the renderer and therefore is intentionally absent.
SUBSTITUTIONS = (
    Substitution("●", "fire-alt", "dreamtidesEnergy"),
    Substitution("⍏", "sparkle", "dreamtidesSparkPip"),
    Substitution("✦", "sparkle", "dreamtidesSpark"),
    Substitution("◆", "crypto", "dreamtidesEssence"),
    Substitution("⍟", "star-circle", "dreamtidesPoints"),
    Substitution("☾", "moon", "dreamtidesExhaust"),
    Substitution("⧗", "brain", "dreamtidesMemory"),
    Substitution("❖", "bolt", "dreamtidesFast"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--iosevka",
        type=Path,
        default=DEFAULT_IOSEVKA,
        help=f"source Iosevka Term collection (default: {DEFAULT_IOSEVKA})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"font installation directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    return parser.parse_args()


def boxicon_codepoints() -> dict[str, int]:
    css = BOXICONS_CSS.read_text(encoding="utf-8")
    result: dict[str, int] = {}
    for substitution in SUBSTITUTIONS:
        selector = re.compile(
            rf'\.bxf\.bx-{re.escape(substitution.boxicon)}:before'
            r'\{content:"\\([0-9a-f]+)";\}'
        )
        match = selector.search(css)
        if match is None:
            raise SystemExit(
                f"Boxicons CSS does not define filled bx-{substitution.boxicon}"
            )
        result[substitution.boxicon] = int(match.group(1), 16)
    return result


def source_bounds(glyph_set: object, glyph_name: str) -> tuple[float, ...]:
    pen = BoundsPen(glyph_set)
    glyph_set[glyph_name].draw(pen)
    if pen.bounds is None:
        raise SystemExit(f"Boxicons glyph {glyph_name} has no outline")
    return pen.bounds


def add_substitution(
    font: TTFont,
    boxicons: TTFont,
    substitution: Substitution,
    private_codepoint: int,
) -> None:
    boxicons_cmap = boxicons.getBestCmap()
    source_name = boxicons_cmap.get(private_codepoint)
    if source_name is None:
        raise SystemExit(
            f"Boxicons font has no glyph at U+{private_codepoint:04X} "
            f"for bx-{substitution.boxicon}"
        )

    glyph_set = boxicons.getGlyphSet()
    x_min, y_min, x_max, y_max = source_bounds(glyph_set, source_name)
    width = x_max - x_min
    height = y_max - y_min
    if width <= 0 or height <= 0:
        raise SystemExit(f"Boxicons glyph {source_name} has invalid bounds")

    scale = VISUAL_SIZE / max(width, height)
    x_offset = VISUAL_CENTER_X - ((x_min + x_max) / 2) * scale
    y_offset = VISUAL_CENTER_Y - ((y_min + y_max) / 2) * scale
    pen = TTGlyphPen(font.getGlyphSet())
    transformed_pen = TransformPen(
        pen, (scale, 0, 0, scale, x_offset, y_offset)
    )
    glyph_set[source_name].draw(transformed_pen)

    glyph_order = font.getGlyphOrder()
    if substitution.glyph_name not in glyph_order:
        glyph_order.append(substitution.glyph_name)
        font.setGlyphOrder(glyph_order)
    font["glyf"][substitution.glyph_name] = pen.glyph()

    glyph = font["glyf"][substitution.glyph_name]
    glyph.recalcBounds(font["glyf"])
    font["hmtx"].metrics[substitution.glyph_name] = (
        CELL_ADVANCE,
        glyph.xMin,
    )
    codepoint = ord(substitution.character)
    for table in font["cmap"].tables:
        if table.isUnicode() and table.format != 14:
            table.cmap[codepoint] = substitution.glyph_name


def replace_names(font: TTFont, style: str) -> None:
    full_name = FAMILY_NAME if style == "Regular" else f"{FAMILY_NAME} {style}"
    replacements = {
        1: FAMILY_NAME,
        2: style,
        3: f"{FAMILY_NAME}; Dreamtides filled rules glyphs; {style}",
        4: full_name,
        6: f"IosevkaRON-{style}",
        16: FAMILY_NAME,
        17: style,
        21: FAMILY_NAME,
        22: style,
    }
    for record in font["name"].names:
        replacement = replacements.get(record.nameID)
        if replacement is not None:
            record.string = replacement.encode(record.getEncoding())


def name(font: TTFont, name_id: int) -> str | None:
    return font["name"].getDebugName(name_id)


def selected_faces(collection: TTCollection) -> tuple[tuple[TTFont, str], ...]:
    selected: dict[str, TTFont] = {}
    for font in collection.fonts:
        family = name(font, 1)
        style = name(font, 2)
        if family == "Iosevka Term" and style in ("Regular", "Italic"):
            selected[style] = font
    missing = {"Regular", "Italic"} - selected.keys()
    if missing:
        raise SystemExit(
            "Source collection is missing Iosevka Term faces: "
            + ", ".join(sorted(missing))
        )
    return ((selected["Regular"], "Regular"), (selected["Italic"], "Italic"))


def build(source: Path, output_dir: Path) -> list[Path]:
    if not source.is_file():
        raise SystemExit(f"Iosevka source collection not found: {source}")
    output_dir.mkdir(parents=True, exist_ok=True)

    collection = TTCollection(source)
    boxicons = TTFont(BOXICONS_FONT)
    private_codepoints = boxicon_codepoints()
    outputs: list[Path] = []
    for font, style in selected_faces(collection):
        for substitution in SUBSTITUTIONS:
            add_substitution(
                font,
                boxicons,
                substitution,
                private_codepoints[substitution.boxicon],
            )
        replace_names(font, style)
        output = output_dir / f"IosevkaRON-{style}.ttf"
        font.save(output, reorderTables=False)
        outputs.append(output)
    return outputs


def main() -> None:
    args = parse_args()
    outputs = build(args.iosevka.expanduser(), args.output_dir.expanduser())
    for output in outputs:
        print(output)
    print('Use "Developer: Reload Window" in VS Code to refresh the fonts.')


if __name__ == "__main__":
    main()
