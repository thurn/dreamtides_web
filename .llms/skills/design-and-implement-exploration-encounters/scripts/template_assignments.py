#!/usr/bin/env python3
"""Audit and update the canonical Exploration action-to-template assignment ledger."""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from collections import Counter
from pathlib import Path
from typing import Any

from mechanic_ideas import load_mechanic_catalog, mechanics_by_id
from select_batch import DEFAULT_EXPLORATION_COMPAT, DEFAULT_MECHANIC_IDEAS, canonical_uuid, sha256


SCRIPTS_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPTS_DIR.parent
DEFAULT_LEDGER = SKILL_DIR / "references/template-assignments.json"


class AssignmentLedgerError(ValueError):
    """Raised when the assignment ledger and live Exploration disagree."""


def write_ledger(path: Path, document: dict[str, Any]) -> None:
    """Keep one assignment per line so redesign batches produce reviewable diffs."""
    lines = [
        "{",
        f'  "schema_version": {document["schema_version"]},',
        f'  "exploration_sha256": {json.dumps(document["exploration_sha256"])},',
        '  "assignments": [',
    ]
    assignments = document["assignments"]
    for index, assignment in enumerate(assignments):
        comma = "," if index + 1 < len(assignments) else ""
        lines.append(f"    {json.dumps(assignment, separators=(',', ':'))}{comma}")
    lines.extend(["  ]", "}"])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_exploration(path: Path) -> list[dict[str, Any]]:
    try:
        with path.open("rb") as handle:
            document = tomllib.load(handle)
    except (FileNotFoundError, tomllib.TOMLDecodeError) as error:
        raise AssignmentLedgerError(f"Cannot read generated Exploration {path}: {error}") from error
    encounters = document.get("encounter")
    if not isinstance(encounters, list):
        raise AssignmentLedgerError("Generated Exploration must contain encounter tables")
    return encounters


def classify_legacy_action(action: dict[str, Any]) -> int:
    """Recover the semantic source-template assignment for the pre-ledger catalog."""
    kind = action.get("effect-kind")
    count = action.get("count", 1)
    predicate = action.get("predicate")
    direct = {
        "replace-selected": 7,
        "gain-card": 10,
        "take-cards": 16,
        "gain-dreamsign": 27,
        "gain-random-dreamsign": 28,
        "choose-pack": 36,
        "transfigure-next-draft-or-shop": 37,
        "next-battle-opening-hand": 38,
        "next-battle-starting-energy": 39,
        "replace-selected-with-card": 47,
        "copy-selected-cards": 51,
        "copy-offered-deck-card": 55,
        "choose-avatar": 57,
        "change-subtype-selected": 58,
        "gain-essence-per-card": 59,
        "purge-for-essence": 60,
        "purge-and-copy": 61,
        "purge-dreamsign-for-essence": 62,
        "increase-spark-all": 64,
        "reduce-cost-all-and-gain-nightmares": 65,
        "make-fast-all": 66,
        "change-subtype-all": 67,
        "gain-nightmare-and-card": 70,
        "transfigure-all-for-essence": 73,
        "purge-random-subtype-and-increase-spark": 74,
        "purge-duplicates-and-grant-reclaim": 79,
        "next-battle-smaller-hand-and-cost-discount": 81,
        "transfigured-card-draft": 83,
        "add-site": 84,
    }
    if kind in direct:
        return direct[kind]
    if kind == "purge-selected":
        return 6 if count > 1 and predicate else 5 if count > 1 else 4 if predicate else 3
    if kind == "gain-random-cards":
        return 13 if count > 1 else 9
    if kind == "gain-offered-card":
        return 12 if count > 1 else 11
    if kind == "draft-card":
        return 15 if count > 1 else 14
    if kind == "transfigure-selected":
        return 20 if count > 1 else 17
    if kind == "transfigure-fixed-selected":
        if action.get("deck-target") == "offered":
            return 19
        return 21 if predicate else 18
    if kind == "copy-selected-card":
        return 49 if action.get("deck-target") == "offered" else 50
    raise AssignmentLedgerError(
        f"Cannot recover a source template for action {action.get('id')} with effect-kind {kind!r}"
    )


def bootstrap_document(exploration_path: Path) -> dict[str, Any]:
    assignments = []
    for encounter in load_exploration(exploration_path):
        card_id = canonical_uuid(encounter.get("card-id"), "encounter.card-id", require_lowercase=False)
        for action in encounter.get("action", []):
            assignments.append(
                {
                    "action_id": canonical_uuid(action.get("id"), "action.id", require_v4=True),
                    "card_id": card_id,
                    "template_id": classify_legacy_action(action),
                }
            )
    return {
        "schema_version": 1,
        "exploration_sha256": sha256(exploration_path),
        "assignments": assignments,
    }


