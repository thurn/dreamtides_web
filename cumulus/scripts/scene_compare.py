#!/usr/bin/env python3

"""Produce whole-frame metrics and visual artifacts for two scene captures."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from glass_parity import read_png, write_png


def compare(web_path, unity_path, output_directory):
    web_width, web_height, web = read_png(web_path)
    unity_width, unity_height, unity = read_png(unity_path)
    if (web_width, web_height) != (unity_width, unity_height):
        raise ValueError(
            f"capture dimensions differ: web={web_width}x{web_height}, "
            f"unity={unity_width}x{unity_height}")

    absolute_sum = squared_sum = maximum = 0
    differing_pixels = 0
    diff_pixels = []
    composite_pixels = []
    for index, (web_pixel, unity_pixel) in enumerate(zip(web, unity)):
        errors = [abs(web_pixel[channel] - unity_pixel[channel]) for channel in range(3)]
        pixel_error = max(errors)
        absolute_sum += sum(errors)
        squared_sum += sum(error * error for error in errors)
        maximum = max(maximum, pixel_error)
        differing_pixels += pixel_error > 0
        amplified = min(255, pixel_error * 4)
        diff_pixels.append((amplified, min(255, amplified // 4), 0, 255))
        selected = web_pixel if (index % web_width) < web_width // 2 else unity_pixel
        composite_pixels.append(selected[:3] + (255,))

    channel_count = web_width * web_height * 3
    pixel_count = web_width * web_height
    metrics = {
        "meanAbsoluteError": absolute_sum / channel_count,
        "rootMeanSquareError": math.sqrt(squared_sum / channel_count),
        "maximumChannelError": maximum,
        "differingPixelFraction": differing_pixels / pixel_count,
    }
    output_directory.mkdir(parents=True, exist_ok=True)
    write_png(output_directory / "difference-4x.png", web_width, web_height, diff_pixels)
    write_png(output_directory / "split-web-left-unity-right.png", web_width, web_height, composite_pixels)
    report = {
        "schemaVersion": 1,
        "dimensions": {"width": web_width, "height": web_height},
        "inputs": {
            "web": {"path": str(web_path), "sha256": hashlib.sha256(web_path.read_bytes()).hexdigest()},
            "unity": {"path": str(unity_path), "sha256": hashlib.sha256(unity_path.read_bytes()).hexdigest()},
        },
        "metrics": metrics,
    }
    (output_directory / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output_directory / "summary.md").write_text(
        "\n".join((
            "# Cumulus scene comparison",
            "",
            f"Capture: **{web_width} × {web_height}**",
            "",
            f"Mean absolute error: **{metrics['meanAbsoluteError']:.4f} / 255**",
            "",
            f"Root mean square error: **{metrics['rootMeanSquareError']:.4f} / 255**",
            "",
            f"Maximum channel error: **{maximum} / 255**",
            "",
            f"Differing pixels: **{metrics['differingPixelFraction']:.2%}**",
            "",
        )), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--unity", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = compare(args.web, args.unity, args.output)
    except (OSError, ValueError) as error:
        print(f"scene-compare: {error}", file=sys.stderr)
        return 1
    metrics = report["metrics"]
    print(
        f"scene-compare: mae={metrics['meanAbsoluteError']:.4f}/255 "
        f"rmse={metrics['rootMeanSquareError']:.4f}/255 "
        f"different={metrics['differingPixelFraction']:.2%}")
    print(args.output / "report.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
