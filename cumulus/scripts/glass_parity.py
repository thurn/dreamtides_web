#!/usr/bin/env python3

"""Compare paired web and Unity glass captures over shared backgrounds."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import zlib


METRIC_NAMES = (
    "effectMae",
    "effectRmse",
    "edgeAttenuationError",
    "meanColorShiftError",
)


def _chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def write_png(path, width, height, pixels):
    if width <= 0 or height <= 0 or len(pixels) != width * height:
        raise ValueError("PNG dimensions do not match its pixel buffer")
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for pixel in pixels[y * width:(y + 1) * width]:
            if len(pixel) != 4 or any(not isinstance(channel, int) or channel < 0 or channel > 255 for channel in pixel):
                raise ValueError("PNG pixels must be four 8-bit integer channels")
            raw.extend(pixel)
    path.parent.mkdir(parents=True, exist_ok=True)
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header) + _chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + _chunk(b"IEND", b""))


def read_png(path):
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(f"invalid PNG signature: {path}")
    offset = 8
    idat = bytearray()
    width = height = channels = None
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError(f"truncated PNG chunk: {path}")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        end = offset + 12 + length
        if end > len(data):
            raise ValueError(f"truncated PNG payload: {path}")
        expected = struct.unpack(">I", data[offset + 8 + length:end])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != expected:
            raise ValueError(f"PNG CRC mismatch: {path}")
        if kind == b"IHDR":
            width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if depth != 8 or color not in (2, 6) or (compression, filtering, interlace) != (0, 0, 0):
                raise ValueError(f"PNG must be non-interlaced 8-bit RGB or RGBA: {path}")
            channels = 3 if color == 2 else 4
        elif kind == b"IDAT":
            idat.extend(payload)
        elif kind == b"IEND":
            offset = end
            break
        offset = end
    if width is None or height is None or offset != len(data):
        raise ValueError(f"malformed PNG structure: {path}")
    decoded = zlib.decompress(bytes(idat))
    stride = width * channels
    if len(decoded) != height * (stride + 1):
        raise ValueError(f"malformed PNG scanline length: {path}")
    rows = []
    previous = bytearray(stride)
    source = 0
    for _ in range(height):
        filter_type = decoded[source]
        source += 1
        scanline = bytearray(decoded[source:source + stride])
        source += stride
        if filter_type > 4:
            raise ValueError(f"unsupported PNG filter: {path}")
        for index in range(stride):
            left = scanline[index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 1:
                scanline[index] = (scanline[index] + left) & 255
            elif filter_type == 2:
                scanline[index] = (scanline[index] + up) & 255
            elif filter_type == 3:
                scanline[index] = (scanline[index] + ((left + up) // 2)) & 255
            elif filter_type == 4:
                estimate = left + up - upper_left
                distances = (abs(estimate - left), abs(estimate - up), abs(estimate - upper_left))
                predictor = (left, up, upper_left)[distances.index(min(distances))]
                scanline[index] = (scanline[index] + predictor) & 255
        for index in range(0, stride, channels):
            pixel = tuple(scanline[index:index + channels])
            rows.append(pixel if channels == 4 else pixel + (255,))
        previous = scanline
    return width, height, rows


def _finite_number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise ValueError(f"{label} must be a finite number")
    return float(value)


def load_manifest(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid manifest: {error}") from error
    if set(data) != {"schemaVersion", "capture", "scenarios", "metrics", "budget"} or data["schemaVersion"] != 1:
        raise ValueError("manifest root does not match schema version 1")
    capture = data["capture"]
    if set(capture) != {"width", "height", "comparisonRegion"}:
        raise ValueError("capture contract is malformed")
    width, height = capture["width"], capture["height"]
    if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        raise ValueError("capture dimensions must be positive integers")
    region = capture["comparisonRegion"]
    if set(region) != {"x", "y", "width", "height"} or any(not isinstance(region[key], int) for key in region):
        raise ValueError("comparison region is malformed")
    if region["x"] < 0 or region["y"] < 0 or region["width"] <= 1 or region["height"] <= 1 or region["x"] + region["width"] > width or region["y"] + region["height"] > height:
        raise ValueError("comparison region lies outside the capture")
    scenarios = data["scenarios"]
    if not isinstance(scenarios, list) or len(scenarios) < 2:
        raise ValueError("at least two background scenarios are required")
    identifiers = []
    for scenario in scenarios:
        if not isinstance(scenario, dict) or set(scenario) != {"id", "background"}:
            raise ValueError("scenario contract is malformed")
        identifier = scenario["id"]
        if not isinstance(identifier, str) or not identifier or not all(character.isalnum() or character in "-_" for character in identifier):
            raise ValueError("scenario id is invalid")
        identifiers.append(identifier)
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("scenario ids must be unique")
    if set(data["metrics"]) != set(METRIC_NAMES):
        raise ValueError("metric names do not match the parity contract")
    total_weight = 0.0
    for name in METRIC_NAMES:
        definition = data["metrics"][name]
        if not isinstance(definition, dict) or set(definition) != {"weight"}:
            raise ValueError(f"metric definition is malformed: {name}")
        weight = _finite_number(definition["weight"], f"{name} weight")
        if weight < 0:
            raise ValueError("metric weights cannot be negative")
        total_weight += weight
    if abs(total_weight - 1.0) > 1e-9:
        raise ValueError("metric weights must sum to 1")
    if set(data["budget"]) != {"maximumMeanScore", "maximumWorstScore", "maximumScenarioScore"}:
        raise ValueError("budget contract is malformed")
    for name, value in data["budget"].items():
        if _finite_number(value, name) < 0:
            raise ValueError("score budgets cannot be negative")
    return data


def _linear(channel):
    value = channel / 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def _region_indices(width, region):
    for y in range(region["y"], region["y"] + region["height"]):
        for x in range(region["x"], region["x"] + region["width"]):
            yield y * width + x


def _effect(bare, glass):
    return [tuple(_linear(glass[index][channel]) - _linear(bare[index][channel]) for channel in range(3)) for index in range(len(bare))]


def _luminance(pixel):
    return pixel[0] * 0.2126 + pixel[1] * 0.7152 + pixel[2] * 0.0722


def _edge_energy(pixels, width, region):
    luminance = [_luminance(pixel) for pixel in pixels]
    total = 0.0
    count = 0
    x_max = region["x"] + region["width"]
    y_max = region["y"] + region["height"]
    for y in range(region["y"], y_max):
        for x in range(region["x"], x_max):
            index = y * width + x
            if x + 1 < x_max:
                total += abs(luminance[index] - luminance[index + 1])
                count += 1
            if y + 1 < y_max:
                total += abs(luminance[index] - luminance[index + width])
                count += 1
    return total / count


def _scenario_metrics(web_bare, web_glass, unity_bare, unity_glass, width, region):
    web_effect = _effect(web_bare, web_glass)
    unity_effect = _effect(unity_bare, unity_glass)
    indices = list(_region_indices(width, region))
    squared = absolute = 0.0
    heat = []
    for web, unity in zip(web_effect, unity_effect):
        errors = [abs(web[channel] - unity[channel]) for channel in range(3)]
        heat.append(max(errors))
    for index in indices:
        for channel in range(3):
            difference = web_effect[index][channel] - unity_effect[index][channel]
            absolute += abs(difference)
            squared += difference * difference
    sample_count = len(indices) * 3
    web_bare_linear = [tuple(_linear(channel) for channel in pixel[:3]) for pixel in web_bare]
    web_glass_linear = [tuple(_linear(channel) for channel in pixel[:3]) for pixel in web_glass]
    unity_bare_linear = [tuple(_linear(channel) for channel in pixel[:3]) for pixel in unity_bare]
    unity_glass_linear = [tuple(_linear(channel) for channel in pixel[:3]) for pixel in unity_glass]
    def attenuation(bare, glass):
        denominator = _edge_energy(bare, width, region)
        return _edge_energy(glass, width, region) / denominator if denominator > 1e-9 else 1.0
    web_shift = [sum(web_effect[index][channel] for index in indices) / len(indices) for channel in range(3)]
    unity_shift = [sum(unity_effect[index][channel] for index in indices) / len(indices) for channel in range(3)]
    metrics = {
        "effectMae": absolute / sample_count,
        "effectRmse": math.sqrt(squared / sample_count),
        "edgeAttenuationError": min(1.0, abs(attenuation(web_bare_linear, web_glass_linear) - attenuation(unity_bare_linear, unity_glass_linear))),
        "meanColorShiftError": math.sqrt(sum((web_shift[channel] - unity_shift[channel]) ** 2 for channel in range(3)) / 3.0),
    }
    return metrics, heat


def compare(manifest_path, web_directory, unity_directory, output_directory):
    contract = load_manifest(manifest_path)
    width, height = contract["capture"]["width"], contract["capture"]["height"]
    region = contract["capture"]["comparisonRegion"]
    output_directory.mkdir(parents=True, exist_ok=True)
    for stale in output_directory.glob("*-effect-diff.png"):
        stale.unlink()
    for stale_name in ("report.json", "summary.md"):
        stale = output_directory / stale_name
        if stale.exists():
            stale.unlink()
    expected_capture_names = {
        f"{scenario['id']}-{mode}.png"
        for scenario in contract["scenarios"]
        for mode in ("bare", "glass")
    }
    for renderer, directory in (("web", web_directory), ("unity", unity_directory)):
        actual_capture_names = {path.name for path in directory.glob("*.png")}
        if actual_capture_names != expected_capture_names:
            missing = sorted(expected_capture_names - actual_capture_names)
            extra = sorted(actual_capture_names - expected_capture_names)
            raise ValueError(f"{renderer} capture matrix mismatch: missing={missing}, extra={extra}")
    results = []
    for scenario in contract["scenarios"]:
        identifier = scenario["id"]
        captures = {}
        input_hashes = {}
        for renderer, directory in (("web", web_directory), ("unity", unity_directory)):
            for mode in ("bare", "glass"):
                path = directory / f"{identifier}-{mode}.png"
                if not path.is_file():
                    raise ValueError(f"missing capture: {path}")
                image_width, image_height, pixels = read_png(path)
                if (image_width, image_height) != (width, height):
                    raise ValueError(f"capture dimensions differ from manifest: {path}")
                captures[f"{renderer}_{mode}"] = pixels
                input_hashes[f"{renderer}.{mode}"] = hashlib.sha256(path.read_bytes()).hexdigest()
        metrics, heat = _scenario_metrics(
            captures["web_bare"], captures["web_glass"], captures["unity_bare"], captures["unity_glass"], width, region)
        score = sum(metrics[name] * contract["metrics"][name]["weight"] for name in METRIC_NAMES)
        heat_pixels = []
        for value in heat:
            intensity = max(0, min(255, round(value * 255 * 4)))
            heat_pixels.append((intensity, min(255, intensity // 3), 0, 255))
        write_png(output_directory / f"{identifier}-effect-diff.png", width, height, heat_pixels)
        results.append({"scenario": identifier, "score": score, "metrics": metrics, "inputSha256": input_hashes})
    mean_score = sum(item["score"] for item in results) / len(results)
    worst = max(results, key=lambda item: item["score"])
    budget = contract["budget"]
    passed = (
        mean_score <= budget["maximumMeanScore"]
        and worst["score"] <= budget["maximumWorstScore"]
        and all(item["score"] <= budget["maximumScenarioScore"] for item in results)
    )
    report = {
        "schemaVersion": 1,
        "manifest": str(manifest_path),
        "comparisonRegion": region,
        "scenarios": results,
        "overall": {
            "meanScore": mean_score,
            "worstScore": worst["score"],
            "worstScenario": worst["scenario"],
            "budget": budget,
            "passed": passed,
        },
    }
    (output_directory / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    lines = [
        "# Cumulus glass parity",
        "",
        "| Background | Score | Effect MAE | Effect RMSE | Edge attenuation error | Mean color-shift error |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for item in results:
        metrics = item["metrics"]
        lines.append(
            f"| {item['scenario']} | {item['score']:.6f} | {metrics['effectMae']:.6f} | "
            f"{metrics['effectRmse']:.6f} | {metrics['edgeAttenuationError']:.6f} | "
            f"{metrics['meanColorShiftError']:.6f} |")
    lines.extend([
        "",
        f"Mean score: **{mean_score:.6f}** (budget {budget['maximumMeanScore']:.6f})",
        "",
        f"Worst score: **{worst['score']:.6f}** on `{worst['scenario']}` (budget {budget['maximumWorstScore']:.6f})",
        "",
        f"Verdict: **{'PASS' if passed else 'FAIL'}**",
        "",
    ])
    (output_directory / "summary.md").write_text("\n".join(lines), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--unity", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = compare(args.manifest, args.web, args.unity, args.output)
    except (OSError, ValueError, zlib.error) as error:
        print(f"glass-parity: {error}", file=sys.stderr)
        return 1
    overall = report["overall"]
    print(f"glass-parity: mean={overall['meanScore']:.6f} worst={overall['worstScore']:.6f} ({overall['worstScenario']}) passed={str(overall['passed']).lower()}")
    print(args.output / "report.json")
    return 0 if overall["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
