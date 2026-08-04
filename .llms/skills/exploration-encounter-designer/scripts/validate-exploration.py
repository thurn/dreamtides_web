#!/usr/bin/env python3
"""Validate Exploration encounter input and output JSON contracts."""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path
from typing import Any

import tomllib

from template_rendering import PLACEHOLDER_RE, SPECIAL_RE

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_TEMPLATE_CATALOG = REPO_ROOT / "data/templates.json"
DEFAULT_CARDS_DATA = Path(__file__).resolve().parents[4] / "data/tabula/cards.toml"
DEFAULT_DREAMSIGNS_DATA = (
    Path(__file__).resolve().parents[4] / "data/tabula/dreamsigns.toml"
)
DEFAULT_TRANSFIGURATIONS_DATA = (
    Path(__file__).resolve().parents[4] / "src/types/journey.ts"
)
WORD_RE = re.compile(r"[^\W_]+(?:['’\-][^\W_]+)*", re.UNICODE)
PROSE_PLAYER_REFERENCE_RE = re.compile(
    r"\b(?:i|me|my|mine|myself|we|us|our|ours|ourselves|"
    r"you|your|yours|yourself|yourselves|player|reader|viewer)\b",
    re.IGNORECASE,
)
STANDARD_PREDICATES = {
    "Event",
    "Warrior",
    "Spirit Animal",
    "Survivor",
    "≤2● cost Character",
}


class ValidationError(Exception):
    pass


def fail(path: str, message: str) -> None:
    raise ValidationError(f"{path}: {message}")


def require_object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(path, "must be an object")
    return value


