#!/usr/bin/env python3
"""Verify one-action redesign preservation against generated Exploration data."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from verify_live import (
    DEFAULT_EXPLORATION,
    MISSING,
    VerificationError,
    live_encounter_map,
    load_json,
    load_toml,
    normalized_uuid,
)
from select_batch import DEFAULT_MECHANIC_IDEAS
from template_assignments import DEFAULT_LEDGER, load_ledger, template_counts


def verify_redesigns(
    workset_path: Path,
    exploration_path: Path,
    template_assignments_path: Path = DEFAULT_LEDGER,
    mechanic_path: Path = DEFAULT_MECHANIC_IDEAS,
) -> dict[str, Any]:
    workset = load_json(workset_path, "Workset")
    if workset.get("schema_version") != 1 or not isinstance(workset.get("replacements"), list):
        raise VerificationError("Redesign workset must use schema_version 1 and contain replacements")
    live_document = load_toml(exploration_path, "Generated Exploration")
    live = live_encounter_map(live_document)
    ledger = load_ledger(
        template_assignments_path,
        exploration_path=exploration_path,
        mechanic_path=mechanic_path,
    )
    ledger_by_action = {value["action_id"]: value for value in ledger["assignments"]}
    global_action_ids = {
        action["id"]
        for encounter in live.values()
        for action in encounter.get("action", [])
    }
    verified = []
    deltas = []
    for index, replacement in enumerate(workset["replacements"]):
        if not isinstance(replacement, dict):
            raise VerificationError(f"replacements[{index}] must be an object")
        card_id = normalized_uuid(replacement.get("card_id"), f"replacements[{index}].card_id")
        encounter = live.get(card_id)
        if encounter is None:
            raise VerificationError(f"redesigned encounter {card_id} is absent")
        if encounter.get("prose") != replacement.get("prose"):
            raise VerificationError(f"redesigned encounter {card_id} changed preserved prose")
        for unselected in replacement.get("unselected_candidates", []):
            unselected_card_id = normalized_uuid(
                unselected.get("card_id"),
                f"replacements[{index}].unselected_candidates.card_id",
            )
            if live.get(unselected_card_id) != unselected.get("encounter"):
                raise VerificationError(
                    f"unselected candidate encounter {unselected_card_id} changed"
                )
        actions = encounter.get("action")
        if not isinstance(actions, list) or len(actions) != 2:
            raise VerificationError(f"redesigned encounter {card_id} must contain exactly two actions")
        old_id = normalized_uuid(
            replacement.get("replaced_action", {}).get("id"),
            f"replacements[{index}].replaced_action.id",
            require_v4=True,
        )
        if old_id in global_action_ids:
            raise VerificationError(f"replaced action UUID {old_id} remains live")
        if old_id in ledger_by_action:
            raise VerificationError(f"replaced action UUID {old_id} remains in template ledger")
        preserved = replacement.get("preserved_action")
        if not isinstance(preserved, dict) or preserved not in actions:
            raise VerificationError(f"encounter {card_id} changed its preserved action")
        designed = replacement.get("replacement_action")
        if not isinstance(designed, dict):
            raise VerificationError(f"replacement action for {card_id} must be an object")
        new_id = normalized_uuid(
            designed.get("action_id"), f"replacements[{index}].replacement_action.action_id", require_v4=True
        )
        matching = [action for action in actions if action.get("id") == new_id]
        if len(matching) != 1:
            raise VerificationError(f"replacement action UUID {new_id} must appear exactly once")
        actual = matching[0]
        ledger_assignment = ledger_by_action.get(new_id)
        if ledger_assignment is None or ledger_assignment["template_id"] != replacement["target_template_id"]:
            raise VerificationError(
                f"replacement action {new_id} does not use target template {replacement['target_template_id']} in the ledger"
            )
        if actual.get("label") != designed.get("label"):
            raise VerificationError(f"replacement action {new_id} changed its label")
        presentation = designed.get("presentation", {})
        if actual.get("effect-text") != presentation.get("effect_text"):
            raise VerificationError(f"replacement action {new_id} changed effect text")
        followup = presentation.get("followup")
        if followup is None:
            if actual.get("followup-title") is not None or actual.get("followup-subtitle") is not None:
                raise VerificationError(f"replacement action {new_id} added an unplanned followup")
        elif actual.get("followup-title") != followup.get("title") or actual.get("followup-subtitle") != followup.get("subtitle"):
            raise VerificationError(f"replacement action {new_id} changed followup presentation")
        effect = designed.get("effect", {})
        if actual.get("effect-kind") != effect.get("runtime_effect_kind"):
            raise VerificationError(f"replacement action {new_id} changed runtime effect kind")
        if designed.get("implementation_status") == "reuse":
            for field, expected in designed.get("expected_live_fields", {}).items():
                actual_value = actual.get(field, MISSING)
                if actual_value != expected:
                    raise VerificationError(
                        f"replacement action {new_id} changed lowered field {field}: expected {expected!r}, got {actual_value!r}"
                    )
        verified.append(card_id)
        deltas.append({
            "target_template_id": replacement["target_template_id"],
            "target_delta": 1,
            "donor_template_id": replacement["donor_template_id"],
            "donor_delta": -1,
        })
    before = {int(key): value for key, value in workset.get("template_counts_before", {}).items()}
    after = template_counts(ledger)
    aggregate: Counter[int] = Counter()
    for delta in deltas:
        aggregate[delta["target_template_id"]] += 1
        aggregate[delta["donor_template_id"]] -= 1
    for template_id, delta in aggregate.items():
        expected = before.get(template_id, 0) + delta
        if after.get(template_id, 0) != expected:
            raise VerificationError(
                f"template {template_id} count delta is wrong: expected {expected}, got {after.get(template_id, 0)}"
            )
    return {"verified_card_ids": verified, "replacement_count": len(verified), "template_deltas": deltas}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workset", required=True, type=Path)
    parser.add_argument("--exploration", type=Path, default=DEFAULT_EXPLORATION)
    parser.add_argument("--template-assignments", type=Path, default=DEFAULT_LEDGER)
    parser.add_argument("--mechanics", type=Path, default=DEFAULT_MECHANIC_IDEAS)
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    try:
        report = verify_redesigns(
            args.workset, args.exploration, args.template_assignments, args.mechanics
        )
    except (OSError, VerificationError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
