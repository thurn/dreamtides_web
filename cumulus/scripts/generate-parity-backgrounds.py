#!/usr/bin/env python3

"""Generate the deterministic cross-renderer glass-parity backgrounds."""

import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from glass_parity import write_png


WIDTH = 512
HEIGHT = 288
OUTPUT = Path(__file__).resolve().parents[1] / "Assets/CumulusMvp/Parity/Resources/CumulusParityBackgrounds"


def clamp(value):
    return max(0, min(255, round(value)))


def fine_grid():
    pixels = []
    for y in range(HEIGHT):
        for x in range(WIDTH):
            checker = 54 if ((x // 8) + (y // 8)) % 2 else -34
            vertical = 35 if x % 37 < 3 else 0
            horizontal = 28 if y % 29 < 2 else 0
            pixels.append((clamp(72 + checker + vertical), clamp(92 - checker // 2 + horizontal), clamp(148 + checker), 255))
    return pixels


def warm_bands():
    pixels = []
    for y in range(HEIGHT):
        for x in range(WIDTH):
            horizon = y / (HEIGHT - 1)
            wave = math.sin(x * 0.038 + y * 0.012) * 34 + math.sin(x * 0.011 - y * 0.05) * 18
            sun = max(0.0, 1.0 - math.hypot(x - 382, y - 74) / 88.0)
            ridge = 42 if y > 172 + math.sin(x * 0.025) * 31 else 0
            pixels.append((clamp(162 + 66 * sun + wave - ridge), clamp(72 + 92 * (1 - horizon) + 34 * sun - ridge), clamp(48 + 58 * (1 - horizon) - wave * 0.25), 255))
    return pixels


def cool_radial():
    pixels = []
    for y in range(HEIGHT):
        for x in range(WIDTH):
            distance = math.hypot(x - 255, y - 140)
            ring = math.sin(distance * 0.17) * 42
            spokes = math.sin(math.atan2(y - 140, x - 255) * 12) * 25
            grain = ((x * 73 + y * 151 + x * y * 3) % 31) - 15
            pixels.append((clamp(36 + ring * 0.2 + grain), clamp(86 + spokes + grain), clamp(142 + ring + grain), 255))
    return pixels


def edge_neutral():
    """A flat field that isolates the pane edge from blur and scene detail."""
    return [(72, 78, 96, 255)] * (WIDTH * HEIGHT)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, factory in (
        ("fine-grid", fine_grid),
        ("warm-bands", warm_bands),
        ("cool-radial", cool_radial),
        ("edge-neutral", edge_neutral),
    ):
        path = OUTPUT / f"{name}.png"
        write_png(path, WIDTH, HEIGHT, factory())
        print(path)


if __name__ == "__main__":
    main()
