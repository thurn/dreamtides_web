#!/usr/bin/env python3
"""Print the balanced template candidate catalog for one encounter-design run."""

from __future__ import annotations

import argparse
import json
import math
import sys
import tomllib
from collections import Counter
from pathlib import Path
from typing import Any

from template_rendering import PLACEHOLDER_RE, SPECIAL_RE


SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parents[3]
DEFAULT_TEMPLATE_CATALOG = REPO_ROOT / "data/templates.json"
DEFAULT_EXPLORATION_DATA = REPO_ROOT / "data/exploration.toml"
UNIQUE_EFFECT_BALANCE_CLASS = "unique_effect"
SUPPORTED_BALANCE_CLASSES = {UNIQUE_EFFECT_BALANCE_CLASS}


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
        "--exploration-data",
        type=Path,
        default=DEFAULT_EXPLORATION_DATA,
        help=(
            "Production encounter TOML used for prevalence counts "
            "(default: data/exploration.toml)."
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
        balance_class = raw_entry.get("balance_class")
        if not isinstance(template_id, int) or isinstance(template_id, bool):
            raise CandidateListError(
                f"Template catalog entry {index} has a non-integer template_id"
            )
        if not isinstance(template, str) or not template:
            raise CandidateListError(
                f"Template catalog entry {index} has an invalid template string"
            )
        if balance_class is not None and balance_class not in SUPPORTED_BALANCE_CLASSES:
            raise CandidateListError(
                f"Template catalog entry {index} has unsupported balance_class "
                f"{balance_class!r}"
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


def load_toml(path: Path, label: str) -> dict[str, Any]:
    try:
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise CandidateListError(f"{label} does not exist: {path}") from error
    try:
        return tomllib.loads(source)
    except tomllib.TOMLDecodeError as error:
        raise CandidateListError(
            f"{label} is not valid TOML: {path}: {error}"
        ) from error


def count_template_uses(
    path: Path, catalog_ids: set[int]
) -> tuple[int, Counter[int]]:
    exploration = load_toml(path, "Production exploration data")
    encounters = exploration.get("encounter", [])
    if not isinstance(encounters, list):
        raise CandidateListError(
            f"Production exploration data must contain an encounter array: {path}"
        )
    counts: Counter[int] = Counter()

    for encounter_index, raw_encounter in enumerate(encounters):
        if not isinstance(raw_encounter, dict):
            raise CandidateListError(
                f"Production encounter {encounter_index} must be a table"
            )
        card_id = raw_encounter.get("card-id")
        if not isinstance(card_id, str) or not card_id:
            raise CandidateListError(
                f"Production encounter {encounter_index} must have a non-empty card-id"
            )
        actions = raw_encounter.get("action")
        if not isinstance(actions, list):
            raise CandidateListError(
                f"Production encounter {card_id}:{encounter_index} must have "
                "an action array"
            )
        for action_index, raw_action in enumerate(actions):
            if not isinstance(raw_action, dict):
                raise CandidateListError(
                    f"Production action {card_id}:{encounter_index}:{action_index} "
                    "must be a table"
                )
            template_id = raw_action.get("template-id")
            if not isinstance(template_id, int) or isinstance(template_id, bool):
                raise CandidateListError(
                    f"Production action {card_id}:{encounter_index}:{action_index} "
                    "has a non-integer template-id"
                )
            if template_id not in catalog_ids:
                raise CandidateListError(
                    f"Production action {card_id}:{encounter_index}:{action_index} uses "
                    f"unknown template-id {template_id}"
                )
            counts[template_id] += 1

    return len(encounters), counts


def build_output(
    catalog: list[dict[str, Any]],
    by_id: dict[int, dict[str, Any]],
    production_encounters: int,
    counts: Counter[int],
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
    unique_effect_omission_threshold = soft_warning_threshold

    def is_unique_effect(template_id: int) -> bool:
        return (
            by_id[template_id].get("balance_class")
            == UNIQUE_EFFECT_BALANCE_CLASS
        )

    def overall_omission_threshold_for(template_id: int) -> int:
        if is_unique_effect(template_id):
            return unique_effect_omission_threshold
        return omission_threshold

    overused_ids = {
        template_id
        for template_id in by_id
        if counts[template_id] >= overall_omission_threshold_for(template_id)
    }
    allowed_ids = set(by_id) - overused_ids
    reintroduced_ids: list[int] = []

    if len(allowed_ids) < required_template_count:
        needed = required_template_count - len(allowed_ids)
        reintroduced_ids = sorted(
            overused_ids,
            key=lambda template_id: (
                counts[template_id],
                template_id,
            ),
        )[:needed]
        allowed_ids.update(reintroduced_ids)

    omitted_ids = overused_ids - set(reintroduced_ids)
    allowed_entries = sorted(
        (by_id[template_id] for template_id in allowed_ids),
        key=lambda entry: (
            counts[entry["template_id"]],
            entry["template_id"],
        ),
    )
    warning_ids = [
        entry["template_id"]
        for entry in allowed_entries
        if counts[entry["template_id"]] >= soft_warning_threshold
    ]
    warning_id_set = set(warning_ids)
    reintroduced_id_set = set(reintroduced_ids)

    def authoring_entry(entry: dict[str, Any]) -> dict[str, Any]:
        template = entry["template"]
        return {
            **entry,
            "required_variables": sorted(set(PLACEHOLDER_RE.findall(template))),
            "special_variables": sorted(set(SPECIAL_RE.findall(template))),
        }

    def reasons_for(template_id: int, *, omitted: bool) -> list[str]:
        threshold = (
            overall_omission_threshold_for(template_id)
            if omitted
            else soft_warning_threshold
        )
        return ["production"] if counts[template_id] >= threshold else []

    template_diagnostics = []
    for entry in catalog:
        template_id = entry["template_id"]
        if template_id in omitted_ids:
            status = "hidden"
            reasons = reasons_for(template_id, omitted=True)
        elif template_id in reintroduced_id_set:
            status = "reintroduced"
            reasons = reasons_for(template_id, omitted=True)
        elif template_id in warning_id_set:
            status = "warning"
            reasons = reasons_for(template_id, omitted=False)
        elif counts[template_id] == 0:
            status = "unused"
            reasons = []
        else:
            status = "available"
            reasons = []
        template_diagnostics.append(
            {
                **authoring_entry(entry),
                "usage_count": counts[template_id],
                "status": status,
                "reasons": reasons,
            }
        )
    special_variables = sorted(
        {
            token
            for entry in catalog
            for token in SPECIAL_RE.findall(entry["template"])
        }
    )

    return {
        "balance": {
            "production_encounters": production_encounters,
            "recorded_template_uses": total_uses,
            "catalog_template_count": len(catalog),
            "mean_uses_per_template": round(mean_uses, 3),
            "minimum_uses_per_template": minimum_uses,
            "soft_warning_threshold": soft_warning_threshold,
            "omission_threshold": omission_threshold,
            "unique_effect_omission_threshold": unique_effect_omission_threshold,
            "required_template_count": required_template_count,
            "soft_warning_guidance": (
                "Production prevalence is authoritative. Prefer fewer prior "
                "production uses when templates fit comparably well. A warned "
                "template remains selectable when it is materially stronger. "
                "Templates tagged unique_effect hide one use earlier and should "
                "be selected only for a very strong card-specific fit."
            ),
            "soft_warnings": [
                {
                    "template_id": template_id,
                    "usage_count": counts[template_id],
                    "reasons": reasons_for(template_id, omitted=False),
                }
                for template_id in warning_ids
            ],
            "omitted_templates": [
                {
                    "template_id": template_id,
                    "usage_count": counts[template_id],
                    "reasons": reasons_for(template_id, omitted=True),
                }
                for template_id in sorted(
                    omitted_ids,
                    key=lambda item: (-counts[item], item),
                )
            ],
            "reintroduced_to_preserve_minimum_pool": [
                {
                    "template_id": template_id,
                    "usage_count": counts[template_id],
                }
                for template_id in reintroduced_ids
            ],
        },
        "template_diagnostics": template_diagnostics,
        "special_variables": special_variables,
        "templates": [authoring_entry(entry) for entry in allowed_entries],
    }


def main() -> int:
    args = parse_args()
    try:
        catalog, by_id = load_catalog(args.template_catalog)
        production_encounters, counts = count_template_uses(
            args.exploration_data, set(by_id)
        )
        output = build_output(
            catalog,
            by_id,
            production_encounters,
            counts,
            args.required_template_count,
        )
    except (CandidateListError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
