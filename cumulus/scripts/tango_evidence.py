#!/usr/bin/env python3

import argparse
import json
import math
from pathlib import Path
import struct
import sys
import zlib


FACT_PHASES = ("bothPanesEnabled", "mainPaneDisabled", "independentPaneDisabled", "onGlassButtonDisabled")
EXPECTED_METRICS = {
    "liveBackdropDelta.LiveGlassA": ("greaterThanOrEqual", 0.015),
    "liveBackdropDelta.LiveGlassB": ("greaterThanOrEqual", 0.015),
    "surfaceContribution.LiveGlassA": ("greaterThanOrEqual", 0.02),
    "surfaceContribution.LiveGlassB": ("greaterThanOrEqual", 0.02),
    "blurEdgeEnergyRatioMaximum": ("lessThanOrEqual", 0.65),
    "blurEdgeEnergyRatioMinimum": ("greaterThanOrEqual", 0.005),
    **{f"sharedGraphRecords.{phase}": ("equal", 1.0) for phase in FACT_PHASES},
    **{f"horizontalPasses.{phase}": ("equal", 1.0) for phase in FACT_PHASES},
    **{f"verticalPasses.{phase}": ("equal", 1.0) for phase in FACT_PHASES},
    "onGlassAdditionalPasses": ("equal", 0.0),
    "onGlassBackdropDelta": ("greaterThanOrEqual", 0.005),
    "onGlassBackdropCorrelation": ("greaterThanOrEqual", 0.5),
    "bevelLightDelta": ("greaterThanOrEqual", 0.02),
    "transmissionLightDeltaRatio": ("lessThanOrEqual", 0.25),
    "frameShadowDelta": ("greaterThanOrEqual", 0.02),
    "labelContrast.bright": ("greaterThanOrEqual", 4.5),
    "labelContrast.gold": ("greaterThanOrEqual", 4.5),
    "labelContrast.dark": ("greaterThanOrEqual", 4.5),
    "fallbackInteriorLuminanceMinimum": ("greaterThanOrEqual", 0.02),
    "fallbackInteriorLuminanceMaximum": ("lessThanOrEqual", 0.8),
}
EXPECTED_CAPTURES = {
    "spinner-a.png", "spinner-b.png", "spinner-c.png",
    "main-pane-disabled.png", "independent-pane-disabled.png",
    "button-parent-a.png", "button-parent-b.png", "button-a.png", "button-b.png",
    "light-a.png", "light-b.png", "shadow-on.png", "shadow-off.png",
    "label-bright-backdrop.png", "label-bright.png",
    "label-gold-backdrop.png", "label-gold.png",
    "label-dark-backdrop.png", "label-dark.png", "fallback.png",
}
METRIC_FIELDS = {
    "metricName", "measuredValue", "measuredValueText", "measuredValueFinite",
    "comparison", "threshold", "passed", "phaseA", "phaseB", "graphicsApi", "deviceName",
}


def verdict(value: float, comparison: str, threshold: float) -> bool:
    if comparison == "greaterThanOrEqual":
        return value >= threshold
    if comparison == "lessThanOrEqual":
        return value <= threshold
    if comparison == "equal":
        return value == threshold
    raise ValueError(f"unknown comparison {comparison!r}")


