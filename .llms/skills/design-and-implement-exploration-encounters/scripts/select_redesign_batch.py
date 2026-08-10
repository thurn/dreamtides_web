#!/usr/bin/env python3
"""Create immutable one-action Exploration redesign requests from an explicit plan."""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
import uuid
from pathlib import Path
from typing import Any

from mechanic_ideas import MechanicCatalogError, load_mechanic_catalog, mechanics_by_id
from select_batch import (
    DEFAULT_CARDS_COMPAT,
    DEFAULT_CARDS_SOURCE,
    DEFAULT_DREAMSIGNS_COMPAT,
    DEFAULT_DREAMSIGNS_SOURCE,
    DEFAULT_EFFECT_SCHEMA,
    DEFAULT_EXPLORATION_COMPAT,
    DEFAULT_EXPLORATION_MODEL,
    DEFAULT_EXPLORATION_SOURCE,
    DEFAULT_IMAGES_DIR,
    DEFAULT_MECHANIC_IDEAS,
    DEFAULT_TRANSFIGURATION_COMPAT,
    DEFAULT_TRANSFIGURATION_SOURCE,
    SOURCE_KEYS,
    SelectionError,
    canonical_uuid,
    find_art,
    load_cards,
    sha256,
    write_json,
)
from template_assignments import DEFAULT_LEDGER, load_ledger, template_counts


class RedesignSelectionError(ValueError):
    """Raised when a redesign plan cannot produce immutable requests."""


def load_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RedesignSelectionError(f"{label} does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise RedesignSelectionError(
            f"{label} is invalid JSON: {path}:{error.lineno}:{error.colno}"
        ) from error


def load_live_encounters(path: Path) -> dict[str, dict[str, Any]]:
    try:
        with path.open("rb") as handle:
            document = tomllib.load(handle)
    except (FileNotFoundError, tomllib.TOMLDecodeError) as error:
        raise RedesignSelectionError(f"Cannot read generated Exploration: {path}: {error}") from error
    output: dict[str, dict[str, Any]] = {}
    for index, encounter in enumerate(document.get("encounter", [])):
        if not isinstance(encounter, dict):
            raise RedesignSelectionError(f"encounter[{index}] must be a table")
        try:
            card_id = canonical_uuid(
                encounter.get("card-id"), f"encounter[{index}].card-id", require_lowercase=False
            )
        except SelectionError as error:
            raise RedesignSelectionError(str(error)) from error
        if card_id in output:
            raise RedesignSelectionError(f"duplicate live encounter UUID {card_id}")
        actions = encounter.get("action")
        if not isinstance(actions, list) or len(actions) != 2:
            continue
        output[card_id] = encounter
    return output


