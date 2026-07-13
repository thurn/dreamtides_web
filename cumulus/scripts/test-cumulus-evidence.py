#!/usr/bin/env python3

import copy
import importlib.util
import json
from pathlib import Path
import shutil
import struct
import tempfile
import zlib

MODULE_PATH = Path(__file__).with_name("cumulus_evidence.py")
spec = importlib.util.spec_from_file_location("cumulus_evidence", MODULE_PATH)
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


def chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def png(width=512, height=288, corrupt_idat=False) -> bytes:
    raw = b"".join(b"\x00" + b"\x00\x00\x00\xff" * width for _ in range(height))
    compressed = b"not-zlib" if corrupt_idat else zlib.compress(raw)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def metric(name, comparison, threshold):
    if comparison == "greaterThanOrEqual":
        value = threshold + 1
    elif comparison == "lessThanOrEqual":
        value = max(0, threshold - 0.01)
    else:
        value = threshold
    return {"metricName": name, "measuredValue": value, "measuredValueText": str(value), "measuredValueFinite": True,
            "comparison": comparison, "threshold": threshold, "passed": True, "phaseA": "a", "phaseB": "b",
            "graphicsApi": "Metal", "deviceName": "Fixture GPU"}


def build_fixture(root: Path):
    payload = {"schemaVersion": 1, "metrics": [metric(name, *contract) for name, contract in evidence.EXPECTED_METRICS.items()]}
    (root / "render-metrics.json").write_text(json.dumps(payload), encoding="utf-8")
    for name in evidence.EXPECTED_CAPTURES:
        (root / name).write_bytes(png())
    return payload


def rejects(label, mutation):
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        payload = build_fixture(root)
        mutation(root, payload)
        try:
            evidence.validate_gpu(root / "render-metrics.json", root)
        except ValueError:
            print(f"PASS: rejected {label}")
            return
        raise AssertionError(f"accepted {label}")


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary); build_fixture(root); evidence.validate_gpu(root / "render-metrics.json", root)
print("PASS: accepted exact GPU evidence")

rejects("wrong PNG dimensions", lambda root, payload: (root / next(iter(evidence.EXPECTED_CAPTURES))).write_bytes(png(511, 288)))
def corrupt_crc(root, payload):
    path = root / next(iter(evidence.EXPECTED_CAPTURES)); data = bytearray(path.read_bytes()); data[29] ^= 1; path.write_bytes(data)
rejects("corrupt PNG CRC", corrupt_crc)
rejects("corrupt PNG IDAT", lambda root, payload: (root / next(iter(evidence.EXPECTED_CAPTURES))).write_bytes(png(corrupt_idat=True)))
rejects("missing capture", lambda root, payload: (root / next(iter(evidence.EXPECTED_CAPTURES))).unlink())
rejects("extra capture", lambda root, payload: (root / "extra.png").write_bytes(png()))
def rewrite(root, payload): (root / "render-metrics.json").write_text(json.dumps(payload), encoding="utf-8")
rejects("duplicate metric", lambda root, payload: (payload["metrics"].__setitem__(1, copy.deepcopy(payload["metrics"][0])), rewrite(root, payload)))
rejects("extra metric", lambda root, payload: (payload["metrics"].append(copy.deepcopy(payload["metrics"][0])), rewrite(root, payload)))
rejects("altered threshold", lambda root, payload: (payload["metrics"][0].__setitem__("threshold", 99), rewrite(root, payload)))
rejects("altered comparison", lambda root, payload: (payload["metrics"][0].__setitem__("comparison", "equal"), rewrite(root, payload)))
def forge(root, payload):
    m=payload["metrics"][0]; m["measuredValue"]=-1; m["measuredValueText"]="-1"; m["passed"]=True; rewrite(root,payload)
rejects("forged passed verdict", forge)
for field in ("phaseA", "phaseB"):
    for label, invalid in (("null", None), ("empty", ""), ("non-string", 7)):
        def invalidate_phase(root, payload, field=field, invalid=invalid):
            payload["metrics"][0][field] = invalid
            rewrite(root, payload)
        rejects(f"{label} {field}", invalidate_phase)
print("17 evidence checks passed; 0 failed")
