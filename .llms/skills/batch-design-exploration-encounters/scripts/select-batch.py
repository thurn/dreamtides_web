#!/usr/bin/env python3
"""Create a random batch of canonical cards without encounter candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
import tomllib
import uuid
from pathlib import Path
from typing import Any


SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parents[3]
DEFAULT_CARDS = REPO_ROOT / "data/cards.toml"
DEFAULT_CANDIDATES = REPO_ROOT / "data/exploration_candidates.json"


class SelectionError(ValueError):
    """Raised when a trustworthy batch cannot be selected."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, help="optional reproducible random seed")
    parser.add_argument("--cards", type=Path, default=DEFAULT_CARDS)
    parser.add_argument(
        "--exploration-candidates", type=Path, default=DEFAULT_CANDIDATES
    )
    return parser.parse_args()


def canonical_uuid(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise SelectionError(f"{label} must be a UUID string")
    try:
        normalized = str(uuid.UUID(value))
    except ValueError as error:
        raise SelectionError(f"{label} must be a UUID") from error
    if normalized != value:
        raise SelectionError(f"{label} must be a canonical lowercase UUID")
    return normalized


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
        required = {
            "id": raw_card.get("id"),
            "name": raw_card.get("name"),
            "ability": raw_card.get("rendered-text"),
            "image_number": raw_card.get("image-number"),
            "card_type": raw_card.get("card-type"),
            "subtype": raw_card.get("subtype"),
        }
        if not all(
            isinstance(required[key], str) and required[key].strip()
            for key in ("id", "name", "ability", "card_type")
        ):
            continue
        if not isinstance(required["subtype"], str):
            continue
        if (
            isinstance(required["image_number"], bool)
            or not isinstance(required["image_number"], int)
            or required["image_number"] <= 0
        ):
            continue
        card_id = canonical_uuid(required["id"], f"cards[{index}].id")
        if card_id in seen_ids:
            raise SelectionError(f"Card catalog contains duplicate UUID {card_id}")
        seen_ids.add(card_id)
        cards.append(required)

    if not cards:
        raise SelectionError("Card catalog contains no eligible cards")
    return cards


def load_candidates(path: Path) -> tuple[dict[str, Any], str]:
    try:
        source = path.read_bytes()
    except FileNotFoundError as error:
        raise SelectionError(f"Encounter candidates do not exist: {path}") from error
    try:
        document = json.loads(source)
    except json.JSONDecodeError as error:
        raise SelectionError(
            f"Encounter candidates are invalid JSON: {path}:{error.lineno}:{error.colno}"
        ) from error
    if not isinstance(document, dict):
        raise SelectionError("Encounter candidates must be a UUID-keyed object")
    for card_id, encounters in document.items():
        canonical_uuid(card_id, "Encounter candidate key")
        if not isinstance(encounters, list) or not encounters:
            raise SelectionError(
                f"Encounter candidates for {card_id} must be a non-empty array"
            )
    return document, hashlib.sha256(source).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def create_batch(
    *,
    cards_path: Path,
    candidates_path: Path,
    run_dir: Path,
    batch_size: int,
    seed: int | None,
) -> dict[str, Any]:
    if batch_size <= 0:
        raise SelectionError("--batch-size must be positive")
    if not run_dir.is_dir():
        raise SelectionError(f"--run-dir must be an existing directory: {run_dir}")
    if any(run_dir.iterdir()):
        raise SelectionError(f"--run-dir must be empty: {run_dir}")

    cards = load_cards(cards_path)
    candidates, candidates_digest = load_candidates(candidates_path)
    eligible = [card for card in cards if card["id"] not in candidates]
    if batch_size > len(eligible):
        raise SelectionError(
            f"Requested {batch_size} cards but only {len(eligible)} are unrepresented"
        )

    selected = random.Random(seed).sample(eligible, batch_size)
    requests_dir = run_dir / "requests"
    results_dir = run_dir / "results"
    requests_dir.mkdir()
    results_dir.mkdir()
    for card in selected:
        write_json(requests_dir / f"{card['id']}.json", {"card": card})

    manifest = {
        "schema_version": 1,
        "batch_size": batch_size,
        "seed": seed,
        "exploration_candidates": str(candidates_path.resolve()),
        "exploration_candidates_sha256": candidates_digest,
        "cards": selected,
    }
    manifest_path = run_dir / "manifest.json"
    write_json(manifest_path, manifest)
    return {
        "manifest": str(manifest_path.resolve()),
        "requests_dir": str(requests_dir.resolve()),
        "results_dir": str(results_dir.resolve()),
        "card_ids": [card["id"] for card in selected],
    }


def main() -> int:
    args = parse_args()
    try:
        output = create_batch(
            cards_path=args.cards,
            candidates_path=args.exploration_candidates,
            run_dir=args.run_dir,
            batch_size=args.batch_size,
            seed=args.seed,
        )
    except (OSError, SelectionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
