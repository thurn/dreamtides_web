#!/usr/bin/env python3
"""Look up card art image path and description by image ID.

Usage: art-lookup.py <image_id>

Prints the local file path and a human-readable description derived from the
filename. View the image with the Read tool (or view_image) before
classifying — never proceed from the description text alone.
"""

import glob
import re
import sys


def main():
    if len(sys.argv) != 2:
        print("Usage: art-lookup.py <image_id>", file=sys.stderr)
        sys.exit(1)

    image_id = sys.argv[1]
    # Search candidate pool first, then fall back to full image directories.
    search_dirs = [
        "/tmp/art-narrow/candidates",
        "/Users/dthurn/Documents/shutterstock/images_clean",
        "/Users/dthurn/Documents/shutterstock/images",
    ]

    matches = []
    for images_dir in search_dirs:
        matches = glob.glob(f"{images_dir}/*-{image_id}.*")
        if matches:
            break

    if not matches:
        print(f"No image file found for ID {image_id}", file=sys.stderr)
        sys.exit(1)

    path = matches[0]
    # Extract description from filename: strip prefix, ID suffix, and extension.
    fname = path.rsplit("/", 1)[-1]
    fname_no_ext = fname.rsplit(".", 1)[0]
    # Remove trailing -ID.
    fname_no_id = re.sub(r"-\d+$", "", fname_no_ext)
    # Remove stock-photo- / stock-vector- prefix.
    desc_slug = re.sub(r"^stock-(?:photo|vector)-", "", fname_no_id)
    # Convert hyphens to spaces.
    description = desc_slug.replace("-", " ").strip()
    # Strip common boilerplate suffixes (may appear in any combination).
    description = re.sub(
        r"[\s,]*(?:digital|art|style|illustration|painting|oil|watercolor|freehand|sketch)+"
        r"(?:\s+(?:digital|art|style|illustration|painting|oil|watercolor|freehand|sketch))*\s*$",
        "",
        description,
        flags=re.IGNORECASE,
    ).strip()

    print(f"Path: {path}")
    print(f"Description: {description}")


if __name__ == "__main__":
    main()
