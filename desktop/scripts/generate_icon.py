#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src-tauri" / "icons" / "source" / "software-update-logo.png"
OUTPUT = ROOT / "src-tauri" / "icons" / "app-icon.png"
CANVAS = 1024


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"missing icon source: {SOURCE}")

    image = Image.open(SOURCE).convert("RGBA")
    if image.size != (CANVAS, CANVAS):
        image = image.resize((CANVAS, CANVAS), Image.Resampling.LANCZOS)

    image.save(OUTPUT)


if __name__ == "__main__":
    main()
