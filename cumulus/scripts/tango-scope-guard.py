#!/usr/bin/env python3

import argparse
from pathlib import Path
import re
import subprocess
import sys


def git_changes(root: Path, base: str) -> list[tuple[str, str]]:
    output = subprocess.check_output(
        ["git", "diff", "--name-status", "--find-renames", base, "--"],
        cwd=root,
        text=True,
    )
    changes: list[tuple[str, str]] = []
    for line in output.splitlines():
        parts = line.split("\t")
        status = parts[0][0]
        changes.extend((status, path) for path in parts[1:])
    untracked = subprocess.check_output(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=root,
        text=True,
    )
    changes.extend(("A", path) for path in untracked.splitlines())
    return changes


def source_fields() -> re.Pattern[str]:
    qualified = r"(?:(?:global\s*::\s*)?(?:UnityEngine(?:\s*\.\s*Rendering)?\s*\.\s*)?)?"
    target = qualified + r"(?:Camera|RenderTexture|RTHandle)\s*\??"
    array = target + r"(?:\s*\[\s*(?:,\s*)*\])?"
    collection = (
        r"(?:[A-Za-z_]\w*\s*\.\s*)?"
        r"(?:List|IList|IEnumerable|IReadOnlyList|ICollection|IReadOnlyCollection|Collection)"
        rf"\s*<\s*{array}\s*>\s*\??"
    )
    modifier = r"(?:public|private|protected|internal|static|readonly|volatile|new)"
    field_prefix = rf"(?:(?:\[[^\]]+\]\s*)+(?:{modifier}\s+)*|(?:{modifier}\s+)+)"
    return re.compile(
        rf"{field_prefix}(?:{array}|{collection})\s+(\w+)\s*(?:=|;)",
        re.MULTILINE,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--base")
    parser.add_argument("--fixture-root")
    parser.add_argument("--fixture-deleted", action="append", default=[])
    args = parser.parse_args()

    repo = Path(args.repo_root).resolve()
    fixture = args.fixture_root is not None
    root = Path(args.fixture_root).resolve() if fixture else repo
    if fixture:
        changes = [("A", path.relative_to(root).as_posix()) for path in root.rglob("*") if path.is_file()]
    else:
        if not args.base:
            parser.error("--base is required without --fixture-root")
        changes = git_changes(repo, args.base)
    changes.extend(("D", path) for path in args.fixture_deleted)

    errors: list[str] = []
    deleted = {path for status, path in changes if status == "D"}
    for status, path in changes:
        normalized = path.replace("\\", "/")
        asset_path = normalized[:-5] if normalized.endswith(".meta") else normalized
        lowered = asset_path.lower()
        protected = (
            asset_path == "cumulus/Assets/Settings/Mobile_Renderer.asset"
            or asset_path.startswith("cumulus/Assets/TextMesh Pro/")
            or lowered.endswith((".uxml", ".uss"))
            or "uidocument" in lowered
        )
        if protected:
            errors.append(f"protected asset {status.lower()}: {normalized}")

        if not normalized.startswith("cumulus/Assets/"):
            continue
        if normalized.endswith(".meta"):
            asset = normalized[:-5]
            if status == "D" and (root / asset).exists() and asset not in deleted:
                errors.append(f"missing Unity meta partner: {normalized}")
            continue
        asset_exists = (root / normalized).exists() and normalized not in deleted
        meta = normalized + ".meta"
        meta_exists = (root / meta).exists() and meta not in deleted
        if asset_exists and not meta_exists:
            errors.append(f"missing Unity meta partner: {meta}")
        elif meta_exists and not asset_exists:
            errors.append(f"orphaned Unity meta partner: {meta}")

    allocation = re.compile(
        r"\bnew\s+(?:(?:global\s*::\s*)?UnityEngine\s*\.\s*)?Material\s*\("
    )
    field = source_fields()
    forbidden_imports = (
        "using UnityEngine.UI;",
        "using UnityEngine.UIElements;",
        "using TMPro;",
    )
    source_root = root / "cumulus/Assets/TangoMvp"
    sources = source_root.rglob("*.cs") if source_root.exists() else []
    for source in sources:
        relative = source.relative_to(root).as_posix()
        content = source.read_text(encoding="utf-8")
        if "/Runtime/" in relative and allocation.search(content):
            errors.append(f"runtime material allocation: {relative}")
        if "/Runtime/" in relative:
            for match in field.finditer(content):
                allowed_interactor_camera = (
                    relative.endswith("TangoPointerInteractor.cs")
                    and match.group(1) == "interactionCamera"
                )
                if not allowed_interactor_camera:
                    errors.append(
                        f"per-pane camera/render-texture field: {relative}:{match.group(1)}"
                    )
        for forbidden_import in forbidden_imports:
            if forbidden_import in content:
                errors.append(
                    f"forbidden UI namespace import ({forbidden_import}): {relative}"
                )

    for error in sorted(set(errors)):
        print(f"scope-guard: {error}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
