import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor

import app as app_module
from app import add_image_contained, build_ihc_raster_pages, build_raster_export, normalized_ihc_roi, resolve_export_content


class IhcRoiTests(unittest.TestCase):
    def test_zero_and_out_of_bounds_values_are_preserved_then_clamped(self):
        self.assertEqual(normalized_ihc_roi({"ihc_roi_x": 0, "ihc_roi_y": 0}), (0.0, 0.0, 0.3, 0.28))
        self.assertEqual(normalized_ihc_roi({"ihc_roi_x": 0.9, "ihc_roi_y": 0.9, "ihc_roi_w": 0.4, "ihc_roi_h": 0.4}), (0.6, 0.6, 0.4, 0.4))


class IhcRasterSettingsTests(unittest.TestCase):
    def test_dark_contain_export_uses_the_selected_background(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "square.png"
            Image.new("RGB", (60, 60), (220, 30, 30)).save(image_path)
            manifest = {
                "images": [
                    {"source_path": str(image_path)},
                    {"source_path": str(image_path)},
                ]
            }
            [page] = build_ihc_raster_pages(
                manifest,
                {
                    "group_count": 1,
                    "rows_per_slide": 1,
                    "background": "black",
                    "fit_mode": "contain",
                    "show_sample_name": False,
                    "ihc_draw_connectors": False,
                },
            )

            self.assertEqual(page.getpixel((0, 0)), (0, 0, 0))
            self.assertEqual(page.getpixel((150, page.height // 2)), (0, 0, 0))
            sampled_pixels = (
                page.getpixel((x, y))
                for y in range(0, page.height, 20)
                for x in range(0, page.width, 20)
            )
            self.assertIn((220, 30, 30), sampled_pixels)


class ExportIsolationTests(unittest.TestCase):
    def test_manual_export_filters_unchecked_channels(self):
        manifest = {"images": [{"filename": str(index)} for index in range(4)]}
        content = resolve_export_content(
            manifest,
            {
                "layout_mode": "manual",
                "group_count": 1,
                "images_per_group": 4,
                "channel_order": ["slot01", "slot03"],
            },
        )

        self.assertEqual(content["channel_order"], ["slot01", "slot03"])
        self.assertEqual([image["channel"] for image in content["groups"][0]["images"]], ["slot01", "slot03"])

    def test_exports_are_unique_and_scoped_to_the_job(self):
        job_id = "a" * 32
        with tempfile.TemporaryDirectory() as temp_dir:
            with (
                patch.object(app_module, "EXPORT_DIR", Path(temp_dir)),
                patch.object(app_module, "build_ihc_raster_pages", return_value=[Image.new("RGB", (8, 8))]),
            ):
                first = build_raster_export({"job_id": job_id}, {"figure_type": "ihc"}, "png")
                second = build_raster_export({"job_id": job_id}, {"figure_type": "ihc"}, "png")

        self.assertEqual(first.parent.name, job_id)
        self.assertNotEqual(first.name, second.name)

    def test_contained_pptx_image_gets_an_explicit_cell_background(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "wide.png"
            Image.new("RGB", (80, 40), (220, 30, 30)).save(image_path)
            presentation = Presentation()
            slide = presentation.slides.add_slide(presentation.slide_layouts[6])

            add_image_contained(slide, image_path, 1, 1, 2, 2, RGBColor(0, 0, 0))

        self.assertEqual(len(slide.shapes), 2)
        self.assertEqual(tuple(slide.shapes[0].fill.fore_color.rgb), (0, 0, 0))


if __name__ == "__main__":
    unittest.main()
