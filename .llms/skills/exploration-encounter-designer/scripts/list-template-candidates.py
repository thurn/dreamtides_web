#!/usr/bin/env python3
"""Print the balanced template candidate catalog for one encounter-design run."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parents[3]
DEFAULT_TEMPLATE_CATALOG = REPO_ROOT / "data/templates.json"
DEFAULT_ENCOUNTER_CANDIDATES = REPO_ROOT / "data/encounter_candidates.json"
SPECIAL_VARIABLE_PATTERN = re.compile(r"\$[A-Z][A-Z0-9_]*")


class CandidateListError(ValueError):
    """Raised when source data cannot produce a trustworthy candidate list."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Print template candidates ordered by current usage, with soft warnings "
            "and temporary omissions for overused templates."
        )
    )
    parser.add_argument(
        "--template-catalog",
        type=Path,
        default=DEFAULT_TEMPLATE_CATALOG,
        help="Canonical template catalog (default: data/templates.json).",
    )
    parser.add_argument(
        "--encounter-candidates",
        type=Path,
        default=DEFAULT_ENCOUNTER_CANDIDATES,
        help=(
            "Completed encounter candidate data used for counts "
            "(default: data/encounter_candidates.json)."
        ),
    )
    parser.add_argument(
        "--required-template-count",
        type=int,
        default=10,
        help="Minimum number of selectable templates required for a run (default: 10).",
    )
    return parser.parse_args()


def load_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise CandidateListError(f"{label} does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise CandidateListError(f"{label} is not valid JSON: {path}: {error}") from error


def load_json_array(path: Path, label: str) -> list[Any]:
    value = load_json(path, label)
    if not isinstance(value, list):
        raise CandidateListError(f"{label} must contain a top-level JSON array: {path}")
    return value


def load_catalog(path: Path) -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]]]:
    raw_catalog = load_json_array(path, "Template catalog")
    catalog: list[dict[str, Any]] = []
    by_id: dict[int, dict[str, Any]] = {}

    for index, raw_entry in enumerate(raw_catalog):
        if not isinstance(raw_entry, dict):
            raise CandidateListError(f"Template catalog entry {index} must be an object")
        template_id = raw_entry.get("template_id")
        template = raw_entry.get("template")
        if not isinstance(template_id, int) or isinstance(template_id, bool):
            raise CandidateListError(
                f"Template catalog entry {index} has a non-integer template_id"
            )
        if not isinstance(template, str) or not template:
            raise CandidateListError(
                f"Template catalog entry {index} has an invalid template string"
            )
        if template_id in by_id:
            raise CandidateListError(
                f"Template catalog contains duplicate template_id {template_id}"
            )
        entry = dict(raw_entry)
        catalog.append(entry)
        by_id[template_id] = entry

    if not catalog:
        raise CandidateListError("Template catalog must contain at least one template")
    return catalog, by_id


def count_template_uses(
    path: Path, catalog_ids: set[int]
) -> tuple[int, Counter[int], Counter[int]]:
    cards = load_json(path, "Encounter candidates")
    if not isinstance(cards, dict):
        raise CandidateListError(
            f"Encounter candidates must contain a card-ID-keyed JSON object: {path}"
        )
    counts: Counter[int] = Counter()
    rank_one_counts: Counter[int] = Counter()

    for card_id, encounters in cards.items():
        if not isinstance(card_id, str) or not card_id:
            raise CandidateListError(
                "Encounter candidates keys must be non-empty card IDs"
            )
        if not isinstance(encounters, list):
            raise CandidateListError(
                f"Encounter candidates entry {card_id} must be an encounters array"
            )
        for encounter_index, raw_encounter in enumerate(encounters):
            if not isinstance(raw_encounter, dict):
                raise CandidateListError(
                    f"Encounter {card_id}:{encounter_index} must be an object"
                )
            actions = raw_encounter.get("actions")
            if not isinstance(actions, list):
                raise CandidateListError(
                    f"Encounter {card_id}:{encounter_index} must have an actions array"
                )
            rank = raw_encounter.get("rank")
            if not isinstance(rank, int) or isinstance(rank, bool):
                raise CandidateListError(
                    f"Encounter {card_id}:{encounter_index} has a non-integer rank"
                )
            for action_index, raw_action in enumerate(actions):
                if not isinstance(raw_action, dict):
                    raise CandidateListError(
                        f"Action {card_id}:{encounter_index}:{action_index} must be an object"
                    )
                template_id = raw_action.get("template_id")
                if not isinstance(template_id, int) or isinstance(template_id, bool):
                    raise CandidateListError(
                        f"Action {card_id}:{encounter_index}:{action_index} "
                        "has a non-integer template_id"
                    )
                if template_id not in catalog_ids:
                    raise CandidateListError(
                        f"Action {card_id}:{encounter_index}:{action_index} uses "
                        f"unknown template_id {template_id}"
                    )
                counts[template_id] += 1
                if rank == 1:
                    rank_one_counts[template_id] += 1

    return len(cards), counts, rank_one_counts


