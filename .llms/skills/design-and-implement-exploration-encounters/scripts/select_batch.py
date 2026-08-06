#!/usr/bin/env python3
"""Select live-unrepresented cards and create canonical design requests."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
import tomllib
import uuid
from pathlib import Path
from typing import Any


SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parents[3]
DEFAULT_CARDS = REPO_ROOT / "data/tabula/cards.toml"
DEFAULT_DREAMSIGNS = REPO_ROOT / "data/tabula/dreamsigns.toml"
DEFAULT_EXPLORATION = REPO_ROOT / "data/tabula/exploration.toml"
DEFAULT_TEMPLATES = REPO_ROOT / "data/templates.json"
DEFAULT_JOURNEY_TYPES = REPO_ROOT / "src/types/journey.ts"
DEFAULT_IMAGES_DIR = Path("/Users/dthurn/Documents/shutterstock/images")
SUPPORTED_IMAGE_EXTENSIONS = {".jpeg", ".jpg", ".png", ".webp"}


class SelectionError(ValueError):
    """Raised when source data cannot produce a trustworthy batch."""


def canonical_uuid(value: Any, label: str, *, require_lowercase: bool = True) -> str:
    if not isinstance(value, str):
        raise SelectionError(f"{label} must be a UUID string")
    try:
        normalized = str(uuid.UUID(value))
    except ValueError as error:
        raise SelectionError(f"{label} must be a UUID") from error
    if require_lowercase and normalized != value:
        raise SelectionError(f"{label} must be a canonical lowercase UUID")
    return normalized


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except FileNotFoundError as error:
        raise SelectionError(f"Source file does not exist: {path}") from error
    return digest.hexdigest()


def load_cards(path: Path) -> list[dict[str, Any]]:
    try:
        with path.open("rb") as handle:
            document = tomllib.load(handle)
    except FileNotFoundError as error:
        raise SelectionError(f"Card catalog does not exist: {path}") from error
    except tomllib.TOMLDecodeError as error:
        raise SelectionError(f"Card catalog is invalid TOML: {path}: {error}") from error

    raw_cards = document.get("cards")
    if not isinstance(raw_cards, list):
        raise SelectionError(f"Card catalog must contain a [[cards]] array: {path}")

    cards: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw_card in enumerate(raw_cards):
        if not isinstance(raw_card, dict):
            continue
        card = {
            "id": raw_card.get("id"),
            "name": raw_card.get("name"),
            "ability": raw_card.get("rendered-text"),
            "image_number": raw_card.get("image-number"),
            "card_type": raw_card.get("card-type"),
            "subtype": raw_card.get("subtype"),
        }
        if not all(
            isinstance(card[key], str) and card[key].strip()
            for key in ("id", "name", "ability", "card_type")
        ):
            continue
        if not isinstance(card["subtype"], str):
            continue
        if (
            isinstance(card["image_number"], bool)
            or not isinstance(card["image_number"], int)
            or card["image_number"] <= 0
        ):
            continue
        card_id = canonical_uuid(card["id"], f"cards[{index}].id")
        if card_id in seen_ids:
            raise SelectionError(f"Card catalog contains duplicate UUID {card_id}")
        seen_ids.add(card_id)
        cards.append(card)
    if not cards:
        raise SelectionError("Card catalog contains no eligible cards")
    return cards


def load_live_ids(path: Path) -> set[str]:
    try:
        with path.open("rb") as handle:
            document = tomllib.load(handle)
    except FileNotFoundError as error:
        raise SelectionError(f"Exploration catalog does not exist: {path}") from error
    except tomllib.TOMLDecodeError as error:
        raise SelectionError(
            f"Exploration catalog is invalid TOML: {path}: {error}"
        ) from error
    encounters = document.get("encounter", [])
    if not isinstance(encounters, list):
        raise SelectionError("Exploration catalog must contain encounter tables")
    live_ids: set[str] = set()
    for index, encounter in enumerate(encounters):
        if not isinstance(encounter, dict):
            raise SelectionError(f"encounter[{index}] must be a table")
        card_id = canonical_uuid(
            encounter.get("card-id"),
            f"encounter[{index}].card-id",
            require_lowercase=False,
        )
        if card_id in live_ids:
            raise SelectionError(f"Exploration catalog contains duplicate UUID {card_id}")
        live_ids.add(card_id)
    return live_ids


def validate_templates(path: Path) -> None:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SelectionError(f"Template catalog does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise SelectionError(f"Template catalog is invalid JSON: {path}: {error}") from error
    if not isinstance(document, list) or not document:
        raise SelectionError("Template catalog must be a non-empty array")
    seen: set[int] = set()
    for index, entry in enumerate(document):
        if not isinstance(entry, dict):
            raise SelectionError(f"templates[{index}] must be an object")
        template_id = entry.get("template_id")
        template = entry.get("template")
        if isinstance(template_id, bool) or not isinstance(template_id, int):
            raise SelectionError(f"templates[{index}].template_id must be an integer")
        if not isinstance(template, str) or not template:
            raise SelectionError(f"templates[{index}].template must be non-empty")
        if template_id in seen:
            raise SelectionError(f"Template catalog contains duplicate ID {template_id}")
        seen.add(template_id)


def find_art(image_number: int, images_dir: Path) -> Path:
    if not images_dir.is_dir():
        raise SelectionError(f"Full-size image directory does not exist: {images_dir}")
    number = str(image_number)
    trailing_number = re.compile(rf"(?<!\d){re.escape(number)}$")
    matches = sorted(
        path.resolve()
        for path in images_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS
        and trailing_number.search(path.stem)
    )
    if not matches:
        raise SelectionError(
            f"No full-size image ending in {number} before its extension exists in "
            f"{images_dir}"
        )
    if len(matches) > 1:
        joined = "\n  ".join(str(path) for path in matches)
        raise SelectionError(f"Multiple full-size images match {number}:\n  {joined}")
    return matches[0]


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def create_batch(
    *,
    run_dir: Path,
    batch_size: int,
    seed: int | None,
    requested_card_ids: list[str],
    cards_path: Path,
    dreamsigns_path: Path,
    exploration_path: Path,
    templates_path: Path,
    journey_types_path: Path,
    images_dir: Path,
) -> dict[str, Any]:
    if batch_size <= 0:
        raise SelectionError("--batch-size must be positive")
    if not run_dir.is_dir():
        raise SelectionError(f"--run-dir must be an existing directory: {run_dir}")
    if any(run_dir.iterdir()):
        raise SelectionError(f"--run-dir must be empty: {run_dir}")

    cards = load_cards(cards_path)
    cards_by_id = {card["id"]: card for card in cards}
    live_ids = load_live_ids(exploration_path)
    validate_templates(templates_path)
    source_paths = {
        "cards": cards_path.resolve(),
        "dreamsigns": dreamsigns_path.resolve(),
        "exploration": exploration_path.resolve(),
        "templates": templates_path.resolve(),
        "journey_types": journey_types_path.resolve(),
    }
    source_digests = {key: sha256(path) for key, path in source_paths.items()}

    if requested_card_ids:
        normalized_requested = [
            canonical_uuid(value, "--card-id") for value in requested_card_ids
        ]
        if len(set(normalized_requested)) != len(normalized_requested):
            raise SelectionError("--card-id values must be unique")
        missing = [card_id for card_id in normalized_requested if card_id not in cards_by_id]
        if missing:
            raise SelectionError(f"Unknown canonical card UUID(s): {', '.join(missing)}")
        represented = [card_id for card_id in normalized_requested if card_id in live_ids]
        if represented:
            raise SelectionError(
                f"Card UUID(s) already represented in live Exploration: "
                f"{', '.join(represented)}"
            )
        selected = [cards_by_id[card_id] for card_id in normalized_requested]
    else:
        eligible = [card for card in cards if card["id"] not in live_ids]
        if batch_size > len(eligible):
            raise SelectionError(
                f"Requested {batch_size} cards but only {len(eligible)} are "
                "absent from live Exploration"
            )
        selected = random.Random(seed).sample(eligible, batch_size)

    requests_dir = run_dir / "requests"
    results_dir = run_dir / "results"
    requests_dir.mkdir()
    results_dir.mkdir()
    manifest_cards = []
    repository = {key: str(path) for key, path in source_paths.items()}
    for card in selected:
        art_path = find_art(card["image_number"], images_dir.resolve())
        art_digest = sha256(art_path)
        request = {
            "card": card,
            "art_path": str(art_path),
            "repository": repository,
        }
        write_json(requests_dir / f"{card['id']}.json", request)
        manifest_cards.append(
            {"card": card, "art_path": str(art_path), "art_sha256": art_digest}
        )

    manifest = {
        "schema_version": 1,
        "seed": seed,
        "batch_size": len(selected),
        "repository": repository,
        "source_sha256": source_digests,
        "cards": manifest_cards,
    }
    manifest_path = run_dir / "manifest.json"
    write_json(manifest_path, manifest)
    return {
        "manifest": str(manifest_path.resolve()),
        "requests_dir": str(requests_dir.resolve()),
        "results_dir": str(results_dir.resolve()),
        "card_ids": [card["id"] for card in selected],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--card-id", action="append", default=[])
    parser.add_argument("--cards", type=Path, default=DEFAULT_CARDS)
    parser.add_argument("--dreamsigns", type=Path, default=DEFAULT_DREAMSIGNS)
    parser.add_argument("--exploration", type=Path, default=DEFAULT_EXPLORATION)
    parser.add_argument("--templates", type=Path, default=DEFAULT_TEMPLATES)
    parser.add_argument("--journey-types", type=Path, default=DEFAULT_JOURNEY_TYPES)
    parser.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    try:
        output = create_batch(
            run_dir=args.run_dir,
            batch_size=args.batch_size,
            seed=args.seed,
            requested_card_ids=args.card_id,
            cards_path=args.cards,
            dreamsigns_path=args.dreamsigns,
            exploration_path=args.exploration,
            templates_path=args.templates,
            journey_types_path=args.journey_types,
            images_dir=args.images_dir.expanduser(),
        )
    except (OSError, SelectionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