def validate_png(path: Path) -> None:
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(f"invalid PNG signature: {path.name}")
    offset = 8
    chunks = []
    idat = bytearray()
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError(f"truncated PNG chunk: {path.name}")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + length
        if end > len(data):
            raise ValueError(f"truncated PNG payload: {path.name}")
        payload = data[offset + 8:offset + 8 + length]
        expected_crc = struct.unpack(">I", data[offset + 8 + length:end])[0]
        actual_crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise ValueError(f"PNG CRC mismatch: {path.name}")
        chunks.append((kind, payload))
        if kind == b"IDAT":
            idat.extend(payload)
        offset = end
        if kind == b"IEND":
            break
    if offset != len(data) or not chunks or chunks[0][0] != b"IHDR" or chunks[-1][0] != b"IEND":
        raise ValueError(f"invalid PNG chunk order/trailing data: {path.name}")
    ihdr = chunks[0][1]
    if len(ihdr) != 13:
        raise ValueError(f"invalid PNG IHDR: {path.name}")
    width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", ihdr)
    if (width, height, depth, color, compression, filtering, interlace) != (512, 288, 8, 6, 0, 0, 0):
        raise ValueError(f"PNG format/dimensions mismatch: {path.name}")
    if not idat:
        raise ValueError(f"PNG has no IDAT: {path.name}")
    try:
        raw = zlib.decompress(bytes(idat))
    except zlib.error as error:
        raise ValueError(f"PNG IDAT is not decodable: {path.name}: {error}") from error
    stride = 1 + width * 4
    if len(raw) != height * stride or any(raw[row * stride] > 4 for row in range(height)):
        raise ValueError(f"PNG decoded scanlines are malformed: {path.name}")


def validate_gpu(metrics_path: Path, artifact_root: Path) -> None:
    try:
        payload = json.loads(metrics_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid render metrics: {error}") from error
    if set(payload) != {"schemaVersion", "metrics"} or payload["schemaVersion"] != 1 or not isinstance(payload["metrics"], list):
        raise ValueError("render metrics root schema is malformed")
    metrics = payload["metrics"]
    if len(metrics) != len(EXPECTED_METRICS):
        raise ValueError(f"render metric count mismatch: expected {len(EXPECTED_METRICS)}, found {len(metrics)}")
    by_name = {}
    for index, metric in enumerate(metrics):
        if not isinstance(metric, dict) or set(metric) != METRIC_FIELDS:
            raise ValueError(f"render metric {index} schema is malformed")
        name = metric["metricName"]
        if name in by_name:
            raise ValueError(f"duplicate render metric: {name}")
        if name not in EXPECTED_METRICS:
            raise ValueError(f"unexpected render metric: {name}")
        comparison, threshold = EXPECTED_METRICS[name]
        if metric["comparison"] != comparison:
            raise ValueError(f"comparison mismatch for {name}")
        if not isinstance(metric["threshold"], (int, float)) or isinstance(metric["threshold"], bool) or float(metric["threshold"]) != threshold:
            raise ValueError(f"threshold mismatch for {name}")
        value = metric["measuredValue"]
        if metric["measuredValueFinite"] is not True or not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)):
            raise ValueError(f"non-finite measurement for {name}")
        if not isinstance(metric["measuredValueText"], str) or float(metric["measuredValueText"]) != float(value):
            raise ValueError(f"measurement text mismatch for {name}")
        computed = verdict(float(value), comparison, threshold)
        if metric["passed"] is not computed:
            raise ValueError(f"forged verdict for {name}")
        if not computed:
            raise ValueError(f"render metric failed: {name}")
        if not isinstance(metric["graphicsApi"], str) or not metric["graphicsApi"] or not isinstance(metric["deviceName"], str) or not metric["deviceName"]:
            raise ValueError(f"missing GPU identity for {name}")
        if not isinstance(metric["phaseA"], str) or not metric["phaseA"] or not isinstance(metric["phaseB"], str) or not metric["phaseB"]:
            raise ValueError(f"missing render phase identity for {name}")
        by_name[name] = metric
    if set(by_name) != set(EXPECTED_METRICS):
        raise ValueError("render metric names do not exactly match the contract")
    captures = {path.name for path in artifact_root.glob("*.png")}
    if captures != EXPECTED_CAPTURES:
        missing = sorted(EXPECTED_CAPTURES - captures)
        extra = sorted(captures - EXPECTED_CAPTURES)
        raise ValueError(f"capture set mismatch: missing={missing}, extra={extra}")
    for name in sorted(EXPECTED_CAPTURES):
        validate_png(artifact_root / name)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("metrics")
    parser.add_argument("artifact_root")
    args = parser.parse_args()
    try:
        validate_gpu(Path(args.metrics), Path(args.artifact_root))
    except (OSError, ValueError) as error:
        print(f"tango-evidence: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
