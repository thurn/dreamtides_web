#!/usr/bin/env python3
"""Render canonical encounter templates without resolving runtime variables."""

from __future__ import annotations

import re
from typing import Any


PLACEHOLDER_RE = re.compile(r"\{([a-z][a-z0-9_]*)\}")
SPECIAL_RE = re.compile(r"\$[A-Z][A-Z0-9_]*")


def display_variable(value: Any, path: str) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (str, int, float)):
        return str(value)
    if isinstance(value, dict):
        display_name = value.get("display_name")
        if isinstance(display_name, str) and display_name.strip():
            return display_name
    raise ValueError(
        f"{path} must be a JSON primitive or an entity reference with display_name"
    )


def render_template(template: str, variables: dict[str, Any]) -> str:
    """Substitute braced variables and leave $RUNTIME_VARIABLE tokens verbatim."""

    def replace(match: re.Match[str]) -> str:
        placeholder = match.group(1)
        if placeholder not in variables:
            raise ValueError(f"variables is missing {{{placeholder}}}")
        return display_variable(variables[placeholder], f"variables.{placeholder}")

    return PLACEHOLDER_RE.sub(replace, template)
