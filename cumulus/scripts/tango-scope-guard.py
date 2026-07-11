#!/usr/bin/env python3

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys


def git_paths(repo_root: Path, base: str) -> list[str]:
    changed = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRT", base, "--"],
        cwd=repo_root,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout.splitlines()
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=repo_root,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout.splitlines()
    return sorted(set(changed + untracked))


def fixture_paths(fixture_root: Path) -> list[str]:
    return sorted(
        path.relative_to(fixture_root).as_posix()
        for path in fixture_root.rglob("*")
        if path.is_file()
    )


def source_files(root: Path, fixture: bool) -> list[Path]:
    source_root = root / "cumulus" / "Assets" / "TangoMvp"
    if not source_root.exists():
        return []
    return sorted(source_root.rglob("*.cs"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--base")
    parser.add_argument("--fixture-root")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    fixture = args.fixture_root is not None
    scan_root = Path(args.fixture_root).resolve() if fixture else repo_root
    if fixture:
        paths = fixture_paths(scan_root)
    else:
        if not args.base:
            parser.error("--base is required without --fixture-root")
        paths = git_paths(repo_root, args.base)

    errors: list[str] = []
    forbidden_renderer = "cumulus/Assets/Settings/Mobile_Renderer.asset"
    for path in paths:
        normalized = path.replace("\\", "/")
        if normalized == forbidden_renderer:
            errors.append(f"forbidden renderer mutation: {normalized}")
        if normalized.startswith("cumulus/Assets/TextMesh Pro/"):
            errors.append(f"forbidden TextMesh Pro asset mutation: {normalized}")
        lower = normalized.lower()
        if lower.endswith((".uxml", ".uss")) or "uidocument" in lower:
            errors.append(f"forbidden UI document asset mutation: {normalized}")

        candidate = scan_root / normalized
        if normalized.startswith("cumulus/Assets/") and not normalized.endswith(".meta") and candidate.is_file():
            meta = Path(str(candidate) + ".meta")
            if not meta.is_file():
                errors.append(f"missing Unity meta partner: {normalized}.meta")

    material_pattern = re.compile(r"\bnew\s+Material\s*\(")
    per_pane_pattern = re.compile(
        r"\b(?:Camera|RenderTexture)\s+(?:pane|glass)\w*|"
        r"\b(?:Camera|RenderTexture)\s+\w*(?:Pane|Glass)(?:Camera|Texture)\w*"
    )
    forbidden_imports = (
        "using UnityEngine.UI;",
        "using UnityEngine.UIElements;",
        "using TMPro;",
    )
    for source in source_files(scan_root, fixture):
        relative = source.relative_to(scan_root).as_posix()
        text = source.read_text(encoding="utf-8")
        if "/Runtime/" in relative and material_pattern.search(text):
            errors.append(f"runtime material allocation: {relative}")
        if "/Runtime/" in relative and per_pane_pattern.search(text):
            errors.append(f"per-pane camera/render-texture field: {relative}")
        for forbidden_import in forbidden_imports:
            if forbidden_import in text:
                errors.append(f"forbidden UI namespace import ({forbidden_import}): {relative}")

    for error in sorted(set(errors)):
        print(f"scope-guard: {error}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
