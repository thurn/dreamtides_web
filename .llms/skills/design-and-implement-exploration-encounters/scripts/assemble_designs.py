#!/usr/bin/env python3
"""Validate Exploration winners and atomically render JSON workset and Markdown."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tomllib
from pathlib import Path
from typing import Any

from mechanic_ideas import (
    MechanicCatalogError,
    action_effect_schema,
    load_mechanic_catalog,
    mechanics_by_id,
)
from select_batch import SOURCE_KEYS, SelectionError, canonical_uuid, sha256


WORD_RE = re.compile(r"[^\W_]+(?:['’\-][^\W_]+)*", re.UNICODE)
PLAYER_REFERENCE_RE = re.compile(
    r"\b(?:i|me|my|mine|myself|we|us|our|ours|ourselves|you|your|yours|"
    r"yourself|yourselves|player|reader|viewer)\b",
    re.IGNORECASE,
)
DEFINITE_ARTICLE_RE = re.compile(r"\bthe\b", re.IGNORECASE)
ONE_INTRO_RE = re.compile(r"^\s*one\b", re.IGNORECASE)
SNAKE_CASE_RE = re.compile(r"^[a-z][a-z0-9_]*$")
PRESENTATION_SLOT_RE = re.compile(r"\{[a-z][a-z0-9_]*\}")
IMPLEMENTATION_NOTE_KEYS = {
    "state_transition",
    "offer_or_selection",
    "persisted_result",
    "outcome",
}
STANDARD_PREDICATES = {
    "CheapCharacter",
    "Survivor",
    "SpiritAnimal",
    "Character",
    "Warrior",
    "Event",
}
PREDICATE_COMPAT = {
    "CheapCharacter": "cheap-character",
    "Survivor": "survivor",
    "SpiritAnimal": "spirit-animal",
    "Character": "character",
    "Warrior": "warrior",
    "Event": "event",
}
TARGET_COMPAT = {"Chosen": "chosen", "Offered": "offered"}


class AssemblyError(ValueError):
    """Raised when a batch cannot be assembled atomically."""


def fail(path: str, message: str) -> None:
    raise AssemblyError(f"{path}: {message}")


def words(value: str) -> list[str]:
    return WORD_RE.findall(value)


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


def require_int(value: Any, path: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        fail(path, "must be an integer")
    return value


def load_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise AssemblyError(f"{label} does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise AssemblyError(
            f"{label} is invalid JSON: {path}:{error.lineno}:{error.colno}"
        ) from error


def load_canonical_entities(
    path: Path,
    array_key: str,
    label: str,
) -> dict[str, dict[str, Any]]:
    try:
        with path.open("rb") as handle:
            document = tomllib.load(handle)
    except FileNotFoundError as error:
        raise AssemblyError(f"{label} does not exist: {path}") from error
    except tomllib.TOMLDecodeError as error:
        raise AssemblyError(f"{label} is invalid TOML: {path}: {error}") from error
    entities: dict[str, dict[str, Any]] = {}
    for index, value in enumerate(document.get(array_key, [])):
        if not isinstance(value, dict) or not isinstance(value.get("id"), str):
            continue
        try:
            entity_id = canonical_uuid(
                value["id"], f"{label}[{index}].id", require_lowercase=False
            )
        except SelectionError as error:
            raise AssemblyError(str(error)) from error
        if entity_id in entities:
            raise AssemblyError(f"{label} contains duplicate UUID {entity_id}")
        entities[entity_id] = value
    if not entities:
        raise AssemblyError(f"{label} contains no canonical entities")
    return entities


def load_transfigurations(path: Path) -> set[str]:
    try:
        with path.open("rb") as handle:
            document = tomllib.load(handle)
    except FileNotFoundError as error:
        raise AssemblyError(f"Transfiguration catalog does not exist: {path}") from error
    except tomllib.TOMLDecodeError as error:
        raise AssemblyError(f"Transfiguration catalog is invalid TOML: {path}: {error}") from error
    forms = document.get("forms", [])
    values = {
        form["id"]
        for form in forms
        if isinstance(form, dict) and isinstance(form.get("id"), str)
    }
    if not values:
        raise AssemblyError(f"Transfiguration catalog contains no forms: {path}")
    return values


def validate_effect_value(value: Any, path: str) -> None:
    if value is None or isinstance(value, (str, bool, int, float)):
        return
    if isinstance(value, list):
        for index, entry in enumerate(value):
            if not isinstance(entry, (str, bool, int, float)) or entry is None:
                fail(f"{path}[{index}]", "must be a JSON scalar")
        return
    fail(path, "must be null, a JSON scalar, or a list of JSON scalars")


def validate_known_references(
    fields: dict[str, Any],
    path: str,
    *,
    cards: dict[str, dict[str, Any]],
    dreamsigns: dict[str, dict[str, Any]],
    transfigurations: set[str],
    source_card_id: str,
) -> None:
    if "card_id" in fields:
        try:
            card_id = canonical_uuid(fields["card_id"], f"{path}.card_id")
        except SelectionError as error:
            raise AssemblyError(str(error)) from error
        if card_id not in cards:
            fail(f"{path}.card_id", "does not identify a canonical card")
        if card_id == source_card_id:
            fail(f"{path}.card_id", "must not identify the source card")
    if "dreamsign_id" in fields:
        try:
            dreamsign_id = canonical_uuid(fields["dreamsign_id"], f"{path}.dreamsign_id")
        except SelectionError as error:
            raise AssemblyError(str(error)) from error
        if dreamsign_id not in dreamsigns:
            fail(f"{path}.dreamsign_id", "does not identify a canonical Dreamsign")
    if "transfiguration" in fields and fields["transfiguration"] not in transfigurations:
        fail(f"{path}.transfiguration", "must identify a canonical transfiguration form")


def compat_fields(fields: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key, value in fields.items():
        if value is None:
            continue
        compat_key = "deck-target" if key == "target" else key.replace("_", "-")
        if key == "predicate":
            value = PREDICATE_COMPAT.get(value, value)
        elif key == "target":
            value = TARGET_COMPAT.get(value, value)
        output[compat_key] = value
    return output


def validate_result(
    raw: Any,
    manifest_entry: dict[str, Any],
    mechanics: dict[int, dict[str, Any]],
    model_schema: dict[str, set[str]],
    cards: dict[str, dict[str, Any]],
    dreamsigns: dict[str, dict[str, Any]],
    transfigurations: set[str],
) -> dict[str, Any]:
    card = require_object(manifest_entry.get("card"), "$manifest.card")
    try:
        source_card_id = canonical_uuid(card.get("id"), "$manifest.card.id")
    except SelectionError as error:
        raise AssemblyError(str(error)) from error
    result = require_object(raw, f"$result[{source_card_id}]")
    allowed_root = {
        "card_id",
        "prose",
        "actions",
        "selection_rationale",
        "alternatives_considered",
    }
    if set(result) != allowed_root:
        fail(f"$result[{source_card_id}]", f"must contain exactly {sorted(allowed_root)}")
    try:
        result_card_id = canonical_uuid(
            result.get("card_id"), f"$result[{source_card_id}].card_id"
        )
    except SelectionError as error:
        raise AssemblyError(str(error)) from error
    if result_card_id != source_card_id:
        fail(f"$result[{source_card_id}].card_id", "must match the request UUID")

    prose = require_string(result.get("prose"), f"$result[{source_card_id}].prose")
    if len(words(prose)) > 16:
        fail(f"$result[{source_card_id}].prose", "must contain at most 16 words")
    if PLAYER_REFERENCE_RE.search(prose):
        fail(f"$result[{source_card_id}].prose", "must not refer to a player, reader, or viewer")
    if DEFINITE_ARTICLE_RE.search(prose):
        fail(f"$result[{source_card_id}].prose", "must not use the word 'the'")
    if ONE_INTRO_RE.search(prose):
        fail(f"$result[{source_card_id}].prose", "must not begin with 'one'")

    requested_action_ids = require_list(
        manifest_entry.get("action_ids"), f"$manifest.cards[{source_card_id}].action_ids"
    )
    if len(requested_action_ids) != 2:
        fail(f"$manifest.cards[{source_card_id}].action_ids", "must contain exactly two UUIDs")
    actions = require_list(result.get("actions"), f"$result[{source_card_id}].actions")
    if len(actions) != 2:
        fail(f"$result[{source_card_id}].actions", "must contain exactly two actions")

    validated_actions: list[dict[str, Any]] = []
    seen_mechanic_ids: set[int] = set()
    for index, raw_action in enumerate(actions):
        path = f"$result[{source_card_id}].actions[{index}]"
        action = require_object(raw_action, path)
        allowed_action = {
            "action_id",
            "label",
            "mechanic_id",
            "presentation",
            "effect",
            "predicate_exception_rationale",
            "implementation_notes",
        }
        if not set(action).issubset(allowed_action):
            fail(path, f"contains unsupported fields {sorted(set(action) - allowed_action)}")
        required_action = allowed_action - {"predicate_exception_rationale"}
        if not required_action.issubset(action):
            fail(path, f"is missing fields {sorted(required_action - set(action))}")

        try:
            action_id = canonical_uuid(
                action.get("action_id"), f"{path}.action_id", require_v4=True
            )
            requested_id = canonical_uuid(
                requested_action_ids[index],
                f"$manifest.cards[{source_card_id}].action_ids[{index}]",
                require_v4=True,
            )
        except SelectionError as error:
            raise AssemblyError(str(error)) from error
        if action_id != requested_id:
            fail(f"{path}.action_id", "must equal the pre-minted request UUID at this position")

        label = require_string(action.get("label"), f"{path}.label")
        if not 2 <= len(words(label)) <= 5:
            fail(f"{path}.label", "must contain 2 to 5 words")
        if len(label) > 32:
            fail(f"{path}.label", "must contain at most 32 characters")

        mechanic_id = require_int(action.get("mechanic_id"), f"{path}.mechanic_id")
        mechanic = mechanics.get(mechanic_id)
        if mechanic is None:
            fail(f"{path}.mechanic_id", "is absent from the mechanic idea catalog")
        if mechanic_id in seen_mechanic_ids:
            fail(f"{path}.mechanic_id", "must differ from the other action")
        seen_mechanic_ids.add(mechanic_id)

        presentation = require_object(action.get("presentation"), f"{path}.presentation")
        if set(presentation) != {"effect_text", "followup"}:
            fail(f"{path}.presentation", "must contain exactly effect_text and followup")
        effect_text = require_string(
            presentation.get("effect_text"), f"{path}.presentation.effect_text"
        )
        followup = presentation.get("followup")
        if followup is not None:
            followup = require_object(followup, f"{path}.presentation.followup")
            if set(followup) != {"title", "subtitle"}:
                fail(f"{path}.presentation.followup", "must contain exactly title and subtitle")
            require_string(followup.get("title"), f"{path}.presentation.followup.title")
            require_string(followup.get("subtitle"), f"{path}.presentation.followup.subtitle")

        effect = require_object(action.get("effect"), f"{path}.effect")
        if set(effect) != {"variant", "fields", "runtime_effect_kind"}:
            fail(f"{path}.effect", "must contain exactly variant, fields, and runtime_effect_kind")
        variant = require_string(effect.get("variant"), f"{path}.effect.variant")
        runtime_effect_kind = require_string(
            effect.get("runtime_effect_kind"), f"{path}.effect.runtime_effect_kind"
        )
        fields = require_object(effect.get("fields"), f"{path}.effect.fields")
        for field_name, field_value in fields.items():
            if not isinstance(field_name, str) or not SNAKE_CASE_RE.fullmatch(field_name):
                fail(f"{path}.effect.fields", "field names must use snake_case")
            validate_effect_value(field_value, f"{path}.effect.fields.{field_name}")
        implementation = mechanic["implementation"]
        if implementation["status"] == "reuse":
            if variant != implementation["effect_variant"]:
                fail(
                    f"{path}.effect.variant",
                    f"must equal {implementation['effect_variant']} for mechanic {mechanic_id}",
                )
            if runtime_effect_kind != implementation["runtime_effect_kind"]:
                fail(
                    f"{path}.effect.runtime_effect_kind",
                    f"must equal {implementation['runtime_effect_kind']} for mechanic {mechanic_id}",
                )
            if set(fields) != model_schema[variant]:
                fail(
                    f"{path}.effect.fields",
                    f"must contain exactly {sorted(model_schema[variant])} for {variant}",
                )
        validate_known_references(
            fields,
            f"{path}.effect.fields",
            cards=cards,
            dreamsigns=dreamsigns,
            transfigurations=transfigurations,
            source_card_id=source_card_id,
        )
        allowed_presentation_slots: set[str] = set()
        required_presentation_slots: set[str] = set()
        if runtime_effect_kind == "gain-offered-card":
            allowed_presentation_slots.add("{offered_card}")
            required_presentation_slots.add("{offered_card}")
        if fields.get("target") == "Offered":
            allowed_presentation_slots.add("{deck_card}")
            required_presentation_slots.add("{deck_card}")
        if "card_id" in fields:
            allowed_presentation_slots.add("{fixed_card}")
            required_presentation_slots.add("{fixed_card}")
        if runtime_effect_kind in {
            "gain-nightmare-and-card",
            "reduce-cost-all-and-gain-nightmares",
        }:
            allowed_presentation_slots.add("{nightmare_card}")
            required_presentation_slots.add("{nightmare_card}")
        presentation_slots = set(PRESENTATION_SLOT_RE.findall(effect_text))
        unsupported_slots = presentation_slots - allowed_presentation_slots
        if unsupported_slots:
            fail(
                f"{path}.presentation.effect_text",
                f"contains unsupported presentation slots {sorted(unsupported_slots)}",
            )
        missing_slots = required_presentation_slots - presentation_slots
        if missing_slots:
            fail(
                f"{path}.presentation.effect_text",
                f"must present {', '.join(sorted(missing_slots))}",
            )

        predicate = fields.get("predicate")
        rationale = action.get("predicate_exception_rationale")
        if isinstance(predicate, str) and predicate not in STANDARD_PREDICATES:
            require_string(rationale, f"{path}.predicate_exception_rationale")
        elif "predicate_exception_rationale" in action:
            fail(
                f"{path}.predicate_exception_rationale",
                "must be omitted unless a nonstandard predicate is proposed",
            )

        notes = require_object(action.get("implementation_notes"), f"{path}.implementation_notes")
        if set(notes) != IMPLEMENTATION_NOTE_KEYS:
            fail(
                f"{path}.implementation_notes",
                f"must contain exactly {sorted(IMPLEMENTATION_NOTE_KEYS)}",
            )
        for key in sorted(IMPLEMENTATION_NOTE_KEYS):
            require_string(notes.get(key), f"{path}.implementation_notes.{key}")

        validated = dict(action)
        validated["implementation_status"] = implementation["status"]
        if implementation["status"] == "reuse":
            validated["expected_live_fields"] = compat_fields(fields)
        validated_actions.append(validated)

    rationale = require_string(
        result.get("selection_rationale"), f"$result[{source_card_id}].selection_rationale"
    )
    if len(words(rationale)) > 40:
        fail(f"$result[{source_card_id}].selection_rationale", "must contain at most 40 words")

    alternatives = require_list(
        result.get("alternatives_considered"),
        f"$result[{source_card_id}].alternatives_considered",
    )
    if len(alternatives) != 4:
        fail(f"$result[{source_card_id}].alternatives_considered", "must contain exactly four alternatives")
    seen_summaries: set[str] = set()
    for index, raw_alternative in enumerate(alternatives):
        path = f"$result[{source_card_id}].alternatives_considered[{index}]"
        alternative = require_object(raw_alternative, path)
        if set(alternative) != {"summary", "rejected_because"}:
            fail(path, "must contain exactly summary and rejected_because")
        summary = require_string(alternative.get("summary"), f"{path}.summary")
        rejected = require_string(alternative.get("rejected_because"), f"{path}.rejected_because")
        if "\n" in summary or len(words(summary)) > 12:
            fail(f"{path}.summary", "must be one line containing at most 12 words")
        if "\n" in rejected or len(words(rejected)) > 20:
            fail(f"{path}.rejected_because", "must be one line containing at most 20 words")
        normalized = summary.casefold()
        if normalized in seen_summaries:
            fail(f"{path}.summary", "must be distinct")
        seen_summaries.add(normalized)

    return {**result, "actions": validated_actions}


def render_workset(
    manifest_entries: list[dict[str, Any]],
    results: dict[str, dict[str, Any]],
) -> str:
    encounters = []
    for entry in manifest_entries:
        card_id = entry["card"]["id"]
        result = results[card_id]
        encounters.append(
            {
                "card_id": card_id,
                "prose": result["prose"],
                "actions": result["actions"],
            }
        )
    return json.dumps(
        {
            "schema_version": 2,
            "purpose": "Validated scratch contract for implementation in data/exploration.ron.",
            "encounters": encounters,
        },
        ensure_ascii=False,
        indent=2,
    ) + "\n"


def render_display(
    manifest_entries: list[dict[str, Any]],
    results: dict[str, dict[str, Any]],
) -> str:
    sections = []
    for entry in manifest_entries:
        card = entry["card"]
        result = results[card["id"]]
        lines = [
            f"# {card['name']}",
            "",
            card["ability"],
            "",
            f"![Source artwork for {card['name']}](<{entry['art_path']}>)",
            "",
            result["prose"],
        ]
        for action in result["actions"]:
            lines.append(
                f"- ***{action['label']}*** — {action['presentation']['effect_text']}"
            )
        sections.append("\n".join(lines))
    return "\n\n".join(sections) + "\n"


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def assemble(
    *,
    manifest_path: Path,
    results_dir: Path,
    workset_output: Path,
    display_output: Path,
) -> dict[str, Any]:
    manifest = require_object(load_json(manifest_path, "Manifest"), "$manifest")
    if manifest.get("schema_version") != 2:
        fail("$manifest.schema_version", "must equal 2")
    repository_raw = require_object(manifest.get("repository"), "$manifest.repository")
    digests = require_object(manifest.get("source_sha256"), "$manifest.source_sha256")
    if set(repository_raw) != set(SOURCE_KEYS) or set(digests) != set(SOURCE_KEYS):
        fail("$manifest.repository", f"must describe exactly {sorted(SOURCE_KEYS)}")
    repository = {
        key: Path(require_string(repository_raw[key], f"$manifest.repository.{key}"))
        for key in SOURCE_KEYS
    }
    for key, path in repository.items():
        try:
            actual = sha256(path)
        except SelectionError as error:
            raise AssemblyError(str(error)) from error
        if actual != digests[key]:
            fail(f"$manifest.source_sha256.{key}", f"source changed after selection: {path}")

    try:
        catalog = load_mechanic_catalog(
            repository["mechanic_ideas"], model_path=repository["exploration_model"]
        )
        model_schema = action_effect_schema(repository["exploration_model"])
    except MechanicCatalogError as error:
        raise AssemblyError(str(error)) from error
    mechanics = mechanics_by_id(catalog)
    cards = load_canonical_entities(repository["cards_compat"], "cards", "Card catalog")
    dreamsigns = load_canonical_entities(
        repository["dreamsigns_compat"], "dreamsign", "Dreamsign catalog"
    )
    transfigurations = load_transfigurations(repository["transfiguration_compat"])

    manifest_entries = require_list(manifest.get("cards"), "$manifest.cards")
    if not manifest_entries:
        fail("$manifest.cards", "must not be empty")
    expected_ids: list[str] = []
    for index, entry_value in enumerate(manifest_entries):
        entry = require_object(entry_value, f"$manifest.cards[{index}]")
        card = require_object(entry.get("card"), f"$manifest.cards[{index}].card")
        try:
            card_id = canonical_uuid(card.get("id"), f"$manifest.cards[{index}].card.id")
        except SelectionError as error:
            raise AssemblyError(str(error)) from error
        if card_id in expected_ids:
            fail(f"$manifest.cards[{index}].card.id", "must be unique")
        expected_ids.append(card_id)
        art_path = Path(require_string(entry.get("art_path"), f"$manifest.cards[{index}].art_path"))
        if sha256(art_path) != require_string(
            entry.get("art_sha256"), f"$manifest.cards[{index}].art_sha256"
        ):
            fail(f"$manifest.cards[{index}].art_sha256", "art changed after selection")

    if not results_dir.is_dir():
        raise AssemblyError(f"Results directory does not exist: {results_dir}")
    actual_files = {path.name for path in results_dir.glob("*.json") if path.is_file()}
    expected_files = {f"{card_id}.json" for card_id in expected_ids}
    if actual_files != expected_files:
        missing = sorted(expected_files - actual_files)
        extra = sorted(actual_files - expected_files)
        raise AssemblyError(f"Result files do not match manifest; missing={missing}, extra={extra}")

    results: dict[str, dict[str, Any]] = {}
    for entry in manifest_entries:
        card_id = entry["card"]["id"]
        results[card_id] = validate_result(
            load_json(results_dir / f"{card_id}.json", f"Result for {card_id}"),
            entry,
            mechanics,
            model_schema,
            cards,
            dreamsigns,
            transfigurations,
        )

    atomic_write(workset_output, render_workset(manifest_entries, results))
    atomic_write(display_output, render_display(manifest_entries, results))
    return {
        "workset": str(workset_output.resolve()),
        "display": str(display_output.resolve()),
        "card_ids": expected_ids,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--results-dir", required=True, type=Path)
    parser.add_argument("--workset-output", required=True, type=Path)
    parser.add_argument("--display-output", required=True, type=Path)
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    try:
        report = assemble(
            manifest_path=args.manifest,
            results_dir=args.results_dir,
            workset_output=args.workset_output,
            display_output=args.display_output,
        )
    except (AssemblyError, OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
