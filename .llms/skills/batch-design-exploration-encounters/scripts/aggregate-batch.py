#!/usr/bin/env python3
"""Validate, append, and render a completed exploration encounter batch."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any


SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parents[3]
DESIGNER_SCRIPTS = REPO_ROOT / ".llms/skills/exploration-encounter-designer/scripts"
sys.path.insert(0, str(DESIGNER_SCRIPTS))
from template_rendering import render_template  # noqa: E402

DEFAULT_CANDIDATES = REPO_ROOT / "data/encounter_candidates.json"
DEFAULT_VALIDATOR = DESIGNER_SCRIPTS / "validate-exploration.py"
DEFAULT_ART_FINDER = DESIGNER_SCRIPTS / "find-card-art.py"
DEFAULT_TEMPLATES = REPO_ROOT / "data/templates.json"
DEFAULT_CARDS = REPO_ROOT / "data/tabula/cards.toml"
DEFAULT_DREAMSIGNS = REPO_ROOT / "data/tabula/dreamsigns.toml"
DEFAULT_TRANSFIGURATIONS = REPO_ROOT / "src/types/journey.ts"


class AggregationError(ValueError):
    """Raised when a batch cannot be safely appended."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--results-dir", type=Path, required=True)
    parser.add_argument(
        "--encounter-candidates", type=Path, default=DEFAULT_CANDIDATES
    )
    parser.add_argument("--display-output", type=Path)
    parser.add_argument("--images-dir", type=Path)
    parser.add_argument("--validator", type=Path, default=DEFAULT_VALIDATOR)
    parser.add_argument("--art-finder", type=Path, default=DEFAULT_ART_FINDER)
    parser.add_argument("--template-catalog", type=Path, default=DEFAULT_TEMPLATES)
    parser.add_argument("--cards-data", type=Path, default=DEFAULT_CARDS)
    parser.add_argument("--dreamsigns-data", type=Path, default=DEFAULT_DREAMSIGNS)
    parser.add_argument(
        "--transfigurations-data", type=Path, default=DEFAULT_TRANSFIGURATIONS
    )
    return parser.parse_args()


def load_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise AggregationError(f"{label} does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise AggregationError(
            f"{label} is invalid JSON: {path}:{error.lineno}:{error.colno}"
        ) from error


