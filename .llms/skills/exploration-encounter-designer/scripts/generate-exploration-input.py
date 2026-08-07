#!/usr/bin/env python3
"""Print a random canonical card for exploration encounter design."""

from __future__ import annotations

import argparse
import json
import random
import sys
import tomllib
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_CARDS = REPO_ROOT / "data/cards.toml"


def load_cards(path: Path) -> list[dict[str, Any]]:
    with path.open("rb") as handle:
        data = tomllib.load(handle)
    cards = [
        {
            "id": card["id"],
            "name": card["name"],
            "ability": card["rendered-text"],
            "image_number": card["image-number"],
            "card_type": card["card-type"],
            "subtype": card["subtype"],
        }
        for card in data.get("cards", [])
        if all(
            key in card
            for key in (
                "id",
                "name",
                "rendered-text",
                "image-number",
                "card-type",
                "subtype",
            )
        )
        and all(
            isinstance(card[key], str) and card[key].strip()
            for key in ("id", "name", "rendered-text", "card-type")
        )
        and isinstance(card["subtype"], str)
        and isinstance(card["image-number"], int)
        and card["image-number"] > 0
    ]
    if not cards:
        raise ValueError("card catalog contains no eligible cards")
    return cards


def filter_cards(cards: list[dict[str, Any]], card_type: str) -> list[dict[str, Any]]:
    if card_type == "all":
        return cards
    canonical_type = "Character" if card_type == "character" else "Event"
    filtered = [card for card in cards if card["card_type"] == canonical_type]
    if not filtered:
        raise ValueError(f"card catalog contains no eligible {card_type} cards")
    return filtered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, help="optional reproducible random seed")
    parser.add_argument(
        "--card-type",
        choices=("character", "event", "all"),
        default="all",
        help="restrict the random card pool (default: all)",
    )
    parser.add_argument("--cards", type=Path, default=DEFAULT_CARDS)
    args = parser.parse_args()

    try:
        eligible_cards = filter_cards(load_cards(args.cards), args.card_type)
        card = random.Random(args.seed).choice(eligible_cards)
    except (OSError, ValueError, tomllib.TOMLDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1

    json.dump({"card": card}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
