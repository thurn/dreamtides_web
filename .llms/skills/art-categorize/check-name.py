#!/usr/bin/env python3
"""Validate candidate card names against the banned common-words list.

Usage: check-name.py "Candidate One" ["Candidate Two" ...]

A card name may NOT contain any word present in common_words.txt (the file
lives next to this script). Matching is case-insensitive and word-level:
punctuation and possessives are stripped, so "Siren's" matches the word
"siren".

Pass one or more candidates in a single call. Each line of output is the
candidate followed by PASS, or FAIL with the offending words. The exit code is
0 only when every candidate passes, so a single invocation can validate a whole
batch of candidates at once.
"""

import os
import re
import sys


def main():
    if len(sys.argv) < 2:
        print('Usage: check-name.py "Candidate One" ["Candidate Two" ...]',
              file=sys.stderr)
        sys.exit(2)

    here = os.path.dirname(os.path.abspath(__file__))
    words_path = os.path.join(here, "common_words.txt")

    with open(words_path, encoding="utf-8") as f:
        banned = {line.strip().lower() for line in f if line.strip()}

    any_fail = False
    for name in sys.argv[1:]:
        # Split into bare alphabetic tokens (drop apostrophes, hyphens, etc.).
        tokens = re.findall(r"[a-z]+", name.lower())
        hits = sorted({t for t in tokens if t in banned})
        if hits:
            any_fail = True
            print(f"{name}\tFAIL: contains banned word(s): {', '.join(hits)}")
        else:
            print(f"{name}\tPASS")

    sys.exit(1 if any_fail else 0)


if __name__ == "__main__":
    main()