def load_ledger(
    ledger_path: Path,
    *,
    exploration_path: Path,
    mechanic_path: Path = DEFAULT_MECHANIC_IDEAS,
    require_current_hash: bool = True,
) -> dict[str, Any]:
    try:
        document = json.loads(ledger_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as error:
        raise AssignmentLedgerError(f"Cannot read template assignment ledger {ledger_path}: {error}") from error
    if not isinstance(document, dict) or set(document) != {"schema_version", "exploration_sha256", "assignments"}:
        raise AssignmentLedgerError("Assignment ledger has an invalid root contract")
    if document["schema_version"] != 1 or not isinstance(document["assignments"], list):
        raise AssignmentLedgerError("Assignment ledger schema_version must equal 1 and assignments must be a list")
    if require_current_hash and document["exploration_sha256"] != sha256(exploration_path):
        raise AssignmentLedgerError("Assignment ledger is stale for generated Exploration")
    mechanic_ids = set(mechanics_by_id(load_mechanic_catalog(mechanic_path)))
    live_actions: dict[str, str] = {}
    for encounter in load_exploration(exploration_path):
        card_id = canonical_uuid(encounter.get("card-id"), "encounter.card-id", require_lowercase=False)
        for action in encounter.get("action", []):
            action_id = canonical_uuid(action.get("id"), "action.id", require_v4=True)
            if action_id in live_actions:
                raise AssignmentLedgerError(f"duplicate live action UUID {action_id}")
            live_actions[action_id] = card_id
    by_action: dict[str, dict[str, Any]] = {}
    for index, assignment in enumerate(document["assignments"]):
        if not isinstance(assignment, dict) or set(assignment) != {"action_id", "card_id", "template_id"}:
            raise AssignmentLedgerError(f"assignments[{index}] has invalid fields")
        action_id = canonical_uuid(assignment["action_id"], f"assignments[{index}].action_id", require_v4=True)
        card_id = canonical_uuid(assignment["card_id"], f"assignments[{index}].card_id")
        if action_id in by_action:
            raise AssignmentLedgerError(f"duplicate ledger action UUID {action_id}")
        if assignment["template_id"] not in mechanic_ids:
            raise AssignmentLedgerError(f"assignment {action_id} uses unknown template {assignment['template_id']}")
        if require_current_hash and live_actions.get(action_id) != card_id:
            raise AssignmentLedgerError(f"assignment {action_id} does not match its live card UUID")
        by_action[action_id] = assignment
    if require_current_hash:
        missing = sorted(set(live_actions) - set(by_action))
        extra = sorted(set(by_action) - set(live_actions))
        if missing or extra:
            raise AssignmentLedgerError(f"ledger/live action mismatch; missing={missing}, extra={extra}")
    return document


def template_counts(document: dict[str, Any]) -> dict[int, int]:
    return dict(Counter(assignment["template_id"] for assignment in document["assignments"]))


def apply_workset(
    *, ledger_path: Path, workset_path: Path, exploration_path: Path, mechanic_path: Path
) -> dict[str, Any]:
    ledger = load_ledger(
        ledger_path,
        exploration_path=exploration_path,
        mechanic_path=mechanic_path,
        require_current_hash=False,
    )
    try:
        workset = json.loads(workset_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as error:
        raise AssignmentLedgerError(f"Cannot read redesign workset {workset_path}: {error}") from error
    assignments = {value["action_id"]: dict(value) for value in ledger["assignments"]}
    for replacement in workset.get("replacements", []):
        old_id = replacement["replaced_action"]["id"]
        old = assignments.pop(old_id, None)
        if old is None or old["template_id"] != replacement["donor_template_id"]:
            raise AssignmentLedgerError(f"workset donor assignment does not match ledger for {old_id}")
        new_id = replacement["replacement_action"]["action_id"]
        assignments[new_id] = {
            "action_id": new_id,
            "card_id": replacement["card_id"],
            "template_id": replacement["target_template_id"],
        }
    updated = {
        "schema_version": 1,
        "exploration_sha256": sha256(exploration_path),
        "assignments": list(assignments.values()),
    }
    temporary = ledger_path.with_suffix(".updated.json")
    write_ledger(temporary, updated)
    load_ledger(temporary, exploration_path=exploration_path, mechanic_path=mechanic_path)
    temporary.replace(ledger_path)
    return updated


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", type=Path, default=DEFAULT_LEDGER)
    parser.add_argument("--exploration", type=Path, default=DEFAULT_EXPLORATION_COMPAT)
    parser.add_argument("--mechanics", type=Path, default=DEFAULT_MECHANIC_IDEAS)
    parser.add_argument("--bootstrap", action="store_true")
    parser.add_argument("--apply-workset", type=Path)
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    try:
        if args.bootstrap:
            write_ledger(args.ledger, bootstrap_document(args.exploration))
        elif args.apply_workset:
            apply_workset(
                ledger_path=args.ledger,
                workset_path=args.apply_workset,
                exploration_path=args.exploration,
                mechanic_path=args.mechanics,
            )
        document = load_ledger(
            args.ledger, exploration_path=args.exploration, mechanic_path=args.mechanics
        )
    except (AssignmentLedgerError, OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    counts = template_counts(document)
    print(json.dumps({
        "action_count": len(document["assignments"]),
        "represented_template_count": len(counts),
        "counts": {str(key): counts[key] for key in sorted(counts)},
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
