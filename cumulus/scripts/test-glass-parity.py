#!/usr/bin/env python3

import json
from pathlib import Path
import tempfile

import glass_parity as parity


def solid(width, height, rgba):
    return [rgba] * (width * height)


def write_pair(root, renderer, scenario, bare, glass, width=4, height=3):
    directory = root / renderer
    directory.mkdir(parents=True, exist_ok=True)
    parity.write_png(directory / f"{scenario}-bare.png", width, height, bare)
    parity.write_png(directory / f"{scenario}-glass.png", width, height, glass)


def manifest(root, scenarios=("a", "b"), threshold=0.0):
    data = {
        "schemaVersion": 1,
        "capture": {
            "width": 4,
            "height": 3,
            "comparisonRegion": {"x": 0, "y": 0, "width": 4, "height": 3},
        },
        "scenarios": [{"id": scenario, "background": f"{scenario}.png"} for scenario in scenarios],
        "metrics": {
            "effectMae": {"weight": 0.4},
            "effectRmse": {"weight": 0.25},
            "edgeAttenuationError": {"weight": 0.2},
            "meanColorShiftError": {"weight": 0.15},
        },
        "budget": {
            "maximumMeanScore": threshold,
            "maximumWorstScore": threshold,
            "maximumScenarioScore": threshold,
        },
    }
    path = root / "manifest.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    black = solid(4, 3, (0, 0, 0, 255))
    gray = solid(4, 3, (96, 96, 96, 255))
    for scenario in ("a", "b"):
        write_pair(root, "web", scenario, black, gray)
        write_pair(root, "unity", scenario, black, gray)
    report = parity.compare(manifest(root), root / "web", root / "unity", root / "out")
    assert report["overall"]["meanScore"] == 0.0
    assert report["overall"]["worstScore"] == 0.0
    assert report["overall"]["passed"] is True
    assert {item["scenario"] for item in report["scenarios"]} == {"a", "b"}
    assert (root / "out" / "a-effect-diff.png").is_file()
print("PASS: identical material effects score zero across multiple backgrounds")


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    black = solid(4, 3, (0, 0, 0, 255))
    gray = solid(4, 3, (96, 96, 96, 255))
    red = solid(4, 3, (255, 0, 0, 255))
    for scenario in ("a", "b"):
        write_pair(root, "web", scenario, black, gray)
        write_pair(root, "unity", scenario, black, gray if scenario == "a" else red)
    report = parity.compare(manifest(root, threshold=0.01), root / "web", root / "unity", root / "out")
    assert report["overall"]["passed"] is False
    assert report["overall"]["worstScenario"] == "b"
    assert report["scenarios"][1]["score"] > report["scenarios"][0]["score"]
print("PASS: worst-background regression cannot hide behind the aggregate")


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    black = solid(4, 3, (0, 0, 0, 255))
    gray = solid(4, 3, (96, 96, 96, 255))
    write_pair(root, "web", "a", black, gray)
    write_pair(root, "unity", "a", black, gray)
    try:
        parity.compare(manifest(root), root / "web", root / "unity", root / "out")
    except ValueError as error:
        assert "capture matrix mismatch" in str(error)
    else:
        raise AssertionError("missing scenarios must fail closed")
print("PASS: incomplete capture matrices are rejected")


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    bad = json.loads(manifest(root).read_text(encoding="utf-8"))
    bad["metrics"]["effectMae"]["weight"] = 0.5
    path = root / "bad.json"
    path.write_text(json.dumps(bad), encoding="utf-8")
    try:
        parity.load_manifest(path)
    except ValueError as error:
        assert "weights must sum to 1" in str(error)
    else:
        raise AssertionError("malformed metric weights must be rejected")
print("PASS: malformed score contracts are rejected")
