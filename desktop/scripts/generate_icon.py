#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image, ImageDraw, ImageFilter

Point = Tuple[float, float]
Color = Tuple[int, int, int, int]

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src-tauri" / "icons" / "app-icon.png"

CANVAS = 1024
SCALE = 4
SIZE = CANVAS * SCALE


def s(value: float) -> int:
    return round(value * SCALE)


def scale_point(point: Point) -> Point:
    return (point[0] * SCALE, point[1] * SCALE)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix(start: Color, end: Color, t: float) -> Color:
    return tuple(round(lerp(start[i], end[i], t)) for i in range(4))  # type: ignore[return-value]


def cubic(p0: Point, p1: Point, p2: Point, p3: Point, steps: int = 36) -> list[Point]:
    points: list[Point] = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        points.append((x, y))
    return points


def path_from_cubics(start: Point, segments: Iterable[Tuple[Point, Point, Point]]) -> list[Point]:
    points = [start]
    cursor = start
    for c1, c2, end in segments:
        curve = cubic(cursor, c1, c2, end)
        points.extend(curve[1:])
        cursor = end
    return points


def draw_round_polyline(draw: ImageDraw.ImageDraw, points: list[Point], width: int, fill: Color) -> None:
    scaled = [scale_point(point) for point in points]
    radius = width // 2
    for a, b in zip(scaled, scaled[1:]):
        draw.line([a, b], fill=fill, width=width)
    for x, y in scaled:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw_gradient_line(draw: ImageDraw.ImageDraw, points: list[Point], width: int, start: Color, end: Color) -> None:
    scaled = [scale_point(point) for point in points]
    radius = width // 2
    last_index = len(scaled) - 2
    for index, (a, b) in enumerate(zip(scaled, scaled[1:])):
        color = mix(start, end, index / max(1, last_index))
        draw.line([a, b], fill=color, width=width)
        draw.ellipse((b[0] - radius, b[1] - radius, b[0] + radius, b[1] + radius), fill=color)
    draw.ellipse(
        (scaled[0][0] - radius, scaled[0][1] - radius, scaled[0][0] + radius, scaled[0][1] + radius),
        fill=start,
    )


def rounded_mask(box: tuple[int, int, int, int], radius: int) -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    return mask


def vertical_gradient(top: Color, bottom: Color) -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pixels = image.load()
    for y in range(SIZE):
        color = mix(top, bottom, y / (SIZE - 1))
        for x in range(SIZE):
            pixels[x, y] = color
    return image


def main() -> None:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tile_box = (s(96), s(96), s(928), s(928))
    tile_radius = s(188)
    tile_mask = rounded_mask(tile_box, tile_radius)

    shadow_mask = Image.new("L", (SIZE, SIZE), 0)
    shadow_draw = ImageDraw.Draw(shadow_mask)
    shadow_draw.rounded_rectangle(
        (tile_box[0], tile_box[1] + s(12), tile_box[2], tile_box[3] + s(12)),
        radius=tile_radius,
        fill=132,
    )
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(s(12)))
    shadow = Image.new("RGBA", (SIZE, SIZE), (12, 21, 34, 34))
    image.alpha_composite(Image.composite(shadow, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), shadow_mask))

    tile = vertical_gradient((255, 255, 255, 255), (246, 248, 251, 255))
    image.alpha_composite(Image.composite(tile, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), tile_mask))

    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border)
    border_draw.rounded_rectangle(tile_box, radius=tile_radius, outline=(224, 231, 240, 170), width=s(2))
    image.alpha_composite(border)

    mark = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mark_draw = ImageDraw.Draw(mark)
    stroke_width = s(60)
    ink = (18, 26, 39, 255)

    c_path = path_from_cubics(
        (474, 522),
        [
            ((425, 458), (320, 448), (248, 506)),
            ((164, 574), (160, 700), (232, 776)),
            ((306, 854), (439, 852), (516, 778)),
            ((536, 758), (552, 730), (560, 704)),
        ],
    )
    s_path = path_from_cubics(
        (810, 526),
        [
            ((752, 474), (655, 478), (609, 541)),
            ((558, 610), (604, 655), (698, 674)),
            ((795, 694), (836, 747), (798, 806)),
            ((754, 873), (636, 874), (579, 817)),
        ],
    )
    draw_round_polyline(mark_draw, c_path, stroke_width, ink)
    draw_round_polyline(mark_draw, s_path, stroke_width, ink)

    caret_points = [(414, 382), (512, 246), (610, 382)]
    draw_gradient_line(mark_draw, caret_points, s(54), (24, 181, 238, 255), (17, 62, 232, 255))

    lift_alpha = mark.getchannel("A").filter(ImageFilter.GaussianBlur(s(5)))
    lift = Image.new("RGBA", (SIZE, SIZE), (12, 21, 34, 28))
    lifted = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    lifted.alpha_composite(Image.composite(lift, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), lift_alpha), (0, s(7)))
    image.alpha_composite(lifted)
    image.alpha_composite(mark)

    image = image.resize((CANVAS, CANVAS), Image.Resampling.LANCZOS)
    image.save(OUTPUT)


if __name__ == "__main__":
    main()
