#!/usr/bin/env python3
"""Verify that a validated design workset is complete in generated Exploration."""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from pathlib import Path
from typing import Any

from select_batch import SelectionError, canonical_uuid


SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parents[3]
DEFAULT_EXPLORATION = REPO_ROOT / "data/exploration.toml"
MISSING = object()


class VerificationError(ValueError):
    """Raised when a designed encounter is absent or incomplete in live data."""


def load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise VerificationError(f"{label} does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise VerificationError(
            f"{label} is invalid JSON: {path}:{error.lineno}:{error.colno}"
        ) from error
    if not isinstance(value, dict):
        raise VerificationError(f"{label} must be a JSON object")
    return value


def load_toml(path: Path, label: str) -> dict[str, Any]:
    try:
        with path.open("rb") as handle:
            return tomllib.load(handle)
    except FileNotFoundError as error:
        raise VerificationError(f"{label} does not exist: {path}") from error
    except tomllib.TOMLDecodeError as error:
        raise VerificationError(f"{label} is invalid TOML: {path}: {error}") from error


def normalized_uuid(value: Any, label: str, *, require_v4: bool = False) -> str:
    try:
        return canonical_uuid(value, label, require_v4=require_v4)
    except SelectionError as error:
        raise VerificationError(str(error)) from error


def live_encounter_map(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    encounters = document.get("encounter", [])
    if not isinstance(encounters, list):
        raise VerificationError("Live Exploration must contain encounter tables")
    by_id: dict[str, dict[str, Any]] = {}
    all_action_ids: set[str] = set()
    for index, value in enumerate(encounters):
        if not isinstance(value, dict):
            raise VerificationError(f"live.encounter[{index}] must be a table")
        card_id = normalized_uuid(value.get("card-id"), f"live.encounter[{index}].card-id")
        if card_id in by_id:
            raise VerificationError(f"Live Exploration contains duplicate encounter UUID {card_id}")
        actions = value.get("action")
        if not isinstance(actions, list) or not 1 <= len(actions) <= 4:
            raise VerificationError(
                f"Live encounter {card_id} must contain between one and four actions"
            )
        for action_index, action in enumerate(actions):
            if not isinstance(action, dict):
                raise VerificationError(f"Live action {card_id}:{action_index} must be a table")
            action_id = normalized_uuid(
                action.get("id"), f"live action {card_id}:{action_index}.id", require_v4=True
            )
            if action_id in all_action_ids:
                raise VerificationError(f"Live Exploration contains duplicate action ID {action_id}")
            all_action_ids.add(action_id)
        by_id[card_id] = value
    return by_id


def verify(workset_path: Path, exploration_path: Path) -> dict[str, Any]:
    workset = load_json(workset_path, "Workset")
    if workset.get("schema_version") != 2:
        raise VerificationError("Workset schema_version must equal 2")
    designed_encounters = workset.get("encounters")
    if not isinstance(designed_encounters, list) or not designed_encounters:
        raise VerificationError("Workset must contain at least one encounter")
    live = live_encounter_map(load_toml(exploration_path, "Generated Exploration"))

    verified_ids: list[str] = []
    seen_designed_ids: set[str] = set()
    for index, designed in enumerate(designed_encounters):
        if not isinstance(designed, dict):
            raise VerificationError(f"workset.encounters[{index}] must be an object")
        card_id = normalized_uuid(
            designed.get("card_id"), f"workset.encounters[{index}].card_id"
        )
        if card_id in seen_designed_ids:
            raise VerificationError(f"Workset contains duplicate encounter UUID {card_id}")
        seen_designed_ids.add(card_id)
        implemented = live.get(card_id)
        if implemented is None:
            raise VerificationError(f"Workset UUID {card_id} is absent from live Exploration")
        if implemented.get("prose") != designed.get("prose"):
            raise VerificationError(f"Live encounter {card_id} does not preserve designed prose")

        designed_actions = designed.get("actions")
        if not isinstance(designed_actions, list) or len(designed_actions) != 2:
            raise VerificationError(f"Workset encounter {card_id} must contain exactly two actions")
        live_actions = implemented.get("action")
        if not isinstance(live_actions, list):
            raise VerificationError(f"Live encounter {card_id} has no actions")
        live_actions_by_id = {
            action.get("id"): action for action in live_actions if isinstance(action, dict)
        }
        for action_index, designed_action in enumerate(designed_actions):
            if not isinstance(designed_action, dict):
                raise VerificationError(
                    f"Workset action {card_id}:{action_index} must be an object"
                )
            action_id = normalized_uuid(
                designed_action.get("action_id"),
                f"workset action {card_id}:{action_index}.action_id",
                require_v4=True,
            )
            implemented_action = live_actions_by_id.get(action_id)
            if implemented_action is None:
                raise VerificationError(
                    f"Designed action {action_id} is absent from live encounter {card_id}"
                )
            if implemented_action.get("label") != designed_action.get("label"):
                raise VerificationError(f"Live action {action_id} does not preserve its label")
            presentation = designed_action.get("presentation")
            if not isinstance(presentation, dict):
                raise VerificationError(f"Workset action {action_id} has no presentation")
            if implemented_action.get("effect-text") != presentation.get("effect_text"):
                raise VerificationError(
                    f"Live action {action_id} does not preserve presentation.effect_text"
                )
            followup = presentation.get("followup")
            if followup is None:
                if "followup-title" in implemented_action or "followup-subtitle" in implemented_action:
                    raise VerificationError(
                        f"Live action {action_id} adds an unplanned followup presentation"
                    )
            elif (
                not isinstance(followup, dict)
                or implemented_action.get("followup-title") != followup.get("title")
                or implemented_action.get("followup-subtitle") != followup.get("subtitle")
            ):
                raise VerificationError(
                    f"Live action {action_id} does not preserve its followup presentation"
                )

            effect = designed_action.get("effect")
            if not isinstance(effect, dict):
                raise VerificationError(f"Workset action {action_id} has no typed effect")
            expected_kind = effect.get("runtime_effect_kind")
            if implemented_action.get("effect-kind") != expected_kind:
                raise VerificationError(
                    f"Live action {action_id} does not use runtime effect kind {expected_kind!r}"
                )
            if designed_action.get("implementation_status") == "reuse":
                expected_fields = designed_action.get("expected_live_fields")
                if not isinstance(expected_fields, dict):
                    raise VerificationError(
                        f"Reuse action {action_id} has no expected_live_fields contract"
                    )
                for field, expected_value in expected_fields.items():
                    actual_value = implemented_action.get(field, MISSING)
                    if actual_value != expected_value:
                        raise VerificationError(
                            f"Live action {action_id} does not preserve lowered field {field}"
                        )
        verified_ids.append(card_id)

    return {
        "workset_encounter_count": len(designed_encounters),
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
