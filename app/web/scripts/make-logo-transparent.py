"""Rende trasparente lo sfondo fuori dal cerchio del logo P.O.Z.Z.I."""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image

WEB_ROOT = Path(__file__).resolve().parents[1]  # app/web
APP_ROOT = WEB_ROOT.parent  # app


def find_source() -> Path:
    candidates = [
        APP_ROOT / "logo.png",
        WEB_ROOT / "public" / "logo.png",
        Path(
            r"C:\Users\apale\.cursor\projects\c-App-mie-ECMO\assets"
            r"\c__Users_apale_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
            r"_logo-e3039304-e7fd-4e81-bf69-1db8bee0e178.png"
        ),
    ]
    for p in candidates:
        if p.is_file():
            return p
    raise FileNotFoundError("logo.png non trovato")


def apply_circular_mask(im: Image.Image, feather: float = 2.5) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    cx, cy = w / 2, h / 2
    radius = min(w, h) * 0.498
    px = im.load()

    for y in range(h):
        for x in range(w):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            r, g, b, a = px[x, y]
            if d > radius + feather:
                px[x, y] = (r, g, b, 0)
            elif d > radius:
                t = (d - radius) / feather
                px[x, y] = (r, g, b, int(a * (1 - t)))
            elif a < 255 and (r > 250 and g > 250 and b > 250):
                # Bordi interni molto chiari: mantieni opaco se dentro il cerchio
                px[x, y] = (r, g, b, 255)

    return im


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else find_source()
    im = Image.open(src)
    out = apply_circular_mask(im)

    public = WEB_ROOT / "public" / "logo.png"
    app_logo = APP_ROOT / "logo.png"
    public.parent.mkdir(parents=True, exist_ok=True)
    out.save(public, "PNG")
    out.save(app_logo, "PNG")
    print(f"Salvato: {public}")
    print(f"Salvato: {app_logo}")


if __name__ == "__main__":
    main()
