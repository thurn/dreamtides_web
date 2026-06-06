#!/usr/bin/env python3
"""Validate a candidate card name against the banned common-words list.

Usage: check-name.py "Candidate Card Name"

A card name may NOT contain any word present in common_words.txt (the file
lives next to this script). Matching is case-insensitive and word-level:
punctuation and possessives are stripped, so "Siren's" matches the word
"siren". Prints PASS or FAIL, and on failure lists the offending words.
"""

import os
import re
import sys


def main():
    if len(sys.argv) != 2:
        print("Usage: check-name.py \"Candidate Card Name\"", file=sys.stderr)
        sys.exit(1)

    name = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    words_path = os.path.join(here, "common_words.txt")

    with open(words_path, encoding="utf-8") as f:
        banned = {line.strip().lower() for line in f if line.strip()}

    # Split the name into bare alphabetic tokens (drop apostrophes, hyphens, etc.).
    tokens = re.findall(r"[a-z]+", name.lower())
    hits = sorted({t for t in tokens if t in banned})

    if hits:
        print(f"FAIL: contains banned word(s): {', '.join(hits)}")
        sys.exit(1)

    print("PASS")


if __name__ == "__main__":
    main()
