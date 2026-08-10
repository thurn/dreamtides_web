#!/usr/bin/env python3
"""Load and render the design-only Exploration mechanic idea catalog."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
IMPLEMENTATION_STATUSES = {"reuse", "vertical_slice"}
BALANCE_CLASSES = {"standard", "unique_effect"}
RUNTIME_KIND_RE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")


class MechanicCatalogError(ValueError):
    """Raised when the mechanic idea catalog is malformed or stale."""


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise MechanicCatalogError(f"{label} must be an object")
    return value


def _string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MechanicCatalogError(f"{label} must be a non-empty string")
    return value


def _action_effect_block(source: str) -> str:
    marker = "pub enum ActionEffect {"
    start = source.find(marker)
    if start < 0:
        raise MechanicCatalogError("Exploration model has no ActionEffect enum")
    body_start = start + len(marker)
    depth = 1
    for index in range(body_start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[body_start:index]
    raise MechanicCatalogError("Exploration ActionEffect enum is not closed")


def action_effect_schema(model_path: Path) -> dict[str, set[str]]:
    try:
        source = model_path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise MechanicCatalogError(
            f"Exploration source model does not exist: {model_path}"
        ) from error
    block = _action_effect_block(source)
    variants: dict[str, set[str]] = {}
    index = 0
    variant_pattern = re.compile(r"\s*([A-Z][A-Za-z0-9]*)\s*(\{|,)")
    while index < len(block):
        match = variant_pattern.match(block, index)
        if match is None:
            index += 1
            continue
        name, delimiter = match.groups()
        if name in variants:
            raise MechanicCatalogError(f"duplicate ActionEffect variant {name}")
        if delimiter == ",":
            variants[name] = set()
            index = match.end()
            continue
        field_start = match.end()
        depth = 1
        cursor = field_start
        while cursor < len(block) and depth > 0:
            if block[cursor] == "{":
                depth += 1
            elif block[cursor] == "}":
                depth -= 1
            cursor += 1
        if depth != 0:
            raise MechanicCatalogError(f"ActionEffect variant {name} is not closed")
        field_body = block[field_start : cursor - 1]
        fields = set(re.findall(r"(?m)^\s*([a-z][a-z0-9_]*)\s*:", field_body))
        variants[name] = fields
        index = cursor
    if not variants:
        raise MechanicCatalogError("Exploration ActionEffect enum has no variants")
    return variants


def load_mechanic_catalog(
    path: Path,
    *,
    model_path: Path | None = None,
) -> dict[str, Any]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise MechanicCatalogError(f"Mechanic idea catalog does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise MechanicCatalogError(
            f"Mechanic idea catalog is invalid JSON: {path}:{error.lineno}:{error.colno}"
        ) from error
    root = _object(document, "$mechanic_ideas")
    if set(root) != {"schema_version", "purpose", "mechanics"}:
        raise MechanicCatalogError(
            "$mechanic_ideas must contain exactly schema_version, purpose, and mechanics"
        )
    if root["schema_version"] != SCHEMA_VERSION:
        raise MechanicCatalogError(
            f"$mechanic_ideas.schema_version must equal {SCHEMA_VERSION}"
        )
    _string(root["purpose"], "$mechanic_ideas.purpose")
    mechanics = root["mechanics"]
    if not isinstance(mechanics, list) or not mechanics:
        raise MechanicCatalogError("$mechanic_ideas.mechanics must be a non-empty list")

    model_schema = action_effect_schema(model_path) if model_path is not None else None
    seen: set[int] = set()
    for index, value in enumerate(mechanics):
        label = f"$mechanic_ideas.mechanics[{index}]"
        entry = _object(value, label)
        if set(entry) != {"id", "concept", "balance_class", "implementation"}:
            raise MechanicCatalogError(
                f"{label} must contain exactly id, concept, balance_class, and implementation"
            )
        idea_id = entry["id"]
        if isinstance(idea_id, bool) or not isinstance(idea_id, int) or idea_id <= 0:
            raise MechanicCatalogError(f"{label}.id must be a positive integer")
        if idea_id in seen:
            raise MechanicCatalogError(f"duplicate mechanic idea id {idea_id}")
        seen.add(idea_id)
        _string(entry["concept"], f"{label}.concept")
        if entry["balance_class"] not in BALANCE_CLASSES:
            raise MechanicCatalogError(
                f"{label}.balance_class must be standard or unique_effect"
            )
        implementation = _object(entry["implementation"], f"{label}.implementation")
        status = implementation.get("status")
        if status not in IMPLEMENTATION_STATUSES:
            raise MechanicCatalogError(
                f"{label}.implementation.status must be reuse or vertical_slice"
            )
        expected_keys = (
            {"status", "effect_variant", "runtime_effect_kind"}
            if status == "reuse"
            else {"status"}
        )
        if set(implementation) != expected_keys:
            raise MechanicCatalogError(
                f"{label}.implementation has invalid fields for status {status}"
            )
        if status == "reuse":
            variant = _string(
                implementation["effect_variant"],
                f"{label}.implementation.effect_variant",
            )
            runtime_kind = _string(
                implementation["runtime_effect_kind"],
                f"{label}.implementation.runtime_effect_kind",
            )
            if not RUNTIME_KIND_RE.fullmatch(runtime_kind):
                raise MechanicCatalogError(
                    f"{label}.implementation.runtime_effect_kind must use kebab-case"
                )
            if model_schema is not None and variant not in model_schema:
                raise MechanicCatalogError(
                    f"{label}.implementation.effect_variant {variant} is absent from ActionEffect"
                )
    return root


def mechanics_by_id(catalog: dict[str, Any]) -> dict[int, dict[str, Any]]:
    return {entry["id"]: entry for entry in catalog["mechanics"]}


def render_markdown(catalog: dict[str, Any]) -> str:
    lines = [
        "# Complete Exploration template library",
        "",
        catalog["purpose"],
        "",
        "The ID and template-concept columns preserve the source list. This is a design",
        "reference, not runtime game data. `data/exploration.ron` owns",
        "action presentation and typed behavior. A `vertical_slice` idea requires a complete",
        "new or extended implementation before it can be authored live.",
        "",
        "| ID | Mechanic concept | Balance | Current implementation |",
        "| ---: | --- | --- | --- |",
    ]
    for entry in catalog["mechanics"]:
        implementation = entry["implementation"]
        status = implementation["status"]
        implementation_text = (
            f"reuse `{implementation['effect_variant']}`"
            if status == "reuse"
            else "vertical slice required"
        )
        concept = entry["concept"].replace("|", "\\|")
        lines.append(
            f"| {entry['id']} | {concept} | {entry['balance_class']} | {implementation_text} |"
        )
    return "\n".join(lines) + "\n"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    skill_dir = Path(__file__).resolve().parent.parent
    repository_root = skill_dir.parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--catalog",
        type=Path,
        default=skill_dir / "references/mechanic-ideas.json",
    )
    parser.add_argument(
        "--model",
        type=Path,
        default=repository_root / "tools/game-data/src/models/exploration.rs",
    )
    parser.add_argument(
        "--markdown",
        type=Path,
        default=skill_dir / "references/mechanic-ideas.md",
    )
    parser.add_argument("--write", action="store_true")
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    try:
        catalog = load_mechanic_catalog(args.catalog, model_path=args.model)
        rendered = render_markdown(catalog)
        if args.write:
            args.markdown.write_text(rendered, encoding="utf-8")
        elif args.markdown.read_text(encoding="utf-8") != rendered:
            raise MechanicCatalogError(
                f"Rendered mechanic reference is stale: {args.markdown}; run with --write"
            )
    except (MechanicCatalogError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"validated {len(catalog['mechanics'])} mechanic ideas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
