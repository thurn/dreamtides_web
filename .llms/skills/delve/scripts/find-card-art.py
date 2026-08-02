#!/usr/bin/env python3
"""Resolve one full-size Shutterstock image by its trailing image number."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_IMAGES_DIR = Path("/Users/dthurn/Documents/shutterstock/images")
SUPPORTED_EXTENSIONS = {".jpeg", ".jpg", ".png", ".webp"}


def find_image(image_number: str, images_dir: Path) -> Path:
    if not image_number.isdigit():
        raise ValueError("image_number must contain digits only")
    if not images_dir.is_dir():
        raise FileNotFoundError(f"Image directory does not exist: {images_dir}")

    trailing_number = re.compile(rf"(?<!\d){re.escape(image_number)}$")
    matches = sorted(
        path.resolve()
        for path in images_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
        and trailing_number.search(path.stem)
    )
    if not matches:
        raise FileNotFoundError(
            f"No full-size image ending in {image_number} before its extension "
            f"was found in {images_dir}"
        )
    if len(matches) > 1:
        joined = "\n  ".join(str(path) for path in matches)
        raise RuntimeError(
            f"Multiple full-size images match {image_number}; resolve the ambiguity:\n  {joined}"
        )
    return matches[0]


def filename_hint(path: Path, image_number: str) -> str:
    stem = re.sub(rf"[-_]?{re.escape(image_number)}$", "", path.stem)
    stem = re.sub(r"^stock-(?:photo|vector)-", "", stem, flags=re.IGNORECASE)
    return re.sub(r"[-_]+", " ", stem).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image_number")
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=DEFAULT_IMAGES_DIR,
        help=f"full-size image directory (default: {DEFAULT_IMAGES_DIR})",
    )
    args = parser.parse_args()

    try:
        path = find_image(args.image_number, args.images_dir.expanduser())
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "image_number": int(args.image_number),
                "path": str(path),
                "filename_hint": filename_hint(path, args.image_number),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
