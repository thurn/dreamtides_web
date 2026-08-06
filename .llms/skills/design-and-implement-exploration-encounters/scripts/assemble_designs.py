#!/usr/bin/env python3
"""Validate design winners and atomically render scratch TOML and display Markdown."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tomllib
import uuid
from pathlib import Path
from typing import Any

from select_batch import canonical_uuid, sha256


PLACEHOLDER_RE = re.compile(r"\{([a-z][a-z0-9_]*)\}")
SPECIAL_RE = re.compile(r"\$[A-Z][A-Z0-9_]*")
WORD_RE = re.compile(r"[^\W_]+(?:['’\-][^\W_]+)*", re.UNICODE)
PLAYER_REFERENCE_RE = re.compile(
    r"\b(?:i|me|my|mine|myself|we|us|our|ours|ourselves|you|your|yours|"
    r"yourself|yourselves|player|reader|viewer)\b",
    re.IGNORECASE,
)
DEFINITE_ARTICLE_RE = re.compile(r"\bthe\b", re.IGNORECASE)
ONE_INTRO_RE = re.compile(r"^\s*one\b", re.IGNORECASE)
STANDARD_PREDICATES = {
    "Event",
    "Warrior",
    "Spirit Animal",
    "Survivor",
    "≤2● cost Character",
}
SUPPORTED_SPECIALS = {"$OFFERED_CARD", "$DECK_CARD", "$STARTER_CARD"}
ENTITY_VARIABLES = {"card_id", "card_name"}
DREAMSIGN_VARIABLES = {"dreamsign", "dreamsign_name"}
IMPLEMENTATION_NOTE_KEYS = {
    "state_transition",
    "offer_or_selection",
    "persisted_result",
    "outcome",
}


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


def load_templates(path: Path) -> dict[int, str]:
    raw = require_list(load_json(path, "Template catalog"), "$templates")
    templates: dict[int, str] = {}
    for index, value in enumerate(raw):
        entry = require_object(value, f"$templates[{index}]")
        template_id = require_int(entry.get("template_id"), f"$templates[{index}].template_id")
        template = require_string(entry.get("template"), f"$templates[{index}].template")
        if template_id in templates:
            fail(f"$templates[{index}].template_id", "must be unique")
        templates[template_id] = template
    return templates


def load_canonical_entities(path: Path, array_key: str, label: str) -> dict[str, dict[str, Any]]:
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
        entity_id = canonical_uuid(
            value["id"], f"{label}[{index}].id", require_lowercase=False
        )
        if entity_id in entities:
            raise AssemblyError(f"{label} contains duplicate UUID {entity_id}")
        entities[entity_id] = value
    if not entities:
        raise AssemblyError(f"{label} contains no canonical entities")
    return entities


def load_transfigurations(path: Path) -> set[str]:
    try:
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise AssemblyError(f"Journey type source does not exist: {path}") from error
    declaration = re.search(
        r"export\s+type\s+TransfigurationType\s*=\s*(.*?);",
        source,
        flags=re.DOTALL,
    )
    if declaration is None:
        raise AssemblyError(f"No TransfigurationType union found in {path}")
    values = set(re.findall(r'"([^"]+)"', declaration.group(1)))
    if not values:
        raise AssemblyError(f"TransfigurationType is empty in {path}")
    return values


def validate_entity_reference(
    value: Any,
    path: str,
    entities: dict[str, dict[str, Any]],
    *,
    source_card_id: str | None = None,
) -> None:
    reference = require_object(value, path)
    if set(reference) != {"id", "display_name"}:
        fail(path, "must contain exactly id and display_name")
    entity_id = canonical_uuid(reference.get("id"), f"{path}.id", require_lowercase=False)
    display_name = require_string(reference.get("display_name"), f"{path}.display_name")
    canonical = entities.get(entity_id)
    if canonical is None:
        fail(f"{path}.id", "does not identify canonical content")
    if source_card_id is not None and entity_id == source_card_id:
        fail(f"{path}.id", "must not identify the source card")
    if display_name != canonical.get("name"):
        fail(f"{path}.display_name", f"must equal {canonical.get('name')!r}")


def validate_predicate(value: Any, path: str, rationale: Any, rationale_path: str) -> None:
    predicate = require_string(value, path)
    if predicate == "Character":
        fail(path, "must not be Character; omit an unrestricted selection")
    if predicate not in STANDARD_PREDICATES:
        require_string(rationale, rationale_path)


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
    placeholders = set(PLACEHOLDER_RE.findall(template))
    if set(variables) != placeholders:
        missing = sorted(placeholders - set(variables))
        extra = sorted(set(variables) - placeholders)
        details = []
        if missing:
            details.append(f"missing {missing}")
        if extra:
            details.append(f"unexpected {extra}")
        fail(f"{path}.variables", "; ".join(details))

    rationale = action.get("predicate_exception_rationale")
    for name, value in variables.items():
        value_path = f"{path}.variables.{name}"
        if name in ENTITY_VARIABLES:
            validate_entity_reference(
                value, value_path, cards, source_card_id=source_card_id
            )
        elif name in DREAMSIGN_VARIABLES:
            validate_entity_reference(value, value_path, dreamsigns)
        elif name == "transfiguration":
            transfiguration = require_string(value, value_path)
            if transfiguration not in transfigurations:
                fail(value_path, "must be a canonical transfiguration")
        elif name == "predicate":
            validate_predicate(
                value,
                value_path,
                rationale,
                f"{path}.predicate_exception_rationale",
            )
        elif isinstance(value, bool) or not isinstance(value, (str, int, float)):
            fail(value_path, "must be a JSON string or number")

    specials = set(SPECIAL_RE.findall(template))
    unknown_specials = specials - SUPPORTED_SPECIALS
    if unknown_specials:
        fail(path, f"uses undocumented special variables {sorted(unknown_specials)}")
    selection = action.get("selection")
    if selection is not None:
        selection_object = require_object(selection, f"{path}.selection")
        if not selection_object:
            fail(f"{path}.selection", "must be omitted when empty")
        for token, raw_rule in selection_object.items():
            if token not in specials:
                fail(f"{path}.selection.{token}", "is not a special variable in the template")
            rule = require_object(raw_rule, f"{path}.selection.{token}")
            if set(rule) != {"predicate"}:
                fail(f"{path}.selection.{token}", "must contain exactly predicate")
            validate_predicate(
                rule.get("predicate"),
                f"{path}.selection.{token}.predicate",
                rationale,
                f"{path}.predicate_exception_rationale",
            )

    has_nonstandard = any(
        name == "predicate" and value not in STANDARD_PREDICATES
        for name, value in variables.items()
    ) or any(
        rule.get("predicate") not in STANDARD_PREDICATES
        for rule in (selection or {}).values()
        if isinstance(rule, dict)
    )
    if "predicate_exception_rationale" in action and not has_nonstandard:
        fail(
            f"{path}.predicate_exception_rationale",
            "must be omitted when every predicate is standard",
        )


def display_variable(value: Any, path: str) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (str, int, float)):
        return str(value)
    if isinstance(value, dict):
        display_name = value.get("display_name")
        if isinstance(display_name, str) and display_name.strip():
            return display_name
    fail(path, "cannot be rendered as template text")


def render_template(template: str, variables: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        return display_variable(variables[name], f"variables.{name}")

    return PLACEHOLDER_RE.sub(replace, template)


def validate_result(
    raw: Any,
    manifest_entry: dict[str, Any],
    templates: dict[int, str],
    cards: dict[str, dict[str, Any]],
    dreamsigns: dict[str, dict[str, Any]],
    transfigurations: set[str],
) -> dict[str, Any]:
    card = require_object(manifest_entry.get("card"), "$manifest.card")
    source_card_id = canonical_uuid(card.get("id"), "$manifest.card.id")
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
    result_card_id = canonical_uuid(result.get("card_id"), f"$result[{source_card_id}].card_id")
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

    actions = require_list(result.get("actions"), f"$result[{source_card_id}].actions")
    if len(actions) != 2:
        fail(f"$result[{source_card_id}].actions", "must contain exactly two actions")
    validated_actions = []
    seen_template_ids: set[int] = set()
    for index, raw_action in enumerate(actions):
        path = f"$result[{source_card_id}].actions[{index}]"
        action = require_object(raw_action, path)
        allowed_action = {
            "label",
            "template_id",
            "variables",
            "selection",
            "predicate_exception_rationale",
            "implementation_notes",
        }
        forbidden = {"template", "effect_text", "effect-kind", "effect_kind"}
        for key in action:
            if key in forbidden:
                fail(f"{path}.{key}", "is forbidden; canonical wording and runtime kinds are assigned later")
            if key not in allowed_action:
                fail(f"{path}.{key}", "is not an allowed design field")
        label = require_string(action.get("label"), f"{path}.label")
        if not 2 <= len(words(label)) <= 5:
            fail(f"{path}.label", "must contain 2 to 5 words")
        if len(label) > 32:
            fail(f"{path}.label", "must contain at most 32 characters")
        template_id = require_int(action.get("template_id"), f"{path}.template_id")
        template = templates.get(template_id)
        if template is None:
            fail(f"{path}.template_id", "is not in data/templates.json")
        if template_id in seen_template_ids:
            fail(f"{path}.template_id", "must differ from the other action")
        seen_template_ids.add(template_id)
        validate_variables(
            template,
            action,
            path,
            cards,
            dreamsigns,
            transfigurations,
            source_card_id,
        )
        notes = require_object(action.get("implementation_notes"), f"{path}.implementation_notes")
        if set(notes) != IMPLEMENTATION_NOTE_KEYS:
            fail(
                f"{path}.implementation_notes",
                f"must contain exactly {sorted(IMPLEMENTATION_NOTE_KEYS)}",
            )
        for key in sorted(IMPLEMENTATION_NOTE_KEYS):
            require_string(notes.get(key), f"{path}.implementation_notes.{key}")
        validated_actions.append(action)

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
        rejected_because = require_string(
            alternative.get("rejected_because"), f"{path}.rejected_because"
        )
        if "\n" in summary or len(words(summary)) > 12:
            fail(f"{path}.summary", "must be one line containing at most 12 words")
        if "\n" in rejected_because or len(words(rejected_because)) > 20:
            fail(
                f"{path}.rejected_because",
                "must be one line containing at most 20 words",
            )
        normalized_summary = summary.casefold()
        if normalized_summary in seen_summaries:
            fail(f"{path}.summary", "must be distinct")
        seen_summaries.add(normalized_summary)

    return {**result, "actions": validated_actions}


def toml_key(key: str) -> str:
    return key if re.fullmatch(r"[A-Za-z0-9_-]+", key) else json.dumps(key)


def toml_value(value: Any, path: str = "value") -> str:
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, list):
        return "[" + ", ".join(toml_value(entry, path) for entry in value) + "]"
    if isinstance(value, dict):
        fields = [
            f"{toml_key(str(key))} = {toml_value(entry, f'{path}.{key}')}"
            for key, entry in value.items()
        ]
        return "{}" if not fields else "{ " + ", ".join(fields) + " }"
    fail(path, "cannot be represented in TOML")


def render_workset(
    manifest_entries: list[dict[str, Any]],
    results: dict[str, dict[str, Any]],
    templates: dict[int, str],
) -> str:
    lines = [
        "# Validated winning Exploration designs.",
        "# Scratch authoring scaffold: runtime effect fields are intentionally pending.",
        "# Do not commit this file or copy it wholesale over the live catalog.",
    ]
    for entry in manifest_entries:
        card = entry["card"]
        card_id = card["id"]
        result = results[card_id]
        lines.extend(
            [
                "",
                "[[encounter]]",
                f"card-id = {toml_value(card_id)}",
                f"prose = {toml_value(result['prose'])}",
            ]
        )
        for action in result["actions"]:
            template_id = action["template_id"]
            action_id = f"{card_id}:template-{template_id}"
            lines.extend(
                [
                    "",
                    "[[encounter.action]]",
                    f"id = {toml_value(action_id)}",
                    f"label = {toml_value(action['label'])}",
                    f"effect-text = {toml_value(render_template(templates[template_id], action['variables']))}",
                    f"template-id = {template_id}",
                    f"template-variables = {toml_value(action['variables'], 'template-variables')}",
                ]
            )
            if "selection" in action:
                lines.append(f"selection = {toml_value(action['selection'], 'selection')}")
    return "\n".join(lines) + "\n"


def render_display(
    manifest_entries: list[dict[str, Any]],
    results: dict[str, dict[str, Any]],
    templates: dict[int, str],
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
            effect = render_template(templates[action["template_id"]], action["variables"])
            lines.append(f"- ***{action['label']}*** — {effect}")
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
    if manifest.get("schema_version") != 1:
        fail("$manifest.schema_version", "must equal 1")
    repository_raw = require_object(manifest.get("repository"), "$manifest.repository")
    digests = require_object(manifest.get("source_sha256"), "$manifest.source_sha256")
    required_sources = {"cards", "dreamsigns", "exploration", "templates", "journey_types"}
    if set(repository_raw) != required_sources or set(digests) != required_sources:
        fail("$manifest.repository", f"must describe exactly {sorted(required_sources)}")
    repository = {key: Path(require_string(repository_raw[key], f"$manifest.repository.{key}")) for key in required_sources}
    for key, path in repository.items():
        actual = sha256(path)
        if actual != digests[key]:
            fail(f"$manifest.source_sha256.{key}", f"source changed after selection: {path}")

    manifest_entries = require_list(manifest.get("cards"), "$manifest.cards")
    if not manifest_entries:
        fail("$manifest.cards", "must not be empty")
    templates = load_templates(repository["templates"])
    cards = load_canonical_entities(repository["cards"], "cards", "Card catalog")
    dreamsigns = load_canonical_entities(repository["dreamsigns"], "dreamsign", "Dreamsign catalog")
    transfigurations = load_transfigurations(repository["journey_types"])

    expected_ids: list[str] = []
    for index, entry_value in enumerate(manifest_entries):
        entry = require_object(entry_value, f"$manifest.cards[{index}]")
        card = require_object(entry.get("card"), f"$manifest.cards[{index}].card")
        card_id = canonical_uuid(card.get("id"), f"$manifest.cards[{index}].card.id")
        if card_id in expected_ids:
            fail(f"$manifest.cards[{index}].card.id", "must be unique")
        expected_ids.append(card_id)
        art_path = Path(require_string(entry.get("art_path"), f"$manifest.cards[{index}].art_path"))
        if sha256(art_path) != require_string(entry.get("art_sha256"), f"$manifest.cards[{index}].art_sha256"):
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
    for entry_value in manifest_entries:
        entry = require_object(entry_value, "$manifest.cards[]")
        card = require_object(entry.get("card"), "$manifest.cards[].card")
        card_id = canonical_uuid(card.get("id"), "$manifest.cards[].card.id")
        result_path = results_dir / f"{card_id}.json"
        results[card_id] = validate_result(
            load_json(result_path, f"Result for {card_id}"),
            entry,
            templates,
            cards,
            dreamsigns,
            transfigurations,
        )

    workset = render_workset(manifest_entries, results, templates)
    display = render_display(manifest_entries, results, templates)
    atomic_write(workset_output, workset)
    atomic_write(display_output, display)
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