def build_output(
    catalog: list[dict[str, Any]],
    by_id: dict[int, dict[str, Any]],
    completed_cards: int,
    counts: Counter[int],
    rank_one_counts: Counter[int],
    required_template_count: int,
) -> dict[str, Any]:
    if required_template_count <= 0:
        raise CandidateListError("--required-template-count must be positive")
    if len(catalog) < required_template_count:
        raise CandidateListError(
            f"Template catalog has {len(catalog)} entries but a run requires "
            f"{required_template_count}"
        )

    total_uses = sum(counts.values())
    mean_uses = total_uses / len(catalog)
    minimum_uses = min(counts[template_id] for template_id in by_id)
    soft_warning_threshold = max(minimum_uses + 1, math.ceil(mean_uses))
    omission_threshold = soft_warning_threshold + 1

    total_rank_one_uses = sum(rank_one_counts.values())
    mean_rank_one_uses = total_rank_one_uses / len(catalog)
    minimum_rank_one_uses = min(
        rank_one_counts[template_id] for template_id in by_id
    )
    rank_one_soft_warning_threshold = max(
        minimum_rank_one_uses + 1, math.ceil(mean_rank_one_uses)
    )
    rank_one_omission_threshold = rank_one_soft_warning_threshold + 1

    overused_ids = {
        template_id
        for template_id in by_id
        if counts[template_id] >= omission_threshold
        or rank_one_counts[template_id] >= rank_one_omission_threshold
    }
    allowed_ids = set(by_id) - overused_ids
    reintroduced_ids: list[int] = []

    if len(allowed_ids) < required_template_count:
        needed = required_template_count - len(allowed_ids)
        reintroduced_ids = sorted(
            overused_ids,
            key=lambda template_id: (
                rank_one_counts[template_id],
                counts[template_id],
                template_id,
            ),
        )[:needed]
        allowed_ids.update(reintroduced_ids)

    omitted_ids = overused_ids - set(reintroduced_ids)
    allowed_entries = sorted(
        (by_id[template_id] for template_id in allowed_ids),
        key=lambda entry: (
            rank_one_counts[entry["template_id"]],
            counts[entry["template_id"]],
            entry["template_id"],
        ),
    )
    warning_ids = [
        entry["template_id"]
        for entry in allowed_entries
        if counts[entry["template_id"]] >= soft_warning_threshold
        or rank_one_counts[entry["template_id"]]
        >= rank_one_soft_warning_threshold
    ]
    special_variables = sorted(
        {
            token
            for entry in catalog
            for token in SPECIAL_VARIABLE_PATTERN.findall(entry["template"])
        }
    )

    return {
        "balance": {
            "completed_cards": completed_cards,
            "recorded_template_uses": total_uses,
            "catalog_template_count": len(catalog),
            "mean_uses_per_template": round(mean_uses, 3),
            "minimum_uses_per_template": minimum_uses,
            "soft_warning_threshold": soft_warning_threshold,
            "omission_threshold": omission_threshold,
            "recorded_rank_1_template_uses": total_rank_one_uses,
            "mean_rank_1_uses_per_template": round(mean_rank_one_uses, 3),
            "minimum_rank_1_uses_per_template": minimum_rank_one_uses,
            "rank_1_soft_warning_threshold": rank_one_soft_warning_threshold,
            "rank_1_omission_threshold": rank_one_omission_threshold,
            "required_template_count": required_template_count,
            "soft_warning_guidance": (
                "Prefer fewer prior rank-1 uses first and fewer total uses second "
                "when templates fit comparably well. A warned template remains "
                "selectable when it is materially stronger."
            ),
            "soft_warnings": [
                {
                    "template_id": template_id,
                    "usage_count": counts[template_id],
                    "rank_1_usage_count": rank_one_counts[template_id],
                    "reasons": [
                        reason
                        for reason, applies in (
                            (
                                "rank_1",
                                rank_one_counts[template_id]
                                >= rank_one_soft_warning_threshold,
                            ),
                            (
                                "overall",
                                counts[template_id] >= soft_warning_threshold,
                            ),
                        )
                        if applies
                    ],
                }
                for template_id in warning_ids
            ],
            "omitted_templates": [
                {
                    "template_id": template_id,
                    "usage_count": counts[template_id],
                    "rank_1_usage_count": rank_one_counts[template_id],
                    "reasons": [
                        reason
                        for reason, applies in (
                            (
                                "rank_1",
                                rank_one_counts[template_id]
                                >= rank_one_omission_threshold,
                            ),
                            (
                                "overall",
                                counts[template_id] >= omission_threshold,
                            ),
                        )
                        if applies
                    ],
                }
                for template_id in sorted(
                    omitted_ids,
                    key=lambda item: (-rank_one_counts[item], -counts[item], item),
                )
            ],
            "reintroduced_to_preserve_minimum_pool": [
                {
                    "template_id": template_id,
                    "usage_count": counts[template_id],
                    "rank_1_usage_count": rank_one_counts[template_id],
                }
                for template_id in reintroduced_ids
            ],
        },
        "special_variables": special_variables,
        "templates": allowed_entries,
    }


def main() -> int:
    args = parse_args()
    try:
        catalog, by_id = load_catalog(args.template_catalog)
        completed_cards, counts, rank_one_counts = count_template_uses(
            args.encounter_candidates, set(by_id)
        )
        output = build_output(
            catalog,
            by_id,
            completed_cards,
            counts,
            rank_one_counts,
            args.required_template_count,
        )
    except (CandidateListError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
