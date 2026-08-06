#!/usr/bin/env python3
"""Verify that a scratch design workset is runtime-complete in live Exploration."""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
import uuid
from pathlib import Path
from typing import Any


SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parents[3]
DEFAULT_EXPLORATION = REPO_ROOT / "data/tabula/exploration.toml"
AUTHORED_ACTION_FIELDS = (
    "id",
    "label",
    "effect-text",
    "template-id",
    "template-variables",
    "selection",
)
MISSING = object()


class VerificationError(ValueError):
    """Raised when a designed encounter is absent or incomplete in live data."""


def load_toml(path: Path, label: str) -> dict[str, Any]:
    try:
        with path.open("rb") as handle:
            return tomllib.load(handle)
    except FileNotFoundError as error:
        raise VerificationError(f"{label} does not exist: {path}") from error
    except tomllib.TOMLDecodeError as error:
        raise VerificationError(f"{label} is invalid TOML: {path}: {error}") from error


def normalized_uuid(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise VerificationError(f"{label} must be a UUID string")
    try:
        return str(uuid.UUID(value))
    except ValueError as error:
        raise VerificationError(f"{label} must be a UUID") from error


def encounter_map(document: dict[str, Any], label: str) -> dict[str, dict[str, Any]]:
    encounters = document.get("encounter", [])
    if not isinstance(encounters, list):
        raise VerificationError(f"{label} must contain encounter tables")
    by_id: dict[str, dict[str, Any]] = {}
    for index, value in enumerate(encounters):
        if not isinstance(value, dict):
            raise VerificationError(f"{label}.encounter[{index}] must be a table")
        card_id = normalized_uuid(value.get("card-id"), f"{label}.encounter[{index}].card-id")
        if card_id in by_id:
            raise VerificationError(f"{label} contains duplicate encounter UUID {card_id}")
        by_id[card_id] = value
    return by_id


def verify(workset_path: Path, exploration_path: Path) -> dict[str, Any]:
    workset = encounter_map(load_toml(workset_path, "Workset"), "workset")
    live = encounter_map(load_toml(exploration_path, "Live Exploration"), "live")
    if not workset:
        raise VerificationError("Workset must contain at least one encounter")

    # Scan the full catalog because action IDs are globally unique, including
    # against encounters outside this workset.
    all_live_action_ids: set[str] = set()
    for card_id, encounter in live.items():
        actions = encounter.get("action")
        if not isinstance(actions, list) or len(actions) != 2:
            raise VerificationError(
                f"Live encounter {card_id} must contain exactly two actions"
            )
        for index, action in enumerate(actions):
            if not isinstance(action, dict):
                raise VerificationError(f"Live action {card_id}:{index} must be a table")
            action_id = action.get("id")
            if not isinstance(action_id, str) or not action_id:
                raise VerificationError(f"Live action {card_id}:{index} has no ID")
            if action_id in all_live_action_ids:
                raise VerificationError(f"Live Exploration contains duplicate action ID {action_id}")
            all_live_action_ids.add(action_id)

    verified_ids = []
    for card_id, designed in workset.items():
        implemented = live.get(card_id)
        if implemented is None:
            raise VerificationError(f"Workset UUID {card_id} is absent from live Exploration")
        if implemented.get("prose") != designed.get("prose"):
            raise VerificationError(f"Live encounter {card_id} does not preserve designed prose")
        designed_actions = designed.get("action")
        live_actions = implemented.get("action")
        if not isinstance(designed_actions, list) or len(designed_actions) != 2:
            raise VerificationError(f"Workset encounter {card_id} must contain exactly two actions")
        if not isinstance(live_actions, list) or len(live_actions) != 2:
            raise VerificationError(f"Live encounter {card_id} must contain exactly two actions")
        live_actions_by_id = {
            action.get("id"): action for action in live_actions if isinstance(action, dict)
        }
        for index, designed_action in enumerate(designed_actions):
            if not isinstance(designed_action, dict):
                raise VerificationError(f"Workset action {card_id}:{index} must be a table")
            action_id = designed_action.get("id")
            implemented_action = live_actions_by_id.get(action_id)
            if implemented_action is None:
                raise VerificationError(
                    f"Designed action {action_id!r} is absent from live encounter {card_id}"
                )
            for field in AUTHORED_ACTION_FIELDS:
                designed_value = designed_action.get(field, MISSING)
                implemented_value = implemented_action.get(field, MISSING)
                if designed_value != implemented_value:
                    raise VerificationError(
                        f"Live action {action_id} does not preserve authored field {field}"
                    )
            effect_kind = implemented_action.get("effect-kind")
            if not isinstance(effect_kind, str) or not effect_kind.strip():
                raise VerificationError(f"Live action {action_id} has no runtime effect-kind")
        verified_ids.append(card_id)

    return {
        "workset_encounter_count": len(workset),
        "verified_encounter_count": len(verified_ids),
        "verified_card_ids": verified_ids,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workset", required=True, type=Path)
    parser.add_argument("--exploration", type=Path, default=DEFAULT_EXPLORATION)
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    try:
        report = verify(args.workset, args.exploration)
    except (OSError, VerificationError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