def create_redesign_batch(
    *,
    run_dir: Path,
    plan_path: Path,
    source_paths: dict[str, Path],
    images_dir: Path,
    template_assignments_path: Path = DEFAULT_LEDGER,
) -> dict[str, Any]:
    if not run_dir.is_dir() or any(run_dir.iterdir()):
        raise RedesignSelectionError(f"--run-dir must be an existing empty directory: {run_dir}")
    if set(source_paths) != set(SOURCE_KEYS):
        raise RedesignSelectionError(f"source paths must contain exactly {sorted(SOURCE_KEYS)}")
    resolved = {key: path.resolve() for key, path in source_paths.items()}
    try:
        catalog = load_mechanic_catalog(
            resolved["mechanic_ideas"], model_path=resolved["exploration_model"]
        )
    except MechanicCatalogError as error:
        raise RedesignSelectionError(str(error)) from error
    mechanics = mechanics_by_id(catalog)
    cards = {card["id"]: card for card in load_cards(resolved["cards_compat"])}
    encounters = load_live_encounters(resolved["exploration_compat"])
    ledger_path = template_assignments_path.resolve()
    try:
        ledger = load_ledger(
            ledger_path,
            exploration_path=resolved["exploration_compat"],
            mechanic_path=resolved["mechanic_ideas"],
        )
    except ValueError as error:
        raise RedesignSelectionError(str(error)) from error
    ledger_by_action = {value["action_id"]: value for value in ledger["assignments"]}

    plan = load_json(plan_path, "Redesign plan")
    if not isinstance(plan, dict) or set(plan) != {"schema_version", "assignments"}:
        raise RedesignSelectionError("Redesign plan must contain schema_version and assignments")
    if plan["schema_version"] != 1:
        raise RedesignSelectionError("Redesign plan schema_version must equal 1")
    assignments = plan["assignments"]
    if not isinstance(assignments, list) or not assignments:
        raise RedesignSelectionError("Redesign plan assignments must be a non-empty list")

    requests_dir = run_dir / "requests"
    results_dir = run_dir / "results"
    requests_dir.mkdir()
    results_dir.mkdir()
    repository = {key: str(path) for key, path in resolved.items()}
    seen_cards: set[str] = set()
    manifest_assignments = []
    for assignment_index, raw in enumerate(assignments):
        if not isinstance(raw, dict) or set(raw) != {"target_template_id", "candidates"}:
            raise RedesignSelectionError(
                f"assignments[{assignment_index}] must contain target_template_id and candidates"
            )
        target_id = raw["target_template_id"]
        if isinstance(target_id, bool) or not isinstance(target_id, int) or target_id not in mechanics:
            raise RedesignSelectionError(f"assignments[{assignment_index}] has unknown target template")
        candidates = raw["candidates"]
        if not isinstance(candidates, list) or len(candidates) not in {2, 3}:
            raise RedesignSelectionError(
                f"assignments[{assignment_index}].candidates must contain two or three candidates"
            )
        assignment_id = f"template-{target_id}-assignment-{assignment_index + 1}"
        replacement_action_id = str(uuid.uuid4())
        request_candidates = []
        for candidate_index, candidate in enumerate(candidates):
            if not isinstance(candidate, dict) or set(candidate) != {
                "card_id",
                "replace_action_id",
                "donor_template_id",
            }:
                raise RedesignSelectionError(
                    f"assignments[{assignment_index}].candidates[{candidate_index}] has invalid fields"
                )
            try:
                card_id = canonical_uuid(candidate["card_id"], "candidate.card_id")
                action_id = canonical_uuid(
                    candidate["replace_action_id"], "candidate.replace_action_id", require_v4=True
                )
            except SelectionError as error:
                raise RedesignSelectionError(str(error)) from error
            donor_id = candidate["donor_template_id"]
            if isinstance(donor_id, bool) or not isinstance(donor_id, int) or donor_id not in mechanics:
                raise RedesignSelectionError(f"candidate donor template {donor_id!r} is unknown")
            if card_id in seen_cards:
                raise RedesignSelectionError(f"card UUID {card_id} appears more than once in the batch")
            seen_cards.add(card_id)
            if card_id not in cards or card_id not in encounters:
                raise RedesignSelectionError(f"candidate card UUID {card_id} is not a live canonical card")
            encounter = encounters[card_id]
            actions = encounter["action"]
            if action_id not in {action.get("id") for action in actions}:
                raise RedesignSelectionError(
                    f"action UUID {action_id} is not in live encounter {card_id}"
                )
            ledger_assignment = ledger_by_action.get(action_id)
            if ledger_assignment is None or ledger_assignment["template_id"] != donor_id:
                raise RedesignSelectionError(
                    f"candidate donor template {donor_id} does not match ledger assignment for {action_id}"
                )
            art_path = find_art(cards[card_id]["image_number"], images_dir.resolve())
            request_candidates.append(
                {
                    "card": cards[card_id],
                    "art_path": str(art_path),
                    "art_sha256": sha256(art_path),
                    "encounter": encounter,
                    "replace_action_id": action_id,
                    "donor_template_id": donor_id,
                }
            )
        request = {
            "schema_version": 1,
            "assignment_id": assignment_id,
            "target_template": mechanics[target_id],
            "replacement_action_id": replacement_action_id,
            "candidates": request_candidates,
            "repository": repository,
            "template_assignments": str(ledger_path),
        }
        request_path = requests_dir / f"{assignment_id}.json"
        write_json(request_path, request)
        manifest_assignments.append(request)

    manifest = {
        "schema_version": 1,
        "repository": repository,
        "source_sha256": {key: sha256(path) for key, path in resolved.items()},
        "template_assignments": str(ledger_path),
        "template_assignments_sha256": sha256(ledger_path),
        "template_counts_before": {str(key): value for key, value in sorted(template_counts(ledger).items())},
        "assignments": manifest_assignments,
    }
    manifest_path = run_dir / "manifest.json"
    write_json(manifest_path, manifest)
    return {
        "manifest": str(manifest_path.resolve()),
        "requests_dir": str(requests_dir.resolve()),
        "results_dir": str(results_dir.resolve()),
        "assignment_ids": [value["assignment_id"] for value in manifest_assignments],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--cards-source", type=Path, default=DEFAULT_CARDS_SOURCE)
    parser.add_argument("--cards-compat", type=Path, default=DEFAULT_CARDS_COMPAT)
    parser.add_argument("--dreamsigns-source", type=Path, default=DEFAULT_DREAMSIGNS_SOURCE)
    parser.add_argument("--dreamsigns-compat", type=Path, default=DEFAULT_DREAMSIGNS_COMPAT)
    parser.add_argument("--exploration-source", type=Path, default=DEFAULT_EXPLORATION_SOURCE)
    parser.add_argument("--exploration-compat", type=Path, default=DEFAULT_EXPLORATION_COMPAT)
    parser.add_argument("--transfiguration-source", type=Path, default=DEFAULT_TRANSFIGURATION_SOURCE)
    parser.add_argument("--transfiguration-compat", type=Path, default=DEFAULT_TRANSFIGURATION_COMPAT)
    parser.add_argument("--mechanic-ideas", type=Path, default=DEFAULT_MECHANIC_IDEAS)
    parser.add_argument("--exploration-model", type=Path, default=DEFAULT_EXPLORATION_MODEL)
    parser.add_argument("--effect-schema", type=Path, default=DEFAULT_EFFECT_SCHEMA)
    parser.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    parser.add_argument("--template-assignments", type=Path, default=DEFAULT_LEDGER)
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    source_paths = {
        "cards_source": args.cards_source,
        "cards_compat": args.cards_compat,
        "dreamsigns_source": args.dreamsigns_source,
        "dreamsigns_compat": args.dreamsigns_compat,
        "exploration_source": args.exploration_source,
        "exploration_compat": args.exploration_compat,
        "transfiguration_source": args.transfiguration_source,
        "transfiguration_compat": args.transfiguration_compat,
        "mechanic_ideas": args.mechanic_ideas,
        "exploration_model": args.exploration_model,
        "effect_schema": args.effect_schema,
    }
    try:
        report = create_redesign_batch(
            run_dir=args.run_dir,
            plan_path=args.plan,
            source_paths=source_paths,
            images_dir=args.images_dir.expanduser(),
            template_assignments_path=args.template_assignments,
        )
    except (OSError, RedesignSelectionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
