#!/usr/bin/env python3

import importlib.util
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("scene_compare.py")
SPEC = importlib.util.spec_from_file_location("scene_compare", SCRIPT)
scene_compare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scene_compare)


class SceneCompareTests(unittest.TestCase):
    def test_writes_metrics_and_visual_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            web = root / "web.png"
            unity = root / "unity.png"
            scene_compare.write_png(web, 2, 1, [(10, 20, 30, 255), (40, 50, 60, 255)])
            scene_compare.write_png(unity, 2, 1, [(10, 20, 30, 255), (50, 40, 60, 255)])

            report = scene_compare.compare(web, unity, root / "out")

            self.assertEqual(report["dimensions"], {"width": 2, "height": 1})
            self.assertAlmostEqual(report["metrics"]["meanAbsoluteError"], 20 / 6)
            self.assertAlmostEqual(report["metrics"]["differingPixelFraction"], 0.5)
            self.assertTrue((root / "out" / "difference-4x.png").is_file())
            self.assertTrue((root / "out" / "split-web-left-unity-right.png").is_file())
            self.assertTrue((root / "out" / "report.json").is_file())

    def test_rejects_dimension_mismatch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            web = root / "web.png"
            unity = root / "unity.png"
            scene_compare.write_png(web, 1, 1, [(0, 0, 0, 255)])
            scene_compare.write_png(unity, 2, 1, [(0, 0, 0, 255)] * 2)
            with self.assertRaisesRegex(ValueError, "dimensions differ"):
                scene_compare.compare(web, unity, root / "out")

    def test_rejects_translucent_capture_pixels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            web = root / "web.png"
            unity = root / "unity.png"
            scene_compare.write_png(web, 1, 1, [(10, 20, 30, 255)])
            scene_compare.write_png(unity, 1, 1, [(10, 20, 30, 127)])

            with self.assertRaisesRegex(
                    ValueError,
                    "unity capture must be opaque: 1 translucent pixels"):
                scene_compare.compare(web, unity, root / "out")


if __name__ == "__main__":
    unittest.main()