def canonical_uuid(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise AggregationError(f"{label} must be a UUID string")
    try:
        normalized = str(uuid.UUID(value))
    except ValueError as error:
        raise AggregationError(f"{label} must be a UUID") from error
    if normalized != value:
        raise AggregationError(f"{label} must be a canonical lowercase UUID")
    return normalized


def load_manifest(path: Path) -> dict[str, Any]:
    manifest = load_json(path, "Batch manifest")
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise AggregationError("Batch manifest must use schema_version 1")
    batch_size = manifest.get("batch_size")
    cards = manifest.get("cards")
    if isinstance(batch_size, bool) or not isinstance(batch_size, int) or batch_size <= 0:
        raise AggregationError("Batch manifest batch_size must be positive")
    if not isinstance(cards, list) or len(cards) != batch_size:
        raise AggregationError("Batch manifest cards must match batch_size")
    seen_ids: set[str] = set()
    for index, card in enumerate(cards):
        if not isinstance(card, dict):
            raise AggregationError(f"Batch manifest cards[{index}] must be an object")
        card_id = canonical_uuid(card.get("id"), f"Batch manifest cards[{index}].id")
        if card_id in seen_ids:
            raise AggregationError(f"Batch manifest repeats card UUID {card_id}")
        seen_ids.add(card_id)
    digest = manifest.get("encounter_candidates_sha256")
    if not isinstance(digest, str) or len(digest) != 64:
        raise AggregationError("Batch manifest has an invalid candidates digest")
    return manifest


def read_candidate_document(path: Path, expected_digest: str) -> dict[str, Any]:
    try:
        source = path.read_bytes()
    except FileNotFoundError as error:
        raise AggregationError(f"Encounter candidates do not exist: {path}") from error
    actual_digest = hashlib.sha256(source).hexdigest()
    if actual_digest != expected_digest:
        raise AggregationError(
            "Encounter candidates changed after batch selection; select a fresh batch"
        )
    try:
        document = json.loads(source)
    except json.JSONDecodeError as error:
        raise AggregationError(f"Encounter candidates are invalid JSON: {error}") from error
    if not isinstance(document, dict):
        raise AggregationError("Encounter candidates must be a UUID-keyed object")
    return document


def validate_result(
    *,
    card: dict[str, Any],
    result_path: Path,
    args: argparse.Namespace,
) -> None:
    with tempfile.TemporaryDirectory(prefix="encounter-batch-validate-") as directory:
        request_path = Path(directory) / "request.json"
        request_path.write_text(
            json.dumps({"card": card}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        command = [
            sys.executable,
            str(args.validator),
            "--input",
            str(request_path),
            "--output",
            str(result_path),
            "--derive-template-pairs-from-output",
            "--template-catalog",
            str(args.template_catalog),
            "--cards-data",
            str(args.cards_data),
            "--dreamsigns-data",
            str(args.dreamsigns_data),
            "--transfigurations-data",
            str(args.transfigurations_data),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise AggregationError(f"Result for {card['id']} failed validation: {detail}")


def find_art(card: dict[str, Any], args: argparse.Namespace) -> Path:
    command = [sys.executable, str(args.art_finder), str(card["image_number"])]
    if args.images_dir is not None:
        command.extend(("--images-dir", str(args.images_dir)))
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise AggregationError(f"Artwork for {card['id']} could not be resolved: {detail}")
    try:
        payload = json.loads(completed.stdout)
        path = Path(payload["path"])
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        raise AggregationError(f"Artwork resolver returned invalid data for {card['id']}") from error
    if not path.is_file():
        raise AggregationError(f"Artwork resolver returned an unreadable file: {path}")
    return path.resolve()


def read_templates(path: Path) -> dict[int, str]:
    catalog = load_json(path, "Template catalog")
    if not isinstance(catalog, list):
        raise AggregationError("Template catalog must be an array")
    templates: dict[int, str] = {}
    for index, entry in enumerate(catalog):
        if not isinstance(entry, dict):
            raise AggregationError(f"Template catalog entry {index} must be an object")
        template_id = entry.get("template_id")
        template = entry.get("template")
        if isinstance(template_id, bool) or not isinstance(template_id, int):
            raise AggregationError(f"Template catalog entry {index} has an invalid template_id")
        if not isinstance(template, str) or not template.strip():
            raise AggregationError(f"Template catalog entry {index} has an invalid template")
        if template_id in templates:
            raise AggregationError(f"Template catalog repeats template_id {template_id}")
        templates[template_id] = template
    return templates


def render_card(
    card: dict[str, Any],
    events: list[Any],
    art_path: Path,
    templates: dict[int, str],
) -> str:
    lines = [
        f"# {card['name']}",
        "",
        card["ability"],
        "",
        f"![Source artwork for {card['name']}](<{art_path}>)",
        "",
    ]
    for index, event in enumerate(events, start=1):
        lines.append(f"{index}. {event['prose']}")
        for action in event["actions"]:
            rendered = render_template(
                templates[action["template_id"]], action["variables"]
            )
            lines.append(f"   - ***{action['label']}*** — {rendered}")
        if index != len(events):
            lines.append("")
    return "\n".join(lines)


def selected_for_storage(events: list[Any]) -> list[Any]:
    stored = copy.deepcopy(events)
    for event in stored:
        event.pop("selected", None)
        if event.get("rank") == 1:
            event["selected"] = {"prose": True, "actions": True}
    return stored


def atomic_write_json(path: Path, value: Any) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


def aggregate(args: argparse.Namespace) -> str:
    manifest = load_manifest(args.manifest)
    recorded_path = Path(manifest.get("encounter_candidates", ""))
    if recorded_path.resolve() != args.encounter_candidates.resolve():
        raise AggregationError("Manifest and --encounter-candidates identify different files")
    document = read_candidate_document(
        args.encounter_candidates, manifest["encounter_candidates_sha256"]
    )
    templates = read_templates(args.template_catalog)

    completed: list[tuple[dict[str, Any], list[Any], Path]] = []
    result_errors: list[str] = []
    for card in manifest["cards"]:
        card_id = card["id"]
        if card_id in document:
            raise AggregationError(f"Card {card_id} already has encounter candidates")
        result_path = args.results_dir / f"{card_id}.json"
        try:
            events = load_json(result_path, f"Result for {card_id}")
            validate_result(card=card, result_path=result_path, args=args)
            art_path = find_art(card, args)
        except (AggregationError, OSError) as error:
            result_errors.append(str(error))
            continue
        completed.append((card, events, art_path))

    if result_errors:
        raise AggregationError(
            "Batch results failed validation:\n- " + "\n- ".join(result_errors)
        )

    for card, events, _ in completed:
        document[card["id"]] = selected_for_storage(events)
    display = "\n\n".join(
        render_card(card, events, art_path, templates)
        for card, events, art_path in completed
    ) + "\n"

    if args.display_output is not None:
        args.display_output.write_text(display, encoding="utf-8")
    atomic_write_json(args.encounter_candidates, document)
    return display


def main() -> int:
    args = parse_args()
    try:
        display = aggregate(args)
    except (AggregationError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    sys.stdout.write(display)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
