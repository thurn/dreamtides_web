#!/usr/bin/env python3

import json
from pathlib import Path
import tempfile

import glass_parity as parity

WIDTH = 128
HEIGHT = 64
EDGE_PANEL = {"x": 16, "y": 16, "width": 96, "height": 32}


def solid(width, height, rgba):
    return [rgba] * (width * height)


def write_pair(root, renderer, scenario, bare, glass, width=WIDTH, height=HEIGHT):
    directory = root / renderer
    directory.mkdir(parents=True, exist_ok=True)
    parity.write_png(directory / f"{scenario}-bare.png", width, height, bare)
    parity.write_png(directory / f"{scenario}-glass.png", width, height, glass)


def manifest(root, scenarios=("a", "b"), threshold=0.0):
    data = {
        "schemaVersion": 2,
        "capture": {
            "width": WIDTH,
            "height": HEIGHT,
            "comparisonRegion": {"x": 0, "y": 0, "width": WIDTH, "height": HEIGHT},
            "edgePanel": EDGE_PANEL,
        },
        "scenarios": [
            *[{"id": scenario, "background": f"{scenario}.png", "purpose": "interior"} for scenario in scenarios],
            {"id": "edge", "background": "edge.png", "purpose": "edge"},
        ],
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
            "maximumEdgeWidthPixels": 2.5,
            "maximumEdgeLuminanceLift": 0.12,
        },
    }
    path = root / "manifest.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    black = solid(WIDTH, HEIGHT, (0, 0, 0, 255))
    gray = solid(WIDTH, HEIGHT, (96, 96, 96, 255))
    for scenario in ("a", "b", "edge"):
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
    black = solid(WIDTH, HEIGHT, (0, 0, 0, 255))
    gray = solid(WIDTH, HEIGHT, (96, 96, 96, 255))
    red = solid(WIDTH, HEIGHT, (255, 0, 0, 255))
    for scenario in ("a", "b", "edge"):
        write_pair(root, "web", scenario, black, gray)
        write_pair(root, "unity", scenario, black, red if scenario == "b" else gray)
    report = parity.compare(manifest(root, threshold=0.01), root / "web", root / "unity", root / "out")
    assert report["overall"]["passed"] is False
    assert report["overall"]["worstScenario"] == "b"
    assert report["scenarios"][1]["score"] > report["scenarios"][0]["score"]
print("PASS: worst-background regression cannot hide behind the aggregate")


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    black = solid(WIDTH, HEIGHT, (0, 0, 0, 255))
    gray = solid(WIDTH, HEIGHT, (96, 96, 96, 255))
    write_pair(root, "web", "a", black, gray)
    write_pair(root, "unity", "a", black, gray)
    try:
        parity.compare(manifest(root), root / "web", root / "unity", root / "out")
    except ValueError as error:
        assert "capture matrix mismatch" in str(error)
    else:
        raise AssertionError("missing scenarios must fail closed")
print("PASS: incomplete capture matrices are rejected")


def pane_with_edge(edge_width):
    pixels = solid(WIDTH, HEIGHT, (0, 0, 0, 255))
    for y in range(EDGE_PANEL["y"], EDGE_PANEL["y"] + EDGE_PANEL["height"]):
        for x in range(EDGE_PANEL["x"], EDGE_PANEL["x"] + EDGE_PANEL["width"]):
            distance = min(x - EDGE_PANEL["x"], EDGE_PANEL["x"] + EDGE_PANEL["width"] - 1 - x)
            pixels[y * WIDTH + x] = (224, 224, 224, 255) if distance < edge_width else (96, 96, 96, 255)
    return pixels


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    black = solid(WIDTH, HEIGHT, (0, 0, 0, 255))
    gray = solid(WIDTH, HEIGHT, (96, 96, 96, 255))
    for scenario in ("a", "b"):
        write_pair(root, "web", scenario, black, gray)
        write_pair(root, "unity", scenario, black, gray)
    write_pair(root, "web", "edge", black, pane_with_edge(1))
    write_pair(root, "unity", "edge", black, pane_with_edge(8))
    report = parity.compare(manifest(root), root / "web", root / "unity", root / "out")
    assert report["overall"]["passed"] is False
    assert report["edgeRestraint"]["unity"]["maximumWidthPixels"] > 2.5
print("PASS: broad Unity rims fail the independent edge-restraint budget")


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
