#!/usr/bin/env python3
"""Validate assigned one-action redesigns and render an immutable implementation workset."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from assemble_designs import (
    IMPLEMENTATION_NOTE_KEYS,
    SNAKE_CASE_RE,
    STANDARD_PREDICATES,
    AssemblyError,
    atomic_write,
    compat_fields,
    load_canonical_entities,
    load_json,
    load_transfigurations,
    require_int,
    require_list,
    require_object,
    require_string,
    validate_effect_value,
    validate_known_references,
    words,
)
from mechanic_ideas import MechanicCatalogError, action_effect_schema, load_mechanic_catalog, mechanics_by_id
from select_batch import SOURCE_KEYS, SelectionError, canonical_uuid, sha256
from template_assignments import load_ledger


def fail(path: str, message: str) -> None:
    raise AssemblyError(f"{path}: {message}")


def validate_replacement_action(
    raw: Any,
    *,
    assignment: dict[str, Any],
    selected_card_id: str,
    mechanics: dict[int, dict[str, Any]],
    model_schema: dict[str, set[str]],
    cards: dict[str, dict[str, Any]],
    dreamsigns: dict[str, dict[str, Any]],
    transfigurations: set[str],
) -> dict[str, Any]:
    path = f"$result[{assignment['assignment_id']}].replacement_action"
    action = require_object(raw, path)
    required = {"action_id", "label", "mechanic_id", "presentation", "effect", "implementation_notes"}
    optional = {"predicate_exception_rationale"}
    if not required.issubset(action) or not set(action).issubset(required | optional):
        fail(path, f"must contain required fields {sorted(required)} and only supported optional fields")
    try:
        action_id = canonical_uuid(action.get("action_id"), f"{path}.action_id", require_v4=True)
        requested_id = canonical_uuid(
            assignment.get("replacement_action_id"), "$assignment.replacement_action_id", require_v4=True
        )
    except SelectionError as error:
        raise AssemblyError(str(error)) from error
    if action_id != requested_id:
        fail(f"{path}.action_id", "must equal the pre-minted replacement UUID")
    label = require_string(action.get("label"), f"{path}.label")
    if not 2 <= len(words(label)) <= 5 or len(label) > 32:
        fail(f"{path}.label", "must contain 2-5 words and at most 32 characters")
    mechanic_id = require_int(action.get("mechanic_id"), f"{path}.mechanic_id")
    target_id = assignment["target_template"]["id"]
    if mechanic_id != target_id:
        fail(f"{path}.mechanic_id", f"must equal assigned template {target_id}; substitution is forbidden")
    mechanic = mechanics[mechanic_id]

    presentation = require_object(action.get("presentation"), f"{path}.presentation")
    if set(presentation) != {"effect_text", "followup"}:
        fail(f"{path}.presentation", "must contain exactly effect_text and followup")
    require_string(presentation.get("effect_text"), f"{path}.presentation.effect_text")
    if presentation.get("followup") is not None:
        followup = require_object(presentation["followup"], f"{path}.presentation.followup")
        if set(followup) != {"title", "subtitle"}:
            fail(f"{path}.presentation.followup", "must contain exactly title and subtitle")
        require_string(followup.get("title"), f"{path}.presentation.followup.title")
        require_string(followup.get("subtitle"), f"{path}.presentation.followup.subtitle")

    effect = require_object(action.get("effect"), f"{path}.effect")
    if set(effect) != {"variant", "fields", "runtime_effect_kind"}:
        fail(f"{path}.effect", "must contain exactly variant, fields, and runtime_effect_kind")
    variant = require_string(effect.get("variant"), f"{path}.effect.variant")
    runtime_kind = require_string(effect.get("runtime_effect_kind"), f"{path}.effect.runtime_effect_kind")
    fields = require_object(effect.get("fields"), f"{path}.effect.fields")
    for key, value in fields.items():
        if not isinstance(key, str) or not SNAKE_CASE_RE.fullmatch(key):
            fail(f"{path}.effect.fields", "field names must use snake_case")
        validate_effect_value(value, f"{path}.effect.fields.{key}")
    implementation = mechanic["implementation"]
    if implementation["status"] == "reuse":
        if variant != implementation["effect_variant"]:
            fail(f"{path}.effect.variant", f"must equal {implementation['effect_variant']}")
        if runtime_kind != implementation["runtime_effect_kind"]:
            fail(f"{path}.effect.runtime_effect_kind", f"must equal {implementation['runtime_effect_kind']}")
        if set(fields) != model_schema[variant]:
            fail(f"{path}.effect.fields", f"must contain exactly {sorted(model_schema[variant])}")
    validate_known_references(
        fields,
        f"{path}.effect.fields",
        cards=cards,
        dreamsigns=dreamsigns,
        transfigurations=transfigurations,
        source_card_id=selected_card_id,
    )
    predicate = fields.get("predicate")
    rationale = action.get("predicate_exception_rationale")
    if isinstance(predicate, str) and predicate not in STANDARD_PREDICATES:
        require_string(rationale, f"{path}.predicate_exception_rationale")
    elif "predicate_exception_rationale" in action:
        fail(f"{path}.predicate_exception_rationale", "is allowed only for a nonstandard predicate")
    notes = require_object(action.get("implementation_notes"), f"{path}.implementation_notes")
    if set(notes) != IMPLEMENTATION_NOTE_KEYS:
        fail(f"{path}.implementation_notes", f"must contain exactly {sorted(IMPLEMENTATION_NOTE_KEYS)}")
    for key in IMPLEMENTATION_NOTE_KEYS:
        require_string(notes.get(key), f"{path}.implementation_notes.{key}")
    validated = dict(action)
    validated["implementation_status"] = implementation["status"]
    if implementation["status"] == "reuse":
        validated["expected_live_fields"] = compat_fields(fields)
    return validated


def assemble_redesigns(
    *, manifest_path: Path, results_dir: Path, workset_output: Path, display_output: Path
) -> dict[str, Any]:
    manifest = require_object(load_json(manifest_path, "Manifest"), "$manifest")
    if manifest.get("schema_version") != 1:
        fail("$manifest.schema_version", "must equal 1")
    repository_raw = require_object(manifest.get("repository"), "$manifest.repository")
    digests = require_object(manifest.get("source_sha256"), "$manifest.source_sha256")
    if set(repository_raw) != set(SOURCE_KEYS) or set(digests) != set(SOURCE_KEYS):
        fail("$manifest.repository", f"must describe exactly {sorted(SOURCE_KEYS)}")
    repository = {key: Path(require_string(repository_raw[key], f"$manifest.repository.{key}")) for key in SOURCE_KEYS}
    for key, path in repository.items():
        if sha256(path) != digests[key]:
            fail(f"$manifest.source_sha256.{key}", f"source changed after selection: {path}")
    try:
        catalog = load_mechanic_catalog(repository["mechanic_ideas"], model_path=repository["exploration_model"])
        model_schema = action_effect_schema(repository["exploration_model"])
    except MechanicCatalogError as error:
        raise AssemblyError(str(error)) from error
    mechanics = mechanics_by_id(catalog)
    ledger_path = Path(require_string(manifest.get("template_assignments"), "$manifest.template_assignments"))
    if sha256(ledger_path) != require_string(
        manifest.get("template_assignments_sha256"), "$manifest.template_assignments_sha256"
    ):
        fail("$manifest.template_assignments_sha256", "template assignment ledger changed after selection")
    ledger = load_ledger(
        ledger_path,
        exploration_path=repository["exploration_compat"],
        mechanic_path=repository["mechanic_ideas"],
    )
    ledger_by_action = {value["action_id"]: value for value in ledger["assignments"]}
    cards = load_canonical_entities(repository["cards_compat"], "cards", "Card catalog")
    dreamsigns = load_canonical_entities(repository["dreamsigns_compat"], "dreamsign", "Dreamsign catalog")
    transfigurations = load_transfigurations(repository["transfiguration_compat"])
    assignments = require_list(manifest.get("assignments"), "$manifest.assignments")
    for assignment_index, assignment in enumerate(assignments):
        target = require_object(
            assignment.get("target_template"),
            f"$manifest.assignments[{assignment_index}].target_template",
        )
        target_id = require_int(target.get("id"), f"$manifest.assignments[{assignment_index}].target_template.id")
        if mechanics.get(target_id) != target:
            fail(
                f"$manifest.assignments[{assignment_index}].target_template",
                "does not match the hashed template library",
            )
        for candidate_index, candidate in enumerate(assignment.get("candidates", [])):
            art_path = Path(require_string(
                candidate.get("art_path"),
                f"$manifest.assignments[{assignment_index}].candidates[{candidate_index}].art_path",
            ))
            expected_art_hash = require_string(
                candidate.get("art_sha256"),
                f"$manifest.assignments[{assignment_index}].candidates[{candidate_index}].art_sha256",
            )
            if sha256(art_path) != expected_art_hash:
                fail(
                    f"$manifest.assignments[{assignment_index}].candidates[{candidate_index}].art_sha256",
                    "art changed after selection",
                )
    expected_files = {f"{assignment['assignment_id']}.json" for assignment in assignments}
    actual_files = {path.name for path in results_dir.glob("*.json") if path.is_file()}
    if actual_files != expected_files:
        fail("$results", f"files differ from assignments; missing={sorted(expected_files-actual_files)}, extra={sorted(actual_files-expected_files)}")

    replacements = []
    displays = []
    for assignment in assignments:
        assignment_id = assignment["assignment_id"]
        result = require_object(load_json(results_dir / f"{assignment_id}.json", f"Result {assignment_id}"), f"$result[{assignment_id}]")
        required = {"assignment_id", "selected_card_id", "replaced_action_id", "replacement_action", "selection_rationale", "rejected_candidates"}
        if set(result) != required or result.get("assignment_id") != assignment_id:
            fail(f"$result[{assignment_id}]", f"must contain exactly {sorted(required)} and preserve assignment_id")
        try:
            selected_card_id = canonical_uuid(result.get("selected_card_id"), "$result.selected_card_id")
            replaced_action_id = canonical_uuid(result.get("replaced_action_id"), "$result.replaced_action_id", require_v4=True)
        except SelectionError as error:
            raise AssemblyError(str(error)) from error
        candidates = {candidate["card"]["id"]: candidate for candidate in assignment["candidates"]}
        candidate = candidates.get(selected_card_id)
        if candidate is None or replaced_action_id != candidate["replace_action_id"]:
            fail(f"$result[{assignment_id}]", "must choose one candidate and its nominated action")
        replacement_action = validate_replacement_action(
            result["replacement_action"], assignment=assignment, selected_card_id=selected_card_id,
            mechanics=mechanics, model_schema=model_schema, cards=cards, dreamsigns=dreamsigns,
            transfigurations=transfigurations,
        )
        actions = candidate["encounter"]["action"]
        replaced = next(action for action in actions if action["id"] == replaced_action_id)
        preserved = next(action for action in actions if action["id"] != replaced_action_id)
        donor_template_id = candidate["donor_template_id"]
        donor_assignment = ledger_by_action.get(replaced_action_id)
        if donor_assignment is None or donor_assignment["template_id"] != donor_template_id:
            fail(
                f"$result[{assignment_id}].replaced_action_id",
                f"donor template {donor_template_id} does not match the canonical assignment ledger",
            )
        rejected = require_list(result.get("rejected_candidates"), "$result.rejected_candidates")
        rejected_ids = set()
        for rejected_index, value in enumerate(rejected):
            rejected_candidate = require_object(value, f"$result.rejected_candidates[{rejected_index}]")
            if set(rejected_candidate) != {"card_id", "rejected_because"}:
                fail(f"$result.rejected_candidates[{rejected_index}]", "must contain exactly card_id and rejected_because")
            rejected_ids.add(require_string(rejected_candidate.get("card_id"), f"$result.rejected_candidates[{rejected_index}].card_id"))
            rejected_because = require_string(rejected_candidate.get("rejected_because"), f"$result.rejected_candidates[{rejected_index}].rejected_because")
            if len(words(rejected_because)) > 20:
                fail(f"$result.rejected_candidates[{rejected_index}].rejected_because", "must contain at most 20 words")
        if rejected_ids != set(candidates) - {selected_card_id}:
            fail("$result.rejected_candidates", "must explain every unselected candidate exactly once")
        selection_rationale = require_string(result.get("selection_rationale"), "$result.selection_rationale")
        if len(words(selection_rationale)) > 40:
            fail("$result.selection_rationale", "must contain at most 40 words")
        replacements.append({
            "assignment_id": assignment_id,
            "target_template_id": assignment["target_template"]["id"],
            "donor_template_id": donor_template_id,
            "card_id": selected_card_id,
            "prose": candidate["encounter"]["prose"],
            "replaced_action": replaced,
            "preserved_action": preserved,
            "replacement_action": replacement_action,
            "unselected_candidates": [
                {
                    "card_id": candidate_card_id,
                    "encounter": candidate_value["encounter"],
                }
                for candidate_card_id, candidate_value in candidates.items()
                if candidate_card_id != selected_card_id
            ],
        })
        candidate_lines = []
        for candidate_card_id, candidate_value in candidates.items():
            nominated = next(
                action
                for action in candidate_value["encounter"]["action"]
                if action["id"] == candidate_value["replace_action_id"]
            )
            marker = "Selected" if candidate_card_id == selected_card_id else "Rejected"
            candidate_lines.extend([
                f"## {marker}: {candidate_value['card']['name']}",
                "",
                f"![Source artwork for {candidate_value['card']['name']}](<{candidate_value['art_path']}>)",
                "",
                f"Nominated donor template `{candidate_value['donor_template_id']}`: "
                f"***{nominated['label']}*** — {nominated['effect-text']}",
                "",
            ])
        displays.append(
            f"# Template {assignment['target_template']['id']}: {assignment['target_template']['concept']}\n\n"
            + "\n".join(candidate_lines)
            + f"Selected card UUID: `{selected_card_id}`\n\n"
            f"Replace ***{replaced['label']}*** — {replaced['effect-text']}\n\n"
            f"Preserve ***{preserved['label']}*** — {preserved['effect-text']}\n\n"
            f"With ***{replacement_action['label']}*** — {replacement_action['presentation']['effect_text']}\n"
        )
    atomic_write(workset_output, json.dumps({
        "schema_version": 1,
        "purpose": "Validated one-action Exploration redesigns.",
        "template_counts_before": manifest.get("template_counts_before", {}),
        "replacements": replacements,
    }, ensure_ascii=False, indent=2) + "\n")
    atomic_write(display_output, "\n".join(displays))
    return {"workset": str(workset_output.resolve()), "display": str(display_output.resolve()), "replacement_count": len(replacements)}


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
        report = assemble_redesigns(manifest_path=args.manifest, results_dir=args.results_dir, workset_output=args.workset_output, display_output=args.display_output)
    except (AssemblyError, OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
