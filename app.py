from __future__ import annotations

import json
import os
import re
import zipfile
import uuid
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Any

from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt


BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = BASE_DIR / "_fluoro_jobs"
EXPORT_DIR = BASE_DIR / "exports"
SUPPORTED_EXTENSIONS = {".tif", ".tiff", ".png", ".jpg", ".jpeg", ".bmp"}
MAX_PREVIEW_SIZE = (900, 650)
RASTER_DPI = 240

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024 * 1024


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def safe_path(raw_path: str) -> Path:
    normalized = raw_path.replace("\\", "/")
    parts = []
    for part in normalized.split("/"):
        part = part.strip()
        if not part or part in {".", ".."}:
            continue
        part = re.sub(r'[<>:"|?*\x00-\x1f]', "_", part)
        parts.append(part[:140] or "file")
    return Path(*parts) if parts else Path(f"image_{uuid.uuid4().hex[:8]}")


def is_supported_image(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS


def normalized_stem(filename: str) -> str:
    name = Path(filename).name
    for _ in range(4):
        before = name
        name = re.sub(r"(?i)\.(tif|tiff|png|jpe?g|bmp)$", "", name)
        name = re.sub(r"(?i)\.(tif|tiff|png|jpe?g|bmp)-\d+$", "", name)
        if name == before:
            break
    return name


def detect_channel(filename: str) -> dict[str, Any]:
    stem = normalized_stem(filename)
    lower = stem.lower()

    if re.search(r"(?i)(^|[_\-\s])(merged?|merge)(?=$|[_\-\s])", stem):
        return {"key": "Merged", "label": "Merge", "order": 10000}

    channel_match = re.search(r"(?i)(^|[_\-\s])ch(?:annel)?[_\-\s]*0*(\d+)(?=$|[_\-\s])", stem)
    if channel_match:
        channel_number = int(channel_match.group(2))
        return {
            "key": f"ch{channel_number:02d}",
            "label": f"ch{channel_number:02d}",
            "order": channel_number,
        }

    known_markers = [
        ("dapi", "DAPI", 0),
        ("hoechst", "Hoechst", 0),
        ("gfp", "GFP", 1),
        ("fitc", "FITC", 1),
        ("cy3", "Cy3", 2),
        ("tritc", "TRITC", 2),
        ("rfp", "RFP", 2),
        ("cy5", "Cy5", 3),
    ]
    for token, label, order in known_markers:
        if re.search(rf"(?i)(^|[_\-\s]){re.escape(token)}(?=$|[_\-\s])", lower):
            return {"key": label, "label": label, "order": order}

    return {"key": "Image", "label": "Image", "order": 5000}


def sample_key_from_path(relative_path: str) -> str:
    path = Path(relative_path.replace("\\", "/"))
    stem = normalized_stem(path.name)
    stem = re.sub(r"(?i)^merged?[_\-\s]*", "", stem)
    stem = re.sub(r"(?i)(^|[_\-\s])merged?(?=$|[_\-\s])", "_", stem)
    stem = re.sub(r"(?i)(^|[_\-\s])merge(?=$|[_\-\s])", "_", stem)
    stem = re.sub(r"(?i)(^|[_\-\s])ch(?:annel)?[_\-\s]*0*\d+(?=$|[_\-\s])", "_", stem)
    stem = re.sub(r"[_\-\s]+", "_", stem).strip("_- ")
    stem = stem or normalized_stem(path.name)
    parent = path.parent.as_posix()
    return f"{parent}/{stem}" if parent and parent != "." else stem


def channel_sort_key(channel: str) -> tuple[int, str]:
    if channel.lower() == "merged":
        return (10000, channel)
    match = re.match(r"(?i)^ch0*(\d+)$", channel)
    if match:
        return (int(match.group(1)), channel)
    return (5000, channel.lower())


def image_to_rgb(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if image.mode == "RGBA":
        background = Image.new("RGBA", image.size, (0, 0, 0, 255))
        return Image.alpha_composite(background, image).convert("RGB")
    if image.mode in {"RGB", "L"}:
        return image.convert("RGB")
    if image.mode.startswith("I") or image.mode == "F":
        return ImageOps.autocontrast(image.convert("L")).convert("RGB")
    return image.convert("RGB")


def prepare_image(source_path: Path, preview_path: Path) -> dict[str, Any]:
    with Image.open(source_path) as image:
        image.seek(0)
        image = ImageOps.exif_transpose(image)
        width, height = image.size
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview = image.copy()
        preview.thumbnail(MAX_PREVIEW_SIZE, Image.Resampling.LANCZOS)
        preview = image_to_rgb(preview)
        preview.save(preview_path, "PNG", compress_level=4)
    return {"width": width, "height": height}


def make_job_manifest(job_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    groups_by_key: dict[str, dict[str, Any]] = {}
    channels: dict[str, dict[str, Any]] = {}
    ordered_images: list[dict[str, Any]] = []

    for item in items:
        group_key = sample_key_from_path(item["relative_path"])
        channel_info = detect_channel(item["relative_path"])
        base_channel = channel_info["key"]
        group = groups_by_key.setdefault(
            group_key,
            {"key": group_key, "display": group_key, "images": []},
        )

        channel_key = base_channel
        used = {image["channel"] for image in group["images"]}
        duplicate_index = 2
        while channel_key in used:
            channel_key = f"{base_channel}_{duplicate_index}"
            duplicate_index += 1

        image_item = {
            **item,
            "channel": channel_key,
            "channel_label": channel_info["label"] if channel_key == base_channel else channel_key,
            "channel_order": channel_info["order"],
        }
        group["images"].append(image_item)
        ordered_images.append(image_item)
        channels.setdefault(
            channel_key,
            {
                "key": channel_key,
                "label": image_item["channel_label"],
                "order": channel_info["order"],
            },
        )

    ordered_groups = sorted(groups_by_key.values(), key=lambda group: group["key"].lower())
    for group in ordered_groups:
        group["images"].sort(key=lambda image: (image["channel_order"], image["channel"].lower()))

    ordered_channels = sorted(channels.values(), key=lambda item: (item["order"], item["key"].lower()))

    return {
        "job_id": job_id,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "images": ordered_images,
        "groups": ordered_groups,
        "channels": ordered_channels,
        "image_count": len(items),
    }


def manifest_path(job_id: str) -> Path:
    return JOBS_DIR / job_id / "manifest.json"


def load_manifest(job_id: str) -> dict[str, Any]:
    path = manifest_path(job_id)
    if not path.exists():
        raise FileNotFoundError(f"Job not found: {job_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def public_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    result = {
        "job_id": manifest["job_id"],
        "created_at": manifest["created_at"],
        "image_count": manifest["image_count"],
        "images": [],
        "channels": manifest["channels"],
        "groups": [],
    }
    for image in manifest.get("images", []):
        result["images"].append(
            {
                "relative_path": image["relative_path"],
                "filename": image["filename"],
                "width": image["width"],
                "height": image["height"],
                "preview_url": f"/api/jobs/{manifest['job_id']}/preview/{image['preview_name']}",
            }
        )
    for group in manifest["groups"]:
        result_group = {"key": group["key"], "display": group["display"], "images": []}
        for image in group["images"]:
            result_group["images"].append(
                {
                    "relative_path": image["relative_path"],
                    "filename": image["filename"],
                    "channel": image["channel"],
                    "channel_label": image["channel_label"],
                    "width": image["width"],
                    "height": image["height"],
                    "preview_url": f"/api/jobs/{manifest['job_id']}/preview/{image['preview_name']}",
                }
            )
        result["groups"].append(result_group)
    return result


def add_textbox(
    slide,
    text: str,
    left: float,
    top: float,
    width: float,
    height: float,
    font_size: int,
    color: RGBColor,
    bold: bool = False,
    align: PP_ALIGN = PP_ALIGN.LEFT,
    rotation: int | None = None,
) -> None:
    shape = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    if rotation is not None:
        shape.rotation = rotation
    frame = shape.text_frame
    frame.clear()
    frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    frame.margin_left = 0
    frame.margin_right = 0
    frame.margin_top = 0
    frame.margin_bottom = 0
    paragraph = frame.paragraphs[0]
    paragraph.alignment = align
    run = paragraph.add_run()
    run.text = text
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = color


def center_crop_image(source_path: Path, output_path: Path, target_aspect: float) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as source:
        rgb = image_to_rgb(source)
        width, height = rgb.size
        source_aspect = width / height
        if source_aspect > target_aspect:
            new_width = int(height * target_aspect)
            left = max(0, (width - new_width) // 2)
            box = (left, 0, left + new_width, height)
        else:
            new_height = int(width / target_aspect)
            top = max(0, (height - new_height) // 2)
            box = (0, top, width, top + new_height)
        rgb.crop(box).save(output_path, "PNG", compress_level=4)
    return output_path


def image_source_path(image: dict[str, Any]) -> Path:
    return Path(image.get("converted_path") or image["source_path"])


def add_image_cover(
    slide,
    image_path: Path,
    left: float,
    top: float,
    width: float,
    height: float,
    crop_dir: Path,
    cache: dict[str, Path],
) -> None:
    target_aspect = width / height
    cache_key = f"{image_path}|{target_aspect:.5f}"
    cropped_path = cache.get(cache_key)
    if cropped_path is None:
        cropped_path = crop_dir / f"{len(cache):05d}.png"
        center_crop_image(image_path, cropped_path, target_aspect)
        cache[cache_key] = cropped_path
    slide.shapes.add_picture(
        str(cropped_path),
        Inches(left),
        Inches(top),
        width=Inches(width),
        height=Inches(height),
    )


def add_image_contained(slide, image_path: Path, left: float, top: float, width: float, height: float) -> None:
    with Image.open(image_path) as image:
        image_width, image_height = image.size
    aspect = image_width / image_height
    cell_aspect = width / height
    if aspect >= cell_aspect:
        draw_width = width
        draw_height = width / aspect
    else:
        draw_height = height
        draw_width = height * aspect
    draw_left = left + (width - draw_width) / 2
    draw_top = top + (height - draw_height) / 2
    slide.shapes.add_picture(
        str(image_path),
        Inches(draw_left),
        Inches(draw_top),
        width=Inches(draw_width),
        height=Inches(draw_height),
    )


def add_missing_cell(slide, left: float, top: float, width: float, height: float, text_color: RGBColor) -> None:
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(left),
        Inches(top),
        Inches(width),
        Inches(height),
    )
    shape.fill.background()
    shape.line.color.rgb = RGBColor(190, 190, 190)
    add_textbox(slide, "missing", left, top + height / 2 - 0.12, width, 0.24, 9, text_color, align=PP_ALIGN.CENTER)


def build_manual_groups(manifest: dict[str, Any], group_count: int, images_per_group: int) -> tuple[list[str], list[dict[str, Any]]]:
    group_count = min(max(group_count, 1), 50)
    images_per_group = min(max(images_per_group, 1), 20)
    channel_order = [f"slot{index + 1:02d}" for index in range(images_per_group)]
    flat_images = manifest.get("images", [])
    groups: list[dict[str, Any]] = []

    for group_index in range(group_count):
        group_key = f"manual_group_{group_index + 1:02d}"
        group_images = []
        for image_index in range(images_per_group):
            flat_index = group_index * images_per_group + image_index
            if flat_index >= len(flat_images):
                continue
            image = dict(flat_images[flat_index])
            image["channel"] = channel_order[image_index]
            image["channel_label"] = channel_order[image_index]
            image["channel_order"] = image_index
            group_images.append(image)
        groups.append(
            {
                "key": group_key,
                "display": f"Group {group_index + 1}",
                "images": group_images,
            }
        )

    return channel_order, groups


def resolve_export_content(manifest: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    layout_mode = settings.get("layout_mode") or "auto"
    rows_per_slide = int(settings.get("rows_per_slide") or 3)
    rows_per_slide = min(max(rows_per_slide, 1), 6)

    if layout_mode == "manual":
        group_count = int(settings.get("group_count") or 1)
        images_per_group = int(settings.get("images_per_group") or 1)
        channel_order, groups = build_manual_groups(manifest, group_count, images_per_group)
        rows_per_slide = min(rows_per_slide, max(len(groups), 1))
    else:
        channel_order = settings.get("channel_order") or [channel["key"] for channel in manifest["channels"]]
        channel_order = [channel for channel in channel_order if channel]
        groups = manifest["groups"]

    if not channel_order:
        raise ValueError("No channels selected")

    return {
        "channel_order": channel_order,
        "groups": groups,
        "rows_per_slide": rows_per_slide,
        "labels": settings.get("labels") or {},
        "group_labels": settings.get("group_labels") or {},
        "background": settings.get("background") or "white",
        "title": (settings.get("title") or "").strip(),
        "panel_letter": (settings.get("panel_letter") or "").strip(),
        "show_group_labels": bool(settings.get("show_sample_name", True)),
        "group_label_side": settings.get("group_label_side") or "left",
        "fit_mode": settings.get("fit_mode") or "crop",
    }


def calculate_layout(channel_order: list[str], rows_per_slide: int, title: str, show_group_labels: bool, group_label_side: str) -> dict[str, float]:
    slide_width = 13.333
    slide_height = 7.5
    margin_left = 0.45
    margin_right = 0.4
    margin_bottom = 0.35
    top_margin = 0.22
    title_height = 0.34 if title else 0
    marker_height = 0.32
    side_label_width = 0.42 if show_group_labels else 0
    side_gap = 0.08 if show_group_labels else 0
    col_gap = 0.04
    row_gap = 0.08
    col_count = len(channel_order)

    if group_label_side == "right":
        grid_left = margin_left
        grid_right = slide_width - margin_right - side_label_width - side_gap
    else:
        grid_left = margin_left + side_label_width + side_gap
        grid_right = slide_width - margin_right

    grid_available_width = grid_right - grid_left
    grid_top = top_margin + title_height + marker_height
    grid_available_height = slide_height - grid_top - margin_bottom
    cell_by_width = (grid_available_width - col_gap * (col_count - 1)) / col_count
    cell_by_height = (grid_available_height - row_gap * (rows_per_slide - 1)) / rows_per_slide
    cell_size = max(0.55, min(cell_by_width, cell_by_height))
    actual_grid_width = cell_size * col_count + col_gap * (col_count - 1)
    actual_grid_left = grid_left + max(0, (grid_available_width - actual_grid_width) / 2)

    return {
        "slide_width": slide_width,
        "slide_height": slide_height,
        "margin_left": margin_left,
        "margin_right": margin_right,
        "top_margin": top_margin,
        "title_height": title_height,
        "marker_height": marker_height,
        "side_label_width": side_label_width,
        "side_gap": side_gap,
        "col_gap": col_gap,
        "row_gap": row_gap,
        "grid_top": grid_top,
        "cell_size": cell_size,
        "actual_grid_width": actual_grid_width,
        "actual_grid_left": actual_grid_left,
    }


def build_pptx(manifest: dict[str, Any], settings: dict[str, Any]) -> Path:
    content = resolve_export_content(manifest, settings)
    channel_order = content["channel_order"]
    groups = content["groups"]
    labels = content["labels"]
    group_labels = content["group_labels"]
    rows_per_slide = content["rows_per_slide"]
    background = content["background"]
    title = content["title"]
    panel_letter = content["panel_letter"]
    show_group_labels = content["show_group_labels"]
    group_label_side = content["group_label_side"]
    fit_mode = content["fit_mode"]

    dark = background == "black"
    bg_color = RGBColor(0, 0, 0) if dark else RGBColor(255, 255, 255)
    text_color = RGBColor(245, 245, 245) if dark else RGBColor(15, 15, 15)
    secondary_color = RGBColor(210, 210, 210) if dark else RGBColor(45, 45, 45)

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    layout = calculate_layout(channel_order, rows_per_slide, title, show_group_labels, group_label_side)
    slide_width = layout["slide_width"]
    margin_left = layout["margin_left"]
    margin_right = layout["margin_right"]
    top_margin = layout["top_margin"]
    title_height = layout["title_height"]
    side_label_width = layout["side_label_width"]
    side_gap = layout["side_gap"]
    col_gap = layout["col_gap"]
    row_gap = layout["row_gap"]
    grid_top = layout["grid_top"]
    cell_size = layout["cell_size"]
    actual_grid_width = layout["actual_grid_width"]
    actual_grid_left = layout["actual_grid_left"]

    output_name = f"fluorescence_batch_{now_stamp()}.pptx"
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = EXPORT_DIR / output_name
    crop_dir = JOBS_DIR / manifest["job_id"] / "export_crops" / uuid.uuid4().hex[:8]
    crop_cache: dict[str, Path] = {}

    for page_start in range(0, len(groups), rows_per_slide):
        slide = prs.slides.add_slide(blank_layout)
        bg = slide.background
        fill = bg.fill
        fill.solid()
        fill.fore_color.rgb = bg_color

        title_left = margin_left + (0.36 if panel_letter else 0)
        if panel_letter:
            add_textbox(slide, panel_letter, margin_left, top_margin, 0.28, 0.28, 16, text_color, bold=True)
        if title:
            add_textbox(slide, title, title_left, top_margin, slide_width - title_left - margin_right, 0.28, 14, text_color, bold=True)

        marker_top = top_margin + title_height
        for column_index, channel in enumerate(channel_order):
            col_left = actual_grid_left + column_index * (cell_size + col_gap)
            label = labels.get(channel) or channel
            add_textbox(
                slide,
                label,
                col_left,
                marker_top,
                cell_size,
                0.24,
                12,
                text_color,
                bold=True,
                align=PP_ALIGN.CENTER,
            )

        page_groups = groups[page_start : page_start + rows_per_slide]
        for row_index, group in enumerate(page_groups):
            row_top = grid_top + row_index * (cell_size + row_gap)
            if show_group_labels:
                group_label = group_labels.get(group["key"]) or group["display"]
                if group_label_side == "right":
                    label_left = actual_grid_left + actual_grid_width + side_gap
                    rotation = 90
                else:
                    label_left = margin_left
                    rotation = 270
                add_textbox(
                    slide,
                    group_label,
                    label_left,
                    row_top,
                    side_label_width,
                    cell_size,
                    12,
                    secondary_color,
                    bold=True,
                    align=PP_ALIGN.CENTER,
                    rotation=rotation,
                )

            images_by_channel = {image["channel"]: image for image in group["images"]}
            for column_index, channel in enumerate(channel_order):
                col_left = actual_grid_left + column_index * (cell_size + col_gap)
                image = images_by_channel.get(channel)
                if image:
                    source_path = image_source_path(image)
                    if fit_mode == "contain":
                        add_image_contained(slide, source_path, col_left, row_top, cell_size, cell_size)
                    else:
                        add_image_cover(
                            slide,
                            source_path,
                            col_left,
                            row_top,
                            cell_size,
                            cell_size,
                            crop_dir,
                            crop_cache,
                        )
                else:
                    add_missing_cell(slide, col_left, row_top, cell_size, cell_size, secondary_color)

    prs.save(output_path)
    return output_path


def add_ppt_picture_cover(slide, image_path: Path, left: float, top: float, width: float, height: float, crop_dir: Path, cache: dict[str, Path]) -> None:
    add_image_cover(slide, image_path, left, top, width, height, crop_dir, cache)


def add_ppt_line(slide, start: tuple[float, float], end: tuple[float, float], color: RGBColor = RGBColor(60, 60, 60)) -> None:
    connector = slide.shapes.add_connector(
        MSO_CONNECTOR.STRAIGHT,
        Inches(start[0]),
        Inches(start[1]),
        Inches(end[0]),
        Inches(end[1]),
    )
    connector.line.color.rgb = color
    connector.line.width = Pt(1)


def add_ppt_roi(slide, left: float, top: float, width: float, height: float, color: RGBColor = RGBColor(45, 45, 45)) -> None:
    roi = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
    roi.fill.background()
    roi.line.color.rgb = color
    roi.line.width = Pt(1.2)


def build_ihc_groups(manifest: dict[str, Any], group_count: int) -> list[dict[str, Any]]:
    group_count = min(max(group_count, 1), 50)
    flat_images = manifest.get("images", [])
    groups: list[dict[str, Any]] = []
    for group_index in range(group_count):
        group_images = []
        for image_index, channel in enumerate(["low", "high"]):
            flat_index = group_index * 2 + image_index
            if flat_index >= len(flat_images):
                continue
            image = dict(flat_images[flat_index])
            image["channel"] = channel
            image["channel_label"] = channel
            image["channel_order"] = image_index
            group_images.append(image)
        groups.append(
            {
                "key": f"ihc_group_{group_index + 1:02d}",
                "display": f"Group {group_index + 1}",
                "images": group_images,
            }
        )
    return groups


def build_ihc_pptx(manifest: dict[str, Any], settings: dict[str, Any]) -> Path:
    group_count = int(settings.get("group_count") or 1)
    groups = build_ihc_groups(manifest, group_count)
    group_labels = settings.get("group_labels") or {}
    low_label = (settings.get("ihc_low_label") or "4X").strip()
    high_label = (settings.get("ihc_high_label") or "20X").strip()
    title = (settings.get("title") or "").strip()
    panel_letter = (settings.get("panel_letter") or "").strip()
    draw_connectors = bool(settings.get("ihc_draw_connectors", True))
    roi_x = float(settings.get("ihc_roi_x") or 0.32)
    roi_y = float(settings.get("ihc_roi_y") or 0.36)
    roi_w = float(settings.get("ihc_roi_w") or 0.30)
    roi_h = float(settings.get("ihc_roi_h") or 0.28)
    rows_per_slide = min(max(int(settings.get("rows_per_slide") or len(groups) or 1), 1), 4)

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    slide_width = 13.333
    slide_height = 7.5
    margin_left = 0.45
    margin_right = 0.45
    top_margin = 0.24
    title_height = 0.36 if title else 0
    header_height = 0.36
    bottom_margin = 0.35
    row_gap = 0.34
    side_label_width = 0.55
    between_cols = 0.85
    content_top = top_margin + title_height + header_height
    row_height = (slide_height - content_top - bottom_margin - row_gap * (rows_per_slide - 1)) / rows_per_slide
    image_height = max(0.72, row_height)
    image_width = image_height * 1.72
    low_left = margin_left + side_label_width + 0.18
    high_left = low_left + image_width + between_cols
    if high_left + image_width > slide_width - margin_right:
        available = slide_width - margin_right - low_left - between_cols
        image_width = available / 2
        image_height = min(image_height, image_width / 1.72)
        high_left = low_left + image_width + between_cols

    output_name = f"ihc_batch_{now_stamp()}.pptx"
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = EXPORT_DIR / output_name
    crop_dir = JOBS_DIR / manifest["job_id"] / "ihc_export_crops" / uuid.uuid4().hex[:8]
    crop_cache: dict[str, Path] = {}

    for page_start in range(0, len(groups), rows_per_slide):
        slide = prs.slides.add_slide(blank_layout)
        fill = slide.background.fill
        fill.solid()
        fill.fore_color.rgb = RGBColor(255, 255, 255)

        title_left = margin_left + (0.34 if panel_letter else 0)
        if panel_letter:
            add_textbox(slide, panel_letter, margin_left, top_margin, 0.28, 0.28, 16, RGBColor(0, 0, 0), bold=True)
        if title:
            add_textbox(slide, title, title_left, top_margin, slide_width - title_left - margin_right, 0.28, 14, RGBColor(0, 0, 0), bold=True)

        header_top = top_margin + title_height
        add_textbox(slide, low_label, low_left, header_top, image_width, 0.28, 14, RGBColor(0, 0, 0), bold=True, align=PP_ALIGN.CENTER)
        add_textbox(slide, high_label, high_left, header_top, image_width, 0.28, 14, RGBColor(0, 0, 0), bold=True, align=PP_ALIGN.CENTER)

        page_groups = groups[page_start : page_start + rows_per_slide]
        for row_index, group in enumerate(page_groups):
            row_top = content_top + row_index * (row_height + row_gap)
            row_top += max(0, (row_height - image_height) / 2)
            label = group_labels.get(group["key"]) or group["display"]
            add_textbox(slide, label, margin_left, row_top, side_label_width, image_height, 13, RGBColor(0, 0, 0), bold=True, align=PP_ALIGN.CENTER, rotation=270)
            images_by_channel = {image["channel"]: image for image in group["images"]}
            low_image = images_by_channel.get("low")
            high_image = images_by_channel.get("high")
            if low_image:
                add_ppt_picture_cover(slide, image_source_path(low_image), low_left, row_top, image_width, image_height, crop_dir, crop_cache)
            else:
                add_missing_cell(slide, low_left, row_top, image_width, image_height, RGBColor(80, 80, 80))
            if high_image:
                add_ppt_picture_cover(slide, image_source_path(high_image), high_left, row_top, image_width, image_height, crop_dir, crop_cache)
            else:
                add_missing_cell(slide, high_left, row_top, image_width, image_height, RGBColor(80, 80, 80))

            roi_left = low_left + roi_x * image_width
            roi_top = row_top + roi_y * image_height
            roi_width = roi_w * image_width
            roi_height = roi_h * image_height
            add_ppt_roi(slide, roi_left, roi_top, roi_width, roi_height)
            if draw_connectors:
                add_ppt_line(slide, (roi_left + roi_width, roi_top), (high_left, row_top))
                add_ppt_line(slide, (roi_left + roi_width, roi_top + roi_height), (high_left, row_top + image_height))

    prs.save(output_path)
    return output_path


def font(size_px: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size_px)
    return ImageFont.load_default()


def inch(value: float) -> int:
    return int(round(value * RASTER_DPI))


def rgb_tuple(color: RGBColor) -> tuple[int, int, int]:
    return (color[0], color[1], color[2])


def draw_centered_text(
    canvas: Image.Image,
    text: str,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    size_px: int,
    bold: bool = False,
    rotation: int | None = None,
) -> None:
    if not text:
        return
    draw = ImageDraw.Draw(canvas)
    typeface = font(size_px, bold=bold)

    if rotation is None:
        bbox = draw.textbbox((0, 0), text, font=typeface)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = box[0] + (box[2] - box[0] - text_width) / 2
        y = box[1] + (box[3] - box[1] - text_height) / 2 - bbox[1]
        draw.text((x, y), text, fill=fill, font=typeface)
        return

    width = max(1, box[2] - box[0])
    height = max(1, box[3] - box[1])
    layer = Image.new("RGBA", (height, width), (255, 255, 255, 0))
    layer_draw = ImageDraw.Draw(layer)
    bbox = layer_draw.textbbox((0, 0), text, font=typeface)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (height - text_width) / 2
    y = (width - text_height) / 2 - bbox[1]
    layer_draw.text((x, y), text, fill=(*fill, 255), font=typeface)
    rotated = layer.rotate(rotation, expand=True)
    canvas.paste(rotated, (box[0], box[1]), rotated)


def draw_left_text(
    canvas: Image.Image,
    text: str,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    size_px: int,
    bold: bool = False,
) -> None:
    if not text:
        return
    draw = ImageDraw.Draw(canvas)
    typeface = font(size_px, bold=bold)
    bbox = draw.textbbox((0, 0), text, font=typeface)
    y = box[1] + (box[3] - box[1] - (bbox[3] - bbox[1])) / 2 - bbox[1]
    draw.text((box[0], y), text, fill=fill, font=typeface)


def resize_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    width, height = image.size
    target_width, target_height = size
    target_aspect = target_width / target_height
    source_aspect = width / height
    if source_aspect > target_aspect:
        new_width = int(height * target_aspect)
        left = max(0, (width - new_width) // 2)
        image = image.crop((left, 0, left + new_width, height))
    else:
        new_height = int(width / target_aspect)
        top = max(0, (height - new_height) // 2)
        image = image.crop((0, top, width, top + new_height))
    return image.resize(size, Image.Resampling.LANCZOS)


def resize_contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target = Image.new("RGB", size, (0, 0, 0))
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    left = (size[0] - copy.size[0]) // 2
    top = (size[1] - copy.size[1]) // 2
    target.paste(copy, (left, top))
    return target


def build_raster_pages(manifest: dict[str, Any], settings: dict[str, Any]) -> list[Image.Image]:
    content = resolve_export_content(manifest, settings)
    channel_order = content["channel_order"]
    groups = content["groups"]
    labels = content["labels"]
    group_labels = content["group_labels"]
    rows_per_slide = content["rows_per_slide"]
    title = content["title"]
    panel_letter = content["panel_letter"]
    show_group_labels = content["show_group_labels"]
    group_label_side = content["group_label_side"]
    fit_mode = content["fit_mode"]

    dark = content["background"] == "black"
    bg_color = (0, 0, 0) if dark else (255, 255, 255)
    text_color = (245, 245, 245) if dark else (15, 15, 15)
    secondary_color = (210, 210, 210) if dark else (45, 45, 45)

    layout = calculate_layout(channel_order, rows_per_slide, title, show_group_labels, group_label_side)
    canvas_size = (inch(layout["slide_width"]), inch(layout["slide_height"]))
    pages: list[Image.Image] = []

    for page_start in range(0, len(groups), rows_per_slide):
        canvas = Image.new("RGB", canvas_size, bg_color)

        title_left = layout["margin_left"] + (0.36 if panel_letter else 0)
        if panel_letter:
            draw_left_text(
                canvas,
                panel_letter,
                (inch(layout["margin_left"]), inch(layout["top_margin"]), inch(layout["margin_left"] + 0.28), inch(layout["top_margin"] + 0.28)),
                text_color,
                52,
                bold=True,
            )
        if title:
            draw_left_text(
                canvas,
                title,
                (inch(title_left), inch(layout["top_margin"]), inch(layout["slide_width"] - layout["margin_right"]), inch(layout["top_margin"] + 0.28)),
                text_color,
                46,
                bold=True,
            )

        marker_top = layout["top_margin"] + layout["title_height"]
        for column_index, channel in enumerate(channel_order):
            col_left = layout["actual_grid_left"] + column_index * (layout["cell_size"] + layout["col_gap"])
            label = labels.get(channel) or channel
            draw_centered_text(
                canvas,
                label,
                (inch(col_left), inch(marker_top), inch(col_left + layout["cell_size"]), inch(marker_top + 0.24)),
                text_color,
                40,
                bold=True,
            )

        page_groups = groups[page_start : page_start + rows_per_slide]
        for row_index, group in enumerate(page_groups):
            row_top = layout["grid_top"] + row_index * (layout["cell_size"] + layout["row_gap"])
            if show_group_labels:
                group_label = group_labels.get(group["key"]) or group["display"]
                if group_label_side == "right":
                    label_left = layout["actual_grid_left"] + layout["actual_grid_width"] + layout["side_gap"]
                    rotation = 270
                else:
                    label_left = layout["margin_left"]
                    rotation = 90
                draw_centered_text(
                    canvas,
                    group_label,
                    (inch(label_left), inch(row_top), inch(label_left + layout["side_label_width"]), inch(row_top + layout["cell_size"])),
                    secondary_color,
                    40,
                    bold=True,
                    rotation=rotation,
                )

            images_by_channel = {image["channel"]: image for image in group["images"]}
            for column_index, channel in enumerate(channel_order):
                col_left = layout["actual_grid_left"] + column_index * (layout["cell_size"] + layout["col_gap"])
                box = (
                    inch(col_left),
                    inch(row_top),
                    inch(col_left + layout["cell_size"]),
                    inch(row_top + layout["cell_size"]),
                )
                image = images_by_channel.get(channel)
                if image:
                    with Image.open(image_source_path(image)) as source:
                        rgb = image_to_rgb(source)
                        if fit_mode == "contain":
                            rendered = resize_contain(rgb, (box[2] - box[0], box[3] - box[1]))
                        else:
                            rendered = resize_cover(rgb, (box[2] - box[0], box[3] - box[1]))
                    canvas.paste(rendered, (box[0], box[1]))
                else:
                    draw = ImageDraw.Draw(canvas)
                    draw.rectangle(box, outline=(190, 190, 190), width=2)
                    draw_centered_text(canvas, "missing", box, secondary_color, 26)

        pages.append(canvas)

    return pages


def draw_rotated_label(canvas: Image.Image, text: str, box: tuple[int, int, int, int], rotation: int = 90) -> None:
    draw_centered_text(canvas, text, box, (0, 0, 0), 42, bold=True, rotation=rotation)


def build_ihc_raster_pages(manifest: dict[str, Any], settings: dict[str, Any]) -> list[Image.Image]:
    group_count = int(settings.get("group_count") or 1)
    groups = build_ihc_groups(manifest, group_count)
    group_labels = settings.get("group_labels") or {}
    low_label = (settings.get("ihc_low_label") or "4X").strip()
    high_label = (settings.get("ihc_high_label") or "20X").strip()
    title = (settings.get("title") or "").strip()
    panel_letter = (settings.get("panel_letter") or "").strip()
    draw_connectors = bool(settings.get("ihc_draw_connectors", True))
    roi_x = float(settings.get("ihc_roi_x") or 0.32)
    roi_y = float(settings.get("ihc_roi_y") or 0.36)
    roi_w = float(settings.get("ihc_roi_w") or 0.30)
    roi_h = float(settings.get("ihc_roi_h") or 0.28)
    rows_per_slide = min(max(int(settings.get("rows_per_slide") or len(groups) or 1), 1), 4)

    slide_width = 13.333
    slide_height = 7.5
    margin_left = 0.45
    margin_right = 0.45
    top_margin = 0.24
    title_height = 0.36 if title else 0
    header_height = 0.36
    bottom_margin = 0.35
    row_gap = 0.34
    side_label_width = 0.55
    between_cols = 0.85
    content_top = top_margin + title_height + header_height
    row_height = (slide_height - content_top - bottom_margin - row_gap * (rows_per_slide - 1)) / rows_per_slide
    image_height = max(0.72, row_height)
    image_width = image_height * 1.72
    low_left = margin_left + side_label_width + 0.18
    high_left = low_left + image_width + between_cols
    if high_left + image_width > slide_width - margin_right:
        available = slide_width - margin_right - low_left - between_cols
        image_width = available / 2
        image_height = min(image_height, image_width / 1.72)
        high_left = low_left + image_width + between_cols

    canvas_size = (inch(slide_width), inch(slide_height))
    pages: list[Image.Image] = []

    for page_start in range(0, len(groups), rows_per_slide):
        canvas = Image.new("RGB", canvas_size, (255, 255, 255))
        draw = ImageDraw.Draw(canvas)

        title_left = margin_left + (0.34 if panel_letter else 0)
        if panel_letter:
            draw_left_text(canvas, panel_letter, (inch(margin_left), inch(top_margin), inch(margin_left + 0.28), inch(top_margin + 0.28)), (0, 0, 0), 52, bold=True)
        if title:
            draw_left_text(canvas, title, (inch(title_left), inch(top_margin), inch(slide_width - margin_right), inch(top_margin + 0.28)), (0, 0, 0), 46, bold=True)

        header_top = top_margin + title_height
        draw_centered_text(canvas, low_label, (inch(low_left), inch(header_top), inch(low_left + image_width), inch(header_top + 0.28)), (0, 0, 0), 44, bold=True)
        draw_centered_text(canvas, high_label, (inch(high_left), inch(header_top), inch(high_left + image_width), inch(header_top + 0.28)), (0, 0, 0), 44, bold=True)

        page_groups = groups[page_start : page_start + rows_per_slide]
        for row_index, group in enumerate(page_groups):
            row_top = content_top + row_index * (row_height + row_gap)
            row_top += max(0, (row_height - image_height) / 2)
            label = group_labels.get(group["key"]) or group["display"]
            draw_rotated_label(canvas, label, (inch(margin_left), inch(row_top), inch(margin_left + side_label_width), inch(row_top + image_height)))
            images_by_channel = {image["channel"]: image for image in group["images"]}
            boxes = {
                "low": (inch(low_left), inch(row_top), inch(low_left + image_width), inch(row_top + image_height)),
                "high": (inch(high_left), inch(row_top), inch(high_left + image_width), inch(row_top + image_height)),
            }
            for channel in ["low", "high"]:
                image = images_by_channel.get(channel)
                box = boxes[channel]
                if image:
                    with Image.open(image_source_path(image)) as source:
                        rendered = resize_cover(image_to_rgb(source), (box[2] - box[0], box[3] - box[1]))
                    canvas.paste(rendered, (box[0], box[1]))
                else:
                    draw.rectangle(box, outline=(160, 160, 160), width=2)
                    draw_centered_text(canvas, "missing", box, (80, 80, 80), 26)

            low_box = boxes["low"]
            high_box = boxes["high"]
            roi_box = (
                int(low_box[0] + roi_x * (low_box[2] - low_box[0])),
                int(low_box[1] + roi_y * (low_box[3] - low_box[1])),
                int(low_box[0] + (roi_x + roi_w) * (low_box[2] - low_box[0])),
                int(low_box[1] + (roi_y + roi_h) * (low_box[3] - low_box[1])),
            )
            draw.rectangle(roi_box, outline=(45, 45, 45), width=3)
            if draw_connectors:
                draw.line((roi_box[2], roi_box[1], high_box[0], high_box[1]), fill=(70, 70, 70), width=3)
                draw.line((roi_box[2], roi_box[3], high_box[0], high_box[3]), fill=(70, 70, 70), width=3)

        pages.append(canvas)

    return pages


def build_raster_export(manifest: dict[str, Any], settings: dict[str, Any], export_format: str) -> Path:
    figure_type = (settings.get("figure_type") or "if").lower()
    pages = build_ihc_raster_pages(manifest, settings) if figure_type == "ihc" else build_raster_pages(manifest, settings)
    if not pages:
        raise ValueError("No pages to export")

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = now_stamp()
    prefix = "ihc_batch" if figure_type == "ihc" else "fluorescence_batch"

    if export_format == "pdf":
        output_path = EXPORT_DIR / f"{prefix}_{timestamp}.pdf"
        pages[0].save(output_path, "PDF", save_all=True, append_images=pages[1:], resolution=300)
        return output_path

    if export_format not in {"png", "jpg"}:
        raise ValueError(f"Unsupported export format: {export_format}")

    extension = "jpg" if export_format == "jpg" else "png"
    image_format = "JPEG" if export_format == "jpg" else "PNG"

    if len(pages) == 1:
        output_path = EXPORT_DIR / f"{prefix}_{timestamp}.{extension}"
        save_kwargs = {"quality": 95} if image_format == "JPEG" else {}
        pages[0].save(output_path, image_format, **save_kwargs)
        return output_path

    zip_path = EXPORT_DIR / f"{prefix}_{timestamp}_{extension}.zip"
    page_dir = EXPORT_DIR / f"{prefix}_{timestamp}_{extension}_pages"
    page_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for index, page in enumerate(pages, start=1):
            page_path = page_dir / f"page_{index:02d}.{extension}"
            save_kwargs = {"quality": 95} if image_format == "JPEG" else {}
            page.save(page_path, image_format, **save_kwargs)
            archive.write(page_path, page_path.name)
    return zip_path


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/wb")
@app.route("/wb/")
def wb():
    return render_template("wb.html")


@app.route("/api/upload", methods=["POST"])
def upload_folder():
    started_at = perf_counter()
    files = request.files.getlist("files")
    supported_files = [file for file in files if file.filename and is_supported_image(file.filename)]
    if not supported_files:
        return jsonify({"error": "No supported image files found"}), 400

    job_id = uuid.uuid4().hex
    job_dir = JOBS_DIR / job_id
    upload_dir = job_dir / "uploads"
    preview_dir = job_dir / "preview"
    upload_dir.mkdir(parents=True, exist_ok=True)

    items: list[dict[str, Any]] = []
    for index, storage in enumerate(supported_files):
        relative_path = safe_path(storage.filename)
        destination = upload_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            destination = destination.with_name(f"{destination.stem}_{uuid.uuid4().hex[:6]}{destination.suffix}")
        storage.save(destination)

        preview_name = f"{index:05d}_{uuid.uuid4().hex[:8]}.png"
        preview_path = preview_dir / preview_name
        try:
            image_info = prepare_image(destination, preview_path)
        except Exception as exc:
            return jsonify({"error": f"Failed to read image {storage.filename}: {exc}"}), 400

        items.append(
            {
                "relative_path": str(relative_path).replace("\\", "/"),
                "filename": Path(storage.filename).name,
                "source_path": str(destination),
                "preview_name": preview_name,
                "width": image_info["width"],
                "height": image_info["height"],
            }
        )

    manifest = make_job_manifest(job_id, items)
    manifest_path(job_id).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    response = public_manifest(manifest)
    response["server_processing_seconds"] = round(perf_counter() - started_at, 2)
    return jsonify(response)


@app.route("/api/jobs/<job_id>/preview/<preview_name>")
def preview(job_id: str, preview_name: str):
    preview_path = JOBS_DIR / job_id / "preview" / preview_name
    if not preview_path.exists():
        return jsonify({"error": "Preview not found"}), 404
    return send_file(preview_path)


@app.route("/api/export", methods=["POST"])
def export_pptx():
    payload = request.get_json(force=True)
    job_id = payload.get("job_id")
    if not job_id:
        return jsonify({"error": "Missing job_id"}), 400
    try:
        manifest = load_manifest(job_id)
        export_format = (payload.get("export_format") or "pptx").lower()
        figure_type = (payload.get("figure_type") or "if").lower()
        if export_format == "pptx":
            output_path = build_ihc_pptx(manifest, payload) if figure_type == "ihc" else build_pptx(manifest, payload)
        elif export_format in {"png", "jpg", "pdf"}:
            output_path = build_raster_export(manifest, payload, export_format)
        else:
            raise ValueError(f"Unsupported export format: {export_format}")
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"download_url": f"/api/download/{output_path.name}", "filename": output_path.name})


@app.route("/api/download/<filename>")
def download(filename: str):
    safe_name = Path(filename).name
    output_path = EXPORT_DIR / safe_name
    if not output_path.exists():
        return jsonify({"error": "Export not found"}), 404
    return send_file(output_path, as_attachment=True, download_name=safe_name)


if __name__ == "__main__":
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    port = int(os.environ.get("PORT", "5055"))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    app.run(host=host, port=port, debug=False)