def require_list(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        fail(path, "must be a list")
    return value


def require_string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(path, "must be a non-empty string")
    return value


def require_text(value: Any, path: str) -> str:
    if not isinstance(value, str):
        fail(path, "must be a string")
    return value


def require_int(value: Any, path: str, minimum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        fail(path, "must be an integer")
    if minimum is not None and value < minimum:
        fail(path, f"must be at least {minimum}")
    return value


def require_uuid(value: Any, path: str) -> str:
    text = require_string(value, path)
    try:
        uuid.UUID(text)
    except ValueError:
        fail(path, "must be a UUID")
    return text


def normalized_uuid(value: str) -> str:
    return str(uuid.UUID(value))


def words(value: str) -> list[str]:
    return WORD_RE.findall(value)


def load_json(path: Path) -> Any:
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as error:
        raise ValidationError(f"File does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise ValidationError(
            f"{path}:{error.lineno}:{error.colno}: {error.msg}"
        ) from error


def read_template_catalog(path: Path) -> dict[int, str]:
    try:
        data = load_json(path)
    except FileNotFoundError as error:
        raise ValidationError(f"Template catalog does not exist: {path}") from error
    entries = require_list(data, "$templates")
    templates: dict[int, str] = {}
    for index, entry in enumerate(entries):
        entry_path = f"$templates[{index}]"
        obj = require_object(entry, entry_path)
        template_id = require_int(
            obj.get("template_id"), f"{entry_path}.template_id", 1
        )
        template = require_string(obj.get("template"), f"{entry_path}.template")
        if template_id in templates:
            fail(f"{entry_path}.template_id", "must be unique")
        templates[template_id] = template
    if not templates:
        raise ValidationError(f"No templates found in {path}")
    return templates


def read_canonical_content(
    cards_path: Path, dreamsigns_path: Path
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    try:
        with cards_path.open("rb") as handle:
            cards_data = tomllib.load(handle)
        with dreamsigns_path.open("rb") as handle:
            dreamsigns_data = tomllib.load(handle)
    except FileNotFoundError as error:
        raise ValidationError(
            f"Canonical content file does not exist: {error.filename}"
        ) from error
    except tomllib.TOMLDecodeError as error:
        raise ValidationError(f"Invalid canonical TOML: {error}") from error

    cards = {
        normalized_uuid(card["id"]): card
        for card in cards_data.get("cards", [])
        if isinstance(card, dict) and isinstance(card.get("id"), str)
    }
    dreamsigns = {
        normalized_uuid(dreamsign["id"]): dreamsign
        for dreamsign in dreamsigns_data.get("dreamsign", [])
        if isinstance(dreamsign, dict) and isinstance(dreamsign.get("id"), str)
    }
    if not cards:
        raise ValidationError(f"No canonical cards found in {cards_path}")
    if not dreamsigns:
        raise ValidationError(f"No canonical dreamsigns found in {dreamsigns_path}")
    return cards, dreamsigns


def read_transfiguration_types(path: Path) -> set[str]:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValidationError(
            f"Transfiguration type source does not exist: {path}"
        ) from error
    declaration = re.search(
        r"export\s+type\s+TransfigurationType\s*=\s*(.*?);",
        text,
        flags=re.DOTALL,
    )
    if declaration is None:
        raise ValidationError(f"No TransfigurationType declaration found in {path}")
    types = set(re.findall(r'"([^"]+)"', declaration.group(1)))
    if not types:
        raise ValidationError(f"No transfiguration names found in {path}")
    return types


def validate_template_action(
    action: Any, path: str, catalog: dict[int, str]
) -> dict[str, Any]:
    obj = require_object(action, path)
    allowed_fields = {
        "label",
        "predicate_exception_rationale",
        "selection",
        "template_id",
        "variables",
    }
    for legacy_field in ("template", "effect_text"):
        if legacy_field in obj:
            fail(
                f"{path}.{legacy_field}",
                "is forbidden; canonical template text lives only in data/templates.json",
            )
    for field in obj:
        if field not in allowed_fields:
            fail(f"{path}.{field}", "is not an encounter action field")
    template_id = require_int(obj.get("template_id"), f"{path}.template_id", 1)
    if template_id not in catalog:
        fail(f"{path}.template_id", "is not present in the template catalog")
    return obj


def validate_input(
    data: Any,
    catalog: dict[int, str],
    cards: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    root = require_object(data, "$input")
    card = require_object(root.get("card"), "$input.card")
    card_id = require_uuid(card.get("id"), "$input.card.id")
    for key in ("name", "ability", "card_type"):
        require_string(card.get(key), f"$input.card.{key}")
    require_text(card.get("subtype"), "$input.card.subtype")
    require_int(card.get("image_number"), "$input.card.image_number", 1)
    canonical = cards.get(normalized_uuid(card_id))
    if canonical is None:
        fail("$input.card.id", "does not identify a canonical card")
    expected_fields = {
        "name": canonical.get("name"),
        "ability": canonical.get("rendered-text"),
        "image_number": canonical.get("image-number"),
        "card_type": canonical.get("card-type"),
        "subtype": canonical.get("subtype"),
    }
    for key, expected in expected_fields.items():
        if card.get(key) != expected:
            fail(
                f"$input.card.{key}",
                f"does not match canonical card {card_id}: expected {expected!r}",
            )

    pairs = require_list(root.get("template_pairs"), "$input.template_pairs")
    if len(pairs) != 5:
        fail("$input.template_pairs", "must contain exactly 5 pairs")
    seen_ids: set[str] = set()
    seen_template_ids: set[int] = set()
    for pair_index, pair in enumerate(pairs):
        pair_path = f"$input.template_pairs[{pair_index}]"
        pair_obj = require_object(pair, pair_path)
        pair_id = require_string(pair_obj.get("id"), f"{pair_path}.id")
        if pair_id in seen_ids:
            fail(f"{pair_path}.id", "must be unique")
        seen_ids.add(pair_id)
        actions = require_list(pair_obj.get("actions"), f"{pair_path}.actions")
        if len(actions) != 2:
            fail(f"{pair_path}.actions", "must contain exactly 2 actions")
        for action_index, action in enumerate(actions):
            action_path = f"{pair_path}.actions[{action_index}]"
            action_obj = validate_template_action(action, action_path, catalog)
            template_id = action_obj["template_id"]
            if template_id in seen_template_ids:
                fail(f"{action_path}.template_id", "must be unique across all pairs")
            seen_template_ids.add(template_id)
    if len(seen_template_ids) != 10:
        fail("$input.template_pairs", "must contain exactly 10 distinct templates")
    return root


def derive_template_pairs_from_output(input_data: Any, output_data: Any) -> dict[str, Any]:
    root = require_object(input_data, "$input")
    if "template_pairs" in root:
        fail(
            "$input.template_pairs",
            "must be omitted when deriving template pairs from the output",
        )
    events = require_list(output_data, "$output")
    pairs: list[dict[str, Any]] = []
    for event_index, event in enumerate(events):
        event_path = f"$output[{event_index}]"
        event_obj = require_object(event, event_path)
        actions = require_list(event_obj.get("actions"), f"{event_path}.actions")
        pairs.append(
            {
                "id": event_obj.get("template_pair_id"),
                "actions": [
                    {
                        "template_id": require_object(
                            action, f"{event_path}.actions[{action_index}]"
                        ).get("template_id")
                    }
                    for action_index, action in enumerate(actions)
                ],
            }
        )
    return {"card": root.get("card"), "template_pairs": pairs}


def validate_entity_reference(
    value: Any,
    path: str,
    entities: dict[str, dict[str, Any]],
    excluded_entity_id: str | None = None,
) -> None:
    obj = require_object(value, path)
    entity_id = require_uuid(obj.get("id"), f"{path}.id")
    display_name = require_string(obj.get("display_name"), f"{path}.display_name")
    normalized_entity_id = normalized_uuid(entity_id)
    canonical = entities.get(normalized_entity_id)
    if canonical is None:
        fail(f"{path}.id", "does not identify canonical content")
    if excluded_entity_id is not None and normalized_entity_id == excluded_entity_id:
        fail(f"{path}.id", "must not identify the source card")
    if display_name != canonical.get("name"):
        fail(
            f"{path}.display_name",
            f"must match canonical name {canonical.get('name')!r}",
        )


def validate_predicate(
    value: Any,
    path: str,
    predicate_exception_rationale: Any,
    rationale_path: str,
) -> str:
    predicate = require_string(value, path)
    if predicate == "Character":
        fail(
            path,
            "must not be Character; omit the selection for no constraint",
        )
    if predicate not in STANDARD_PREDICATES:
        require_string(predicate_exception_rationale, rationale_path)
    return predicate


def validate_variables(
    template: str,
    action: dict[str, Any],
    path: str,
    cards: dict[str, dict[str, Any]],
    dreamsigns: dict[str, dict[str, Any]],
    transfigurations: set[str],
    source_card_id: str,
) -> None:
    variables = require_object(action.get("variables"), f"{path}.variables")
    predicate_exception_rationale = action.get("predicate_exception_rationale")
    rationale_path = f"{path}.predicate_exception_rationale"
    for placeholder in sorted(set(PLACEHOLDER_RE.findall(template))):
        if placeholder not in variables:
            fail(f"{path}.variables", f"is missing {{{placeholder}}}")
        value = variables[placeholder]
        value_path = f"{path}.variables.{placeholder}"
        if placeholder in {"card_id", "card_name"}:
            validate_entity_reference(
                value,
                value_path,
                cards,
                excluded_entity_id=source_card_id,
            )
        elif placeholder in {"dreamsign", "dreamsign_name"}:
            validate_entity_reference(value, value_path, dreamsigns)
        elif placeholder == "transfiguration":
            transfiguration = require_string(value, value_path)
            if transfiguration not in transfigurations:
                fail(
                    value_path,
                    "must be a canonical transfiguration: "
                    + ", ".join(sorted(transfigurations)),
                )
        elif placeholder == "predicate":
            validate_predicate(
                value,
                value_path,
                predicate_exception_rationale,
                rationale_path,
            )
        elif placeholder in {
            "count",
            "essence",
            "essence1",
            "essence2",
            "essence_per_card",
            "essence_per_energy",
            "essence_per_spark",
            "energy_cost_reduction",
            "nightmare_count",
            "offer_count",
            "pack_count",
            "pack_size",
            "spark_bonus",
        }:
            require_int(value, value_path, 1)
        elif isinstance(value, (dict, list)) or value is None or value == "":
            fail(value_path, "must be a non-empty JSON primitive")

    template_placeholders = set(PLACEHOLDER_RE.findall(template))
    extra_variables = sorted(set(variables) - template_placeholders)
    if extra_variables:
        fail(
            f"{path}.variables",
            "contains values absent from the canonical template: "
            + ", ".join(extra_variables),
        )

    selection = action.get("selection")
    if selection is not None:
        selection_obj = require_object(selection, f"{path}.selection")
        template_specials = set(SPECIAL_RE.findall(template))
        for special, rule in selection_obj.items():
            if special not in template_specials:
                fail(f"{path}.selection.{special}", "is not present in the template")
            rule_obj = require_object(rule, f"{path}.selection.{special}")
            validate_predicate(
                rule_obj.get("predicate"),
                f"{path}.selection.{special}.predicate",
                predicate_exception_rationale,
                rationale_path,
            )


def validate_output(
    data: Any,
    request: dict[str, Any],
    catalog: dict[int, str],
    cards: dict[str, dict[str, Any]],
    dreamsigns: dict[str, dict[str, Any]],
    transfigurations: set[str],
) -> list[Any]:
    events = require_list(data, "$output")
    if len(events) != 5:
        fail("$output", "must contain exactly 5 events")

    source_card_id = normalized_uuid(request["card"]["id"])
    input_pairs_by_id = {pair["id"]: pair for pair in request["template_pairs"]}
    seen_pair_ids: set[str] = set()
    seen_ranks: set[int] = set()
    score_by_rank: dict[int, int] = {}
    for event_index, event in enumerate(events):
        event_path = f"$output[{event_index}]"
        event_obj = require_object(event, event_path)
        pair_id = require_string(
            event_obj.get("template_pair_id"), f"{event_path}.template_pair_id"
        )
        pair = input_pairs_by_id.get(pair_id)
        if pair is None:
            fail(
                f"{event_path}.template_pair_id",
                "must identify a template pair from the input",
            )
        if pair_id in seen_pair_ids:
            fail(f"{event_path}.template_pair_id", "must be unique in the output")
        seen_pair_ids.add(pair_id)

        prose = require_string(event_obj.get("prose"), f"{event_path}.prose")
        if len(words(prose)) > 16:
            fail(f"{event_path}.prose", "must contain at most 16 words")
        if PROSE_PLAYER_REFERENCE_RE.search(prose):
            fail(
                f"{event_path}.prose",
                "must use entity-focused third-person prose without referring "
                "to the player, reader, or viewer",
            )

        actions = require_list(event_obj.get("actions"), f"{event_path}.actions")
        if len(actions) != 2:
            fail(f"{event_path}.actions", "must contain exactly 2 actions")
        for action_index, (action, input_action) in enumerate(
            zip(actions, pair["actions"])
        ):
            action_path = f"{event_path}.actions[{action_index}]"
            action_obj = validate_template_action(action, action_path, catalog)
            if action_obj["template_id"] != input_action["template_id"]:
                fail(f"{action_path}.template_id", "must match the input action")
            label = require_string(action_obj.get("label"), f"{action_path}.label")
            label_words = words(label)
            if not 2 <= len(label_words) <= 5:
                fail(f"{action_path}.label", "must contain 2 to 5 words")
            if len(label) > 32:
                fail(f"{action_path}.label", "must contain at most 32 characters")
            validate_variables(
                catalog[action_obj["template_id"]],
                action_obj,
                action_path,
                cards,
                dreamsigns,
                transfigurations,
                source_card_id,
            )

        scores = require_object(event_obj.get("scores"), f"{event_path}.scores")
        scene_score = require_int(
            scores.get("scene_quality"),
            f"{event_path}.scores.scene_quality",
            1,
        )
        action_score = require_int(
            scores.get("action_quality"),
            f"{event_path}.scores.action_quality",
            1,
        )
        connection_score = require_int(
            scores.get("mechanical_connection"),
            f"{event_path}.scores.mechanical_connection",
            1,
        )
        archetype_score = require_int(
            scores.get("archetype_fit"), f"{event_path}.scores.archetype_fit", 1
        )
        overall = require_int(scores.get("overall"), f"{event_path}.scores.overall", 1)
        for key, value in scores.items():
            if (
                key
                in {
                    "scene_quality",
                    "action_quality",
                    "mechanical_connection",
                    "archetype_fit",
                    "overall",
                }
                and value > 10
            ):
                fail(f"{event_path}.scores.{key}", "must be at most 10")
        expected_overall = int(
            0.4 * scene_score
            + 0.15 * action_score
            + 0.3 * connection_score
            + 0.15 * archetype_score
            + 0.5
        )
        if overall != expected_overall:
            fail(
                f"{event_path}.scores.overall",
                f"must equal the rounded 40/15/30/15 weighted score ({expected_overall})",
            )

        rank = require_int(event_obj.get("rank"), f"{event_path}.rank", 1)
        if rank > 5:
            fail(f"{event_path}.rank", "must be at most 5")
        expected_rank = event_index + 1
        if rank != expected_rank:
            fail(
                f"{event_path}.rank",
                f"must equal {expected_rank}; events must be sorted by ascending rank",
            )
        if rank in seen_ranks:
            fail(f"{event_path}.rank", "must be unique")
        seen_ranks.add(rank)
        score_by_rank[rank] = overall
        rationale = require_string(
            event_obj.get("ranking_rationale"), f"{event_path}.ranking_rationale"
        )
        if len(words(rationale)) > 30:
            fail(f"{event_path}.ranking_rationale", "must contain at most 30 words")

    if seen_ranks != {1, 2, 3, 4, 5}:
        fail("$output[*].rank", "must assign every rank from 1 through 5 exactly once")
    if seen_pair_ids != set(input_pairs_by_id):
        fail("$output[*].template_pair_id", "must use every input pair exactly once")
    ordered_scores = [score_by_rank[rank] for rank in range(1, 6)]
    if ordered_scores != sorted(ordered_scores, reverse=True):
        fail("$output[*].rank", "higher overall scores must receive better ranks")
    return events


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, dest="input_path")
    parser.add_argument("--output", type=Path, dest="output_path")
    parser.add_argument(
        "--derive-template-pairs-from-output",
        action="store_true",
        help=(
            "Treat --input as a card-only request and derive the five template "
            "pairs from the exact --output file before validating both contracts."
        ),
    )
    parser.add_argument(
        "--template-catalog",
        type=Path,
        default=DEFAULT_TEMPLATE_CATALOG,
    )
    parser.add_argument("--cards-data", type=Path, default=DEFAULT_CARDS_DATA)
    parser.add_argument("--dreamsigns-data", type=Path, default=DEFAULT_DREAMSIGNS_DATA)
    parser.add_argument(
        "--transfigurations-data",
        type=Path,
        default=DEFAULT_TRANSFIGURATIONS_DATA,
    )
    args = parser.parse_args()

    try:
        catalog = read_template_catalog(args.template_catalog)
        cards, dreamsigns = read_canonical_content(
            args.cards_data, args.dreamsigns_data
        )
        transfigurations = read_transfiguration_types(args.transfigurations_data)
        input_data = load_json(args.input_path)
        output_data = (
            load_json(args.output_path) if args.output_path is not None else None
        )
        if args.derive_template_pairs_from_output:
            if output_data is None:
                fail(
                    "$output",
                    "--derive-template-pairs-from-output requires --output",
                )
            input_data = derive_template_pairs_from_output(input_data, output_data)
        request = validate_input(input_data, catalog, cards)
        if output_data is not None:
            validate_output(
                output_data,
                request,
                catalog,
                cards,
                dreamsigns,
                transfigurations,
            )
    except ValidationError as error:
        print(str(error), file=sys.stderr)
        return 1

    checked = "input and output" if args.output_path is not None else "input"
    print(f"Valid Exploration {checked}: {args.input_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
