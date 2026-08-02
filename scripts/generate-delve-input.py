#!/usr/bin/env python3
"""Print a random Delve encounter-design request as JSON."""

from __future__ import annotations

import argparse
import json
import random
import sys
import tomllib
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TEMPLATES = REPO_ROOT / ".llms/skills/delve/references/templates.json"
DEFAULT_CARDS = REPO_ROOT / "data/tabula/cards.toml"


def load_templates(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        templates = json.load(handle)
    if not isinstance(templates, list) or len(templates) < 10:
        raise ValueError("template catalog must contain at least 10 templates")
    if any(
        not isinstance(entry, dict)
        or isinstance(entry.get("template_id"), bool)
        or not isinstance(entry.get("template_id"), int)
        or entry["template_id"] < 1
        or not isinstance(entry.get("template"), str)
        or not entry["template"].strip()
        for entry in templates
    ):
        raise ValueError("every template must have a positive integer ID and text")
    template_ids = [entry["template_id"] for entry in templates]
    if len(set(template_ids)) != len(template_ids):
        raise ValueError("template IDs must be unique")
    return templates


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


def generate_request(
    templates: list[dict[str, Any]],
    cards: list[dict[str, Any]],
    rng: random.Random,
) -> dict[str, Any]:
    selected_templates = rng.sample(templates, 10)
    return {
        "card": rng.choice(cards),
        "template_pairs": [
            {
                "id": f"pair-{index + 1}",
                "actions": selected_templates[index * 2 : index * 2 + 2],
            }
            for index in range(5)
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, help="optional reproducible random seed")
    parser.add_argument("--templates", type=Path, default=DEFAULT_TEMPLATES)
    parser.add_argument("--cards", type=Path, default=DEFAULT_CARDS)
    args = parser.parse_args()

    try:
        request = generate_request(
            load_templates(args.templates),
            load_cards(args.cards),
            random.Random(args.seed),
        )
    except (OSError, ValueError, json.JSONDecodeError, tomllib.TOMLDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1

    json.dump(request, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
