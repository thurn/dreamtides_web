#!/usr/bin/env python3

import argparse
import json
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
    modifier = r"(?:public|private|protected|internal|static|readonly|volatile|new)"
    field_prefix = rf"(?:(?:\[[^\]]+\]\s*)*(?:{modifier}\s+)*)"
    return re.compile(
        rf"{field_prefix}"
        r"(?P<type>(?:[A-Za-z_@][A-Za-z0-9_@\s.:?<>,\[\]]*?)?"
        r"\b(?:Camera|RenderTexture|RTHandle)\b"
        r"[\s?>,\[\]]*?)"
        r"\s+(?P<name>[A-Za-z_]\w*)"
        r"(?P<additional>(?:\s*(?:=[^,;]*)?\s*,\s*[A-Za-z_]\w*)*)"
        r"\s*(?:=[^;]*)?;",
        re.MULTILINE,
    )


def source_without_comments_or_strings(content: str) -> str:
    pattern = re.compile(
        r'//[^\n]*|/\*.*?\*/|@"(?:""|[^"])*"|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'',
        re.DOTALL,
    )
    return pattern.sub(lambda match: "".join("\n" if c == "\n" else " " for c in match.group()), content)


def type_member_positions(content: str) -> set[int]:
    scrubbed = source_without_comments_or_strings(content)
    stack: list[str] = []
    member_positions: set[int] = set()
    boundary = 0
    fields = source_fields()
    matches = {match.start(): match for match in fields.finditer(scrubbed)}
    for index, character in enumerate(scrubbed):
        if index in matches and stack and stack[-1] == "type":
            member_positions.add(index)
        if character == "{":
            header = scrubbed[boundary:index]
            kind = "type" if re.search(r"\b(?:class|struct|record|interface)\b[^;{}]*$", header) else "block"
            stack.append(kind)
            boundary = index + 1
        elif character == "}":
            if stack:
                stack.pop()
            boundary = index + 1
        elif character == ";":
            boundary = index + 1
    return member_positions


def is_production_source(source: Path, source_root: Path) -> bool:
    relative_parts = source.relative_to(source_root).parts
    if any(part in {"Editor", "Tests"} for part in relative_parts[:-1]):
        return False
    for parent in (source.parent, *source.parents):
        if parent == source_root.parent:
            break
        asmdefs = sorted(parent.glob("*.asmdef"))
        if not asmdefs:
            continue
        try:
            assembly = json.loads(asmdefs[0].read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return True
        name = str(assembly.get("name", ""))
        include_platforms = assembly.get("includePlatforms", [])
        optional_references = assembly.get("optionalUnityReferences", [])
        constraints = assembly.get("defineConstraints", [])
        return not (
            "Editor" in include_platforms
            or "TestAssemblies" in optional_references
            or "UNITY_INCLUDE_TESTS" in constraints
            or name.endswith(".Editor")
            or "Tests" in name
        )
    return True


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
            or (
                asset_path.startswith("cumulus/Assets/TangoMvp/")
                and lowered.endswith(".cs")
                and "/editor/" not in lowered
                and "/tests/" not in lowered
                and re.search(r"token[^/]*generator|generator[^/]*token", lowered.rsplit("/", 1)[-1])
            )
        )
        if protected:
            if "token" in lowered and "generator" in lowered:
                errors.append(f"deferred production token generator {status.lower()}: {normalized}")
            else:
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
    per_instance_material = re.compile(r"\.\s*materials?\b")
    controller_or_touch = re.compile(
        r"\b(?:Gamepad|Joystick|Touchscreen|Pen)\s*\.\s*(?:current|all)\b"
        r"|\bInput\s*\.\s*(?:touchCount|touches|GetTouch)\b"
        r"|\bTouch\s*\.\s*activeTouches\b"
        r"|\bEnhancedTouchSupport\b|\bUnityEngine\s*\.\s*InputSystem\s*\.\s*EnhancedTouch\b"
    )
    token_generator_type = re.compile(
        r"\b(?:class|struct|record)\s+(?:[A-Za-z_]\w*)?TokenGenerator\w*\b",
        re.IGNORECASE,
    )
    field = source_fields()
    forbidden_import = re.compile(
        r"\busing\s+(?:(?:[A-Za-z_]\w*)\s*=\s*)?"
        r"(?:(?:global\s*::\s*)?UnityEngine\s*\.\s*(?:UIElements|UI)|"
        r"(?:global\s*::\s*)?TMPro)"
        r"(?:\s*\.\s*[A-Za-z_]\w*)*\s*;"
    )
    source_root = root / "cumulus/Assets/TangoMvp"
    sources = source_root.rglob("*.cs") if source_root.exists() else []
    for source in sources:
        relative = source.relative_to(root).as_posix()
        content = source.read_text(encoding="utf-8")
        scrubbed = source_without_comments_or_strings(content)
        production = is_production_source(source, source_root)
        if production and allocation.search(scrubbed):
            errors.append(f"runtime material allocation: {relative}")
        if production and per_instance_material.search(scrubbed):
            errors.append(f"runtime per-instance material access: {relative}")
        if production and controller_or_touch.search(scrubbed):
            errors.append(f"deferred controller/touch API: {relative}")
        if production and token_generator_type.search(scrubbed):
            errors.append(f"deferred production token generator source: {relative}")
        if production:
            member_positions = type_member_positions(content)
            for match in field.finditer(content):
                if match.start() not in member_positions:
                    continue
                allowed_interactor_camera = (
                    relative.endswith("TangoPointerInteractor.cs")
                    and match.group("name") == "interactionCamera"
                    and not match.group("additional").strip()
                )
                if not allowed_interactor_camera:
                    errors.append(
                        f"per-pane camera/render-texture field: {relative}:{match.group('name')}"
                    )
        for match in forbidden_import.finditer(scrubbed):
            errors.append(
                f"forbidden UI namespace import ({match.group(0).strip()}): {relative}"
            )

    shader_root = root / "cumulus/Assets/TangoMvp"
    refraction = re.compile(
        r"\bGrabPass\b|\b\w*refraction\w*\b|\brefract\s*\(|\b_Camera(?:Opaque|Depth)Texture\b",
        re.IGNORECASE,
    )
    shaders = shader_root.rglob("*.shader") if shader_root.exists() else []
    for shader in shaders:
        content = source_without_comments_or_strings(shader.read_text(encoding="utf-8"))
        if refraction.search(content):
            errors.append(
                f"deferred refraction source: {shader.relative_to(root).as_posix()}"
            )

    for error in sorted(set(errors)):
        print(f"scope-guard: {error}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
